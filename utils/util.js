const formatTime = date => {
  const year = date.getFullYear()
  const month = date.getMonth() + 1
  const day = date.getDate()
  const hour = date.getHours()
  const minute = date.getMinutes()
  const second = date.getSeconds()

  return `${[year, month, day].map(formatNumber).join('/')} ${[hour, minute, second].map(formatNumber).join(':')}`
}

const formatNumber = n => {
  n = n.toString()
  return n[1] ? n : `0${n}`
}

/** 格式化为 YYYY-MM-DD */
const fmtDate = date => {
  const d = date instanceof Date ? date : new Date(date)
  return `${d.getFullYear()}-${formatNumber(d.getMonth() + 1)}-${formatNumber(d.getDate())}`
}

/** 今天的 YYYY-MM-DD */
const today = () => fmtDate(new Date())

/** 相差天数（b - a，向下取整） */
const daysBetween = (a, b) => Math.floor((new Date(b) - new Date(a)) / 86400000)

const uid = () => Date.now() + '' + Math.floor(Math.random() * 10000)

/** 当前时刻 HH:mm */
const nowHm = () => {
  const d = new Date()
  return `${formatNumber(d.getHours())}:${formatNumber(d.getMinutes())}`
}

/** 某月的最后一天（monthIndex 从 0 开始） */
function lastDayOfMonth(year, monthIndex) {
  return new Date(year, monthIndex + 1, 0).getDate()
}

/**
 * 计算下一次提醒的日期
 * @param {string} dateStr 起始日期 YYYY-MM-DD
 * @param {string} cycle year | month | day
 * @param {number} interval 按天提醒时的间隔天数
 * @param {string} fromStr 从哪天开始算（默认今天）
 */
function nextCycleDate(dateStr, cycle, interval, fromStr) {
  if (!dateStr) return ''
  const t = fromStr || today()
  const parts = String(dateStr).split('-')
  const m = Number(parts[1]) || 1
  const d = Number(parts[2]) || 1

  // 每 N 天：从起始日往后推整数个间隔
  if (cycle === 'day') {
    const step = Math.max(1, Number(interval) || 1)
    const start = new Date(dateStr.replace(/-/g, '/'))
    const now = new Date(t.replace(/-/g, '/'))
    const diff = Math.floor((now - start) / 86400000)
    if (diff <= 0) return fmtDate(start)
    return fmtDate(new Date(start.getTime() + Math.ceil(diff / step) * step * 86400000))
  }

  // 每年 / 每月：日子固定，遇到小月自动取当月最后一天
  const td = new Date(t.replace(/-/g, '/'))
  let year = td.getFullYear()
  let monthIndex = cycle === 'month' ? td.getMonth() : (m - 1)
  let next = new Date(year, monthIndex, Math.min(d, lastDayOfMonth(year, monthIndex)))
  if (fmtDate(next) < t) {
    if (cycle === 'month') {
      monthIndex += 1
      if (monthIndex > 11) {
        monthIndex = 0
        year += 1
      }
    } else {
      year += 1
    }
    next = new Date(year, monthIndex, Math.min(d, lastDayOfMonth(year, monthIndex)))
  }
  return fmtDate(next)
}

module.exports = {
  formatTime,
  fmtDate,
  today,
  daysBetween,
  uid,
  nowHm,
  nextCycleDate
}
