// utils/places.js 位置：可搜索的路径池
//
// 【为什么改成路径】
//   原来的三级树（房间 → 容器 → 层）强制逐级选择：
//   必须先生成房间，才能选容器；必须选了容器，才能选层。
//   现实里用户经常只记得「衣柜第二层」，或者「抽屉」属于哪个房间根本不确定，
//   逐级树反而挡住了录入。
//
//   现在位置就是一条路径字符串，例如「寝室/衣柜/第二层」：
//     · 1~4 段都行，可以只写「抽屉」
//     · 同名容器可以在不同房间重复，互不影响
//     · 录入时一个输入框 + 最近使用候选，不再弹窗建节点
//     · 保存时同时拆成 mainPosition/container/shelf 写库，
//       列表筛选仍用等值查询，老数据不用迁移
//
// 【缓存】
//   goods_place_paths  [{ path, count, last }]  路径池（最近使用 / 使用次数）
//   goods_place_tree / goods_tags                旧三级树的缓存，保留兼容，不再写入
const PATHS_KEY = 'goods_place_paths'
const TREE_KEY = 'goods_place_tree'
const TAGS_KEY = 'goods_tags'

const MAX_SEG = 12      // 每段最多字数，避免一条路径把筛选栏撑爆
const MAX_DEPTH = 4     // 最多 4 级：房间/柜子/层/格
const MAX_POOL = 60     // 路径池最多保留 60 条

/** 安全读缓存，坏数据一律当空处理 */
function readRaw(key, fallback) {
  try {
    const v = wx.getStorageSync(key)
    return v === '' || v === undefined ? fallback : v
  } catch (e) {
    return fallback
  }
}

function writeRaw(key, value) {
  try {
    wx.setStorageSync(key, value)
  } catch (e) {}
}

/**
 * 规范化路径
 *   · 支持「/」「\」「>」「›」「、」几种分隔符
 *   · 去掉每段首尾空格、空段、重复分隔符
 *   · 每段最多 12 字，最多 4 段
 * @return {string} 形如「寝室/衣柜/第二层」，非法输入返回 ''
 */
function normalizePath(input) {
  const raw = String(input == null ? '' : input)
  const parts = raw.split(/[\/\\>›、]+/).map(s => s.trim()).filter(Boolean)
  const segs = parts.slice(0, MAX_DEPTH).map(s => s.slice(0, MAX_SEG))
  return segs.join('/')
}

/**
 * 路径拆成筛选用的三个字段
 * 第 3 段及以后合并进 shelf（例如 寝室/衣柜/第三层/左侧 → shelf = 第三层/左侧），
 * 这样列表查询仍然能用等值条件，不用改成前缀正则。
 */
function splitPath(path) {
  const p = normalizePath(path)
  const segs = p ? p.split('/') : []
  return {
    locationPath: p,
    mainPosition: segs[0] || '',
    container: segs[1] || '',
    shelf: segs.slice(2).join('/')
  }
}

/** 三个旧字段拼回路径（老数据编辑时用） */
function joinPath(main, box, shelf) {
  return normalizePath([main, box, shelf].filter(Boolean).join('/'))
}

/** 读路径池，按最近使用排序 */
function readPool() {
  const raw = readRaw(PATHS_KEY, [])
  if (!Array.isArray(raw)) return []
  const out = []
  raw.forEach(x => {
    const p = typeof x === 'string' ? x : (x && x.path)
    const path = normalizePath(p)
    if (!path || out.some(o => o.path === path)) return
    out.push({
      path,
      count: (x && Number(x.count)) || 1,
      last: (x && Number(x.last)) || 0
    })
  })
  out.sort((a, b) => (b.last || 0) - (a.last || 0))
  return out
}

function writePool(list) {
  writeRaw(PATHS_KEY, (list || []).slice(0, MAX_POOL))
}

/**
 * 记一次使用（保存物品 / 应用筛选时调用）
 * 已存在就次数 +1、更新时间；不存在就插入；池子超过上限时丢最久没用的
 */
function touchPath(path) {
  const p = normalizePath(path)
  if (!p) return ''
  const list = readPool()
  const hit = list.find(x => x.path === p)
  if (hit) {
    hit.count += 1
    hit.last = Date.now()
  } else {
    list.push({ path: p, count: 1, last: Date.now() })
  }
  list.sort((a, b) => (b.last || 0) - (a.last || 0))
  writePool(list)
  return p
}

/** 最近使用的路径（筛选面板、录入页候选都用它） */
function getRecentPaths(limit) {
  migrateLegacyTree()   // 第一次读时把旧三级树展开进路径池
  const n = limit || 12
  return readPool().slice(0, n).map(x => x.path)
}

/** 按关键字搜路径池（位置面板里输入时用） */
function searchPaths(keyword, limit) {
  const kw = String(keyword == null ? '' : keyword).trim().toLowerCase()
  const list = readPool()
  const hit = kw ? list.filter(x => x.path.toLowerCase().indexOf(kw) !== -1) : list
  return hit.slice(0, limit || 20).map(x => x.path)
}

/** 从路径池移除（只影响候选，不影响已存物品） */
function removePath(path) {
  const p = normalizePath(path)
  if (!p) return
  writePool(readPool().filter(x => x.path !== p))
}

/**
 * 把一批已有路径补进池子（不增加使用次数）
 * 场景：从别的设备/旧版本同步下来的物品，路径不在本机池里，
 * 打开筛选面板时把它们补进去，用户就能直接点选。
 */
function seedPaths(paths) {
  const list = readPool()
  let changed = false
  ;(paths || []).forEach(raw => {
    const p = normalizePath(raw)
    if (!p || list.some(x => x.path === p)) return
    list.push({ path: p, count: 1, last: 0 })
    changed = true
  })
  if (changed) {
    list.sort((a, b) => (b.last || 0) - (a.last || 0))
    writePool(list)
  }
}

/** 物品的位置文案：优先完整路径，老数据用三级字段拼 */
function pathText(item) {
  if (!item) return ''
  if (item.locationPath) return item.locationPath
  return joinPath(item.mainPosition, item.container, item.shelf)
}

/* ================= 老数据迁移：三级树 → 路径池 =================
   旧版本存的是 goods_place_tree = { 寝室: { 衣柜: ['第一层'] } }。
   这里在第一次读路径池时把树展开成「寝室/衣柜/第一层」补进池子，
   用户之前建好的位置不必重新输入。读树失败就当没有，不影响新功能。 */
function readTree() {
  const t = readRaw(TREE_KEY, {})
  if (!t || typeof t !== 'object' || Array.isArray(t)) return {}
  return t
}

let _migrated = false

function migrateLegacyTree() {
  if (_migrated) return
  _migrated = true
  const tree = readTree()
  const paths = []
  Object.keys(tree).forEach(room => {
    const node = tree[room]
    const boxes = node && typeof node === 'object' && !Array.isArray(node) ? Object.keys(node) : []
    if (!boxes.length) {
      paths.push(room)
      return
    }
    boxes.forEach(box => {
      const layers = Array.isArray(node[box]) ? node[box] : []
      if (!layers.length) {
        paths.push(room + '/' + box)
        return
      }
      layers.forEach(layer => paths.push(room + '/' + box + '/' + layer))
    })
  })
  if (paths.length) seedPaths(paths)
}

module.exports = {
  PATHS_KEY,
  TREE_KEY,
  MAX_SEG,
  MAX_DEPTH,
  normalizePath,
  splitPath,
  joinPath,
  touchPath,
  getRecentPaths,
  searchPaths,
  removePath,
  seedPaths,
  pathText
}
