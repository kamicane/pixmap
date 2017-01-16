'use strict'

const PixMap = require('./core')
require('./io/node')
PixMap.register(require('./codecs/sharp'))

module.exports = PixMap
