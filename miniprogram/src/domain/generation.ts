import type { GeneratedAsset, GenerationInput, GenerationTask } from '@/types'
import { createId, hashString } from '@/domain/ids'

const modeColors: Record<GenerationInput['mode'], [string, string]> = {
  txt2img: ['#2563eb', '#8b5cf6'],
  img2img: ['#0f766e', '#22c55e'],
  cover: ['#f43f5e', '#f59e0b'],
  icon: ['#111827', '#38bdf8'],
  '3d': ['#7c3aed', '#ec4899'],
  gif: ['#059669', '#84cc16'],
}

export function validateGenerationInput(input: GenerationInput): void {
  const minDimension = input.mode === 'icon' ? 16 : 128
  if (!input.prompt.trim()) throw new Error('请输入正向提示词')
  if (!input.modelId.trim()) throw new Error('请选择图像模型')
  if (!Number.isFinite(input.width) || input.width < minDimension || input.width > 4096) throw new Error(`宽度必须在 ${minDimension} 到 4096 之间`)
  if (!Number.isFinite(input.height) || input.height < minDimension || input.height > 4096) throw new Error(`高度必须在 ${minDimension} 到 4096 之间`)
  if (!Number.isInteger(input.batchSize) || input.batchSize < 1 || input.batchSize > 4) throw new Error('批量数量必须在 1 到 4 之间')
  if (!Number.isInteger(input.steps) || input.steps < 1 || input.steps > 80) throw new Error('生成步数必须在 1 到 80 之间')
  if (input.mode === 'img2img' && !input.referenceImage?.trim()) throw new Error('图生图需要先上传参考图')
}

export function createLocalPreviewTask(input: GenerationInput): GenerationTask {
  validateGenerationInput(input)
  const createdAt = new Date().toISOString()
  const id = createId('task')
  const assets = Array.from({ length: input.batchSize }, (_, index) => createPreviewAsset(id, input, index, createdAt))

  return {
    id,
    ...input,
    status: 'completed',
    assets,
    createdAt,
  }
}

function createPreviewAsset(taskId: string, input: GenerationInput, index: number, createdAt: string): GeneratedAsset {
  const [start, end] = modeColors[input.mode]
  const token = hashString(`${input.prompt}-${input.seed}-${index}`)
  const svg = `
  <svg xmlns="http://www.w3.org/2000/svg" width="${input.width}" height="${input.height}" viewBox="0 0 ${input.width} ${input.height}">
    <defs>
      <linearGradient id="g" x1="0" x2="1" y1="0" y2="1">
        <stop stop-color="${start}" />
        <stop offset="1" stop-color="${end}" />
      </linearGradient>
    </defs>
    <rect width="100%" height="100%" fill="url(#g)" />
    <rect x="10%" y="12%" width="80%" height="76%" rx="28" fill="rgba(15,23,42,.22)" stroke="rgba(255,255,255,.28)" />
    <text x="50%" y="42%" text-anchor="middle" fill="white" font-size="48" font-family="Arial, sans-serif" font-weight="700">${escapeXml(input.mode.toUpperCase())}</text>
    <text x="50%" y="52%" text-anchor="middle" fill="rgba(255,255,255,.88)" font-size="22" font-family="Arial, sans-serif">${escapeXml(input.prompt.slice(0, 28))}</text>
    <text x="50%" y="62%" text-anchor="middle" fill="rgba(255,255,255,.74)" font-size="18" font-family="monospace">${token}</text>
  </svg>`

  return {
    id: createId('asset'),
    taskId,
    title: `${modeTitle(input.mode)} ${index + 1}`,
    width: input.width,
    height: input.height,
    format: input.mode === 'gif' ? 'gif' : 'svg',
    dataUrl: input.mode === 'gif'
      ? 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'
      : `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
    mediaType: 'image',
    createdAt,
    isFavorite: false,
  }
}

function modeTitle(mode: GenerationInput['mode']): string {
  return {
    txt2img: '文生图',
    img2img: '图生图',
    cover: '封面图',
    icon: 'ICON',
    '3d': '3D 图',
    gif: 'GIF 动图',
  }[mode]
}

function escapeXml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')
}
