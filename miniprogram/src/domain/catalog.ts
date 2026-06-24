import type { CoverPreset, GenerationMode, ModelProfile, PromptItem } from '@/types'
import { normalizeBilingualPromptMarkdown } from '@/domain/promptImport'
import { stableId } from '@/domain/ids'

const builtinPromptMarkdown = `
# 常用提示词

## 工作台
| 序号 | 中文提示词 | 英文提示词 |
|---|---|---|
| 1 | 现代创作者工作台，深色界面，柔和灯光，精致材质 | modern creator workspace, dark UI, soft lighting, refined materials |

## 海报
| 序号 | 中文提示词 | 英文提示词 |
|---|---|---|
| 1 | 科技产品发布海报，中心主体，强对比文字留白 | technology launch poster, centered subject, strong contrast title space |

## 图标
| 序号 | 中文提示词 | 英文提示词 |
|---|---|---|
| 1 | 极简品牌图标，圆润几何，玻璃质感，高级感 | minimalist brand icon, rounded geometry, glass texture, premium feel |
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
    ],
  },
] as const

export const builtinPrompts: PromptItem[] = normalizeBilingualPromptMarkdown(builtinPromptMarkdown)

export const defaultModels: ModelProfile[] = [
  {
    id: 'platform-agnes-image',
    name: '平台 Agnes Image',
    provider: 'openai-compatible',
    endpoint: 'https://apihub.agnes-ai.com/v1',
    apiPath: 'images/generations',
    apiProtocol: 'agnes-image',
    model: 'agnes-image-2.1-flash',
    kind: 'image',
    isPrimary: true,
    status: 'untested',
    keyMode: 'platform',
  },
]

export const defaultCoverPresets: CoverPreset[] = [
  { id: stableId('cover', 'xiaohongshu'), name: '小红书封面', width: 1242, height: 1660, enabled: true, custom: false },
  { id: stableId('cover', 'wechat-article'), name: '公众号头图', width: 900, height: 383, enabled: true, custom: false },
  { id: stableId('cover', 'douyin'), name: '短视频封面', width: 1080, height: 1920, enabled: true, custom: false },
]
