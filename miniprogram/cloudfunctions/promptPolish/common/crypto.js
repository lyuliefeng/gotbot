const { createCipheriv, createDecipheriv, createHash, randomBytes } = require('node:crypto')

function secretKey() {
  const raw = process.env.GOTBOT_MINIPROGRAM_SECRET
  if (!raw) throw new Error('缺少环境变量 GOTBOT_MINIPROGRAM_SECRET，无法初始化加密')
  return createHash('sha256').update(raw).digest()
}

function encryptText(value) {
  if (!value) return ''
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', secretKey(), iv)
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${iv.toString('base64')}.${tag.toString('base64')}.${encrypted.toString('base64')}`
}

function decryptText(payload) {
  if (!payload) return ''
  const parts = payload.split('.')
  if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) {
    throw new Error('加密载荷格式无效')
  }
  try {
    const decipher = createDecipheriv('aes-256-gcm', secretKey(), Buffer.from(parts[0], 'base64'))
    decipher.setAuthTag(Buffer.from(parts[1], 'base64'))
    const decrypted = Buffer.concat([decipher.update(Buffer.from(parts[2], 'base64')), decipher.final()])
    return decrypted.toString('utf8')
  } catch (error) {
    throw new Error(`解密失败：${error instanceof Error ? error.message : '未知错误'}`)
  }
}

module.exports = { encryptText, decryptText }
