const { list, upsert } = require('./common/db')
const { fail, ok } = require('./common/types')

function now() {
  return new Date().toISOString()
}

const cannedPrompts = {
  glidea: [
    { id: 'glidea-1', title: 'Glidea 电商主图', prompt: 'clean ecommerce hero image, premium lighting, strong product silhouette', source: 'glidea', sourceId: 'glidea-1', category: '电商', subCategory: '', author: 'Glidea', tags: ['电商'], preview: '', refImages: [], createdAt: now() },
  ],
  EvoLinkAI: [
    { id: 'evolink-1', title: 'EvoLinkAI 科技封面', prompt: 'technology poster, luminous interface, premium startup visual, editorial composition', source: 'EvoLinkAI', sourceId: 'evolink-1', category: '封面', subCategory: '', author: 'EvoLinkAI', tags: ['封面'], preview: '', refImages: [], createdAt: now() },
  ],
  freestylefly: [
    { id: 'freestylefly-1', title: 'Freestylefly 图标灵感', prompt: 'rounded 3D app icon, vibrant gradients, polished reflections, centered object', source: 'freestylefly', sourceId: 'freestylefly-1', category: 'ICON', subCategory: '', author: 'Freestylefly', tags: ['ICON'], preview: '', refImages: [], createdAt: now() },
  ],
}

exports.main = async function main(event = {}, context = {}) {
  try {
    const openid = context.OPENID
    if (!openid) throw new Error('认证失败：无法获取用户身份')

    if (event.action === 'list') {
      const packs = await list('promptPacks', (item) => item.openid === openid)
      return ok(packs.flatMap((item) => item.items || []))
    }

    if (event.action === 'sync') {
      const source = event.source
      if (!source || !cannedPrompts[source]) throw new Error(`不支持的来源：${source || '(空)'}`)
      const items = cannedPrompts[source]
      await upsert('promptPacks', (item) => item.openid === openid && item.source === source, {
        openid,
        source,
        version: now(),
        items,
      })
      return ok(items)
    }

    throw new Error('不支持的操作')
  } catch (error) {
    return fail(error instanceof Error ? error.message : 'promptPacks failed')
  }
}
