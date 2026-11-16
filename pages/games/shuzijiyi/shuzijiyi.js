// pages/games/shuzijiyi/shuzijiyi.js 数字记忆
// 【对应游戏大厅】🔢「数字记忆」——shuzijiyi 就是"数字记忆"的拼音
// 【目录名来历】改名前目录叫 numMemory/
//
// 【玩法】屏幕上出现一串数字，看 3 秒后自动隐藏，玩家凭记忆输入同样的数字。
//   答对 → 位数 +1（3 位 → 4 位 → 5 位…），继续；
//   答错 → 游戏结束，记录"最长记住多少位"。
//
// 【状态机 status（这是本文件的主线）】
//   ready 准备  →  show 展示数字（3 秒倒计时）  →  input 输入  →  对/错
//                                                              对 → show（位数+1）
//                                                              错 → over 结束
//   wxml 里靠 status 决定显示数字、输入框还是结果面板
const {getTheme, getAccent} = require('../../../utils/theme')
const { applyBg } = require('../../../utils/bg')

Page({
  data: {
    theme: 'theme-light',
    bgStyle: '',
    status: 'ready',   // ready / show / input / over
    target: '',        // 本轮目标数字串（不要给玩家看到，input 阶段必须从视图里移除）
    inputVal: '',
    length: 3,         // 当前数字位数（下一轮就 +1）
    best: 0,           // 最长记住的位数（存缓存 gameNumBest）
    left: 3,           // 记忆倒计时秒数（3 → 2 → 1 → 隐藏）
    roundResult: ''    // 本轮对错提示
  },

  onLoad() {
    this.setData({ theme: getTheme(), best: wx.getStorageSync('gameNumBest') || 0 })
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

  /** 生成随机数字串 */
  genNum(len) {
    let s = ''
    for (let i = 0; i < len; i++) s += Math.floor(Math.random() * 10)
    return s
  },

  /**
   * 开始 / 下一轮
   * 用 setInterval 做 3 秒倒计时：每秒减 1，到 0 就切到 input 状态并把计时器清掉。
   * 计时器一定要 clearTick，否则时间到了还在跑，会一直把 status 改来改去
   */
  startRound() {
    this.clearTick()
    const target = this.genNum(this.data.length)   // 生成本轮要记的数字
    this.setData({ target, status: 'show', inputVal: '', roundResult: '', left: 3 })

    // 显示 3 秒后自动隐藏，进入输入阶段
    this._tick = setInterval(() => {
      const left = this.data.left - 1
      if (left <= 0) {
        this.clearTick()                       // 先停表，再切状态
        this.setData({ status: 'input', left: 0 })
      } else {
        this.setData({ left })
      }
    }, 1000)
  },

  onInput(e) {
    this.setData({ inputVal: e.detail.value })
  },

  /** 提交答案 */
  submit() {
    if (this.data.status !== 'input') return
    const { inputVal, target } = this.data

    if (inputVal.trim() === target) {
      // 答对：位数 +1，进入下一轮
      const best = this.data.length
      this.setData({ best, roundResult: '🎉 答对啦！挑战 ' + (this.data.length + 1) + ' 位', length: this.data.length + 1 })
      wx.setStorageSync('gameNumBest', best)
      setTimeout(() => this.startRound(), 1200)
    } else {
      // 答错：游戏结束
      this.gameOver()
    }
  },

  gameOver() {
    const score = this.data.length - 1 // 本轮没答上，成绩为上一轮位数
    this.setData({ status: 'over', roundResult: '' })
    if (score > this.data.best) {
      this.setData({ best: score })
      wx.setStorageSync('gameNumBest', score)
    }
    wx.showModal({
      title: '😵 好可惜，记错啦',
      content: `正确答案：${this.data.target}\n你坚持到了 ${score} 位数\n历史最长：${this.data.best} 位`,
      confirmText: '再挑战',
      confirmColor: getAccent(),
      cancelText: '返回',
      success: res => {
        if (res.confirm) {
          this.setData({ length: 3 })
          this.startRound()
        } else {
          wx.navigateBack()
        }
      }
    })
  },

  start() {
    this.setData({ length: 3, best: wx.getStorageSync('gameNumBest') || 0 })
    this.startRound()
  }
})
