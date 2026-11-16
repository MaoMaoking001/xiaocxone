// utils/db.js 云数据库懒加载
// 说明：不要在页面模块顶层调用 wx.cloud.database()，
// 一旦云环境异常或未初始化，整个页面模块会抛错，页面直接白屏（wx://not-found）。
function getDB() {
  if (!wx.cloud || typeof wx.cloud.database !== 'function') return null
  try {
    return wx.cloud.database()
  } catch (e) {
    return null
  }
}

function isCloudReady() {
  return !!getDB()
}

module.exports = { getDB, isCloudReady }
