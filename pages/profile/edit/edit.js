// pages/profile/edit/edit.js 编辑个人信息
//
// 【头像和昵称怎么拿的（微信 2022 年后的新规范）】
//   不能再直接调用 getUserProfile 拿昵称头像了，必须用"用户主动填写"的组件：
//     <button open-type="chooseAvatar" bindchooseavatar="onChooseAvatar"> 选头像
//     <input type="nickname" bindinput="onNicknameChange">               填昵称
//   事件里拿到的 avatarUrl 是一个"临时路径"，本页只是记录下来，
//   真要长期保存得上传到云存储换成 fileID（本项目为了简单只存本地）。
//
// 【数据存哪】
//   全部塞进 wx.setStorageSync('userInfo', {...})，不上云、不需要登录。
//   代价是换手机就没了 —— 靠「我的 → 数据备份」把整份缓存导出带走。
//
// 【setData 的写法】
//   'userInfo.nickname' 这种"点路径"只更新嵌套对象的一个字段，
//   不会把整个 userInfo 覆盖掉（写错的话其他字段会一起丢）
const { getTheme } = require('../../../utils/theme')
const { applyBg } = require('../../../utils/bg')

Page({
  data: {
    theme: 'theme-light',
    userInfo: {
      avatarUrl: '',
      nickname: '',
      gender: 0, // 0未知 1男 2女
      birthday: '',
      region: '',
      signature: ''
    },
    genderOptions: ['未设置', '男', '女']
  },

  onLoad() {
    this.setData({ theme: getTheme() })
    applyBg(this)
    const saved = wx.getStorageSync('userInfo')
    if (saved && typeof saved === 'object') {
      this.setData({ userInfo: Object.assign({}, this.data.userInfo, saved) })
    }
  },

  /** 选择头像（微信原生头像选择） */
  onChooseAvatar(e) {
    const avatarUrl = e.detail.avatarUrl
    if (!avatarUrl) return
    this.setData({ 'userInfo.avatarUrl': avatarUrl })
  },

  /** 昵称输入 */
  onNicknameChange(e) {
    this.setData({ 'userInfo.nickname': e.detail.value })
  },

  /** 性别选择 */
  onGenderChange(e) {
    this.setData({ 'userInfo.gender': Number(e.detail.value) })
  },

  /** 生日选择 */
  onBirthdayChange(e) {
    this.setData({ 'userInfo.birthday': e.detail.value })
  },

  /** 地区选择 */
  onRegionChange(e) {
    this.setData({ 'userInfo.region': e.detail.value.join(' ') })
  },

  /** 签名输入 */
  onSignatureChange(e) {
    this.setData({ 'userInfo.signature': e.detail.value })
  },

  /** 保存 */
  save() {
    const info = this.data.userInfo
    if (info.nickname && !info.nickname.trim()) {
      wx.showToast({ title: '昵称不能是空白哦', icon: 'none' })
      return
    }
    wx.setStorageSync('userInfo', {
      avatarUrl: info.avatarUrl || '',
      nickname: (info.nickname || '').trim(),
      gender: info.gender || 0,
      birthday: info.birthday || '',
      region: info.region || '',
      signature: (info.signature || '').trim()
    })
    wx.showToast({ title: '保存成功', icon: 'success' })
    setTimeout(() => wx.navigateBack(), 800)
  }
})
