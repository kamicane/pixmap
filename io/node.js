'use strict'

const PixMap = require('../core')

const fs = require('fs')
const pify = require('pify')
const readChunk = require('read-chunk')
const fileType = require('file-type')

const readFile = pify(fs.readFile)
const writeFile = pify(fs.writeFile)

const CODEC = PixMap.CODEC = {}

PixMap.register = function (codecs) {
  for (let name in codecs) {
    const codec = codecs[name]
    if (!CODEC[name]) CODEC[name] = {}
    if (codec.encode) CODEC[name].encode = codec.encode
    if (codec.decode) CODEC[name].decode = codec.decode
  }
  return this
}

function decodeBuffer (name, input, options) {
  const decodeError = new Error(`cannot decode ${name}`)

  return Promise.resolve()
  .then(() => {
    const codec = CODEC[name]
    if (!codec || !codec.decode) throw decodeError
    return codec.decode(input, options)
  })
  .then(({ width, height, data }) => {
    return PixMap.fromView(width, height, data)
  })
}

function encodeBuffer (name, width, height, data, options) {
  const encodeError = new Error(`cannot encode ${name}`)

  return Promise.resolve()
  .then(() => {
    const codec = CODEC[name]
    if (!codec || !codec.encode) throw encodeError
    return codec.encode(width, height, data, options)
  })
}

function getMime (chunk) {
  const type = fileType(chunk)
  if (type) {
    return type.mime
  } else if ((/^\s+?<svg|<xml/).test(chunk.toString())) { // try xml/svg
    return 'image/svg'
  }
  throw new Error('unknown mime-type')
}

PixMap.loadBuffer = function (buffer, options) {
  return Promise.resolve()
  .then(() => {
    if (!Buffer.isBuffer(buffer)) throw new Error(`${buffer} is not a buffer.`)
    const mime = getMime(buffer.slice(0, 4100))
    return decodeBuffer(mime, buffer, options)
  })
}

const decodeFile = function (mime, file, options) {
  return readFile(file)
  .then((buffer) => {
    return decodeBuffer(mime, buffer, options)
  })
}

PixMap.loadFile = function (file, options) {
  return readChunk(file, 0, 4100)
  .then((chunk) => {
    const mime = getMime(chunk)
    return decodeFile(mime, file, options)
  })
}

PixMap.prototype.toBuffer = function (mime, options) {
  return encodeBuffer(mime, this.width, this.height, this.data, options)
}

PixMap.prototype.toFile = function (mime, filePath, options) {
  return this.toBuffer(mime, options)
  .then((buffer) => {
    return writeFile(filePath, buffer)
  })
}

module.exports = PixMap
