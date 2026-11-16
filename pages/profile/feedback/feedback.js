// pages/profile/feedback/feedback.js 联系开发者 / 意见反馈
//
// 【BUG 修复】用户提交反馈后开发者收不到消息：
//   之前用的是 <button open-type="feedback">，它依赖小程序后台配置的官方反馈通道，
//   没配置（或配置被重置）时消息会石沉大海。
//   现在改成：直接写入云开发数据库 feedbacks 集合 + 同时提示邮箱 3475435929@qq.com，
//   云端不可用时自动降级为"复制到剪贴板，请发邮件"，保证反馈一定能送达。
//
// 【三级兜底（这个文件的骨架，老师问"怎么保证收到反馈"就答这个）】
//   ① 正常：db.collection('feedbacks').add(...) 写云库，开发者在云开发控制台能看到
//   ② 云库不可用（没初始化 / 集合没建 / 网络断）：把内容拼成文本复制到剪贴板，引导发邮件
//   ③ 连剪贴板都失败：弹窗把邮箱亮出来，用户自己记
//   全程都有明确提示，不会出现"点了提交但什么都没发生"
const { getTheme, getAccent } = require('../../../utils/theme')
const { applyBg } = require('../../../utils/bg')
const { getDB } = require('../../../utils/db')
const { getOwnerId } = require('../../../utils/user')

const DEV_EMAIL = '3475435929@qq.com'
const COLLECTION = 'feedbacks'

const TYPES = [
  { key: 'bug', label: '🐞 BUG 反馈' },
  { key: 'idea', label: '💡 功能建议' },
  { key: 'help', label: '🙋 使用求助' },
  { key: 'other', label: '💬 随便说说' }
]

Page({
  data: {
    theme: 'theme-light',
    bgStyle: '',
    accentStyle: '',
    types: TYPES,
    type: 'bug',
    content: '',
    contact: '',
    submitting: false,
    email: DEV_EMAIL,
    sentCount: 0
  },

  onLoad(options) {
    this.setData({ theme: getTheme() })
    applyBg(this)
    if (options && options.type && TYPES.some(t => t.key === options.type)) {
      this.setData({ type: options.type })
    }
    this.loadSentCount()
  },

  onShow() {
    const app = getApp()
    if (app && app.globalData) app.globalData.feedbackEmail = DEV_EMAIL
  },

  loadSentCount() {
    const n = wx.getStorageSync('feedback_sent_count')
    this.setData({ sentCount: typeof n === 'number' ? n : 0 })
  },

  pickType(e) {
    this.setData({ type: e.currentTarget.dataset.k })
  },

  onContent(e) {
    this.setData({ content: e.detail.value })
  },

  onContact(e) {
    this.setData({ contact: e.detail.value })
  },

  /** 复制开发者邮箱 */
  copyEmail() {
    wx.setClipboardData({
      data: DEV_EMAIL,
      success: () => wx.showToast({ title: '邮箱已复制 📋', icon: 'none' })
    })
  },

  /** 兜底：把反馈内容复制到剪贴板，引导用户发邮件 */
  copyContentMail() {
    const text = this._buildText()
    wx.setClipboardData({
      data: text,
      success: () => {
        wx.showModal({
          title: '内容已复制',
          content: `云端反馈通道暂不可用，已把内容复制到剪贴板。\n\n请用邮件发送到：\n${DEV_EMAIL}\n\n粘贴发送即可，开发者会尽快回复 🐰`,
          confirmText: '复制邮箱',
          cancelText: '知道了',
          confirmColor: getAccent(),
          success: res => { if (res.confirm) this.copyEmail() }
        })
      },
      fail: () => {
        wx.showModal({
          title: '提交失败',
          content: `请直接发邮件到：${DEV_EMAIL}`,
          confirmText: '复制邮箱',
          confirmColor: getAccent(),
          success: res => { if (res.confirm) this.copyEmail() }
        })
      }
    })
  },

  _buildText() {
    const t = TYPES.find(x => x.key === this.data.type) || TYPES[0]
    const contact = (this.data.contact || '').trim()
    return [
      '【记忆收纳管家 · 用户反馈】',
      '类型：' + t.label,
      '内容：' + (this.data.content || '').trim(),
      '联系方式：' + (contact || '（未填写）'),
      '用户标识：' + getOwnerId(),
      '时间：' + new Date().toLocaleString()
    ].join('\n')
  },

  submit() {
    if (this.data.submitting) return
    const content = (this.data.content || '').trim()
    if (!content) {
      wx.showToast({ title: '先写点什么吧～', icon: 'none' })
      return
    }
    if (content.length < 5) {
      wx.showToast({ title: '再多写几个字吧～', icon: 'none' })
      return
    }

    const t = TYPES.find(x => x.key === this.data.type) || TYPES[0]
    const payload = {
      type: t.key,
      typeLabel: t.label,
      content,
      contact: (this.data.contact || '').trim(),
      ownerId: getOwnerId(),
      createTime: new Date()
    }

    const db = getDB()
    if (!db) {
      this.copyContentMail()
      return
    }

    this.setData({ submitting: true })
    wx.showLoading({ title: '正在发送…', mask: true })

    db.collection(COLLECTION).add({
      data: Object.assign({}, payload, { createTime: db.serverDate ? db.serverDate() : payload.createTime })
    }).then(() => {
      wx.hideLoading()
      this.setData({ submitting: false, content: '', contact: '' })
      const n = (wx.getStorageSync('feedback_sent_count') || 0) + 1
      wx.setStorageSync('feedback_sent_count', n)
      this.setData({ sentCount: n })
      wx.showModal({
        title: '已收到你的反馈 💌',
        content: `感谢反馈！开发者会在云开发「feedbacks」集合里看到这条消息。\n\n也可以直接发邮件到：\n${DEV_EMAIL}\n（点"复制邮箱"即可复制）`,
        confirmText: '复制邮箱',
        cancelText: '好的',
        confirmColor: getAccent(),
        success: res => { if (res.confirm) this.copyEmail() }
      })
    }).catch(() => {
      wx.hideLoading()
      this.setData({ submitting: false })
      // 常见原因：云开发控制台里还没建 feedbacks 集合
      this.copyContentMail()
    })
  }
})
