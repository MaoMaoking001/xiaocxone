// utils/font.js 全局字体大小（无障碍：方便眼神不好的用户放大文字）
//
// 原理：所有 wxss 里的 font-size 都写成了 calc(原字号 * var(--fs, 1))，
// 这里只负责往页面根节点注入 --fs 变量，整页文字就会一起放大 / 缩小，
// 而间距、卡片、图片不受影响，不会挤坏布局。
const FONT_KEY = 'font_scale'

// 全局基准倍数：所有档位都先乘上它，等于统一放大 / 缩小整套字号
// 改这里就相当于改「标准」档的实际大小（标准档 = 1 × BASE）
// 只影响 calc(Nrpx * var(--fs, 1)) 里的文字，间距、卡片、图片不受影响
const BASE = 1.05

// 可选的档位（key 就是倍数）
const FONT_OPTIONS = [
  { key:0.85,name:'小'},
  { key: 1, name: '标准' },
  { key: 1.1, name: '大' },
  { key: 1.2, name: '特大' }
]

function getFontScale() {
  const v = Number(wx.getStorageSync(FONT_KEY) || 1)
  return FONT_OPTIONS.some(o => o.key === v) ? v : 1
}

function setFontScale(v) {
  const n = Number(v)
  const ok = FONT_OPTIONS.some(o => o.key === n) ? n : 1
  wx.setStorageSync(FONT_KEY, ok)
  return ok
}

/** 生成可拼到页面 style 上的内联变量：档位倍数 × 全局基准倍数 */
function getFontStyle() {
  // 保留 3 位小数，避免 1.15 × 1.1 这类乘法出现 1.2650000000000001
  const s = Math.round(getFontScale() * BASE * 1000) / 1000
  return `--fs:${s};`
}

module.exports = {
  FONT_KEY,
  FONT_OPTIONS,
  getFontScale,
  setFontScale,
  getFontStyle
}
