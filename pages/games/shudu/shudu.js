// pages/games/shudu/shudu.js 数独 · 支持 4×4 / 6×6 / 9×9 三种规格
// 【对应游戏大厅】🟩「数独」——shudu 就是"数独"的拼音（数独原本就叫 sudoku，直接音译）
// 【目录名来历】改名前目录叫 sudoku/
//
// 【和"随机生成数独"不一样：本作是题库式】
//   代码里写好了若干套 { board（题面，0=空格）, solution（标准答案） }，
//   玩家选规格 + 难度就取对应那套。好处是启动快、答案一定正确、不用写回溯生成器。
//
// 【宫(box)怎么划分，不同规格不一样】
//     4×4 → 2×2 宫  (4 个宫)
//     6×6 → 2×3 宫  (6 个宫)
//     9×9 → 3×3 宫  (9 个宫)
//   ⚠ 注意 6×6 的宫是"2 行 3 列"，不是 3×2，所以 BOX_SIZE_MAP 里写 row:2, col:3
//
// 【校验规则】每行 / 每列 / 每宫 都必须恰好包含 1..size 各一次
//   实现见 isValidSudoku：用 Set 判重，一个数字在同一行出现两次就判非法
//
// 【自检】文件末尾有一个立即执行函数，启动时把整套题库跑一遍，
//   题面与答案冲突就在控制台报错，避免运行时出现"我填对了却被判错"
const {getTheme, getAccent} = require('../../../utils/theme')
const { applyBg } = require('../../../utils/bg')

const SIZE_OPTIONS = [4, 6, 9]

// 难度梯度：简单 → 普通 → 困难 → 地狱
// 越往后初始给出的数字越少、可用的提示次数越少
const DIFFICULTIES = [
  { diff: 'easy', label: '简单' },
  { diff: 'normal', label: '普通' },
  { diff: 'hard', label: '困难' },
  { diff: 'hell', label: '地狱' }
]

// 每个难度可用的「提示」次数（困难 / 地狱明显更少）
const HINT_COUNT = { easy: 5, normal: 4, hard: 2, hell: 1 }

// 不同 size 的宫规格
const BOX_SIZE_MAP = {
  4: { row: 2, col: 2 },
  6: { row: 2, col: 3 },
  9: { row: 3, col: 3 }
}

// 不同 size 的字号（rpx），让格子看起来都协调
const FONT_SIZE_MAP = {
  4: 56,
  6: 44,
  9: 36
}

/** 构造 1..N 数组，用于数字键盘 */
function buildNumPad(n) {
  const arr = []
  for (let i = 1; i <= n; i++) arr.push(i)
  return arr
}

/**
 * 题库：按 size → difficulty 排布。
 * 每个谜题自带 solution，校验时直接把用户填的数跟 solution 对比，
 * 同时也校验行/列/宫不冲突（双重校验，避免题目数据笔误）。
 *
 * 0 表示空格。
 */
const PUZZLES = {
  4: {
    easy: {
      // 4×4 solution: 1 2 3 4 / 4 3 2 1 / 2 1 4 3 / 3 4 1 2
      board: [
        [1, 2, 0, 0],
        [0, 3, 2, 1],
        [2, 0, 0, 3],
        [3, 0, 1, 0]
      ],
      solution: [
        [1, 2, 3, 4],
        [4, 3, 2, 1],
        [2, 1, 4, 3],
        [3, 4, 1, 2]
      ]
    },
    normal: {
      board: [
        [1, 0, 0, 4],
        [0, 3, 2, 0],
        [0, 0, 0, 3],
        [3, 0, 0, 2]
      ],
      solution: [
        [1, 2, 3, 4],
        [4, 3, 2, 1],
        [2, 1, 4, 3],
        [3, 4, 1, 2]
      ]
    },
    hard: {
      board: [
        [1, 0, 0, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
        [3, 0, 0, 2]
      ],
      solution: [
        [1, 2, 3, 4],
        [4, 3, 2, 1],
        [2, 1, 4, 3],
        [3, 4, 1, 2]
      ]
    },
    hell: {
      // 地狱：只给 2 个数字
      board: [
        [1, 0, 0, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
        [3, 0, 0, 0]
      ],
      solution: [
        [1, 2, 3, 4],
        [4, 3, 2, 1],
        [2, 1, 4, 3],
        [3, 4, 1, 2]
      ]
    }
  },
  6: {
    easy: {
      // 6×6 solution:
      // 1 2 3 4 5 6
      // 4 5 6 1 2 3
      // 2 3 1 5 6 4
      // 5 6 4 2 3 1
      // 3 1 2 6 4 5
      // 6 4 5 3 1 2
      board: [
        [1, 2, 0, 4, 5, 0],
        [4, 0, 0, 1, 0, 3],
        [0, 0, 1, 5, 0, 4],
        [5, 0, 4, 0, 3, 0],
        [3, 1, 0, 0, 0, 5],
        [0, 4, 0, 3, 0, 2]
      ],
      solution: [
        [1, 2, 3, 4, 5, 6],
        [4, 5, 6, 1, 2, 3],
        [2, 3, 1, 5, 6, 4],
        [5, 6, 4, 2, 3, 1],
        [3, 1, 2, 6, 4, 5],
        [6, 4, 5, 3, 1, 2]
      ]
    },
    normal: {
      board: [
        [1, 2, 0, 4, 0, 6],
        [4, 0, 0, 1, 0, 3],
        [0, 0, 1, 0, 0, 0],
        [0, 0, 0, 2, 0, 1],
        [3, 1, 0, 0, 0, 5],
        [6, 0, 5, 0, 1, 0]
      ],
      solution: [
        [1, 2, 3, 4, 5, 6],
        [4, 5, 6, 1, 2, 3],
        [2, 3, 1, 5, 6, 4],
        [5, 6, 4, 2, 3, 1],
        [3, 1, 2, 6, 4, 5],
        [6, 4, 5, 3, 1, 2]
      ]
    },
    hard: {
      board: [
        [1, 0, 0, 4, 0, 0],
        [0, 0, 6, 0, 0, 0],
        [0, 0, 0, 0, 6, 0],
        [5, 0, 0, 0, 0, 1],
        [0, 1, 0, 0, 0, 5],
        [0, 0, 0, 0, 0, 0]
      ],
      solution: [
        [1, 2, 3, 4, 5, 6],
        [4, 5, 6, 1, 2, 3],
        [2, 3, 1, 5, 6, 4],
        [5, 6, 4, 2, 3, 1],
        [3, 1, 2, 6, 4, 5],
        [6, 4, 5, 3, 1, 2]
      ]
    },
    hell: {
      // 地狱：只给 7 个数字
      board: [
        [1, 0, 0, 4, 0, 0],
        [0, 0, 6, 0, 0, 0],
        [0, 0, 0, 0, 6, 0],
        [5, 0, 0, 0, 0, 1],
        [0, 0, 0, 0, 0, 5],
        [0, 0, 0, 0, 0, 0]
      ],
      solution: [
        [1, 2, 3, 4, 5, 6],
        [4, 5, 6, 1, 2, 3],
        [2, 3, 1, 5, 6, 4],
        [5, 6, 4, 2, 3, 1],
        [3, 1, 2, 6, 4, 5],
        [6, 4, 5, 3, 1, 2]
      ]
    }
  },
  9: {
    easy: {
      board: [
        [5, 3, 0, 0, 7, 0, 0, 0, 0],
        [6, 0, 0, 1, 9, 5, 0, 0, 0],
        [0, 9, 8, 0, 0, 0, 0, 6, 0],
        [8, 0, 0, 0, 6, 0, 0, 0, 3],
        [4, 0, 0, 8, 0, 3, 0, 0, 1],
        [7, 0, 0, 0, 2, 0, 0, 0, 6],
        [0, 6, 0, 0, 0, 0, 2, 8, 0],
        [0, 0, 0, 4, 1, 9, 0, 0, 5],
        [0, 0, 0, 0, 8, 0, 0, 7, 9]
      ],
      solution: [
        [5, 3, 4, 6, 7, 8, 9, 1, 2],
        [6, 7, 2, 1, 9, 5, 3, 4, 8],
        [1, 9, 8, 3, 4, 2, 5, 6, 7],
        [8, 5, 9, 7, 6, 1, 4, 2, 3],
        [4, 2, 6, 8, 5, 3, 7, 9, 1],
        [7, 1, 3, 9, 2, 4, 8, 5, 6],
        [9, 6, 1, 5, 3, 7, 2, 8, 4],
        [2, 8, 7, 4, 1, 9, 6, 3, 5],
        [3, 4, 5, 2, 8, 6, 1, 7, 9]
      ]
    },
    normal: {
      board: [
        [0, 0, 0, 2, 6, 0, 7, 0, 1],
        [6, 8, 0, 0, 7, 0, 0, 9, 0],
        [1, 9, 0, 0, 0, 4, 5, 0, 0],
        [8, 2, 0, 1, 0, 0, 0, 4, 0],
        [0, 0, 4, 6, 0, 2, 9, 0, 0],
        [0, 5, 0, 0, 0, 3, 0, 2, 8],
        [0, 0, 9, 3, 0, 0, 0, 7, 4],
        [0, 4, 0, 0, 5, 0, 0, 3, 6],
        [7, 0, 3, 0, 1, 8, 0, 0, 0]
      ],
      solution: [
        [4, 3, 5, 2, 6, 9, 7, 8, 1],
        [6, 8, 2, 5, 7, 1, 4, 9, 3],
        [1, 9, 7, 8, 3, 4, 5, 6, 2],
        [8, 2, 6, 1, 9, 5, 3, 4, 7],
        [3, 7, 4, 6, 8, 2, 9, 1, 5],
        [9, 5, 1, 7, 4, 3, 6, 2, 8],
        [5, 1, 9, 3, 2, 6, 8, 7, 4],
        [2, 4, 8, 9, 5, 7, 1, 3, 6],
        [7, 6, 3, 4, 1, 8, 2, 5, 9]
      ]
    },
    hard: {
      board: [
        [8, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 3, 6, 0, 0, 0, 0, 0],
        [0, 7, 0, 0, 9, 0, 2, 0, 0],
        [0, 5, 0, 0, 0, 7, 0, 0, 0],
        [0, 0, 0, 0, 4, 5, 7, 0, 0],
        [0, 0, 0, 1, 0, 0, 0, 3, 0],
        [0, 0, 1, 0, 0, 0, 0, 6, 8],
        [0, 0, 8, 5, 0, 0, 0, 1, 0],
        [0, 9, 0, 0, 0, 0, 4, 0, 0]
      ],
      solution: [
        [8, 1, 2, 7, 5, 3, 6, 4, 9],
        [9, 4, 3, 6, 8, 2, 1, 7, 5],
        [6, 7, 5, 4, 9, 1, 2, 8, 3],
        [1, 5, 4, 2, 3, 7, 8, 9, 6],
        [3, 6, 9, 8, 4, 5, 7, 2, 1],
        [2, 8, 7, 1, 6, 9, 5, 3, 4],
        [5, 2, 1, 9, 7, 4, 3, 6, 8],
        [4, 3, 8, 5, 2, 6, 9, 1, 7],
        [7, 9, 6, 3, 1, 8, 4, 5, 2]
      ]
    },
    hell: {
      // 地狱：只给 18 个数字（困难是 21 个），提示也只有 1 次
      board: [
        [8, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 6, 0, 0, 0, 0, 0],
        [0, 7, 0, 0, 9, 0, 2, 0, 0],
        [0, 5, 0, 0, 0, 7, 0, 0, 0],
        [0, 0, 0, 0, 4, 5, 7, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 3, 0],
        [0, 0, 1, 0, 0, 0, 0, 6, 8],
        [0, 0, 8, 5, 0, 0, 0, 1, 0],
        [0, 0, 0, 0, 0, 0, 4, 0, 0]
      ],
      solution: [
        [8, 1, 2, 7, 5, 3, 6, 4, 9],
        [9, 4, 3, 6, 8, 2, 1, 7, 5],
        [6, 7, 5, 4, 9, 1, 2, 8, 3],
        [1, 5, 4, 2, 3, 7, 8, 9, 6],
        [3, 6, 9, 8, 4, 5, 7, 2, 1],
        [2, 8, 7, 1, 6, 9, 5, 3, 4],
        [5, 2, 1, 9, 7, 4, 3, 6, 8],
        [4, 3, 8, 5, 2, 6, 9, 1, 7],
        [7, 9, 6, 3, 1, 8, 4, 5, 2]
      ]
    }
  }
}

/**
 * 数独校验函数：行 / 列 / 宫 都不能有重复数字
 *
 * 巧妙的写法：一次循环同时检查"第 i 行、第 i 列、第 i 个宫"
 *   i 走 0..size-1，j 也走 0..size-1：
 *     board[i][j] —— 第 i 行的每一格
 *     board[j][i] —— 第 i 列的每一格
 *     第 i 个宫需要换算坐标（见 boxR / boxC）
 *
 * 宫的坐标换算（这行最绕，拆开看）：
 *   br = 宫的行数（4×4 是 2，9×9 是 3）
 *   boxR = floor(i / br) * br + floor(j / bc)
 *        └ 第几个宫的行块 ┘   └ 宫内第几行 ┘
 *   boxC = (i % br) * bc + (j % bc)
 *        └ 第几个宫的列块 ┘   └ 宫内第几列 ┘
 *   举例 9×9、i=4：floor(4/3)*3=3 → 第 2 行宫块，j 从 0~8 依次取完那一宫 9 格
 *
 * Set 判重：has 检查过没有，add 存进去；出现过第二次立刻返回 false
 * 空格（0）在题面里是合法值，所以都要先 if (rv) 判断，0 不参与判重
 */
function isValidSudoku(board, size) {
  const { row: br, col: bc } = BOX_SIZE_MAP[size]   // 宫的 行数 / 列数
  for (let i = 0; i < size; i++) {
    // 每一轮用三个新的 Set，分别装这一行 / 这一列 / 这一宫已出现的数字
    const row = new Set(), col = new Set(), box = new Set()
    for (let j = 0; j < size; j++) {
      const rv = board[i][j]                   // 第 i 行第 j 个
      const cv = board[j][i]                   // 第 i 列第 j 个（行列互换）
      const boxR = Math.floor(i / br) * br + Math.floor(j / bc)
      const boxC = (i % br) * bc + (j % bc)
      const bv = board[boxR][boxC]             // 第 i 个宫里的第 j 个
      if (rv) { if (row.has(rv)) return false; row.add(rv) }
      if (cv) { if (col.has(cv)) return false; col.add(cv) }
      if (bv) { if (box.has(bv)) return false; box.add(bv) }
    }
  }
  return true   // 三组都没重复 → 合法
}

/**
 * 启动时校验所有 PUZZLES：solution 必须合法、且 board 中所有非 0
 * 必须等于 solution 对应位置的值（防止题面/答案不一致）。
 * 失败就在控制台明确报错，避免运行时出现"我填的明明对，但被判定错"的灵异现象。
 */
;(function validatePuzzles() {
  Object.keys(PUZZLES).forEach(sizeStr => {
    const size = parseInt(sizeStr, 10)
    Object.keys(PUZZLES[size]).forEach(diff => {
      const { board, solution } = PUZZLES[size][diff]
      if (!isValidSudoku(solution, size)) {
        console.error(`[sudoku] ${size}×${size} ${diff} solution 非法！`)
      }
      for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
          if (board[r][c] !== 0 && board[r][c] !== solution[r][c]) {
            console.error(`[sudoku] ${size}×${size} ${diff} 题面 (${r},${c}) = ${board[r][c]} 与答案 ${solution[r][c]} 冲突！`)
          }
        }
      }
    })
  })
})()

Page({
  data: {
    theme: 'theme-light',
    bgStyle: '',
    size: 9,                          // 当前规格 4 / 6 / 9
    sizeLabel: '9×9',
    sizeOptions: SIZE_OPTIONS,
    difficulties: DIFFICULTIES,
    difficulty: 'easy',
    difficultyLabel: '简单',
    boxRow: 3,
    boxCol: 3,
    fontSize: 36,
    numPad: [1,2,3,4,5,6,7,8,9],
    board: [],                         // size × size
    solution: [],
    selectedRow: -1,
    selectedCol: -1,
    selected: false,
    seconds: 0,
    mistakes: 0,
    hintsLeft: 5,                     // 剩余提示次数（越难越少）
    hintTotal: 5,
    won: false,
    bestNew: false,
    bestLabel: '--',
    _timer: null
  },

  onShow() {
    this.setData({ theme: getTheme() })
    applyBg(this)
    if (!this.data.board || this.data.board.length === 0) this.newGame()
    else this._startTimer()
  },

  onHide() { this._stopTimer() },
  onUnload() { this._stopTimer() },

  /** 切换规格（4 / 6 / 9） */
  setSize(e) {
    const n = parseInt(e.currentTarget.dataset.n, 10)
    if (n === this.data.size) return
    if (this.data.won) { this._stopTimer(); this.setData({ won: false }) }
    this.setData({ size: n, sizeLabel: `${n}×${n}` })
    this._applySizeMeta()
    this.newGame()
  },

  /** 切换难度 */
  setDifficulty(e) {
    const d = e.currentTarget.dataset.d
    if (d === this.data.difficulty) return
    this.setData({ difficulty: d, difficultyLabel: this._diffLabel(d) })
    this.newGame()
  },

  _diffLabel(d) {
    const found = DIFFICULTIES.find(x => x.diff === d)
    return found ? found.label : '简单'
  },

  /** 把 size 衍生的元信息写进 data：box 边框、字号、数字键盘 */
  _applySizeMeta() {
    const { size } = this.data
    const { row, col } = BOX_SIZE_MAP[size]
    this.setData({
      boxRow: row,
      boxCol: col,
      fontSize: FONT_SIZE_MAP[size],
      numPad: buildNumPad(size)
    })
  },

  newGame() {
    this._stopTimer()
    const { size, difficulty } = this.data
    const puzzlesOfSize = PUZZLES[size]
    const { board: initBoard, solution } = puzzlesOfSize[difficulty]
    const board = initBoard.map(row => row.map(v => ({
      value: v || 0,
      given: !!v,
      err: false,
      hint: false
    })))
    // 旧版本把「中等」存在 medium 键下，这里顺手迁移成 normal
    let best = wx.getStorageSync(`sudoku_${size}_${difficulty}_best`)
    if ((best === '' || best === undefined || best === null) && difficulty === 'normal') {
      const legacy = wx.getStorageSync(`sudoku_${size}_medium_best`)
      if (legacy !== '' && legacy !== undefined && legacy !== null) {
        best = legacy
        wx.setStorageSync(`sudoku_${size}_${difficulty}_best`, legacy)
      }
    }
    const hints = HINT_COUNT[difficulty] || 3
    this.setData({
      board, solution,
      selectedRow: -1,
      selectedCol: -1,
      selected: false,
      seconds: 0,
      mistakes: 0,
      hintsLeft: hints,
      hintTotal: hints,
      won: false,
      bestNew: false,
      bestLabel: best ? `${best}s` : '--'
    })
    this._startTimer()
  },

  selectCell(e) {
    const { r, c } = e.currentTarget.dataset
    this.setData({ selectedRow: r, selectedCol: c, selected: true })
  },

  /**
   * 填数
   * 规则调整（不再有"错 3 次失败"）：
   *   · 可以随意填写，填错也不会立刻失败
   *   · 全部填满之后才统一校验，把错误的格子高亮标出来
   */
  fillNum(e) {
    const n = parseInt(e.currentTarget.dataset.n, 10)
    const { selectedRow: r, selectedCol: c, board } = this.data
    if (r < 0 || c < 0) return          // 没选中格子
    if (board[r][c].given) return       // 题目自带的数字不许改
    // 二维数组的"深拷贝"：外层 map 复制行，内层 map + Object.assign 复制每个格子对象。
    // 为什么要复制：直接改 this.data.board[r][c].value 不会触发界面更新，
    // 而 setData 整块新数组最稳妥；只复制一层的话内层还是同一个对象，改完原数据也被改了
    const boardCopy = board.map(row => row.map(x => Object.assign({}, x)))
    boardCopy[r][c].value = n
    boardCopy[r][c].hint = false        // 用户自己填的，取消"提示"样式
    // 填写阶段不判对错，先清掉上一次的高亮
    boardCopy.forEach(row => row.forEach(cell => { cell.err = false }))
    this.setData({ board: boardCopy, mistakes: 0 })

    // 填满了就立刻校验一次
    if (this._isFull(boardCopy)) {
      setTimeout(() => this.checkBoard(), 120)
    }
  },

  /** 是否已经全部填满 */
  _isFull(board) {
    const { size } = this.data
    for (let i = 0; i < size; i++) {
      for (let j = 0; j < size; j++) {
        if (!board[i][j].value) return false
      }
    }
    return true
  },

  /**
   * 校验：高亮所有错误格子 + 提示出错位置，全部正确才算过关
   *
   * 判定标准（两件事同时满足才算赢）：
   *   ① 没有任何一格与 solution 不一致
   *   ② 整盘已经填满（不然"全是空格"也满足 ①）
   * 这里跟 solution 逐格比对，而不是重新跑一遍行/列/宫规则，
   * 因为题库的 solution 已经保证合法，逐格比更简单直接
   */
  checkBoard() {
    const { board, solution, size } = this.data
    if (this.data.won) return
    const boardCopy = board.map(row => row.map(x => Object.assign({}, x)))
    const wrong = []                     // 收集错误格子的坐标文字，用于弹窗提示
    for (let i = 0; i < size; i++) {
      for (let j = 0; j < size; j++) {
        const v = boardCopy[i][j].value
        if (!v) { boardCopy[i][j].err = false; continue }   // 空格不算错，跳过
        if (Number(v) !== solution[i][j]) {
          boardCopy[i][j].err = true     // true 时 wxml 会给格子加红色样式
          wrong.push(`第${i + 1}行 第${j + 1}列`)
        }
      }
    }
    const filled = this._isFull(boardCopy)
    this.setData({ board: boardCopy, mistakes: wrong.length })

    if (wrong.length === 0 && filled) {
      this._win()
      return
    }
    if (wrong.length > 0) {
      wx.vibrateShort({ type: 'light' })
      wx.showModal({
        title: `${wrong.length} 个格子填错了`,
        content: `已经用红色把错误的格子标出来啦：\n${wrong.slice(0, 6).join('、')}${wrong.length > 6 ? ' 等' : ''}\n\n点一下就能改，改完再检查一次～`,
        showCancel: false,
        confirmText: '我去改改',
        confirmColor: getAccent()
      })
    } else {
      wx.showToast({ title: '还有空格没填完，继续加油～', icon: 'none' })
    }
  },

  /**
   * 提示：直接填出一个正确数字，扣掉一次提示次数
   * 难度越高次数越少（简单 5 → 普通 4 → 困难 2 → 地狱 1）
   */
  useHint() {
    if (this.data.won) return
    if (this.data.hintsLeft <= 0) {
      wx.showToast({ title: '提示次数用完啦，自己推一推～', icon: 'none' })
      return
    }
    const { board, solution, size, selectedRow: r, selectedCol: c } = this.data
    let tr = r, tc = c
    const usable = (i, j) => board[i][j] && !board[i][j].given && !board[i][j].value
    if (tr < 0 || tc < 0 || !usable(tr, tc)) {
      const empties = []
      for (let i = 0; i < size; i++) {
        for (let j = 0; j < size; j++) if (usable(i, j)) empties.push([i, j])
      }
      if (!empties.length) {
        wx.showToast({ title: '已经填满啦，点检查看看～', icon: 'none' })
        return
      }
      const pick = empties[Math.floor(Math.random() * empties.length)]
      tr = pick[0]
      tc = pick[1]
    }

    const boardCopy = board.map(row => row.map(x => Object.assign({}, x)))
    boardCopy[tr][tc].value = solution[tr][tc]
    boardCopy[tr][tc].hint = true
    boardCopy[tr][tc].err = false

    const left = this.data.hintsLeft - 1
    this.setData({
      board: boardCopy,
      hintsLeft: left,
      selectedRow: tr,
      selectedCol: tc,
      selected: true
    })
    wx.showToast({ title: `已提示 1 格，剩 ${left} 次`, icon: 'none' })
    if (this._isFull(boardCopy)) setTimeout(() => this.checkBoard(), 120)
  },

  clearCell() {
    const { selectedRow: r, selectedCol: c } = this.data
    if (r < 0 || c < 0) return
    const board = this.data.board
    if (board[r][c].given) return
    const boardCopy = board.map(row => row.map(x => Object.assign({}, x)))
    boardCopy[r][c].value = 0
    boardCopy[r][c].err = false
    this.setData({ board: boardCopy })
  },

  _win() {
    this._stopTimer()
    const { size, difficulty, seconds } = this.data
    const bestKey = `sudoku_${size}_${difficulty}_best`
    const best = wx.getStorageSync(bestKey)
    const newBest = (best === undefined || seconds < best)
    if (newBest) wx.setStorageSync(bestKey, seconds)
    this.setData({
      won: true,
      bestNew: newBest,
      bestLabel: newBest ? `${seconds}s` : (best ? `${best}s` : `${seconds}s`)
    })
    wx.vibrateShort({ type: 'medium' })
  },

  _startTimer() {
    this._stopTimer()
    this._timer = setInterval(() => {
      this.setData({ seconds: this.data.seconds + 1 })
    }, 1000)
  },

  _stopTimer() {
    if (this._timer) { clearInterval(this._timer); this._timer = null }
  }
})