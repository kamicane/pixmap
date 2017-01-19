'use strict'
// inspired by Jimp, imagejs

const glur = require('glur')
const blend = require('./lib/blend')
const MIME = require('./mime-types.json')
const unsharp = require(/* pica */'./lib/unsharp')
const resizeArray = require(/* pica */'./lib/resize-array')
const { hsvToRgb, hslToRgb, rgbToHsl, rgbToHsv } = require('./lib/color-conversion-algorithms')

let resize = require('./lib/resize')

const INTERPOLATION = {
  lanczos3: resizeArray.lanczos3,
  lanczos2: resizeArray.lanczos2,
  hamming: resizeArray.hamming,
  nearest: resize.nearest,
  bilinear: resize.bilinear
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

  rect (x = 0, y = 0, w = this.width - x, h = this.height - y) {
    const height = this.height
    const width = this.width

    const x2 = clamp(x + w, 0, width)
    const y2 = clamp(y + h, 0, height)

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
    const width = this.width
    const height = this.height
    if (x < 0 || x >= width || y < 0 || y >= height) return null
    return (width * y + x) * 4
  }

  setPixel/* RGB(A) */ (x, y, src, offset = 0) {
    const off = this.getPixelOffset(x, y)
    if (off == null) return null
    const data = this.data
    const len = Math.min(src.length - offset, 4) // cutoff at 4
    for (let i = 0; i < len; i++) data[off + i] = src[offset + i]
    return this
  }

  setPixelHsv (x, y, src, offset = 0) {
    const off = this.getPixelOffset(x, y)
    if (off == null) return null
    hsvToRgb(src, offset, this.data, off)
    return this
  }

  setPixelHsl (x, y, src, offset = 0) {
    const off = this.getPixelOffset(x, y)
    if (off == null) return null
    hslToRgb(src, offset, this.data, off)
    return this
  }

  blendPixel (x, y, src, offset = 0, blendMode, amount) {
    const off = this.getPixelOffset(x, y)
    if (off == null) return null
    blend(src, offset, this.data, off, blendMode || blend.MODES.normal, amount)
    return this
  }

  scan (handle, dx, dy, w, h) {
    const rect = this.rect(dx, dy, w, h)
    if (!rect) return this
    const [ [sx, sy], [ex, ey] ] = rect

    const data = this.data
    const width = this.width

    let broken

    for (let y = sy; y < ey; y++) {
      for (let x = sx; x < ex; x++) {
        const index = (width * y + x) * 4
        const res = handle.call(this, x, y, index, data)
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
    const rect = this.rect(dx, dy, w, h)
    if (!rect) return this.clone()

    const [ [sx, sy], [ex, ey] ] = rect

    const width = ex - sx
    const height = ey - sy

    const pix = new PixMap(width, height)

    const tw = this.width
    const pd = pix.data
    const td = this.data

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const tidx = (tw * (y + sy) + (x + sx)) * 4
        const pidx = (width * y + x) * 4
        for (let i = 0; i < 4; i++) pd[pidx + i] = td[tidx + i]
      }
    }

    return pix
  }

  mask (pix, dx, dy) {
    const pw = pix.width
    const ph = pix.height
    const w = this.width

    const rect = this.rect(dx, dy, pw, ph)
    if (!rect) return this

    const [ [sx, sy], [ex, ey] ] = rect

    const sdata = pix.data
    const ddata = this.data

    for (let y = sy; y < ey; y++) {
      for (let x = sx; x < ex; x++) {
        const delta1 = (pw * (y - sy) + (x - sx)) * 4
        const delta2 = (w * y + x) * 4
        const avg = (sdata[ delta1 ] + sdata[delta1 + 1] + sdata[delta1 + 2]) / 3
        const f = avg / 255
        ddata[delta2 + 3] *= f
      }
    }

    return this
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
    const pw = pix.width
    const ph = pix.height
    const w = this.width

    const rect = this.rect(dx, dy, pw, ph)
    if (!rect) return this
    const [ [sx, sy], [ex, ey] ] = rect

    if (!blendMode) blendMode = blend.MODES.normal

    const src = pix.data
    const dst = this.data

    for (let y = sy; y < ey; y++) {
      for (let x = sx; x < ex; x++) {
        const ds = (pw * (y - sy) + (x - sx)) * 4
        const dd = (w * y + x) * 4
        blend(src, ds, dst, dd, blendMode, amount)
      }
    }

    return this
  }

  copy (pix, dx, dy) {
    const pw = pix.width
    const ph = pix.height
    const w = this.width

    const rect = this.rect(dx, dy, pw, ph)
    if (!rect) return this
    const [ [sx, sy], [ex, ey] ] = rect

    const src = pix.data
    const dst = this.data

    for (let y = sy; y < ey; y++) {
      for (let x = sx; x < ex; x++) {
        const ds = (pw * (y - sy) + (x - sx)) * 4
        const dd = (w * y + x) * 4
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

PixMap.fromView = function (width, height, data) {
  if (!ArrayBuffer.isView(data)) throw new Error(`${data} must be an ArrayBuffer view`)
  if (data.length !== width * height * 4) throw new Error(`data must be in 32bpp`)

  const pix = new PixMap(NO_DATA)
  return def(pix, {
    width: width,
    height: height,
    // create a clamped view from the same underlying ArrayBuffer
    data: new Uint8ClampedArray(data.buffer, data.byteOffset, data.length)
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
