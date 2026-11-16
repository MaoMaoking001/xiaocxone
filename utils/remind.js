// utils/remind.js 保质期提醒的"规则中心"
//
// 【为什么单独一个文件】
//   判定"已过期 / 即将过期"、提醒阈值、免打扰、忽略名单这些东西，
//   列表页、提醒设置页都要用同一套；写两份必然对不上（今天 30 天，明天 7 天）。
//   所以规则只放这里，页面只负责展示。
//
// 【三个本地缓存】
//   expiry_remind_cfg  提醒配置：阈值天数 / 每天只弹一次 / 免打扰 / 角标
//   expiry_notice_day  上一次弹窗的日期（每天只弹一次靠它）
//   expiry_muted_ids   被"忽略"的物品 id 列表（忽略后不再出现在提醒里，但不删物品）
//
// 【提醒的三种展示】
//   1. tabBar 角标：待处理件数（列表页 setBadge 用）
//   2. 列表页顶部的提醒卡：名称 + 到期日 + 剩余/过期天数，可逐条忽略
//   3. 每天首次进列表页弹一次窗（可关、可免打扰）
const { today, fmtDate, daysBetween } = require('./util')

const CFG_KEY = 'expiry_remind_cfg'
const NOTICE_DAY_KEY = 'expiry_notice_day'
const MUTED_KEY = 'expiry_muted_ids'

// 阈值范围：1~365 天，用滑块自由拖，不写死档位
// 上下限必须有，否则 0 会让所有物品都算临期、9999 等于关掉提醒
const SOON_MIN = 1
const SOON_MAX = 365

const DEFAULT_CFG = {
  soonDays: 30,     // 剩余多少天内算"即将过期"
  dailyOnce: true,  // 每天最多弹一次窗
  mute: false,      // 免打扰：完全不弹窗（提醒卡与角标仍在）
  badge: true       // 是否在 tabBar 上显示待处理件数
}

/** 把阈值收进 1~365，非数字回默认值（缓存被改坏时也不会让提醒失效） */
function clampSoon(n) {
  const v = Math.round(Number(n))
  if (!isFinite(v)) return DEFAULT_CFG.soonDays
  return Math.min(SOON_MAX, Math.max(SOON_MIN, v))
}

/** 读配置：脏数据、老版本、缺字段都会补成默认值 */
function getConfig() {
  let raw = null
  try {
    raw = wx.getStorageSync(CFG_KEY)
  } catch (e) {
    raw = null
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) raw = {}
  const cfg = Object.assign({}, DEFAULT_CFG, raw)
  cfg.soonDays = clampSoon(cfg.soonDays)
  cfg.dailyOnce = !!cfg.dailyOnce
  cfg.mute = !!cfg.mute
  cfg.badge = !!cfg.badge
  return cfg
}

/** 存配置（只传要改的字段即可），返回合并后的完整配置 */
function saveConfig(patch) {
  const cfg = Object.assign({}, getConfig(), patch || {})
  cfg.soonDays = clampSoon(cfg.soonDays)
  try {
    wx.setStorageSync(CFG_KEY, cfg)
  } catch (e) {}
  return cfg
}

/**
 * 阈值对应的"最晚到期日"，给云数据库做范围查询用
 * 例：今天 11-18、阈值 30 → 返回 12-18，查 expiryDate <= '12-18' 就是临期+过期
 * 用 setDate 而不是 timestamp 加法，跨月跨年由 Date 自己算，不会差一天
 */
function soonLimit(soonDays) {
  const s = soonDays == null ? getConfig().soonDays : Number(soonDays)
  const d = new Date()
  d.setDate(d.getDate() + s)
  return fmtDate(d)
}

/**
 * 一件物品的到期状态
 * @return {{ status:string, days:number|null }}
 *   status: 'expired' 已过期 / 'soon' 临期 / 'normal' 正常 / 'none' 没填保质期
 *   days  : 已过期时是"过期了几天"，临期/正常时是"还剩几天"
 */
function stateOf(item, soonDays) {
  const s = soonDays == null ? getConfig().soonDays : Number(soonDays)
  // 已用完 / 已送人 / 已丢弃的物品不再参与到期提醒
  // （老数据没有 status 字段，按"在用"处理）
  if (item && item.status && item.status !== 'in_use') return { status: 'none', days: null }
  if (!item || !item.expiryDate) return { status: 'none', days: null }
  const left = daysBetween(today(), item.expiryDate) // 正=还剩，负=已过
  if (left < 0) return { status: 'expired', days: -left }
  if (left <= s) return { status: 'soon', days: left }
  return { status: 'normal', days: left }
}

/** 状态的统一文案：列表卡片、提醒卡、弹窗都用它，避免三处各写一套 */
function textOf(status, days) {
  if (status === 'expired') return `已过期 ${days} 天`
  if (status === 'soon') return days === 0 ? '今天到期' : `还剩 ${days} 天`
  if (status === 'normal') return days === 0 ? '今天到期' : `还剩 ${days} 天`
  return ''
}

/* ---------------- 忽略名单（已处理的提醒） ---------------- */

function getMutedIds() {
  let raw = null
  try {
    raw = wx.getStorageSync(MUTED_KEY)
  } catch (e) {
    raw = null
  }
  if (!Array.isArray(raw)) return []
  return raw.filter(x => typeof x === 'string' && x)
}

function isMuted(id) {
  return !!id && getMutedIds().indexOf(id) !== -1
}

/** 忽略某件物品的到期提醒（只影响提醒，物品本身不动） */
function muteItem(id) {
  const list = getMutedIds()
  if (id && list.indexOf(id) === -1) list.push(id)
  try {
    wx.setStorageSync(MUTED_KEY, list)
  } catch (e) {}
  return list
}

/** 恢复某件物品的提醒 */
function unmuteItem(id) {
  const list = getMutedIds().filter(x => x !== id)
  try {
    wx.setStorageSync(MUTED_KEY, list)
  } catch (e) {}
  return list
}

/**
 * 批量忽略（提醒卡的「一键忽略」用）
 * 逐个调 muteItem 会读写 N 次缓存，这里合并成一次
 */
function muteItems(ids) {
  const list = getMutedIds()
  ;(ids || []).forEach(id => {
    if (id && list.indexOf(id) === -1) list.push(id)
  })
  try {
    wx.setStorageSync(MUTED_KEY, list)
  } catch (e) {}
  return list
}

/** 一键恢复全部（设置页「清除忽略记录」） */
function clearMuted() {
  try {
    wx.setStorageSync(MUTED_KEY, [])
  } catch (e) {}
  return []
}

/* ---------------- 每天一次的弹窗控制 ---------------- */

function noticedToday() {
  try {
    return wx.getStorageSync(NOTICE_DAY_KEY) === today()
  } catch (e) {
    return false
  }
}

function markNoticed() {
  try {
    wx.setStorageSync(NOTICE_DAY_KEY, today())
  } catch (e) {}
}

/**
 * 现在该不该弹窗
 *   免打扰 → 不弹；每天只弹一次且今天弹过 → 不弹
 * 提醒卡和角标不受这里影响，它们始终反映真实情况
 */
function shouldNotify() {
  const cfg = getConfig()
  if (cfg.mute) return false
  if (cfg.dailyOnce && noticedToday()) return false
  return true
}

module.exports = {
  CFG_KEY,
  SOON_MIN,
  SOON_MAX,
  DEFAULT_CFG,
  getConfig,
  saveConfig,
  soonLimit,
  stateOf,
  textOf,
  getMutedIds,
  isMuted,
  muteItem,
  muteItems,
  unmuteItem,
  clearMuted,
  noticedToday,
  markNoticed,
  shouldNotify
}
