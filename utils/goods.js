// utils/goods.js 物品「类型」的数据源（可自定义）
//
// 【为什么单独抽一个文件】
//   类型（衣物 / 书籍 / 数码…）原来写死在 goodsList.js 和 addGoods.js 里，
//   两个页面各抄一份，用户还改不了。现在统一放这里：
//     goodsList.js → 渲染「按类型筛选」的标签
//     addGoods.js  → 渲染「分类」下拉框 + 新建类型
//   用户新建的类型存本地缓存 goods_categories，重开小程序还在。
//
// 【和「位置标签」的区别】
//   位置标签（goods_tags）也是用户自己建，但「其他」是类型的兜底项、
//   不允许删除（否则新增物品时没有默认分类），所以类型单独维护一份。
//
// 【缓存说明】
//   第一次使用时把 DEFAULT_CATEGORIES 写进缓存，之后以缓存为准。
//   这样用户删掉默认类型后，不会因为"重新初始化"又冒出来。
//   缓存里存的是字符串数组 ['衣物', '书籍', ...]。
//   老版本存的是 [{ name, icon }]，读取时会自动迁移成字符串数组。

const KEY = 'goods_categories'
const USAGE_KEY = 'goods_category_usage'   // { 衣物: 12, 书籍: 3 } 记录用得多不多
const LAST_KEY = 'goods_last_category'     // 上一次给物品选的类型

// 首次使用时写入的默认类型（用户可在此基础上增删）
const DEFAULT_CATEGORIES = ['衣物', '书籍', '数码', '美妆', '零食', '家居', '文具', '药品', '其他']

// 「其他」是兜底类型：不允许删除，新增物品时也有它可选
const FALLBACK = '其他'

// 内存缓存：一个页面里会被调用很多次，不必每次都读一遍缓存
let _cache = null

/** 把任意数据整理成字符串数组，坏数据直接丢掉（同时兼容旧版的 { name, icon }） */
function normalize(raw) {
  if (!Array.isArray(raw)) return []
  const out = []
  raw.forEach(x => {
    let name = ''
    if (typeof x === 'string') name = x.trim()
    else if (x && typeof x.name === 'string') name = x.name.trim()
    if (!name || out.indexOf(name) !== -1) return   // 空名字 / 重复名直接跳过
    out.push(name)
  })
  return out
}

/** 取全部类型（没有就初始化一份默认的存进去） */
function getCategories() {
  if (_cache) return _cache
  let raw = []
  try {
    raw = wx.getStorageSync(KEY)
  } catch (e) {
    raw = []
  }
  let list = normalize(raw)
  if (!list.length) {
    list = DEFAULT_CATEGORIES.slice()
    try { wx.setStorageSync(KEY, list) } catch (e) {}
  } else if (JSON.stringify(raw) !== JSON.stringify(list)) {
    // 旧版缓存的元素是 { name, icon }，这里顺手写回成字符串数组
    try { wx.setStorageSync(KEY, list) } catch (e) {}
  }
  _cache = list
  return list
}

/** 写回缓存并同步内存缓存 */
function saveCategories(list) {
  _cache = list
  try { wx.setStorageSync(KEY, list) } catch (e) {}
  return list
}

/**
 * 新建一个类型
 * @return {{ ok:boolean, msg?:string, exist?:boolean, list?:Array }}
 *   exist=true 表示"已经有了"，调用方可以直接选中它，不用报错
 */
function addCategory(name) {
  const n = String(name == null ? '' : name).trim()
  if (!n) return { ok: false, msg: '类型名称不能为空' }
  if (n.length > 8) return { ok: false, msg: '名字太长了，8 个字以内' }
  const list = getCategories()
  if (list.indexOf(n) !== -1) return { ok: false, exist: true, msg: '已经有「' + n + '」这个类型了', list }
  const next = list.concat([n])
  return { ok: true, list: saveCategories(next) }
}

/**
 * 删除一个类型（只删分类标签，不会删物品）
 * 「其他」是兜底类型，不允许删，否则新增物品时没有默认值
 */
function removeCategory(name) {
  const n = String(name || '').trim()
  if (!n) return { ok: false, msg: '类型不存在' }
  if (n === FALLBACK) return { ok: false, msg: '「其他」是默认类型，不能删除' }
  const next = getCategories().filter(x => x !== n)
  // 万一「其他」被历史数据弄丢了，这里补回来
  if (next.indexOf(FALLBACK) === -1) next.push(FALLBACK)
  return { ok: true, list: saveCategories(next) }
}

/** 名字数组（picker 的 range 必须是字符串数组，所以单独提供一个副本） */
function getCategoryNames() {
  return getCategories().slice()
}

/* ---------------- 常用 / 最近使用 ---------------- */

function getUsage() {
  let raw = null
  try {
    raw = wx.getStorageSync(USAGE_KEY)
  } catch (e) {
    raw = null
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const out = {}
  Object.keys(raw).forEach(k => {
    const n = Number(raw[k])
    if (k && isFinite(n) && n > 0) out[k] = n
  })
  return out
}

/** 记一次使用：保存物品时调用，用于"常用类型"排序 */
function touchCategory(name) {
  const n = String(name == null ? '' : name).trim()
  if (!n) return
  const usage = getUsage()
  usage[n] = (usage[n] || 0) + 1
  try {
    wx.setStorageSync(USAGE_KEY, usage)
    wx.setStorageSync(LAST_KEY, n)
  } catch (e) {}
}

function getLastCategory() {
  try {
    const v = wx.getStorageSync(LAST_KEY)
    return typeof v === 'string' ? v : ''
  } catch (e) {
    return ''
  }
}

/**
 * 按使用次数排序后的类型列表
 * 常用类型排前面，没用过的保持默认顺序 —— 新增物品时不用每次滚一遍
 */
function getOrderedCategories() {
  const list = getCategories()
  const usage = getUsage()
  return list.slice().sort((a, b) => {
    const ua = usage[a] || 0
    const ub = usage[b] || 0
    if (ua !== ub) return ub - ua
    return list.indexOf(a) - list.indexOf(b)
  })
}

/**
 * 重命名类型（物品里的旧名字不会自动改，调用方需要自己决定是否迁移）
 * 重命名到已存在的名字时，等价于合并，返回 exist=true
 */
function renameCategory(oldName, newName) {
  const from = String(oldName == null ? '' : oldName).trim()
  const to = String(newName == null ? '' : newName).trim().slice(0, 8)
  if (!from || !to) return { ok: false, msg: '名称不能为空' }
  if (from === to) return { ok: true, exist: false }
  const list = getCategories()
  if (list.indexOf(from) === -1) return { ok: false, msg: '类型不存在' }
  if (from === FALLBACK) return { ok: false, msg: '「其他」是默认类型，不能改名' }
  const exist = list.indexOf(to) !== -1
  const next = []
  list.forEach(x => {
    if (x === from) {
      if (!exist) next.push(to)
    } else if (next.indexOf(x) === -1) {
      next.push(x)
    }
  })
  if (next.indexOf(FALLBACK) === -1) next.push(FALLBACK)
  saveCategories(next)
  return { ok: true, exist }
}

/** 按名字找下标，找不到返回 0（picker 的 value 越界会显示空白） */
function indexOfCategory(name) {
  const i = getCategories().indexOf(String(name || ''))
  return i < 0 ? 0 : i
}

module.exports = {
  KEY,
  DEFAULT_CATEGORIES,
  FALLBACK,
  getCategories,
  getCategoryNames,
  getOrderedCategories,
  getLastCategory,
  touchCategory,
  indexOfCategory,
  addCategory,
  removeCategory,
  renameCategory
}
