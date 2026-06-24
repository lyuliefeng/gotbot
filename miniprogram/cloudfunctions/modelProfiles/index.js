const { decryptText, encryptText } = require('./common/crypto')
const { list, remove, upsert } = require('./common/db')
const { testProfile } = require('./common/generation-service')
const { fail, ok } = require('./common/types')

function sanitizeProfile(profile) {
  const { encryptedApiKey, encryptedApiSecret, apiKey, apiSecret, ...rest } = profile
  return { ...rest, apiKey: '', apiSecret: '' }
}

exports.main = async function main(event = {}, context = {}) {
  try {
    const openid = context.OPENID || event.openid || 'mock-openid'
    if (event.action === 'list') {
      const profiles = await list('modelProfiles', (item) => item.openid === openid)
      return ok(profiles.map(sanitizeProfile))
    }

    if (event.action === 'save') {
      const profile = event.profile || {}
      const id = profile.id || `model-${Date.now()}`
      const saved = await upsert('modelProfiles', (item) => item.id === id && item.openid === openid, {
        ...profile,
        id,
        openid,
        encryptedApiKey: profile.keyMode === 'user' ? encryptText(profile.apiKey || '') : '',
        encryptedApiSecret: profile.keyMode === 'user' ? encryptText(profile.apiSecret || '') : '',
        apiKey: undefined,
        apiSecret: undefined,
        updatedAt: new Date().toISOString(),
      })
      return ok(sanitizeProfile(saved))
    }

    if (event.action === 'delete') {
      return ok(await remove('modelProfiles', (item) => item.id === event.id && item.openid === openid))
    }

    if (event.action === 'test') {
      const profile = event.profile || {}
      const hydrated = {
        ...profile,
        apiKey: profile.keyMode === 'user' ? profile.apiKey || decryptText(profile.encryptedApiKey || '') : process.env.PLATFORM_IMAGE_API_KEY || '',
        apiSecret: profile.keyMode === 'user' ? profile.apiSecret || decryptText(profile.encryptedApiSecret || '') : process.env.PLATFORM_IMAGE_API_SECRET || '',
      }
      return ok(await testProfile(hydrated))
    }

    return fail('unsupported action')
  } catch (error) {
    return fail(error instanceof Error ? error.message : 'modelProfiles failed')
  }
}
