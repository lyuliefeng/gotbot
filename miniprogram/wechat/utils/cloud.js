function normalizeResult(result) {
  if (!result) throw new Error('云函数没有返回结果')
  if (result.ok === false) throw new Error(result.error || '云函数调用失败')
  if (result.ok === true) return result.data
  return result
}

function callFunction(name, data) {
  if (!wx.cloud) {
    return Promise.reject(new Error('当前基础库不支持云开发，请在微信开发者工具中开启云开发'))
  }
  return wx.cloud.callFunction({ name, data }).then((res) => normalizeResult(res.result))
}

module.exports = { callFunction }
