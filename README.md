# pixmap.

*THIS PACKAGE IS NOT PUBLISHED YET. ADDING TO VERSION CONTROL BEFORE MY DRIVE BREAKS.*

PixMap is a pixel manipulation library, for node & browsers.
It supports blending, resizing, blurring, cropping, masking, and, of course, direct pixel manipulation.

PixMap works by delegating decoding and encoding of image formats to third parties like [sharp](https://github.com/lovell/sharp) or [pngjs](https://github.com/lukeapage/pngjs).

# Installation

```
yarn add pixmap
```
or
```
npm install pixmap --save
```

# API

```js
const PixMap = require('pixmap')
```

## Creating new PixMaps

```js
let pix = new PixMap(100, 100) // 100x100 transparent pixmap
```

### Properties

```js
pix.width // width of the pix
pix.height // height of the pix
pix.data // pixel data, Uint8ClampedArray
```

## I/O

By default, in node, `require('pixmap')` will give you PixMap with sharp codecs (png, svg, jpeg, tiff, etc).
Supported sharp codecs are automatically calculated at runtime using [`sharp.format`](http://sharp.dimens.io/en/stable/api-constructor/#format).
```js
const PixMap = require('pixmap')

// get pngBuffer somehow
PixMap.loadBuffer(pngBuffer).then((pix) => {
  //...
})

PixMap.loadFile('path/to/file').then((pix) => {
  //...
})

PixMap.toFile('image/png').then(() => {
  console.log('saved.')
})

PixMap.toBuffer('image/png').then((pngBuffer) => {
  // do stuff with pngBuffer
})
```

### Input

Reading from files
```js
PixMap.loadFile('./path/to/image.png').then((pix) => {
  //...
})
```

Reading from buffers
```js
fs.readFile('./path/to/image.png', (buffer) => {
  PixMap.loadBuffer(buffer).then((pix) => {
    //...
  })
})
```
When reading from file or buffer, the [file-type](https://github.com/sindresorhus/file-type) of the file or buffer is used to get the proper
codec and return a new PixMap.

If you want to feed PixMap with a raw buffer of decoded pixels, you can use
```js
let pix = PixMap.fromView(width, height, arrayView)
```
for example:
```js
let imageData = canvas.getContext('2d').getImageData()
let pix = PixMap.fromView(imageData.width, imageData.height, imageData.data)
```

PixMap will always favor referencing the original ArrayBuffer rather than copying it, whenever possible (e.g. same number of channels.),
so for instance, in the example above, modifying the PixMap pixels will also modify the imageData pixels.

### Output

Saving to a file. Refer to the library documentation for their options.
```js
pix.toFile('image/png', './path/to/image.png', {/* options */}).then(() => {
  console.log('done')
})
```

Saving to a coded buffer. Refer to the library documentation for their options.
```js
pix.toBuffer('image/png', {/* options */}).then((buffer) => {
  fs.writeFile('./path/to/image.png', buffer, () => {
    //..
  })
})
```

For consistency, `loadBuffer` / `toBuffer` always return promises, even if the implemented codec behaves in a syncronous manner.

Convenience constants provided for mime-types
```js
PixMap.MIME.png  === 'image/png'
PixMap.MIME.jpeg === 'image/jpeg'
PixMap.MIME.gif  === 'image/gif'
PixMap.MIME.tiff === 'image/tiff'
PixMap.MIME.svg  === 'image/svg'
PixMap.MIME.webp === 'image/webp'
```

## Iterating over PixMaps
todoc
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
