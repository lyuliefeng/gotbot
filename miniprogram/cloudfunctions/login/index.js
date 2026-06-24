const { list, upsert } = require('./common/db')
const { ok, fail } = require('./common/types')

exports.main = async function main(event = {}, context = {}) {
  try {
    const wxContext = context || {}
    const openid = wxContext.OPENID || event.openid || 'mock-openid'
    const existing = await list('users', (item) => item.openid === openid)
    await upsert('users', (item) => item.openid === openid, {
      openid,
      updatedAt: new Date().toISOString(),
      createdAt: existing[0]?.createdAt || new Date().toISOString(),
    })
    return ok({ openid })
  } catch (error) {
    return fail(error instanceof Error ? error.message : 'login failed')
  }
}
