// utils/bg.js 自定义页面背景 + 主题色注入
// 背景数据保存在 storage 中，键 page_bg
// 格式：{type: 'default' | 'color' | 'image', value: string}
//
// 说明：applyBg 除了背景，还会把全局主题色（accent）一起写进 data.accentStyle，
// 这样页面只需要在 wxml 的根节点写 style="{{bgStyle}}{{accentStyle}}"，
// 就能同时拿到"自定义背景"和"统一主题色"，不会出现粉色块残留。
const { getAccentStyle, getThemeAccent, applyGlobalColor } = require('./theme')
const { getFontStyle } = require('./font')

function getPageBg() {
  const saved = wx.getStorageSync('page_bg')
  if (saved && typeof saved === 'object') return saved
  return { type: 'default', value: '' }
}

function setPageBg(bg) {
  wx.setStorageSync('page_bg', bg)
  // 同步到全局，让其它页面 onShow 直接拿到
  const app = getApp()
  if (app && app.globalData) app.globalData.pageBg = bg
}

function clearPageBg() {
  wx.removeStorageSync('page_bg')
  const app = getApp()
  if (app && app.globalData) app.globalData.pageBg = { type: 'default', value: '' }
}

/** 把背景转换成可放在 style 属性里的字符串 */
function getBgStyle(bg) {
  if (!bg) bg = getPageBg()
  if (bg.type === 'color' && bg.value) {
    return `background:${bg.value};background-image:none;`
  }
  if (bg.type === 'image' && bg.value) {
    return `background-color:transparent;background-image:url("${bg.value}");background-size:cover;background-position:center center;background-repeat:no-repeat;`
  }
  return ''
}

/**
 * 把背景应用到当前 Page（调用方需在 data 里准备好 bgStyle 字段，
 * 且在 wxml 里写 style="{{bgStyle}}"）
 */
function applyBg(page) {
  if (!page) return { bgStyle: getBgStyle(), accentStyle: getAccentStyle() + getFontStyle() }
  const bg = getPageBg()
  const style = getBgStyle(bg)
  page.setData({
    bgStyle: style,
    bgType: bg.type,
    // 主题色变量 + 字号倍数变量一起注入，页面里不用再单独处理
    accentStyle: getAccentStyle() + getFontStyle(),
    // accent 也跟着明暗主题走：浅色=粉、深色=紫，
    // 页面里 <switch color="{{accent}}"> 这类原生组件才能一起变
    accent: getThemeAccent()
  })
  // 导航栏 / tabBar 是微信原生部分，而且「导航栏颜色是按页面生效」的：
  // 每个页面 onShow 都走 applyBg，这里统一刷一次，才不会出现
  // 「游戏页是粉色导航栏、我的页是深色导航栏」这种不一致。
  applyGlobalColor()
}

module.exports = {
  getPageBg,
  setPageBg,
  clearPageBg,
  getBgStyle,
  applyBg
}