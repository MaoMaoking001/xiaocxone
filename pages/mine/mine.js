// pages/mine/mine.js 个人中心（tabBar 第 4 个页面）
//
// 【这个页面干什么】
//   资料展示 / 字号切换 / 深浅主题切换 / 关于·隐私·版权 / 清理缓存 /
//   数据备份与恢复 / 意见反馈 / 分享
//
// 【备份恢复的原理（老师最爱问）】
//   wx.getStorageInfoSync().keys 能拿到本机所有缓存的键名，
//   把每个键的值读出来拼成一个对象，JSON.stringify 成字符串复制到剪贴板 —— 这就是"导出"。
//   恢复则相反：从剪贴板读字符串 → JSON.parse → 逐键写回 storage。
//   所以它不需要服务器，但依赖用户自己保存那段文本。
const {getTheme, toggleTheme, getThemeAccent, applyGlobalColor} = require('../../utils/theme')
const { applyBg } = require('../../utils/bg')
const { FONT_OPTIONS, getFontScale, setFontScale } = require('../../utils/font')

// 开发者接收反馈的邮箱（意见反馈 / 联系开发者都走这个邮箱）
const DEV_EMAIL = '3475435929@qq.com'


// 版本号按需求固定为 1.0.0.0，后续迭代也不再改动
const APP_VERSION = '1.0.0.0'

Page({
  data: {
    theme: 'theme-light',
    bgStyle: '',
    accentStyle: '',
    accent: '#ff8fab',
    isDark: false,
    version: APP_VERSION,
    userInfo: {
      avatarUrl: '',
      nickname: '',
      gender: 0,
      birthday: '',
      region: '',
      signature: ''
    },
    genderText: '未设置',
    fontOptions: FONT_OPTIONS,   // 字体大小档位
    fontScale: 1
  },

  onShow() {
    this.setData({
      theme: getTheme(),
      isDark: getTheme() === 'theme-dark',
      fontScale: getFontScale()
    })
    applyBg(this)
    this.loadUserInfo()
  },

  /** 切换字号：写入本地后重新注入 --fs，整页文字立刻变化 */
  changeFont(e) {
    const size = Number(e.currentTarget.dataset.size)
    if (size === this.data.fontScale) return
    setFontScale(size)
    this.setData({ fontScale: size })
    applyBg(this)
    const name = (FONT_OPTIONS.find(o => o.key === size) || {}).name || '标准'
    wx.showToast({ title: '字体已设为「' + name + '」', icon: 'none' })
  },

  loadUserInfo() {
    const saved = wx.getStorageSync('userInfo');
    const genderOptions = ['未设置', '男', '女'];
    if (saved && typeof saved === 'object') {
      this.setData({
        userInfo: Object.assign({}, this.data.userInfo, saved),
        genderText: genderOptions[saved.gender || 0]
      });
    }
  },

  goEdit() { wx.navigateTo({ url: '/pages/profile/edit/edit' }) },
  goGame() { wx.switchTab({ url: '/pages/game/game' }) },
  goBg() { wx.navigateTo({ url: '/pages/profile/bg/bg' }) },

  onThemeChange(e) {
    const theme = toggleTheme()
    this.setData({ theme, isDark: theme === 'theme-dark' })
    // 切换后要立刻重算主题色（浅色粉 / 深色紫）并刷新导航栏、tabBar
    applyBg(this)
    applyGlobalColor()
    wx.showToast({
      title: theme === 'theme-dark' ? '已切换深色模式 🌙' : '已切换浅色模式 ☀️',
      icon: 'none'
    })
  },

  /** 关于小程序：文案精简 + 用 \n 手动分段，弹窗里能一行一行看 */
  showAbout() {
    wx.showModal({
      title: '🐰 关于记忆收纳管家',
      content: `版本 v${APP_VERSION}` +
        '\n\n📦 六个实用小工具' +
        '\n收纳 · 待办 · 打卡' +
        '\n备忘心情 · 纪念日 · 单词' +
        '\n\n💡 使用提示' +
        '\n长按首页卡片（或点「⇅ 排序」）可排序、加小组件、隐藏工具' +
        '\n物品收纳支持单条 / 批量添加，可按位置或类型筛选' +
        '\n首页「待开发工具」想加什么功能，欢迎在「联系开发者」留言' +
        '\n\n🔒 数据说明' +
        '\n物品存云端（仅自己可见），其余数据存本机' +
        '\n\n记录每一件小事，让生活井井有条 🌷',
      showCancel: false,
      confirmText: '知道啦',
      confirmColor: getThemeAccent()
    })
  },

  showPrivacy() {
    wx.showModal({
      title: '🔒 隐私说明',
      content: '1. 物品收纳数据存于云端，仅你自己可见可改；\n2. 个人信息、待办、备忘录（含心情打卡）、单词记录等本地数据仅保存在你的手机本地，不上传服务器；\n3. 清除缓存后本地数据无法恢复，请先到「数据备份与恢复」里备份；\n4. 本小程序不会收集你的任何隐私信息，请放心使用。',
      showCancel: false,
      confirmText: '知道了',
      confirmColor: getThemeAccent()
    })
  },

  /**
   * 清除本地缓存
   * wx.clearStorageSync() 会把所有键一次清空，包括用户辛苦设置的深色主题，
   * 所以先备份 theme / page_bg 两个键，清完再写回去 —— 用户感觉"只清了数据，没清设置"
   */
  clearCache() {
    wx.showModal({
      title: '提示',
      content: '确定清除全部本地数据吗？\n（个人信息、待办、备忘录、心情等本地记录会被删除；物品收纳的云端数据不受影响；已设置的自定义背景也会恢复默认）\n\n建议先在「数据备份与恢复」里导出备份再清～',
      confirmColor: getThemeAccent(),
      success: res => {
        if (res.confirm) {
          const theme = wx.getStorageSync('theme')      // 先存下来
          const pageBg = wx.getStorageSync('page_bg')
          wx.clearStorageSync()                         // 全清
          if (theme) wx.setStorageSync('theme', theme)  // 再写回
          if (pageBg) wx.setStorageSync('page_bg', pageBg)
          this.setData({
            userInfo: { avatarUrl: '', nickname: '', gender: 0, birthday: '', region: '', signature: '' },
            genderText: '未设置'
          });
          wx.showToast({ title: '已清除', icon: 'success' });
        }
      }
    });
  },

  /** 6. 数据备份与恢复 */
  showBackup() {
    wx.showActionSheet({
      itemList: ['📤 导出备份（复制到剪贴板）', '📥 导入恢复（从剪贴板）'],
      success: res => {
        if (res.tapIndex === 0) this.exportBackup()
        else if (res.tapIndex === 1) this.importBackup()
      },
      fail: () => {}
    })
  },

  /** 导出：把所有 storage 序列化成 JSON 复制到剪贴板 */
  exportBackup() {
    // getStorageInfoSync 返回 { keys: [...], currentSize, limitSize }
    const allKeys = wx.getStorageInfoSync().keys
    if (!allKeys || allKeys.length === 0) {
      wx.showToast({ title: '暂无本地数据可备份', icon: 'none' })
      return
    }
    const data = {}
    allKeys.forEach(k => { data[k] = wx.getStorageSync(k) })  // 键名 → 值，拼成一个大对象
    const json = JSON.stringify(data)                          // 转字符串才能放剪贴板
    wx.setClipboardData({
      data: json,
      success: () => {
        wx.showModal({
          title: '✅ 备份已复制',
          content: `已备份 ${allKeys.length} 项数据到剪贴板。\n\n建议保存到微信收藏 / 备忘录 / 网盘等安全处。\n\n下次换手机或重装时，使用「导入恢复」粘贴即可。`,
          showCancel: false,
          confirmText: '知道了',
          confirmColor: getThemeAccent()
        })
      }
    })
  },

  /** 导入：从剪贴板读取 JSON，覆盖式恢复（带确认） */
  importBackup() {
    wx.getClipboardData({
      success: clip => {
        const text = (clip.data || '').trim()
        if (!text) {
          wx.showToast({ title: '剪贴板为空', icon: 'none' })
          return
        }
        // 必须先校验再写：剪贴板里可能是任意内容（用户随手复制的一句话），
        // 直接 parse 失败会报错；parse 出来是数组或 null 也不能用，所以三个条件一起判断
        let data
        try {
          data = JSON.parse(text)
          if (typeof data !== 'object' || Array.isArray(data) || data === null) throw 1
        } catch (e) {
          wx.showToast({ title: '剪贴板内容不是有效 JSON', icon: 'none' })
          return
        }
        const keys = Object.keys(data)
        wx.showModal({
          title: '⚠️ 确认覆盖',
          content: `剪贴板是有效备份，共 ${keys.length} 项数据。导入会覆盖当前所有本地数据，是否继续？\n\n建议先导出当前数据再做覆盖。`,
          confirmText: '确定覆盖',
          confirmColor: '#ff6f6f',
          success: r => {
            if (!r.confirm) return
            keys.forEach(k => wx.setStorageSync(k, data[k]))
            this.setData({
              theme: getTheme(),
              isDark: getTheme() === 'theme-dark'
            })
            applyBg(this)
            applyGlobalColor()
            this.loadUserInfo()
            wx.showToast({ title: '恢复成功 ✨', icon: 'success' })
          }
        })
      },
      fail: () => wx.showToast({ title: '读取剪贴板失败', icon: 'none' })
    })
  },

  /** 联系开发者 / 意见反馈：统一跳到自建反馈页（页内含开发者邮箱），提交后直达开发者邮箱 */
  goFeedback() {
    wx.navigateTo({ url: '/pages/profile/feedback/feedback' })
  },

  /** 版权声明 */
  showCopyright() {
    wx.showModal({
      title: '📜 版权声明',
      content: `© 2026 记忆收纳管家\n版本：v${APP_VERSION}\n开发者：🐰 毛毛小团队\n\n本小程序所有代码、设计、文案均为原创，仅供学习交流，未经授权请勿商用。\n\nEmoji 图标来自系统内置字体，遵循各平台许可协议。\n\n「记忆收纳管家」© 2026 All rights reserved.`,
      confirmText: '我知道了',
      confirmColor: getThemeAccent(),
      showCancel: false
    })
  },

  /** 10. 推荐给好友 —— 监听右上角菜单 + 推荐给好友按钮 */
  onShareAppMessage() {
    return {
      title: '🐰 记忆收纳管家 - 帮你记住每一件小事',
      path: '/pages/index/index'
    }
  }
})