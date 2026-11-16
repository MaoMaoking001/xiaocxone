// utils/theme.js 主题（明暗）+ 全局主题色（accent）
//
// 主题色设计：
//  1. 存一份 accent 到 storage（键 accent_color）
//  2. 每个页面的 .page-root 通过内联 style 注入 CSS 变量
//     （--primary / --primary-grad / --primary-soft / --primary-weak）
//  3. WXSS 里所有颜色统一写 var(--primary, #ff8fab)，
//     这样换主题色后所有模块都会跟着变，不会再留下"固定粉色"的色块。

const ACCENT_KEY = 'accent_color'          // 浅色模式的主题色
const DARK_ACCENT_KEY = 'accent_color_dark' // 深色模式的主题色（默认紫色）
const DEFAULT_ACCENT = '#ff8fab'
const DARK_ACCENT = '#9b78b8'

function getTheme() {
  return wx.getStorageSync('theme') === 'dark' ? 'theme-dark' : 'theme-light'
}

function toggleTheme() {
  const next = getTheme() === 'theme-dark' ? 'light' : 'dark'
  wx.setStorageSync('theme', next === 'dark' ? 'dark' : 'light')
  return getTheme()
}

/* ---------------- 颜色工具 ---------------- */

function normalizeHex(c) {
  if (typeof c !== 'string') return DEFAULT_ACCENT
  let s = c.trim()
  if (s.charAt(0) !== '#') s = '#' + s
  // #abc → #aabbcc
  if (s.length === 4) {
    s = '#' + s[1] + s[1] + s[2] + s[2] + s[3] + s[3]
  }
  return /^#[0-9a-fA-F]{6}$/.test(s) ? s.toLowerCase() : DEFAULT_ACCENT
}

function hexToRgb(c) {
  const s = normalizeHex(c)
  return {
    r: parseInt(s.slice(1, 3), 16),
    g: parseInt(s.slice(3, 5), 16),
    b: parseInt(s.slice(5, 7), 16)
  }
}

function rgbToHex(r, g, b) {
  const f = n => {
    const v = Math.max(0, Math.min(255, Math.round(n)))
    let s = v.toString(16)
    return s.length === 1 ? '0' + s : s
  }
  return '#' + f(r) + f(g) + f(b)
}

/** 与白色混合，ratio 越大越浅 */
function lighten(c, ratio) {
  const { r, g, b } = hexToRgb(c)
  return rgbToHex(r + (255 - r) * ratio, g + (255 - g) * ratio, b + (255 - b) * ratio)
}

/** 与黑色混合，ratio 越大越深 */
function darken(c, ratio) {
  const { r, g, b } = hexToRgb(c)
  return rgbToHex(r * (1 - ratio), g * (1 - ratio), b * (1 - ratio))
}

function rgba(c, a) {
  const { r, g, b } = hexToRgb(c)
  return `rgba(${r},${g},${b},${a})`
}

/* ---------------- accent 读写 ---------------- */

function getAccent() {
  return normalizeHex(wx.getStorageSync(ACCENT_KEY) || DEFAULT_ACCENT)
}

/** 深色模式用的主题色（默认薰衣草紫，可单独保存一份） */
function getDarkAccent() {
  return normalizeHex(wx.getStorageSync(DARK_ACCENT_KEY) || DARK_ACCENT)
}

/** 当前主题下真正生效的主题色：浅色用 accent，深色用深色主题色 */
function getThemeAccent() {
  return getTheme() === 'theme-dark' ? getDarkAccent() : getAccent()
}

/**
 * 生成可挂在 .page-root 上的内联 style 字符串。
 * 所有页面只要在 wxml 里写 style="{{bgStyle}}{{accentStyle}}" 即可全模块统一主题色。
 *
 * 注意：内联样式的优先级高于 .theme-dark / .theme-light 里的变量，
 * 所以这里必须自己判断明暗主题，否则深色模式下也会被浅色主题色覆盖（一直是粉色）。
 */
function getAccentStyle() {
  const dark = getTheme() === 'theme-dark'
  const c = dark ? getDarkAccent() : getAccent()
  // 深色：从深一档的紫渐变到浅紫；浅色：主题色渐变到浅一档
  // 说明：浅色下不要为了"提高对比度"把起点压深，压深后粉色会发灰、显得脏，
  // 甜一点的亮粉才是这套主题的调性（对比度问题用加粗字号来补）
  const start = dark ? darken(c, 0.16) : c
  const light = lighten(c, dark ? 0.30 : 0.38)
  const deep = dark ? lighten(c, 0.30) : darken(c, 0.18)
  return [
    `--primary:${c};`,
    `--primary-grad:linear-gradient(135deg,${start},${light});`,
    `--primary-soft:${c}${dark ? '22' : '1f'};`,
    `--primary-weak:${rgba(c, dark ? 0.20 : 0.14)};`,
    `--primary-mid:${rgba(c, dark ? 0.40 : 0.35)};`,
    `--primary-deep:${deep};`
  ].join('')
}

/** 把主题色同步到导航栏 / tabBar（微信原生部分不受 WXSS 控制，必须单独设置） */
function applyGlobalColor(c) {
  const dark = getTheme() === 'theme-dark'
  const color = normalizeHex(c || getThemeAccent())
  try {
    wx.setTabBarStyle(dark ? {
      color: '#b3a4b2',
      selectedColor: color,
      backgroundColor: '#3a323f',
      borderStyle: 'black'
    } : {
      color: '#b8a8b0',
      selectedColor: color,
      backgroundColor: '#ffffff',
      borderStyle: 'black'
    })
  } catch (e) {}
  try {
    wx.setNavigationBarColor(dark
      ? { frontColor: '#ffffff', backgroundColor: '#2a2430' }
      : { frontColor: '#000000', backgroundColor: lighten(color, 0.82) })
  } catch (e) {}
}

module.exports = {
  ACCENT_KEY,
  DARK_ACCENT_KEY,
  DEFAULT_ACCENT,
  DARK_ACCENT,
  getTheme,
  toggleTheme,
  getAccent,
  getDarkAccent,
  getThemeAccent,
  getAccentStyle,
  applyGlobalColor,
  normalizeHex,
  lighten,
  darken,
  rgba
}
