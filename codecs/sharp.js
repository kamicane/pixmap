'use strict'

const sharp = require('sharp')
const MIME = require('../mime-types.json')

const SHARP_FORMATS = sharp.format

for (let id in MIME) { // cross reference with PixMap known mimes to get valid mime-types
  const format = SHARP_FORMATS[id]
  if (!format) continue // continue if there is no such type in sharp (should always be there)

  const codec = {}

  if (format.output.buffer) codec.encode = createEncoder(id)
  if (format.input.buffer) codec.decode = decoder

  const mime = MIME[id]
  exports[mime] = codec
}

function decoder (buffer) {
  return new Promise((resolve, reject) => {
    sharp(buffer).toFormat('raw').toBuffer((err, buffer, { channels, width, height }) => {
      if (err) {
        reject(err)
      } else {
        if (channels === 3) { // fill out alpha channel if missing
          const clone = Buffer.allocUnsafe(width * height * 4)
          for (let i = 0, p = 0, l = buffer.length; i < l; i += channels, p += 4) {
            for (let j = 0; j < channels; j++) clone[p + j] = buffer[i + j]
            clone[p + 3] = 255
          }
          buffer = clone
        }

        if (buffer.length !== width * height * 4) {
          reject(new Error('unsupported bit depth'))
        } else {
          resolve({ width: width, height: height, data: buffer })
        }
      }
    })
  })
}

function createEncoder (type) {
  return function (width, height, data, options) {
    return new Promise((resolve, reject) => {
      // create a Buffer that shares memory with PixMap's Uint8ClampedArray
      const buffer = Buffer.from(data.buffer)
      sharp(buffer, { raw: { width: width, height: height, channels: 4 } }).toFormat(type, options).toBuffer((err, buffer) => {
        if (err) reject(err)
        else resolve(buffer)
      })
    })
  }
}
