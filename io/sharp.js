'use strict'

const PixMap = require('../lib/pixmap')
const sharp = require('sharp')

const decodeTypes = [] // array of supported mime types for decoding (['png', 'jpg'])
const encodeTypes = {} // object of supported mime types to id for encoding ({'image/png': 'png'})

const SHARP_FORMATS = sharp.format

const MIME = PixMap.MIME

for (let id in MIME) { // cross reference with PixMap known mimes to get valid mime-types
  let format = SHARP_FORMATS[id]
  if (!format) continue // continue if there is no such type in sharp (should always be there)
  if (format.input.buffer) decodeTypes.push(MIME[id])
  if (format.output.buffer) encodeTypes[MIME[id]] = id
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

for (let mime of decodeTypes) PixMap.DECODER[mime] = decoder
for (let mime in encodeTypes) PixMap.ENCODER[mime] = createEncoder(encodeTypes[mime])

module.exports = PixMap
