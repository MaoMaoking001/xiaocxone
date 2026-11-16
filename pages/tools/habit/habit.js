// pages/tools/habit/habit.js 习惯打卡
//
// 【数据结构（设计上最巧的地方）】
//   一个习惯就是：{ id, name, icon, days: { '2026-11-16': true, '2026-11-15': true } }
//   days 用"日期字符串当键"的对象来存打卡记录，而不是数组：
//     · 判断某天有没有打卡 → days['2026-11-16']，O(1) 直接命中，不用遍历
//     · 天然去重：同一天点两次不会存两条
//     · 存储小：只存打过卡的日期，没打的不占空间
//
// 【连续天数怎么算】
//   calcStreak 从今天往前一天天查 days 里有没有，碰到空的就停 —— 见下面的函数
const {getTheme, getAccent} = require('../../../utils/theme')
const { applyBg } = require('../../../utils/bg')
const { today, fmtDate, uid } = require('../../../utils/util')

const KEY = 'habit_list'

// 新增习惯时可选的表情（下拉选择，index 存进 data.iconIndex）
const PRESET_ICONS = ['🌱', '💧', '📚', '🏃', '🌙', '🧘', '🎸', '🍎']

Page({
  data: {
    theme: 'theme-light',
    bgStyle: '',
    habits: [],      // [{id, name, icon, days: {'YYYY-MM-DD': true}}]
    name: '',
    icons: PRESET_ICONS,
    iconIndex: 0,
    today: today()
  },

  onShow() {
    this.setData({ theme: getTheme(), today: today() })
    applyBg(this)
    this.load()
  },

  load() {
    const habits = wx.getStorageSync(KEY) || []
    // 计算连续打卡天数
    habits.forEach(h => { h.streak = this.calcStreak(h) })
    this.setData({ habits })
  },

  /** 从今天往前数连续打卡天数（今天没打则从昨天算起） */
  calcStreak(h) {
    let streak = 0
    const d = new Date()
    if (!h.days[today()]) d.setDate(d.getDate() - 1) // 今天还没打，从昨天开始数
    while (true) {
      const key = fmtDate(d)
      if (h.days[key]) {
        streak++
        d.setDate(d.getDate() - 1)
      } else {
        break
      }
    }
    return streak
  },

  onName(e) {
    this.setData({ name: e.detail.value })
  },

  onIcon(e) {
    this.setData({ iconIndex: Number(e.detail.value) })
  },

  /** 添加习惯 */
  add() {
    const name = this.data.name.trim()
    if (!name) {
      wx.showToast({ title: '先写上习惯名称吧～', icon: 'none' })
      return
    }
    const habits = wx.getStorageSync(KEY) || []
    habits.push({
      id: uid(),
      name,
      icon: PRESET_ICONS[this.data.iconIndex],
      days: {}
    })
    wx.setStorageSync(KEY, habits)
    this.setData({ name: '' })
    wx.showToast({ title: '一起坚持吧 🌱' })
    this.load()
  },

  /**
   * 今日打卡 / 取消打卡（同一个按钮，点一下打、再点一下取消）
   * 直接操作缓存数组里的对象是可以的：因为整份数组随后会被 setStorageSync 写回，
   * 然后 load() 重新 setData，界面就更新了
   */
  checkIn(e) {
    const id = e.currentTarget.dataset.id
    const habits = wx.getStorageSync(KEY) || []
    const h = habits.find(x => x.id === id)   // 按 id 找到这个习惯
    if (!h) return
    const key = this.data.today                // 今天的 'YYYY-MM-DD'
    if (h.days[key]) delete h.days[key]        // 已经打过 → 取消（删掉这个键）
    else h.days[key] = true                    // 没打过 → 记上
    wx.setStorageSync(KEY, habits)
    this.load()                                // 重新算 streak 并渲染
  },

  /** 长按删除 */
  del(e) {
    const id = e.currentTarget.dataset.id
    wx.showModal({
      title: '删除习惯',
      content: '确定删除这个习惯及其打卡记录吗？',
      confirmColor: getAccent(),
      success: res => {
        if (res.confirm) {
          const habits = (wx.getStorageSync(KEY) || []).filter(h => h.id !== id)
          wx.setStorageSync(KEY, habits)
          this.load()
        }
      }
    })
  }
})
