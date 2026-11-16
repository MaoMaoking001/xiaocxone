// pages/games/ciyujiyi/ciyujiyi.js 词语记忆
// 【对应游戏大厅】💬「词语记忆」——ciyujiyi 就是"词语记忆"的拼音
// 【目录名来历】改名前目录叫 wordMemory/
//
// 【玩法】
//   第 1 关：屏幕显示 4 个词，5 秒后隐藏
//   然后在"目标词 + 干扰词"混在一起的候选里，把刚才看过的词全部点出来
//   点对 → 正确数 +1；点错 → 生命 -1（共 3 条命，扣光就结束）
//   全部选对 → 加分进入下一关（5、6、7、8、9 个词，最多 6 关）
//
// 【三个关键点】
//   ① ROUNDS 数组就是关卡配置，加一行就是加一关
//   ② 干扰词 = 从 POOL 里排除掉目标词后随机取，数量是目标数的 1.5 倍
//   ③ 判分只看"这个词在不在 targetWords 里"，不用记录顺序，所以很简单
const {getTheme, getAccent} = require('../../../utils/theme')
const { applyBg } = require('../../../utils/bg')

// 词语候选池（混入正确词一起展示）
// 目标词和干扰词都从这里取，所以池子越大越不容易重复
const POOL = [
  '苹果', '风铃', '海浪', '银河', '向日葵', '棉花糖', '蝴蝶结',
  '独角兽', '彩虹', '热可可', '萤火虫', '仙人掌', '漂流瓶',
  '小浣熊', '樱花', '草莓蛋糕', '纸飞机', '雪人', '贝壳',
  '糖葫芦', '风车', '云朵', '刺猬', '魔法棒', '蒲公英',
  '热气球', '水晶球', '柠檬茶', '南极光', '蓝鲸', '茶碗蒸',
  '向阳花', '紫罗兰', '松鼠', '猫头鹰', '小鱼', '回旋镖',
  '薰衣草', '琥珀', '微风', '星月夜', '钥匙', '月亮船',
  '萤光', '海洋', '春笋', '冬日', '晚霞', '风筝',
  '蝴蝶', '麋鹿', '雪糕', '麦穗', '葡萄', '西瓜'
]

// 关卡配置：count 要记的词数，showSec 展示几秒
// 想改难度就改这两列，别的地方不用动
const ROUNDS = [
  { count: 4, showSec: 5 },   // 4 词，5 秒
  { count: 5, showSec: 5 },
  { count: 6, showSec: 5 },
  { count: 7, showSec: 5 },
  { count: 8, showSec: 5 },
  { count: 9, showSec: 5 }
]

/**
 * 打乱数组（返回新数组，不改原数组）
 * 这里用的是"随机数排序"这种简易洗牌：随机数正负各半，排序结果就乱了。
 * 严格来说不如 Fisher-Yates 均匀（见 schulte.js），但选词场景够用。
 */
function shuffle(arr) {
  return arr.slice().sort(() => Math.random() - 0.5)
}

/** 从词池里随机取 n 个不重复的词 */
function pickWords(n) {
  return shuffle(POOL).slice(0, n)
}

Page({
  data: {
    theme: 'theme-light',
    bgStyle: '',
    status: 'ready',       // ready / show / select / over
    round: 0,
    best: 0,
    score: 0,
    targetWords: [],
    options: [],           // 候选（包含 targetWords + 干扰项）
    selected: [],          // 用户选中的下标
    revealed: false,
    left: 0,
    showHint: false,
    hint: '',
    correctCount: 0,
    wrongCount: 0,
    lives: 3
  },

  onLoad() {
    this.setData({ theme: getTheme(), best: wx.getStorageSync('gameWordBest') || 0 })
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

  startRound(round) {
    this.clearTick()
    if (round >= ROUNDS.length) {
      this.win()
      return
    }
    const cfg = ROUNDS[round]
    const target = pickWords(cfg.count)          // 本关要记的词
    // 候选 = 目标 + 干扰（干扰项数 = 目标数 1.5 倍，至少 4 个）
    // filter 先把目标词从池子里排除，避免同一个词既当目标又当干扰
    const noiseN = Math.max(4, Math.round(cfg.count * 1.5))
    const noise = shuffle(POOL.filter(w => target.indexOf(w) === -1)).slice(0, noiseN)
    const options = shuffle(target.concat(noise))   // 混在一起再打乱，位置随机

    this.setData({
      round,
      targetWords: target,
      options: options.map(w => ({ w, picked: false })),
      selected: [],
      revealed: false,
      status: 'show',
      left: cfg.showSec,
      showHint: true,
      hint: `第 ${round + 1} 关：记住 ${cfg.count} 个词 ${cfg.showSec} 秒`,
      correctCount: 0,
      wrongCount: 0,
      lives: 3
    })

    this._tick = setInterval(() => {
      const left = this.data.left - 1
      if (left <= 0) {
        this.clearTick()
        this.setData({ status: 'select', left: 0, showHint: true, hint: '🎯 选 出刚才出现过的词！' })
      } else {
        this.setData({ left })
      }
    }, 1000)
  },

  /**
   * 点一个候选词：判断对错 → 更新生命 / 计数 → 判断过关或结束
   * 注意所有"改完要判断"的地方都用 setTimeout 稍微延后：
   * 让用户先看到这一下的视觉反馈（变绿/变红），再弹下一个环节，不然会闪
   */
  pick(e) {
    if (this.data.status !== 'select') return      // 只有选择阶段能点
    const idx = Number(e.currentTarget.dataset.idx)
    if (this.data.selected.indexOf(idx) !== -1) return  // 同一个词不能点两次

    const options = this.data.options.slice()
    const w = options[idx].w
    // 判分只需要问一句：这个词在"刚看过的词"里吗？
    const isTarget = this.data.targetWords.indexOf(w) !== -1

    options[idx] = { ...options[idx], picked: true }  // 打上"已点过"标记（变灰/变色）
    const selected = this.data.selected.concat(idx)
    let { correctCount, wrongCount, lives } = this.data

    if (isTarget) {
      correctCount += 1
    } else {
      wrongCount += 1
      lives -= 1        // 点错扣一条命（共 3 条）
    }

    this.setData({ options, selected, correctCount, wrongCount, lives })

    if (lives <= 0) {
      setTimeout(() => this.over(false), 400)
      return
    }

    // 选完所有目标 → 计分（基础 50 + 关卡加成 - 错误扣分，最低保底 20 分）
    if (correctCount >= this.data.targetWords.length) {
      const addScore = 50 + this.data.round * 10 - wrongCount * 5
      this.setData({ score: this.data.score + Math.max(20, addScore) })
      setTimeout(() => this.startRound(this.data.round + 1), 700)
    }
  },

  over(success) {
    this.clearTick()
    const best = Math.max(this.data.score, this.data.best)
    this.setData({ status: 'over', best })
    wx.setStorageSync('gameWordBest', best)
    wx.showModal({
      title: success ? '🎉 全关通过' : '😵 失败了',
      content: `本局得分：${this.data.score}\n历史最高：${best}`,
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
    const score = this.data.score + 100
    const best = Math.max(score, this.data.best)
    this.setData({ status: 'over', score, best })
    wx.setStorageSync('gameWordBest', best)
    wx.showModal({
      title: '🏆 通关啦',
      content: `全部关卡通过！\n最终得分：${score}\n历史最高：${best}`,
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