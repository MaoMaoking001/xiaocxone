// pages/tools/memo/memo.js 备忘录（二合一：随手记 + 每日心情打卡）
//
// 【页面结构】
//   顶部一张卡：心情表情（选填）+ 想说点什么（必填）+ 保存按钮
//   下面两块：备忘列表、心情日历（默认都收起，点开才渲染）
//
// 【存了哪些数据（都是本地缓存，不上云）】
//   memo_list   备忘正文：[{ id, title, content, createTime, updateTime, mood, moodEmoji, moodLabel }]
//   mood_records 心情流水：[{ id, date:'YYYY-MM-DD', mood:'happy', emoji, label, color, ts: 时间戳 }]
//                  一天可以记多条，日历格子里显示当天最多 3 个表情
//   mood_today   当日摘要：{ emoji, label, ts }，首页小组件直接读这一个键，省得每次遍历
//
// 【为什么"文字必填、心情选填"】
//   文字是备忘的主体；心情只是附属标签，所以心情面板默认收起，点开才出现表情
const {getTheme, getAccent} = require('../../../utils/theme')
const { applyBg } = require('../../../utils/bg')
const { today, fmtDate, uid, formatTime } = require('../../../utils/util')

// 三个缓存键名，改这里就能换存储位置（代码里其它地方都用常量，不写死字符串）
const KEY = 'memo_list'
const MOOD_KEY = 'mood_records'
const MOOD_TODAY_KEY = 'mood_today'   // 首页预览用的一份当日摘要

// 表情库（30 种）
const MOODS = [
  { key: 'happy',     emoji: '😊', label: '开心',   color: '#ffd47a' },
  { key: 'love',      emoji: '🥰', label: '幸福',   color: '#ff8fab' },
  { key: 'calm',      emoji: '😌', label: '平静',   color: '#a98cd0' },
  { key: 'relaxed',   emoji: '🧘', label: '放松',   color: '#8fd3c7' },
  { key: 'grateful',  emoji: '🙏', label: '感激',   color: '#7fc8a9' },
  { key: 'loved',     emoji: '💗', label: '被爱',   color: '#ff9ec4' },
  { key: 'excited',   emoji: '🤩', label: '兴奋',   color: '#ff9f8f' },
  { key: 'motivated', emoji: '💪', label: '有干劲', color: '#ff8a5e' },
  { key: 'proud',     emoji: '😎', label: '得意',   color: '#5ebfa2' },
  { key: 'surprised', emoji: '😲', label: '惊讶',   color: '#f0a35e' },
  { key: 'tired',     emoji: '😪', label: '疲惫',   color: '#6fb7f0' },
  { key: 'sleepy',    emoji: '😴', label: '困倦',   color: '#8fa8c8' },
  { key: 'bored',     emoji: '😐', label: '无聊',   color: '#a8a29b' },
  { key: 'confused',  emoji: '😕', label: '困惑',   color: '#b0a4b2' },
  { key: 'anxious',   emoji: '😟', label: '焦虑',   color: '#e8b93a' },
  { key: 'lonely',    emoji: '🥺', label: '孤单',   color: '#a0b4c8' },
  { key: 'sad',       emoji: '😢', label: '难过',   color: '#9b8d95' },
  { key: 'cry',       emoji: '😭', label: '想哭',   color: '#7a86a8' },
  { key: 'angry',     emoji: '😠', label: '生气',   color: '#ff6f6f' },
  { key: 'sick',      emoji: '🤒', label: '不舒服', color: '#c98f8f' },
  { key: 'relieved',  emoji: '😮‍💨', label: '释然', color: '#7fb5c9' },
  { key: 'warm',      emoji: '🤗', label: '温暖',   color: '#f2a97e' },
  { key: 'party',     emoji: '🥳', label: '庆祝',   color: '#ffb347' },
  { key: 'annoyed',   emoji: '😤', label: '烦躁',   color: '#e07a5f' },
  { key: 'lost',      emoji: '😔', label: '失落',   color: '#8c9aab' },
  { key: 'helpless',  emoji: '🙃', label: '无奈',   color: '#c9a227' },
  { key: 'empty',     emoji: '😶', label: '空虚',   color: '#9aa0a6' },
  { key: 'overload',  emoji: '🤯', label: '崩溃',   color: '#b57edc' },
  { key: 'dizzy',     emoji: '🥴', label: '晕乎',   color: '#c2a878' },
  { key: 'lucky',     emoji: '🍀', label: '幸运',   color: '#4fae7a' }
]

function moodOf(key) {
  return MOODS.find(m => m.key === key) || { key, emoji: '🙂', label: '未知', color: '#b8a8b0' }
}

// 默认只展示这 8 个常用表情（2 行），其余折叠，点「展开」才加载渲染
const COMMON_KEYS = ['happy', 'love', 'calm', 'relaxed', 'tired', 'sad', 'anxious', 'angry']
const COMMON_MOODS = COMMON_KEYS
  .map(k => MOODS.find(m => m.key === k))
  .filter(Boolean)

/** ts -> HH:mm */
function fmtTime(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  const h = d.getHours()
  const m = d.getMinutes()
  return `${h < 10 ? '0' + h : h}:${m < 10 ? '0' + m : m}`
}

Page({
  data: {
    theme: 'theme-light',
    bgStyle: '',
    accentStyle: '',

    /* ---- 备忘 ---- */
    memos: [],   // [{id, title, content, updateTime, mood...}]
    title: '',   // 标题（选填）
    content: '',
    editingId: '', // 非空表示正在编辑某条备忘

    /* ---- 心情打卡（次要功能） ---- */
    moods: MOODS,             // 全量表情库（展开时才渲染）
    displayMoods: COMMON_MOODS, // 当前真正渲染的表情（默认 2 行常用）
    moodExpanded: false,
    moodPanelOpen: false,     // 心情选择面板：默认收起
    calOpen: false,           // 心情日历：默认收起
    today: '',
    selectedMood: '',    // 心情（选填）
    selectedMoodEmoji: '',
    selectedMoodLabel: '',
    selectedMoodColor: '',
    monthOffset: 0,
    monthLabel: '',
    weekdays: ['日', '一', '二', '三', '四', '五', '六'],
    calDays: [],
    selectedDate: '',    // 日历选中的日期
    dayList: [],         // 选中日期的全部记录
    monthCount: 0        // 本月打卡次数
  },

  onShow() {
    this.setData({ theme: getTheme(), today: today() })
    applyBg(this)
    this._syncMoods()
    this.load()
  },

  load() {
    const memos = (wx.getStorageSync(KEY) || [])
      .slice()
      .sort((a, b) => String(b.updateTime).localeCompare(String(a.updateTime)))
    this.setData({ memos })
    this.loadMood()
  },

  loadMood() {
    const t = this.data.today || today()
    const all = (wx.getStorageSync(MOOD_KEY) || [])
      .slice()
      .sort((a, b) => (b.ts || 0) - (a.ts || 0))
      .map(r => Object.assign({}, r, {
        info: moodOf(r.mood),
        time: fmtTime(r.ts)
      }))

    const selectedDate = this.data.selectedDate || t
    const dayList = all.filter(r => r.date === selectedDate)

    this.setData({ selectedDate, dayList })
    this.buildCalendar(all)
  },

  /**
   * 构建心情月历：每格直接显示当天的情绪表情
   *
   * 日历算法三件套（所有手写日历都是这个套路）：
   *   ① 这个月 1 号是星期几 → new Date(y, m, 1).getDay()，前面补几个空格子
   *   ② 这个月有几天      → new Date(y, m + 1, 0).getDate()
   *                          （下个月的第 0 天 = 这个月最后一天，这是 JS 的常用技巧）
   *   ③ 每天一组数据      → 从心情记录里筛出同一天的，取最新一条当主表情
   *
   * @param {Array} all 全部心情记录（已按时间倒序，所以 list[0] 就是最新一条）
   */
  buildCalendar(all) {
    const offset = this.data.monthOffset       // 0 = 本月，-1 = 上个月
    const base = new Date()
    base.setDate(1)                            // 先归到 1 号，避免 31 号 +1 个月跳到下下月
    base.setMonth(base.getMonth() + offset)
    const year = base.getFullYear()
    const month = base.getMonth()              // 0~11，显示时要 +1
    const monthLabel = `${year} 年 ${month + 1} 月`
    const startWeekday = new Date(year, month, 1).getDay()      // ① 1 号是周几
    const daysInMonth = new Date(year, month + 1, 0).getDate()  // ② 这个月共几天
    const t = today()
    const selectedDate = this.data.selectedDate

    const calDays = []
    // ① 1 号前面补空格子，让 1 号落在正确的星期列
    for (let i = 0; i < startWeekday; i++) calDays.push({ blank: true, key: 'b' + i })

    let monthCount = 0
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = fmtDate(new Date(year, month, d))
      const list = all.filter(r => r.date === dateStr)  // 这天记了几次心情
      const latest = list[0]                            // 最新一次，用来决定格子主表情
      monthCount += list.length
      calDays.push({
        date: dateStr,
        dayNum: d,
        emoji: latest ? latest.info.emoji : '',          // 主表情（没有就空着）
        emojis: list.map(r => r.info.emoji).slice(0, 3), // 最多 3 个，防止格子撑破
        color: latest ? latest.info.color : '',
        count: list.length,
        isToday: dateStr === t,
        isSelected: dateStr === selectedDate,
        key: dateStr                                    // wx:key 用它，日期天然唯一
      })
    }

    this.setData({ monthLabel, calDays, monthCount })
  },

  /* ============ 备忘 ============ */

  onTitle(e) {
    this.setData({ title: e.detail.value })
  },

  onInput(e) {
    this.setData({ content: e.detail.value })
  },

  /** 点击备忘：把标题、内容、心情一起带回顶部表单，改完点「保存修改」 */
  edit(e) {
    const id = e.currentTarget.dataset.id
    const memo = this.data.memos.find(m => m.id === id)
    if (!memo) return
    const info = memo.mood ? moodOf(memo.mood) : null

    this.setData({
      editingId: memo.id,
      title: memo.title || '',
      content: memo.content,
      selectedMood: memo.mood || '',
      selectedMoodEmoji: info ? info.emoji : '',
      selectedMoodLabel: info ? info.label : '',
      selectedMoodColor: info ? info.color : '',
      moodPanelOpen: false
    })
    this._syncMoods()
    wx.pageScrollTo({ scrollTop: 0, duration: 300 })
  },

  /** 长按删除 */
  del(e) {
    const id = e.currentTarget.dataset.id
    wx.showModal({
      title: '删除备忘',
      content: '确定删除这条备忘吗？',
      confirmColor: getAccent(),
      success: res => {
        if (res.confirm) {
          const memos = (wx.getStorageSync(KEY) || []).filter(m => m.id !== id)
          wx.setStorageSync(KEY, memos)
          this.load()
        }
      }
    })
  },

  /* ============ 心情打卡 ============ */

  /** 按展开状态决定渲染哪些表情（折叠时只渲染 2 行常用的 8 个） */
  _syncMoods() {
    let list = this.data.moodExpanded ? MOODS.slice() : COMMON_MOODS.slice()
    const sel = this.data.selectedMood
    // 折叠状态下如果选中的是"非常用"表情，也要让它留在界面上，避免看不到已选
    if (!this.data.moodExpanded && sel && !list.some(m => m.key === sel)) {
      const m = MOODS.find(x => x.key === sel)
      if (m) list = list.concat([m])
    }
    this.setData({ displayMoods: list })
  },

  /** 展开 / 收起全部表情：展开时才把 30 个表情加载进来渲染 */
  toggleMoods() {
    const expanded = !this.data.moodExpanded
    this.setData({ moodExpanded: expanded })
    this._syncMoods()
  },

  /** 展开 / 收起心情选择：默认收起，让备忘保持主角位置 */
  toggleMoodPanel() {
    this.setData({ moodPanelOpen: !this.data.moodPanelOpen })
  },

  /** 展开 / 收起心情日历 */
  toggleCal() {
    this.setData({ calOpen: !this.data.calOpen })
  },

  pickMood(e) {
    const key = e.currentTarget.dataset.k
    // 再点一次同一个表情 = 取消选择
    if (key === this.data.selectedMood) {
      this.setData({
        selectedMood: '',
        selectedMoodEmoji: '',
        selectedMoodLabel: '',
        selectedMoodColor: ''
      })
      this._syncMoods()
      return
    }
    const info = moodOf(key)
    this.setData({
      selectedMood: key,
      selectedMoodEmoji: info.emoji,
      selectedMoodLabel: info.label,
      selectedMoodColor: info.color
    })
  },

  /**
   * 一次性保存：
   * · 文字内容（必填）→ 存成一条备忘
   * · 心情表情（选填）→ 选了才额外记一条心情，并把这段文字当作这条心情的备注
   */
  saveAll() {
    const title = (this.data.title || '').trim()
    const content = (this.data.content || '').trim()
    if (!content) {
      wx.showToast({ title: '先写点什么吧～（必填）', icon: 'none' })
      return
    }

    // 心情（选填）先解析出来，备忘条目里也带一份，列表里就能直接显示
    const mood = this.data.selectedMood
    const info = mood ? moodOf(mood) : null
    const note = title ? `${title}：${content}` : content
    const editingId = this.data.editingId

    if (editingId) {
      // 编辑模式：更新原来那条，标题 / 内容 / 心情都能改
      this._updateMemo(editingId, { title, content, mood, info, note })
    } else {
      this._createMemo({ title, content, mood, info, note })
    }

    this.resetForm()
    this.setData({ selectedDate: this.data.today })
    this._syncMoods()
    wx.showToast({
      title: editingId ? '修改已保存 ✅' : (mood ? '备忘 + 心情已记录 💖' : '已记下备忘 📝'),
      icon: 'none'
    })
    this.load()
  },

  /** 清空表单：保存成功或取消编辑时调用 */
  resetForm() {
    this.setData({
      editingId: '',
      title: '',
      content: '',
      selectedMood: '',
      selectedMoodEmoji: '',
      selectedMoodLabel: '',
      selectedMoodColor: '',
      moodPanelOpen: false
    })
  },

  cancelEdit() {
    this.resetForm()
    this._syncMoods()
  },

  /**
   * 新建一条备忘（心情选填，选了就顺手多记一条心情）
   *
   * 一条备忘可能"顺便"产出一条心情记录，两者用 moodId 关联：
   *   memo_list 里存 moodId ──→ mood_records 里那条记录的 id
   * 这样编辑/删除心情时，才能准确找到对应的那条，而不是误删别人的。
   */
  _createMemo({ title, content, mood, info, note }) {
    let moodId = ''
    if (info) {
      moodId = uid()                                   // 先给心情记录分配 id
      const all = wx.getStorageSync(MOOD_KEY) || []
      // 心情记录里只存"最小的信息"：日期 + 表情 key + 文字，表情图/颜色到时候查表得出
      all.push({ id: moodId, date: this.data.today, mood, note, ts: Date.now() })
      wx.setStorageSync(MOOD_KEY, all)
      // 首页小组件用的一份当日摘要（避免小组件每次都全量遍历历史记录）
      wx.setStorageSync(MOOD_TODAY_KEY, {
        date: this.data.today,
        emoji: info.emoji,
        label: info.label
      })
    }

    // 备忘本体：id 用 uid()（时间戳+随机数），updateTime 用于列表排序
    const memo = { id: uid(), content, updateTime: formatTime(new Date()) }
    if (title) memo.title = title                      // 标题选填，没填就不存这个字段
    if (info) {
      // 把表情的展示信息冗余一份进备忘，列表渲染时不用再查表情库
      memo.mood = mood
      memo.moodEmoji = info.emoji
      memo.moodLabel = info.label
      memo.moodColor = info.color
      memo.moodId = moodId
    }
    const memos = wx.getStorageSync(KEY) || []
    memos.push(memo)
    wx.setStorageSync(KEY, memos)
  },

  /**
   * 更新已有备忘：标题 / 内容 / 心情都能改，并同步关联的心情记录
   * 难点在"心情可以被清空"：清空时不仅要删备忘上的字段，还要删掉对应的心情流水，
   * 否则日历上会留下一条删不掉的幽灵记录
   */
  _updateMemo(id, { title, content, mood, info, note }) {
    const memos = wx.getStorageSync(KEY) || []
    const m = memos.find(x => x.id === id)
    if (!m) return

    if (title) m.title = title
    else delete m.title
    m.content = content
    m.updateTime = formatTime(new Date())

    const all = wx.getStorageSync(MOOD_KEY) || []

    if (info) {
      m.mood = mood
      m.moodEmoji = info.emoji
      m.moodLabel = info.label
      m.moodColor = info.color

      const rec = m.moodId ? all.find(x => x.id === m.moodId) : null
      if (rec) {
        rec.mood = mood
        rec.note = note
      } else {
        // 原来没记心情（或是旧数据没有关联 id），补一条
        const newId = uid()
        all.push({ id: newId, date: this.data.today, mood, note, ts: Date.now() })
        m.moodId = newId
      }
      wx.setStorageSync(MOOD_KEY, all)
    } else {
      delete m.mood
      delete m.moodEmoji
      delete m.moodLabel
      delete m.moodColor
      if (m.moodId) {
        wx.setStorageSync(MOOD_KEY, all.filter(x => x.id !== m.moodId))
        delete m.moodId
      }
    }

    wx.setStorageSync(KEY, memos)
  },

  delMood(e) {
    const id = e.currentTarget.dataset.id
    wx.showModal({
      title: '删除心情',
      content: '确定删除这条心情记录吗？',
      confirmColor: getAccent(),
      success: res => {
        if (!res.confirm) return
        const all = (wx.getStorageSync(MOOD_KEY) || []).filter(r => r.id !== id)
        wx.setStorageSync(MOOD_KEY, all)
        this.load()
      }
    })
  },

  clearMood() {
    wx.showModal({
      title: '清空全部心情',
      content: '确定删除所有心情记录吗？此操作不可恢复哦',
      confirmColor: getAccent(),
      success: res => {
        if (!res.confirm) return
        wx.removeStorageSync(MOOD_KEY)
        wx.removeStorageSync(MOOD_TODAY_KEY)
        this.load()
      }
    })
  },

  /* ---------- 心情日历交互 ---------- */
  prevMonth() {
    this.setData({ monthOffset: this.data.monthOffset - 1 })
    this.load()
  },
  nextMonth() {
    this.setData({ monthOffset: this.data.monthOffset + 1 })
    this.load()
  },
  goCurrentMonth() {
    this.setData({ monthOffset: 0 })
    this.load()
  },
  onCalTap(e) {
    const d = e.currentTarget.dataset.date
    if (!d) return
    this.setData({ selectedDate: d })
    this.load()
  }
})
