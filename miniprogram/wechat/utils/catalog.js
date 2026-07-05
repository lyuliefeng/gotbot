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
  { id: 'prompt-4', title: '电商主图', prompt: '高端耳机电商主图，纯净浅色背景，产品悬浮，柔和反射，卖点留白', promptEn: 'premium headphones ecommerce hero image, clean light background, floating product, soft reflection, copy space', category: '电商', source: 'builtin' },
  { id: 'prompt-5', title: '美食摄影', prompt: '热气腾腾的牛肉面桌面摄影，浅景深，暖色窗边光，真实食材细节', promptEn: 'steaming beef noodle tabletop photography, shallow depth of field, warm window light, realistic ingredient details', category: '摄影', source: 'builtin' },
  { id: 'prompt-6', title: '旅行风景', prompt: '清晨山谷徒步路线，薄雾、金色日出、远处小木屋，电影级广角构图', promptEn: 'morning mountain valley hiking trail, mist, golden sunrise, distant cabin, cinematic wide-angle composition', category: '风景', source: 'builtin' },
  { id: 'prompt-7', title: '人像写真', prompt: '城市夜景人像写真，霓虹反光，半身构图，自然表情，高级胶片质感', promptEn: 'urban night portrait, neon reflections, half-body composition, natural expression, premium film look', category: '人像', source: 'builtin' },
  { id: 'prompt-8', title: '室内设计', prompt: '小户型客厅改造，原木家具、奶油色墙面、隐藏收纳、自然采光', promptEn: 'small apartment living room redesign, wood furniture, cream walls, hidden storage, natural daylight', category: '空间', source: 'builtin' },
  { id: 'prompt-9', title: '国潮插画', prompt: '国潮龙年插画，祥云、剪纸纹理、红金配色，现代品牌海报风格', promptEn: 'Chinese trendy dragon year illustration, auspicious clouds, paper-cut texture, red and gold palette, modern brand poster style', category: '插画', source: 'builtin' },
  { id: 'prompt-10', title: '儿童绘本', prompt: '儿童绘本森林茶会，小动物围坐，柔软水彩，温暖童话氛围', promptEn: 'children picture book forest tea party, animals sitting together, soft watercolor, warm fairytale atmosphere', category: '插画', source: 'builtin' },
  { id: 'prompt-11', title: '赛博城市', prompt: '雨夜赛博朋克街角，透明雨伞、全息广告、湿润路面反射，强透视', promptEn: 'rainy cyberpunk street corner, transparent umbrella, holographic ads, wet road reflections, strong perspective', category: '科幻', source: 'builtin' },
  { id: 'prompt-12', title: '3D 角色', prompt: '可爱机器人 3D 角色，圆润比例，白色陶瓷材质，蓝色发光眼睛，收藏玩具风', promptEn: 'cute robot 3D character, rounded proportions, white ceramic material, glowing blue eyes, collectible toy style', category: '3D', source: 'builtin' },
  { id: 'prompt-13', title: '产品包装', prompt: '精品咖啡包装设计，牛皮纸袋、极简标签、咖啡豆纹理、货架展示', promptEn: 'boutique coffee packaging design, kraft paper bag, minimalist label, coffee bean texture, shelf display', category: '品牌', source: 'builtin' },
  { id: 'prompt-14', title: '社媒封面', prompt: '小红书生活方式封面，明亮桌面、手写标题区域、清新奶油色调', promptEn: 'lifestyle social media cover, bright desktop scene, handwritten title area, fresh creamy color palette', category: '封面', source: 'builtin' },
  { id: 'prompt-15', title: '短视频封面', prompt: '短视频开场封面，咖啡杯特写，蒸汽上升，早晨阳光扫过桌面，标题留白', promptEn: 'short video opening cover, close-up coffee cup, rising steam, morning sunlight across table, title space', category: '封面', source: 'builtin' },
  { id: 'prompt-16', title: '表情包', prompt: '圆脸猫咪表情包，夸张震惊表情，粗线条，透明背景，适合聊天贴纸', promptEn: 'round-face cat sticker, exaggerated shocked expression, bold outlines, transparent background, chat sticker style', category: '表情包', source: 'builtin' },
  { id: 'prompt-17', title: '教育信息图', prompt: 'AI 学习路线图信息图，模块化卡片、清晰箭头、蓝紫渐变、适合手机阅读', promptEn: 'AI learning roadmap infographic, modular cards, clear arrows, blue-purple gradient, mobile-readable layout', category: '信息图', source: 'builtin' },
  { id: 'prompt-18', title: '节日海报', prompt: '中秋节品牌海报，月亮、桂花、礼盒、温柔金色光晕，标题留白', promptEn: 'Mid-Autumn Festival brand poster, moon, osmanthus, gift box, gentle golden glow, title space', category: '节日', source: 'builtin' },
]

const defaultModels = []

module.exports = { modeLabels, tools, prompts, defaultModels }
