const modeLabels = {
  txt2img: '文生图',
  img2img: '图生图',
  cover: '封面图',
  icon: 'ICON',
  '3d': '3D 图',
  gif: 'GIF 动图',
  txt2video: '文生视频',
  img2video: '图生视频',
}

const tools = [
  { id: 'text-to-image', title: '文生图', mode: 'txt2img', modelKind: 'image', desc: '输入提示词，生成完整图像结果', promptSeed: 'high quality image, clear composition, commercial grade details', negativeSeed: 'low quality, blur, watermark', width: 1024, height: 1024 },
  { id: 'image-to-image', title: '图生图', mode: 'img2img', modelKind: 'image', desc: '上传参考图后做风格重绘', promptSeed: 'preserve structure, improve texture and scene readability', negativeSeed: 'distortion, bad anatomy', width: 1024, height: 1024, referenceRequired: true },
  { id: 'cover-poster', title: '封面图', mode: 'cover', modelKind: 'image', desc: '为内容平台快速生成封面视觉', promptSeed: 'cover art, clean title space, strong visual hierarchy', width: 1080, height: 1440 },
  { id: 'brand-icon', title: 'ICON', mode: 'icon', modelKind: 'image', desc: '生成应用或品牌图标母图', promptSeed: 'app icon, centered composition, premium brand language', width: 1024, height: 1024 },
  { id: 'three-d-scene', title: '3D 图', mode: '3d', modelKind: 'image', desc: '生成具备空间感与材质层次的视觉', promptSeed: '3D render, depth, volumetric lighting, tactile materials', width: 1024, height: 1024 },
  { id: 'gif-loop', title: 'GIF 动图', mode: 'gif', modelKind: 'image', desc: '生成轻量循环动效结果', promptSeed: 'looping gif, coherent motion, stable subject', width: 768, height: 768 },
  { id: 'text-to-video', title: '文生视频', mode: 'txt2video', modelKind: 'video', desc: '用文字生成短视频分镜或首帧预览', promptSeed: 'short cinematic video, smooth camera motion, consistent subject, high quality first frame', negativeSeed: 'jitter, flicker, broken motion, low quality', width: 1280, height: 720 },
  { id: 'image-to-video', title: '图生视频', mode: 'img2video', modelKind: 'video', desc: '上传参考图后生成动态镜头预览', promptSeed: 'animate the reference image, smooth camera motion, consistent subject, cinematic lighting', negativeSeed: 'jitter, flicker, broken motion, distorted subject, low quality', width: 1280, height: 720, referenceRequired: true },
]

const prompts = [
  { id: 'prompt-1', title: '科技海报', prompt: '科技产品发布海报，中心主体，强对比文字留白', promptEn: 'technology launch poster, centered subject, strong contrast title space', category: '封面', source: 'builtin' },
  { id: 'prompt-2', title: '品牌图标', prompt: '极简品牌图标，圆润几何，玻璃质感，高级感', promptEn: 'minimalist brand icon, rounded geometry, glass texture, premium feel', category: 'ICON', source: 'builtin' },
  { id: 'prompt-3', title: '创作者工作台', prompt: '现代创作者工作台，深色界面，柔和灯光，精致材质', promptEn: 'modern creator workspace, dark UI, soft lighting, refined materials', category: '文生图', source: 'builtin' },
]

const defaultModels = [
  { id: 'platform-agnes-image', name: '默认 Agnes 图片模型', provider: 'openai-compatible', endpoint: 'https://apihub.agnes-ai.com', apiPath: 'v1/images/generations', apiProtocol: 'openai-images', model: 'agnes-image-2.1-flash', kind: 'image', keyMode: 'platform', isPrimary: true, status: 'untested' },
]

module.exports = { modeLabels, tools, prompts, defaultModels }
