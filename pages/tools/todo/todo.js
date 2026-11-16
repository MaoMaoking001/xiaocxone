// pages/tools/todo/todo.js 待办清单
//
// 【这是全项目最适合入门的页面，数据流只有一条线】
//   wx.getStorageSync('todo_list')  →  this.data.list  →  wxml 用 wx:for 渲染
//   用户操作（添加 / 勾选 / 删除）→ 改数组 → setStorageSync 存回去 → load() 重新渲染
//
// 【一条待办长什么样】
//   { id, title, deadline:'YYYY-MM-DD', deadlineTime:'HH:mm', done:false, createTime:'...' }
//   overdue（是否逾期）不进缓存，每次 load 时临时算出来，避免"昨天算的结果今天还在用"
//
// 【注意】所有"修改"都走 this.save(list)：先写缓存再 load，
//   保证内存（data）和缓存永远是同一份数据，不会出现刷新后数据回退
const {getTheme, getAccent} = require('../../../utils/theme')
const { applyBg } = require('../../../utils/bg')
const { today, formatTime, uid, nowHm } = require('../../../utils/util')

const KEY = 'todo_list'   // 本地缓存键名：所有待办都存在这一个数组里

/**
 * 截止时间戳：只选日期（没选几点）时按当天 23:59 算
 *
 * 为什么要把 '-' 换成 '/'：iOS 不认 '2026-11-16 23:59:00' 这种格式，
 * new Date() 会返回 Invalid Date，换成 '2026/11/16 23:59:00' 才通用
 *
 * @param {string} date 'YYYY-MM-DD'，空表示不设截止
 * @param {string} time 'HH:mm'，空则默认 23:59
 * @return {number} 毫秒时间戳；解析失败返回 0（表示"没有截止时间"）
 */
function deadlineTs(date, time) {
  if (!date) return 0
  const d = new Date(`${date.replace(/-/g, '/')} ${time || '23:59'}:00`)
  const ts = d.getTime()
  return isNaN(ts) ? 0 : ts
}

Page({
  data: {
    theme: 'theme-light',
    bgStyle: '',
    list: [],        // [{id, title, deadline, deadlineTime, done, createTime}]
    title: '',
    deadlineDate: '',   // 截止日期 YYYY-MM-DD
    deadlineLabel: '',  // 表单里显示用的 MM-DD
    deadlineTime: '',   // 截止时刻 HH:mm（选填）
    nowHm: nowHm(),
    today: today()
  },

  onShow() {
    this.setData({ theme: getTheme(), nowHm: nowHm(), today: today() })
    applyBg(this)
    this.load()
  },

  /**
   * 读缓存 → 给每条算出 overdue → 交给视图渲染
   * 用 Object.assign({}, t, {...}) 复制一份再加字段：
   *   直接改缓存里的对象不会触发界面更新，而且会把多余字段写回存储
   */
  load() {
    const now = Date.now()
    const list = (wx.getStorageSync(KEY) || []).map(t => {
      const ts = deadlineTs(t.deadline, t.deadlineTime)
      // 逾期 = 未完成 且 有截止时间 且 已经过了那个时间
      return Object.assign({}, t, { overdue: !t.done && ts > 0 && ts < now })
    })
    this.setData({ list })
  },

  /** 统一出口：先写缓存，再重新加载（保证数据和界面同步） */
  save(list) {
    wx.setStorageSync(KEY, list)
    this.load()
  },

  onTitle(e) {
    this.setData({ title: e.detail.value })
  },

  /** 先选哪天截止 */
  onDeadlineDate(e) {
    const v = e.detail.value
    this.setData({ deadlineDate: v, deadlineLabel: v ? v.slice(5) : '' })
  },

  /** 再选几点几分（选填，不选就是当天内；没选日期时默认今天） */
  onDeadlineTime(e) {
    const patch = { deadlineTime: e.detail.value }
    if (!this.data.deadlineDate) {
      patch.deadlineDate = this.data.today
      patch.deadlineLabel = this.data.today.slice(5)
    }
    this.setData(patch)
  },

  /** 添加任务 */
  add() {
    const title = this.data.title.trim()
    if (!title) {
      wx.showToast({ title: '先写点什么吧～', icon: 'none' })
      return
    }
    const list = wx.getStorageSync(KEY) || []
    list.push({
      id: uid(),
      title,
      deadline: this.data.deadlineDate,
      deadlineTime: this.data.deadlineTime,
      done: false,
      createTime: formatTime(new Date())
    })
    this.save(list)
    this.setData({
      title: '',
      deadlineDate: '',
      deadlineLabel: '',
      deadlineTime: ''
    })
    wx.showToast({ title: '已添加 ✅' })
  },

  /**
   * 勾选完成 / 取消完成
   * 用 map 生成新数组：命中的那条复制并取反 done，其它条目原样保留。
   * 这种"不改原对象、只造新对象"的写法是前端状态管理的通用习惯（叫不可变更新），
   * 配合 setData 才能可靠地触发重新渲染
   */
  toggle(e) {
    const id = e.currentTarget.dataset.id
    const list = this.data.list.map(t => t.id === id
      ? Object.assign({}, t, { done: !t.done })
      : t)
    this.save(list)
  },

  /** 删除（长按） */
  del(e) {
    const id = e.currentTarget.dataset.id
    wx.showModal({
      title: '删除任务',
      content: '确定删除这条待办吗？',
      confirmColor: getAccent(),
      success: res => {
        if (res.confirm) {
          this.save(this.data.list.filter(t => t.id !== id))
        }
      }
    })
  }
})
