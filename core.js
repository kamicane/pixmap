'use strict'
// inspired by Jimp, imagejs

const glur = require('glur')
const blend = require('./lib/blend')
const MIME = require('./mime-types.json')
const unsharp = require(/* pica */'./lib/unsharp')
const resizeArray = require(/* pica */'./lib/resize-array')
const { hsvToRgb, hslToRgb, rgbToHsl, rgbToHsv } = require('./lib/color-conversion-algorithms')

const INTERPOLATION = {
  lanczos3: resizeArray.lanczos3,
  lanczos2: resizeArray.lanczos2,
  hamming: resizeArray.hamming,
  nearest: require('./lib/nearest-neighbor')
}

function clamp (n, min, max) {
  if (n < min) n = min
  else if (n > max) n = max
  return n
}

function def (object, properties) {
  const descriptors = {}
  for (let name in properties) {
    descriptors[name] = {
      enumerable: true,
      configurable: false,
      writable: false,
      value: properties[name]
    }
  }
  return Object.defineProperties(object, descriptors)
}

const NO_DATA = {}
const AUTO = {}

class PixMap {

  constructor (width, height) {
    if (width === NO_DATA) return

    width = Math.round(width | 0)
    height = Math.round(height | 0)

    if (width <= 0 || height <= 0) throw new Error('width and height must be > 0')

    def(this, {
      width: width,
      height: height,
      data: new Uint8ClampedArray(width * height * 4)
    })
  }

  select (x = 0, y = 0, w = this.width, h = this.height) {
    const height = this.height
    const width = this.width

    let x2 = clamp(x + w, 0, width)
    let y2 = clamp(y + h, 0, height)

    x = clamp(x, 0, width)
    y = clamp(y, 0, height)

    if (x === x2 || y === y2) return null

    const rect = [[], []]

    if (x < x2) {
      rect[0][0] = x
      rect[1][0] = x2
    } else if (x > x2) {
      rect[0][0] = x2
      rect[1][0] = x
    }

    if (y < y2) {
      rect[0][1] = y
      rect[1][1] = y2
    } else if (y > y2) {
      rect[0][1] = y2
      rect[1][1] = y
    }

    return rect
  }

  getPixelOffset (x, y) {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) return null
    return (this.width * y + x) * 4
  }

  setPixel/* RGB(A) */ (x, y, src, offset = 0) {
    let idx = this.getPixelOffset(x, y)
    if (idx == null) return null
    let data = this.data
    let len = Math.min(src.length - offset, 4) // cutoff at 4
    for (let i = 0; i < len; i++) data[idx + i] = src[offset + i]
    return this
  }

  setPixelHSV (x, y, src, offset = 0) {
    let idx = this.getPixelOffset(x, y)
    if (idx == null) return null
    let data = this.data
    hsvToRgb(src, offset, data, idx)
    return this
  }

  setPixelHSB (x, y, src, offset = 0) {
    let idx = this.getPixelOffset(x, y)
    if (idx == null) return null
    let data = this.data
    hslToRgb(src, offset, data, idx)
    return this
  }

  scan (handle, dx = 0, dy = 0, w = this.width - dx, h = this.height - dy) {
    let selection = this.select(dx, dy, w, h)
    if (!selection) return this
    const [ [sx, sy], [ex, ey] ] = selection

    const data = this.data
    const width = this.width

    let broken
    let index, x, y

    for (y = sy; y < ey; y++) {
      for (x = sx; x < ex; x++) {
        index = (width * y + x) * 4
        let res = handle.call(this, x, y, index, data)
        if (res === false) {
          broken = true
          break
        }
      }
      if (broken) break
    }

    return this
  }

  crop (dx, dy, w, h) {
    let selection = this.select(dx, dy, w, h)
    if (!selection) return this.clone()

    const [ [sx, sy], [ex, ey] ] = selection

    const width = ex - sx
    const height = ey - sy

    const pix = new PixMap(width, height)

    const tw = this.width
    const pd = pix.data
    const td = this.data

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let tidx = (tw * (y + sy) + (x + sx)) * 4
        let pidx = (width * y + x) * 4
        for (let i = 0; i < 4; i++) pd[pidx + i] = td[tidx + i]
      }
    }

    return pix
  }

  mask (pix, dx, dy) {
    let selection = this.select(dx, dy, pix.width, pix.height)
    if (!selection) return this

    const [ [sx, sy], [ex, ey] ] = selection

    let sdata = pix.data
    let ddata = this.data

    for (let y = sy; y < ey; y++) {
      for (let x = sx; x < ex; x++) {
        let delta1 = pix.getPixelOffset(x - sx, y - sy)
        let delta2 = this.getPixelOffset(x, y)
        let avg = (sdata[ delta1 ] + sdata[delta1 + 1] + sdata[delta1 + 2]) / 3
        let f = avg / 255
        ddata[delta2 + 3] *= f
      }
    }

    return this
  }

  getLine (y) {
    if (y < 0 || y >= this.height) return null

    let idx = (this.width * y) * 4
    return this.data.subarray(idx, idx + (this.width * 4))
  }

  clone () {
    const pix = new PixMap(NO_DATA)
    def(pix, {
      width: this.width,
      height: this.height,
      data: Uint8ClampedArray.from(this.data)
    })
    return pix
  }

  blend (pix, dx, dy, blendMode, amount) {
    let selection = this.select(dx, dy, pix.width, pix.height)
    if (!selection) return this
    const [ [sx, sy], [ex, ey] ] = selection

    if (!blendMode) blendMode = blend.MODES.normal

    let src = pix.data
    let dst = this.data

    for (let y = sy; y < ey; y++) {
      for (let x = sx; x < ex; x++) {
        let ds = pix.getPixelOffset(x - sx, y - sy)
        let dd = this.getPixelOffset(x, y)
        blend(src, dst, blendMode, amount, ds, dd)
      }
    }

    return this
  }

  copy (pix, dx, dy) {
    let selection = this.select(dx, dy, pix.width, pix.height)
    if (!selection) return this
    const [ [sx, sy], [ex, ey] ] = selection

    let src = pix.data
    let dst = this.data

    for (let y = sy; y < ey; y++) {
      for (let x = sx; x < ex; x++) {
        let ds = pix.getPixelOffset(x - sx, y - sy)
        let dd = this.getPixelOffset(x, y)
        for (let i = 0; i < 4; i++) dst[dd + i] = src[ds + i]
      }
    }

    return this
  }

  blur (radius) {
    glur(this.data, this.width, this.height, radius)
    return this
  }

  unsharp (amount, radius, threshold) {
    unsharp(this.data, this.width, this.height, amount, radius, threshold)
    return this
  }

  resize (width, height, interpolation) {
    if (width === AUTO) {
      let ratio = this.width / this.height
      width = Math.round(height * ratio)
    } else if (height === AUTO) {
      let ratio = this.height / this.width
      height = Math.round(width * ratio)
    }

    const pix = new PixMap(width, height)
    let interpolator = interpolation || INTERPOLATION.lanczos3
    interpolator(this.data, pix.data, this.width, this.height, width, height)
    return pix
  }

}

PixMap.decode = function (type, name, input, options) {
  let decodeError = new Error(`cannot decode ${name} from ${type} type`)

  return Promise.resolve()
  .then(() => {
    let codec = CODEC[name]
    if (!codec || !codec.decode) throw decodeError
    let decoder = codec.decode[type]
    if (!decoder) throw decodeError
    return decoder(input, options)
  })
  .then(({ width, height, data }) => {
    return PixMap.fromView(width, height, data)
  })
}

PixMap.prototype.encode = function (type, name, options) {
  let encodeError = new Error(`cannot encode ${name} to ${type}`)

  return Promise.resolve()
  .then(() => {
    const codec = CODEC[name]
    if (!codec || !codec.encode) throw encodeError
    const encoder = codec.encode[type]
    if (!encoder) throw encodeError
    return encoder(this.width, this.height, this.data, options)
  })
}

const CODEC = PixMap.CODEC = {}

PixMap.register = (codecs) => {
  for (let name in codecs) {
    let codec = codecs[name]
    if (!CODEC[name]) CODEC[name] = { encode: {}, decode: {} }
    for (let t in codec.encode) CODEC[name].encode[t] = codec.encode[t]
    for (let t in codec.decode) CODEC[name].decode[t] = codec.decode[t]
  }
}

// use this to create a pixmap object from non-file sources
PixMap.fromView = function (width, height, data) {
  if (!ArrayBuffer.isView(data)) throw new Error(`${data} must be an ArrayBuffer view`)
  if (data.length !== width * height * 4) throw new Error(`data must be in 32bpp`)

  const pix = new PixMap(NO_DATA)
  return def(pix, {
    width: width,
    height: height,
    // create a clamped view from the same underlying ArrayBuffer
    data: new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength)
  })
}

// convenience
PixMap.hsvToRgb = hsvToRgb
PixMap.hslToRgb = hslToRgb
PixMap.rgbToHsl = rgbToHsl
PixMap.rgbToHsv = rgbToHsv

PixMap.MIME = MIME
PixMap.BLEND = blend.MODES
PixMap.INTERPOLATION = INTERPOLATION
PixMap.AUTO = AUTO

module.exports = PixMap
