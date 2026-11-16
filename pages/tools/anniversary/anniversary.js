// pages/tools/anniversary/anniversary.js 纪念日提醒
//
// 【核心概念：周期】
//   一条纪念日 = 起始日期 + 重复规则（year 每年 / month 每月 / day 每 N 天）
//   页面要展示的不是"起始日期"，而是"下一次是哪天、还有几天"，
//   这一步交给 utils/util.js 的 nextCycleDate() 算，本文件只负责取用和展示。
//
// 【数据结构】
//   anniv_list: [{ id, title, date:'YYYY-MM-DD', cycle:'year'|'month'|'day', interval? }]
//   interval 只在 cycle === 'day' 时存在
const {getTheme, getAccent} = require('../../../utils/theme')
const { applyBg } = require('../../../utils/bg')
const { today, daysBetween, uid, nextCycleDate } = require('../../../utils/util')

const KEY = 'anniv_list'

/**
 * 规则文字：每年 05-20 / 每月 20 日 / 每 100 天一次
 * slice(5)     取 'YYYY-MM-DD' 里的 'MM-DD'
 * slice(8, 10) 取 'DD'
 */
function ruleText(item) {
  if (item.cycle === 'day') return `每 ${Math.max(1, Number(item.interval) || 1)} 天一次`
  if (item.cycle === 'month') return `每月 ${Number(item.date.slice(8, 10))} 日`
  return `每年 ${item.date.slice(5)}`
}

Page({
  data: {
    theme: 'theme-light',
    bgStyle: '',
    list: [],      // [{id, title, date, cycle, interval, days, isToday, ruleText, totalDays}]
    title: '',
    date: '',
    cycle: 'year',    // year 每年 / month 每月 / day 每 N 天
    interval: '100',  // 按天提醒时的间隔天数
    editingId: ''     // 非空表示正在编辑某条
  },

  onShow() {
    this.setData({ theme: getTheme() })
    applyBg(this)
    this.load()
  },

  /**
   * 读缓存 → 逐个算"下次是哪天、还有几天" → 按天数从近到远排序
   * 用 map + sort 的链式写法：每一步都返回新数组，不修改缓存里的原始数据
   */
  load() {
    const t = today()
    const list = (wx.getStorageSync(KEY) || [])
      .filter(a => a && a.date)                        // 过滤掉历史脏数据（没有日期的）
      .map(a => {
        // cycle 是后加的字段，老数据可能没有，默认按"每年"处理
        const item = Object.assign({}, a, { cycle: a.cycle || 'year' })
        const next = nextCycleDate(item.date, item.cycle, item.interval, t)  // 下次日期
        const days = daysBetween(t, next)                                    // 还有几天
        return Object.assign(item, {
          ruleText: ruleText(item),   // "每年 05-20" 这种说明文字
          days,
          isToday: days === 0,        // 今天就是 → 卡片高亮
          totalDays: daysBetween(item.date, t)  // 从起始日到今天一共多少天（第 N 天）
        })
      })
      .sort((a, b) => a.days - b.days)                 // 越近的排前面

    this.setData({ list })
  },

  onTitle(e) {
    this.setData({ title: e.detail.value })
  },

  onDate(e) {
    this.setData({ date: e.detail.value })
  },

  /** 选择提醒单位：每年 / 每月 / 每 N 天 */
  onCycle(e) {
    this.setData({ cycle: e.currentTarget.dataset.k })
  },

  onInterval(e) {
    this.setData({ interval: e.detail.value })
  },

  /** 长按：编辑或删除 */
  onItemLongPress(e) {
    const id = e.currentTarget.dataset.id
    wx.showActionSheet({
      itemList: ['编辑', '删除'],
      success: res => {
        if (res.tapIndex === 0) this.startEdit(id)
        else if (res.tapIndex === 1) this.del(id)
      }
    })
  },

  /** 把某条纪念日回填到顶部表单 */
  startEdit(id) {
    const item = this.data.list.find(a => a.id === id)
    if (!item) return
    this.setData({
      editingId: id,
      title: item.title || '',
      date: item.date || '',
      cycle: item.cycle || 'year',
      interval: String(item.interval || 100)
    })
    wx.pageScrollTo({ scrollTop: 0, duration: 300 })
  },

  cancelEdit() {
    this.setData({ editingId: '', title: '', date: '' })
  },

  /** 添加 / 保存修改 */
  add() {
    const title = this.data.title.trim()
    if (!title) {
      wx.showToast({ title: '给日子起个名字吧～', icon: 'none' })
      return
    }
    if (!this.data.date) {
      wx.showToast({ title: '请选择日期', icon: 'none' })
      return
    }

    // 只有"每 N 天"才需要间隔；校验必须是正整数（小数、0、负数都不合法）
    const cycle = this.data.cycle
    let interval = 0
    if (cycle === 'day') {
      interval = Number(this.data.interval)
      if (!interval || interval < 1 || interval % 1 !== 0) {
        wx.showToast({ title: '间隔天数要填正整数哦', icon: 'none' })
        return
      }
    }

    const list = wx.getStorageSync(KEY) || []
    const editingId = this.data.editingId

    // 编辑模式：直接改内存里的对象，再把整个数组写回缓存
    if (editingId) {
      const target = list.find(a => a.id === editingId)
      if (target) {
        target.title = title
        target.date = this.data.date
        target.cycle = cycle
        // 从"每 N 天"改成"每年"时，要清掉不再需要的 interval，避免脏字段
        if (cycle === 'day') target.interval = interval
        else delete target.interval
      }
    } else {
      const item = { id: uid(), title, date: this.data.date, cycle }
      if (cycle === 'day') item.interval = interval
      list.push(item)
    }

    wx.setStorageSync(KEY, list)
    this.setData({ editingId: '', title: '', date: '' })
    wx.showToast({ title: editingId ? '已保存修改 ✅' : '已添加 🎂', icon: 'none' })
    this.load()
  },

  /** 删除（二次确认） */
  del(id) {
    wx.showModal({
      title: '删除纪念日',
      content: '确定删除这个纪念日吗？',
      confirmColor: getAccent(),
      success: res => {
        if (!res.confirm) return
        const list = (wx.getStorageSync(KEY) || []).filter(a => a.id !== id)
        wx.setStorageSync(KEY, list)
        if (this.data.editingId === id) this.cancelEdit()
        this.load()
      }
    })
  }
})
