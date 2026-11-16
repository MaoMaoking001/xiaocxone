// pages/tools/hidden/hidden.js 隐藏工具管理（独立页面）
//
// 需求：已隐藏的工具不再出现在首页，统一放到这个页面查看 / 恢复。
// 这里同时也能直接把首页正在显示的工具隐藏掉。
const { getTheme, getAccent } = require('../../../utils/theme')
const { applyBg } = require('../../../utils/bg')
const {
  getVisibleTools,
  getHiddenTools,
  hideTool,
  showTool,
  showAllTools
} = require('../../../utils/tools')

Page({
  data: {
    theme: 'theme-light',
    bgStyle: '',
    accentStyle: '',
    hiddenTools: [],
    visibleTools: []
  },

  onShow() {
    this.setData({ theme: getTheme() })
    applyBg(this)
    this.load()
  },

  load() {
    this.setData({
      hiddenTools: getHiddenTools(),
      visibleTools: getVisibleTools()
    })
  },

  /** 恢复显示 */
  restore(e) {
    const name = e.currentTarget.dataset.name
    showTool(name)
    wx.showToast({ title: '已恢复到首页 ✨', icon: 'none' })
    this.load()
  },

  /** 直接隐藏 */
  hide(e) {
    const name = e.currentTarget.dataset.name
    hideTool(name)
    wx.showToast({ title: '已隐藏', icon: 'none' })
    this.load()
  },

  /** 一键全部恢复 */
  restoreAll() {
    if (this.data.hiddenTools.length === 0) return
    wx.showModal({
      title: '恢复全部工具',
      content: `确定把 ${this.data.hiddenTools.length} 个已隐藏的工具全部恢复到首页吗？`,
      confirmText: '全部恢复',
      confirmColor: getAccent(),
      success: res => {
        if (!res.confirm) return
        showAllTools()
        wx.showToast({ title: '已全部恢复 ✨', icon: 'none' })
        this.load()
      }
    })
  },

  goHome() {
    wx.switchTab({ url: '/pages/index/index' })
  }
})
