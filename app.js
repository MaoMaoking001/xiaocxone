// ============================================================================
// app.js —— 整个小程序的「入口文件」，小程序启动时执行一次
//
// 这里只做四件事，任何页面里都能通过 getApp() 拿到 App() 里定义的东西：
//   1. 初始化云开发（物品收纳、意见反馈要连数据库）
//   2. 读一次用户选的背景图，放进 globalData，页面可以直接用
//   3. 把主题色同步给「导航栏 / tabBar」这两个原生区域
//   4. 用云函数拿真实 openid，拿不到就用本机 ID 兜底
//
// 注意：App() 里的 onLaunch 只跑一次；onShow 每次切回前台都会跑。
// ============================================================================
const { applyGlobalColor, getThemeAccent } = require('./utils/theme') // 主题色相关
const { syncOpenId, getOwnerIds } = require('./utils/user')            // 用户标识相关（含历史别名）
const { getDB } = require('./utils/db')                                // 云数据库（可能为 null）
const remind = require('./utils/remind')                                // 保质期提醒配置/角标

App({
  // globalData 是全局共享的数据袋，页面里写 const app = getApp() 后
  // app.globalData.pageBg 就能读到，但改动它不会自动刷新页面（不是响应式的）。
  globalData: {
    pageBg: null,            // 用户选的背景（null = 用默认渐变），每页 applyBg 时会读
    accent: '#ff8fab'        // 当前生效的主题色，记录一下用于判断"是否变化了"
  },

  // onLaunch：小程序被打开时执行一次（冷启动）
  onLaunch() {
    // 初始化云开发，env 是本项目的云环境 ID（云开发控制台里能看到）
    // traceUser: true 表示在云开发后台记录用户访问，方便看统计
    wx.cloud.init({
      env: "cloud1-d8g60kdu7244ac691",
      traceUser: true
    })
    // 启动时把背景配置读进全局：读缓存包了 try/catch，
    // 因为缓存里可能是老数据或非法结构，坏数据不该让小程序起不来
    try {
      const saved = wx.getStorageSync('page_bg')
      if (saved && typeof saved === 'object') {
        this.globalData.pageBg = saved
      }
    } catch (e) {}
    // 把用户设置的主题色同步到导航栏 / tabBar
    // 为什么要单独做：导航栏和 tabBar 是微信原生绘制的，WXSS 里的 CSS 变量管不到它们，
    // 只能用 wx.setNavigationBarColor / wx.setTabBarStyle 这两个 API 设置
    // getThemeAccent() 会自动区分明暗主题（深色模式用一套紫色）
    const accent = getThemeAccent()
    this.globalData.accent = accent
    applyGlobalColor(accent)
    // 尝试通过云函数拿真实 openid（没部署云函数也不影响，会自动降级成本机 ID）
    syncOpenId()
  },

  // onShow：每次小程序从后台切回前台都会执行（热启动），不是只跑一次
  onShow() {
    // 重新同步一次主题色：用户可能在系统层面改了深色模式，
    // 这时主题色要跟着变，所以再算一遍，变了才重新设置（避免无意义调用）
    const accent = getThemeAccent()
    if (accent !== this.globalData.accent) {
      this.globalData.accent = accent
      applyGlobalColor(accent)
    }
    // 顺手刷新一次「物品收纳」tab 上的到期角标：
    // 用户可能是在首页打开的，不进列表页也要能看到有几件要处理
    this.refreshExpiryBadge()
  },

  /**
   * tabBar 角标（粗略版）
   * 这里只查"到期日 <= 阈值"的总数，再减去忽略名单的条数。
   * 精确值在列表页 loadStats 里按 id 过滤后覆盖（那才是准的）。
   * 为什么要在这里也算：用户冷启动停在首页时，也得看到角标。
   */
  refreshExpiryBadge() {
    const cfg = remind.getConfig()
    const db = getDB()
    const clear = () => {
      try { wx.removeTabBarBadge({ index: 1 }) } catch (e) {}
    }
    if (!cfg.badge || !db) return clear()

    const soon = remind.soonLimit(cfg.soonDays)
    const ids = getOwnerIds()
    if (!ids.length) return clear()
    const _ = db.command
    // 用"本机 ID + openid"一起查，避免身份切换后角标忽有忽无
    const ownerCond = ids.length > 1 ? { ownerId: _.in(ids) } : { ownerId: ids[0] }

    db.collection('goods')
      .where(Object.assign({}, ownerCond, {
        expiryDate: _.lte(soon).and(_.neq(''))
      }))
      .count()
      .then(r => {
        const left = Math.max(0, (r.total || 0) - remind.getMutedIds().length)
        try {
          if (left > 0) wx.setTabBarBadge({ index: 1, text: left > 99 ? '99+' : String(left) })
          else clear()
        } catch (e) {}
      })
      .catch(() => {})
  }
})
