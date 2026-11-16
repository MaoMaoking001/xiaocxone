// pages/games/shuertefangge/shuertefangge.js 舒尔特方格
// 【对应游戏大厅】⏱️「舒尔特方格」——玩法就是"按顺序点数字"，所以拼音用 shuertefangge
// 【目录名来历】改名前目录叫 schulte/
// 规则：按 1 → N 的顺序依次点击数字，用时越短越好，锻炼注意力与视觉广度
//
// 【排版修复】必须是正方形排版：
//   之前格子是"百分比宽度 + 固定高度"，3×3 时宽 ~220rpx、高只有 160rpx，明显是长方块。
//   现在每个格子用"宽度百分比 + 同值 padding-bottom"撑出正方形
//   （padding 百分比按容器宽度计算，所以宽高一定相等），
//   行与列用同样的百分比间距，整个棋盘也是严格的正方形。
const {getTheme, getAccent} = require('../../../utils/theme')
const { applyBg } = require('../../../utils/bg')

const SIZES = [3, 4, 5, 6]
const GAP_PCT = 2                       // 格子间距（占棋盘宽度的百分比）
const FONT = { 3: 58, 4: 46, 5: 38, 6: 30 }  // 每种规格的字号（rpx）

Page({
  data: {
    theme: 'theme-light',
    bgStyle: '',
    accentStyle: '',
    sizes: SIZES,
    size: 5,
    cells: [],
    rows: [],            // 按行渲染，保证每一行的格子宽度一致、棋盘整体正方形
    cellPct: 0,          // 单个格子占棋盘宽度的百分比（宽 = 高）
    gapPct: GAP_PCT,
    fontRpx: 38,
    next: 1,
    status: 'ready',      // ready / playing / win
    elapsed: 0,           // 毫秒
    secondsText: '0.0',
    wrong: 0,
    percent: 0,
    best: '--'
  },

  onLoad() {
    this.setData({ theme: getTheme() })
    applyBg(this)
    this.refreshBest()
  },

  onShow() {
    applyBg(this)
    if (this.data.status === 'playing') this._startTimer()
  },

  onHide() { this._stopTimer() },
  onUnload() { this._stopTimer() },

  refreshBest() {
    const best = wx.getStorageSync('schulte_best_' + this.data.size)
    this.setData({ best: best ? (best / 1000).toFixed(1) + 's' : '--' })
  },

  setSize(e) {
    const n = Number(e.currentTarget.dataset.n)
    this.setData({ size: n })
    this.refreshBest()
    if (this.data.status === 'playing') this.start()
  },

  /**
   * 开始一局：造一个 1..N² 的顺序数组 → 打乱 → 铺进网格
   *
   * 洗牌用的是 Fisher-Yates 算法（比 sort 随机更均匀）：
   *   从最后一个位置开始，随机挑一个前面的位置和它交换，
   *   一步步把前面也打乱，最终每个排列出现概率相同。
   *
   * cellPct 是每个格子的宽度百分比：
   *   (100 - 间距总宽) / 格子数，例如 5×5、间距 2%：(100-8)/5 = 18.4%
   *   高度由 wxss 的 padding-bottom 撑成同比例 → 正方形
   */
  start() {
    const n = this.data.size
    const total = n * n
    const arr = []
    for (let i = 1; i <= total; i++) arr.push(i)
    // Fisher-Yates 洗牌：从后往前，每个位置和它前面的随机一个位置交换
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))   // 0..i 之间随机
      const t = arr[i]; arr[i] = arr[j]; arr[j] = t   // 交换（不用解构，老引擎更稳）
    }
    // done：是否已点过（点过的数字会变灰），idx：在一维数组里的位置
    const cells = arr.map((num, i) => ({ num, done: false, key: i, idx: i }))

    this._stopTimer()
    this.setData({
      cells,
      rows: buildRows(cells, n),
      cellPct: +((100 - (n - 1) * GAP_PCT) / n).toFixed(3),
      fontRpx: FONT[n] || 32,
      next: 1,
      status: 'playing',
      elapsed: 0,
      secondsText: '0.0',
      wrong: 0,
      percent: 0
    })
    this._startTimer()
  },

  _startTimer() {
    this._stopTimer()
    this._begin = Date.now() - this.data.elapsed
    this._timer = setInterval(() => {
      const elapsed = Date.now() - this._begin
      this.setData({ elapsed, secondsText: (elapsed / 1000).toFixed(1) })
    }, 100)
  },

  _stopTimer() {
    if (this._timer) { clearInterval(this._timer); this._timer = null }
  },

  tap(e) {
    if (this.data.status !== 'playing') return
    const idx = Number(e.currentTarget.dataset.idx)
    const num = Number(e.currentTarget.dataset.num)
    if (num !== this.data.next) {
      this.setData({ wrong: this.data.wrong + 1 })
      wx.vibrateShort({ type: 'heavy' })
      wx.showToast({ title: '顺序不对，下一个是 ' + this.data.next, icon: 'none', duration: 800 })
      return
    }
    const total = this.data.size * this.data.size
    const n = this.data.size
    const r = Math.floor(idx / n)
    const c = idx % n
    this.setData({
      ['cells[' + idx + '].done']: true,
      ['rows[' + r + '].list[' + c + '].done']: true,
      next: this.data.next + 1,
      percent: Math.round((num / total) * 100)
    })
    if (num === total) this._win()
  },

  _win() {
    this._stopTimer()
    const ms = this.data.elapsed
    const key = 'schulte_best_' + this.data.size
    const prev = wx.getStorageSync(key)
    const isNew = !prev || ms < prev
    if (isNew) wx.setStorageSync(key, ms)
    this.setData({ status: 'win' })
    this.refreshBest()
    wx.vibrateShort({ type: 'medium' })
    wx.showModal({
      title: '🎉 完成！',
      content: `${this.data.size}×${this.data.size} 方格用时 ${(ms / 1000).toFixed(1)} 秒\n点错 ${this.data.wrong} 次${isNew ? '\n🏆 新纪录！' : ''}`,
      confirmText: '再来一次',
      cancelText: '返回',
      confirmColor: getAccent(),
      success: res => {
        if (res.confirm) this.start()
        else wx.navigateBack()
      }
    })
  }
})

/** 一维数组 -> 按行分组 */
function buildRows(cells, n) {
  const rows = []
  for (let r = 0; r < n; r++) {
    rows.push({ key: r, list: cells.slice(r * n, r * n + n) })
  }
  return rows
}
