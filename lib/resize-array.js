// SOURCE: https://raw.githubusercontent.com/nodeca/pica/master/lib/js/resize_array.js
// LICENSE: (The MIT License) Copyright (C) by Vitaly Puzrin

// [2017] @kamicane:
// Importing (copy/pasta) this file rather than require('pica/lib/js/resize_array') because:
// - The full library is canvas based,
//   having this math in a separate package (like glur) would be very nice.
// - Requiring from /lib of packages is something I try to never do because
//   the file could move between any version, and requiring from "lib/js" is even worse.

'use strict'

// Precision of fixed FP values
var FIXED_FRAC_BITS = 14

const FILTERS = {

  nearest (x) {
    return (x >= -0.5 && x < 0.5) ? 1.0 : 0.0
  },

  hamming (x) {
    if (x <= -1.0 || x >= 1.0) { return 0.0 }
    if (x > -1.19209290E-07 && x < 1.19209290E-07) return 1.0
    var xpi = x * Math.PI
    return ((Math.sin(xpi) / xpi) * (0.54 + 0.46 * Math.cos(xpi / 1.0)))
  },

  lanczos2 (x) {
    if (x <= -2.0 || x >= 2.0) { return 0.0 }
    if (x > -1.19209290E-07 && x < 1.19209290E-07) return 1.0
    var xpi = x * Math.PI
    return (Math.sin(xpi) / xpi) * Math.sin(xpi / 2.0) / (xpi / 2.0)
  },

  lanczos3 (x) {
    if (x <= -3.0 || x >= 3.0) { return 0.0 }
    if (x > -1.19209290E-07 && x < 1.19209290E-07) return 1.0
    var xpi = x * Math.PI
    return (Math.sin(xpi) / xpi) * Math.sin(xpi / 3.0) / (xpi / 3.0)
  }

}

const toFixedPoint = (num) => Math.round(num * ((1 << FIXED_FRAC_BITS) - 1))

// Calculate convolution filters for each destination point,
// and pack data to Int16Array:
//
// [ shift, length, data..., shift2, length2, data..., ... ]
//
// - shift - offset in src image
// - length - filter length (in src points)
// - data - filter values sequence
//
function createFilters (win, filterFunction, srcSize, destSize, scale, offset) {
  var scaleInverted = 1.0 / scale
  var scaleClamped = Math.min(1.0, scale) // For upscale

  // Filter window (averaging interval), scaled to src image
  var srcWindow = win / scaleClamped

  var destPixel, srcPixel, srcFirst, srcLast, filterElementSize,
    floatFilter, fxpFilter, total, pxl, idx, floatVal, filterTotal, filterVal
  var leftNotEmpty, rightNotEmpty, filterShift, filterSize

  var maxFilterElementSize = Math.floor((srcWindow + 1) * 2)
  var packedFilter = new Int16Array((maxFilterElementSize + 2) * destSize)
  var packedFilterPtr = 0

  // For each destination pixel calculate source range and built filter values
  for (destPixel = 0; destPixel < destSize; destPixel++) {
    // Scaling should be done relative to central pixel point
    srcPixel = (destPixel + 0.5) * scaleInverted + offset

    srcFirst = Math.max(0, Math.floor(srcPixel - srcWindow))
    srcLast = Math.min(srcSize - 1, Math.ceil(srcPixel + srcWindow))

    filterElementSize = srcLast - srcFirst + 1
    floatFilter = new Float32Array(filterElementSize)
    fxpFilter = new Int16Array(filterElementSize)

    total = 0.0

    // Fill filter values for calculated range
    for (pxl = srcFirst, idx = 0; pxl <= srcLast; pxl++, idx++) {
      floatVal = filterFunction(((pxl + 0.5) - srcPixel) * scaleClamped)
      total += floatVal
      floatFilter[idx] = floatVal
    }

    // Normalize filter, convert to fixed point and accumulate conversion error
    filterTotal = 0

    for (idx = 0; idx < floatFilter.length; idx++) {
      filterVal = floatFilter[idx] / total
      filterTotal += filterVal
      fxpFilter[idx] = toFixedPoint(filterVal)
    }

    // Compensate normalization error, to minimize brightness drift
    fxpFilter[destSize >> 1] += toFixedPoint(1.0 - filterTotal)

    //
    // Now pack filter to useable form
    //
    // 1. Trim heading and tailing zero values, and compensate shitf/length
    // 2. Put all to single array in this format:
    //
    //    [ pos shift, data length, value1, value2, value3, ... ]
    //

    leftNotEmpty = 0
    while (leftNotEmpty < fxpFilter.length && fxpFilter[leftNotEmpty] === 0) {
      leftNotEmpty++
    }

    if (leftNotEmpty < fxpFilter.length) {
      rightNotEmpty = fxpFilter.length - 1
      while (rightNotEmpty > 0 && fxpFilter[rightNotEmpty] === 0) {
        rightNotEmpty--
      }

      filterShift = srcFirst + leftNotEmpty
      filterSize = rightNotEmpty - leftNotEmpty + 1

      packedFilter[packedFilterPtr++] = filterShift // shift
      packedFilter[packedFilterPtr++] = filterSize // size

      packedFilter.set(fxpFilter.subarray(leftNotEmpty, rightNotEmpty + 1), packedFilterPtr)
      packedFilterPtr += filterSize
    } else {
      // zero data, write header only
      packedFilter[packedFilterPtr++] = 0 // shift
      packedFilter[packedFilterPtr++] = 0 // size
    }
  }
  return packedFilter
}

// Convolve image in horizontal directions and transpose output. In theory,
// transpose allow:
//
// - use the same convolver for both passes (this fails due different
//   types of input array and temporary buffer)
// - making vertical pass by horisonltal lines inprove CPU cache use.
//
// But in real life this doesn't work :)
function convolve (src, dest, srcW, srcH, destW, filters) {
  var r, g, b, a
  var filterPtr, filterShift, filterSize
  var srcPtr, srcY, destX, filterVal
  var srcOffset = 0
  var destOffset = 0

  // For each row
  for (srcY = 0; srcY < srcH; srcY++) {
    filterPtr = 0

    // Apply precomputed filters to each destination row point
    for (destX = 0; destX < destW; destX++) {
      // Get the filter that determines the current output pixel.
      filterShift = filters[filterPtr++]
      filterSize = filters[filterPtr++]

      srcPtr = (srcOffset + (filterShift * 4)) | 0

      r = g = b = a = 0

      // Apply the filter to the row to get the destination pixel r, g, b, a
      for (; filterSize > 0; filterSize--) {
        filterVal = filters[filterPtr++]

        // Use reverse order to workaround deopts in old v8 (node v.10)
        // Big thanks to @mraleph (Vyacheslav Egorov) for the tip.
        a = (a + filterVal * src[srcPtr + 3]) | 0
        b = (b + filterVal * src[srcPtr + 2]) | 0
        g = (g + filterVal * src[srcPtr + 1]) | 0
        r = (r + filterVal * src[srcPtr + 0]) | 0
        srcPtr = (srcPtr + 4) | 0
      }

      // Bring this value back in range. All of the filter scaling factors
      // are in fixed point with FIXED_FRAC_BITS bits of fractional part.
      //
      // (!) Add 1/2 of value before clamping to get proper rounding. In other
      // case brightness loss will be noticeable if you resize image with white
      // border and place it on white background.
      dest[destOffset + 3] = (a + (1 << 13)) >> 14
      dest[destOffset + 2] = (b + (1 << 13)) >> 14
      dest[destOffset + 1] = (g + (1 << 13)) >> 14
      dest[destOffset + 0] = (r + (1 << 13)) >> 14
      destOffset = (destOffset + srcH * 4) | 0
    }

    destOffset = ((srcY + 1) * 4) | 0
    srcOffset = ((srcY + 1) * srcW * 4) | 0
  }
}

function resize (src, dest, srcW, srcH, destW, destH, win, filter) {
  var scaleX = destW / srcW
  var scaleY = destH / srcH
  var offsetX = 0
  var offsetY = 0

  var filtersX = createFilters(win, filter, srcW, destW, scaleX, offsetX)
  var filtersY = createFilters(win, filter, srcH, destH, scaleY, offsetY)

  var tmp = new Uint8ClampedArray(destW * srcH * 4)

  convolve(src, tmp, srcW, srcH, destW, filtersX)
  convolve(tmp, dest, srcH, destW, destH, filtersY)
}

exports.nearest = (src, dest, srcW, srcH, destW, destH) => {
  return resize(src, dest, srcW, srcH, destW, destH, 0.5, FILTERS.nearest)
}

exports.hamming = (src, dest, srcW, srcH, destW, destH) => {
  return resize(src, dest, srcW, srcH, destW, destH, 1.0, FILTERS.hamming)
}

exports.lanczos2 = (src, dest, srcW, srcH, destW, destH) => {
  return resize(src, dest, srcW, srcH, destW, destH, 2.0, FILTERS.lanczos2)
}

exports.lanczos3 = (src, dest, srcW, srcH, destW, destH) => {
  return resize(src, dest, srcW, srcH, destW, destH, 3.0, FILTERS.lanczos3)
}
