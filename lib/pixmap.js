'use strict'
// inspired by Jimp, imagejs

const fs = require('fs')
const pify = require('pify')
const readChunk = require('read-chunk')
const fileType = require('file-type')
const stackBlur = require('./stack-blur')
const blend = require('./blend')
const INTERPOLATION = require('./resize')

const readFile = pify(fs.readFile)
const writeFile = pify(fs.writeFile)

// from PNGJS
function bitblt (srcData, srcWidth, dstData, dstWidth, srcX, srcY, width, height, deltaX, deltaY) {
  for (let y = 0; y < height; y++) {
    srcData.copy(dstData,
      ((deltaY + y) * dstWidth + deltaX) << 2,
      ((srcY + y) * srcWidth + srcX) << 2,
      ((srcY + y) * srcWidth + srcX + width) << 2
    )
  }
}

const ALLOC_UNSAFE = {}
const AUTO = {}

class PixMap {

  constructor (width, height, fill) {
    if (!(this instanceof PixMap)) return new PixMap(width, height, fill)

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
        let idx = (w * y + x) << 2
        yield { x, y, color: data.slice(idx, idx + 4) }
      }
    }
  }

  * rect (sx = 0, sy = 0, width = this.width, height = this.height) {
    // CLAMP HERE

    const w = this.width
    const ex = sx + width
    const ey = sy + height
    const data = this.data

    for (let y = sy; y < ey; y++) {
      for (let x = sx; x < ex; x++) {
        let idx = (w * y + x) << 2
        yield { x, y, color: data.slice(idx, idx + 4) }
      }
    }
  }

  crop (sx, sy, width, height) {
    // CLAMP HERE
    const pix = new PixMap(width, height, ALLOC_UNSAFE)
    bitblt(this.data, this.width, pix.data, pix.width, sx, sy, width, height, 0, 0)
    return pix
  }

  mask (src, dx, dy) {
    dx |= 0
    dy |= 0

    for (let { x, y, color } in src.rect(0, 0, this.width - dx, this.height - dy)) {
      let avg = (color[0] + color[1] + color[2]) / 3
      let f = avg / 255
      let dest = this.getPixel(dx + x, dy + y)
      dest[3] *= f
    }
    return this
  }

  getPixel (x, y) {
    x |= 0
    y |= 0

    if (x < 0 || x >= this.width || y < 0 || y >= this.height) return null

    let idx = (this.width * y + x) << 2
    return this.data.slice(idx, idx + 4)
  }

  clone () {
    const pix = new PixMap(this.width, this.height, ALLOC_UNSAFE)
    this.data.copy(pix.data)
    return pix
  }

  compose (pix, sx, sy, blendMode) {
    sx |= 0
    sy |= 0

    for (let { x, y, color } of this.rect(sx, sy, pix.width, pix.height)) {
      let addColor = pix.getPixel(x - sx, y - sy)
      blend(addColor, color, blendMode || blend.MODES.normal)
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
    return Promise.resolve().then(() => {
      if (encoder) return encoder(this.width, this.height, this.data, options)
      throw new EncodeError(mime)
    })
  }

  toFile (mime, path, options) {
    return this.toBuffer(mime, options).then((buffer) => {
      return writeFile(path, buffer)
    })
  }

}

// ENCODE / DECODE api

const ENCODER = PixMap.ENCODER = {}
const DECODER = PixMap.DECODER = {}

PixMap.register = (mime, { encode, decode }) => {
  if (encode) ENCODER[mime] = encode
  if (decode) DECODER[mime] = decode
  return this
}

function getMimeDecoder (chunk) {
  let type = fileType(chunk)
  if (type) {
    let mime = type.mime
    let decoder = DECODER[mime]
    return [ mime, decoder ]
  } else { // try xml/svg
    if ((/^\s+?<svg|<xml/).test(chunk.toString())) {
      let mime = 'image/svg'
      let decoder = DECODER[mime]
      return [ mime, decoder ]
    }
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

// parse result of decoders and create a PixMap object
// or use this to create a pixmap object from non-file sources unknown to pixmap (Canvas ?)
PixMap.raw = function (width, height, data) {
  if (!Buffer.isBuffer(data)) throw new TypeError(`${data} must be a buffer`)
  if (data.length !== width * height * 4) throw new Error(`invalid buffer`)

  const pix = new PixMap()
  pix.width = width
  pix.height = height
  pix.data = data
  return pix
}

// use this to create a PixMap object from buffers you get from files
PixMap.fromBuffer = function (buffer, options) {
  if (!Buffer.isBuffer(buffer)) throw new TypeError(`${buffer} must be a buffer`)
  // always return a promise.
  // this way, decoder might return a promise, or it might be sync, and we don't care.
  return Promise.resolve().then(() => {
    let [ mime, decoder ] = getMimeDecoder(buffer.slice(0, 4100))
    if (decoder) return decoder(buffer, options)
    throw new DecodeError(mime)
  }).then(({ width, height, data }) => PixMap.raw(width, height, data))
}

// use this to create a PixMap object from files
PixMap.fromFile = function (file, options) {
  let mime, decoder

  return readChunk(file, 0, 4100).then((chunk) => {
    [ mime, decoder ] = getMimeDecoder(chunk)
    if (!decoder) throw new DecodeError(mime)
    return readFile(file)
  }).then((buffer) => {
    return decoder(buffer, options)
  }).then(({ width, height, data }) => PixMap.raw(width, height, data))
}

// convenience constants

PixMap.MIME = {
  png: 'image/png',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  bmp: 'image/bpm',
  tiff: 'image/tiff',
  webp: 'image/webp',
  svg: 'image/svg'
}

PixMap.BLEND = blend.MODES
PixMap.INTERPOLATION = INTERPOLATION
PixMap.ALLOC_UNSAFE = ALLOC_UNSAFE
PixMap.AUTO = AUTO

module.exports = PixMap
