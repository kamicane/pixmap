// http://jsfiddle.net/dFrHS/1/
// http://math.stackexchange.com/questions/296794/finding-the-transform-matrix-from-4-projected-points-with-javascript
// compared to the jsFiddle example, the matrix is transposed beforehand.
// using gl-matrix methods, and these functions work the same way (never create, demand an output object to work on.)

const { mat3, vec3, vec2 } = require('gl-matrix')

// alloc temporary arrays for common operations
const v3b1 = vec3.create()
const m3b1 = mat3.create()
const m3b2 = mat3.create()

function basisToPoints (out, x1, y1, x2, y2, x3, y3, x4, y4) {
  mat3.set(m3b1,
    x1, y1, 1,
    x2, y2, 1,
    x3, y3, 1
  )

  vec3.set(v3b1, x4, y4, 1)

  vec3.transformMat3(v3b1, v3b1, mat3.adjoint(m3b2, m3b1))

  mat3.set(m3b2,
    v3b1[0], 0, 0,
    0, v3b1[1], 0,
    0, 0, v3b1[2]
  )

  return mat3.multiply(out, m3b1, m3b2)
}

// alloc temporary arrays for common operations
const s = mat3.create()
const d = mat3.create()

function general2DProjection (out,
  x1s, y1s, x1d, y1d,
  x2s, y2s, x2d, y2d,
  x3s, y3s, x3d, y3d,
  x4s, y4s, x4d, y4d
) {
  basisToPoints(s, x1s, y1s, x2s, y2s, x3s, y3s, x4s, y4s)
  basisToPoints(d, x1d, y1d, x2d, y2d, x3d, y3d, x4d, y4d)

  return mat3.multiply(out, d, mat3.adjoint(out, s))
}

const v3p1 = vec3.create()

function vec2ProjectMat3 (out, v2, m3) {
  vec3.set(v3p1, v2[0], v2[1], 1)
  vec3.transformMat3(v3p1, v3p1, m3)
  return vec2.set(out, v3p1[0] / v3p1[2], v3p1[1] / v3p1[2])
}

function mat3FromPoints (out, w, h, x1, y1, x2, y2, x3, y3, x4, y4) {
  general2DProjection(out, 0, 0, x1, y1, w, 0, x2, y2, 0, h, x3, y3, w, h, x4, y4)
  for (let i = 0; i < 9; ++i) out[i] /= out[8]
  return out
}

exports.vec2ProjectMat3 = vec2ProjectMat3
exports.mat3FromPoints = mat3FromPoints
