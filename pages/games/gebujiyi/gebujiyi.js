// pages/games/gebujiyi/gebujiyi.js N-back 工作记忆训练
// 【对应游戏大厅】🧠「N-back 训练」——通俗叫法「隔步记忆」
// 【目录名来历】gebujiyi = 隔步记忆的拼音，改名前目录叫 nback/
//
// 规则：3×3 方格会依次高亮一个格子。
//       判断「当前高亮的格子」是否和 n 步之前的那个格子是同一个位置：
//       一样 → 点 ✅ 匹配；不一样 → 点 ❌ 不匹配。
//       每回合有时间限制，没点到就算未响应。
//
// 【BUG 修复】提前作答后回合不再推进：
//   旧代码在超时回调里写了 `if (this._answered) return`，
//   用户一作答（_answered = true）就会 return，回合永远停在这一格，游戏卡死。
//   现在超时回调只负责"没作答就记一次未响应"，然后照常推进到下一回合；
//   提前作答则 0.6 秒后直接进入下一回合。
//
// 【本次改动】难度不再只有 3 档：
//   ① N 从 1~3 扩到 1~5（要记的步数越多越难）
//   ② 新增「节奏」四档：悠闲 / 标准 / 紧张 / 地狱（每回合展示时间从 2.8s 到 1.3s）
//   两者任意组合，难度选择更自由。
const {getTheme, getAccent} = require('../../../utils/theme')
const { applyBg } = require('../../../utils/bg')

const N_OPTIONS = [1, 2, 3, 4, 5]   // 可选择的 N（往回记几步）
const SIZE = 3                      // 棋盘规格 3×3
const TOTAL = SIZE * SIZE

// 节奏（= 难度档位）：每回合展示时间越短越难
const SPEEDS = [
  { key: 'slow',   label: '悠闲', ms: 2800, tip: '2.8 秒 / 回合' },
  { key: 'normal', label: '标准', ms: 2200, tip: '2.2 秒 / 回合' },
  { key: 'fast',   label: '紧张', ms: 1700, tip: '1.7 秒 / 回合' },
  { key: 'hell',   label: '地狱', ms: 1300, tip: '1.3 秒 / 回合' }
]

const FEEDBACK_MS = 500        // 提前作答后展示反馈的时间
const TOTAL_ROUNDS = 20        // 正式回合数（前面 n 个回合无法判断）
const GAP_PCT = 2              // 棋盘格子间距（占棋盘宽度百分比）

Page({
  data: {
    theme: 'theme-light',
    bgStyle: '',
    accentStyle: '',
    nOptions: N_OPTIONS,
    n: 2,
    speeds: SPEEDS,
    speedIndex: 1,          // 默认「标准」
    roundMs: SPEEDS[1].ms,
    speedTip: SPEEDS[1].tip,
    status: 'ready',        // ready / playing / over
    grid: [],               // 9 个格子
    rows: [],               // 按行渲染，格子等宽等高
    cellPct: +((100 - (SIZE - 1) * GAP_PCT) / SIZE).toFixed(3),
    gapPct: GAP_PCT,
    round: 0,               // 当前回合（从 0 开始）
    totalRounds: TOTAL_ROUNDS,
    feedback: '',           // 正确 / 错误 / 超时
    feedbackKey: '',
    correct: 0,
    wrong: 0,
    miss: 0,
    accuracy: 0,
    best: '--',
    progress: 0
  },

  onLoad() {
    this.setData({ theme: getTheme() })
    applyBg(this)
    this.refreshBest()
  },

  onUnload() { this._clean() },
  onHide() { this._clean() },

  refreshBest() {
    const best = wx.getStorageSync('nback_best_' + this._bestKey())
    this.setData({ best: best ? best + '%' : '--' })
  },

  /** 最高分按「N + 节奏」分开记录 */
  _bestKey() {
    return this.data.n + '_' + this.data.speedIndex
  },

  setN(e) {
    const n = Number(e.currentTarget.dataset.n)
    this.setData({ n })
    this.refreshBest()
    if (this.data.status === 'playing') this.start()
  },

  /** 切换节奏（难度档位） */
  setSpeed(e) {
    const i = Number(e.currentTarget.dataset.i)
    const sp = SPEEDS[i] || SPEEDS[1]
    this.setData({ speedIndex: i, roundMs: sp.ms, speedTip: sp.tip })
    this.refreshBest()
    if (this.data.status === 'playing') this.start()
  },

  /**
   * 开一局：先把整条位置序列预生成好，再一回合回合地渲染
   *
   * 为什么要"预生成"而不是边玩边随机：
   *   N-back 的正确率取决于"有多少次真的和 N 步前相同"，
   *   边玩边随机的话比例不可控；预生成可以精确控制成约 1/3 是"匹配"，
   *   剩下的 2/3 一定"不匹配"，玩家的 ✅/❌ 才有意义。
   *
   * 生成规则（第 i 格）：
   *   i < n         → 前 n 格没有"n 步前"，随便取（这几回合不判分）
   *   34% 概率      → 故意取 seq[i-n]，制造一次"匹配"
   *   其余          → 随机取，但要保证"不等于 seq[i-n]"（while 循环那几行），
   *                   否则会出现"本该不匹配却碰巧相同"，玩家会莫名被判错
   */
  start() {
    this._clean()
    const n = this.data.n
    const total = TOTAL_ROUNDS + n       // 多出 n 个"热身回合"，保证正式回合数够
    // 预生成序列：约 1/3 的回合是"n 步前同一个位置"
    const seq = []
    let prev = Math.floor(Math.random() * TOTAL)
    seq.push(prev)
    for (let i = 1; i < total; i++) {
      if (i >= n && Math.random() < 0.34) {
        seq.push(seq[i - n])             // 制造"匹配"
      } else {
        let v = Math.floor(Math.random() * TOTAL)
        let guard = 0                    // guard 防止极端情况下死循环
        // 避免"意外命中"，保证判断明确
        while (i >= n && v === seq[i - n] && guard < TOTAL) {
          v = (v + 1) % TOTAL            // 撞上了就往后挪一格，挪满一圈总能错开
          guard++
        }
        seq.push(v)
      }
    }
    this._seq = seq
    this._total = total
    this.setData({
      status: 'playing',
      round: 0,
      correct: 0,
      wrong: 0,
      miss: 0,
      accuracy: 0,
      progress: 0,
      feedback: '',
      feedbackKey: ''
    })
    this._render(0)
  },

  /**
   * 渲染第 i 回合：把序列里第 i 个位置设为高亮，并起一个"限时"定时器
   * 每回合只做一件事 —— 亮一个格子，玩家在 roundMs 内决定点 ✅ 还是 ❌
   */
  _render(i) {
    if (i >= this._total) { this._over(); return }   // 回合跑完了，结算
    const active = this._seq[i]                      // 本回合要高亮的下标（0~8）
    const grid = []
    for (let k = 0; k < TOTAL; k++) grid.push({ idx: k, key: k, active: k === active })
    this.setData({
      grid,
      rows: buildRows(grid),
      round: i,
      feedback: '',
      feedbackKey: '',
      canAnswer: i >= this.data.n,
      progress: Math.round((i / this._total) * 100)
    })
    this._answered = false

    this._clean()
    this._timer = setTimeout(() => {
      // 关键：无论用户有没有提前作答，回合都必须继续推进，否则游戏会卡死
      if (!this._answered) {
        if (i >= this.data.n) {
          // 超时未响应
          this.setData({ miss: this.data.miss + 1, feedback: '⏰ 没反应过来', feedbackKey: 'miss' })
          this._refreshAccuracy()
        }
        this._next(i)
      }
    }, this.data.roundMs)
  },

  /** 进入下一回合 */
  _next(i) {
    const next = i + 1
    this.setData({
      round: next,
      progress: Math.round((next / this._total) * 100)
    })
    this._render(next)
  },

  /** 重算正确率 */
  _refreshAccuracy() {
    const judged = this.data.correct + this.data.wrong + this.data.miss
    this.setData({ accuracy: judged ? Math.round((this.data.correct / judged) * 100) : 0 })
  },

  /** 判断：matched = 用户认为"和 n 步前一样" */
  _answer(matched) {
    if (this.data.status !== 'playing') return
    const i = this.data.round
    if (i < this.data.n || this._answered) return
    this._answered = true

    const isSame = this._seq[i] === this._seq[i - this.data.n]
    if (matched === isSame) {
      this.setData({ correct: this.data.correct + 1, feedback: '✅ 正确', feedbackKey: 'ok' })
      wx.vibrateShort({ type: 'light' })
    } else {
      this.setData({ wrong: this.data.wrong + 1, feedback: '❌ 错了', feedbackKey: 'bad' })
      wx.vibrateShort({ type: 'heavy' })
    }
    this._refreshAccuracy()

    // 提前作答：看完反馈就进入下一回合，不用干等这回合结束
    this._clean()
    this._timer = setTimeout(() => this._next(i), FEEDBACK_MS)
  },

  answerYes() { this._answer(true) },
  answerNo() { this._answer(false) },

  _over() {
    this._clean()
    const judged = this.data.correct + this.data.wrong + this.data.miss
    const accuracy = judged ? Math.round((this.data.correct / judged) * 100) : 0
    const key = 'nback_best_' + this._bestKey()
    const prev = wx.getStorageSync(key) || 0
    const isNew = accuracy > prev
    if (isNew) wx.setStorageSync(key, accuracy)
    this.setData({ status: 'over', accuracy })
    this.refreshBest()
    wx.showModal({
      title: '训练结束 🎯',
      content: `${this.data.n}-back · ${this.data.speedTip}\n共 ${judged} 回合\n正确 ${this.data.correct} · 错误 ${this.data.wrong} · 未响应 ${this.data.miss}\n正确率：${accuracy}%${isNew ? '\n🏆 新纪录！' : ''}`,
      confirmText: '再来一轮',
      cancelText: '返回',
      confirmColor: getAccent(),
      success: res => {
        if (res.confirm) this.start()
        else wx.navigateBack()
      }
    })
  },

  _clean() {
    if (this._timer) { clearTimeout(this._timer); this._timer = null }
  }
})

/** 一维格子 -> 按行分组（保证格子等宽等高、棋盘正方） */
function buildRows(grid) {
  const rows = []
  for (let r = 0; r < SIZE; r++) {
    rows.push({ key: r, list: grid.slice(r * SIZE, r * SIZE + SIZE) })
  }
  return rows
}
