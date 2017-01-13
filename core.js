'use strict'
// inspired by Jimp, imagejs

const fs = require('fs')
const pify = require('pify')
const readChunk = require('read-chunk')
const fileType = require('file-type')
const stackBlur = require('./lib/stack-blur')
const blend = require('./lib/blend')
const INTERPOLATION = require('./lib/resize')
const MIME = require('./mime-types.json')

INTERPOLATION.nearest = require('./lib/nearest-neighbor')

const readFile = pify(fs.readFile)
const writeFile = pify(fs.writeFile)

// from PNGJS
function bitblt (srcData, srcWidth, dstData, dstWidth, srcX, srcY, width, height, deltaX, deltaY) {
  for (let y = 0; y < height; y++) {
    srcData.copy(dstData,
      ((deltaY + y) * dstWidth + deltaX) * 4,
      ((srcY + y) * srcWidth + srcX) * 4,
      ((srcY + y) * srcWidth + srcX + width) * 4
    )
  }
}

const AUTO = {}
const ALLOC_UNSAFE = {}

class PixMap {

  constructor (width, height, fill) {
    this.width = width | 0
    this.height = height | 0

    if (this.width > 0 && this.height > 0) {
      if (fill === ALLOC_UNSAFE) {
        this.data = Buffer.allocUnsafe(4 * this.width * this.height)
      } else {
        this.data = Buffer.alloc(4 * this.width * this.height, fill)
      }
    }
  }

  * [Symbol.iterator] () {
    const w = this.width
    const h = this.height
    const data = this.data

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let idx = (w * y + x) * 4
        yield { x, y, color: data.slice(idx, idx + 4) }
      }
    }
  }

  * rect (sx = 0, sy = 0, width = this.width, height = this.height) {
    // todo: CLAMP
    const w = this.width
    const ex = sx + width
    const ey = sy + height
    const data = this.data

    for (let y = sy; y < ey; y++) {
      for (let x = sx; x < ex; x++) {
        let idx = (w * y + x) * 4
        yield { x, y, color: data.slice(idx, idx + 4) }
      }
    }
  }

  crop (sx, sy, width, height) {
    // todo: CLAMP
    const pix = new PixMap(width, height, ALLOC_UNSAFE)
    bitblt(this.data, this.width, pix.data, pix.width, sx, sy, width, height, 0, 0)
    return pix
  }

  mask (src, dx, dy) {
    // dx |= 0
    // dy |= 0

    // for (let { x, y, color } of src.rect(0, 0, this.width - dx, this.height - dy)) {
    //   let avg = (color[0] + color[1] + color[2]) / 3
    //   let f = avg / 255
    //   let dest = this.getPixel(dx + x, dy + y)
    //   dest[3] *= f
    // }
    // return this
  }

  getPixelIndex (x, y) {
    x = Math.round(x)
    y = Math.round(y)

    if (x < 0 || x >= this.width || y < 0 || y >= this.height) return null

    return (this.width * y + x) * 4
  }

  getPixel (x, y) {
    let idx = this.getPixelIndex(x, y)
    if (idx == null) return null
    return this.data.slice(idx, idx + 4)
  }

  getLine (y) {
    y = Math.round(y)
    if (y < 0 || y >= this.height) return null

    let idx = (this.width * y) * 4
    return this.data.slice(idx, idx + (this.width * 4))
  }

  clone () {
    const pix = new PixMap(this.width, this.height, ALLOC_UNSAFE)
    this.data.copy(pix.data)
    return pix
  }

  compose (pix, dx, dy, blendMode, amount) {
    // todo: CLAMP
    dx = Math.round(dx)
    dy = Math.round(dy)

    if (!blendMode) blendMode = blend.MODES.normal

    // todo: CLAMP
    const w = pix.width
    const h = pix.height

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let delta1 = pix.getPixelIndex(x, y)
        let delta2 = this.getPixelIndex(dx + x, dy + y)
        blend(pix.data, this.data, blendMode, amount, delta1, delta2)
      }
    }

    return this
  }

  blur (radius) {
    stackBlur(this.width, this.height, this.data, radius)
    return this
  }

  resize (width, height, interpolation) {
    const pix = new PixMap()

    if (width === AUTO) {
      let ratio = this.width / this.height
      width = Math.round(height * ratio)
    } else if (height === AUTO) {
      let ratio = this.height / this.width
      height = Math.round(width * ratio)
    }

    let interpolator = interpolation || INTERPOLATION.bilinear
    pix.data = interpolator(this.data, this.width, this.height, width, height)
    pix.width = width
    pix.height = height
    return pix
  }

  toBuffer (mime, options) {
    const encoder = ENCODER[mime]
    return Promise.resolve()
    .then(() => {
      if (encoder) return encoder(this.width, this.height, this.data, options)
      throw new EncodeError(mime)
    })
  }

  toFile (mime, path, options) {
    return this.toBuffer(mime, options)
    .then((buffer) => {
      return writeFile(path, buffer)
    })
  }

}

function getMime (chunk) {
  let type = fileType(chunk)
  if (type) {
    return type.mime
  } else if ((/^\s+?<svg|<xml/).test(chunk.toString())) { // try xml/svg
    return 'image/svg'
  }
  throw new Error('unknown mime-type')
}

class EncodeError extends TypeError {
  constructor (mime) {
    super()
    this.name = 'ENCODE_MIME_MISSING'
    this.message = `missing encoder for ${mime}.`
  }
}

class DecodeError extends TypeError {
  constructor (mime) {
    super()
    this.name = 'DECODE_MIME_MISSING'
    this.message = `missing decoder for ${mime}.`
  }
}

class BufferError extends TypeError {
  constructor (buffer) {
    super()
    this.name = 'NOT_A_BUFFER'
    this.message = `${buffer} must be a buffer.`
  }
}

function pixMap () {
  return new PixMap(...arguments)
}

// ENCODE / DECODE api

const ENCODER = pixMap.ENCODER = {}
const DECODER = pixMap.DECODER = {}

pixMap.register = (codecs) => {
  for (let mime in codecs) {
    let codec = codecs[mime]
    if (codec.encode) ENCODER[mime] = codec.encode
    if (codec.decode) DECODER[mime] = codec.decode
  }
}

// parse result of decoders and create a PixMap object
// or use this to create a pixmap object from non-file sources unknown to pixmap (Canvas ?)
pixMap.raw = function (width, height, data) {
  if (!Buffer.isBuffer(data)) throw new BufferError(data)
  if (data.length !== width * height * 4) throw new Error(`invalid buffer, must be 32bpp`)

  const pix = new PixMap()
  pix.width = width
  pix.height = height
  pix.data = data
  return pix
}

function createRaw ({ width, height, data }) { // for promises
  return pixMap.raw(width, height, data)
}

pixMap.loadBufferAs = function (mime, buffer, options) {
  // always return a promise.
  // this way, decoder might return a promise, or it might be sync, and we don't care.
  return Promise.resolve()
  .then(() => {
    if (!Buffer.isBuffer(buffer)) throw new BufferError(buffer)
    let decoder = DECODER[mime]
    if (!decoder) throw new DecodeError(mime)
    return decoder(buffer, options)
  })
  .then(createRaw)
}

// use this to create a PixMap object from buffers you get from files
pixMap.loadBuffer = function (buffer, options) {
  // always return a promise.
  // this way, decoder might return a promise, or it might be sync, and we don't care.
  return Promise.resolve()
  .then(() => {
    if (!Buffer.isBuffer(buffer)) throw new BufferError(buffer)
    let mime = getMime(buffer.slice(0, 4100))
    return pixMap.loadBufferAs(mime, buffer, options)
  })
}

pixMap.loadFileAs = function (mime, file, options) {
  let decoder
  return Promise.resolve()
  .then(() => {
    decoder = DECODER[mime]
    if (!decoder) throw new DecodeError(mime)
    return readFile(file)
  })
  .then((buffer) => decoder(buffer, options))
  .then(createRaw)
}

// use this to create a PixMap object from files
pixMap.loadFile = function (file, options) {
  return readChunk(file, 0, 4100)
  .then((chunk) => {
    let mime = getMime(chunk)
    return pixMap.loadFileAs(mime, file, options)
  })
}

// convenience constants
pixMap.MIME = MIME
pixMap.BLEND = blend.MODES
pixMap.INTERPOLATION = INTERPOLATION
pixMap.ALLOC_UNSAFE = ALLOC_UNSAFE
pixMap.AUTO = AUTO

pixMap.PixMap = PixMap

module.exports = pixMap
