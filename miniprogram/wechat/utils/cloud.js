const CLOUD_ENV_ID = 'cloud1-d5g01k4t5decfcc5c'
let cloudInitialized = false

function normalizeResult(result) {
  if (!result) throw new Error('云函数没有返回结果')
  if (result.ok === false) throw new Error(result.error || '云函数调用失败')
  if (result.ok === true) {
    if (result.data === undefined) throw new Error('云函数返回了 ok 但缺少 data 字段')
    return result.data
  }
  return result
}

function ensureCloud() {
  if (!wx.cloud) {
    throw new Error('当前基础库不支持云开发，请在微信开发者工具中开启云开发')
  }
  if (!cloudInitialized) {
    wx.cloud.init({ env: CLOUD_ENV_ID, traceUser: false })
    cloudInitialized = true
  }
}

function callFunction(name, data) {
  try {
    ensureCloud()
  } catch (error) {
    return Promise.reject(error)
  }
  return wx.cloud.callFunction({ name, data })
    .then((res) => normalizeResult(res.result))
    .catch((error) => {
      const message = error.errMsg || error.message || ''
      if (message.includes('timeout')) {
        throw new Error(`云函数 ${name} 调用超时，请确认微信开发者工具已登录并且云开发环境可访问`)
      }
      if (message.includes('FUNCTION_NOT_FOUND') || message.includes('FunctionName parameter could not be found')) {
        throw new Error(`云函数 ${name} 未部署，请先部署云函数`)
      }
      throw error
    })
}

async function uploadCloudFile(cloudPath, filePath) {
  ensureCloud()
  const result = await wx.cloud.uploadFile({ cloudPath, filePath })
  if (!result.fileID) throw new Error('上传参考图失败：云存储未返回 fileID')
  return result.fileID
}

module.exports = { callFunction, ensureCloud, uploadCloudFile }
