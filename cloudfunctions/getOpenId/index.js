// 云函数：getOpenId
// 作用：返回当前微信用户的 openid，用于「物品收纳」的数据隔离
//       （保证 A 用户添加的物品，B 用户看不到、也操作不了）
//
// 使用：在微信开发者工具里右键该目录 →「上传并部署：云端安装依赖」。
// 不部署也不会报错：utils/user.js 会自动降级为本机唯一 ID。
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

exports.main = async () => {
  const ctx = cloud.getWXContext()
  return {
    openid: ctx.OPENID,
    appid: ctx.APPID,
    unionid: ctx.UNIONID || ''
  }
}
