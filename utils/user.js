// utils/user.js 用户标识（用于物品收纳的数据隔离）
//
// 需求：A 账号添加的物品，其他用户不能看到、不能操作。
//
// 实现策略（无需登录、无需后端）：
//   1. 优先拿微信云开发的 openid —— 如果项目里部署了云函数 getOpenId，
//      openid 是稳定且与设备无关的用户标识，最理想。
//   2. 云函数没部署 / 调用失败时，退化为"本机唯一 ID"：
//      首次生成后写入 storage，之后一直复用。
//
// 物品记录里统一带 ownerId 字段，列表查询 / 删除 / 编辑全部带 ownerId 条件，
// 保证每个用户只看到自己的数据。

const OWNER_KEY = 'mao_owner_id'
const IDS_KEY = 'mao_owner_ids'   // 历史身份别名（本机 ID + openid 都记在这里）

function _gen() {
  return 'u_' + Date.now().toString(36) + '_' + Math.floor(Math.random() * 1e9).toString(36)
}

function getOwnerId() {
  let id = wx.getStorageSync(OWNER_KEY)
  if (!id || typeof id !== 'string') {
    id = _gen()
    wx.setStorageSync(OWNER_KEY, id)
  }
  return id
}

/**
 * 当前用户用过的所有标识（当前标识永远排第一）
 *
 * 为什么需要这个：早期版本先发一个本机随机 ID，等云函数拿到 openid 后再覆盖。
 * 如果只按"当前 ownerId"查询，切换身份后旧物品会整批查不到（用户视角=物品消失）。
 * 所以查询统一用 ownerId in [历史 ID...]，写入仍然只用当前 ID。
 */
function getOwnerIds() {
  const cur = getOwnerId()
  let list = []
  try {
    list = wx.getStorageSync(IDS_KEY) || []
  } catch (e) {
    list = []
  }
  if (!Array.isArray(list)) list = []
  const out = [cur]
  list.forEach(x => {
    if (typeof x === 'string' && x && out.indexOf(x) === -1) out.push(x)
  })
  try {
    // 内容变了才写，避免每次查询都做一次同步写缓存
    if (JSON.stringify(list) !== JSON.stringify(out)) wx.setStorageSync(IDS_KEY, out)
  } catch (e) {}
  return out
}

/** 用一个已知的 openid 覆盖本地标识（云函数拿到后回写） */
function setOwnerId(id) {
  if (!id) return getOwnerId()
  const next = String(id)
  const old = wx.getStorageSync(OWNER_KEY)
  // 换身份前先把旧标识记进别名列表，保证它名下的物品仍然查得到
  if (old && old !== next) getOwnerIds()
  wx.setStorageSync(OWNER_KEY, next)
  getOwnerIds()   // 顺手把新标识也补进别名列表
  return next
}

/**
 * 尝试通过云函数拿真实 openid（云函数未部署时会静默失败，不影响使用）
 * 云函数代码见 cloudfunctions/getOpenId/index.js
 */
function syncOpenId() {
  return new Promise(resolve => {
    const done = id => {
      resolve(id || getOwnerId())
    }
    try {
      if (!wx.cloud || typeof wx.cloud.callFunction !== 'function') return done(null)
      wx.cloud.callFunction({
        name: 'getOpenId',
        data: {}
      }).then(res => {
        const openid = res && res.result && (res.result.openid || res.result.userInfo)
        if (openid) done(setOwnerId(openid))
        else done(null)
      }).catch(() => done(null))
    } catch (e) {
      done(null)
    }
  })
}

module.exports = { getOwnerId, getOwnerIds, setOwnerId, syncOpenId, OWNER_KEY, IDS_KEY }
