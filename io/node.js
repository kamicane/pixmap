'use strict'

const PixMap = require('../core')

const fs = require('fs')
const pify = require('pify')
const readChunk = require('read-chunk')
const fileType = require('file-type')

const readFile = pify(fs.readFile)
const writeFile = pify(fs.writeFile)

function getMime (chunk) {
  let type = fileType(chunk)
  if (type) {
    return type.mime
  } else if ((/^\s+?<svg|<xml/).test(chunk.toString())) { // try xml/svg
    return 'image/svg'
  }
  throw new Error('unknown mime-type')
}

// use this to create a PixMap object from buffers you get from files
PixMap.loadBuffer = function (buffer, options) {
  return Promise.resolve()
  .then(() => {
    if (!Buffer.isBuffer(buffer)) throw new Error(`${buffer} is not a buffer.`)
    let mime = getMime(buffer.slice(0, 4100))
    return PixMap.decode('buffer', mime, buffer, options)
  })
}

const loadFileAs = function (mime, file, options) {
  return readFile(file)
  .then((buffer) => {
    return PixMap.decode('buffer', mime, buffer, options)
  })
}

// use this to create a PixMap object from files
PixMap.loadFile = function (file, options) {
  return readChunk(file, 0, 4100)
  .then((chunk) => {
    let mime = getMime(chunk)
    return loadFileAs(mime, file, options)
  })
}

PixMap.prototype.toBuffer = function (mime, options) {
  return this.encode('buffer', mime, options)
}

PixMap.prototype.toFile = function (mime, filePath, options) {
  return this.toBuffer(mime, options)
  .then((data) => {
    return writeFile(filePath, data)
  })
}
