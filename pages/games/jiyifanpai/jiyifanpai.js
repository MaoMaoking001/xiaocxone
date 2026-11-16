// pages/games/jiyifanpai/jiyifanpai.js 记忆翻牌（多难度关卡 + 失败二选一）
// 【对应游戏大厅】🃏「记忆翻牌」——jiyifanpai 就是"记忆翻牌"的拼音
// 【目录名来历】改名前目录叫 flipcard/
//
// 规则：
//  - 一共 6 关，棋盘规格逐级变大：九宫格(3×3) → 十六宫格(4×4) → 二十五宫格(5×5)
//  - 宫格越大，牌越多、限时越紧、步数上限越苛刻，难度逐级提升
//  - 超时或步数用尽 = 本关失败，弹窗二选一：① 从这一关继续  ② 从头第一关开始
//  - 通关一关后倒计时 3 秒自动进入下一关（也可以点按钮立刻进入），全部通关后结算总分
//
// 【排版修复】格子必须等宽等高、棋盘必须是正方形：
//   之前用"百分比宽度 + 固定高度"，每个格子都不是正方形。
//   现在格子宽度用百分比 + 同一个百分比的 padding-bottom（宽 = 高），
//   行/列间距同比例，整个棋盘严格正方。
const {getTheme, getAccent} = require('../../../utils/theme')
const { applyBg } = require('../../../utils/bg')

const EMOJIS = ['🍓', '🐰', '🌸', '⭐', '🍰', '🎀', '🐱', '🌈', '🍋', '🌙', '🍭', '🐻']

// 关卡配置：cols × rows = 棋盘宫格数（9 / 16 / 25），难度逐级递增
const LEVELS = [
  { cols: 3, rows: 3, limit: 60,  maxMoves: 14, base: 300,  name: '第 1 关 · 九宫格' },
  { cols: 4, rows: 4, limit: 100, maxMoves: 26, base: 500,  name: '第 2 关 · 十六宫格' },
  { cols: 4, rows: 4, limit: 75,  maxMoves: 24, base: 700,  name: '第 3 关 · 十六宫格 · 限时' },
  { cols: 5, rows: 5, limit: 150, maxMoves: 42, base: 900,  name: '第 4 关 · 二十五宫格' },
  { cols: 5, rows: 5, limit: 120, maxMoves: 38, base: 1100, name: '第 5 关 · 二十五宫格 · 挑战' },
  { cols: 5, rows: 5, limit: 100, maxMoves: 34, base: 1300, name: '第 6 关 · 二十五宫格 · 终极' }
]

const GAP_PCT = 2                            // 格子间距（占棋盘宽度的百分比）
const FONT = { 3: 58, 4: 46, 5: 38, 6: 30 }  // 每种列数的字号（rpx）

Page({
  data: {
    theme: 'theme-light',
    bgStyle: '',
    accentStyle: '',
    cards: [],
    rows: [],            // 按行渲染（含补位空格），保证格子正方形、棋盘整体方形
    cellPct: 0,          // 单个格子占棋盘宽度的百分比（宽 = 高）
    gapPct: GAP_PCT,
    fontRpx: 38,
    openIdx: [],
    matchedCount: 0,
    moves: 0,
    seconds: 0,
    status: 'ready',     // ready / playing / clear / win / fail
    lock: false,
    // 关卡
    level: 0,            // 当前关卡下标
    levelName: '',
    levelTotal: LEVELS.length,
    boardSize: 0,        // 本关宫格数（9 / 16 / 25）
    limit: 0,
    remain: 0,
    maxMoves: 0,
    cols: 4,
    totalScore: 0,
    best: 0,
    // 过关面板（自动进入下一关）
    clearGain: 0,
    clearNext: 0,
    clearCountdown: 3,
    // 失败选择弹窗
    failChoice: false,
    failReason: ''
  },

  onLoad() {
    this.setData({
      theme: getTheme(),
      best: wx.getStorageSync('gameFlipBest') || 0,
      levelTotal: LEVELS.length
    })
    applyBg(this)
  },

  onShow() {
    if (this.data.status === 'playing') this._startTimer()
  },

  onHide() { this._stopTimer(); this._stopClearTick() },
  onUnload() { this._stopTimer(); this._stopClearTick() },

  /** 从头开始（第 1 关） */
  start() {
    this.setData({ totalScore: 0, level: 0 })
    this.startLevel(0)
  },

  /**
   * 开始指定关卡：造牌 → 洗牌 → 分组成行 → 重置计时和计分
   *
   * 造牌逻辑（重点看这段）：
   *   total = 行列相乘（9 / 16 / 25）
   *   pairs = 一半（4 / 8 / 12）—— 因为牌必须成对出现
   *   list 取前 pairs 个表情，concat 复制一份 → 每个表情正好两张
   *   洗牌：给每张牌随机一个 r，再按 r 排序 —— 排序结果随机，等价于打乱
   *        （比"随机交换两个位置"更好写，缺点是依赖排序稳定性，够用就行）
   */
  startLevel(idx) {
    const lv = LEVELS[idx]
    const total = lv.cols * lv.rows
    const pairs = Math.floor(total / 2)   // 9 宫格 → 4 对，16 宫格 → 8 对，25 宫格 → 12 对
    const list = EMOJIS.slice(0, pairs)
    const cards = list.concat(list)                                  // 每张牌出现两次
      .map(emoji => ({ emoji, r: Math.random() }))                   // 贴上随机数
      .sort((a, b) => a.r - b.r)                                    // 按随机数排序 = 打乱
      .map((c, i) => ({ id: i, emoji: c.emoji, open: false, matched: false }))
      // open=翻开 / matched=已配对   这两个状态决定一张牌长什么样

    this._stopTimer()
    this._stopClearTick()
    this.setData({
      cards,
      rows: buildRows(cards, lv),
      cellPct: +((100 - (lv.cols - 1) * GAP_PCT) / lv.cols).toFixed(3),
      fontRpx: FONT[lv.cols] || 32,
      openIdx: [],
      matchedCount: 0,
      moves: 0,
      seconds: 0,
      remain: lv.limit,
      limit: lv.limit,
      maxMoves: lv.maxMoves,
      cols: lv.cols,
      boardSize: total,
      levelName: lv.name,
      level: idx,
      status: 'playing',
      lock: false,
      failChoice: false,
      failReason: '',
      clearCountdown: 3
    })
    this._startTimer()
  },

  /**
   * 同时更新 cards 和 rows 里的同一张牌
   *
   * 为什么要存两份？
   *   cards —— 逻辑用：判断配对、统计剩余、按下标取牌
   *   rows  —— 渲染用：wxml 按"行"循环，才能保证棋盘是正方形网格
   * 只改其中一份就会出现"逻辑上翻开了，界面没变"或相反。
   *
   * 一维下标 idx 换算成行列：行 = idx / cols 取整，列 = idx % cols
   */
  _setCard(idx, patch) {
    const r = Math.floor(idx / this.data.cols)
    const c = idx % this.data.cols
    const data = {}
    Object.keys(patch).forEach(k => {
      // setData 支持 "cards[3].open" 这种字符串路径，一次只改一个字段，性能更好
      data['cards[' + idx + '].' + k] = patch[k]
      data['rows[' + r + '].list[' + c + '].' + k] = patch[k]
    })
    this.setData(data)
  },

  /**
   * 计时器：每秒加 1，同时算出剩余秒数，到 0 判负
   * 关键点：启动新计时器前一定先 _stopTimer()，
   * 否则重开一关会出现两个计时器同时跑，秒数变快一倍
   */
  _startTimer() {
    this._stopTimer()
    this._timer = setInterval(() => {
      if (this.data.status !== 'playing') return   // 已结束就别再加秒
      const seconds = this.data.seconds + 1
      const remain = Math.max(0, this.data.limit - seconds)
      this.setData({ seconds, remain })
      if (remain <= 0) this._fail('⏰ 时间到啦')
    }, 1000)
  },

  _stopTimer() {
    if (this._timer) { clearInterval(this._timer); this._timer = null }
  },

  _stopClearTick() {
    if (this._clearTick) { clearInterval(this._clearTick); this._clearTick = null }
  },

  /**
   * 翻牌（整个游戏的主逻辑）
   *
   * 状态机很简单，只有"已翻开 0 / 1 / 2 张"三种：
   *   翻第 1 张 → 只是打开
   *   翻第 2 张 → 锁住棋盘（lock），400/700ms 后判断：
   *      图案相同 → 两张都标记 matched（永久亮着），检查是否全部配完
   *      图案不同 → 两张都翻回去，检查步数是否用完
   * 为什么要延迟：让玩家看清第二张牌是什么，否则一闪就翻回去了
   * 为什么判断前要再看一次 status：玩家可能在动画期间点了"重开"或超时了
   */
  flip(e) {
    // 不在游戏中 / 正在结算上一对 → 直接忽略点击
    if (this.data.status !== 'playing' || this.data.lock) return
    const idx = Number(e.currentTarget.dataset.idx)
    const card = this.data.cards[idx]
    if (!card || card.open || card.matched) return   // 已翻开或已配对的牌不能再点

    const openIdx = this.data.openIdx.concat(idx)    // 记录"这一轮已翻开的下标"
    this._setCard(idx, { open: true })
    this.setData({ openIdx })

    if (openIdx.length === 2) {                      // 凑够两张，开始判断
      this.setData({ moves: this.data.moves + 1, lock: true })
      const a = openIdx[0]
      const b = openIdx[1]
      const total = this.data.cards.length
      const level = this.data.level
      if (this.data.cards[a].emoji === this.data.cards[b].emoji) {
        setTimeout(() => {
          if (this.data.status !== 'playing') return
          const matchedCount = this.data.matchedCount + 2
          this._setCard(a, { matched: true })
          this._setCard(b, { matched: true })
          this.setData({ matchedCount, openIdx: [], lock: false })
          if (matchedCount >= total) this._levelClear(level)
        }, 400)
      } else {
        setTimeout(() => {
          if (this.data.status !== 'playing') return
          this._setCard(a, { open: false })
          this._setCard(b, { open: false })
          this.setData({ openIdx: [], lock: false })
          if (this.data.moves >= this.data.maxMoves) this._fail('😅 步数用完了')
        }, 700)
      }
    }
  },

  /** 通过一关：倒计时结束自动进入下一关 */
  _levelClear(idx) {
    this._stopTimer()
    const lv = LEVELS[idx]
    const gain = Math.max(50, lv.base - this.data.moves * 10 - this.data.seconds * 4)
    const totalScore = this.data.totalScore + gain
    const isLast = idx >= LEVELS.length - 1
    this.setData({ totalScore })
    wx.vibrateShort({ type: 'medium' })

    if (isLast) {
      const best = Math.max(totalScore, this.data.best)
      wx.setStorageSync('gameFlipBest', best)
      this.setData({ status: 'win', best })
      wx.showModal({
        title: '🏆 全部通关！',
        content: `你通过了全部 ${LEVELS.length} 关！\n总分：${totalScore}\n历史最高：${best}`,
        confirmText: '再挑战一次',
        cancelText: '返回',
        confirmColor: getAccent(),
        success: res => {
          if (res.confirm) this.start()
          else wx.navigateBack()
        }
      })
      return
    }

    // 过关面板：3 秒后自动进入下一关，也可以点按钮立刻进入 / 结束
    this.setData({
      status: 'clear',
      clearGain: gain,
      clearNext: idx + 1,
      clearCountdown: 3
    })
    this._stopClearTick()
    this._clearTick = setInterval(() => {
      const n = this.data.clearCountdown - 1
      if (n <= 0) {
        this._stopClearTick()
        const next = this.data.clearNext
        this.startLevel(next)
      } else {
        this.setData({ clearCountdown: n })
      }
    }, 1000)
  },

  /** 立刻进入下一关 */
  nextLevelNow() {
    this._stopClearTick()
    const next = this.data.clearNext
    this.startLevel(next)
  },

  /** 过关后选择结束挑战 */
  stopHere() {
    this._stopClearTick()
    const best = Math.max(this.data.totalScore, this.data.best)
    wx.setStorageSync('gameFlipBest', best)
    this.setData({ status: 'win', best })
  },

  _fail(reason) {
    this._stopTimer()
    this.setData({ status: 'fail', failChoice: true, failReason: reason })
    wx.vibrateLong()
  },

  /** ① 从失败的关卡继续 */
  retryLevel() {
    this.setData({ failChoice: false })
    this.startLevel(this.data.level)
  },

  /** ② 从头第一关开始 */
  restartAll() {
    this.setData({ failChoice: false })
    this.start()
  },

  closeFail() {
    this.setData({ failChoice: false })
  }
})

/**
 * 一维牌列表 -> 按行分组
 * 奇数宫格（3×3 / 5×5）最后一格留空，保证棋盘是完整方阵
 */
function buildRows(cards, lv) {
  const rows = []
  for (let r = 0; r < lv.rows; r++) {
    const list = []
    for (let c = 0; c < lv.cols; c++) {
      const i = r * lv.cols + c
      list.push(i < cards.length
        ? Object.assign({ blank: false, idx: i }, cards[i])
        : { id: 'blank' + i, blank: true, idx: i, emoji: '', open: false, matched: false })
    }
    rows.push({ key: r, list })
  }
  return rows
}
