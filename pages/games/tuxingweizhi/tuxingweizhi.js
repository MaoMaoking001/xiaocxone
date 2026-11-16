// pages/games/tuxingweizhi/tuxingweizhi.js 图形位置记忆
// 【对应游戏大厅】🧩「图形位置记忆」——tuxingweizhi 就是"图形位置"的拼音
// 【目录名来历】改名前目录叫 gridMemory/
//
// 玩法：先看若干秒哪些格子亮起了图形，隐藏后凭记忆把它们点出来。
//
// 【本次改动】关卡从 12 关扩到 18 关，难度明显提升：
//   · 每个阶段的最后一关最多要记 7 / 12 / 20 个图形（几乎占满整个棋盘）
//   · 记忆时间由 3 秒一路缩短到 1.1 秒（现在精确到 0.1 秒）
//   · 新增「容错次数」：越往后容错越少，最后几关 0 容错，错一次直接失败
const {getTheme, getAccent} = require('../../../utils/theme')
const { applyBg } = require('../../../utils/bg')

// count = 亮起图形数量，showMs = 记忆时间（毫秒），miss = 允许的失误次数
const LEVELS = [
  // 第一阶段：3×3（9 格）
  { size: 3, count: 3, showMs: 2500, miss: 2 },
  { size: 3, count: 4, showMs: 2200, miss: 2 },
  { size: 3, count: 5, showMs: 1800, miss: 1 },
  { size: 3, count: 6, showMs: 1500, miss: 1 },
  { size: 3, count: 7, showMs: 1200, miss: 0 },
  // 第二阶段：4×4（16 格）
  { size: 4, count: 5,  showMs: 2500, miss: 2 },
  { size: 4, count: 6,  showMs: 2200, miss: 2 },
  { size: 4, count: 8,  showMs: 1800, miss: 1 },
  { size: 4, count: 9,  showMs: 1600, miss: 1 },
  { size: 4, count: 11, showMs: 1300, miss: 1 },
  { size: 4, count: 12, showMs: 1100, miss: 0 },
  // 第三阶段：5×5（25 格）
  { size: 5, count: 7,  showMs: 3000, miss: 2 },
  { size: 5, count: 9,  showMs: 2600, miss: 2 },
  { size: 5, count: 11, showMs: 2200, miss: 1 },
  { size: 5, count: 13, showMs: 1900, miss: 1 },
  { size: 5, count: 15, showMs: 1600, miss: 0 },
  { size: 5, count: 17, showMs: 1300, miss: 0 },
  { size: 5, count: 20, showMs: 1100, miss: 0 }
]

// 图形池：数量最多的关卡要亮 20 个，所以准备 20 个互不重复的图形
const SHAPES = [
  '🌸', '⭐', '🍓', '🎀', '🐰', '🍰', '🌈', '💖', '🐱', '☁️',
  '🍋', '🌙', '🍭', '🐻', '🍉', '🌻', '🐳', '🍒', '🎈', '🍄'
]

const GAP_PCT = 2                            // 格子间距（占棋盘宽度的百分比）
const FONT = { 3: 56, 4: 44, 5: 34, 6: 28 }  // 每种棋盘规格的字号（rpx）
const TICK = 200                             // 记忆倒计时的刷新间隔（毫秒）

Page({
  data: {
    theme: 'theme-light',
    bgStyle: '',
    accentStyle: '',
    status: 'ready',       // ready / memorize / recall / over
    level: 0,
    totalLevel: LEVELS.length,
    best: 0,
    grid: [],              // size×size 个格子，每个 {shape, on}
    rows: [],              // 按行渲染，保证格子正方形
    size: 3,               // 当前棋盘规格（3 / 4 / 5）
    cellPct: 0,
    gapPct: GAP_PCT,
    fontRpx: 56,
    stageName: '3×3',
    stageLevel: 1,
    stageTotal: 5,
    shapeCount: 3,         // 本关要记的图形数量
    allowMiss: 2,          // 本关允许的失误次数
    missLeft: 2,           // 剩余容错
    leftMs: 0,             // 记忆阶段剩余毫秒
    leftText: '0.0',
    userPicks: [],
    correctCount: 0,
    wrongCount: 0,
    score: 0,
    showHint: false,
    hint: ''
  },

  onLoad() {
    this.setData({
      theme: getTheme(),
      best: wx.getStorageSync('gameGridBest') || 0,
      totalLevel: LEVELS.length
    })
  },

  onShow() {
    this.setData({ theme: getTheme() })
    applyBg(this)
  },

  onUnload() {
    this.clearTick()
  },

  clearTick() {
    if (this._tick) {
      clearInterval(this._tick)
      this._tick = null
    }
  },

  /**
   * 开始第 N 关
   *
   * 生成棋盘 = 在 size×size 个格子里随机挑 count 个"要亮的格子"：
   *   while 循环不断摇随机下标，已经选过的就跳过（indexOf 判断），
   *   凑够 count 个为止 —— 这是个很直观的"不放回抽样"写法，
   *   数据量小（最多 25 格）时完全够用。
   *
   * 记忆阶段用 TICK=200ms 的定时器递减剩余毫秒，
   * 所以倒计时能显示成 "1.1" 这种精确到 0.1 秒的样子。
   */
  startRound(level) {
    this.clearTick()
    if (level >= LEVELS.length) {
      this.win()          // 18 关全部打完，结算
      return
    }
    const cfg = LEVELS[level]
    const size = cfg.size
    const total = size * size

    // 随机选取 count 个不同的下标
    const idxs = []
    while (idxs.length < cfg.count) {
      const r = Math.floor(Math.random() * total)
      if (idxs.indexOf(r) === -1) idxs.push(r)   // 已选过就重新摇
    }
    const grid = []
    for (let i = 0; i < total; i++) {
      grid.push({ shape: '', on: false })
    }
    // 打乱图形顺序，避免固定位置顺序被猜出来
    const pool = SHAPES.slice(0, cfg.count)
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      const t = pool[i]; pool[i] = pool[j]; pool[j] = t
    }
    idxs.forEach((idx, k) => {
      grid[idx] = { shape: pool[k % pool.length], on: true }
    })

    const sec = (cfg.showMs / 1000).toFixed(1)
    this.setData({
      level,
      size,
      grid,
      rows: buildRows(grid, size),
      cellPct: +((100 - (size - 1) * GAP_PCT) / size).toFixed(3),
      fontRpx: FONT[size] || 32,
      stageName: `${size}×${size}`,
      stageLevel: stageLevelOf(level),
      stageTotal: stageCount(size),
      shapeCount: cfg.count,
      allowMiss: cfg.miss,
      missLeft: cfg.miss,
      leftMs: cfg.showMs,
      leftText: sec,
      userPicks: [],
      status: 'memorize',
      correctCount: 0,
      wrongCount: 0,
      showHint: true,
      hint: `${size}×${size} 第 ${stageLevelOf(level)} 关：${cfg.count} 个图形，${sec} 秒记住，容错 ${cfg.miss} 次`
    })

    // 倒计时后隐藏全部图形
    this._tick = setInterval(() => {
      const leftMs = Math.max(0, this.data.leftMs - TICK)
      if (leftMs <= 0) {
        this.clearTick()
        const hide = this.data.grid.map(g => ({ shape: g.shape, on: false }))
        this.setData({
          status: 'recall',
          grid: hide,
          rows: buildRows(hide, size),
          leftMs: 0,
          leftText: '0.0',
          showHint: true,
          hint: '🎯 找出刚才出现过的位置！'
        })
      } else {
        this.setData({ leftMs, leftText: (leftMs / 1000).toFixed(1) })
      }
    }, TICK)
  },

  /** 点击格子（回忆阶段） */
  pick(e) {
    if (this.data.status !== 'recall') return
    const idx = Number(e.currentTarget.dataset.idx)
    if (this.data.userPicks.indexOf(idx) !== -1) return

    // 原 grid 中此格是否点亮过（shape 非空即为目标位置）
    const target = this.data.grid[idx].shape !== ''
    const picks = this.data.userPicks.concat(idx)
    const cfg = LEVELS[this.data.level]
    let correctCount = this.data.correctCount
    let wrongCount = this.data.wrongCount

    const grid = this.data.grid.slice()
    grid[idx] = { shape: this.data.grid[idx].shape, on: true, wrong: !target }
    const size = this.data.size
    const r = Math.floor(idx / size)
    const c = idx % size

    if (target) correctCount += 1
    else wrongCount += 1

    this.setData({
      userPicks: picks,
      grid,
      ['rows[' + r + '].list[' + c + '].on']: true,
      ['rows[' + r + '].list[' + c + '].wrong']: !target,
      ['rows[' + r + '].list[' + c + '].shape']: target ? grid[idx].shape : '',
      correctCount,
      wrongCount,
      missLeft: Math.max(0, cfg.miss - wrongCount)
    })

    // 失误超过允许次数（0 容错时错一次就结束）
    if (wrongCount > cfg.miss) {
      this.setData({ status: 'over', hint: '❌ 超出容错次数…' })
      setTimeout(() => this.over(false), 600)
      return
    }

    // 找全所有目标
    if (correctCount >= cfg.count) {
      const next = LEVELS[this.data.level + 1]
      const clearedStage = !next || next.size !== cfg.size
      const addScore = cfg.count * 10 + cfg.size * 5 - wrongCount * 10
      this.setData({
        score: this.data.score + Math.max(5, addScore),
        hint: clearedStage && next
          ? `🎉 ${cfg.size}×${cfg.size} 全部通关！即将升级到 ${next.size}×${next.size}`
          : '✅ 过关！下一关更难哦～'
      })
      setTimeout(() => this.startRound(this.data.level + 1), 900)
    }
  },

  over(success) {
    this.clearTick()
    const best = Math.max(this.data.score, this.data.best)
    this.setData({ status: 'over', best })
    wx.setStorageSync('gameGridBest', best)
    wx.showModal({
      title: success ? '🎉 全关通过' : '😵 失败啦',
      content: `止步：${this.data.stageName} 第 ${this.data.stageLevel} 关\n本局得分：${this.data.score}\n历史最高：${best}`,
      confirmText: '再来一局',
      confirmColor: getAccent(),
      cancelText: '返回',
      success: res => {
        if (res.confirm) this.start()
        else wx.navigateBack()
      }
    })
  },

  win() {
    this.clearTick()
    // 通关奖励
    const score = this.data.score + 100
    const best = Math.max(score, this.data.best)
    this.setData({ status: 'over', score, best })
    wx.setStorageSync('gameGridBest', best)
    wx.showModal({
      title: '🏆 通关啦',
      content: `全部 ${LEVELS.length} 关通过！\n3×3 → 4×4 → 5×5 全部拿下\n最终得分：${score}\n历史最高：${best}`,
      confirmText: '再来一局',
      confirmColor: getAccent(),
      cancelText: '返回',
      success: res => {
        if (res.confirm) this.start()
        else wx.navigateBack()
      }
    })
  },

  start() {
    this.setData({ score: 0 })
    this.startRound(0)
  }
})

/** 一维数组 -> 按行分组 */
function buildRows(grid, size) {
  const rows = []
  for (let r = 0; r < size; r++) {
    rows.push({
      key: r,
      list: grid.slice(r * size, r * size + size).map((g, c) => Object.assign({}, g, { idx: r * size + c }))
    })
  }
  return rows
}

/** 当前关卡在本阶段里是第几关 */
function stageLevelOf(level) {
  const size = LEVELS[level].size
  let n = 0
  for (let i = level; i >= 0; i--) {
    if (LEVELS[i].size !== size) break
    n++
  }
  return n
}

/** 某个阶段一共有几关 */
function stageCount(size) {
  return LEVELS.filter(l => l.size === size).length
}
