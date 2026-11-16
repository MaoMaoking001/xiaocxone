// pages/game/game.js 游戏大厅（tabBar 第 3 个页面）
//
// 【这个文件很简单，只做两件事】
//   ① 用一个数组 games 定义"有哪些游戏"，每个游戏配一个图标、名字、说明、
//      跳转地址，以及"最高分存在缓存的哪个键里"（bestKey）
//   ② 进页面时把 bestKey 对应的缓存值读出来，格式化后显示在卡片右下角
//
// 【加一个新游戏要改几处？】
//   1. 在 games 数组里加一项（icon / name / desc / url / bestKey）
//   2. 新建 pages/games/xxx 四个文件
//   3. 到 app.json 的 pages 里注册路径
//   就这么三步，大厅页面不用写别的逻辑 —— 这就是"配置驱动"的好处。
const { getTheme } = require('../../utils/theme')
const { applyBg } = require('../../utils/bg')

Page({
  data: {
    theme: 'theme-light',
    bgStyle: '',
    accentStyle: '',
    // 每个游戏：icon 图标、desc 玩法说明、url 页面路径、
    // bestKey 最高分存放在本地缓存的键名、bestLabel 这个分数叫什么（最高分 / 最长位数 / 最快用时）
    games: [
      {
        icon: '🃏',
        name: '记忆翻牌',
        desc: '九宫格 → 十六宫格 → 二十五宫格，6 关难度递增，通关自动进入下一关',
        url: '/pages/games/jiyifanpai/jiyifanpai',
        bestKey: 'gameFlipBest',
        bestLabel: '最高分'
      },
      {
        icon: '🔢',
        name: '数字记忆',
        desc: '短暂记住一串数字并复述出来，长度逐级增加',
        url: '/pages/games/shuzijiyi/shuzijiyi',
        bestKey: 'gameNumBest',
        bestLabel: '最长位数'
      },
      {
        icon: '🧩',
        name: '图形位置记忆',
        desc: '记住图形位置后还原；18 关递进，3×3 → 4×4 → 5×5，最多 20 个图形',
        url: '/pages/games/tuxingweizhi/tuxingweizhi',
        bestKey: 'gameGridBest',
        bestLabel: '最高分'
      },
      {
        icon: '💬',
        name: '词语记忆',
        desc: '短暂展示一组词语，隐藏后选出刚才出现过的词汇',
        url: '/pages/games/ciyujiyi/ciyujiyi',
        bestKey: 'gameWordBest',
        bestLabel: '最高分'
      },
      {
        icon: '⏱️',
        name: '舒尔特方格',
        desc: '3×3~6×6 正方形方格，按 1→N 顺序快速点完所有数字',
        url: '/pages/games/shuertefangge/shuertefangge',
        bestKey: 'schulte_best_5',
        bestLabel: '最快用时'
      },
      {
        icon: '🧠',
        name: 'N-back 训练',
        desc: '判断当前格子是否与 N 步之前相同；N 可选 1~5，另有 4 档节奏难度',
        url: '/pages/games/gebujiyi/gebujiyi',
        bestKey: 'nback_best_2_1',
        bestLabel: '最高正确率'
      },
      {
        icon: '🟩',
        name: '数独',
        desc: '经典 9×9 数独，可自选难度；随便填，填满后统一校验标红',
        url: '/pages/games/shudu/shudu',
        bestKey: 'sudoku_easy_best',
        bestLabel: '最快秒数'
      }
    ]
  },
  onShow() {
    this.setData({ theme: getTheme() })
    applyBg(this)
    this.loadBest()
  },
  

  /**
   * 读取各游戏历史最高分
   * 每个游戏存的单位不一样（分数 / 毫秒 / 百分比），所以按 bestKey 前缀分别格式化：
   *   schulte_xxx 存毫秒 → 转成 "12.3s"
   *   nback_xxx   存 0~100 → 加 "%"
   *   其它        直接当分数
   * 没玩过时 raw 是 0，页面显示 0 / 0s / 0%，由 wxml 决定要不要显示"暂无记录"
   *
   * 注意：游戏目录已经改成拼音（shuertefangge / gebujiyi …），
   * 但缓存的键名仍然是老的 schulte_xxx / nback_xxx —— 故意不改，
   * 因为键名一改，玩家之前的历史最高分就全部读不到了。
   */
  loadBest() {
    const games = this.data.games.map(g => {
      const raw = wx.getStorageSync(g.bestKey) || 0
      let best = raw
      // 舒尔特方格存的是毫秒，这里换算成秒展示
      if (g.bestKey.indexOf('schulte') === 0 && raw) best = (raw / 1000).toFixed(1) + 's'
      // N-back 存的是百分比
      if (g.bestKey.indexOf('nback') === 0 && raw) best = raw + '%'
      return Object.assign({}, g, { best })   // 复制一份再加 best，不改原数组
    })
    this.setData({ games })
  },

  // 点卡片进游戏：url 从 data-url 里拿，不用写 7 个跳转函数
  goGame(e) {
    wx.navigateTo({ url: e.currentTarget.dataset.url })
  }
})
