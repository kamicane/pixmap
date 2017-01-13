'use strict'

// http://tech-algorithm.com/articles/nearest-neighbor-image-scaling/

module.exports = function nearestNeighbor (pixels, w1, h1, w2, h2) {
  let temp = Buffer.allocUnsafe(w2 * h2 * 4)
  // EDIT: added +1 to account for an early rounding problem
  let xRatio = ((w1 << 16) / w2) + 1
  let yRatio = ((h1 << 16) / h2) + 1

  for (let y = 0; y < h2; y++) {
    for (let x = 0; x < w2; x++) {
      let posDst = ((y * w2) + x) * 4
      let x2 = ((x * xRatio) >> 16)
      let y2 = ((y * yRatio) >> 16)
      let posSrc = ((y2 * w1) + x2) * 4

      temp[posDst++] = pixels[posSrc++]
      temp[posDst++] = pixels[posSrc++]
      temp[posDst++] = pixels[posSrc++]
      temp[posDst] = pixels[posSrc]
    }
  }
  return temp
}
