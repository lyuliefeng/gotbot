const { app, BrowserWindow, dialog, ipcMain } = require('electron')
const fs = require('node:fs/promises')
const path = require('node:path')
const crypto = require('node:crypto')

const isDev = process.env.ELECTRON_DEV === '1'
const devUrl = process.env.ELECTRON_RENDERER_URL || 'http://127.0.0.1:3030'
const AGNES_VIDEOS_PATH = 'v1/videos'
const AGNES_LITTERBOX_UPLOAD_URL = 'https://litterbox.catbox.moe/resources/internals/api.php'
const AGNES_VIDEO_POLL_INTERVAL_MS = 5000
const AGNES_VIDEO_POLL_TIMEOUT_MS = 600000
const UPSTREAM_RETRY_STATUS = new Set([429, 500, 502, 503, 504, 524])
const UPSTREAM_MAX_RETRIES = 3
const UPSTREAM_RETRY_BASE_MS = 1500

function errorMessageText(error) {
  if (error && typeof error === 'object' && typeof error.message === 'string') return error.message
  return error instanceof Error ? error.message : String(error)
}

function errorCause(error) {
  return error instanceof Error && 'cause' in error ? error.cause : undefined
}

function errorField(error, key) {
  if (!error || typeof error !== 'object') return ''
  const value = error[key]
  return typeof value === 'string' || typeof value === 'number' ? String(value) : ''
}

function upstreamNetworkError(action, error) {
  const cause = errorCause(error)
  const message = errorMessageText(error)
  const causeCode = errorField(cause, 'code') || errorField(cause, 'name')
  const causeMessage = cause ? errorMessageText(cause) : ''
  const detail = causeCode && causeMessage
    ? `${causeCode}: ${causeMessage}`
    : causeMessage || causeCode
  const suffix = detail && detail !== message ? `（${detail}）` : ''
  return new Error(`${action}: ${message}${suffix}`)
}

async function fetchUpstream(endpoint, init, action) {
  try {
    return await fetch(endpoint, init)
  } catch (error) {
    throw upstreamNetworkError(action, error)
  }
}

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
  if (protocol === 'openai-images' || protocol === 'agnes-image') return createOpenAiImagesGeneration(input, model, protocol)
  if (protocol === 'agnes-video') return createAgnesVideoGeneration(input, model)
  if (protocol === 'multimodal-chat') return createMultimodalChatGeneration(input, model)
  if (protocol === 'openai-image-edits') return createOpenAiImageEditsGeneration(input, model)
  throw new Error(`Electron 版本暂未实现该生成协议: ${protocol}`)
}

function createLocalGeneration(input) {
  const id = `task-${crypto.randomUUID()}`
  const createdAt = new Date().toISOString()
  return completedTask(input, id, createdAt, Array.from({ length: input.batchSize }, (_item, index) => createPreviewAsset(id, input, index, createdAt)))
}

async function createOpenAiImagesGeneration(input, model, protocol) {
  const endpoint = joinApiEndpoint(model.endpoint, model.apiPath, 'v1/images/generations')
  const isAgnes = protocol === 'agnes-image'
  function buildBody() {
    return {
      model: model.model.trim(),
      prompt: input.prompt.trim(),
      ...(isAgnes ? {} : { n: input.batchSize }),
      size: `${input.width}x${input.height}`,
      ...(!isAgnes && input.seed > 0 ? { seed: input.seed } : {}),
      ...(isAgnes
        ? { extra_body: {
            response_format: 'url',
            ...(input.mode === 'img2img' && input.referenceImage
              ? { image: [String(input.referenceImage).trim()] }
              : {}),
          }}
        : {}),
    }
  }
  let images = []
  if (isAgnes && input.batchSize > 1) {
    for (let i = 0; i < input.batchSize; i++) {
      const payload = await postJson(endpoint, model.apiKey, buildBody())
      images.push(...collectImageOutputs(payload))
    }
  } else {
    const payload = await postJson(endpoint, model.apiKey, buildBody())
    images = collectImageOutputs(payload)
  }
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

async function createAgnesVideoGeneration(input, model) {
  if (input.mode !== 'txt2video' && input.mode !== 'img2video') throw new Error('Agnes 视频协议只能用于视频模式')
  const endpoint = joinApiEndpoint(model.endpoint, model.apiPath, AGNES_VIDEOS_PATH)
  const body = {
    model: model.model.trim(),
    prompt: input.prompt.trim(),
    width: input.width,
    height: input.height,
    num_frames: numberModeOption(input, 'numFrames', 81),
    frame_rate: numberModeOption(input, 'frameRate', 24),
  }
  if (String(input.negativePrompt || '').trim()) body.negative_prompt = String(input.negativePrompt).trim()
  if (input.seed > 0) body.seed = input.seed
  if (input.mode === 'img2video') body.image = await resolveAgnesInputImageUrl(input)

  const created = await postJson(endpoint, model.apiKey, body)
  const videoId = findAgnesVideoPollId(created)
  if (!videoId) throw new Error(`Agnes 视频模型未返回 videoId/taskId: ${JSON.stringify(created)}`)
  const completed = await pollAgnesVideo(model, videoId)
  const videoUrl = findVideoUrl(completed)
  if (!videoUrl) throw new Error(`Agnes 视频任务完成但未返回视频 URL: ${JSON.stringify(completed)}`)
  const id = `task-${crypto.randomUUID()}`
  const createdAt = new Date().toISOString()
  return completedTask(input, id, createdAt, [videoResponseAsset(id, input, createdAt, videoUrl)])
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

function videoResponseAsset(taskId, input, createdAt, videoUrl) {
  return {
    id: `asset-${crypto.randomUUID()}`,
    taskId,
    title: `${input.mode} 1`,
    width: input.width,
    height: input.height,
    format: 'mp4',
    dataUrl: videoUrl,
    localPath: undefined,
    mediaType: 'video',
    remoteUrl: videoUrl,
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

const POLISH_VOCAB = {
  character: [
    '面容精致', '眼神深邃', '目光温柔', '表情自然', '姿态优雅', '身姿挺拔',
    '长发飘逸', '短发干练', '发丝随风轻扬', '刘海微垂',
    '衣着考究', '服饰华丽', '衣袂飘飘', '穿着简约优雅', '身披轻纱',
    '肌肤细腻', '面容清秀', '轮廓分明', '气质温婉', '神态从容',
    '眉目如画', '唇红齿白', '面若桃花', '英气逼人', '温文尔雅',
  ],
  scene: [
    '古色古香的街道', '繁华都市街头', '静谧的湖畔', '郁郁葱葱的森林',
    '花开遍野的草原', '烟雨朦胧的山谷', '巍峨的雪山脚下', '碧海蓝天的海岸',
    '幽深的竹林', '灯火阑珊的小巷', '樱花纷飞的庭院', '秋叶铺满的小径',
    '白雪覆盖的屋顶', '潺潺流水的石桥', '藤蔓缠绕的废墟', '晨光中的田野',
    '暮色中的古堡', '薄雾笼罩的湖面', '阳光斑驳的窗台', '微风拂过的麦浪',
    '潺潺溪流旁', '苍翠山峦间', '繁华夜市里', '空旷沙漠中',
  ],
  color: [
    '暖色调', '冷色调', '金色光辉', '银白月光', '柔和渐变色彩',
    '高对比色彩', '低饱和度', '鲜艳明快', '淡雅清新', '复古色调',
    '琥珀色光芒', '翡翠绿', '宝石蓝', '玫瑰金', '紫罗兰色',
    '晨曦微光', '暮色昏黄', '霓虹闪烁', '体积光效果', '逆光剪影',
    '丁达尔光线', '暖黄灯光', '冷蓝阴影', '橙红晚霞映照',
  ],
  sky: [
    '湛蓝天空', '万里无云', '白云悠悠', '晚霞映天', '火烧云',
    '朝霞绚烂', '星河璀璨', '银河横跨天际', '繁星点点', '流星划过',
    '彩虹横跨', '极光漫舞', '月光如水', '月晕朦胧', '乌云翻涌',
    '薄雾轻笼', '金色阳光洒落', '夕阳西下', '旭日东升', '天空呈渐变色彩',
    '云层间透出光束', '暮色四合', '黎明破晓', '皓月当空',
  ],
}

function pickRandom(arr, count) {
  const copy = arr.slice()
  const result = []
  for (let i = 0; i < count && copy.length > 0; i++) {
    const idx = Math.floor(Math.random() * copy.length)
    result.push(copy.splice(idx, 1)[0])
  }
  return result
}

function randomPolishDetails(count) {
  return [
    ...pickRandom(POLISH_VOCAB.character, count),
    ...pickRandom(POLISH_VOCAB.scene, count),
    ...pickRandom(POLISH_VOCAB.color, count),
    ...pickRandom(POLISH_VOCAB.sky, count),
  ]
}

async function polishPrompt(input, model) {
  if (!model || model.provider === 'local-preview') return localPolishPrompt(input, model?.name || '本地文本润色')
  const endpoint = joinApiEndpoint(model.endpoint, model.apiPath, 'v1/chat/completions')
  const system = input.task === 'negative-prompt'
    ? 'You rewrite negative prompts for image and video generation. Return only disallowed defects and artifacts, never positive scene content. Do not include any meta-commentary about the prompt.'
    : 'You are a prompt engineer for AI image and video generation. Rewrite the user prompt to be vivid and detailed. Enrich it with specific visual details about character appearance, scene environment, color palette, lighting, and sky/atmosphere. Return ONLY the rewritten prompt text. Do not include any explanation, commentary, labels, or meta-descriptions like "suitable for image generation" or "polished by X".'
  const user = `${input.task || 'polish'} | ${input.modeLabel} | ${input.style}\n${input.prompt}`
  const payload = await postJson(endpoint, model.apiKey, {
    model: model.model,
    messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
    temperature: 0.7,
  })
  const prompt = payload.choices?.[0]?.message?.content?.trim()
  if (!prompt) throw new Error('文本模型未返回润色结果')
  return { prompt, modelName: model.name }
}

function localPolishPrompt(input, modelName) {
  if (input.task === 'negative-prompt') {
    const base = String(input.prompt || '').trim() || '低清晰度、变形、文字水印、错误构图'
    const prompt = Array.from(new Set([
      ...base.split(/[，,、]/).map((item) => item.trim()).filter(Boolean),
      '低清晰度',
      '结构变形',
      '多余肢体',
      '文字水印',
      '噪点',
      '过曝',
      '构图混乱',
    ])).join('、')
    return { prompt, modelName }
  }
  const joiner = input.task === 'translate-to-english' ? ', ' : '，'
  const details = randomPolishDetails(2).join(joiner)
  if (input.task === 'translate-to-english') {
    return { prompt: [input.prompt.trim(), `${input.style} style`, details].join(joiner), modelName }
  }
  if (input.task === 'video-prompt') {
    return { prompt: [input.prompt.trim() || '一个高质量的 AI 生成场景', `${input.style}风格`, '主体明确，动作连续，场景稳定，镜头运动自然', details].join(joiner), modelName }
  }
  return { prompt: [input.prompt.trim() || '一个高质量的 AI 生成场景', `${input.style}风格`, details].join(joiner), modelName }
}

async function listModelCatalog(profile) {
  if (profile.provider !== 'openai-compatible') throw new Error('仅支持 OpenAI Compatible 模型列表接口')
  if (!profile.endpoint?.trim()) throw new Error('请填写 API 地址')
  if (!profile.apiKey?.trim()) throw new Error('请填写 API Key')
  const endpoint = joinApiEndpoint(profile.endpoint, undefined, 'v1/models')
  const response = await fetchUpstream(endpoint, { headers: { Authorization: `Bearer ${profile.apiKey.trim()}` } }, `模型列表网络失败: GET ${endpoint}`)
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
  let lastError = null
  for (let attempt = 0; attempt <= UPSTREAM_MAX_RETRIES; attempt++) {
    const response = await fetchUpstream(endpoint, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey.trim()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }, `生成请求网络失败: POST ${endpoint}`)
    const text = await response.text()
    if (!response.ok) {
      if (UPSTREAM_RETRY_STATUS.has(response.status) && attempt < UPSTREAM_MAX_RETRIES) {
        lastError = new Error(`模型响应失败: HTTP ${response.status} ${text}`)
        await sleep(UPSTREAM_RETRY_BASE_MS * Math.pow(2, attempt))
        continue
      }
      throw new Error(`模型响应失败: HTTP ${response.status} ${text}`)
    }
    try {
      return JSON.parse(text)
    } catch (error) {
      throw new Error(`解析模型响应失败: ${error instanceof Error ? error.message : String(error)}; ${text}`)
    }
  }
  throw lastError || new Error(`生成请求重试耗尽: POST ${endpoint}`)
}

async function pollAgnesVideo(model, videoId) {
  const createEndpoint = joinApiEndpoint(model.endpoint, model.apiPath, AGNES_VIDEOS_PATH)
  const pollEndpoint = agnesVideoPollEndpoint(createEndpoint)
  const startedAt = Date.now()
  let consecutiveErrors = 0
  while (Date.now() - startedAt <= AGNES_VIDEO_POLL_TIMEOUT_MS) {
    const url = new URL(pollEndpoint)
    url.searchParams.set('video_id', videoId)
    let response
    try {
      response = await fetchUpstream(url, {
        headers: {
          Authorization: `Bearer ${String(model.apiKey || '').trim()}`,
        },
      }, `轮询 Agnes 视频网络失败: GET ${url.toString()}`)
    } catch (error) {
      consecutiveErrors++
      if (consecutiveErrors >= 5) throw error
      await sleep(AGNES_VIDEO_POLL_INTERVAL_MS)
      continue
    }
    const text = await response.text()
    if (!response.ok) {
      if (UPSTREAM_RETRY_STATUS.has(response.status)) {
        consecutiveErrors++
        if (consecutiveErrors >= 5) throw new Error(`模型响应失败: HTTP ${response.status} ${text}`)
        await sleep(AGNES_VIDEO_POLL_INTERVAL_MS)
        continue
      }
      throw new Error(`模型响应失败: HTTP ${response.status} ${text}`)
    }
    consecutiveErrors = 0
    const payload = text ? JSON.parse(text) : {}
    const status = (findStringByKeys(payload, ['status', 'state']) || 'running').toLowerCase()
    if (['completed', 'complete', 'succeeded', 'success', 'done'].includes(status)) return payload
    if (['failed', 'failure', 'error', 'cancelled', 'canceled'].includes(status)) throw new Error(`Agnes 视频任务失败: ${text}`)
    await sleep(AGNES_VIDEO_POLL_INTERVAL_MS)
  }
  throw new Error(`Agnes 视频任务超时，videoId: ${videoId}`)
}

function agnesVideoPollEndpoint(createEndpoint) {
  const url = new URL(createEndpoint)
  const segments = url.pathname.split('/').filter(Boolean)
  if (segments.at(-1) === 'videos') segments.pop()
  if (segments.at(-1) === 'v1') segments.pop()
  segments.push('agnesapi')
  url.pathname = `/${segments.join('/')}`
  url.search = ''
  return url.toString()
}

function numberModeOption(input, key, fallback) {
  const value = input.modeOptions?.[key]
  const numberValue = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(numberValue) && numberValue > 0 ? Math.round(numberValue) : fallback
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function normalizeSearchKey(key) {
  return String(key).replace(/[^a-zA-Z0-9]/g, '').toLowerCase()
}

function findStringByKeys(value, keys) {
  const normalizedKeys = new Set(keys.map(normalizeSearchKey))
  if (!value || typeof value !== 'object') return undefined
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findStringByKeys(item, keys)
      if (found) return found
    }
    return undefined
  }
  for (const [key, item] of Object.entries(value)) {
    if (normalizedKeys.has(normalizeSearchKey(key)) && typeof item === 'string' && item.trim()) return item.trim()
    const found = findStringByKeys(item, keys)
    if (found) return found
  }
  return undefined
}

function findAgnesVideoPollId(value) {
  const direct = findStringByKeys(value, ['videoid', 'video_id'])
  if (direct) return direct
  const id = findStringByKeys(value, ['id'])
  return id && id.toLowerCase().startsWith('video') ? id : undefined
}

function findVideoUrl(value) {
  if (typeof value === 'string') {
    const text = value.trim()
    return text.startsWith('http') && text.includes('.mp4') ? text : undefined
  }
  if (!value || typeof value !== 'object') return undefined
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findVideoUrl(item)
      if (found) return found
    }
    return undefined
  }
  for (const [key, item] of Object.entries(value)) {
    const normalized = normalizeSearchKey(key)
    if (['videourl', 'url', 'remixedfromvideoid'].includes(normalized) && typeof item === 'string') {
      const text = item.trim()
      if (text.startsWith('http')) return text
    }
    const found = findVideoUrl(item)
    if (found) return found
  }
  return undefined
}

async function resolveAgnesInputImageUrl(input) {
  const referenceImage = String(input.referenceImage || '').trim()
  if (!referenceImage) throw new Error('需要先上传或拖入参考图')
  if (referenceImage.startsWith('http://') || referenceImage.startsWith('https://')) return referenceImage
  const { mime, bytes } = decodeImageDataUrl(referenceImage)
  const form = new FormData()
  form.set('reqtype', 'fileupload')
  form.set('time', '1h')
  form.set('fileToUpload', new Blob([bytes], { type: mime }), `reference.${imageExtension(mime)}`)
  const response = await fetchUpstream(AGNES_LITTERBOX_UPLOAD_URL, {
    method: 'POST',
    body: form,
  }, `上传 Agnes 参考图网络失败: POST ${AGNES_LITTERBOX_UPLOAD_URL}`)
  const text = await response.text()
  if (!response.ok || !text.trim().startsWith('http')) throw new Error(`上传 Agnes 参考图失败: HTTP ${response.status} ${text}`)
  return text.trim()
}

function decodeImageDataUrl(dataUrl) {
  const match = /^data:([^;,]+)(;base64)?,(.+)$/.exec(String(dataUrl || ''))
  if (!match) throw new Error('参考图必须是 data URL 或 HTTP 图片地址')
  return {
    mime: match[1],
    bytes: match[2] ? Buffer.from(match[3], 'base64') : Buffer.from(decodeURIComponent(match[3])),
  }
}

function imageExtension(mime) {
  if (mime.includes('jpeg') || mime.includes('jpg')) return 'jpg'
  if (mime.includes('webp')) return 'webp'
  if (mime.includes('gif')) return 'gif'
  return 'png'
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
