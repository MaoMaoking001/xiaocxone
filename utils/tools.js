// utils/tools.js 首页工具清单（显隐取舍 + 排序）的统一数据源
//
// 首页和「隐藏工具」独立页面共用这份清单，
// 避免两处各写一份导致"隐藏了却在另一个页面看不到"的不一致问题。

const ORDER_KEY = 'home_tools_order'      // 工具卡片展示顺序（只包含可见工具）
const HIDDEN_KEY = 'home_tools_hidden'    // 被用户隐藏的工具
const PREVIEW_KEY = 'home_tools_preview'  // 开启「首页小组件」的工具（独立小组件模块，和工具卡片分开）
const WIDGET_ORDER_KEY = 'home_widgets_order' // 小组件自己的排列顺序（和工具卡片互不影响）

// 图标尽量做到「一个工具一个专属图标」，并且和各自页面里的图标呼应；
// color 也错开，避免一排卡片看过去全是同一种颜色。
const DEFAULT_TOOLS = [
  { icon: '✅', name: '待办清单',   desc: '小事再也不忘',     url: '/pages/tools/todo/todo',               color: '#5ebfa2' },
  { icon: '🌱', name: '习惯打卡',   desc: '坚持的力量',       url: '/pages/tools/habit/habit',             color: '#f08a5d' },
  { icon: '📝', name: '备忘录',     desc: '随手记 + 心情打卡', url: '/pages/tools/memo/memo',              color: '#ff9f8f' },
  { icon: '🎂', name: '纪念日',     desc: '重要日子倒计时',   url: '/pages/tools/anniversary/anniversary', color: '#f6a5c0' },
  { icon: '🅰️', name: '每日单词',   desc: '点单词就能听发音', url: '/pages/tools/english/english',         color: '#a98cd0' },
  // 占位卡：功能还没做，点一下只提示联系开发者，不跳转页面（soon: true）
  { icon: '🛠️', name: '待开发工具', desc: '联系开发者增加',   url: '',                                     color: '#b7b3c2', soon: true }
]

/** 当前还存在的工具名（旧缓存里不存在的名字会被忽略） */
function getValidNames() {
  return DEFAULT_TOOLS.map(t => t.name)
}

function getHiddenNames() {
  const hidden = wx.getStorageSync(HIDDEN_KEY) || []
  if (!Array.isArray(hidden)) return []
  const valid = getValidNames()
  return hidden.filter(n => valid.indexOf(n) >= 0)
}

/** 首页要展示的工具（已排除被隐藏的） */
function getVisibleTools() {
  const hidden = getHiddenNames()
  const map = new Map(DEFAULT_TOOLS.map(t => [t.name, t]))
  const saved = wx.getStorageSync(ORDER_KEY) || []

  const ordered = []
  saved.forEach(name => {
    if (map.has(name) && hidden.indexOf(name) < 0) {
      ordered.push(map.get(name))
      map.delete(name)
    }
  })
  // 新增的、用户还没排过序的工具追加在后面
  const rest = []
  map.forEach(t => { if (hidden.indexOf(t.name) < 0) rest.push(t) })
  return ordered.concat(rest)
}

/** 被隐藏的工具（独立管理页用） */
function getHiddenTools() {
  const hidden = getHiddenNames()
  return DEFAULT_TOOLS.filter(t => hidden.indexOf(t.name) >= 0)
}

function saveOrder(names) {
  wx.setStorageSync(ORDER_KEY, names)
}

function hideTool(name) {
  const hidden = getHiddenNames().slice()
  if (hidden.indexOf(name) < 0) hidden.push(name)
  wx.setStorageSync(HIDDEN_KEY, hidden)
}

function showTool(name) {
  const hidden = getHiddenNames().filter(n => n !== name)
  wx.setStorageSync(HIDDEN_KEY, hidden)
}

function showAllTools() {
  wx.removeStorageSync(HIDDEN_KEY)
}

/* ===== 首页小组件（独立模块，用户自主选择开哪些）===== */

/** 已开启首页小组件的工具名（只保留现存且有小组件能力的工具） */
function getWidgetNames() {
  const list = wx.getStorageSync(PREVIEW_KEY) || []
  if (!Array.isArray(list)) return []
  const valid = DEFAULT_TOOLS.filter(t => !t.soon).map(t => t.name)
  return list.filter(n => valid.indexOf(n) >= 0)
}

function isWidgetOn(name) {
  return getWidgetNames().indexOf(name) >= 0
}

/** 开启 / 关闭某个工具的首页小组件 */
function setWidget(name, on) {
  const list = getWidgetNames().slice()
  const i = list.indexOf(name)
  if (on && i < 0) list.push(name)
  if (!on && i >= 0) list.splice(i, 1)
  wx.setStorageSync(PREVIEW_KEY, list)
  return !!on
}

function toggleWidget(name) {
  return setWidget(name, !isWidgetOn(name))
}

/* ===== 小组件自己的排序（与工具卡片顺序互不影响）===== */

function getWidgetOrder() {
  const list = wx.getStorageSync(WIDGET_ORDER_KEY) || []
  return Array.isArray(list) ? list : []
}

function saveWidgetOrder(names) {
  wx.setStorageSync(WIDGET_ORDER_KEY, names)
}

module.exports = {
  ORDER_KEY,
  HIDDEN_KEY,
  PREVIEW_KEY,
  WIDGET_ORDER_KEY,
  DEFAULT_TOOLS,
  getHiddenNames,
  getVisibleTools,
  getHiddenTools,
  saveOrder,
  hideTool,
  showTool,
  showAllTools,
  getWidgetNames,
  isWidgetOn,
  setWidget,
  toggleWidget,
  getWidgetOrder,
  saveWidgetOrder
}
