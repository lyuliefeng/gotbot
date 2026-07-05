import type { CoverPreset, GenerationMode, ModelProfile, PromptItem } from '@/types'
import { normalizeBilingualPromptMarkdown } from '@/domain/promptImport'
import { stableId } from '@/domain/ids'

const builtinPromptMarkdown = `
# 常用提示词

## 工作台
| 序号 | 中文提示词 | 英文提示词 |
|---|---|---|
| 1 | 现代创作者工作台，深色界面，柔和灯光，精致材质 | modern creator workspace, dark UI, soft lighting, refined materials |
| 2 | 小户型客厅改造，原木家具、奶油色墙面、隐藏收纳、自然采光 | small apartment living room redesign, wood furniture, cream walls, hidden storage, natural daylight |

## 海报
| 序号 | 中文提示词 | 英文提示词 |
|---|---|---|
| 1 | 科技产品发布海报，中心主体，强对比文字留白 | technology launch poster, centered subject, strong contrast title space |
| 2 | 小红书生活方式封面，明亮桌面、手写标题区域、清新奶油色调 | lifestyle social media cover, bright desktop scene, handwritten title area, fresh creamy color palette |
| 3 | 中秋节品牌海报，月亮、桂花、礼盒、温柔金色光晕，标题留白 | Mid-Autumn Festival brand poster, moon, osmanthus, gift box, gentle golden glow, title space |

## 图标
| 序号 | 中文提示词 | 英文提示词 |
|---|---|---|
| 1 | 极简品牌图标，圆润几何，玻璃质感，高级感 | minimalist brand icon, rounded geometry, glass texture, premium feel |

## 电商
| 序号 | 中文提示词 | 英文提示词 |
|---|---|---|
| 1 | 高端耳机电商主图，纯净浅色背景，产品悬浮，柔和反射，卖点留白 | premium headphones ecommerce hero image, clean light background, floating product, soft reflection, copy space |
| 2 | 精品咖啡包装设计，牛皮纸袋、极简标签、咖啡豆纹理、货架展示 | boutique coffee packaging design, kraft paper bag, minimalist label, coffee bean texture, shelf display |

## 摄影
| 序号 | 中文提示词 | 英文提示词 |
|---|---|---|
| 1 | 热气腾腾的牛肉面桌面摄影，浅景深，暖色窗边光，真实食材细节 | steaming beef noodle tabletop photography, shallow depth of field, warm window light, realistic ingredient details |
| 2 | 城市夜景人像写真，霓虹反光，半身构图，自然表情，高级胶片质感 | urban night portrait, neon reflections, half-body composition, natural expression, premium film look |

## 风景
| 序号 | 中文提示词 | 英文提示词 |
|---|---|---|
| 1 | 清晨山谷徒步路线，薄雾、金色日出、远处小木屋，电影级广角构图 | morning mountain valley hiking trail, mist, golden sunrise, distant cabin, cinematic wide-angle composition |

## 插画
| 序号 | 中文提示词 | 英文提示词 |
|---|---|---|
| 1 | 国潮龙年插画，祥云、剪纸纹理、红金配色，现代品牌海报风格 | Chinese trendy dragon year illustration, auspicious clouds, paper-cut texture, red and gold palette, modern brand poster style |
| 2 | 儿童绘本森林茶会，小动物围坐，柔软水彩，温暖童话氛围 | children picture book forest tea party, animals sitting together, soft watercolor, warm fairytale atmosphere |

## 科幻
| 序号 | 中文提示词 | 英文提示词 |
|---|---|---|
| 1 | 雨夜赛博朋克街角，透明雨伞、全息广告、湿润路面反射，强透视 | rainy cyberpunk street corner, transparent umbrella, holographic ads, wet road reflections, strong perspective |

## 3D
| 序号 | 中文提示词 | 英文提示词 |
|---|---|---|
| 1 | 可爱机器人 3D 角色，圆润比例，白色陶瓷材质，蓝色发光眼睛，收藏玩具风 | cute robot 3D character, rounded proportions, white ceramic material, glowing blue eyes, collectible toy style |

## 封面
| 序号 | 中文提示词 | 英文提示词 |
|---|---|---|
| 1 | 短视频开场封面，咖啡杯特写，蒸汽上升，早晨阳光扫过桌面，标题留白 | short video opening cover, close-up coffee cup, rising steam, morning sunlight across table, title space |

## 表情包
| 序号 | 中文提示词 | 英文提示词 |
|---|---|---|
| 1 | 圆脸猫咪表情包，夸张震惊表情，粗线条，透明背景，适合聊天贴纸 | round-face cat sticker, exaggerated shocked expression, bold outlines, transparent background, chat sticker style |

## 信息图
| 序号 | 中文提示词 | 英文提示词 |
|---|---|---|
| 1 | AI 学习路线图信息图，模块化卡片、清晰箭头、蓝紫渐变、适合手机阅读 | AI learning roadmap infographic, modular cards, clear arrows, blue-purple gradient, mobile-readable layout |
`

export interface ToolEntry {
  id: string
  title: string
  desc: string
  mode: GenerationMode
  subtitle: string
  promptSeed: string
  negativeSeed?: string
  referenceRequired?: boolean
  recommendedSize?: { width: number; height: number }
}

export const modeLabels: Record<GenerationMode, string> = {
  txt2img: '文生图',
  img2img: '图生图',
  cover: '封面图',
  icon: 'ICON',
  '3d': '3D 图',
  gif: 'GIF 动图',
  txt2video: '文生视频',
  img2video: '图生视频',
}

export const stylePresets = ['自然', '摄影', '插画', '电影感', '品牌感'] as const

export const toolGroups = [
  {
    id: 'generate',
    name: '生成类',
    tools: [
      {
        id: 'text-to-image',
        title: '文生图',
        desc: '输入提示词，生成完整图像结果',
        mode: 'txt2img',
        subtitle: '从文字直接创作图像',
        promptSeed: 'high quality image, clear composition, commercial grade details',
        negativeSeed: 'low quality, blur, watermark',
        recommendedSize: { width: 1024, height: 1024 },
      },
      {
        id: 'image-to-image',
        title: '图生图',
        desc: '上传参考图后做风格重绘',
        mode: 'img2img',
        subtitle: '保留主体结构，替换风格与质感',
        promptSeed: 'preserve structure, improve texture and scene readability',
        negativeSeed: 'distortion, bad anatomy',
        referenceRequired: true,
        recommendedSize: { width: 1024, height: 1024 },
      },
      {
        id: 'cover-poster',
        title: '封面图',
        desc: '为内容平台快速生成封面视觉',
        mode: 'cover',
        subtitle: '突出标题空间与主视觉',
        promptSeed: 'cover art, clean title space, strong visual hierarchy',
        recommendedSize: { width: 1080, height: 1440 },
      },
      {
        id: 'brand-icon',
        title: 'ICON',
        desc: '生成应用或品牌图标母图',
        mode: 'icon',
        subtitle: '优先产出 1024 母图',
        promptSeed: 'app icon, centered composition, premium brand language',
        recommendedSize: { width: 1024, height: 1024 },
      },
      {
        id: 'three-d-scene',
        title: '3D 图',
        desc: '生成具备空间感与材质层次的视觉',
        mode: '3d',
        subtitle: '强化立体感与光影',
        promptSeed: '3D render, depth, volumetric lighting, tactile materials',
        recommendedSize: { width: 1024, height: 1024 },
      },
      {
        id: 'gif-loop',
        title: 'GIF 动图',
        desc: '生成轻量循环动效结果',
        mode: 'gif',
        subtitle: '适合表情包和简单产品演示',
        promptSeed: 'looping gif, coherent motion, stable subject',
        recommendedSize: { width: 768, height: 768 },
      },
      {
        id: 'text-to-video',
        title: '文生视频',
        desc: '用文字生成短视频分镜或动态预览',
        mode: 'txt2video',
        subtitle: '文字生成短视频',
        promptSeed: 'short cinematic video, smooth camera motion, consistent subject, high quality',
        negativeSeed: 'jitter, flicker, broken motion, low quality',
        recommendedSize: { width: 1280, height: 720 },
      },
      {
        id: 'image-to-video',
        title: '图生视频',
        desc: '上传参考图后生成动态镜头预览',
        mode: 'img2video',
        subtitle: '参考图动态化',
        promptSeed: 'animate the reference image, smooth camera motion, consistent subject, cinematic lighting',
        negativeSeed: 'jitter, flicker, broken motion, distorted subject, low quality',
        referenceRequired: true,
        recommendedSize: { width: 1280, height: 720 },
      },
    ],
  },
] as const

export const builtinPrompts: PromptItem[] = normalizeBilingualPromptMarkdown(builtinPromptMarkdown)

export const defaultModels: ModelProfile[] = []

export const defaultCoverPresets: CoverPreset[] = [
  { id: stableId('cover', 'xiaohongshu'), name: '小红书封面', width: 1242, height: 1660, enabled: true, custom: false },
  { id: stableId('cover', 'wechat-article'), name: '公众号头图', width: 900, height: 383, enabled: true, custom: false },
  { id: stableId('cover', 'douyin'), name: '短视频封面', width: 1080, height: 1920, enabled: true, custom: false },
]
