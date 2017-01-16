// some code from: https://github.com/pdaoust/stylus-helpers/blob/master/blend.styl
// blend functions from https://dev.w3.org/SVG/modules/compositing/master/
'use strict'

function clip (num) {
  if (num < 0) num = 0
  else if (num > 1) num = 1
  return num
}

// basically a copy / pasta from the SVG spec

// Sca - The source element color value multiplied by alpha.
// Dca - The canvas color value prior to compositing, multiplied by alpha.
// Sa  - The source element alpha value.
// Da  - The canvas alpha value prior to compositing.

const MODES = {

  normal (Sca, Dca, Sa, Da) {
    return Sca + Dca * (1 - Sa)
  },

  // src (Sca, Dca, Sa, Da) {
  //   return Sca
  // },

  // dst (Sca, Dca, Sa, Da) {
  //   return Dca
  // },

  // srcOver (Sca, Dca, Sa, Da) { // same as normal
  //   return Sca + Dca * (1 - Sa)
  // },

  // dstOver (Sca, Dca, Sa, Da) {
  //   return Dca + Sca * (1 - Da)
  // },

  // srcIn (Sca, Dca, Sa, Da) {
  //   return Sca * Da
  // },

  // dstIn (Sca, Dca, Sa, Da) {
  //   return Dca * Sa
  // },

  // srcOut (Sca, Dca, Sa, Da) {
  //   return Sca * (1 - Da)
  // },

  // dstOut (Sca, Dca, Sa, Da) {
  //   return Dca * (1 - Sa)
  // },

  // stcAtop (Sca, Dca, Sa, Da) {
  //   return Sca * Da + Dca * (1 - Sa)
  // },

  // dstAtop (Sca, Dca, Sa, Da) {
  //   return Dca * Sa + Sca * (1 - Da)
  // },

  // xor (Sca, Dca, Sa, Da) {
  //   return Sca * (1 - Da) + Dca * (1 - Sa)
  // },

  plus (Sca, Dca, Sa, Da) {
    return Sca + Dca
  },

  multiply (Sca, Dca, Sa, Da) {
    return Sca * Dca + Sca * (1 - Da) + Dca * (1 - Sa)
  },

  screen (Sca, Dca, Sa, Da) {
    return Sca + Dca - Sca * Dca
  },

  overlay (Sca, Dca, Sa, Da) {
    if (2 * Dca <= Da) {
      return 2 * Sca * Dca + Sca * (1 - Da) + Dca * (1 - Sa)
    } else {
      return Sca * (1 + Da) + Dca * (1 + Sa) - 2 * Dca * Sca - Da * Sa
    }
  },

  darken (Sca, Dca, Sa, Da) {
    return Math.min(Sca * Da, Dca * Sa) + Sca * (1 - Da) + Dca * (1 - Sa)
  },

  lighten (Sca, Dca, Sa, Da) {
    return Math.max(Sca * Da, Dca * Sa) + Sca * (1 - Da) + Dca * (1 - Sa)
  },

  colorDodge (Sca, Dca, Sa, Da) {
    if (Sca === Sa && Dca === 0) return Sca * (1 - Da)
    if (Sca === Sa) return Sa * Da + Sca * (1 - Da) + Dca * (1 - Sa)
    else if (Sca < Sa) return Sa * Da * Math.min(1, Dca / Da * Sa / (Sa - Sca)) + Sca * (1 - Da) + Dca * (1 - Sa)
  },

  colorBurn (Sca, Dca, Sa, Da) {
    if (Sca === 0 && Dca === Da) return Sa * Da + Dca * (1 - Sa)
    else if (Sca === 0) return Dca * (1 - Sa)
    else if (Sca > 0) return Sa * Da * (1 - Math.min(1, (1 - Dca / Da) * Sa / Sca)) + Sca * (1 - Da) + Dca * (1 - Sa)
  },

  hardLight (Sca, Dca, Sa, Da) {
    if (2 * Sca <= Sa) return 2 * Sca * Dca + Sca * (1 - Da) + Dca * (1 - Sa)
    else return Sca * (1 + Da) + Dca * (1 + Sa) - Sa * Da - 2 * Sca * Dca
  },

  softLight (Sca, Dca, Sa, Da) {
    let m = Dca / Da
    if (2 * Sca <= Sa) return Dca * (Sa + (2 * Sca - Sa) * (1 - m)) + Sca * (1 - Da) + Dca * (1 - Sa)
    else if (2 * Sca > Sa && 4 * Dca <= Da) return Da * (2 * Sca - Sa) * (16 * m ^ 3 - 12 * m ^ 2 - 3 * m) + Sca - Sca * Da + Dca
    else if (2 * Sca > Sa && 4 * Dca > Da) return Da * (2 * Sca - Sa) * (m ^ 0.5 - m) + Sca - Sca * Da + Dca
  },

  difference (Sca, Dca, Sa, Da) {
    return Sca + Dca - 2 * Math.min(Sca * Da, Dca * Sa)
  },

  exclusion (Sca, Dca, Sa, Da) {
    return (Sca * Da + Dca * Sa - 2 * Sca * Dca) + Sca * (1 - Da) + Dca * (1 - Sa)
  }

}

// applies color1 TO color2
function blend (color1, color2, blendf, amount = 1, delta1 = 0, delta2 = 0) {
  // optimizations.
  let red1d = delta1
  let green1d = delta1 + 1
  let blue1d = delta1 + 2
  let alpha1d = delta1 + 3

  let red2d = delta2
  let green2d = delta2 + 1
  let blue2d = delta2 + 2
  let alpha2d = delta2 + 3

  // if (amount === 0 || color1[alpha1d] === 0) return // no op, destination stays the same

  // get 8-bit colour values and convert to floats
  let red1 = color1[red1d] / 255
  let green1 = color1[green1d] / 255
  let blue1 = color1[blue1d] / 255

  // amount adjusts alpha1 and then is no longer used.
  // if you're familiar with SVG spec, think of amount as opacity.
  let alpha1 = ((amount * color1[alpha1d]) / 255)

  let red2 = color2[red2d] / 255
  let green2 = color2[green2d] / 255
  let blue2 = color2[blue2d] / 255

  let alpha2 = color2[alpha2d] / 255

  // premultiply RGB values for each colour, cf. Porter/Duff
  let red1a = red1 * alpha1
  let green1a = green1 * alpha1
  let blue1a = blue1 * alpha1

  let red2a = red2 * alpha2
  let green2a = green2 * alpha2
  let blue2a = blue2 * alpha2

  // calculate the new colours
  let red3a = blendf(red1a, red2a, alpha1, alpha2)
  let green3a = blendf(green1a, green2a, alpha1, alpha2)
  let blue3a = blendf(blue1a, blue2a, alpha1, alpha2)

  // calculate final alpha, which is the same for any blending mode
  // (except clear, src, src-in, dst-in, src-out and dst-atop)
  let alpha3 = alpha1 + alpha2 - alpha1 * alpha2

  // take premultiplied RGB values for final colour and derive actual colours
  // by un-multiplying them by the final alpha. Then clip each.
  let red3 = clip(red3a / alpha3)
  let green3 = clip(green3a / alpha3)
  let blue3 = clip(blue3a / alpha3)

  color2[red2d] = red3 * 255
  color2[green2d] = green3 * 255
  color2[blue2d] = blue3 * 255
  color2[alpha2d] = alpha3 * 255
}

blend.MODES = MODES

module.exports = blend
