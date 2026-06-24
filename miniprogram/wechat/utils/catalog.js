const modeLabels = {
  txt2img: '文生图',
  img2img: '图生图',
  cover: '封面图',
  icon: 'ICON',
  '3d': '3D 图',
  gif: 'GIF 动图',
}

const tools = [
  { id: 'text-to-image', title: '文生图', mode: 'txt2img', desc: '输入提示词，生成完整图像结果', promptSeed: 'high quality image, clear composition, commercial grade details', negativeSeed: 'low quality, blur, watermark', width: 1024, height: 1024 },
  { id: 'image-to-image', title: '图生图', mode: 'img2img', desc: '上传参考图后做风格重绘', promptSeed: 'preserve structure, improve texture and scene readability', negativeSeed: 'distortion, bad anatomy', width: 1024, height: 1024, referenceRequired: true },
  { id: 'cover-poster', title: '封面图', mode: 'cover', desc: '为内容平台快速生成封面视觉', promptSeed: 'cover art, clean title space, strong visual hierarchy', width: 1080, height: 1440 },
  { id: 'brand-icon', title: 'ICON', mode: 'icon', desc: '生成应用或品牌图标母图', promptSeed: 'app icon, centered composition, premium brand language', width: 1024, height: 1024 },
  { id: 'three-d-scene', title: '3D 图', mode: '3d', desc: '生成具备空间感与材质层次的视觉', promptSeed: '3D render, depth, volumetric lighting, tactile materials', width: 1024, height: 1024 },
  { id: 'gif-loop', title: 'GIF 动图', mode: 'gif', desc: '生成轻量循环动效结果', promptSeed: 'looping gif, coherent motion, stable subject', width: 768, height: 768 },
]

const prompts = [
  { id: 'prompt-1', title: '科技海报', prompt: '科技产品发布海报，中心主体，强对比文字留白', promptEn: 'technology launch poster, centered subject, strong contrast title space', category: '封面', source: 'builtin' },
  { id: 'prompt-2', title: '品牌图标', prompt: '极简品牌图标，圆润几何，玻璃质感，高级感', promptEn: 'minimalist brand icon, rounded geometry, glass texture, premium feel', category: 'ICON', source: 'builtin' },
  { id: 'prompt-3', title: '创作者工作台', prompt: '现代创作者工作台，深色界面，柔和灯光，精致材质', promptEn: 'modern creator workspace, dark UI, soft lighting, refined materials', category: '文生图', source: 'builtin' },
]

const defaultModels = [
  { id: 'platform-openai-image', name: '平台 OpenAI Images', provider: 'openai-compatible', endpoint: 'https://api.openai.com', apiPath: 'v1/images/generations', apiProtocol: 'openai-images', model: 'gpt-image-1', kind: 'image', keyMode: 'platform', isPrimary: true, status: 'untested' },
]

module.exports = { modeLabels, tools, prompts, defaultModels }
