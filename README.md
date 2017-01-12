# pixmap.

*THIS PACKAGE IS NOT PUBLISHED YET. ADDING TO VERSION CONTROL BEFORE MY DRIVE BREAKS.*

PixMap is a pixel manipulation library.
It supports compositing pixmaps with SVG blending modes, resizing, blurring, cropping, masking, and, of course, direct pixel manipulation.

PixMap works by delegating decoding and encoding image formats to third parties.
[sharp](https://github.com/lovell/sharp) and [pngjs](https://github.com/lukeapage/pngjs) are both natively supported by requiring their relative io modules.

All buffer allocations are kept to a minimum. allocUnsafe is always used when pixels are going to get filled.

NO BUFFERS WERE HARMED IN THE MAKING OF THIS JAVASCRIPT PROGRAM.

# Installation

```
yarn add pixmap
```
or
```
npm install pixmap --save
```

It is probably usable in browsers as well with [WebPack](https://webpack.github.io/) or [Browserify](http://browserify.org/) with some configuration (using [feross/buffer](https://github.com/feross/buffer)).

# API

```js
const PixMap = require('pixmap')
```

## Creating PixMaps

```js
let pix = PixMap(100, 100) // 100x100 transparent
let pix = PixMap(100, 100, 0xff) // 100x100 white
let pix = PixMap(100, 100, 0x00) // 100x100 black
```

## I/O

Using provided encoders and decoders
```js
const PixMap = require('pixmap')
require('pixmap/io/sharp') // adds codecs for png, svg, jpeg, tiff, etc.
// equivalent to
const PixMap = require('pixmap/io/sharp')

// alternatively
require('pixmap/io/pngjs') // adds codecs for png (no gyp required)
require('pixmap/io/jpeg-js') // adds codecs for jpeg (no gyp required)
```

Supported sharp codecs are automatically calculated at runtime using [`sharp.format`](http://sharp.dimens.io/en/stable/api-constructor/#format).

After requiring the desired codecs you can use the following promise-based API:

### I

Reading from files
```js
PixMap.fromFile('./path/to/image.png').then((pix) => {
  //...
})
```

Reading from buffers
```js
fs.readFile('./path/to/image.png', (buffer) => {
  PixMap.fromBuffer(buffer).then((pix) => {
    //...
  })
})
```
When reading from file or buffer, the [file-type](https://github.com/sindresorhus/file-type) of the file or buffer is used to get the proper
codec and return a raw PixMap.

If you want to feed PixMap with a raw buffer of decoded pixels, you can use
```js
let pix = PixMap.raw(width, height, buffer)
```
for example:
```js
let canvasBuffer = Buffer.from(ctx.getImageData(0, 0, canvas.width, canvas.height))
let pix = Pixmap.raw(canvas.width, canvas.height, canvasBuffer)
```

### O

Saving to a file. Refer to the library documentation for their options.
```js
PixMap.toFile('image/png', './path/to/image.png', {/* options */}).then(() => {
  console.log('done')
})
```

Saving to a coded buffer. Refer to the library documentation for their options.
```js
PixMap.toBuffer('image/png', {/* options */}).then((buffer) => {
  fs.writeFile('./path/to/image.png', buffer, () => {
    //..
  })
})
```

For consistency, `fromBuffer` / `toBuffer` always return promises, even if the implemented codec behaves in a syncronous manner.

convenience OBJECT for mime-types
```js
PixMap.MIME.png  === 'image/png'
PixMap.MIME.jpeg === 'image/jpeg'
PixMap.MIME.gif  === 'image/gif'
PixMap.MIME.tiff === 'image/tiff'
PixMap.MIME.svg  === 'image/svg'
PixMap.MIME.webp === 'image/webp'
```

## Iterating over PixMaps

Iterating over pixmaps (with es2015 iterators)
```js
for (let { x, y, color } of pix) {
  let red   = color[0]
  let green = color[1]
  let blue  = color[2]
  let alpha = color[3]
  console.log(x, y, `rgba(${red}, ${green}, ${blue}, ${alpha / 255})`)
}
```
Iterating over an area of a PixMap (with es2015 iterators)
```js
for (let { x, y, color } of pix.rect(25, 25, 50, 50)) {
  let red   = color[0]
  let green = color[1]
  let blue  = color[2]
  let alpha = color[3]
  console.log(x, y, `rgba(${red}, ${green}, ${blue}, ${alpha / 255})`)
}
```
Old-school Iteration
```js
for (let y = 0; y < pix.height; y++) {
  for (let x = 0; x < pix.width; x++) {
    let idx   = (pix.width * y + x) << 2
    let color = pix.data.slice(idx, idx + 4)

    let red   = color[0]
    let green = color[1]
    let blue  = color[2]
    let alpha = color[3]
    console.log(x, y, `rgba(${red}, ${green}, ${blue}, ${alpha / 255})`)
  }
}
```
Make a black rectangle over someone's ugly face
```js
for (let { x, y, color } of pix.rect(25, 25, 50, 50)) {
  color[0] = 0
  color[1] = 0
  color[2] = 0
  color[3] = 255
}
```

## Compositing
todoc
## Cropping
todoc
## Masking
todoc
## Filtering
todoc
## Resizing
todoc

#License

MIT.

Inspired by [Jimp](https://github.com/oliver-moran/jimp) / [imagejs](https://github.com/guyonroche/imagejs).
