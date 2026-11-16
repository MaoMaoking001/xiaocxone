// pages/profile/bg/bg.js 自定义背景设置
//
// 【背景有三种模式，存在缓存 page_bg 里】
//   { type: 'default', value: '' }            默认渐变（不写任何样式）
//   { type: 'color',   value: '#fff5f7' }     纯色
//   { type: 'image',   value: 'wxfile://...' } 本地图片
//   读的时候统一走 utils/bg.js 的 getPageBg()，页面根节点 style="{{bgStyle}}" 就能生效
//
// 重要：本页背景只能使用 *本地路径*（wxfile://...）。
// 云端 fileID 在 CSS `background-image: url()` 里是渲染不出来的（只能放进 <image src>），
// 所以这里统一用 wx.saveFile 把图片保存到本地永久目录，不再走云存储。
//
// 【用到的文件系统 API】
//   wx.getFileSystemManager()   拿到文件管理器
//   fs.accessSync(dir)          判断目录在不在（不存在会抛错）
//   fs.mkdirSync(dir, true)     递归创建目录
//   wx.saveFile({tempFilePath}) 把临时图片存进永久目录，返回 savedFilePath
//   注意 USER_DATA_PATH 是小程序自己的沙箱目录，卸载小程序才会清空
const {getTheme, getAccent} = require('../../../utils/theme')
const { applyBg, getPageBg, setPageBg, clearPageBg } = require('../../../utils/bg')

const PRESETS = [
  { name: '默认粉', value: '#fff5f7' },
  { name: '蜜桃粉', value: '#ffe9f0' },
  { name: '奶油黄', value: '#fff8e1' },
  { name: '薄荷绿', value: '#e8f5e9' },
  { name: '薰衣草', value: '#f3e5f5' },
  { name: '天空蓝', value: '#e3f2fd' },
  { name: '浅米色', value: '#faf6ef' },
  { name: '蜜瓜橙', value: '#fff3e0' }
]

// 本地图片保存目录：每次冷启动都在同一目录下，便于持久化
const LOCAL_DIR = `${wx.env.USER_DATA_PATH}/bg_imgs`

/** 确保目录存在；accessSync 在新版本可能抛错，用 try 兜底 */
function ensureDir() {
  try {
    const fs = wx.getFileSystemManager()
    try { fs.accessSync(LOCAL_DIR) } catch (e) { fs.mkdirSync(LOCAL_DIR, true) }
  } catch (e) { /* 忽略 */ }
}

Page({
  data: {
    theme: 'theme-light',
    bgType: 'default',
    bgValue: '',
    presets: PRESETS,
    customColor: '#fff5f7',
    bgImage: '',
    uploading: false
  },

  onShow() {
    ensureDir()
    const bg = getPageBg()
    this.setData({
      theme: getTheme(),
      bgType: bg.type,
      bgValue: bg.value || '',
      customColor: bg.value || '#fff5f7',
      bgImage: bg.type === 'image' ? bg.value : ''
    }, () => {
      // 让本页自己也用上当前背景 + 主题色，所见即所得
      applyBg(this)
    })
  },

  pickPreset(e) {
    const v = e.currentTarget.dataset.v
    setPageBg({ type: 'color', value: v })
    this.setData({ bgType: 'color', bgValue: v, customColor: v, bgImage: '' })
    applyBg(this)
    wx.showToast({ title: '已应用 🎨', icon: 'none' })
  },

  onColorInput(e) {
    this.setData({ customColor: e.detail.value })
  },

  applyCustomColor() {
    if (!/^#[0-9a-fA-F]{6}$/.test(this.data.customColor)) {
      wx.showToast({ title: '请输入正确的颜色值', icon: 'none' })
      return
    }
    setPageBg({ type: 'color', value: this.data.customColor })
    this.setData({ bgType: 'color', bgValue: this.data.customColor, bgImage: '' })
    applyBg(this)
    wx.showToast({ title: '已应用 🎨', icon: 'none' })
  },

  /**
   * 选择本地图片 → 保存到本地永久目录 (wx.env.USER_DATA_PATH/bg_imgs/...)
   * 这样保存后的路径是 wxfile://.../bg_imgs/bg_<ts>_<rand>.<ext>
   * 既能在 CSS background-image: url() 里渲染，又能跨页面持久化
   */
  chooseImage() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sizeType: ['original', 'compressed'],  // 用户可选压缩图，省本地空间
      sourceType: ['album', 'camera'],
      success: res => {
        const tempPath = res.tempFiles[0].tempFilePath
        // 先用临时路径预览，避免保存过程中一片空白
        this.setData({ uploading: true })
        this._saveLocal(tempPath)
      },
      fail: err => {
        // 用户取消选图时不弹错
        if (err && err.errMsg && /cancel/.test(err.errMsg)) return
        wx.showToast({ title: '选图失败', icon: 'none' })
      }
    })
  },

  /** 把临时文件保存到 USER_DATA_PATH/bg_imgs/，失败重试一次，再失败才放弃 */
  _saveLocal(tempPath, retry = 0) {
    ensureDir()
    const fs = wx.getFileSystemManager()
    const m = (tempPath || '').match(/\.\w+$/)
    const ext = m ? m[0] : '.jpg'
    const fileName = `bg_${Date.now()}_${Math.floor(Math.random() * 10000)}${ext}`
    const savedPath = `${LOCAL_DIR}/${fileName}`

    fs.saveFile({
      tempFilePath: tempPath,
      filePath: savedPath,
      success: () => {
        setPageBg({ type: 'image', value: savedPath })
        this.setData({
          bgType: 'image',
          bgValue: savedPath,
          bgImage: savedPath,
          uploading: false
        }, () => applyBg(this))
        wx.showToast({ title: '已应用 🖼', icon: 'success' })
      },
      fail: err => {
        console.warn('[bg] saveFile fail', err)
        if (retry < 1) {
          // 重试一次（曾经遇到过偶发的 accessSync 缓存问题，重试就好）
          return this._saveLocal(tempPath, retry + 1)
        }
        this.setData({ uploading: false })
        wx.showModal({
          title: '保存失败',
          content: '本地保存图片失败，是否重试？\n\n错误信息：' + (err && err.errMsg ? err.errMsg : '未知错误'),
          confirmText: '重试',
          cancelText: '取消',
          confirmColor: getAccent(),
          success: r => {
            if (r.confirm) {
              this.setData({ uploading: true })
              this._saveLocal(tempPath, 0)
            }
          }
        })
      }
    })
  },

  reset() {
    wx.showModal({
      title: '恢复默认背景',
      content: '确定恢复为系统默认背景吗？',
      confirmColor: getAccent(),
      success: res => {
        if (res.confirm) {
          clearPageBg()
          this.setData({
            bgType: 'default',
            bgValue: '',
            bgImage: '',
            customColor: '#fff5f7'
          }, () => applyBg(this))
          wx.showToast({ title: '已恢复默认', icon: 'success' })
        }
      }
    })
  }
})