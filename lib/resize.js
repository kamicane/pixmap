/**
 * Copyright (c) 2015 Guyon Roche
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:</p>
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.  IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 *
 */
'use strict'
// from https://github.com/guyonroche/imagejs/blob/master/lib/resize.js
// @kamicane's changes:
// - slightly better memory usage by not expecting a pre-filled buffer as inputs.
// - use allocUnsafe instead of new Buffer(). The algorithms fill every byte and it's faster.
// - standard lint, fix variable re-assignments
// - methods take buf / width / height instead of src / dst data .width .height (never assume an object structure)
// - avoid generating closures every time a method is run
// - es2015ified

const interpolate2D = function (bufSrc, wSrc, hSrc, wDst, hDst, interpolate) {
  // when dst smaller than src/2, interpolate first to a multiple between 0.5 and 1.0 src, then sum squares
  let wM = Math.max(1, Math.floor(wSrc / wDst))
  let wDst2 = wDst * wM
  let hM = Math.max(1, Math.floor(hSrc / hDst))
  let hDst2 = hDst * hM

  // ===========================================================
  // Pass 1 - interpolate rows
  // buf1 has width of dst2 and height of src
  let buf1 = Buffer.allocUnsafe(wDst2 * hSrc * 4)

  for (let i = 0; i < hSrc; i++) {
    for (let j = 0; j < wDst2; j++) {
      // i in src coords, j in dst coords

      // calculate x in src coords
      // this interpolation requires 4 sample points and the two inner ones must be real
      // the outer points can be fudged for the edges.
      // therefore (wSrc-1)/wDst2
      let x = j * (wSrc - 1) / wDst2
      let xPos = Math.floor(x)
      let t = x - xPos
      let srcPos = (i * wSrc + xPos) * 4

      let buf1Pos = (i * wDst2 + j) * 4
      for (let k = 0; k < 4; k++) {
        let kPos = srcPos + k
        let x0 = (xPos > 0) ? bufSrc[kPos - 4] : 2 * bufSrc[kPos] - bufSrc[kPos + 4]
        let x1 = bufSrc[kPos]
        let x2 = bufSrc[kPos + 4]
        let x3 = (xPos < wSrc - 2) ? bufSrc[kPos + 8] : 2 * bufSrc[kPos + 4] - bufSrc[kPos]
        buf1[buf1Pos + k] = interpolate(x0, x1, x2, x3, t)
      }
    }
  }

  // ===========================================================
  // Pass 2 - interpolate columns
  // buf2 has width and height of dst2
  let buf2 = Buffer.allocUnsafe(wDst2 * hDst2 * 4)

  for (let i = 0; i < hDst2; i++) {
    for (let j = 0; j < wDst2; j++) {
      // i&j in dst2 coords

      // calculate y in buf1 coords
      // this interpolation requires 4 sample points and the two inner ones must be real
      // the outer points can be fudged for the edges.
      // therefore (hSrc-1)/hDst2
      let y = i * (hSrc - 1) / hDst2
      let yPos = Math.floor(y)
      let t = y - yPos
      let buf1Pos = (yPos * wDst2 + j) * 4
      let buf2Pos = (i * wDst2 + j) * 4
      for (let k = 0; k < 4; k++) {
        let kPos = buf1Pos + k
        let y0 = (yPos > 0) ? buf1[kPos - wDst2 * 4] : 2 * buf1[kPos] - buf1[kPos + wDst2 * 4]
        let y1 = buf1[kPos]
        let y2 = buf1[kPos + wDst2 * 4]
        let y3 = (yPos < hSrc - 2) ? buf1[kPos + wDst2 * 8] : 2 * buf1[kPos + wDst2 * 4] - buf1[kPos]

        buf2[buf2Pos + k] = interpolate(y0, y1, y2, y3, t)
      }
    }
  }

  // ===========================================================
  // Pass 3 - scale to dst
  let m = wM * hM
  if (m > 1) {
    let bufDst = Buffer.allocUnsafe(wDst * hDst * 4)

    for (var i = 0; i < hDst; i++) {
      for (var j = 0; j < wDst; j++) {
        // i&j in dst bounded coords
        var r = 0
        var g = 0
        var b = 0
        var a = 0
        for (var y = 0; y < hM; y++) {
          var yPos = i * hM + y
          for (var x = 0; x < wM; x++) {
            var xPos = j * wM + x
            var xyPos = (yPos * wDst2 + xPos) * 4
            r += buf2[xyPos]
            g += buf2[xyPos + 1]
            b += buf2[xyPos + 2]
            a += buf2[xyPos + 3]
          }
        }

        var pos = (i * wDst + j) * 4
        bufDst[pos] = Math.round(r / m)
        bufDst[pos + 1] = Math.round(g / m)
        bufDst[pos + 2] = Math.round(b / m)
        bufDst[pos + 3] = Math.round(a / m)
      }
    }

    return bufDst
  } else {
    return buf2
  }
}

const interpolateCubic = function (x0, x1, x2, x3, t) {
  let a0 = x3 - x2 - x0 + x1
  let a1 = x0 - x1 - a0
  let a2 = x2 - x0
  let a3 = x1
  return Math.max(0, Math.min(255, (a0 * (t * t * t)) + (a1 * (t * t)) + (a2 * t) + (a3)))
}

// between 2 points y(n), y(n+1), use next points out, y(n-1), y(n+2)
// to predict control points (a & b) to be placed at n+0.5
//  ya(n) = y(n) + (y(n+1)-y(n-1))/4
//  yb(n) = y(n+1) - (y(n+2)-y(n))/4
// then use std bezier to interpolate [n,n+1)
//  y(n+t) = y(n)*(1-t)^3 + 3 * ya(n)*(1-t)^2*t + 3 * yb(n)*(1-t)*t^2 + y(n+1)*t^3
//  note the 3* factor for the two control points
// for edge cases, can choose:
//  y(-1) = y(0) - 2*(y(1)-y(0))
//  y(w) = y(w-1) + 2*(y(w-1)-y(w-2))
// but can go with y(-1) = y(0) and y(w) = y(w-1)
const interpolateBezier = function (x0, x1, x2, x3, t) {
  // x1, x2 are the knots, use x0 and x3 to calculate control points
  let cp1 = x1 + (x2 - x0) / 4
  let cp2 = x2 - (x3 - x1) / 4
  let nt = 1 - t
  let c0 = x1 * nt * nt * nt
  let c1 = 3 * cp1 * nt * nt * t
  let c2 = 3 * cp2 * nt * t * t
  let c3 = x2 * t * t * t
  return Math.max(0, Math.min(255, Math.round(c0 + c1 + c2 + c3)))
}

const interpolateHermite = function (x0, x1, x2, x3, t) {
  let c0 = x1
  let c1 = 0.5 * (x2 - x0)
  let c2 = x0 - (2.5 * x1) + (2 * x2) - (0.5 * x3)
  let c3 = (0.5 * (x3 - x0)) + (1.5 * (x1 - x2))
  return Math.max(0, Math.min(255, Math.round((((((c3 * t) + c2) * t) + c1) * t) + c0)))
}

const interpolate = function (k, kMin, vMin, kMax, vMax) {
  // special case - k is integer
  if (kMin === kMax) {
    return vMin
  }

  return Math.round((k - kMin) * vMax + (kMax - k) * vMin)
}

const assign = function (bufSrc, bufDst, wSrc, pos, offset, x, xMin, xMax, y, yMin, yMax) {
  let posMin = (yMin * wSrc + xMin) * 4 + offset
  let posMax = (yMin * wSrc + xMax) * 4 + offset
  let vMin = interpolate(x, xMin, bufSrc[posMin], xMax, bufSrc[posMax])

  // special case, y is integer
  if (yMax === yMin) {
    bufDst[pos + offset] = vMin
  } else {
    posMin = (yMax * wSrc + xMin) * 4 + offset
    posMax = (yMax * wSrc + xMax) * 4 + offset
    let vMax = interpolate(x, xMin, bufSrc[posMin], xMax, bufSrc[posMax])

    bufDst[pos + offset] = interpolate(y, yMin, vMin, yMax, vMax)
  }
}

module.exports = {

  bilinear (bufSrc, wSrc, hSrc, wDst, hDst) {
    let bufDst = Buffer.allocUnsafe(wDst * hDst * 4)

    for (let i = 0; i < hDst; i++) {
      for (let j = 0; j < wDst; j++) {
        let posDst = (i * wDst + j) * 4

        // x & y in src coordinates
        let x = j * wSrc / wDst
        let xMin = Math.floor(x)
        let xMax = Math.min(Math.ceil(x), wSrc - 1)

        let y = i * hSrc / hDst
        let yMin = Math.floor(y)
        let yMax = Math.min(Math.ceil(y), hSrc - 1)

        assign(bufSrc, bufDst, wSrc, posDst, 0, x, xMin, xMax, y, yMin, yMax)
        assign(bufSrc, bufDst, wSrc, posDst, 1, x, xMin, xMax, y, yMin, yMax)
        assign(bufSrc, bufDst, wSrc, posDst, 2, x, xMin, xMax, y, yMin, yMax)
        assign(bufSrc, bufDst, wSrc, posDst, 3, x, xMin, xMax, y, yMin, yMax)
      }
    }

    return bufDst
  },

  bicubic (bufSrc, wSrc, hSrc, wDst, hDst) {
    return interpolate2D(bufSrc, wSrc, hSrc, wDst, hDst, interpolateCubic)
  },

  hermite (bufSrc, wSrc, hSrc, wDst, hDst) {
    return interpolate2D(bufSrc, wSrc, hSrc, wDst, hDst, interpolateHermite)
  },

  bezier (bufSrc, wSrc, hSrc, wDst, hDst) {
    return interpolate2D(bufSrc, wSrc, hSrc, wDst, hDst, interpolateBezier)
  }

}
