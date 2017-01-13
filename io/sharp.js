'use strict'

const sharp = require('sharp')
const MIME = require('../mime-types.json')

const SHARP_FORMATS = sharp.format

for (let id in MIME) { // cross reference with PixMap known mimes to get valid mime-types
  let format = SHARP_FORMATS[id]
  if (!format) continue // continue if there is no such type in sharp (should always be there)

  const codec = {}
  if (format.input.buffer) codec.decode = decoder
  if (format.output.buffer) codec.encode = createEncoder(id)

  let mime = MIME[id]
  if (codec.encode || codec.decode) exports[mime] = codec // export the codec
}

function decoder (buffer) {
  return new Promise((resolve, reject) => {
    sharp(buffer).toFormat('raw').toBuffer((err, buffer, { channels, width, height }) => {
      if (err) {
        reject(err)
      } else {
        // fill out missing channels with 0xff
        if (channels < 4) {
          // is it more performant to prefill, or to fill out missing channels manually ?
          let clone = Buffer.alloc(width * height * 4, 0xff) // prefill
          for (let i = 0, p = 0; i < buffer.length; i += channels, p += 4) {
            buffer.copy(clone, p, i, i + channels) // copy available channels to our buffer
          }
          buffer = clone
        }
        resolve({ width: width, height: height, data: buffer })
      }
    })
  })
}

function createEncoder (type) {
  return function (width, height, data, options) {
    return new Promise((resolve, reject) => {
      sharp(data, { raw: { width: width, height: height, channels: 4 } }).toFormat(type, options).toBuffer((err, buffer) => {
        if (err) reject(err)
        resolve(buffer)
      })
    })
  }
}
