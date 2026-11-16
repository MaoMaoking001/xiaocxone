// pages/goodsRemind/goodsRemind.js 保质期提醒设置
//
// 【这个页面只做一件事】
//   改 utils/remind.js 里的那份配置（阈值 / 每天一次 / 免打扰 / 角标），
//   以及清空"忽略名单"。所有规则都写在模块里，这里不自己算日期，
//   否则设置页和列表页各算一套，迟早对不上。
const { getTheme, getAccent, getThemeAccent } = require('../../utils/theme')
const { applyBg } = require('../../utils/bg')
const remind = require('../../utils/remind')
const { getDB } = require('../../utils/db')        // 懒加载云数据库，拿不到返回 null
const { getOwnerIds } = require('../../utils/user') // 只查自己的物品，避免串号

Page({
  data: {
    theme: 'theme-light',
    bgStyle: '',
    accentStyle: '',
    accent: '#ff8fab',   // switch / slider 的选中色
    soonMin: remind.SOON_MIN,
    soonMax: remind.SOON_MAX,
    sliderBg: '#e3dbe0',   // 滑块未选中的轨道色（深色模式下要换深色）
    // soonDays 是"已保存的值"（绑给 slider），soonText 是拖动过程中实时显示的数字
    // 分开的原因是：bindchanging 里改 value 会让滑块在部分机型上"弹回去"
    soonDays: 30,
    soonText: 30,
    // 阈值对应的最晚到期日（如 2026-12-18）：光看"174 天"很难判断设得合不合适
    limitDate: '',
    // 常用档位：1~365 天靠手指拖到整数几乎不可能，点一下更准
    presets: [7, 15, 30, 60, 90, 180],
    defaultSoon: remind.DEFAULT_CFG.soonDays,   // "恢复默认"用
    dailyOnce: true,
    mute: false,
    badge: true,
    // 已忽略：mutedCount 是总数，mutedList 是带名称的明细（可逐条恢复）
    mutedCount: 0,
    mutedList: [],
    mutedTip: ''
  },

  onShow() {
    const theme = getTheme()
    this.setData({
      theme,
      accent: getThemeAccent(),
      // slider 的轨道色走属性而不是 CSS，深色模式得单独给一个
      sliderBg: theme === 'theme-dark' ? '#4a4150' : '#e3dbe0'
    })
    applyBg(this)
    this.sync()   // 每次进来都从缓存读一遍，保证显示的就是实际生效的
  },

  /** 把配置回填到界面，并顺带刷新忽略明细 */
  sync() {
    const cfg = remind.getConfig()
    this.setData({
      soonDays: cfg.soonDays,
      soonText: cfg.soonDays,
      limitDate: remind.soonLimit(cfg.soonDays),
      dailyOnce: cfg.dailyOnce,
      mute: cfg.mute,
      badge: cfg.badge,
      mutedCount: remind.getMutedIds().length
    })
    this.loadMuted()
  },

  /**
   * 已忽略明细：本地缓存只存了 id，名称和到期日要去云端补，
   * 否则用户只看到一个数字，根本不知道该恢复哪一件。
   * 查不到（物品被删 / 换了账号）的也照样列出来，给一条能清掉的出口。
   */
  loadMuted() {
    const ids = remind.getMutedIds()
    if (!ids.length) {
      this.setData({ mutedCount: 0, mutedList: [], mutedTip: '' })
      return Promise.resolve()
    }
    // 新忽略的 id 是 push 到末尾的，多了只取最近 50 条
    const want = ids.slice(-50)
    const db = getDB()
    if (!db) {
      this.setData({ mutedCount: ids.length, mutedList: [], mutedTip: '当前离线读不到物品名称，可先「全部恢复」' })
      return Promise.resolve()
    }
    const _ = db.command
    const owners = getOwnerIds()
    const where = _.and([
      { _id: _.in(want) },
      owners.length > 1 ? { ownerId: _.in(owners) } : { ownerId: owners[0] }
    ])
    return db.collection('goods').where(where)
      .field({ name: true, expiryDate: true, status: true })
      .limit(50)
      .get()
      .then(res => {
        const cfg = remind.getConfig()
        const rows = (res.data || []).map(it => {
          const st = remind.stateOf(it, cfg.soonDays)
          return {
            _id: it._id,
            name: it.name || '未命名',
            // 已用完 / 已送人的物品 stateOf 给的是 none，这时退回显示原始日期
            text: it.expiryDate ? (remind.textOf(st.status, st.days) || (it.expiryDate + ' 到期')) : '未填保质期',
            missing: false,
            _exp: it.expiryDate || '9999-99-99'
          }
        })
        const got = rows.map(x => x._id)
        want.forEach(id => {
          if (got.indexOf(id) === -1) {
            rows.push({ _id: id, name: '物品已不存在', text: '可能已被删除', missing: true, _exp: '9999-99-99' })
          }
        })
        // 越紧急越靠前，查不到的沉到最后
        rows.sort((a, b) => (a._exp < b._exp ? -1 : (a._exp > b._exp ? 1 : 0)))
        this.setData({
          mutedCount: ids.length,
          mutedList: rows,
          mutedTip: ids.length > want.length ? `只显示最近 ${want.length} 条` : ''
        })
      })
      .catch(() => {
        this.setData({ mutedCount: ids.length, mutedList: [], mutedTip: '读取失败，可以稍后重试，或直接全部恢复' })
      })
  },

  /** 单条恢复：只把这一件放回提醒，其它忽略记录不动 */
  restoreOne(e) {
    const id = e.currentTarget.dataset.id
    if (!id) return
    remind.unmuteItem(id)
    this.sync()
    wx.showToast({ title: '已恢复这一件的提醒', icon: 'none' })
  },

  /** 拖动滑块过程中只更新显示的数字，不写缓存（每帧写一遍没必要） */
  onSoonChanging(e) {
    const v = Number(e.detail.value)
    // 日期预览跟着动，用户能边拖边看到"到底提醒到哪一天"
    this.setData({ soonText: v, limitDate: remind.soonLimit(v) })
  },

  /** 松手才保存：此时才是用户真正选定的天数 */
  onSoonChange(e) {
    this._applySoon(Number(e.detail.value))
  },

  /** 滑块两侧的 − / ＋：1~365 的跨度用手指很难精确到某一天，点两下更快 */
  stepSoon(e) {
    const d = Number(e.currentTarget.dataset.d) || 0
    if (!d) return
    this._applySoon(this.data.soonDays + d)
  },

  /** 点常用档位：比拖滑块更容易停在 30 / 90 这种整数上 */
  pickSoon(e) {
    this._applySoon(Number(e.currentTarget.dataset.d))
  },

  /** 恢复默认阈值（只有改过才显示这个入口） */
  resetSoon() {
    this._applySoon(this.data.defaultSoon)
  },

  /** 保存阈值（remind.saveConfig 内部会夹到 1~365） */
  _applySoon(v) {
    const days = remind.saveConfig({ soonDays: v }).soonDays
    this.setData({
      soonDays: days,
      soonText: days,
      limitDate: remind.soonLimit(days)
    })
  },

  onDailyOnce(e) {
    const v = !!e.detail.value
    remind.saveConfig({ dailyOnce: v })
    this.setData({ dailyOnce: v })
  },

  onMute(e) {
    const v = !!e.detail.value
    remind.saveConfig({ mute: v })
    this.setData({ mute: v })
    if (v) wx.showToast({ title: '已开启免打扰，提醒卡和角标仍会显示', icon: 'none' })
  },

  onBadge(e) {
    const v = !!e.detail.value
    remind.saveConfig({ badge: v })
    this.setData({ badge: v })
  },

  /** 清空忽略名单：之前点过「忽略」的物品重新进入提醒 */
  clearMuted() {
    if (!this.data.mutedCount) {
      wx.showToast({ title: '还没有忽略过任何提醒', icon: 'none' })
      return
    }
    wx.showModal({
      title: '恢复全部提醒',
      content: `确定恢复这 ${this.data.mutedCount} 件物品的到期提醒吗？\n（只影响提醒，不会改动物品本身）`,
      confirmColor: getAccent(),
      confirmText: '恢复',
      success: res => {
        if (!res.confirm) return
        remind.clearMuted()
        this.sync()
        wx.showToast({ title: '已恢复' })
      }
    })
  }
})
