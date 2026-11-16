// utils/widgets.js 首页小组件（类似手机桌面组件的可视化模块）
//
// 和工具卡片完全分开：这里返回的是"组件自己要展示什么"，
// 由首页拼成独立的小组件区块，核心信息一眼可见，点进去才看完整详情。
// 所有数据都只从本地缓存读，拿不到就给一个引导态（empty），不会报错。
//
// 每个组件都带 type，首页按 type 用不同的排版展示，保证信息清晰好看：
//   todo 待办 / habit 习惯 / memo 备忘+心情 /
//   anniv 纪念日 / word 单词
const { today, daysBetween, nextCycleDate } = require('./util')

/** 统一的组件骨架 */
function shell(tool, type) {
  return {
    key: tool.name,
    name: tool.name,
    icon: tool.icon,
    color: tool.color,
    url: tool.url,
    type: type || '',
    main: '',       // 主信息（大字）
    unit: '',       // 主信息后面的小单位
    sub: '',        // 副标题 / 状态说明
    emoji: '',      // 需要展示表情时用（心情 / 锁）
    progress: -1,   // -1 表示不展示进度条，否则 0~100
    foot: '',       // 底部一行补充信息（日期、释义等）
    stats: [],      // 小指标 [{k: '名称', v: '值'}]
    items: [],      // 列表项（最多 3 条）
    tags: [],       // 状态标签 [{t: '今天到期', cls: 'today'}]（待办用）
    todos: [],      // 待办条目 [{title, tag, cls, done}]（待办用）
    empty: ''       // 无数据时的引导语
  }
}

const BUILDERS = {
  /**
   * 待办：剩余项数 + 完成度 + 紧急标签 + 待办明细（带勾选框 / 期限）
   * 明细优先按「逾期 → 期限近 → 无期限」排列；全部完成时改为展示最近完成的几条
   */
  待办清单(w) {
    w.type = 'todo'
    const list = wx.getStorageSync('todo_list') || []
    if (!list.length) { w.empty = '添加待办后，这里显示还差几项'; return w }

    const t = today()
    const doneList = list.filter(x => x.done)
    const left = list.filter(x => !x.done)
    w.progress = Math.round(doneList.length / list.length * 100)

    // 给未完成项算期限标签
    let overdue = 0
    let dueToday = 0
    const rows = left.map((x, i) => {
      const d = x.deadline || ''
      const row = { key: x.id || ('t' + i), title: x.title || '未命名', tag: '', cls: '', d }
      if (d) {
        const diff = daysBetween(t, d)
        if (diff < 0) { row.tag = '逾期 ' + (-diff) + ' 天'; row.cls = 'overdue'; overdue++ }
        else if (diff === 0) { row.tag = '今天到期'; row.cls = 'today'; dueToday++ }
        else if (diff === 1) { row.tag = '明天到期'; row.cls = 'soon' }
        else row.tag = diff + ' 天后'
      }
      return row
    }).sort((a, b) => {
      if (a.d && b.d) return a.d.localeCompare(b.d)
      if (a.d) return -1
      if (b.d) return 1
      return 0
    })

    if (overdue) w.tags.push({ t: '逾期 ' + overdue + ' 项', cls: 'overdue' })
    if (dueToday) w.tags.push({ t: '今天到期 ' + dueToday + ' 项', cls: 'today' })

    if (!left.length) {
      w.main = '0'
      w.unit = '项'
      w.sub = '✅ 全部完成啦，今天很棒'
      w.todos = doneList.slice(-2).reverse().map((x, i) => ({
        key: x.id || ('d' + i), title: x.title || '未命名', tag: '已完成', cls: 'done', done: true
      }))
      return w
    }

    w.main = String(left.length)
    w.unit = '项待办'
    w.sub = `共 ${list.length} 项 · 已完成 ${doneList.length}`
    w.todos = rows.slice(0, 3).map(r => ({
      key: r.key, title: r.title, tag: r.tag, cls: r.cls, done: false
    }))
    return w
  },

  /** 习惯：今日打卡进度 + 待打卡清单 */
  习惯打卡(w) {
    w.type = 'habit'
    const habits = wx.getStorageSync('habit_list') || []
    if (!habits.length) { w.empty = '添加一个习惯后，这里显示今日打卡'; return w }
    const t = today()
    const done = habits.filter(h => h.days && h.days[t])
    const todo = habits.filter(h => !(h.days && h.days[t]))
    w.main = done.length + '/' + habits.length
    w.sub = todo.length ? '今日已打卡 · 还差 ' + todo.length + ' 个' : '今日全部打卡完成 🎉'
    w.progress = Math.round(done.length / habits.length * 100)
    w.items = todo.slice(0, 3).map(h => h.name)
    return w
  },

  /** 备忘录 + 心情：今日情绪 + 备忘条数 + 最近一条 */
  备忘录(w) {
    w.type = 'memo'
    const memos = wx.getStorageSync('memo_list') || []
    const moods = (wx.getStorageSync('mood_records') || [])
      .filter(m => m.date === today())
      .sort((a, b) => (b.ts || 0) - (a.ts || 0))
    const s = wx.getStorageSync('mood_today') || {}
    if (moods.length) {
      w.emoji = s.emoji || '🙂'
      w.sub = '今日心情 · ' + (s.label || ('已记录 ' + moods.length + ' 次'))
    } else {
      w.emoji = '📝'
      w.sub = '今天还没记录心情'
    }
    w.main = String(memos.length)
    w.unit = '条备忘'
    w.items = memos.slice().reverse().slice(0, 2)
      .map(m => (m.content || '').replace(/\s+/g, ' ').slice(0, 24))
      .filter(x => x)
    return w
  },

  /** 纪念日：最近日子的倒计时 + 下一个 */
  纪念日(w) {
    w.type = 'anniv'
    const list = wx.getStorageSync('anniv_list') || []
    if (!list.length) { w.empty = '添加纪念日，这里显示倒计时'; return w }
    const t = today()
    const withDays = []
    list.forEach(a => {
      if (!a || !a.date) return
      const next = nextCycleDate(a.date, a.cycle || 'year', a.interval, t)
      withDays.push({ d: daysBetween(t, next), title: a.title, date: next })
    })
    withDays.sort((a, b) => a.d - b.d)
    if (!withDays.length) return w
    const best = withDays[0]
    w.main = String(best.d)
    w.unit = best.d === 0 ? '就是今天' : '天后'
    w.sub = '🎂 ' + best.title
    w.foot = best.date
    if (withDays[1]) w.items.push(`接下来：${withDays[1].title} · ${withDays[1].d} 天后`)
    return w
  },

  /** 每日单词：单词 + 释义 */
  每日单词(w) {
    w.type = 'word'
    const s = wx.getStorageSync('english_today_word') || {}
    if (!s.w) { w.empty = '打开单词本后，这里显示今日单词'; return w }
    w.main = s.w
    w.sub = '今日单词'
    if (s.m) w.foot = s.m
    return w
  }
}

/** 组装某个工具的首页小组件数据 */
function buildWidget(tool) {
  const w = shell(tool)
  const fn = BUILDERS[tool.name]
  if (!fn) {
    w.empty = '暂不支持小组件'
    return w
  }
  try {
    fn(w)
  } catch (e) {
    w.empty = '数据读取失败'
  }
  return w
}

module.exports = { buildWidget }
