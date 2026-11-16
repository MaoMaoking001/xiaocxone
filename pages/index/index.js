// pages/index/index.js 首页 · 多功能记忆中心
//
// 【阅读顺序建议】
//   1. data                     —— 首页所有状态都在这，先看它知道页面上有什么
//   2. onShow / loadTools / loadWidgets —— 每次进首页时，数据是怎么从缓存拼出来的
//   3. 拖拽三兄弟 _beginDrag / _onDragMove / _endDrag —— 全文件最难的逻辑，见下方长注释
//   4. loadRecent               —— 唯一一个"读云端"的方法
//
// 【功能概览】
//   1. 首页小组件：独立于工具卡片的模块（类似手机桌面组件），用户自主开启、可单独拖动排序
//   2. 工具卡片支持"自主取舍"：排序态卡片右下角给【隐藏】按钮，点一下移出首页
//      （隐藏后只在「隐藏工具」独立页里管理，首页不再展示）
//   3. 排序体验：长按拖拽（按真实坐标命中，精准）+ 编辑模式下的 ↑↓ 按钮（拖动不便时的兜底）
//      小组件和工具卡片各自独立排序，互不影响
//   4. 主题色 / 自定义背景统一注入（accentStyle）
//
// 【注意】"工具卡片"和"小组件"是两套东西、两套编辑态，改代码时别混：
//   工具卡片 -> editMode / dragIndex / tools
//   小组件   -> widgetEditMode / widgetAddMode / wdragIndex / widgets
const {getTheme, getAccent} = require('../../utils/theme')
const { getDB } = require('../../utils/db')
const { applyBg } = require('../../utils/bg')
const { getOwnerIds } = require('../../utils/user')
const { buildWidget } = require('../../utils/widgets')
const {
  getVisibleTools, getHiddenNames,
  saveOrder, hideTool,
  getWidgetNames, toggleWidget, getWidgetOrder, saveWidgetOrder
} = require('../../utils/tools')

Page({
  // data 里的字段一旦被 setData 修改，wxml 里用到它的地方就会自动刷新
  data: {
    theme: 'theme-light',    // 'theme-light' / 'theme-dark'，挂在根节点上切换整套 CSS 变量
    bgStyle: '',             // 自定义背景的内联样式（由 applyBg 写入）
    accentStyle: '',         // 主题色 CSS 变量（--primary 等，由 applyBg 写入）
    total: 0,                // 云端物品总数（首页"共 N 件"用）
    recentList: [],          // 最近添加的 4 件物品
    loading: true,           // 云端数据加载中（控制骨架屏/loading 文案）

    /* ---- 首页小组件（独立模块，排序 / 添加只作用于小组件）---- */
    widgets: [],
    widgetEditMode: false,   // 小组件排序模式
    widgetAddMode: false,    // 添加小组件模式（在工具卡片上点 ＋）
    wdragIndex: -1,

    /* ---- 工具卡片（排序 / 恢复默认只作用于工具卡片）---- */
    tools: [],
    hiddenCount: 0,      // 已隐藏数量（只显示数量，具体管理在独立页）
    editMode: false,     // 工具排序模式：长按卡片 / 点「记忆小工具」右侧 ⇅ 进入
    dragIndex: -1        // 当前正在拖拽的卡片下标
  },

  // onShow 用而不是 onLoad：从工具页返回首页时也要重新读一遍
  // （用户可能在工具页里打卡、加物品，回来要让首页数字变新）
  onShow() {
    this.setData({ theme: getTheme() })   // 明暗主题
    applyBg(this)                        // 背景 + 主题色 + 字号，三样一起注入
    this.loadTools()                     // 工具卡片
    this.loadWidgets()                   // 小组件
    this.loadRecent()                    // 云端：物品总数 + 最近 4 件
  },

  /** 加载工具卡片：只加载"可见"的，已隐藏的一律不出现在首页 */
  loadTools() {
    const widgetNames = getWidgetNames()
    // getVisibleTools() 已经把"隐藏的工具"过滤掉了，这里再给每张卡补一个
    // widgetOn 标记，wxml 用它决定右上角显示「＋」还是「✓」
    const tools = getVisibleTools().map(t => Object.assign({}, t, {
      widgetOn: widgetNames.indexOf(t.name) >= 0
    }))
    const hiddenCount = getHiddenNames().length
    this.setData({ tools, hiddenCount })
    // 数据变了 → 卡片位置也变了 → 重新测量一遍坐标，拖拽才准
    this._measure('tools')
  },

  /** 加载首页小组件：按用户开启的工具 + 小组件自己的顺序拼装 */
  loadWidgets() {
    const names = getWidgetNames()   // 用户开启了哪些小组件（名字数组）
    const order = getWidgetOrder()   // 用户拖动过的顺序（名字数组）
    const map = {}
    getVisibleTools().forEach(t => { map[t.name] = t })  // 名字 → 工具对象，方便按名字取

    // 第一步：按用户拖出来的顺序取，取不到的（新增的 / 顺序表里没有的）先跳过
    const picked = []
    order.forEach(n => {
      if (names.indexOf(n) >= 0 && map[n]) picked.push(map[n])
    })
    // 第二步：把第一步漏掉的（开启了但还没排过序）补在后面
    names.forEach(n => {
      if (map[n] && picked.indexOf(map[n]) < 0) picked.push(map[n])
    })

    // buildWidget 负责"这个组件该显示什么字"，例如待办显示"还剩 3 项"
    const widgets = picked.map(t => buildWidget(t))
    this.setData({ widgets })
    this._measure('widgets')
  },

  /** 开关某个工具的首页小组件 */
  toggleWidgetTool(e) {
    const name = e.currentTarget.dataset.name
    const on = toggleWidget(name)
    wx.showToast({
      title: on ? '已添加到首页 🧩' : '已移除小组件',
      icon: 'none'
    })
    this.loadTools()
    this.loadWidgets()
  },

  /** 小组件上的「✕」直接移除 */
  removeWidget(e) {
    const name = e.currentTarget.dataset.name
    toggleWidget(name)
    wx.showToast({ title: '已移除小组件', icon: 'none' })
    this.loadTools()
    this.loadWidgets()
  },

  /* ================= 小组件排序（和工具卡片互相独立）================= */

  /** 只对小组件生效的排序模式 */
  enterWidgetEdit() {
    if (!this.data.widgets.length) {
      wx.showToast({ title: '还没有小组件，点「＋ 添加」', icon: 'none' })
      return
    }
    // 小组件排序只控制小组件：顺手退出工具侧的模式，避免两套编辑态混在一起
    this.setData({ widgetEditMode: true, widgetAddMode: false, editMode: false, dragIndex: -1 })
    wx.vibrateShort({ type: 'light' })
    this._measure('widgets')
  },

  /** 只对小组件生效的「添加」：进入后点工具卡片的 ＋，不进入工具排序 */
  enterAddWidget() {
    this.setData({ widgetAddMode: true, widgetEditMode: false, editMode: true })
    wx.vibrateShort({ type: 'light' })
    wx.showToast({ title: '点工具卡片右上角的 ＋ 添加小组件', icon: 'none' })
    this._measure('tools')
  },

  /** ✓ 完成：保存小组件顺序并退出小组件的两种模式 */
  finishWidgetEdit() {
    if (this.data.widgetEditMode) saveWidgetOrder(this.data.widgets.map(w => w.name))
    const patch = { widgetEditMode: false, widgetAddMode: false, wdragIndex: -1 }
    // 添加小组件模式借用了工具卡片的编辑态，退出时要一起清掉
    if (this.data.widgetAddMode) {
      patch.editMode = false
      patch.dragIndex = -1
    }
    this.setData(patch)
    wx.showToast({ title: '小组件已保存 ✨', icon: 'none' })
  },

  /** 只恢复小组件的顺序，不动工具卡片 */
  resetWidgetOrder() {
    wx.showModal({
      title: '恢复小组件默认顺序',
      content: '确定把首页小组件的顺序恢复成默认吗？（不会影响下面的工具卡片）',
      confirmColor: getAccent(),
      success: res => {
        if (!res.confirm) return
        wx.removeStorageSync('home_widgets_order')
        this.setData({ widgetEditMode: false, widgetAddMode: false, wdragIndex: -1 })
        this.loadWidgets()
      }
    })
  },

  /** 小组件上移 / 下移（拖动不便时的兜底） */
  moveWidget(e) {
    const idx = Number(e.currentTarget.dataset.index)
    const dir = Number(e.currentTarget.dataset.dir)
    const widgets = this.data.widgets.slice()
    const next = idx + dir
    if (next < 0 || next >= widgets.length) return
    const tmp = widgets[idx]
    widgets[idx] = widgets[next]
    widgets[next] = tmp
    this.setData({ widgets })
    saveWidgetOrder(widgets.map(w => w.name))
    wx.vibrateShort({ type: 'light' })
    this._measure('widgets')
  },

  /* ================= 工具卡片 ================= */

  _saveOrder() {
    saveOrder(this.data.tools.map(t => t.name))
  },

  // 读云端数据：物品总数 + 最近添加的 4 件
  // 用 Promise.all 是为了"两个请求同时发"，比串行快一倍
  // where({ ownerId }) 是数据隔离的关键：只查自己名下的物品
  loadRecent() {
    const db = getDB()                                  // 懒加载，云环境没准备好会返回 null
    if (!db) { this.setData({ loading: false }); return }
    this.setData({ loading: true })
    // 当前用户标识（openid 或本机 ID）；把历史别名一起带上，换身份后旧物品也不丢
    const ids = getOwnerIds()
    const ownerCond = ids.length > 1 ? { ownerId: db.command.in(ids) } : { ownerId: ids[0] }
    Promise.all([
      db.collection("goods").where(ownerCond).count(),              // 只要数量
      db.collection("goods")
        .where(ownerCond)
        .orderBy("createTime", "desc")                 // 按创建时间倒序 = 最新的在前
        .limit(4)                                      // 只取 4 条
        // 只取用得到的字段，省流量；位置优先用完整路径 locationPath
        .field({ name: true, category: true, locationPath: true, mainPosition: true, position: true })
        .get()
    ]).then(([countRes, listRes]) => {
      // 数组解构：[countRes, listRes] 分别对应上面两个 Promise 的结果
      this.setData({ total: countRes.total, recentList: listRes.data, loading: false })
    }).catch(() => this.setData({ loading: false }))    // 查询失败也不让页面卡在 loading
  },

  /** 点击卡片进入工具页（编辑模式下不跳转；待开发的占位卡只提示） */
  goTool(e) {
    if (this.data.editMode) return                     // 排序模式里点卡片不跳转
    // 刚才如果发生过拖动，抬手时的 tap 不该被当成"点击进入"
    if (this._drag && this._drag.moved) { this._drag = null; return }
    const ds = e.currentTarget.dataset                  // wxml 里 data-name / data-url / data-tab
    const tool = (this.data.tools || []).find(t => t.name === ds.name)
    if (!tool || tool.soon || !ds.url) {
      wx.showToast({
        title: '该工具还在开发中～欢迎在「我的 → 联系开发者」留言',
        icon: 'none',
        duration: 2200
      })
      return
    }
    if (ds.tab) wx.switchTab({ url: ds.url })
    else wx.navigateTo({ url: ds.url })
  },

  /** 点小组件同样直接进入对应工具页 */
  goWidget(e) {
    if (this.data.widgetEditMode || this.data.editMode) return
    if (this._drag && this._drag.moved) { this._drag = null; return }
    const url = e.currentTarget.dataset.url
    if (url) wx.navigateTo({ url })
  },

  /* ================= 显隐管理 ================= */

  /** 隐藏某个工具：首页立刻消失，可在下方「已隐藏 N 个工具」里恢复 */
  hideTool(e) {
    const name = e.currentTarget.dataset.name
    hideTool(name)
    this.loadTools()
    this.loadWidgets()
    // 入口在工具九宫格下面的「已隐藏 N 个工具」，不是「我的」页
    const n = getHiddenNames().length
    wx.showToast({ title: `已隐藏 · 点下方「已隐藏 ${n} 个工具」可恢复`, icon: 'none' })
  },

  /** 去独立页管理已隐藏的工具 */
  goHidden() {
    wx.navigateTo({ url: '/pages/tools/hidden/hidden' })
  },

  /* ================= 工具卡片排序（只管工具卡片） ================= */

  /** 进入工具排序模式：拖动排序 + ↑↓ 微调 + 🚫 隐藏 */
  enterEdit() {
    if (this.data.editMode && !this.data.widgetAddMode) return
    this.setData({ editMode: true, widgetAddMode: false })
    wx.vibrateShort({ type: 'light' })
    wx.showToast({ title: '编辑模式：拖动排序 / 🚫 隐藏', icon: 'none' })
    this._measure('tools')
  },

  /** ✓ 完成：只保存工具卡片顺序 */
  finishEdit() {
    this._saveOrder()
    this.setData({ editMode: false, widgetAddMode: false, dragIndex: -1 })
    wx.showToast({ title: '工具顺序已保存 ✨', icon: 'none' })
  },

  /** 只恢复工具卡片的顺序，不动小组件 */
  resetOrder() {
    wx.showModal({
      title: '恢复工具默认顺序',
      content: '确定把工具卡片的顺序恢复成默认吗？（已隐藏的工具会一起恢复显示，不影响首页小组件）',
      confirmColor: getAccent(),
      success: res => {
        if (!res.confirm) return
        wx.removeStorageSync('home_tools_order')
        wx.removeStorageSync('home_tools_hidden')
        this.setData({ editMode: false, widgetAddMode: false, dragIndex: -1 })
        this.loadTools()
        this.loadWidgets()
      }
    })
  },

  /** 「＋ 添加」：把隐藏的工具恢复回来（工具卡片区的添加） */
  addTool() {
    if (this.data.hiddenCount <= 0) {
      wx.showToast({ title: '所有工具都在首页啦～', icon: 'none' })
      return
    }
    this.goHidden()
  },

  /** 用 ↑↓ 按钮微调（拖动不方便时的兜底方案） */
  moveCard(e) {
    const idx = Number(e.currentTarget.dataset.index)
    const dir = Number(e.currentTarget.dataset.dir) // -1 上移 / 1 下移
    const tools = this.data.tools.slice()
    const next = idx + dir
    if (next < 0 || next >= tools.length) return
    const tmp = tools[idx]
    tools[idx] = tools[next]
    tools[next] = tmp
    this.setData({ tools })
    this._saveOrder()
    wx.vibrateShort({ type: 'light' })
    this._measure('tools')
  },

  /* ---------- 拖拽：按真实坐标命中，不再靠估算 ---------- */
  /*
   * 拖拽整体思路（4 步）：
   *   ① touchstart：记下"我按住了第几张卡"，并测量所有卡片的屏幕坐标
   *   ② touchmove ：手指移到哪，就查"这个坐标现在压在哪张卡上"（_hitIndex）
   *                  有变化就把卡片数组里两项交换位置，setData 重新渲染 → 视觉上跟手
   *   ③ 换位置后必须重新测量（_measure），因为卡片位置已经变了
   *   ④ touchend  ：如果真正移动过，就把新顺序写进缓存；否则当作一次点击
   *
   * 工具卡片和小组件共用这一套逻辑，用 kind 区分：
   *   kind = 'tools'   → 操作 data.tools，模式开关 editMode，拖拽下标字段 dragIndex
   *   kind = 'widgets' → 操作 data.widgets，模式开关 widgetEditMode，拖拽下标字段 wdragIndex
   */

  onTouchStart(e) {
    // 添加小组件模式下不允许拖拽工具卡片
    if (!this.data.editMode || this.data.widgetAddMode) return
    this._beginDrag('tools', Number(e.currentTarget.dataset.index), e.touches[0], 'dragIndex')
  },

  onWidgetTouchStart(e) {
    if (!this.data.widgetEditMode) return
    this._beginDrag('widgets', Number(e.currentTarget.dataset.index), e.touches[0], 'wdragIndex')
  },

  /**
   * ① 开始拖拽
   * @param {string} kind    'tools' | 'widgets'
   * @param {number} idx     被按住的是第几张卡（从 0 开始，来自 wxml 的 data-index）
   * @param {object} touch   手指对象，含 clientX / clientY（相对屏幕左上角）
   * @param {string} idxKey  把"当前拖到第几位"写进 data 的哪个字段
   */
  _beginDrag(kind, idx, touch, idxKey) {
    // this._drag 以下划线开头 = 自己内部用的变量，不放进 data，
    // 因为拖拽过程不需要渲染，放进 data 会白白触发 setData 影响流畅度
    this._drag = {
      kind,
      idxKey,
      initialIndex: idx,      // 按下时的位置（暂时没用到，留着调试用）
      currentIndex: idx,      // 当前拖到第几位，move 时要和它比较判断是否真的换了位置
      startX: touch.clientX,  // 起点，用来算手指移动了多少
      startY: touch.clientY,
      moved: false            // 是否真的拖动过（区分"点一下"和"拖一下"）
    }
    // 只把"正在拖的那张卡的下标"放进 data，wxml 靠它给卡片加放大/阴影的样式
    const patch = {}
    patch[idxKey] = idx
    this.setData(patch)
    this._measure(kind)       // 拖之前先量一遍每张卡的位置
  },

  /**
   * ② 测量每个元素在屏幕上的真实位置，结果存在 this._rects
   *
   * 为什么必须测量：页面是用 flex 网格排列的，卡片宽高由内容决定，
   * 靠"下标 × 卡片宽度"这种算法在 rpx 换算、换行、不同机型下都会算错，
   * 所以直接问系统"这张卡现在到底在屏幕的哪个矩形里"最可靠。
   *
   * wx.createSelectorQuery() 是官方查询布局的 API：
   *   .in(this)              —— 只在当前页面里查
   *   .selectAll('.tool-card') —— 选中所有工具卡片
   *   .boundingClientRect()  —— 拿每个元素的 left/top/width/height
   *   .exec()                —— 真正执行（前面都只是"描述"）
   *
   * kind: 'tools' 测工具卡片 / 'widgets' 测小组件
   */
  _measure(kind) {
    if (!kind && this._drag) kind = this._drag.kind
    const selector = kind === 'widgets' ? '.widget-card' : '.tool-card'
    const q = wx.createSelectorQuery().in(this)
    q.selectAll(selector).boundingClientRect(rects => {
      // 除了四条边，顺便把中心点算好，给 _hitIndex 的兜底逻辑用
      this._rects = (rects || []).map(r => ({
        left: r.left, right: r.right, top: r.top, bottom: r.bottom,
        cx: r.left + r.width / 2, cy: r.top + r.height / 2
      }))
    }).exec()
  },

  /**
   * ③ 手指坐标 (x, y) 现在压在哪张卡上？返回下标，没有就返回 -1
   *
   * 两步走：
   *   1. 精确判断：点在某个矩形范围内 → 直接返回它
   *   2. 兜底：手指落到卡片之间的空隙（网格有 gap）时，取"中心点离手指最近"的那张，
   *      否则在空隙里拖会突然不动，手感很差
   *
   * 距离用平方比较（不开根号），因为只比大小，省一次运算
   */
  _hitIndex(x, y) {
    const rects = this._rects || []
    if (!rects.length) return -1
    for (let i = 0; i < rects.length; i++) {
      const r = rects[i]
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return i
    }
    let best = -1, bestD = Infinity
    for (let i = 0; i < rects.length; i++) {
      const d = Math.pow(rects[i].cx - x, 2) + Math.pow(rects[i].cy - y, 2)
      if (d < bestD) { bestD = d; best = i }
    }
    return best
  },

  onGridTouchMove(e) {
    this._onDragMove(e, 'tools', 'editMode')
  },

  onWidgetTouchMove(e) {
    this._onDragMove(e, 'widgets', 'widgetEditMode')
  },

  /**
   * ④ 手指移动：核心只有一句 —— 把被拖的那项，从旧位置挪到新位置
   * modeKey 是对应模式的开关字段名（'editMode' / 'widgetEditMode'），
   * 不在排序模式时，这个函数什么也不做
   */
  _onDragMove(e, kind, modeKey) {
    const drag = this._drag
    if (!this.data[modeKey] || !drag || drag.kind !== kind) return
    const t = e.touches[0]
    const dx = t.clientX - drag.startX
    const dy = t.clientY - drag.startY
    // 阈值放到 16px：手指按下去难免抖 2~3px，不设阈值会被误判成"拖动"，
    // 导致本来想点进工具页，结果变成拖了一下
    if (Math.abs(dx) > 16 || Math.abs(dy) > 16) drag.moved = true

    // 手指现在压在第几号卡片上；和目标相同就不用动
    const target = this._hitIndex(t.clientX, t.clientY)
    if (target < 0 || target === drag.currentIndex) return

    // 数组换位三步：剪掉旧的 → 插到新位置 → 记下新下标
    // slice() 先复制一份：直接改 this.data 里的数组不会触发刷新，也不规范
    const listKey = kind === 'widgets' ? 'widgets' : 'tools'
    const list = this.data[listKey].slice()
    const [m] = list.splice(drag.currentIndex, 1)  // 取出被拖的那一项
    list.splice(target, 0, m)                      // 插到目标位置
    drag.currentIndex = target

    const patch = {}
    patch[listKey] = list
    patch[drag.idxKey] = target                    // 让高亮样式跟着走
    const that = this
    // setData 的第二个参数是"渲染完成后的回调"，
    // 必须等渲染完再测量，否则量到的还是旧坐标
    this.setData(patch, () => that._measure(kind))
    wx.vibrateShort({ type: 'light' })             // 轻微震动，手感提示
  },

  onGridTouchEnd() {
    this._endDrag('tools')
  },

  onWidgetTouchEnd() {
    this._endDrag('widgets')
  },

  /** ⑤ 抬手：真拖动过才保存顺序，只点一下则什么都不写（交给 goTool 处理跳转） */
  _endDrag(kind) {
    const drag = this._drag
    if (!drag || drag.kind !== kind) return
    if (drag.moved) {
      // 只存名字数组（例如 ['待办清单','习惯打卡']），下次进来按这个顺序还原
      if (kind === 'widgets') saveWidgetOrder(this.data.widgets.map(w => w.name))
      else this._saveOrder()
    }
    this._drag = null                                  // 清掉临时状态，避免下次误用
    const patch = {}
    patch[drag.idxKey] = -1                            // -1 = 没有正在拖的卡，样式复原
    this.setData(patch)
  },

  // 跳转到「添加物品」页（用 navigateTo：保留首页在栈里，可以返回）
  goAdd() { wx.navigateTo({ url: '/pages/addGoods/addGoods' }) },
  // 跳转到「物品列表」页。注意 goodsList 是 tabBar 页面，
  // tabBar 页面必须用 switchTab，用 navigateTo 会直接失败
  goList() { wx.switchTab({ url: '/pages/goodsList/goodsList' }) }
})
