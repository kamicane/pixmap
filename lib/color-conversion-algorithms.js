// A nice little copy / pasta of https://gist.github.com/mjackson/5311256
// from Michael Jackson <mjijackson@gmail.com>
// my changes:
// - read values from an array (with optional offset).
// - accepts an array to set values to (with optional offset) otherwise returns
//   Uint16Array for HSV/L and Uint8ClampedArray for RGB.
// - h s l/v are expected as 360 / 100 / 100 instead of 1 / 1 / 1
// - these could be used in pixel loops, so need to be as fast as possible, e.g.
//   cannot create arrays freely like that.

/**
 * Converts an RGB color value to HSL. Conversion formula
 * adapted from http://en.wikipedia.org/wiki/HSL_color_space.
 * Assumes r, g, and b are contained in the set [0, 255] and
 * returns h, s, and l in the set [0, 1].
 *
 * @param   Number  r       The red color value
 * @param   Number  g       The green color value
 * @param   Number  b       The blue color value
 * @return  Array           The HSL representation
 */
function rgbToHsl (rgbArray, rgbOffset = 0, hslArray = new Uint16Array(3), hslOffset = 0) {
  let r = rgbArray[rgbOffset + 0] / 255
  let g = rgbArray[rgbOffset + 1] / 255
  let b = rgbArray[rgbOffset + 2] / 255

  let max = Math.max(r, g, b)
  let min = Math.min(r, g, b)
  let h, s
  let l = (max + min) / 2

  if (max === min) {
    h = s = 0 // achromatic
  } else {
    let d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)

    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break
      case g: h = (b - r) / d + 2; break
      case b: h = (r - g) / d + 4; break
    }

    h /= 6
  }

  hslArray[hslOffset + 0] = h
  hslArray[hslOffset + 1] = s
  hslArray[hslOffset + 2] = l

  return hslArray
}

function hue2rgb (p, q, t) {
  if (t < 0) t += 1
  if (t > 1) t -= 1
  if (t < 1 / 6) return p + (q - p) * 6 * t
  if (t < 1 / 2) return q
  if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
  return p
}

/**
 * Converts an HSL color value to RGB. Conversion formula
 * adapted from http://en.wikipedia.org/wiki/HSL_color_space.
 * Assumes h, s, and l are contained in the set [0, 1] and
 * returns r, g, and b in the set [0, 255].
 *
 * @param   Number  h       The hue
 * @param   Number  s       The saturation
 * @param   Number  l       The lightness
 * @return  Array           The RGB representation
 */
function hslToRgb (hslArray, hslOffset = 0, rgbArray = new Uint8ClampedArray(3), rgbOffset = 0) {
  let h = hslArray[hslOffset + 0] / 360
  let s = hslArray[hslOffset + 1] / 100
  let l = hslArray[hslOffset + 2] / 100

  let r, g, b

  if (s === 0) {
    r = g = b = l // achromatic
  } else {
    let q = l < 0.5 ? l * (1 + s) : l + s - l * s
    let p = 2 * l - q

    r = hue2rgb(p, q, h + 1 / 3)
    g = hue2rgb(p, q, h)
    b = hue2rgb(p, q, h - 1 / 3)
  }

  rgbArray[rgbOffset + 0] = r * 255
  rgbArray[rgbOffset + 1] = g * 255
  rgbArray[rgbOffset + 2] = b * 255

  return rgbArray
}

/**
 * Converts an RGB color value to HSV. Conversion formula
 * adapted from http://en.wikipedia.org/wiki/HSV_color_space.
 * Assumes r, g, and b are contained in the set [0, 255] and
 * returns h, s, and v in the set [0, 1].
 *
 * @param   Number  r       The red color value
 * @param   Number  g       The green color value
 * @param   Number  b       The blue color value
 * @return  Array           The HSV representation
 */
function rgbToHsv (rgbArray, rgbOffset = 0, hsvArray = new Uint16Array(3), hsvOffset = 0) {
  let r = rgbArray[rgbOffset + 0] / 255
  let g = rgbArray[rgbOffset + 1] / 255
  let b = rgbArray[rgbOffset + 2] / 255

  let max = Math.max(r, g, b)
  let min = Math.min(r, g, b)
  let h, s
  let v = max

  let d = max - min
  s = max === 0 ? 0 : d / max

  if (max === min) {
    h = 0 // achromatic
  } else {
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break
      case g: h = (b - r) / d + 2; break
      case b: h = (r - g) / d + 4; break
    }

    h /= 6
  }

  hsvArray[hsvOffset + 0] = h
  hsvArray[hsvOffset + 1] = s
  hsvArray[hsvOffset + 2] = v

  return hsvArray
}

/**
 * Converts an HSV color value to RGB. Conversion formula
 * adapted from http://en.wikipedia.org/wiki/HSV_color_space.
 * Assumes h, s, and v are contained in the set [0, 1] and
 * returns r, g, and b in the set [0, 255].
 *
 * @param   Number  h       The hue
 * @param   Number  s       The saturation
 * @param   Number  v       The value
 * @return  Array           The RGB representation
 */
function hsvToRgb (hsvArray, hsvOffset = 0, rgbArray = new Uint8ClampedArray(3), rgbOffset = 0) {
  let h = hsvArray[hsvOffset + 0] / 360
  let s = hsvArray[hsvOffset + 1] / 100
  let v = hsvArray[hsvOffset + 2] / 100

  let r, g, b

  let i = Math.floor(h * 6)
  let f = h * 6 - i
  let p = v * (1 - s)
  let q = v * (1 - f * s)
  let t = v * (1 - (1 - f) * s)

  switch (i % 6) {
    case 0: r = v; g = t; b = p; break
    case 1: r = q; g = v; b = p; break
    case 2: r = p; g = v; b = t; break
    case 3: r = p; g = q; b = v; break
    case 4: r = t; g = p; b = v; break
    case 5: r = v; g = p; b = q; break
  }

  rgbArray[rgbOffset + 0] = r * 255
  rgbArray[rgbOffset + 1] = g * 255
  rgbArray[rgbOffset + 2] = b * 255

  return rgbArray
}

exports.hsvToRgb = hsvToRgb
exports.hslToRgb = hslToRgb
exports.rgbToHsv = rgbToHsv
exports.rgbToHsl = rgbToHsl
