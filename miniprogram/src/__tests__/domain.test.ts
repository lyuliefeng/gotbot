import { describe, expect, it } from 'vitest'
import { createLocalPreviewTask, validateGenerationInput } from '@/domain/generation'
import { mergePromptItems, normalizePromptImport } from '@/domain/promptImport'

describe('mini-program domain', () => {
  it('validates generation input and creates preview task', () => {
    const input = {
      mode: 'txt2img' as const,
      prompt: '一张科技海报',
      negativePrompt: '',
      modelId: 'model-1',
      width: 1024,
      height: 1024,
      batchSize: 2,
      steps: 28,
      seed: 1,
      style: '自然',
    }
    validateGenerationInput(input)
    const task = createLocalPreviewTask(input)
    expect(task.assets).toHaveLength(2)
    expect(task.status).toBe('completed')
  })

  it('requires reference image for img2img', () => {
    expect(() => validateGenerationInput({
      mode: 'img2img',
      prompt: '重绘',
      negativePrompt: '',
      modelId: 'model-1',
      width: 1024,
      height: 1024,
      batchSize: 1,
      steps: 28,
      seed: 1,
      style: '自然',
    })).toThrow('图生图需要先上传参考图')
  })

  it('imports and dedupes prompt JSON', () => {
    const imported = normalizePromptImport(JSON.stringify({ prompts: [{ title: 'A', prompt: 'beautiful product photo' }] }), 'custom.json')
    const merged = mergePromptItems(imported, imported)
    expect(imported).toHaveLength(1)
    expect(merged).toHaveLength(1)
  })
})
