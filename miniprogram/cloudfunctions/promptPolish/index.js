const https = require('node:https')
const { fail, ok } = require('./common/types')

const endpoint = 'https://apihub.agnes-ai.com/v1/chat/completions'
const model = 'agnes-2.0-flash'

function requestJson(url, payload, apiKey) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload)
    const req = https.request(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    }, (res) => {
      const chunks = []
      res.on('data', (chunk) => chunks.push(chunk))
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8')
        let data = {}
        try { data = text ? JSON.parse(text) : {} } catch (error) { data = { raw: text } }
        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error(data.error?.message || data.message || `Agnes 润色失败：${res.statusCode}`))
          return
        }
        resolve(data)
      })
    })
    req.on('error', reject)
    req.setTimeout(30000, () => req.destroy(new Error('Agnes 润色请求超时')))
    req.write(body)
    req.end()
  })
}

function buildMessages({ type, text, toolTitle }) {
  const isNegative = type === 'negative'
  return [
    {
      role: 'system',
      content: isNegative
        ? '你是 AI 视觉生成的反向提示词优化助手。只输出润色后的反向提示词，用中文逗号分隔，不要解释。'
        : '你是 AI 视觉生成的提示词优化助手。只输出润色后的提示词，不要解释，不要使用 Markdown。',
    },
    {
      role: 'user',
      content: isNegative
        ? `创作类型：${toolTitle || 'AI 创作'}\n请把以下反向提示词润色得更完整，覆盖低质量、变形、画面错误、主体异常等问题：\n${text || '低清晰度、模糊、变形、文字水印'}`
        : `创作类型：${toolTitle || 'AI 创作'}\n请把以下提示词润色成适合图像或视频生成的高质量提示词，保留原意，补充主体、场景、光线、构图、质感和镜头语言：\n${text || '主体明确，画面完整，适合商业创作'}`,
    },
  ]
}

function extractText(result) {
  return String(result.choices?.[0]?.message?.content || result.output_text || '').trim()
}

exports.main = async function main(event = {}) {
  try {
    if (event.action !== 'polish') return fail('unsupported action')
    const apiKey = process.env.PLATFORM_TEXT_API_KEY || process.env.PLATFORM_IMAGE_API_KEY || ''
    if (!apiKey) return fail('缺少 Agnes API Key，请先配置云函数环境变量 PLATFORM_TEXT_API_KEY')
    const result = await requestJson(endpoint, {
      model,
      messages: buildMessages(event),
      temperature: 0.7,
      max_tokens: 700,
    }, apiKey)
    const text = extractText(result)
    if (!text) return fail('Agnes 没有返回润色结果')
    return ok({ text, model })
  } catch (error) {
    return fail(error instanceof Error ? error.message : 'promptPolish failed')
  }
}
