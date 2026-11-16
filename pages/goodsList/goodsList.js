// pages/goodsList/goodsList.js 物品收纳列表
//
// 【这个文件在做什么】
//   从云数据库集合 goods 里，分页读出"我自己的"物品，支持搜索、按位置/类型筛选、
//   显示保质期状态和存放天数，以及删除。
//
// 【云数据库（微信云开发）必懂的 8 个 API，本文件几乎全用到了】
//   db.collection('goods')        选中集合（相当于 MySQL 的一张表）
//   .where({...})                 条件（相当于 WHERE），支持 db.command 比较符
//   .orderBy('createTime','desc') 排序（相当于 ORDER BY createTime DESC）
//   .skip(n) / .limit(20)         跳过 n 条 / 只取 20 条（分页就靠这两个）
//   .field({name:true})           只取需要的字段（相当于 SELECT name）
//   .get()                        Promise，结果是 { data: [...] }
//   .count()                      Promise，结果是 { total: 数量 }
//   .doc(id).get() / .remove()    按记录 id 取一条 / 删一条
//   db.command（常写作 _）        比较符：_.lte(x) 小于等于、_.gte(x) 大于等于 …
//
// 【数据隔离】
//   每条物品都带 ownerId（见 utils/user.js）。所有查询、删除都带 ownerId 条件，
//   所以 A 用户永远查不到、也删不掉 B 用户的物品。
//
// 【其他功能】
//   1. 位置是"可搜索的路径"（如 寝室/衣柜/第二层），候选存在本地 goods_place_paths；
//      保存时拆成 mainPosition/container/shelf 三个字段，筛选仍走等值查询
//   2. 保质期：阈值可配（默认 30 天），过期/临期判定统一由 utils/remind.js 负责
//   3. 统计：总件数 + 过期/临期数量，点数字可直接筛选
//   4. 提醒：tabBar 角标 + 页面顶部提醒卡 + 每天首次弹窗（可免打扰、可逐条忽略）
//   5. 入库时长：显示"已存放 N 天"
const {getTheme, getAccent} = require('../../utils/theme')
const { applyBg } = require('../../utils/bg')
const { getDB } = require('../../utils/db')       // 懒加载云数据库，拿不到返回 null
const { getOwnerIds } = require('../../utils/user') // 当前用户的全部身份标识（含历史别名）
const places = require('../../utils/places')       // 位置层级：房间 → 容器 → 层
const { today, fmtDate, daysBetween } = require('../../utils/util')
const remind = require('../../utils/remind')       // 提醒规则：阈值 / 免打扰 / 忽略名单

const PAGE_SIZE = 20        // 每次加载 20 条（分页大小）
// 小程序端 .get() 单次最多返回 20 条（云函数端才是 100），所以按 20 一页循环拉
const STAT_PAGE = 20        // 统计/提醒每页条数
const STAT_MAX = 2000       // 保险上限，防止异常数据导致死循环

// 排序选项：界面上是一个 picker，value 存下标
const SORT_OPTIONS = [
  { key: 'createTime', label: '最新入库' },
  { key: 'expiry', label: '最早到期' },
  { key: 'price', label: '价格最高' },
  { key: 'name', label: '名称' }
]

// 排序方式 → 云端 orderBy 参数
// expiry 排序只保留填了保质期的物品（没填的存的是空字符串，升序会全部挤在最前面，很误导）
const SORT_MAP = {
  createTime: [['createTime', 'desc']],
  expiry: [['expiryDate', 'asc']],
  price: [['price', 'desc']],
  name: [['name', 'asc']]
}

// 使用状态的展示文案（'in_use' 不显示标签，让卡片保持清爽）
const STATUS_LABEL = {
  used_up: '已用完',
  given: '已送人',
  discarded: '已丢弃'
}

// 没有图片时缩略图的占位图标：按分类区分，一眼能分出"书"和"袜子"。
// 只覆盖默认分类，用户自建的类型统一落到 📦 兜底
const CAT_ICON = {
  衣物: '👕',
  书籍: '📚',
  数码: '📱',
  美妆: '💄',
  零食: '🍪',
  家居: '🛋️',
  文具: '✏️',
  药品: '💊',
  其他: '📦'
}

// 分类配色：只分 4 组（暖 / 冷 / 中性 / 主色兜底）。
// 9 个分类各配一色会很花，4 组既能一眼分出大类，又不破坏粉色主题
const CAT_TONE = {
  衣物: 'tone-warm',
  美妆: 'tone-warm',
  零食: 'tone-warm',
  数码: 'tone-cool',
  药品: 'tone-cool',
  书籍: 'tone-neutral',
  文具: 'tone-neutral',
  家居: 'tone-neutral'
}

// 【类型（分类）从哪来】
// 以前这里把 9 个类型写死在代码里，用户能看不能改。现在统一交给 utils/goods.js：
//   · 默认给一套（衣物 / 书籍 / 数码 …），第一次用时写进本地缓存 goods_categories
//   · 用户可以自己新建、长按删除，和「位置标签」一样能自己长出来
//   · 缓存里存的是字符串数组 ['衣物', ...]，所以 wxml 里直接用 {{item}}，不用 item.name
const { getCategories, addCategory, removeCategory, renameCategory } = require('../../utils/goods')

/**
 * 转义正则特殊字符。
 * 用户可能搜 "可乐(大瓶)"，括号在正则里是语法符号，不转义会报错或匹配错，
 * 所以先给这些字符加上反斜杠，再交给云数据库当正则用。
 */
function escapeRegExp(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * 计算"已存放多少天"
 * createTime 可能是 Date 对象（云端返回）也可能是字符串（本地缓存），
 * 所以三种情况都兼容；都没有就返回 null（页面就不显示这行字）
 */
function storedDays(item) {
  // 优先按"购买日期"算存放天数；只有没填购买日期时，才退回"入库时间"
  let base = ''
  if (item.purchaseDate) base = item.purchaseDate
  else if (item.createTime instanceof Date) base = fmtDate(item.createTime)
  else if (typeof item.createTime === 'string') base = item.createTime.slice(0, 10) // 取前 10 位 = YYYY-MM-DD
  if (!base) return null
  const d = daysBetween(base, today())
  return d >= 0 ? d : 0        // 未来日期（录错）当 0 天处理，不显示负数
}

/**
 * 保质期状态：委托给 utils/remind.js
 * 阈值（默认 30 天）在提醒设置页可改，这里绝不能写死，
 * 否则会出现"统计说临期 3 件、卡片上一个 tag 都不亮"的错位
 * soonDays 由调用方传进来：列表里 20 条只读一次配置，不必每件都读缓存
 */
function expiryState(item, soonDays) {
  return remind.stateOf(item, soonDays)
}

Page({
  data: {
    theme: 'theme-light',
    bgStyle: '',
    accentStyle: '',
    goodsList: [],
    searchKey: '',
    loading: false,
    hasMore: true,
    isEmpty: false,
    // ===== 正式筛选条件（首屏摘要 show 的是它们）=====
    // 位置是一条路径（寝室/衣柜/第二层），拆成三段做等值查询
    filterPath: '',
    activeTag: '',
    activeBox: '',
    activeShelf: '',
    // 类型支持多选：空数组 = 全部
    selectedCategories: [],
    // 到期：'' 不筛 / 'soon' 临期 / 'expired' 已过期
    expiryFilter: '',
    // 排序：createTime 最新入库 / expiry 最早到期 / price 价格最高 / name 名称
    sortKey: 'createTime',
    sortLabels: SORT_OPTIONS.map(o => o.label),
    sortIndex: 0,
    // 首屏只显示一行条件 chip，不再常驻各级标签
    filterChips: [],
    filterCount: 0,
    hasFilter: false,
    filterText: '全部物品',
    // ===== 底部筛选面板（草稿态，点「应用」才生效）=====
    filterOpen: false,
    draftPath: '',
    draftCats: [],
    draftExpiry: '',
    draftSortIndex: 0,
    placeOptions: [],
    catOptions: [],
    categoryList: [],
    // 统计（这三个是"全部"的数量，与点数字筛选出来的结果一致，含已忽略提醒的）
    total: 0,
    expiredCount: 0,
    soonCount: 0,
    // 提醒（只算"待处理"：排除用户已忽略的）
    remindList: [],      // 顶部提醒卡，最多 5 条
    remindExpired: 0,    // 待处理里已过期件数
    remindSoon: 0,       // 待处理里临期件数
    remindMore: 0,       // 提醒卡没列完的件数
    remindMoreType: ''   // 「查看全部」跳到哪个筛选
  },

  onShow() {
    // 提醒配置在 loadStats / loadList 里现读（用户可能刚在设置页改过）
    this.setData({ theme: getTheme() })
    applyBg(this)
    this.loadCategories()
    this.resetAndLoad()
  },

  /**
   * 读类型列表（用户可能在「添加物品」页刚建了新的，所以每次显示都重读一遍）
   * 已选中的类型如果被删了，直接从筛选条件里剔除，避免筛出空列表
   */
  loadCategories() {
    const list = getCategories()
    const selected = this.data.selectedCategories.filter(c => list.indexOf(c) !== -1)
    this.setData({ categoryList: list, selectedCategories: selected })
    this._buildCatOptions(selected)
    this._updateFilterText()
  },

  /** 把"选中了哪些类型"变成带 on 标记的数组，wxml 里直接判断 item.on */
  _buildCatOptions(cats) {
    const sel = cats || []
    this.setData({
      catOptions: getCategories().map(n => ({ name: n, on: sel.indexOf(n) !== -1 }))
    })
  },

  /**
   * 长按类型：让用户选"重命名 / 删除"
   * 「其他」是兜底类型，既不能改名也不能删
   */
  longPressCategory(e) {
    const name = e.currentTarget.dataset.cat
    if (!name) return
    if (name === '其他') {
      wx.showToast({ title: '「其他」是默认类型，不能改名或删除', icon: 'none' })
      return
    }
    wx.showActionSheet({
      itemList: ['重命名', '删除'],
      success: r => {
        if (r.tapIndex === 0) this.renameCat(name)
        else if (r.tapIndex === 1) this.delCategory(name)
      }
    })
  },

  /**
   * 重命名类型：本地改名 + 云端把该类型下的物品一起改过去
   * 改成已存在的名字等价于"合并"，renameCategory 会返回 exist
   */
  renameCat(name) {
    const that = this
    wx.showModal({
      title: '重命名类型',
      editable: true,
      placeholderText: '新名字（8 字以内），如「衣服」',
      confirmText: '保存',
      confirmColor: getAccent(),
      success: res => {
        if (!res.confirm) return
        // 和 addCategory 一样限制 8 个字，否则本地列表和云端物品会存成两个不同的名字
        const to = (res.content || '').trim().slice(0, 8)
        if (!to) {
          wx.showToast({ title: '名字不能为空', icon: 'none' })
          return
        }
        if (to === name) return
        const r = renameCategory(name, to)
        if (!r.ok) {
          wx.showToast({ title: r.msg || '改名失败', icon: 'none' })
          return
        }
        // 云端同步：把旧类型下的物品改成新名字，否则物品会挂着"已不存在的类型"
        const db = getDB()
        if (db) {
          const ids = getOwnerIds()
          const base = ids.length > 1
            ? { ownerId: db.command.in(ids) }
            : { ownerId: ids[0] }
          db.collection('goods')
            .where(Object.assign({}, base, { category: name }))
            .update({ data: { category: to } })
            .catch(() => wx.showToast({ title: '部分物品的类型没改到，可再试一次', icon: 'none' }))
        }
        // 面板里的草稿选择、已生效的筛选条件都跟着换名
        const drafts = that.data.draftCats.map(c => (c === name ? to : c))
        const applied = that.data.selectedCategories.map(c => (c === name ? to : c))
        that.setData({ draftCats: drafts, selectedCategories: applied })
        that._buildCatOptions(that.data.filterOpen ? drafts : applied)
        that._updateFilterText()
        that.resetAndLoad()
        wx.showToast({ title: r.exist ? '已合并到「' + to + '」' : '已改名', icon: 'none' })
      }
    })
  },

  /**
   * 删除类型：先数一下有多少物品在用，确认后把它们迁移到「其他」再删。
   * 这样不会再出现"类型删了、物品还挂着旧类型、筛选栏里永远找不到"的孤儿数据。
   */
  delCategory(e) {
    // 兼容两种调用：wxml 事件（对象）和长按菜单里直接传名字（字符串）
    const name = typeof e === 'string' ? e : e.currentTarget.dataset.cat
    if (!name) return
    if (name === '其他') {
      wx.showToast({ title: '「其他」是默认类型，不能删除', icon: 'none' })
      return
    }
    const that = this
    const db = getDB()
    const ids = getOwnerIds()
    const base = db && ids.length > 1
      ? { ownerId: db.command.in(ids) }
      : { ownerId: ids[0] }

    let itemCount = 0
    const countP = db
      ? db.collection('goods')
        .where(Object.assign({}, base, { category: name }))
        .count()
        .then(r => { itemCount = r.total || 0 })
        .catch(() => {})
      : Promise.resolve()

    countP.then(() => new Promise(resolve => {
      wx.showModal({
        title: '删除类型',
        content: itemCount > 0
          ? `有 ${itemCount} 件物品正在使用「${name}」，删除后它们会改为「其他」。确定删除吗？`
          : `确定删除类型「${name}」吗？`,
        confirmColor: getAccent(),
        success: r => resolve(!!r.confirm)
      })
    })).then(ok => {
      if (!ok) return
      const r = removeCategory(name)
      if (!r.ok) {
        wx.showToast({ title: r.msg || '删除失败', icon: 'none' })
        return
      }
      // 迁移在用物品，避免分类删除后物品变成孤儿数据
      if (db && itemCount > 0) {
        db.collection('goods')
          .where(Object.assign({}, base, { category: name }))
          .update({ data: { category: '其他' } })
          .catch(() => {})
      }
      const drafts = that.data.draftCats.filter(c => c !== name)
      const applied = that.data.selectedCategories.filter(c => c !== name)
      that.setData({ draftCats: drafts, selectedCategories: applied })
      that._buildCatOptions(that.data.filterOpen ? drafts : applied)
      that._updateFilterText()
      that.resetAndLoad()
      wx.showToast({ title: '已删除并迁移', icon: 'none' })
    })
  },

  /** 在筛选面板里新建类型：建完直接勾上 */
  addCategoryInline() {
    const that = this
    wx.showModal({
      title: '新建类型',
      editable: true,
      placeholderText: '如：乐器、玩具、护肤品',
      confirmText: '新建',
      confirmColor: getAccent(),
      success: res => {
        if (!res.confirm) return
        const name = (res.content || '').trim()
        if (!name) {
          wx.showToast({ title: '名字不能为空', icon: 'none' })
          return
        }
        const r = addCategory(name)
        if (!r.ok && !r.exist) {
          wx.showToast({ title: r.msg || '新建失败', icon: 'none' })
          return
        }
        if (that.data.filterOpen) {
          const drafts = that.data.draftCats.concat(name)
          that.setData({ draftCats: drafts })
          that._buildCatOptions(drafts)
        } else {
          const applied = that.data.selectedCategories.concat(name)
          that.setData({ selectedCategories: applied })
          that._buildCatOptions(applied)
          that._updateFilterText()
          that.resetAndLoad()
        }
        wx.showToast({ title: r.exist ? '已有这个类型' : '已新建「' + name + '」', icon: 'none' })
      }
    })
  },

  /* ============ 筛选面板（底部弹层）============ */

  /** 打开面板：把当前条件复制成草稿，取消/关闭不影响已生效的筛选 */
  openFilter() {
    // 把列表里出现过的路径补进池子（跨设备 / 旧数据的路径池可能还没收录）
    if (this._seenPaths && this._seenPaths.length) places.seedPaths(this._seenPaths)
    this.setData({
      filterOpen: true,
      draftPath: this.data.filterPath,
      draftCats: this.data.selectedCategories.slice(),
      draftExpiry: this.data.expiryFilter,
      draftSortIndex: this.data.sortIndex,
      placeOptions: places.getRecentPaths(24)
    })
    this._buildCatOptions(this.data.selectedCategories)
  },

  closeFilter() {
    this.setData({ filterOpen: false })
  },

  /** 输入路径时实时过滤候选（路径池里有就直接点，没有就直接用输入值筛选） */
  onDraftPath(e) {
    const v = e.detail.value
    this.setData({
      draftPath: v,
      placeOptions: places.searchPaths(v, 24)
    })
  },

  pickDraftPath(e) {
    this.setData({ draftPath: e.currentTarget.dataset.path || '' })
  },

  clearDraftPath() {
    this.setData({ draftPath: '' })
  },

  /**
   * 长按位置候选：从本地路径池里删掉
   * 只清候选，不动已经存了这条路径的物品（位置还挂在物品上）
   */
  delPlacePath(e) {
    const path = e.currentTarget.dataset.path || ''
    if (!path) return
    wx.showModal({
      title: '删除这个位置',
      content: `「${path}」会从常用候选里移除；如果还有物品放在这个位置，下次打开面板仍会出现。`,
      confirmColor: getAccent(),
      success: res => {
        if (!res.confirm) return
        places.removePath(path)
        // 本次会话也别再从"列表里出现过的路径"补回来，否则删完立刻又冒出来
        const p = places.normalizePath(path)
        this._seenPaths = (this._seenPaths || []).filter(x => x !== p)
        // 按当前输入关键字重算候选，删完列表立刻更新
        this.setData({ placeOptions: places.searchPaths(this.data.draftPath, 24) })
        wx.showToast({ title: '已移除', icon: 'none' })
      }
    })
  },

  /** 类型多选：再点一次取消 */
  toggleDraftCat(e) {
    const name = e.currentTarget.dataset.cat
    if (!name) return
    const list = this.data.draftCats.slice()
    const i = list.indexOf(name)
    if (i >= 0) list.splice(i, 1)
    else list.push(name)
    this.setData({ draftCats: list })
    this._buildCatOptions(list)
  },

  setDraftExpiry(e) {
    this.setData({ draftExpiry: e.currentTarget.dataset.t || '' })
  },

  setDraftSort(e) {
    this.setData({ draftSortIndex: Number(e.currentTarget.dataset.i) })
  },

  /**
   * 应用：路径拆成三段写进查询条件，类型多选交给 _.in
   * 只有点这里才真正 reload，面板里怎么点都不会闪列表
   */
  applyFilter() {
    const seg = places.splitPath(this.data.draftPath)
    if (seg.locationPath) places.touchPath(seg.locationPath)
    const idx = this.data.draftSortIndex
    const opt = SORT_OPTIONS[idx] || SORT_OPTIONS[0]
    this.setData({
      filterOpen: false,
      filterPath: seg.locationPath,
      activeTag: seg.mainPosition,
      activeBox: seg.container,
      activeShelf: seg.shelf,
      selectedCategories: this.data.draftCats.slice(),
      expiryFilter: this.data.draftExpiry,
      sortKey: opt.key,
      sortIndex: idx
    })
    this._buildCatOptions(this.data.draftCats)
    this._updateFilterText()
    this.resetAndLoad()
  },

  /** 重置：清空全部条件（含搜索词） */
  resetFilter() {
    clearTimeout(this._searchTimer)
    this.setData({
      filterOpen: false,
      filterPath: '',
      activeTag: '',
      activeBox: '',
      activeShelf: '',
      selectedCategories: [],
      expiryFilter: '',
      sortKey: 'createTime',
      sortIndex: 0,
      searchKey: '',
      draftPath: '',
      draftCats: [],
      draftExpiry: '',
      draftSortIndex: 0
    })
    this._buildCatOptions([])
    this._updateFilterText()
    this.resetAndLoad()
  },

  /**
   * 点顶部统计面板：按到期状态筛选（再点一次同一个就取消）
   * data-t：'' 全部 / 'soon' 即将过期 / 'expired' 已过期
   * 只改一个状态字段，真正过滤交给 loadList 拼进数据库条件
   */
  tapExpiryStat(e) {
    const t = e.currentTarget.dataset.t || ''
    const next = this.data.expiryFilter === t ? '' : t
    this.setData({ expiryFilter: next })
    this._updateFilterText()
    this.resetAndLoad()
  },

  /** 点摘要 chip 上的 × ：只移除这一个条件 */
  removeFilterItem(e) {
    const key = e.currentTarget.dataset.key
    const value = e.currentTarget.dataset.value
    if (key === 'place') {
      this.setData({ filterPath: '', activeTag: '', activeBox: '', activeShelf: '' })
    } else if (key === 'cat') {
      const next = this.data.selectedCategories.filter(c => c !== value)
      this.setData({ selectedCategories: next })
      this._buildCatOptions(next)
    } else if (key === 'expiry') {
      this.setData({ expiryFilter: '' })
    } else if (key === 'search') {
      clearTimeout(this._searchTimer)
      this.setData({ searchKey: '' })
    }
    this._updateFilterText()
    this.resetAndLoad()
  },

  /** 兼容旧入口：清空全部条件（含搜索词） */
  clearFilter() {
    this.resetFilter()
  },

  /** 生成首屏摘要 chips + 一句文案 */
  _updateFilterText() {
    const chips = []
    if (this.data.filterPath) {
      chips.push({ id: 'place', key: 'place', value: this.data.filterPath, label: this.data.filterPath })
    }
    this.data.selectedCategories.forEach(c => {
      chips.push({ id: 'cat:' + c, key: 'cat', value: c, label: c })
    })
    if (this.data.expiryFilter === 'expired') chips.push({ id: 'expiry', key: 'expiry', value: 'expired', label: '已过期' })
    else if (this.data.expiryFilter === 'soon') chips.push({ id: 'expiry', key: 'expiry', value: 'soon', label: '即将过期' })
    if (this.data.searchKey) {
      chips.push({ id: 'search', key: 'search', value: this.data.searchKey, label: '搜「' + this.data.searchKey + '」' })
    }
    this.setData({
      filterChips: chips,
      filterCount: chips.length,
      hasFilter: chips.length > 0,
      filterText: chips.length ? chips.map(c => c.label).join(' · ') : '全部物品'
    })
  },

  /* ============ 加载 ============ */

  resetAndLoad() {
    // 递增序号 = 作废所有还在飞行的列表请求（切换筛选/排序时旧结果不能回写）
    this._listSeq = (this._listSeq || 0) + 1
    this.setData({ goodsList: [], hasMore: true, isEmpty: false, loading: false })
    return Promise.all([this.loadList(), this.loadStats()])
  },

  /**
   * 统计 + 提醒（一次查询喂三个地方：统计面板、提醒卡、tabBar 角标）
   *
   * 为什么只查"到期日 <= 阈值"这一批：
   *   过期和临期本来就都在这个范围里，一次取回来本地分组，比发三次 count 省事
   *
   * 口径说明（很重要，不然数字对不上）：
   *   统计面板 expiredCount / soonCount = 全部，点进去筛选能看到（含已忽略的）
   *   提醒卡 / 角标 = 待处理，排除用户点过「忽略」的
   */
  loadStats() {
    const db = getDB()
    if (!db) return Promise.resolve()
    const ids = getOwnerIds()
    const _ = db.command                       // 比较符入口，_.lte(x) = 小于等于 x
    const cfg = remind.getConfig()
    const soon = remind.soonLimit(cfg.soonDays) // 阈值可配，不能写死 30
    const t = today()
    // 统计也有并发：旧请求回来时如果已经有更新的请求，就别再覆盖界面
    const seq = this._statsSeq = (this._statsSeq || 0) + 1
    // 一个用户可能同时有"本机 ID + openid"两个标识，用 in 一并查出来
    const base = ids.length > 1 ? { ownerId: _.in(ids) } : { ownerId: ids[0] }

    // 请求 1：总件数（只查数量，不取数据，最省流量）
    db.collection('goods').where(base).count()
      .then(r => { if (seq === this._statsSeq) this.setData({ total: r.total }) })
      .catch(() => {})

    // 请求 2：把所有"已过期 + 临期"的物品完整拉回（分批循环，不再被 limit(100) 截断）
    return this._fetchAllDue(db, base, _.lte(soon))
      .then(all => {
        if (seq !== this._statsSeq) return
        // 已用完 / 已送人 / 已丢弃的物品不再计入到期统计与提醒（老数据没有 status，算在用）
        all = all.filter(x => x.expiryDate && (!x.status || x.status === 'in_use'))
        // 按日期升序 = 最紧急的排最前（过期最久 → 快到期）
        all.sort((a, b) => (a.expiryDate < b.expiryDate ? -1 : 1))
        const expired = all.filter(x => x.expiryDate < t)
        const soonList = all.filter(x => x.expiryDate >= t)

        this.setData({ expiredCount: expired.length, soonCount: soonList.length })

        // 待处理：排除用户已忽略的，并补上展示文案
        const pending = all
          .filter(x => !remind.isMuted(x._id))
          .map(x => {
            const st = remind.stateOf(x, cfg.soonDays)
            return {
              _id: x._id,
              name: x.name || '未命名',
              expiryDate: x.expiryDate,
              status: st.status,
              days: st.days,
              text: remind.textOf(st.status, st.days)
            }
          })
        const pendingExpired = pending.filter(x => x.status === 'expired').length
        const pendingSoon = pending.length - pendingExpired
        // 卡片只放最紧急的 3 条，再多就太长，剩下的走「查看全部」
        const shown = pending.slice(0, 3)

        // 完整待处理 id 列表放在页面实例上（不渲染，所以不进 data）：
        // 「一键忽略」要忽略的是全部待处理，不能只忽略卡片上显示的那 3 条
        this._pendingIds = pending.map(x => x._id)

        this.setData({
          remindList: shown,
          remindExpired: pendingExpired,
          remindSoon: pendingSoon,
          remindMore: pending.length - shown.length,
          remindMoreType: pendingExpired > 0 ? 'expired' : 'soon'
        })

        this._setBadge(pending.length, cfg)

        // 每天首次弹窗（免打扰 / 已弹过 / 没有待处理 / 本次已弹过 都不弹）
        // _noticeShown 是页面级标记：关掉"每天只弹一次"后，搜索、筛选、删除都会
        // 重新 loadStats，没有这个标记会被连着弹十几次
        if (pending.length && !this._noticeShown && remind.shouldNotify()) {
          this._noticeShown = true
          const first = pending[0]
          const lines = []
          if (pendingExpired) lines.push(`${pendingExpired} 件已过期`)
          if (pendingSoon) lines.push(`${pendingSoon} 件即将过期（${cfg.soonDays} 天内）`)
          wx.showModal({
            title: '⏰ 保质期提醒',
            content: lines.join('，') + `。\n最近一件：${first.name}，${first.expiryDate} 到期，${first.text}。`,
            confirmText: '去看看',
            cancelText: '今天不再提醒',
            confirmColor: getAccent(),
            success: r => {
              // 用户看过弹窗再记「今天已提醒」：
              // 原来弹之前就写，用户直接杀掉小程序的话这条提醒相当于被吞掉了
              remind.markNoticed()
              if (r.confirm) this._viewExpiry(pendingExpired > 0 ? 'expired' : 'soon')
            }
          })
        }
      })
      .catch(() => {})
  },

  /**
   * 分批把所有"到期日 <= 阈值"的物品完整拉回来
   * 以前是 .limit(100) 一次取，物品超过 100 件后统计与角标就封顶失真；
   * 这里按 20 条一页循环，直到某一页不满为止（.get() 小程序端单次上限就是 20）
   */
  _fetchAllDue(db, base, expiryCond) {
    const out = []
    const step = offset => db.collection('goods')
      .where(Object.assign({}, base, { expiryDate: expiryCond }))
      .field({ name: true, expiryDate: true, status: true })
      .skip(offset)
      .limit(STAT_PAGE)
      .get()
      .then(res => {
        const rows = res.data || []
        rows.forEach(r => out.push(r))
        if (rows.length >= STAT_PAGE && out.length < STAT_MAX) return step(offset + STAT_PAGE)
        return out
      })
    return step(0)
  },

  /**
   * tabBar 角标：把"待处理件数"标到「物品收纳」这个 tab 上
   * index: 1 是 app.json 里 tabBar 的第 2 项（物品收纳）
   * 非 tabBar 页面调用会失败，所以整体 try 掉，不影响主流程
   */
  _setBadge(count, cfg) {
    const c = cfg || remind.getConfig()
    try {
      if (!c.badge || !count) {
        wx.removeTabBarBadge({ index: 1 })
      } else {
        wx.setTabBarBadge({ index: 1, text: count > 99 ? '99+' : String(count) })
      }
    } catch (e) {}
  },

  /** 切到某个到期筛选（提醒卡、弹窗的「查看」都走这里） */
  _viewExpiry(status) {
    this.setData({ expiryFilter: status })
    this._updateFilterText()
    this.resetAndLoad()
  },

  /**
   * 加载一页列表（分页核心）
   * 思路：每次都"接着已有的条数往后取 20 条"，取完拼在已有数据后面
   *   skip(this.data.goodsList.length) 就是"跳过已经显示的条数"
   */
  loadList() {
    const db = getDB()
    if (!db) {
      wx.showToast({ title: '云环境未就绪，请稍后再试', icon: 'none' })
      return Promise.resolve()
    }
    // 每次请求领一个序号；回来时序号对不上，说明用户已经换了筛选/排序，
    // 这份结果直接丢弃 —— 否则会出现「切了筛选，列表还是上一个条件」的错乱
    const seq = this._listSeq = (this._listSeq || 0) + 1
    this.setData({ loading: true })

    const {
      searchKey, activeTag, activeBox, activeShelf,
      selectedCategories, expiryFilter, goodsList, sortKey
    } = this.data
    const _ = db.command
    const ids = getOwnerIds()
    // 关键：所有查询都带上 ownerId（含历史别名），保证数据查得到、且用户之间不可见
    let cond = ids.length > 1 ? { ownerId: _.in(ids) } : { ownerId: ids[0] }
    if (activeTag) cond.mainPosition = activeTag        // 第 1 级：房间
    if (activeBox) cond.container = activeBox           // 第 2 级：容器
    if (activeShelf) cond.shelf = activeShelf           // 第 3 级：层 / 格
    // 类型多选：空数组 = 不筛；多个类型用 in 一次查完
    if (selectedCategories.length) cond.category = _.in(selectedCategories)
    // 到期筛选（点统计面板进来的）
    //   expiryDate 存的是 'YYYY-MM-DD' 字符串，字典序和时间序一致，可以直接比大小
    //   没填保质期的是空字符串 ''，它比任何日期都"小"，所以查"已过期"时必须先排除掉，
    //   否则所有没填保质期的物品都会被当成过期
    if (expiryFilter) {
      const t = today()
      // 阈值跟提醒设置走：统计口径和列表筛选必须用同一个数
      const soon = remind.soonLimit(remind.getConfig().soonDays)
      cond.expiryDate = expiryFilter === 'expired'
        ? _.lt(t).and(_.neq(''))
        : _.gte(t).and(_.lte(soon))
      // 已用完 / 已送人 / 已丢弃 的东西不用再提醒，点进来也不该出现在结果里。
      // 用 nin 而不是 in(['in_use'])，是为了让没有 status 字段的老数据仍然算"在用"
      // —— 和顶部统计（_loadStats 里的 filter）保持同一个口径，数字和列表才对得上
      cond.status = _.nin(['used_up', 'given', 'discarded'])
    }
    // 按到期日排序时，没填保质期的物品（''）会全挤在最前面，所以只显示填了日期的
    if (sortKey === 'expiry' && !cond.expiryDate) cond.expiryDate = _.neq('')
    // 搜索范围：名称 / 备注 / 位置标签 / 具体位置 / 类型，任意命中即可
    // 用 _.or 组合多个正则条件，比只搜名称更符合「我放哪了」的查找习惯
    if (searchKey) {
      const re = db.RegExp({ regexp: escapeRegExp(searchKey), options: 'i' })
      cond = _.and([cond, _.or([
        { name: re },
        { remark: re },
        { position: re },
        { locationPath: re },
        { mainPosition: re },
        { container: re },
        { shelf: re },
        { category: re }
      ])])
    }

    let query = db.collection('goods').where(cond)
    // 排序字段全部交给云端，分页才不会乱
    ;(SORT_MAP[sortKey] || SORT_MAP.createTime).forEach(o => {
      query = query.orderBy(o[0], o[1])
    })

    return query
      .skip(goodsList.length)              // 跳过已显示的，实现"下一页"
      .limit(PAGE_SIZE)
      .get()
      .then(res => {
        if (seq !== this._listSeq) return    // 结果已过期，不覆盖界面
        const raw = res.data || []
        // 记录出现过的位置路径，打开筛选面板时可当候选（路径池可能还没积累到）
        if (!this._seenPaths) this._seenPaths = []
        raw.forEach(it => {
          const p = places.pathText(it)
          if (p && this._seenPaths.indexOf(p) === -1) this._seenPaths.push(p)
        })
        // 云端只存原始数据，展示用的图标 / 过期文案在这里算好再交给 wxml
        const soonDays = remind.getConfig().soonDays   // 一批只读一次配置
        const list = raw.map(it => {
          const exp = expiryState(it, soonDays)
          const days = storedDays(it)
          const storedText = days === null ? '' : (days === 0 ? '今天刚入库' : `已存放 ${days} 天`)
          const priceText = (it.price !== null && it.price !== undefined) ? '¥' + it.price : ''
          // 购买日 · 价格 · 存放天数 拼成一句：卡片上只占一行，
          // 也不会出现"某一项为空留下孤零零的分隔点"
          const metaText = [it.purchaseDate, priceText, storedText].filter(Boolean).join(' · ')
          // 位置：完整路径 + 老数据的自由补充（如"靠窗一侧"），拼成一句给卡片用
          const placeText = places.pathText(it)
          const placeLine = [placeText, (it.position || '').trim()].filter(Boolean).join(' · ')
          return Object.assign({}, it, {    // 用 Object.assign 复制一份再加字段，不改原对象
            // 没有图片时卡片左边的占位图标：按分类取，取不到就用盒子兜底
            icon: CAT_ICON[it.category] || '📦',
            // 分类标签的色调（暖 / 冷 / 中性 / 主色），用户自建分类落到主色
            catClass: CAT_TONE[it.category] || 'tone-main',
            expiryStatus: exp.status,
            expiryDays: exp.days,
            // 只给过期/临期写文案；远期的不显示"还剩 200 天"，免得卡片太吵
            expiryText: (exp.status === 'expired' || exp.status === 'soon')
              ? remind.textOf(exp.status, exp.days)
              : '',
            // 角标文案带上天数："已过期 3 天 / 剩 7 天"，扫一眼就知道哪个更急
            expiryTag: exp.status === 'expired'
              ? `已过期 ${exp.days} 天`
              : (exp.status === 'soon' ? (exp.days === 0 ? '今天到期' : `剩 ${exp.days} 天`) : ''),
            storedDays: days,
            storedText,
            metaText,
            // 数量：表单里本来就没有数量项，几乎全是默认 1 件，显示出来只是噪音；
            // 只有真的不止 1 件（批量导入的数据）才给角标
            qtyText: (it.quantity && it.quantity > 1) ? it.quantity + (it.unit || '件') : '',
            statusText: STATUS_LABEL[it.status] || '',
            inactive: !!it.status && it.status !== 'in_use',
            // 位置层级文案：寝室 · 衣柜 · 第二层（缺哪级跳过哪级）
            placeText,
            placeLine
          })
        })
        this.setData({
          goodsList: goodsList.concat(list),           // 拼在已有数据后面
          // 取满 20 条说明可能还有下一页；不满就是最后一页了
          hasMore: (res.data || []).length >= PAGE_SIZE,
          isEmpty: goodsList.length + list.length === 0 // 一条都没有 → 显示空状态
        })
      })
      .catch(() => {
        if (seq !== this._listSeq) return
        wx.showToast({ title: '加载失败，请检查网络', icon: 'none' })
      })
      .then(() => {
        if (seq === this._listSeq) this.setData({ loading: false })
      })
  },

  // 页面滚动到底部时，小程序自动调用这个"生命周期函数"（不需要手动绑定）
  onReachBottom() {
    if (this.data.loading || !this.data.hasMore) return   // 请求还没回来就先别叠加
    this.loadList()
  },

  /** 下拉刷新（goodsList.json 里 enablePullDownRefresh 已打开） */
  onPullDownRefresh() {
    this.resetAndLoad().then(() => wx.stopPullDownRefresh())
  },

  /** 图片加载失败（云文件被删/网络差）→ 退回 emoji 占位，避免整张卡片裂图 */
  onImgError(e) {
    const id = e.currentTarget.dataset.id
    const i = this.data.goodsList.findIndex(x => x._id === id)
    if (i < 0) return
    this.setData({ ['goodsList[' + i + '].fileID']: '' })
  },

  /**
   * 搜索框输入：300ms 防抖
   * 每敲一个字都查一次云端会产生大量请求，所以清掉上一个定时器、重新计时，
   * 只有"停下来 300ms 没再输入"才真正去查
   */
  onSearch(e) {
    this.setData({ searchKey: e.detail.value })
    this._updateFilterText()   // 搜索词也算筛选条件，摘要里要出现
    clearTimeout(this._searchTimer)
    this._searchTimer = setTimeout(() => this.resetAndLoad(), 300)
  },

  /** 空列表时的出口：只清搜索词，保留其他筛选条件 */
  clearSearch() {
    clearTimeout(this._searchTimer)
    this.setData({ searchKey: '' })
    this._updateFilterText()
    this.resetAndLoad()
  },

  /**
   * 忽略某件物品的到期提醒（"已处理"标记）
   * 只写本地忽略名单，不动云端数据、不删物品；
   * 之后可以从「提醒设置」里一键恢复
   */
  ignoreRemind(e) {
    const id = e.currentTarget.dataset.id
    if (!id) return
    remind.muteItem(id)
    wx.showToast({ title: '不再提醒这件', icon: 'none' })
    this.loadStats()   // 重算提醒卡与角标
  },

  /** 提醒卡底部「还有 N 件」：跳到最紧急的那个筛选 */
  viewRemindAll() {
    this._viewExpiry(this.data.remindMoreType || 'expired')
  },

  /**
   * 一键忽略：把当前所有待处理的到期提醒一次性静音
   * 忽略的是完整待处理列表（this._pendingIds），不是卡片上那 3 条；
   * 只写本地忽略名单，物品不删不改，随时能在「保质期提醒设置」里恢复
   */
  ignoreAllRemind() {
    const ids = this._pendingIds || []
    if (!ids.length) return
    wx.showModal({
      title: '一键忽略到期提醒',
      content: `将忽略 ${ids.length} 件物品的到期提醒，之后不再出现在提醒卡和 tabBar 角标里。\n物品本身不会被删除，可在「保质期提醒设置」里恢复。`,
      confirmText: '全部忽略',
      confirmColor: getAccent(),
      success: res => {
        if (!res.confirm) return
        remind.muteItems(ids)
        this._pendingIds = []   // 先清掉，防止连点两次拿旧列表再写一遍
        wx.showToast({ title: '已全部忽略', icon: 'none' })
        this.loadStats()   // 重算提醒卡与角标，待处理清空后卡片自动消失
      }
    })
  },

  /** 去提醒设置页（阈值 / 免打扰 / 角标 / 恢复忽略） */
  goRemindSetting() {
    wx.navigateTo({ url: '/pages/goodsRemind/goodsRemind' })
  },

  /** 点提醒卡里的一条：直接去编辑这件物品（改日期或删掉） */
  openRemindItem(e) {
    const id = e.currentTarget.dataset.id
    if (id) wx.navigateTo({ url: `/pages/addGoods/addGoods?id=${id}` })
  },

  goAdd() {
    wx.navigateTo({ url: '/pages/addGoods/addGoods' })
  },

  goEdit(e) {
    wx.navigateTo({ url: `/pages/addGoods/addGoods?id=${e.currentTarget.dataset.id}` })
  },

  delItem(e) {
    const id = e.currentTarget.dataset.id   // 要删的那条记录 _id
    wx.showModal({                          // 系统确认弹窗（删数据前一定要问一下）
      title: '确认删除',
      content: '删除后无法恢复，确定删除吗？',
      confirmColor: getAccent(),            // 按钮用主题色，和整体风格一致
      success: res => {
        if (!res.confirm) return
        const db = getDB()
        if (!db) return
        const myIds = getOwnerIds()
        // 二次校验归属：先按 id 取一次，确认是自己名下的（含历史身份），再删。
        // （.doc(id) 表示"定位到某一条记录"，只能用 _id）
        db.collection('goods').doc(id).get().then(r => {
          const data = r.data || {}
          if (data.ownerId && myIds.indexOf(data.ownerId) === -1) {
            wx.showToast({ title: '这不是你的物品哦', icon: 'none' })
            return
          }
          const fileID = data.fileID
          db.collection('goods').doc(id).remove().then(() => {
            // 文档删掉了，云存储里的图片也要删，否则存储只增不减
            if (fileID && fileID.indexOf('cloud://') === 0) {
              try {
                wx.cloud.deleteFile({ fileList: [fileID] }).catch(() => {})
              } catch (e) {}
            }
            // 顺手清掉这件物品的"忽略提醒"记录，避免本地忽略名单无限增长
            remind.unmuteItem(id)
            wx.showToast({ title: '删除成功' })
            this.resetAndLoad()
          }).catch(() => {
            wx.showToast({ title: '删除失败', icon: 'none' })
          })
        }).catch(() => {
          wx.showToast({ title: '删除失败', icon: 'none' })
        })
      }
    })
  }
})
