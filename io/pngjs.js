'use strict'

const PNG = require('pngjs').PNG
const raw = require('raw-body')

exports['image/png'] = {

  decode (buffer) {
    return new Promise((resolve, reject) => {
      new PNG().parse(buffer, (err, png) => {
        if (err) {
          reject(err)
        } else {
          // normalize gamma
          png.adjustGamma()
          resolve({ width: png.width, height: png.height, data: png.data })
        }
      })
    })
  },

  encode (width, height, data, options) {
    // make sure width / height are not set in options otherwise PNG.js creates an useless buffer
    options = Object.assign({}, options, { width: 0, height: 0 })
    let png = new PNG(options)
    png.width = width
    png.height = height
    png.data = data
    return raw(png.pack())
  }

}
