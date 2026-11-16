// components/goods-fields/index.js 「一件物品」的通用表单
//
// 【为什么有这个组件】
//   单条添加和批量添加的每一条用的是同一套字段，抽成组件后加字段只改一处。
//
// 【它是"受控"的】
//   组件自己不保存数据，也不改 this.data.value，只负责显示 + 收集用户操作，
//   然后用 triggerEvent('change', { patch }) 把"要改哪些字段"交给页面，
//   由页面 setData。这样单条（form）和批量（batchRows[i]）能共用同一个组件。
//
// 【位置字段】
//   位置是一个输入框，填路径字符串（如「寝室/衣柜/第二层」）。
//   下面给一排「最近使用」的路径候选（页面通过 paths 传入），点一下直接填入；
//   点「＋」只抛 newplace 事件，弹窗与写缓存都放在页面。
Component({
  options: {
    // 让页面的表单样式（.form-row / .tag-item / .name-img …）能作用到组件内部，
    // 这样不用把 addGoods.wxss 里那几十行样式再抄一份
    styleIsolation: 'apply-shared'
  },

  properties: {
    // 一条物品的数据对象（由页面持有）
    value: { type: Object, value: {} },
    // 是否显示"分类"行 / "位置"行（批量模式下按归属模式动态开关）
    showCategory: { type: Boolean, value: false },
    showPosition: { type: Boolean, value: false },
    // 分类行是否显示「＋」新建按钮（批量每条时关掉，统一新建用上方那个）
    allowAddCategory: { type: Boolean, value: true },
    // 分类列表 / 今天（页面统一传，避免每个组件各读一次缓存）
    categoryList: { type: Array, value: [] },
    today: { type: String, value: '' },
    // 位置候选（页面统一维护，新建一个位置后所有组件都能看到）
    paths: { type: Array, value: [] }
  },

  data: {
    // picker 的 value 是下标，所以由分类名反查出来
    categoryIndex: 0,
    // 当前正在输入的字段名：小程序 input 没有 :focus，用它给那一行加高亮
    focusField: ''
  },

  observers: {
    'value.category, categoryList': function (cat, list) {
      const i = (list || []).indexOf(cat || '')
      this.setData({ categoryIndex: i < 0 ? 0 : i })
    }
  },

  methods: {
    /** 统一出口：把"要改的字段"打包交给页面 */
    _patch(patch) {
      this.triggerEvent('change', { patch })
    },

    /** 所有普通输入框共用：wxml 里写 data-f="name" 就知道改哪个字段 */
    onInput(e) {
      const f = e.currentTarget.dataset.f
      const v = e.detail.value
      this._patch({ [f]: v })
    },

    /** 输入框获得焦点：记住字段名，wxml 里据此给这一格加 .is-focus */
    onFocus(e) {
      const f = e.currentTarget.dataset.f || ''
      if (f !== this.data.focusField) this.setData({ focusField: f })
    },

    /** 失焦：只有失焦的还是当前字段才清掉（避免快速切换时误清） */
    onBlur(e) {
      const f = e.currentTarget.dataset.f || ''
      if (f === this.data.focusField) this.setData({ focusField: '' })
    },

    /** 分类下拉：picker 只回传下标，这里同时把名字一起发出去 */
    onCategory(e) {
      const idx = Number(e.detail.value)
      const name = this.data.categoryList[idx] || ''
      this._patch({ category: name, categoryIndex: idx })
    },

    /** 点「最近使用」的位置候选，直接填进路径输入框 */
    pickPath(e) {
      const p = e.currentTarget.dataset.path || ''
      this._patch({ locationPath: p })
    },

    /** 点「＋」新建位置：弹窗逻辑交给页面，组件只抛事件 */
    newPlace() {
      this.triggerEvent('newplace')
    },

    /** 清空保质期（日期 picker 点取消不会清空已选值，需要一个显式的清除入口） */
    clearExpiry() {
      this._patch({ expiryDate: '' })
    },

    /**
     * 保质期快捷档：以购买日（没填就用今天）为基准往后推 N 个月
     * 月末要小心：1/31 加一个月会溢出成 3/3，这里发现日号变了就回退到当月最后一天
     */
    quickExpiry(e) {
      const months = Number(e.currentTarget.dataset.m) || 0
      const base = this.data.value.purchaseDate || this.data.today
      if (!base) return
      const d = new Date(base.replace(/-/g, '/'))
      if (!d || isNaN(d.getTime())) return
      const day = d.getDate()
      d.setMonth(d.getMonth() + months)
      if (d.getDate() !== day) d.setDate(0)
      const pad = n => ('0' + n).slice(-2)
      this._patch({ expiryDate: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` })
    },

    /** 图片、新建分类这两个要做异步操作，交给页面处理 */
    tapImage() { this.triggerEvent('tapimage') },
    newCategory() { this.triggerEvent('newcategory') }
  }
})
