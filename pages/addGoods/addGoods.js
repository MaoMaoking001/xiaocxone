// pages/addGoods/addGoods.js 新增 / 编辑物品 + 批量添加
//
// 【三种用法，靠 url 参数区分（看 onLoad）】
//   /pages/addGoods/addGoods                 → 新增一条
//   /pages/addGoods/addGoods?id=xxx          → 编辑某条（读云端回填表单）
//   /pages/addGoods/addGoods?mode=batch      → 批量录入（一行一件，最后一次提交）
//
// 【这个文件必须掌握的 3 个写法】
//   1. setData({'form.name': v})   —— 只改嵌套对象里的一个字段。
//      不能写 this.data.form.name = v，那样不会触发界面刷新
//   2. 图片上传三步：
//        wx.chooseMedia 选图 → 本地临时路径先显示 → wx.cloud.uploadFile 传到云存储
//        上传成功拿到 fileID（云端文件地址），把它存进数据库；数据库里不存图片本身
//   3. 新增 vs 编辑：
//        有 _id → .doc(id).update({data})  改现有记录
//        没有   → .add({data})             新增一条
//
// 【数据隔离】新增时必须带 ownerId（谁加的归谁），编辑时先校验 ownerId 是不是自己的
//
// 【功能相关】
//   位置：一条路径字符串（如「寝室/衣柜/第二层」），可只写一级；
//         保存时拆成 mainPosition/container/shelf，并记进本地路径池当候选
//   保质期 / 使用期限（选填），到期后列表页会提醒
const {getTheme, getAccent} = require('../../utils/theme')
const { applyBg } = require('../../utils/bg')
const { today } = require('../../utils/util')
const { getDB } = require('../../utils/db')
const { getOwnerId, getOwnerIds, syncOpenId } = require('../../utils/user')
const places = require('../../utils/places')   // 位置层级：房间 → 容器 → 层
// 分类（类型）的数据源：默认 9 类 + 用户自建，和列表页共用同一份
// getOrderedCategories 按"用过的次数"排序，常用类型排在前面，不用每次滚下拉
const {
  getOrderedCategories,
  getLastCategory,
  touchCategory,
  indexOfCategory,
  addCategory
} = require('../../utils/goods')

// 自增序号，用来生成批量表单里每行的唯一 key。
// 不能用下标当 key：删掉中间一行后下标会重排，输入框内容会串行
let rowSeq = 0

/** 批量表单里的一条物品（除名称外所有字段都可留空） */
function newRow () {
  rowSeq += 1
  return {
    key: 'row_' + rowSeq,   // 模板里 wx:key 用它，保证删行后不错位
    name: '',
    locationPath: '',      // 位置路径，如「寝室/衣柜/第二层」（可只写一级）
    quantity: 1,           // 数量（默认 1）
    unit: '件',            // 单位
    status: 'in_use',      // 使用状态（批量默认在用）
    price: '',             // 购买价格（选填）
    purchaseDate: '',      // 购买时间（选填）
    expiryDate: '',        // 保质期（选填）
    fileID: '',            // 云存储图片地址（上传成功后才有）
    imgUrl: '',            // 本地临时预览图（马上能看到，不用等上传）
    uploading: false,
    remark: '',            // 备注（选填）
    // 下面两个只在"半统一"模式下用：
    //   选了「统一分类」→ 每条自己填位置路径
    //   选了「统一位置」→ 每条自己选分类，结果存 category / categoryIndex
    category: '',
    categoryIndex: indexOfCategory('其他')
  }
}

/** 这一条是不是完全没填（没填就自动跳过，不提示、不入库） */
function rowIsEmpty (r) {
  // 注意也算上"这行单独选过分类 / 位置"：只点了标签没写名称时不能当空白行静默跳过，
  // 否则用户以为添加了，其实被丢了
  return !r.name && !r.price &&
    !r.purchaseDate && !r.expiryDate && !r.remark && !r.imgUrl &&
    !r.category && !r.locationPath
}

/**
 * 价格输入 → 数字
 * 空字符串返回 null（表示"没填"）；非法 / 负数返回 NaN，由调用方提示，绝不能写进数据库
 */
function parsePrice (v) {
  const s = String(v == null ? '' : v).trim()
  if (!s) return null
  const n = Number(s)
  return isFinite(n) && n >= 0 ? n : NaN
}

/** 数量：没填按 1 件算；必须是大于 0 的数字，否则返回 NaN */
function parseQuantity (v) {
  const s = String(v == null ? '' : v).trim()
  if (!s) return 1
  const n = Number(s)
  return isFinite(n) && n > 0 ? Math.floor(n) : NaN
}

/** 单位：没填按「件」，最长 6 个字（避免脏数据把卡片撑破） */
function normUnit (v) {
  const s = String(v == null ? '' : v).trim()
  return s ? s.slice(0, 6) : '件'
}

Page({
  data: {
    theme: 'theme-light',
    bgStyle: '',
    accentStyle: '',
    mode: 'single',          // 'single' | 'batch'
    // 分类（类型）：不再写死，由 utils/goods.js 提供，用户能自己新建
    categoryList: [],        // picker 的 range 必须是字符串数组
    categoryIndex: 0,        // 当前选中的分类下标（loadCategories 会定位到上次用过的类型）
    submitting: false,
    today: today(),
    // 单条表单（图片的 imgUrl / uploading 也放在 form 里，和批量行结构一致）
    form: {
      _id: "",
      name: "",
      category: "",
      locationPath: "",      // 位置路径，如「寝室/衣柜/第二层」（可只写一级）
      position: "",          // 老数据的自由文本位置，只用于保留，不再单独录入
      quantity: 1,           // 数量
      unit: "件",            // 单位
      status: "in_use",      // 使用状态：in_use / used_up / given / discarded
      remark: "",
      purchaseDate: "",
      price: "",
      fileID: "",
      expiryDate: "",        // 保质期 / 使用期限（选填）
      // 图片的这两个字段也放进 form：组件统一从 value.imgUrl / value.uploading 取，
      // 这样单条和批量（batchRows 里的行）能用同一套模板
      imgUrl: '',
      uploading: false
    },
    // 批量表单：先选好归属规则，再一行一件地录
    // batchBindMode: 'category' 统一分类 / 'position' 统一位置标签 / 'both' 分类+位置一起绑
    batchBindMode: 'both',
    batchCategoryIndex: 0,   // 批量共用分类（loadCategories 会定位到上次用过的类型）
    batchLocationPath: '',   // 批量共用位置路径（统一位置时用，可从列表页带过来）
    pathFocus: false,        // 「统一位置」输入框是否正在输入（只为了加高亮边框）
    // 位置候选（最近使用的路径）：传给 goods-fields 显示成一排可点的标签
    paths: [],
    batchRows: [newRow()],
    batchResult: null
  },

  // options 就是页面路径问号后面那串参数，例如 ?id=abc&mode=batch
  // 注意：onLoad 只在页面第一次创建时执行一次，不会因为再次进入而重复
  onLoad(options) {
    this.setData({ theme: getTheme() })
    // 先把分类读进来（优先定位到上次用过的类型），后面处理 url 参数时才找得到下标
    this.loadCategories(true)
    // 位置候选（最近用过的路径），组件里点一下就能填
    this.loadPaths()
    // 进入时努力同步一次真实 openid（云函数已部署时最准确）
    // 异步的，不 await：同步失败也不影响用户继续填表
    syncOpenId()
    if (options.mode === 'batch') this.setData({ mode: 'batch' })
    // 从列表页「在该大类下批量添加」进来时，直接带上归属（大类 / 类型），
    // 并按传过来的内容自动选好归属模式：两个都有 → 分类+位置，只有一个 → 对应单项
    let hasPos = false
    let hasCat = false
    const urlPath = options.path || options.mainPosition
    if (urlPath) {
      let p = urlPath
      try {
        p = decodeURIComponent(urlPath)
      } catch (e) {}
      this.setData({ batchLocationPath: p })
      hasPos = !!this.data.batchLocationPath
    }
    if (options.category) {
      const catName = decodeURIComponent(options.category)
      // 分类是用户可自定义的，传过来的名字可能已经被删了，所以先确认它还在
      const ci = this.data.categoryList.indexOf(catName)
      if (ci >= 0) {
        this.setData({ batchCategoryIndex: ci })
        hasCat = true
      }
    }
    if (hasPos && hasCat) this.setData({ batchBindMode: 'both' })
    else if (hasPos) this.setData({ batchBindMode: 'position' })
    else if (hasCat) this.setData({ batchBindMode: 'category' })
    if (options.id) {
      this.setData({ mode: 'single', 'form._id': options.id })
      this.loadDetail(options.id)
    }
  },

  onShow() {
    applyBg(this)
  },

  /**
   * 读分类列表（类型）
   * @param {boolean} initial 首次进入传 true：默认选中「其他」
   *                          其它情况保留用户当前选择，只有当前分类被删了才重置
   *
   * picker 只认「字符串数组 + 下标」，所以这里只取名字做 range
   */
  loadCategories(initial) {
    const list = getOrderedCategories()
    const fb = list.indexOf('其他') < 0 ? 0 : list.indexOf('其他')
    const patch = { categoryList: list }
    if (initial) {
      // 默认选中上次用过的类型；没有记录（第一次用）才落回「其他」
      const last = getLastCategory()
      const li = last ? list.indexOf(last) : -1
      const idx = li >= 0 ? li : fb
      patch.categoryIndex = idx
      patch.batchCategoryIndex = idx
      if (!this.data.form.category) {
        // 注意：必须整体替换 form 对象。goods-fields 是靠"对象引用变了"才刷新的，
        // 用 'form.category' 这种路径写法时引用没变，组件不会重绘 ——
        // 表现就是新增时分类下拉框一片空白（其实数据里已经有值）
        patch.form = Object.assign({}, this.data.form, { category: list[idx] || '' })
      }
    } else {
      // 选中的类型被删掉了（找不到）→ 退回「其他」，避免 picker 显示空白
      const ci = list.indexOf(this.data.form.category)
      if (ci < 0) {
        patch.categoryIndex = fb
        patch.form = Object.assign({}, this.data.form, { category: list[fb] || '' })
      } else {
        patch.categoryIndex = ci
      }
      patch.batchCategoryIndex = this.data.batchCategoryIndex >= list.length
        ? fb
        : this.data.batchCategoryIndex
    }
    // 列表可能因为"常用类型"重排，批量每一条的 picker 下标要重新对齐
    this.setData(patch, () => this._syncBatchCatIndex())
  },

  /**
   * 读位置候选（最近使用的路径）
   * 组件里显示成一排标签，点一下直接填进路径输入框，不用每次手打
   */
  loadPaths() {
    this.setData({ paths: places.getRecentPaths(12) })
  },

  /**
   * 让批量每一行的分类 picker 下标与「有序分类列表」保持一致
   * picker 只认下标，列表一重排，旧下标就会指向别的类型
   */
  _syncBatchCatIndex() {
    const list = this.data.categoryList
    const fb = list.indexOf('其他') < 0 ? 0 : list.indexOf('其他')
    let changed = false
    const rows = this.data.batchRows.map(r => {
      const name = r.category || list[fb] || ''
      const i = list.indexOf(name)
      const idx = i < 0 ? fb : i
      if (r.categoryIndex === idx && r.category === name) return r
      changed = true
      return Object.assign({}, r, { categoryIndex: idx, category: name })
    })
    if (changed) this.setData({ batchRows: rows })
  },

  /**
   * 新建分类 —— 单条表单用
   * 建完直接把新分类选中，用户不用再去下拉里找
   */
  addCategorySingle() {
    this._promptNewCategory(name => {
      this.loadCategories()   // 重建有序列表（新类型可能不在同一位置）
      // 走 _patchForm 而不是 setData('form.category')：整体替换 form，
      // 组件才会收到新值（分类下拉框里的文字要跟着变）
      this._patchForm({ category: name })
      wx.showToast({ title: '已选好「' + name + '」', icon: 'none' })
    })
  },

  /** 新建分类 —— 批量表单用：建完让这一批都归到新分类 */
  addCategoryBatch() {
    this._promptNewCategory(name => {
      this.loadCategories()
      const list = getOrderedCategories()
      const i = list.indexOf(name)
      this.setData({ batchCategoryIndex: i < 0 ? 0 : i })
      wx.showToast({ title: '这批都用「' + name + '」', icon: 'none' })
    })
  },

  /**
   * 弹输入框新建分类，成功后回调 done(name)
   * 用 wx.showModal 的 editable（可直接输入文字），比自己写弹窗组件省事；
   * 若同名分类已存在，不报错，直接当作"选中它"
   */
  _promptNewCategory(done) {
    const that = this
    wx.showModal({
      title: '新建分类',
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
        that.loadCategories(false)   // 立刻刷新下拉，新类型马上能选到
        if (r.exist) wx.showToast({ title: r.msg || '已经有这个分类了', icon: 'none' })
        done(name)
      }
    })
  },

  // ============ 新建位置（位置输入框右边的「＋」） ============
  /** 单条表单：新建位置后直接填进路径输入框 */
  newPlaceSingle() {
    this._promptNewPlace(path => this._patchForm({ locationPath: path }))
  },

  /** 批量：上方「统一位置」那一栏新建路径 */
  newPlaceBatch() {
    this._promptNewPlace(path => this.setData({ batchLocationPath: path }))
  },

  /** 批量某一条：给这一条填路径（data-i 是第几条） */
  newPlaceRow(e) {
    const i = Number(e.currentTarget.dataset.i)
    if (!this.data.batchRows[i]) return
    this._promptNewPlace(path => this._patchRow(i, { locationPath: path }))
  },

  /**
   * 弹输入框新建位置，成功后回调 done(path)
   *
   * 位置不强制逐级建：一段也行（「抽屉」），多段用 / 隔开（「寝室/衣柜/第二层」），
   * 统一交给 places.normalizePath 去空格 / 空段，并限制段数；
   * 建完写进本地路径池，下次打开页面就能在候选标签里直接点。
   */
  _promptNewPlace(done) {
    wx.showModal({
      title: '新建位置',
      editable: true,
      placeholderText: '如：寝室/衣柜/第二层（只写一级也行）',
      confirmText: '新建',
      confirmColor: getAccent(),
      success: res => {
        if (!res.confirm) return
        // 规范化后为空（只输了空格 / 分隔符）就不算数
        const path = places.normalizePath(res.content)
        if (!path) {
          wx.showToast({ title: '位置不能为空', icon: 'none' })
          return
        }
        // 池子上限 60 条，这里取足够大的数，确认它是不是已经建过
        const exist = places.getRecentPaths(100).indexOf(path) >= 0
        places.touchPath(path)   // 写进路径池，同时排到候选最前面
        this.loadPaths()
        done(path)
        wx.showToast({ title: exist ? '已选好「' + path + '」' : '已新建「' + path + '」', icon: 'none' })
      }
    })
  },

  // 编辑模式：按 id 把云端那条记录取回来，填进表单
  // 注意 share/跨账号打开（比如别人分享了链接）时，要把不属于自己的数据挡掉
  loadDetail(id) {
    const db = getDB()
    if (!db) {
      wx.showToast({ title: '云环境未就绪', icon: 'none' })
      return
    }
    db.collection("goods").doc(id).get().then(res => {
      const data = res.data
      // 归属校验：用「历史身份别名」判断，避免本机 ID 切换成 openid 后
      // 自己以前录的物品反而打不开
      const myIds = getOwnerIds()
      if (data.ownerId && myIds.indexOf(data.ownerId) === -1) {
        wx.showToast({ title: '这不是你的物品哦', icon: 'none' })
        setTimeout(() => wx.navigateBack(), 1200)
        return
      }
      // picker 的 value 必须是数组下标，所以把"分类名"反查成下标。
      // 类型被删过时不再偷偷改成「其他」（那会静默改写用户数据），
      // 而是把它临时补进下拉列表，让用户自己决定要不要改。
      const cat = data.category || '其他'
      const catList = this.data.categoryList.slice()
      if (catList.indexOf(cat) === -1) catList.push(cat)
      // 位置：新数据直接用 locationPath；老数据用三级字段拼一条路径
      const path = data.locationPath || places.joinPath(data.mainPosition, data.container, data.shelf)
      this.setData({
        categoryList: catList,
        categoryIndex: catList.indexOf(cat),
        form: {
          _id: data._id,
          name: data.name || '',
          category: cat,
          locationPath: path,
          position: data.position || '',
          // 老数据没有这三个字段：数量按 1、单位按件、状态按在用
          quantity: typeof data.quantity === 'number' && data.quantity > 0 ? data.quantity : 1,
          unit: data.unit || '件',
          status: data.status || 'in_use',
          remark: data.remark || '',
          purchaseDate: data.purchaseDate || '',
          price: typeof data.price === 'number' ? String(data.price) : (data.price || ''),
          fileID: data.fileID || '',
          expiryDate: data.expiryDate || '',
          // 已有图片直接回填给组件显示（fileID 是云存储地址，<image> 能直接加载）
          imgUrl: data.fileID || '',
          uploading: false
        }
      })
    }).catch(() => {
      wx.showToast({ title: '数据加载失败', icon: 'none' })
    })
  },

  // —— 模式切换 ——
  switchMode(e) {
    this.setData({ mode: e.currentTarget.dataset.m })
  },

  // ============ 单条表单 ============
  /**
   * goods-fields 组件把"要改的字段"打包发过来（e.detail.patch），
   * 这里一次写进 form。例：{ name: '水杯' } 或 { category: '文具', categoryIndex: 6 }
   * 这样一个方法就接管了名称、位置、价格、日期、备注全部输入，不用一个字段一个函数
   */
  onSinglePatch(e) {
    this._patchForm(e.detail.patch || {})
  },

  /**
   * 改 form 里的若干字段
   *
   * 这里刻意"整体替换 form 对象"，而不是 setData('form.name') 这种路径写法：
   * 子组件拿到的 value 是对象引用，路径更新后引用没变，
   * 小程序可能判定"这个属性没变化"而跳过子组件刷新 ——
   * 表现就是选了分类但下拉框文字不更新、点了位置标签不高亮。
   * 换成新对象后，引用变了，子组件一定会收到更新。
   */
  _patchForm(patch) {
    const next = { form: Object.assign({}, this.data.form, patch) }
    // 分类变了就把页面的 categoryIndex 对齐（注意：列表已按常用排序，不能用旧的 indexOfCategory）
    if (patch.category !== undefined && patch.categoryIndex === undefined) {
      const i = this.data.categoryList.indexOf(patch.category)
      if (i >= 0) next.categoryIndex = i
    }
    this.setData(next)
  },

  /**
   * 点图片位：没图就直接选，已有图就问"更换还是移除"
   * （组件把点击统一抛成 tapimage 事件，具体行为在这里决定）
   */
  chooseImg() {
    const that = this
    if (this.data.form.imgUrl) {
      wx.showActionSheet({
        itemList: ['重新选择图片', '移除图片'],
        success: r => {
          if (r.tapIndex === 1) {
            that._patchForm({ imgUrl: '', fileID: '' })
          } else {
            that._pickSingleImage()
          }
        }
      })
      return
    }
    this._pickSingleImage()
  },

  /**
   * 选图 + 上传到云存储（单条）
   * 流程：chooseMedia 选一张 → 立刻用本地临时路径显示（用户马上能看到，体验快）
   *       → 同时在后台传到云存储 → 拿到 fileID 存进 form.fileID
   * 数据库里只存 fileID 这个字符串，不存图片二进制
   */
  _pickSingleImage() {
    wx.chooseMedia({
      count: 1,                 // 一次只选 1 张
      mediaType: ['image'],     // 只要图片（不要视频）
      success: res => {
        const tempPath = res.tempFiles[0].tempFilePath // 本地临时路径，小程序关掉就没了
        // 预览图 / 上传状态都写进 form，组件直接读 value.imgUrl
        this._patchForm({ imgUrl: tempPath, uploading: true })
        // 取扩展名，保持原格式（jpg/png…）；取不到就默认 png
        const m = tempPath.match(/\.\w+$/)
        const ext = m ? m[0] : '.png'
        wx.cloud.uploadFile({
          // cloudPath = 在云存储里的文件名，用时间戳+随机数避免重名
          cloudPath: `goods/${Date.now()}-${Math.floor(Math.random() * 1000)}${ext}`,
          filePath: tempPath,
          success: uploadRes => {
            // fileID 形如 cloud://xxx/goods/1699999999-123.png，存库用这个
            this._patchForm({ fileID: uploadRes.fileID })
          },
          fail: () => {
            wx.showToast({ title: '图片上传失败，请重试', icon: 'none' })
          },
          complete: () => this._patchForm({ uploading: false }) // 成功失败都要关掉"上传中"
        })
      }
    })
  },

  /**
   * 提交单条表单
   * 开头四道校验：防重复点击 → 名称必填 → 图片传完 → 云环境可用
   * 然后组装 payload（要存进数据库的字段），最后按"有没有 _id"决定新增还是更新
   */
  submitSingle() {
    if (this.data.submitting) return     // 防连点：提交中直接返回
    const form = this.data.form
    if (!form.name) {
      wx.showToast({ title: '请填写物品名称', icon: 'none' })
      return
    }
    if (form.uploading) {
      wx.showToast({ title: '图片还在上传中，请稍候', icon: 'none' })
      return
    }
    // 价格 / 数量先转成数字再校验：非法值绝不能入库（否则列表会出现 ¥NaN）
    const price = parsePrice(form.price)
    if (isNaN(price)) {
      wx.showToast({ title: '价格请填写不小于 0 的数字', icon: 'none' })
      return
    }
    const quantity = parseQuantity(form.quantity)
    if (isNaN(quantity)) {
      wx.showToast({ title: '数量请填写大于 0 的数字', icon: 'none' })
      return
    }
    const db = getDB()
    if (!db) {
      wx.showToast({ title: '云环境未就绪，请稍后再试', icon: 'none' })
      return
    }
    // 分类以表单里的值为准。
    // 在组件里选分类时，只会通过 change 事件写进 form.category，不会回写页面的
    // categoryIndex，所以不能写 categoryList[this.data.categoryIndex]——
    // 那个下标一直停在初始的「其他」，会导致选什么都存成「其他」。
    // 另外若这个类型后来被用户删掉了，就退回兜底的「其他」。
    const category = form.category || '其他'
    // 位置：规范化路径（去空格 / 空段 / 限制段数），并记入"最近使用"池
    const seg = places.splitPath(form.locationPath)
    if (seg.locationPath) places.touchPath(seg.locationPath)

    this.setData({ submitting: true })   // 按钮置灰，防止重复提交入库两条
    // 成功 / 失败的回调抽出来，新增和更新两处共用，避免重复代码
    const done = () => {
      touchCategory(category)   // 记一次使用，下次新增时常用类型排在前面
      wx.showToast({ title: '保存成功' })
      setTimeout(() => wx.navigateBack(), 1200)  // 停 1.2 秒让用户看到提示再返回
    }
    const fail = () => {
      this.setData({ submitting: false })
      wx.showToast({ title: '保存失败，请重试', icon: 'none' })
    }
    // payload = 要写进数据库的字段（云端只认这些，多余字段不要写）
    const payload = {
      name: form.name,
      category,
      locationPath: seg.locationPath,    // 完整路径（展示、搜索用）
      mainPosition: seg.mainPosition,    // 以下三个是派生字段：筛选仍走等值查询
      container: seg.container,
      shelf: seg.shelf,
      position: form.position || '',     // 老数据的自由文本位置，保留不丢
      remark: form.remark,
      purchaseDate: form.purchaseDate,
      // 价格 / 数量：已经过校验，这里存的一定是合法数字或 null
      price,
      quantity,
      unit: normUnit(form.unit),
      status: form.status || 'in_use',
      fileID: form.fileID,               // 云存储图片地址
      expiryDate: form.expiryDate
    }
    if (form._id) {
      // 有 _id = 编辑：.doc(指定记录).update 只改这一条
      db.collection('goods').doc(form._id).update({ data: payload }).then(done).catch(fail)
    } else {
      // 没有 _id = 新增：.add 会自动生成 _id
      db.collection('goods').add({
        // ownerId 是数据隔离的关键：谁的账号添加就归谁
        data: Object.assign({}, payload, {
          ownerId: getOwnerId(),
          // serverDate() = 用服务器时间，避免用户手机时间不准导致排序错乱
          createTime: db.serverDate()
        })
      }).then(done).catch(fail)
    }
  },

  // ============ 批量表单：多条目按顺序填写 ============

  /** 批量归属模式：① 统一分类 ② 统一位置标签 ③ 分类 + 位置 */
  setBindMode(e) {
    this.setData({ batchBindMode: e.currentTarget.dataset.m, batchResult: null })
  },

  onBatchCategoryChange(e) {
    this.setData({ batchCategoryIndex: Number(e.detail.value) })
  },

  /** 批量统一位置：一条路径，所有条目共用（可直接手输，不必逐级建） */
  onBatchPath(e) {
    this.setData({ batchLocationPath: e.detail.value })
  },

  /* 输入框聚焦高亮：小程序 input 没有 :focus，只能靠事件切 .is-focus */
  onBatchPathFocus() {
    this.setData({ pathFocus: true })
  },

  onBatchPathBlur() {
    this.setData({ pathFocus: false })
  },

  /** 追加一条待添加物品 */
  addBatchRow() {
    this.setData({
      batchRows: this.data.batchRows.concat([newRow()]),
      batchResult: null
    }, () => this._syncBatchCatIndex())
  },

  /** 删除某一条（整条为空则直接删，否则二次确认） */
  delBatchRow(e) {
    const i = Number(e.currentTarget.dataset.i)
    const row = this.data.batchRows[i]
    if (!row) return
    const doDel = () => {
      const rows = this.data.batchRows.filter((_, idx) => idx !== i)
      this.setData({ batchRows: rows.length ? rows : [newRow()], batchResult: null })
    }
    if (rowIsEmpty(row)) return doDel()
    wx.showModal({
      title: '删除这一条',
      content: `确定删除第 ${i + 1} 条「${(row.name || '未命名').slice(0, 10)}」吗？`,
      confirmColor: getAccent(),
      success: res => { if (res.confirm) doDel() }
    })
  },

  /**
   * 批量某一条的字段变化（组件发来的 patch）
   *   data-i  —  第几条（写在组件节点上）
   *   patch   —  要改哪些字段，例如 { name: '水杯' }、{ mainPosition: '寝室' }
   * 一次 setData 批量改完，比每个字段一个函数清爽得多
   */
  onRowPatch(e) {
    this._patchRow(Number(e.currentTarget.dataset.i), e.detail.patch || {})
  },

  /**
   * 改某一条的若干字段
   * 和 _patchForm 一样的道理：整体替换这一条的对象，子组件才会收到新 value
   */
  _patchRow(i, patch) {
    const row = Object.assign({}, this.data.batchRows[i], patch)
    this.setData({ ['batchRows[' + i + ']']: row })
  },

  /** 每条独立的图片：没图就直接选，已有图先问"更换还是移除" */
  chooseRowImg(e) {
    const i = Number(e.currentTarget.dataset.i)
    const row = this.data.batchRows[i]
    if (!row) return
    const that = this
    if (row.imgUrl) {
      wx.showActionSheet({
        itemList: ['重新选择图片', '移除图片'],
        success: r => {
          if (r.tapIndex === 1) {
            that._patchRow(i, { imgUrl: '', fileID: '' })
          } else {
            that._pickRowImage(i)
          }
        }
      })
      return
    }
    this._pickRowImage(i)
  },

  /** 选中并上传某一条的图片 */
  _pickRowImage(i) {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      success: res => {
        const tempPath = res.tempFiles[0].tempFilePath
        this._patchRow(i, { imgUrl: tempPath, fileID: '', uploading: true })
        const m = tempPath.match(/\.\w+$/)
        const ext = m ? m[0] : '.png'
        wx.cloud.uploadFile({
          cloudPath: `goods/${Date.now()}-${Math.floor(Math.random() * 1000)}${ext}`,
          filePath: tempPath,
          success: uploadRes => {
            this._patchRow(i, { fileID: uploadRes.fileID })
          },
          fail: () => {
            this._patchRow(i, { imgUrl: '' })
            wx.showToast({ title: '图片上传失败，请重试', icon: 'none' })
          },
          complete: () => this._patchRow(i, { uploading: false })
        })
      }
    })
  },

  /**
   * 统一提交：把所有条目批量入库
   *
   * 为什么用 async/await：一次加多条，必须一条一条来（数据库不支持一次 add 多条数组），
   * 用 await 可以等上一条成功再发下一条，并且能准确统计"成功几条、失败几条"。
   * 用 Promise.all 并发发也快，但失败后不好定位是哪一条，这里选择了稳妥的串行。
   */
  async submitBatch() {
    if (this.data.submitting) return
    const rows = this.data.batchRows
    const db = getDB()
    if (!db) {
      wx.showToast({ title: '云环境未就绪，请稍后再试', icon: 'none' })
      return
    }
    if (rows.some(r => r.uploading)) {
      wx.showToast({ title: '还有图片在上传中，请稍候', icon: 'none' })
      return
    }

    // 完全空白的条目自动跳过；填了别的但没填名称的，提示补全
    // items 存"真正要入库的行"，missing 存"填了内容却漏了名称"的行号
    const missing = []
    const badNum = []   // 价格 / 数量填了非法数值的行号
    const items = []
    rows.forEach((r, i) => {
      const name = (r.name || '').trim()
      if (!name) {
        if (!rowIsEmpty(r)) missing.push(i + 1)   // 行号从 1 开始，方便提示
        return
      }
      const price = parsePrice(r.price)
      const quantity = parseQuantity(r.quantity)
      if (isNaN(price) || isNaN(quantity)) badNum.push(i + 1)
      items.push({ idx: i + 1, name, row: r, price, quantity })
    })
    if (missing.length) {
      wx.showToast({ title: `第 ${missing.join('、')} 条还没填名称`, icon: 'none' })
      return
    }
    if (badNum.length) {
      wx.showToast({ title: `第 ${badNum.join('、')} 条价格或数量格式不对`, icon: 'none' })
      return
    }
    if (!items.length) {
      wx.showToast({ title: '请至少填写一条物品', icon: 'none' })
      return
    }

    const ownerId = getOwnerId()
    // 三种归属模式，没被统一的那一半由每条自己填：
    //   category → 分类统一，位置每条自己选
    //   position → 位置统一，分类每条自己选
    //   both     → 两者都统一，下面每条都不用填
    const bindMode = this.data.batchBindMode || 'both'
    const bindCategory = bindMode !== 'position'   // ①③ 统一分类
    const bindPosition = bindMode !== 'category'   // ②③ 统一位置标签
    // 统一值：只在被统一的那一半有意义，另一半留空交给每条
    const uniCategory = this.data.categoryList[this.data.batchCategoryIndex] || '其他'
    // 统一位置：一条路径，例如「寝室/衣柜/第二层」
    const uniPath = bindPosition ? places.normalizePath(this.data.batchLocationPath) : ''
    if (bindPosition && !uniPath) {
      wx.showToast({ title: '请先填写要统一的位置', icon: 'none' })
      return
    }

    this.setData({ submitting: true })
    // showLoading 的 mask:true 会挡住页面，防止用户中途乱点
    wx.showLoading({ title: `正在添加 0/${items.length}`, mask: true })

    const failed = []   // 失败明细，最后弹窗列出来
    const usedCats = [] // 这一批用到的类型，结束后各记一次使用次数
    let success = 0
    for (let n = 0; n < items.length; n++) {
      const it = items[n]
      const r = it.row
      // 被统一的那一半用统一值，没被统一的那一半用这一条自己选的
      // （统一分类 → 位置取 row.locationPath；统一位置 → 分类取 row.category）
      const rowCategory = bindCategory ? uniCategory : (r.category || '其他')
      if (usedCats.indexOf(rowCategory) < 0) usedCats.push(rowCategory)
      // 位置：统一模式用同一条路径，否则用这一条自己填的
      const rowPath = bindPosition ? uniPath : places.normalizePath(r.locationPath)
      const seg = places.splitPath(rowPath)
      try {
        if (seg.locationPath) places.touchPath(seg.locationPath)
        await db.collection('goods').add({
          data: {
            name: it.name,
            category: rowCategory,
            locationPath: seg.locationPath,
            mainPosition: seg.mainPosition,
            container: seg.container,
            shelf: seg.shelf,
            position: (r.position || '').trim(),
            remark: (r.remark || '').trim(),
            purchaseDate: r.purchaseDate || '',
            price: it.price,
            quantity: it.quantity,
            unit: normUnit(r.unit),
            status: r.status || 'in_use',
            fileID: r.fileID || '',
            expiryDate: r.expiryDate || '',
            ownerId,                            // 同一批都是当前用户
            createTime: db.serverDate()          // 服务器时间
          }
        })
        success++
      } catch (err) {
        // 单条失败不影响后面的条目继续入库，记下来最后统一提示
        failed.push({ idx: it.idx, name: it.name, reason: '保存失败' })
      }
      // 每写完一条刷新一次进度文案（1/5、2/5 …）
      wx.showLoading({ title: `正在添加 ${n + 1}/${items.length}`, mask: true })
    }
    wx.hideLoading()
    usedCats.forEach(name => touchCategory(name))   // 常用类型排序要跟着更新

    this.setData({ submitting: false, batchResult: { total: items.length, success, failed } })

    if (failed.length === 0) {
      wx.showToast({ title: `全部 ${success} 条添加成功 🎉`, icon: 'success' })
      this.setData({ batchRows: [newRow()] }, () => this._syncBatchCatIndex())
      setTimeout(() => wx.navigateBack(), 1500)
    } else {
      wx.showModal({
        title: `已添加 ${success}/${items.length}`,
        content: failed.map(f => `第${f.idx}条 ${f.name}：${f.reason}`).join('\n'),
        confirmColor: getAccent(),
        confirmText: '我知道了',
        showCancel: false
      })
    }
  },

  /** 兼容老的 btn tap */
  submit() {
    if (this.data.mode === 'batch') return this.submitBatch()
    return this.submitSingle()
  }
})
