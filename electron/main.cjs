const { app, BrowserWindow, dialog, ipcMain } = require('electron')
const fs = require('node:fs/promises')
const path = require('node:path')
const crypto = require('node:crypto')

const isDev = process.env.ELECTRON_DEV === '1'
const devUrl = process.env.ELECTRON_RENDERER_URL || 'http://127.0.0.1:3030'

let mainWindow = null
let store = null

function createWindow() {
  mainWindow = new BrowserWindow({
    title: '道听徒说',
    width: 1280,
    height: 820,
    minWidth: 1024,
    minHeight: 720,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  if (isDev) {
    void mainWindow.loadURL(devUrl)
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    void mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  }
}

app.whenReady().then(async () => {
  store = new AppStore(path.join(app.getPath('userData'), 'state.json'))
  await store.init()
  registerIpc()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

function registerIpc() {
  ipcMain.handle('app:pick-directory', async (_event, defaultPath) => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: '选择输出目录',
      defaultPath: typeof defaultPath === 'string' && defaultPath.trim() ? defaultPath : undefined,
      properties: ['openDirectory', 'createDirectory'],
    })
    return result.canceled ? null : result.filePaths[0] || null
  })

  ipcMain.handle('app:invoke', async (_event, command, args = {}) => {
    try {
      return await handleCommand(command, args)
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : String(error))
    }
  })
}

async function handleCommand(command, args) {
  switch (command) {
    case 'load_app_state':
      return store.data.appState || null
    case 'save_app_state':
      store.data.appState = args.value
      await store.save()
      return null
    case 'list_generation_tasks':
      return store.listTasks(args.limit)
    case 'clear_generation_tasks':
      store.data.tasks = []
      await store.save()
      return null
    case 'delete_generation_asset':
      await store.deleteAsset(args.taskId, args.assetId)
      return null
    case 'create_generation_task': {
      const task = await createGenerationTask(args.input, args.model)
      await store.insertTask(task)
      return task
    }
    case 'polish_prompt':
      return polishPrompt(args.input, args.model)
    case 'list_model_catalog':
      return listModelCatalog(args.profile)
    case 'test_model_profile':
      return testModelProfile(args.profile)
    case 'export_generated_asset':
      return exportGeneratedAsset(args.request)
    case 'export_icon_bundle':
      return exportIconBundle(args.request)
    default:
      throw new Error(`Unsupported Electron command: ${command}`)
  }
}

class AppStore {
  constructor(file) {
    this.file = file
    this.data = { appState: null, tasks: [] }
  }

  async init() {
    await fs.mkdir(path.dirname(this.file), { recursive: true })
    try {
      this.data = JSON.parse(await fs.readFile(this.file, 'utf8'))
      if (!Array.isArray(this.data.tasks)) this.data.tasks = []
    } catch {
      await this.save()
    }
  }

  async save() {
    await fs.writeFile(this.file, JSON.stringify(this.data, null, 2))
  }

  listTasks(limit = 100) {
    const count = Math.min(Math.max(Number(limit) || 100, 1), 500)
    return [...this.data.tasks]
      .sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt)))
      .slice(0, count)
  }

  async insertTask(task) {
    this.data.tasks = [task, ...this.data.tasks.filter((item) => item.id !== task.id)]
    await this.save()
  }

  async deleteAsset(taskId, assetId) {
    this.data.tasks = this.data.tasks
      .map((task) => task.id !== taskId ? task : { ...task, assets: task.assets.filter((asset) => asset.id !== assetId) })
      .filter((task) => task.assets.length > 0)
    await this.save()
  }
}

function validateGenerationInput(input) {
  const minDimension = input.mode === 'icon' ? 16 : 128
  if (!input?.prompt?.trim()) throw new Error('请输入正向提示词')
  if (!input?.modelId?.trim()) throw new Error(input?.mode === 'txt2video' || input?.mode === 'img2video' ? '请选择视频模型' : '请选择图像模型')
  if (input.mode === 'img2video' && !String(input.referenceImage || '').trim()) throw new Error('图生视频需要先上传参考图')
  if (input.width < minDimension || input.width > 4096) throw new Error(`宽度必须在 ${minDimension} 到 4096 之间`)
  if (input.height < minDimension || input.height > 4096) throw new Error(`高度必须在 ${minDimension} 到 4096 之间`)
  if (input.batchSize < 1 || input.batchSize > 4) throw new Error('批量数量必须在 1 到 4 之间')
  if (input.steps < 1 || input.steps > 80) throw new Error('生成步数必须在 1 到 80 之间')
}

async function createGenerationTask(input, model) {
  validateGenerationInput(input)
  if (!model || model.provider === 'local-preview') return createLocalGeneration(input)
  if (model.provider !== 'openai-compatible') throw new Error('不支持的模型提供方')
  if (!model.endpoint?.trim()) throw new Error('请填写模型 API 地址')
  if (!model.apiKey?.trim()) throw new Error('请填写模型 API Key')
  if (!model.model?.trim()) throw new Error('请填写模型 ID')

  const protocol = model.apiProtocol || 'openai-images'
  if (protocol === 'openai-images' || protocol === 'agnes-image') return createOpenAiImagesGeneration(input, model)
  if (protocol === 'multimodal-chat') return createMultimodalChatGeneration(input, model)
  if (protocol === 'openai-image-edits') return createOpenAiImageEditsGeneration(input, model)
  throw new Error(`Electron 版本暂未实现该生成协议: ${protocol}`)
}

function createLocalGeneration(input) {
  const id = `task-${crypto.randomUUID()}`
  const createdAt = new Date().toISOString()
  return completedTask(input, id, createdAt, Array.from({ length: input.batchSize }, (_item, index) => createPreviewAsset(id, input, index, createdAt)))
}

async function createOpenAiImagesGeneration(input, model) {
  const endpoint = joinApiEndpoint(model.endpoint, model.apiPath, 'v1/images/generations')
  const payload = await postJson(endpoint, model.apiKey, {
    model: model.model.trim(),
    prompt: input.prompt.trim(),
    n: input.batchSize,
    size: `${input.width}x${input.height}`,
  })
  const images = collectImageOutputs(payload)
  if (!images.length) throw new Error(`图像模型未返回图片: POST ${endpoint}`)
  return taskFromImages(input, images)
}

async function createMultimodalChatGeneration(input, model) {
  const endpoint = joinApiEndpoint(model.endpoint, model.apiPath, 'v1/chat/completions')
  const content = [{ type: 'text', text: input.prompt.trim() }]
  if (input.referenceImage) content.push({ type: 'image_url', image_url: { url: input.referenceImage } })
  const payload = await postJson(endpoint, model.apiKey, {
    model: model.model.trim(),
    messages: [{ role: 'user', content }],
    n: input.batchSize,
    size: `${input.width}x${input.height}`,
  })
  const images = collectImageOutputs(payload)
  if (!images.length) throw new Error(`图像模型未返回图片: POST ${endpoint}`)
  return taskFromImages(input, images)
}

async function createOpenAiImageEditsGeneration() {
  throw new Error('Electron 版本暂未实现 multipart 图像编辑协议，请使用 openai-images 或 multimodal-chat')
}

async function taskFromImages(input, images) {
  const id = `task-${crypto.randomUUID()}`
  const createdAt = new Date().toISOString()
  const assets = images.map((image, index) => responseAsset(id, input, index, createdAt, image))
  return completedTask(input, id, createdAt, assets)
}

function completedTask(input, id, createdAt, assets) {
  return {
    id,
    ...input,
    status: 'completed',
    error: undefined,
    isFavorite: false,
    assets,
    createdAt,
  }
}

function responseAsset(taskId, input, index, createdAt, image) {
  const url = image.url || image.image_url || image.output_url || image.b64_json || ''
  const isBase64 = Boolean(image.b64_json) || (url && !/^https?:|^data:/.test(url))
  return {
    id: `asset-${crypto.randomUUID()}`,
    taskId,
    title: `${input.mode}-${index + 1}`,
    width: input.width,
    height: input.height,
    format: 'png',
    dataUrl: isBase64 ? `data:image/png;base64,${url}` : '',
    localPath: undefined,
    mediaType: 'image',
    remoteUrl: isBase64 ? undefined : url,
    createdAt,
    isFavorite: false,
  }
}

function createPreviewAsset(taskId, input, index, createdAt) {
  const label = String(input.mode).toUpperCase()
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${input.width}" height="${input.height}" viewBox="0 0 ${input.width} ${input.height}"><rect width="100%" height="100%" fill="#2563eb"/><text x="50%" y="46%" text-anchor="middle" fill="white" font-size="48" font-family="Arial" font-weight="700">${escapeXml(label)}</text><text x="50%" y="56%" text-anchor="middle" fill="white" font-size="24" font-family="Arial">${index + 1}</text></svg>`
  return {
    id: `asset-${crypto.randomUUID()}`,
    taskId,
    title: `${input.mode}-${index + 1}`,
    width: input.width,
    height: input.height,
    format: input.mode === 'gif' ? 'gif' : 'svg',
    dataUrl: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
    localPath: undefined,
    mediaType: 'image',
    remoteUrl: undefined,
    createdAt,
    isFavorite: false,
  }
}

async function polishPrompt(input, model) {
  if (!model || model.provider === 'local-preview') return localPolishPrompt(input, model?.name || '本地文本润色')
  const endpoint = joinApiEndpoint(model.endpoint, model.apiPath, 'v1/chat/completions')
  const system = 'You rewrite prompts for image and video generation. Return only the rewritten prompt.'
  const user = `${input.task || 'polish'} | ${input.modeLabel} | ${input.style}\n${input.prompt}`
  const payload = await postJson(endpoint, model.apiKey, {
    model: model.model,
    messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
    temperature: 0.4,
  })
  const prompt = payload.choices?.[0]?.message?.content?.trim()
  if (!prompt) throw new Error('文本模型未返回润色结果')
  return { prompt, modelName: model.name }
}

function localPolishPrompt(input, modelName) {
  const joiner = input.task === 'translate-to-english' ? ', ' : '，'
  const extra = input.task === 'video-prompt'
    ? '主体明确，动作连续，场景稳定，镜头运动自然，光照和氛围具备电影感'
    : '主体明确，构图稳定，光线层次清晰，材质细节丰富'
  return { prompt: [input.prompt.trim() || '一个高质量的 AI 生成场景', `${input.style}风格`, extra, `适合${input.modeLabel}输出`].join(joiner), modelName }
}

async function listModelCatalog(profile) {
  if (profile.provider !== 'openai-compatible') throw new Error('仅支持 OpenAI Compatible 模型列表接口')
  if (!profile.endpoint?.trim()) throw new Error('请填写 API 地址')
  if (!profile.apiKey?.trim()) throw new Error('请填写 API Key')
  const endpoint = joinApiEndpoint(profile.endpoint, undefined, 'v1/models')
  const response = await fetch(endpoint, { headers: { Authorization: `Bearer ${profile.apiKey.trim()}` } })
  if (!response.ok) throw new Error(`模型列表获取失败: HTTP ${response.status} ${await response.text()}`)
  const payload = await response.json()
  return (payload.data || []).map((item) => ({ id: item.id, name: item.id, kind: inferModelKind(item.id), source: 'remote' })).sort((a, b) => a.id.localeCompare(b.id))
}

async function testModelProfile(profile) {
  if (profile.provider === 'local-preview') return { ok: true, message: '本地预览模型可用' }
  if (!profile.endpoint?.trim()) return { ok: false, message: '请填写 API 地址' }
  if (!profile.apiKey?.trim()) return { ok: false, message: '请填写 API Key' }
  if (!profile.model?.trim()) return { ok: false, message: '请填写模型 ID' }
  try {
    if (profile.kind === 'text') {
      await polishPrompt({ prompt: '连接检测', modeLabel: '提示词润色', style: '自然' }, profile)
      return { ok: true, message: '文本模型连接检测成功，可用于提示词润色' }
    }
    await listModelCatalog(profile)
    return { ok: true, message: '模型连接检测成功，模型列表接口可用' }
  } catch (error) {
    return { ok: false, message: `模型连接检测失败：${error instanceof Error ? error.message : String(error)}` }
  }
}

async function exportGeneratedAsset(request) {
  if (!request.outputDir?.trim()) throw new Error('请设置导出目录')
  await fs.mkdir(request.outputDir, { recursive: true })
  const extension = sanitizeExtension(request.format || 'png')
  const filePath = path.join(request.outputDir, `${sanitizeFileName(request.title || 'asset')}.${extension}`)
  await fs.writeFile(filePath, dataUrlToBuffer(request.dataUrl))
  let metadataPath
  if (request.metadataJson) {
    metadataPath = path.join(request.outputDir, `${sanitizeFileName(request.title || 'asset')}.metadata.json`)
    await fs.writeFile(metadataPath, request.metadataJson)
  }
  return { path: filePath, metadataPath }
}

async function exportIconBundle(request) {
  if (!request.outputDir?.trim()) throw new Error('请设置导出目录')
  if (!request.entries?.length) throw new Error('没有可导出的图标文件')
  await fs.mkdir(request.outputDir, { recursive: true })
  const files = request.entries.map((entry) => ({ name: entry.name, data: dataUrlToBuffer(entry.dataUrl) }))
  const zipPath = path.join(request.outputDir, `${sanitizeFileName(request.bundleName || 'icons')}.zip`)
  await fs.writeFile(zipPath, buildZipStored(files))
  return zipPath
}

async function postJson(endpoint, apiKey, body) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey.trim()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const text = await response.text()
  if (!response.ok) throw new Error(`模型响应失败: HTTP ${response.status} ${text}`)
  try {
    return JSON.parse(text)
  } catch (error) {
    throw new Error(`解析模型响应失败: ${error instanceof Error ? error.message : String(error)}; ${text}`)
  }
}

function collectImageOutputs(payload) {
  const outputs = []
  if (Array.isArray(payload.data)) outputs.push(...payload.data)
  if (Array.isArray(payload.images)) outputs.push(...payload.images)
  if (payload.output?.url) outputs.push({ url: payload.output.url })
  for (const choice of payload.choices || []) {
    const content = choice.message?.content
    if (typeof content === 'string') {
      const match = content.match(/https?:\/\/\S+/)
      if (match) outputs.push({ url: match[0] })
    }
    if (Array.isArray(content)) {
      for (const item of content) {
        if (item.image_url?.url) outputs.push({ url: item.image_url.url })
        if (item.type === 'image_url' && item.url) outputs.push({ url: item.url })
      }
    }
  }
  return outputs
}

function joinApiEndpoint(base, customPath, defaultPath) {
  const suffix = (customPath && String(customPath).trim()) || defaultPath
  return `${String(base).replace(/\/+$/, '')}/${suffix.replace(/^\/+/, '')}`
}

function dataUrlToBuffer(dataUrl) {
  const value = String(dataUrl || '')
  if (!value.startsWith('data:')) return Buffer.from(value, 'utf8')
  const [, payload = ''] = value.split(',', 2)
  return value.includes(';base64,') ? Buffer.from(payload, 'base64') : Buffer.from(decodeURIComponent(payload), 'utf8')
}

function buildZipStored(files) {
  const chunks = []
  const central = []
  let offset = 0
  for (const file of files) {
    const name = Buffer.from(file.name)
    const data = Buffer.from(file.data)
    const crc = crc32(data)
    const local = Buffer.concat([u32(0x04034b50), u16(20), u16(0), u16(0), u16(0), u16(0), u32(crc), u32(data.length), u32(data.length), u16(name.length), u16(0), name, data])
    chunks.push(local)
    central.push(Buffer.concat([u32(0x02014b50), u16(20), u16(20), u16(0), u16(0), u16(0), u16(0), u32(crc), u32(data.length), u32(data.length), u16(name.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset), name]))
    offset += local.length
  }
  const centralBytes = Buffer.concat(central)
  return Buffer.concat([...chunks, centralBytes, u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length), u32(centralBytes.length), u32(offset), u16(0)])
}

function u16(value) { const buffer = Buffer.alloc(2); buffer.writeUInt16LE(value); return buffer }
function u32(value) { const buffer = Buffer.alloc(4); buffer.writeUInt32LE(value >>> 0); return buffer }

function crc32(data) {
  let crc = 0xFFFFFFFF
  for (const byte of data) {
    crc ^= byte
    for (let index = 0; index < 8; index += 1) crc = (crc & 1) ? (crc >>> 1) ^ 0xEDB88320 : crc >>> 1
  }
  return (crc ^ 0xFFFFFFFF) >>> 0
}

function inferModelKind(id) {
  const value = String(id).toLowerCase()
  if (value.includes('image') || value.includes('draw') || value.includes('vision')) return 'image'
  if (value.includes('video')) return 'video'
  if (value.includes('tts') || value.includes('speech')) return 'tts'
  if (value.includes('gpt') || value.includes('chat') || value.includes('qwen') || value.includes('deepseek')) return 'text'
  return 'unknown'
}

function sanitizeExtension(format) {
  return String(format).replace(/[^a-z0-9]/gi, '').toLowerCase() || 'png'
}

function sanitizeFileName(name) {
  return String(name).trim().replace(/[\\/:*?"<>|]/g, '_').slice(0, 80) || 'asset'
}

function escapeXml(value) {
  return String(value).replace(/[<>&'"]/g, (char) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[char])
}
