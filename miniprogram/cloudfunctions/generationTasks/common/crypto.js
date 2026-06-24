const { createCipheriv, createDecipheriv, createHash, randomBytes } = require('node:crypto')

function secretKey() {
  const raw = process.env.GOTBOT_MINIPROGRAM_SECRET || 'gotbot-miniprogram-dev-secret'
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
  const [ivPart, tagPart, dataPart] = payload.split('.')
  const decipher = createDecipheriv('aes-256-gcm', secretKey(), Buffer.from(ivPart, 'base64'))
  decipher.setAuthTag(Buffer.from(tagPart, 'base64'))
  const decrypted = Buffer.concat([decipher.update(Buffer.from(dataPart, 'base64')), decipher.final()])
  return decrypted.toString('utf8')
}

module.exports = { encryptText, decryptText }
