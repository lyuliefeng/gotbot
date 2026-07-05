import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAppStore } from '../app'
import { invokeOptional, isElectronRuntime } from '@/services/desktop'

vi.mock('@/services/desktop', () => ({
  invokeOptional: vi.fn(),
  isElectronRuntime: vi.fn(() => true),
}))

const mockedInvokeOptional = vi.mocked(invokeOptional)
const mockedIsElectronRuntime = vi.mocked(isElectronRuntime)

describe('app store generation bridge', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
    mockedInvokeOptional.mockReset()
    mockedInvokeOptional.mockResolvedValue(null)
    mockedIsElectronRuntime.mockReset()
    mockedIsElectronRuntime.mockReturnValue(true)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('starts without built-in API upstreams or default models', () => {
    const store = useAppStore()

    expect(store.models.some((model) => model.id === 'local-preview')).toBe(false)
    expect(store.imageModels.some((model) => model.provider === 'local-preview')).toBe(false)
    expect(store.models).toEqual([])
    expect(store.settings.defaultImageModelId).toBe('')
    expect(store.imageModels).toEqual([])
    expect(store.videoModels).toEqual([])
  })

  it('uses a gotbot default output directory internally', () => {
    const store = useAppStore()

    expect(store.settings.defaultOutputDir.toLowerCase()).toContain('gotbot')
    expect(store.settings.defaultOutputDir.toLowerCase()).not.toContain('samimage')
  })

  it('migrates legacy SamImage output directories to gotbot', () => {
    localStorage.setItem('samimage.v3.state', JSON.stringify({
      models: [],
      prompts: [],
      tasks: [],
      coverPresets: [],
      settings: {
        defaultOutputDir: 'D:\\SamImage\\Exports',
      },
    }))

    const store = useAppStore()

    expect(store.settings.defaultOutputDir).toBe('D:\\gotbot\\Exports')
  })

  it('removes legacy local preview models from persisted app state', async () => {
    mockedInvokeOptional.mockImplementation(async (command) => {
      if (command === 'load_app_state') {
        return {
          models: [
            {
              id: 'local-preview',
              name: 'Local Preview',
              provider: 'local-preview',
              endpoint: '',
              apiKey: '',
              model: 'samimage-local-preview',
              kind: 'image',
              isPrimary: true,
              status: 'connected',
            },
            {
              id: 'remote-image',
              name: 'Remote Image',
              provider: 'openai-compatible',
              endpoint: 'https://api.example.test/v1/images/generations',
              apiKey: 'sk-image',
              model: 'gpt-image-1',
              kind: 'image',
              isPrimary: false,
              status: 'connected',
            },
            {
              id: 'text-polish',
              name: 'Text Polish',
              provider: 'openai-compatible',
              endpoint: '',
              apiKey: '',
              model: '',
              kind: 'text',
              isPrimary: false,
              status: 'untested',
            },
          ],
          prompts: [],
          tasks: [],
          coverPresets: [],
          settings: {
            defaultOutputDir: 'D:\\SamImage\\Exports',
            defaultExportFormat: 'png',
            defaultImageModelId: 'local-preview',
            defaultGenerationSize: 1024,
            defaultBatchSize: 1,
            defaultStyle: '自然',
            autoSaveHistory: true,
            includePromptMetadata: true,
            theme: 'dark',
          },
        }
      }
      if (command === 'list_generation_tasks') return []
      return null
    })
    const store = useAppStore()

    await store.loadPersistedTasks()

    expect(store.models.some((model) => model.id === 'local-preview')).toBe(false)
    expect(store.imageModels).toEqual([expect.objectContaining({ id: 'remote-image', isPrimary: false })])
    expect(store.models.some((model) => model.id === 'agnes-image')).toBe(false)
    expect(store.models.some((model) => model.id === 'openai-gpt-image-2')).toBe(false)
    expect(store.settings.defaultImageModelId).toBe('remote-image')
  })

  it('removes blocked prompt categories from persisted app state', () => {
    localStorage.setItem('samimage.v3.state', JSON.stringify({
      models: [],
      prompts: [
        {
          id: 'prompt-agent-skill',
          title: 'Agent Skill',
          prompt: 'agent prompt',
          source: 'custom',
          sourceId: 'agent-skill',
          category: 'AGENT skill',
          subCategory: '',
          author: '',
          tags: ['AGENT skill'],
          preview: '',
          refImages: [],
          createdAt: '2026-01-01T00:00:00.000Z',
        },
        {
          id: 'prompt-website-auth',
          title: 'Website Auth',
          prompt: 'website prompt',
          source: 'custom',
          sourceId: 'website-auth',
          category: 'Website Auth & Generation',
          subCategory: '',
          author: '',
          tags: [],
          preview: '',
          refImages: [],
          createdAt: '2026-01-01T00:00:00.000Z',
        },
        {
          id: 'prompt-work',
          title: '工作提示词',
          prompt: '正常工作提示词',
          source: 'custom',
          sourceId: 'work',
          category: '工作',
          subCategory: '',
          author: '',
          tags: ['工作'],
          preview: '',
          refImages: [],
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      tasks: [],
      coverPresets: [],
      settings: {},
    }))

    const store = useAppStore()
    const categories = new Set(store.prompts.flatMap((item) => [item.category, item.subCategory, ...(item.tags ?? [])].filter(Boolean)))

    expect(categories).not.toContain('AGENT skill')
    expect(categories).not.toContain('Website Auth & Generation')
    expect(store.prompts.some((item) => item.title === '工作提示词')).toBe(true)
  })

  it('passes the selected image model configuration to the Electron generation command', async () => {
    const store = useAppStore()
    store.saveModel({
      id: 'remote-image',
      name: 'Remote Image',
      provider: 'openai-compatible',
      endpoint: 'https://api.example.test/v1/images/generations',
      apiKey: 'sk-test',
      model: 'gpt-image-1',
      kind: 'image',
      isPrimary: true,
      status: 'connected',
    })
    mockedInvokeOptional.mockResolvedValueOnce({
      id: 'task-remote',
      mode: 'txt2img',
      prompt: '真实模型生成桥接测试',
      negativePrompt: '',
      modelId: 'remote-image',
      width: 1024,
      height: 1024,
      batchSize: 1,
      steps: 24,
      seed: 42,
      style: '自然',
      modeOptions: {},
      status: 'completed',
      assets: [],
      createdAt: '2026-01-01T00:00:00.000Z',
    })

    await store.generate({
      mode: 'txt2img',
      prompt: '真实模型生成桥接测试',
      negativePrompt: '',
      modelId: 'remote-image',
      width: 1024,
      height: 1024,
      batchSize: 1,
      steps: 24,
      seed: 42,
      style: '自然',
      modeOptions: {},
    })

    expect(mockedInvokeOptional).toHaveBeenCalledWith(
      'create_generation_task',
      expect.objectContaining({
        input: expect.objectContaining({ modelId: 'remote-image' }),
        model: expect.objectContaining({
          id: 'remote-image',
          provider: 'openai-compatible',
          endpoint: 'https://api.example.test',
          apiPath: 'v1/images/generations',
          apiKey: 'sk-test',
          model: 'gpt-image-1',
        }),
      }),
    )
  })

  it('uses the same-origin web generation proxy when desktop bridge is unavailable', async () => {
    mockedIsElectronRuntime.mockReturnValue(false)
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      id: 'task-web-proxy',
      mode: 'txt2img',
      prompt: 'Web 端真实生成',
      negativePrompt: '',
      modelId: 'web-image',
      width: 1024,
      height: 1024,
      batchSize: 1,
      steps: 24,
      seed: 42,
      style: '自然',
      modeOptions: {},
      status: 'completed',
      assets: [{
        id: 'asset-web-proxy',
        taskId: 'task-web-proxy',
        title: 'Web 端真实生成',
        width: 1024,
        height: 1024,
        format: 'png',
        dataUrl: 'data:image/png;base64,web',
        mediaType: 'image',
        createdAt: '2026-01-01T00:00:00.000Z',
      }],
      createdAt: '2026-01-01T00:00:00.000Z',
    }), {
      headers: { 'Content-Type': 'application/json' },
      status: 200,
    }))
    vi.stubGlobal('fetch', fetchMock)
    const store = useAppStore()
    store.saveModel({
      id: 'web-image',
      name: 'Web Image',
      provider: 'openai-compatible',
      endpoint: 'https://api.example.test/v1/images/generations',
      apiKey: 'sk-web',
      model: 'gpt-image-1',
      kind: 'image',
      isPrimary: true,
      status: 'connected',
    })

    const task = await store.generate({
      mode: 'txt2img',
      prompt: 'Web 端真实生成',
      negativePrompt: '',
      modelId: 'web-image',
      width: 1024,
      height: 1024,
      batchSize: 1,
      steps: 24,
      seed: 42,
      style: '自然',
      modeOptions: {},
    })

    expect(task.id).toBe('task-web-proxy')
    expect(mockedInvokeOptional).not.toHaveBeenCalledWith('create_generation_task', expect.anything())
    expect(fetchMock).toHaveBeenCalledWith('/api/generation', expect.objectContaining({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    }))
    const firstFetchCall = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    const body = JSON.parse(String(firstFetchCall[1].body))
    expect(body).toEqual(expect.objectContaining({
      input: expect.objectContaining({ modelId: 'web-image' }),
      model: expect.objectContaining({
        id: 'web-image',
        endpoint: 'https://api.example.test',
        apiPath: 'v1/images/generations',
        apiKey: 'sk-web',
        model: 'gpt-image-1',
      }),
    }))
    expect(store.operationTasks[0]).toEqual(expect.objectContaining({
      id: 'task-web-proxy',
      status: 'completed',
      modelId: 'web-image',
    }))
  })

  it('uses the same-origin web generation proxy for Agnes video models', async () => {
    mockedIsElectronRuntime.mockReturnValue(false)
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      id: 'task-web-video',
      mode: 'txt2video',
      prompt: 'Web 端 Agnes 视频生成',
      negativePrompt: '',
      modelId: 'web-video',
      width: 1024,
      height: 576,
      batchSize: 1,
      steps: 24,
      seed: 42,
      style: '电影',
      modeOptions: { numFrames: 81, frameRate: 24 },
      status: 'completed',
      assets: [{
        id: 'asset-web-video',
        taskId: 'task-web-video',
        title: 'Web 端 Agnes 视频生成',
        width: 1024,
        height: 576,
        format: 'mp4',
        dataUrl: 'https://cdn.example.test/video.mp4',
        remoteUrl: 'https://cdn.example.test/video.mp4',
        mediaType: 'video',
        createdAt: '2026-01-01T00:00:00.000Z',
      }],
      createdAt: '2026-01-01T00:00:00.000Z',
    }), {
      headers: { 'Content-Type': 'application/json' },
      status: 200,
    }))
    vi.stubGlobal('fetch', fetchMock)
    const store = useAppStore()
    store.saveModel({
      id: 'web-video',
      name: 'Web Video',
      provider: 'openai-compatible',
      endpoint: 'https://apihub.agnes-ai.com',
      apiPath: 'v1/videos',
      apiProtocol: 'agnes-video',
      apiKey: 'sk-web-video',
      model: 'agnes-video-v2.0',
      kind: 'video',
      isPrimary: true,
      status: 'connected',
    })

    const task = await store.generate({
      mode: 'txt2video',
      prompt: 'Web 端 Agnes 视频生成',
      negativePrompt: '',
      modelId: 'web-video',
      width: 1024,
      height: 576,
      batchSize: 1,
      steps: 24,
      seed: 42,
      style: '电影',
      modeOptions: { numFrames: 81, frameRate: 24 },
    })

    expect(task.id).toBe('task-web-video')
    expect(task.assets[0]).toEqual(expect.objectContaining({
      format: 'mp4',
      mediaType: 'video',
      remoteUrl: 'https://cdn.example.test/video.mp4',
    }))
    const firstFetchCall = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    const body = JSON.parse(String(firstFetchCall[1].body))
    expect(body.model).toEqual(expect.objectContaining({
      id: 'web-video',
      apiProtocol: 'agnes-video',
      model: 'agnes-video-v2.0',
    }))
    expect(store.operationTasks[0]).toEqual(expect.objectContaining({
      id: 'task-web-video',
      status: 'completed',
      modelId: 'web-video',
    }))
  })

  it('records web generation proxy network causes for diagnostics', async () => {
    mockedIsElectronRuntime.mockReturnValue(false)
    const networkError = new TypeError('fetch failed')
    Object.defineProperty(networkError, 'cause', {
      value: { code: 'ECONNREFUSED', message: 'connect ECONNREFUSED 127.0.0.1:3031' },
    })
    vi.stubGlobal('fetch', vi.fn().mockRejectedValueOnce(networkError))
    const store = useAppStore()
    store.saveModel({
      id: 'web-video-network-fails',
      name: 'Web Video Network Fails',
      provider: 'openai-compatible',
      endpoint: 'https://apihub.agnes-ai.com',
      apiPath: 'v1/videos',
      apiProtocol: 'agnes-video',
      apiKey: 'sk-web-video',
      model: 'agnes-video-v2.0',
      kind: 'video',
      isPrimary: true,
      status: 'connected',
    })

    await expect(store.generate({
      mode: 'txt2video',
      prompt: '网络失败要显示底层原因',
      negativePrompt: '',
      modelId: 'web-video-network-fails',
      width: 1024,
      height: 576,
      batchSize: 1,
      steps: 24,
      seed: 42,
      style: '电影',
      modeOptions: { numFrames: 81, frameRate: 24 },
    })).rejects.toThrow('Web 生成代理不可用: fetch failed（ECONNREFUSED: connect ECONNREFUSED 127.0.0.1:3031）')

    expect(store.operationTasks[0]).toEqual(expect.objectContaining({
      status: 'failed',
      error: 'Web 生成代理不可用: fetch failed（ECONNREFUSED: connect ECONNREFUSED 127.0.0.1:3031）',
      modelId: 'web-video-network-fails',
    }))
    expect(store.operationTasks[0].errorDetails).toEqual(expect.objectContaining({
      apiProtocol: 'agnes-video',
      modelStatus: 'connected',
      apiSecret: null,
    }))
  })

  it('rejects workspace generation when only the local preview model is selected', async () => {
    const store = useAppStore()
    mockedInvokeOptional.mockClear()

    await expect(store.generate({
      mode: 'txt2img',
      prompt: '不要再生成占位图',
      negativePrompt: '',
      modelId: 'local-preview',
      width: 1024,
      height: 1024,
      batchSize: 1,
      steps: 24,
      seed: 42,
      style: '自然',
      modeOptions: {},
    })).rejects.toThrow('请先配置并选择真实图像模型')

    expect(mockedInvokeOptional).not.toHaveBeenCalledWith('create_generation_task', expect.anything())
    expect(store.tasks).toHaveLength(1)
    expect(store.tasks[0]).toEqual(expect.objectContaining({
      status: 'failed',
      error: '请先配置并选择真实图像模型',
      prompt: '不要再生成占位图',
    }))
    expect(store.toast).toEqual(expect.objectContaining({
      message: '请先配置并选择真实图像模型',
      type: 'error',
    }))
  })

  it('records failed remote generation attempts for operation history', async () => {
    const store = useAppStore()
    store.saveModel({
      id: 'remote-image-fails',
      name: 'Remote Image Fails',
      provider: 'openai-compatible',
      endpoint: 'https://api.example.test/v1/images/generations',
      apiKey: 'sk-test',
      model: 'gpt-image-1',
      kind: 'image',
      isPrimary: true,
      status: 'connected',
    })
    mockedInvokeOptional.mockRejectedValueOnce(new Error('HTTP 500 upstream failed'))

    await expect(store.generate({
      mode: 'txt2img',
      prompt: '失败也要进入操作记录',
      negativePrompt: '低清晰度',
      modelId: 'remote-image-fails',
      width: 1024,
      height: 1024,
      batchSize: 1,
      steps: 24,
      seed: 42,
      style: '自然',
      modeOptions: { detailLevel: 72 },
    })).rejects.toThrow('HTTP 500 upstream failed')

    expect(store.operationTasks[0]).toEqual(expect.objectContaining({
      status: 'failed',
      error: 'HTTP 500 upstream failed',
      modelId: 'remote-image-fails',
      prompt: '失败也要进入操作记录',
    }))
    expect(store.operationTasks[0].modeOptions).toEqual({ detailLevel: 72 })
  })

  it('keeps structured Electron generation errors and model call context for diagnostics', async () => {
    const store = useAppStore()
    store.saveModel({
      id: 'remote-image-structured-error',
      name: 'Structured Error Image',
      provider: 'openai-compatible',
      endpoint: 'https://api.example.test',
      apiPath: 'v1/images/generations',
      apiProtocol: 'openai-images',
      apiKey: 'sk-test',
      model: 'gpt-image-1',
      kind: 'image',
      isPrimary: true,
      status: 'connected',
    })
    mockedInvokeOptional.mockImplementation(async (command) => {
      if (command !== 'create_generation_task') return null
      throw {
        kind: 'Validation',
        message: '图像模型响应失败: HTTP 404 {"error":"model not found"}',
      }
    })

    await expect(store.generate({
      mode: 'txt2img',
      prompt: '结构化错误也要保留原因',
      negativePrompt: '',
      modelId: 'remote-image-structured-error',
      width: 1024,
      height: 1024,
      batchSize: 1,
      steps: 24,
      seed: 42,
      style: '自然',
      modeOptions: {},
    })).rejects.toThrow('图像模型响应失败: HTTP 404 {"error":"model not found"}')

    expect(store.operationTasks[0]).toEqual(expect.objectContaining({
      status: 'failed',
      error: '图像模型响应失败: HTTP 404 {"error":"model not found"}',
      errorDetails: expect.objectContaining({
        errorKind: 'Validation',
        modelName: 'Structured Error Image',
        endpoint: 'https://api.example.test',
        apiPath: 'v1/images/generations',
        apiProtocol: 'openai-images',
        model: 'gpt-image-1',
      }),
    }))
  })

  it('requires MGTV image Secret Key before generation', async () => {
    const store = useAppStore()
    store.saveModel({
      id: 'mgtv-image-missing-secret',
      name: 'MGTV Missing Secret',
      provider: 'openai-compatible',
      endpoint: 'https://aigc-llm.mgtv.com',
      apiPath: 'openapi/v1/storyboard/generateByPromptV2',
      apiProtocol: 'mgtv-storyboard',
      apiKey: 'access-test',
      apiSecret: '',
      model: '35',
      kind: 'image',
      isPrimary: true,
      status: 'untested',
    })
    mockedInvokeOptional.mockClear()

    await expect(store.generate({
      mode: 'txt2img',
      prompt: '芒果协议缺少 Secret',
      negativePrompt: '',
      modelId: 'mgtv-image-missing-secret',
      width: 1024,
      height: 1024,
      batchSize: 1,
      steps: 24,
      seed: 42,
      style: '自然',
      modeOptions: {},
    })).rejects.toThrow('请填写 MGTV 图像模型 Secret Key')

    expect(mockedInvokeOptional).not.toHaveBeenCalledWith('create_generation_task', expect.anything())
    expect(store.operationTasks[0]).toEqual(expect.objectContaining({
      status: 'failed',
      error: '请填写 MGTV 图像模型 Secret Key',
      errorDetails: expect.objectContaining({
        apiProtocol: 'mgtv-storyboard',
        apiSecret: null,
      }),
    }))
  })

  it('keeps failed operations out of gallery history counts', async () => {
    const store = useAppStore()
    store.saveModel({
      id: 'remote-image-history-count',
      name: 'History Count Image',
      provider: 'openai-compatible',
      endpoint: 'https://api.example.test',
      apiPath: 'v1/images/generations',
      apiKey: 'sk-test',
      model: 'gpt-image-1',
      kind: 'image',
      isPrimary: true,
      status: 'connected',
    })
    let generationCalls = 0
    mockedInvokeOptional.mockImplementation(async (command) => {
      if (command !== 'create_generation_task') return null
      generationCalls += 1
      if (generationCalls === 2) throw new Error('HTTP 500 upstream failed')
      return {
        id: 'task-success-history-count',
        mode: 'txt2img',
        prompt: '成功图片',
        negativePrompt: '',
        modelId: 'remote-image-history-count',
        width: 1024,
        height: 1024,
        batchSize: 1,
        steps: 24,
        seed: 42,
        style: '自然',
        status: 'completed',
        assets: [{
          id: 'asset-success-history-count',
          taskId: 'task-success-history-count',
          title: '成功图片',
          width: 1024,
          height: 1024,
          format: 'png',
          dataUrl: 'data:image/png;base64,ok',
          createdAt: '2026-05-31T00:00:00.000Z',
        }],
        createdAt: '2026-05-31T00:00:00.000Z',
      }
    })

    await store.generate({
      mode: 'txt2img',
      prompt: '成功图片',
      negativePrompt: '',
      modelId: 'remote-image-history-count',
      width: 1024,
      height: 1024,
      batchSize: 1,
      steps: 24,
      seed: 42,
      style: '自然',
      modeOptions: {},
    })
    await expect(store.generate({
      mode: 'txt2img',
      prompt: '失败图片',
      negativePrompt: '',
      modelId: 'remote-image-history-count',
      width: 1024,
      height: 1024,
      batchSize: 1,
      steps: 24,
      seed: 43,
      style: '自然',
      modeOptions: {},
    })).rejects.toThrow('HTTP 500 upstream failed')

    expect(store.operationTasks).toHaveLength(2)
    expect(store.historyTasks).toHaveLength(1)
    expect(store.historyTasks[0].status).toBe('completed')
    expect(store.historyAssetCount).toBe(1)
  })

  it('removes one generated asset from the asset library and persists the deletion', async () => {
    const store = useAppStore()
    const task = {
      id: 'task-remove-asset',
      mode: 'txt2img' as const,
      prompt: '资产库删除单张图片',
      negativePrompt: '',
      modelId: 'remote-image',
      width: 1024,
      height: 1024,
      batchSize: 2,
      steps: 24,
      seed: 42,
      style: '自然',
      status: 'completed' as const,
      assets: [
        {
          id: 'asset-remove-a',
          taskId: 'task-remove-asset',
          title: '资源 A',
          width: 1024,
          height: 1024,
          format: 'png' as const,
          dataUrl: 'data:image/png;base64,a',
          createdAt: '2026-05-31T00:00:00.000Z',
        },
        {
          id: 'asset-remove-b',
          taskId: 'task-remove-asset',
          title: '资源 B',
          width: 1024,
          height: 1024,
          format: 'png' as const,
          dataUrl: 'data:image/png;base64,b',
          createdAt: '2026-05-31T00:00:01.000Z',
        },
      ],
      createdAt: '2026-05-31T00:00:00.000Z',
    }
    store.recordGenerationTask(task)
    mockedInvokeOptional.mockClear()

    await store.removeGeneratedAsset('task-remove-asset', 'asset-remove-a')

    expect(store.historyAssetCount).toBe(1)
    expect(store.historyTasks[0].assets.map((asset) => asset.id)).toEqual(['asset-remove-b'])
    expect(mockedInvokeOptional).toHaveBeenCalledWith('delete_generation_asset', {
      taskId: 'task-remove-asset',
      assetId: 'asset-remove-a',
    })
    expect(mockedInvokeOptional).toHaveBeenCalledWith(
      'save_app_state',
      expect.objectContaining({
        value: expect.objectContaining({
          tasks: [
            expect.objectContaining({
              id: 'task-remove-asset',
              assets: [expect.objectContaining({ id: 'asset-remove-b' })],
            }),
          ],
        }),
      }),
    )

    await store.removeGeneratedAsset('task-remove-asset', 'asset-remove-b')

    expect(store.historyAssetCount).toBe(0)
    expect(store.tasks.some((item) => item.id === 'task-remove-asset')).toBe(false)
  })

  it('applies the selected preview filter when exporting the adjusted image', async () => {
    const store = useAppStore()
    const filterHistory: string[] = []
    const context = {
      drawImage: vi.fn(),
      fillRect: vi.fn(),
    } as unknown as CanvasRenderingContext2D

    Object.defineProperty(context, 'filter', {
      configurable: true,
      enumerable: true,
      get: () => filterHistory[filterHistory.length - 1] ?? 'none',
      set: (value: string) => {
        filterHistory.push(value)
      },
    })

    const getContextSpy = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context)
    const toDataURLSpy = vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,filtered')
    const originalImage = globalThis.Image

    class MockImage {
      onload: null | (() => void) = null
      onerror: null | ((event?: unknown) => void) = null

      set src(_value: string) {
        queueMicrotask(() => this.onload?.())
      }
    }

    // @ts-expect-error test stub
    globalThis.Image = MockImage
    mockedInvokeOptional.mockResolvedValueOnce({ path: 'D:\\SamImage\\Exports\\filtered.png' })

    try {
      await store.downloadAsset(
        {
          id: 'asset-filtered',
          taskId: 'task-filtered',
          title: '调整后图片',
          width: 1024,
          height: 1024,
          format: 'png',
          dataUrl: 'data:image/png;base64,source',
          createdAt: '2026-05-31T00:00:00.000Z',
        },
        'png',
        1,
        {
          id: 'task-filtered',
          mode: 'txt2img',
          prompt: '滤镜导出测试',
          negativePrompt: '',
          modelId: 'remote-image',
          width: 1024,
          height: 1024,
          batchSize: 1,
          steps: 24,
          seed: 42,
          style: '自然',
          status: 'completed',
          assets: [],
          createdAt: '2026-05-31T00:00:00.000Z',
        },
        { canvasFilter: 'grayscale(1) contrast(1.08)', titleSuffix: '-filtered' },
      )

      expect(filterHistory).toContain('grayscale(1) contrast(1.08)')
      expect(filterHistory.at(-1)).toBe('none')
      expect(context.drawImage).toHaveBeenCalled()
      expect(mockedInvokeOptional).toHaveBeenCalledWith(
        'export_generated_asset',
        expect.objectContaining({
          request: expect.objectContaining({
            title: '调整后图片-filtered',
            dataUrl: 'data:image/png;base64,filtered',
          }),
        }),
      )
    } finally {
      getContextSpy.mockRestore()
      toDataURLSpy.mockRestore()
      globalThis.Image = originalImage
    }
  })

  it('exports legacy png assets from gif tasks as real gif data', async () => {
    const store = useAppStore()
    mockedInvokeOptional.mockResolvedValueOnce({ path: 'D:\\SamImage\\Exports\\legacy.gif' })

    await store.downloadAsset(
      {
        id: 'asset-legacy-gif',
        taskId: 'task-legacy-gif',
        title: '旧版 GIF 资源',
        width: 512,
        height: 512,
        format: 'png',
        dataUrl: 'data:image/png;base64,source',
        createdAt: '2026-05-31T00:00:00.000Z',
      },
      'gif',
      1,
      {
        id: 'task-legacy-gif',
        mode: 'gif',
        prompt: '旧版 GIF 导出回归测试',
        negativePrompt: '',
        modelId: 'remote-image',
        width: 512,
        height: 512,
        batchSize: 1,
        steps: 24,
        seed: 42,
        style: '自然',
        status: 'completed',
        assets: [],
        createdAt: '2026-05-31T00:00:00.000Z',
      },
    )

    expect(mockedInvokeOptional).toHaveBeenCalledWith(
      'export_generated_asset',
      expect.objectContaining({
        request: expect.objectContaining({
          format: 'gif',
          dataUrl: expect.stringMatching(/^data:image\/gif;base64,/),
        }),
      }),
    )
  })

  it('does not write large generated image data URLs into browser local storage', () => {
    const store = useAppStore()
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    setItem.mockImplementation((key: string, value: string) => {
      if (key === 'samimage.v3.state' && value.includes('large-image-payload')) {
        throw new DOMException(
          "Failed to execute 'setItem' on 'Storage': Setting the value of 'samimage.v3.state' exceeded the quota.",
          'QuotaExceededError',
        )
      }
    })

    expect(() => store.recordGenerationTask({
      id: 'task-large-local-storage',
      mode: 'txt2img',
      prompt: '大图不应写入 localStorage',
      negativePrompt: '',
      modelId: 'remote-image',
      width: 2048,
      height: 2048,
      batchSize: 1,
      steps: 24,
      seed: 42,
      style: '自然',
      status: 'completed',
      assets: [{
        id: 'asset-large-local-storage',
        taskId: 'task-large-local-storage',
        title: '大图资源',
        width: 2048,
        height: 2048,
        format: 'png',
        dataUrl: `data:image/png;base64,${'large-image-payload'.repeat(512)}`,
        createdAt: '2026-05-31T00:00:00.000Z',
      }],
      createdAt: '2026-05-31T00:00:00.000Z',
    })).not.toThrow()

    const browserState = JSON.parse(localStorage.getItem('samimage.v3.state') ?? '{}')
    expect(browserState.tasks[0].assets[0].dataUrl).toBe('')
    expect(mockedInvokeOptional).toHaveBeenCalledWith(
      'save_app_state',
      expect.objectContaining({
        value: expect.objectContaining({
          tasks: [
            expect.objectContaining({
              assets: [expect.objectContaining({
                dataUrl: expect.stringContaining('large-image-payload'),
              })],
            }),
          ],
        }),
      }),
    )

    setItem.mockRestore()
  })

  it('replaces legacy oversized browser state when compact persistence first hits quota', () => {
    const legacyState = {
      models: [],
      prompts: [],
      tasks: [{
        id: 'legacy-large-task',
        mode: 'txt2img',
        prompt: '旧版大图状态',
        negativePrompt: '',
        modelId: 'remote-image',
        width: 2048,
        height: 2048,
        batchSize: 1,
        steps: 24,
        seed: 42,
        style: '自然',
        status: 'completed',
        assets: [{
          id: 'legacy-large-asset',
          taskId: 'legacy-large-task',
          title: '旧版大图',
          width: 2048,
          height: 2048,
          format: 'png',
          dataUrl: `data:image/png;base64,${'legacy-large-payload'.repeat(512)}`,
          createdAt: '2026-05-31T00:00:00.000Z',
        }],
        createdAt: '2026-05-31T00:00:00.000Z',
      }],
      coverPresets: [],
      settings: {
        defaultOutputDir: 'D:\\SamImage\\Exports',
        defaultExportFormat: 'png',
        defaultImageModelId: '',
        defaultGenerationSize: 1024,
        defaultBatchSize: 1,
        defaultStyle: '自然',
        autoSaveHistory: true,
        includePromptMetadata: true,
        theme: 'dark',
      },
    }
    localStorage.setItem('samimage.v3.state', JSON.stringify(legacyState))
    const store = useAppStore()
    let failedOnce = false
    const originalSetItem = localStorage.setItem.bind(localStorage)
    const setItem = vi.spyOn(localStorage, 'setItem')
    setItem.mockImplementation(function (this: Storage, key: string, value: string) {
      if (key === 'samimage.v3.state' && !failedOnce) {
        failedOnce = true
        throw new DOMException(
          "Failed to execute 'setItem' on 'Storage': Setting the value of 'samimage.v3.state' exceeded the quota.",
          'QuotaExceededError',
        )
      }
      return originalSetItem(key, value)
    })

    expect(() => store.recordGenerationTask({
      id: 'task-after-legacy-quota',
      mode: 'txt2img',
      prompt: '旧状态瘦身后保存',
      negativePrompt: '',
      modelId: 'remote-image',
      width: 1024,
      height: 1024,
      batchSize: 1,
      steps: 24,
      seed: 43,
      style: '自然',
      status: 'completed',
      assets: [{
        id: 'asset-after-legacy-quota',
        taskId: 'task-after-legacy-quota',
        title: '新图',
        width: 1024,
        height: 1024,
        format: 'png',
        dataUrl: 'data:image/png;base64,new-image',
        createdAt: '2026-05-31T00:00:01.000Z',
      }],
      createdAt: '2026-05-31T00:00:01.000Z',
    })).not.toThrow()

    const browserState = localStorage.getItem('samimage.v3.state') ?? ''
    expect(browserState).not.toContain('legacy-large-payload')
    expect(JSON.parse(browserState).tasks.every((task: { assets: Array<{ dataUrl: string }> }) => (
      task.assets.every((asset) => asset.dataUrl === '')
    ))).toBe(true)

    setItem.mockRestore()
  })

  it('uses the real image model command even when history auto-save is disabled', async () => {
    const store = useAppStore()
    store.saveModel({
      id: 'remote-image-no-history',
      name: 'Remote Image No History',
      provider: 'openai-compatible',
      endpoint: 'https://api.example.test/v1/images/generations',
      apiKey: 'sk-test',
      model: 'gpt-image-1',
      kind: 'image',
      isPrimary: true,
      status: 'connected',
    })
    store.saveSettings({ autoSaveHistory: false })
    mockedInvokeOptional.mockClear()
    mockedInvokeOptional.mockResolvedValueOnce({
      id: 'task-remote-no-history',
      mode: 'txt2img',
      prompt: '真实模型生成但不写入前端资产库',
      negativePrompt: '',
      modelId: 'remote-image-no-history',
      width: 1024,
      height: 1024,
      batchSize: 1,
      steps: 24,
      seed: 42,
      style: '自然',
      modeOptions: {},
      status: 'completed',
      assets: [],
      createdAt: '2026-01-01T00:00:00.000Z',
    })

    await store.generate({
      mode: 'txt2img',
      prompt: '真实模型生成但不写入前端资产库',
      negativePrompt: '',
      modelId: 'remote-image-no-history',
      width: 1024,
      height: 1024,
      batchSize: 1,
      steps: 24,
      seed: 42,
      style: '自然',
      modeOptions: {},
    })

    expect(mockedInvokeOptional).toHaveBeenCalledWith(
      'create_generation_task',
      expect.objectContaining({
        input: expect.objectContaining({ modelId: 'remote-image-no-history' }),
        model: expect.objectContaining({ id: 'remote-image-no-history' }),
      }),
    )
    expect(store.tasks).toHaveLength(0)
    expect(store.toast).toEqual(expect.objectContaining({
      message: '已生成 0 个文生图结果，未保存到资产库',
      type: 'info',
    }))
  })

  it('passes the selected text model configuration to the Electron polish command', async () => {
    const store = useAppStore()
    store.saveModel({
      id: 'remote-text',
      name: 'Remote Text',
      provider: 'openai-compatible',
      endpoint: 'https://api.example.test/v1/chat/completions',
      apiKey: 'sk-text',
      model: 'gpt-4o-mini',
      kind: 'text',
      isPrimary: true,
      status: 'connected',
    })
    mockedInvokeOptional.mockResolvedValueOnce({
      prompt: '精修后的提示词',
      modelName: 'Remote Text',
    })

    const result = await store.polishPrompt(
      {
        prompt: '产品海报',
        modeLabel: '文生图',
        style: '自然',
      },
      'remote-text',
    )

    expect(result.prompt).toBe('精修后的提示词')
    expect(mockedInvokeOptional).toHaveBeenCalledWith(
      'polish_prompt',
      expect.objectContaining({
        input: {
          prompt: '产品海报',
          modeLabel: '文生图',
          style: '自然',
        },
        model: expect.objectContaining({
          id: 'remote-text',
          provider: 'openai-compatible',
          endpoint: 'https://api.example.test',
          apiPath: 'v1/chat/completions',
          apiKey: 'sk-text',
          model: 'gpt-4o-mini',
        }),
      }),
    )
  })

  it('auto-routes prompt polishing across configured text models', async () => {
    const store = useAppStore()
    store.saveModel({
      id: 'route-text-a',
      name: 'Route Text A',
      provider: 'openai-compatible',
      endpoint: 'https://text-a.example.test/v1/chat/completions',
      apiKey: 'sk-text-a',
      model: 'gpt-4o-mini',
      kind: 'text',
      isPrimary: true,
      status: 'connected',
    })
    store.saveModel({
      id: 'route-text-b',
      name: 'Route Text B',
      provider: 'openai-compatible',
      endpoint: 'https://text-b.example.test/v1/chat/completions',
      apiKey: 'sk-text-b',
      model: 'claude-3-5-haiku',
      kind: 'text',
      isPrimary: false,
      status: 'connected',
    })
    mockedInvokeOptional.mockClear()
    mockedInvokeOptional.mockImplementation(async (command, args) => {
      if (command !== 'polish_prompt') return null
      const payload = args as { model?: { id?: string } } | undefined
      if (payload?.model?.id === 'route-text-a') throw new Error('text upstream A failed')
      return {
        prompt: '文本模型 B 润色结果',
        modelName: 'Route Text B',
      }
    })

    const result = await store.polishPrompt({
      prompt: '产品海报',
      modeLabel: '文生图',
      style: '自然',
      task: 'polish',
    })

    expect(result.prompt).toBe('文本模型 B 润色结果')
    expect(store.textAutoRouteProfiles.map((model) => model.id)).toEqual(['route-text-a', 'route-text-b'])
    expect(mockedInvokeOptional).toHaveBeenNthCalledWith(
      1,
      'polish_prompt',
      expect.objectContaining({ model: expect.objectContaining({ id: 'route-text-a' }) }),
    )
    expect(mockedInvokeOptional).toHaveBeenNthCalledWith(
      2,
      'polish_prompt',
      expect.objectContaining({ model: expect.objectContaining({ id: 'route-text-b' }) }),
    )
  })

  it('uses the same text auto route for negative prompt polishing', async () => {
    const store = useAppStore()
    store.saveModel({
      id: 'negative-text-a',
      name: 'Negative Text A',
      provider: 'openai-compatible',
      endpoint: 'https://negative-a.example.test/v1/chat/completions',
      apiKey: 'sk-negative-a',
      model: 'gpt-4o-mini',
      kind: 'text',
      isPrimary: true,
      status: 'failed',
    })
    store.saveModel({
      id: 'negative-text-b',
      name: 'Negative Text B',
      provider: 'openai-compatible',
      endpoint: 'https://negative-b.example.test/v1/chat/completions',
      apiKey: 'sk-negative-b',
      model: 'gpt-4o-mini',
      kind: 'text',
      isPrimary: false,
      status: 'connected',
    })
    mockedInvokeOptional.mockClear()
    mockedInvokeOptional.mockImplementation(async (command, args) => {
      if (command !== 'polish_prompt') return null
      const payload = args as { model?: { id?: string } } | undefined
      if (payload?.model?.id === 'negative-text-a') throw new Error('negative text upstream failed')
      return {
        prompt: '低清晰度、文字水印、结构变形',
        modelName: 'Negative Text B',
      }
    })

    const result = await store.polishPrompt({
      prompt: '文字水印',
      modeLabel: '文生图反向提示词',
      style: '反向约束',
      task: 'negative-prompt',
    })

    expect(result.modelName).toBe('Negative Text B')
    expect(result.prompt).toContain('结构变形')
    expect(mockedInvokeOptional).toHaveBeenCalledTimes(2)
    expect(mockedInvokeOptional).toHaveBeenNthCalledWith(
      2,
      'polish_prompt',
      expect.objectContaining({
        input: expect.objectContaining({ task: 'negative-prompt' }),
        model: expect.objectContaining({ id: 'negative-text-b' }),
      }),
    )
  })

  it('polishes negative prompts in the browser fallback path', async () => {
    mockedIsElectronRuntime.mockReturnValue(false)
    const store = useAppStore()

    const result = await store.polishPrompt(
      {
        prompt: '模糊、文字水印',
        modeLabel: '文生图反向提示词',
        style: '反向约束',
        task: 'negative-prompt',
      },
    )

    expect(result.prompt.split('、')).toEqual(expect.arrayContaining([
      '模糊',
      '文字水印',
      '结构变形',
      '多余肢体',
      '噪点',
      '过曝',
      '构图混乱',
    ]))
    expect(result.prompt.match(/文字水印/g)).toHaveLength(1)
    expect(mockedInvokeOptional).not.toHaveBeenCalledWith('polish_prompt', expect.anything())
  })

  it('persists model configuration to the Electron app state store', async () => {
    const store = useAppStore()

    store.saveModel({
      id: 'persisted-image',
      name: 'Persisted Image',
      provider: 'openai-compatible',
      endpoint: 'https://api.example.test/v1/images/generations',
      apiKey: 'sk-persisted',
      model: 'gpt-image-1',
      kind: 'image',
      isPrimary: true,
      status: 'connected',
    })

    expect(mockedInvokeOptional).toHaveBeenCalledWith(
      'save_app_state',
      expect.objectContaining({
        value: expect.objectContaining({
          models: expect.arrayContaining([
            expect.objectContaining({
              id: 'persisted-image',
              apiKey: 'sk-persisted',
            }),
          ]),
        }),
      }),
    )
  })

  it('keeps every saved upstream for the same model in one auto-route group', () => {
    const store = useAppStore()

    store.saveModel({
      id: 'route-image-a',
      name: 'Route Image A',
      provider: 'openai-compatible',
      endpoint: 'https://api-a.example.test/v1/images/generations',
      apiKey: 'sk-a',
      model: 'gpt-image-2',
      kind: 'image',
      isPrimary: true,
      status: 'connected',
    })
    store.saveModel({
      id: 'route-image-b',
      name: 'Route Image B',
      provider: 'openai-compatible',
      endpoint: 'https://api-b.example.test/v1/images/generations',
      apiKey: 'sk-b',
      model: 'gpt-image-2',
      kind: 'image',
      isPrimary: false,
      status: 'untested',
    })

    const routeGroup = store.modelRouteGroups.find((group) => group.kind === 'image' && group.model === 'gpt-image-2')

    expect(routeGroup?.profiles).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'route-image-a', endpoint: 'https://api-a.example.test' }),
      expect.objectContaining({ id: 'route-image-b', endpoint: 'https://api-b.example.test' }),
    ]))
    expect(routeGroup?.profiles.some((profile) => profile.id === 'openai-gpt-image-2')).toBe(false)
  })

  it('saves fetched catalog models in one batch and routes them by model kind', () => {
    const store = useAppStore()

    store.saveModels([
      {
        id: 'batch-text',
        name: 'Batch Provider',
        provider: 'openai-compatible',
        endpoint: 'https://batch.example.test',
        apiPath: 'v1/chat/completions',
        apiProtocol: 'openai-chat',
        apiKey: 'sk-batch',
        model: 'agnes-2.0-flash',
        kind: 'text',
        isPrimary: false,
        status: 'connected',
      },
      {
        id: 'batch-image',
        name: 'Batch Provider',
        provider: 'openai-compatible',
        endpoint: 'https://batch.example.test',
        apiPath: 'v1/images/generations',
        apiProtocol: 'agnes-image',
        apiKey: 'sk-batch',
        model: 'agnes-image-2.1-flash',
        kind: 'image',
        isPrimary: false,
        status: 'connected',
      },
      {
        id: 'batch-video',
        name: 'Batch Provider',
        provider: 'openai-compatible',
        endpoint: 'https://batch.example.test',
        apiPath: 'v1/videos',
        apiProtocol: 'agnes-video',
        apiKey: 'sk-batch',
        model: 'agnes-video-v2.0',
        kind: 'video',
        isPrimary: false,
        status: 'connected',
      },
    ], '已导入 3 个模型，并按类型自动路由')

    expect(store.modelRouteGroups).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'text', model: 'agnes-2.0-flash' }),
      expect.objectContaining({ kind: 'image', model: 'agnes-image-2.1-flash' }),
      expect.objectContaining({ kind: 'video', model: 'agnes-video-v2.0' }),
    ]))
    expect(store.toast).toEqual(expect.objectContaining({
      message: '已导入 3 个模型，并按类型自动路由',
      type: 'success',
    }))
  })

  it('replaces endpoint models with the currently checked catalog models', () => {
    const store = useAppStore()

    store.saveModels([
      {
        id: 'endpoint-text',
        name: 'Agnes',
        provider: 'openai-compatible',
        endpoint: 'https://apihub.agnes-ai.com',
        apiPath: 'v1/chat/completions',
        apiProtocol: 'openai-chat',
        apiKey: 'sk-agnes',
        model: 'agnes-2.0-flash',
        kind: 'text',
        isPrimary: false,
        status: 'connected',
      },
      {
        id: 'endpoint-image',
        name: 'Agnes',
        provider: 'openai-compatible',
        endpoint: 'https://apihub.agnes-ai.com',
        apiPath: 'v1/images/generations',
        apiProtocol: 'agnes-image',
        apiKey: 'sk-agnes',
        model: 'agnes-image-2.1-flash',
        kind: 'image',
        isPrimary: false,
        status: 'connected',
      },
    ])

    store.replaceModelsForEndpoint('https://apihub.agnes-ai.com', [
      {
        id: 'endpoint-image',
        name: 'Agnes',
        provider: 'openai-compatible',
        endpoint: 'https://apihub.agnes-ai.com',
        apiPath: 'v1/images/generations',
        apiProtocol: 'agnes-image',
        apiKey: 'sk-agnes',
        model: 'agnes-image-2.1-flash',
        kind: 'image',
        isPrimary: false,
        status: 'connected',
      },
    ], '已同步 1 个模型到模型管理')

    expect(store.models.map((model) => model.model)).toEqual(['agnes-image-2.1-flash'])
    expect(store.toast).toEqual(expect.objectContaining({
      message: '已同步 1 个模型到模型管理',
      type: 'success',
    }))
  })

  it('automatically falls back to another upstream with the same model id during generation', async () => {
    const store = useAppStore()

    store.saveModel({
      id: 'route-image-a',
      name: 'Route Image A',
      provider: 'openai-compatible',
      endpoint: 'https://api-a.example.test',
      apiPath: 'v1/images/generations',
      apiProtocol: 'openai-images',
      apiKey: 'sk-a',
      model: 'gpt-image-2',
      kind: 'image',
      isPrimary: true,
      status: 'connected',
    })
    store.saveModel({
      id: 'route-image-b',
      name: 'Route Image B',
      provider: 'openai-compatible',
      endpoint: 'https://api-b.example.test',
      apiPath: 'v1/images/generations',
      apiProtocol: 'openai-images',
      apiKey: 'sk-b',
      model: 'gpt-image-2',
      kind: 'image',
      isPrimary: false,
      status: 'connected',
    })
    mockedInvokeOptional.mockClear()
    mockedInvokeOptional.mockImplementation(async (command, args) => {
      if (command !== 'create_generation_task') return null
      const payload = args as { model?: { id?: string } } | undefined
      if (payload?.model?.id === 'route-image-a') throw new Error('HTTP 500 upstream A failed')
      return {
        id: 'task-route-b',
        mode: 'txt2img',
        prompt: '自动路由回退',
        negativePrompt: '',
        modelId: 'route-image-b',
        width: 1024,
        height: 1024,
        batchSize: 1,
        steps: 24,
        seed: 42,
        style: '自然',
        modeOptions: {},
        status: 'completed',
        assets: [],
        createdAt: '2026-01-01T00:00:00.000Z',
      }
    })

    const task = await store.generate({
      mode: 'txt2img',
      prompt: '自动路由回退',
      negativePrompt: '',
      modelId: 'route-image-a',
      width: 1024,
      height: 1024,
      batchSize: 1,
      steps: 24,
      seed: 42,
      style: '自然',
      modeOptions: {},
    })

    expect(task.id).toBe('task-route-b')
    expect(mockedInvokeOptional).toHaveBeenNthCalledWith(
      1,
      'create_generation_task',
      expect.objectContaining({ model: expect.objectContaining({ id: 'route-image-a' }) }),
    )
    expect(mockedInvokeOptional).toHaveBeenNthCalledWith(
      2,
      'create_generation_task',
      expect.objectContaining({
        input: expect.objectContaining({ modelId: 'route-image-b' }),
        model: expect.objectContaining({ id: 'route-image-b' }),
      }),
    )
    expect(store.operationTasks[0]).toEqual(expect.objectContaining({
      id: 'task-route-b',
      status: 'completed',
      modelId: 'route-image-b',
    }))
  })

  it('uses automatic route fallback through the web generation proxy', async () => {
    mockedIsElectronRuntime.mockReturnValue(false)
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: 'HTTP 500 upstream A failed' }), {
        headers: { 'Content-Type': 'application/json' },
        status: 502,
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        id: 'task-web-route-b',
        mode: 'txt2img',
        prompt: 'Web 自动路由回退',
        negativePrompt: '',
        modelId: 'web-route-b',
        width: 1024,
        height: 1024,
        batchSize: 1,
        steps: 24,
        seed: 42,
        style: '自然',
        modeOptions: {},
        status: 'completed',
        assets: [],
        createdAt: '2026-01-01T00:00:00.000Z',
      }), {
        headers: { 'Content-Type': 'application/json' },
        status: 200,
      }))
    vi.stubGlobal('fetch', fetchMock)
    const store = useAppStore()
    store.saveModel({
      id: 'web-route-a',
      name: 'Web Route A',
      provider: 'openai-compatible',
      endpoint: 'https://api-a.example.test',
      apiPath: 'v1/images/generations',
      apiProtocol: 'openai-images',
      apiKey: 'sk-a',
      model: 'gpt-image-2',
      kind: 'image',
      isPrimary: true,
      status: 'connected',
    })
    store.saveModel({
      id: 'web-route-b',
      name: 'Web Route B',
      provider: 'openai-compatible',
      endpoint: 'https://api-b.example.test',
      apiPath: 'v1/images/generations',
      apiProtocol: 'openai-images',
      apiKey: 'sk-b',
      model: 'gpt-image-2',
      kind: 'image',
      isPrimary: false,
      status: 'connected',
    })

    const task = await store.generate({
      mode: 'txt2img',
      prompt: 'Web 自动路由回退',
      negativePrompt: '',
      modelId: 'web-route-a',
      width: 1024,
      height: 1024,
      batchSize: 1,
      steps: 24,
      seed: 42,
      style: '自然',
      modeOptions: {},
    })

    expect(task.id).toBe('task-web-route-b')
    expect(fetchMock).toHaveBeenCalledTimes(2)
    const firstFetchCall = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    const secondFetchCall = fetchMock.mock.calls[1] as unknown as [string, RequestInit]
    expect(JSON.parse(String(firstFetchCall[1].body)).model.id).toBe('web-route-a')
    expect(JSON.parse(String(secondFetchCall[1].body)).model.id).toBe('web-route-b')
    expect(store.operationTasks[0]).toEqual(expect.objectContaining({
      id: 'task-web-route-b',
      status: 'completed',
      modelId: 'web-route-b',
    }))
  })

  it('loads full app state from Electron before merging persisted tasks', async () => {
    mockedInvokeOptional.mockImplementation(async (command) => {
      if (command === 'load_app_state') {
        return {
          models: [
            {
              id: 'sqlite-image',
              name: 'SQLite Image',
              provider: 'openai-compatible',
              endpoint: 'https://api.example.test/v1/images/generations',
              apiKey: 'sk-sqlite',
              model: 'gpt-image-1',
              kind: 'image',
              isPrimary: true,
              status: 'connected',
            },
          ],
          prompts: [],
          tasks: [],
          coverPresets: [],
          settings: {
            defaultOutputDir: 'D:\\SamImage\\Exports',
            defaultExportFormat: 'png',
            defaultImageModelId: 'sqlite-image',
            defaultGenerationSize: 1024,
            defaultBatchSize: 1,
            defaultStyle: '自然',
            autoSaveHistory: true,
            includePromptMetadata: true,
            theme: 'dark',
          },
        }
      }
      if (command === 'list_generation_tasks') return []
      return null
    })
    const store = useAppStore()

    await store.loadPersistedTasks()

    expect(store.models[0]).toEqual(expect.objectContaining({
      id: 'sqlite-image',
      apiKey: 'sk-sqlite',
    }))
    expect(store.settings.defaultExportFormat).toBe('png')
    expect(JSON.parse(localStorage.getItem('samimage.v3.state') ?? '{}').models[0].id).toBe('sqlite-image')
  })

  it('reports invalid cover preset dimensions without adding a preset', () => {
    const store = useAppStore()
    const beforeCount = store.coverPresets.length

    const saved = store.addCoverPreset({
      name: 'Invalid preset',
      width: 80,
      height: 608,
      enabled: true,
    })

    expect(saved).toBe(false)
    expect(store.coverPresets).toHaveLength(beforeCount)
    expect(store.toast).toEqual(expect.objectContaining({
      message: '请输入 128 到 4096 之间的有效尺寸',
      type: 'error',
    }))
  })

  it('removes imported prompts while keeping builtin prompts intact', () => {
    const store = useAppStore()
    const importedCount = store.importPromptBatch([
      {
        filename: 'custom-prompts.json',
        content: JSON.stringify([
          { title: '可删除提示词', prompt: '这是一条可删除的导入提示词', category: '测试' },
        ]),
      },
    ])

    expect(importedCount).toBe(1)
    const importedPrompt = store.prompts.find((item) => item.title === '可删除提示词')
    expect(importedPrompt).toBeTruthy()

    store.removePrompt(importedPrompt!.id)
    expect(store.prompts.some((item) => item.id === importedPrompt!.id)).toBe(false)

    const builtinPrompt = store.prompts.find((item) => item.source === 'builtin')
    expect(builtinPrompt).toBeTruthy()
    store.removePrompt(builtinPrompt!.id)
    expect(store.prompts.some((item) => item.id === builtinPrompt!.id)).toBe(true)
    expect(store.toast).toEqual(expect.objectContaining({
      message: '内置提示词不能删除',
      type: 'error',
    }))
  })

  it('detects remote models through catalog lookup when connection testing runs in browser preview', async () => {
    mockedIsElectronRuntime.mockReturnValue(false)
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      data: [
        { id: 'gpt-4o-mini' },
      ],
    }), {
      headers: { 'Content-Type': 'application/json' },
      status: 200,
    }))
    vi.stubGlobal('fetch', fetchMock)
    const store = useAppStore()
    store.saveModel({
      id: 'browser-preview-text',
      name: 'Browser Preview Text',
      provider: 'openai-compatible',
      endpoint: 'https://api.example.test/v1/chat/completions',
      apiKey: 'sk-text',
      model: 'gpt-4o-mini',
      kind: 'text',
      isPrimary: true,
      status: 'untested',
    })

    await store.testModel('browser-preview-text')

    expect(store.models.find((model) => model.id === 'browser-preview-text')?.status).toBe('connected')
    expect(mockedInvokeOptional).not.toHaveBeenCalledWith('test_model_profile', expect.anything())
    expect(store.toast).toEqual(expect.objectContaining({
      message: '模型列表接口可用，已获取 1 个模型',
      type: 'success',
    }))
    expect(fetchMock).toHaveBeenCalledWith('/api/model-catalog', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        endpoint: 'https://api.example.test',
        apiKey: 'sk-text',
      }),
    })
  })

  it('validates text model configuration before running connection test', async () => {
    const store = useAppStore()
    store.saveModel({
      id: 'missing-text-model-id',
      name: 'Missing Text Model ID',
      provider: 'openai-compatible',
      endpoint: 'https://api.example.test/v1/chat/completions',
      apiKey: 'sk-text',
      model: '',
      kind: 'text',
      isPrimary: true,
      status: 'untested',
    })
    mockedInvokeOptional.mockClear()

    await store.testModel('missing-text-model-id')

    expect(mockedInvokeOptional).not.toHaveBeenCalledWith('test_model_profile', expect.anything())
    expect(store.models.find((model) => model.id === 'missing-text-model-id')?.status).toBe('failed')
    expect(store.toast).toEqual(expect.objectContaining({
      message: '请填写文本模型 ID',
      type: 'error',
    }))
  })

  it('validates image model configuration before running connection test', async () => {
    const store = useAppStore()
    store.saveModel({
      id: 'missing-image-model-id',
      name: 'Missing Image Model ID',
      provider: 'openai-compatible',
      endpoint: 'https://api.example.test',
      apiPath: 'v1/images/generations',
      apiProtocol: 'openai-images',
      apiKey: 'sk-image',
      model: '',
      kind: 'image',
      isPrimary: true,
      status: 'untested',
    })
    mockedInvokeOptional.mockClear()

    await store.testModel('missing-image-model-id')

    expect(mockedInvokeOptional).not.toHaveBeenCalledWith('test_model_profile', expect.anything())
    expect(store.models.find((model) => model.id === 'missing-image-model-id')?.status).toBe('failed')
    expect(store.toast).toEqual(expect.objectContaining({
      message: '请填写图像模型 ID',
      type: 'error',
    }))
  })

  it('fetches model catalog through Electron when running in desktop runtime', async () => {
    const store = useAppStore()
    const profile = {
      id: 'remote-text',
      name: 'Remote Text',
      provider: 'openai-compatible' as const,
      endpoint: 'https://api.example.test/v1/chat/completions',
      apiKey: 'sk-text',
      model: '',
      kind: 'text' as const,
      isPrimary: false,
      status: 'untested' as const,
    }
    mockedInvokeOptional.mockResolvedValueOnce([
      {
        id: 'gpt-4o-mini',
        name: 'gpt-4o-mini',
        kind: 'text',
        source: 'remote',
      },
    ])

    const models = await store.fetchModelCatalog(profile)

    expect(models).toEqual([
      expect.objectContaining({
        id: 'gpt-4o-mini',
        kind: 'text',
      }),
    ])
    expect(mockedInvokeOptional).toHaveBeenCalledWith('list_model_catalog', { profile })
  })

  it('fetches model catalog through same-origin proxy when desktop bridge is unavailable', async () => {
    mockedIsElectronRuntime.mockReturnValue(false)
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      data: [
        { id: 'agnes-2.0-flash' },
        { id: 'gpt-image-1' },
        { id: 'gpt-4o-mini' },
        { id: 'tts-1' },
        { id: 'custom-model-v1' },
      ],
    }), {
      headers: { 'Content-Type': 'application/json' },
      status: 200,
    }))
    vi.stubGlobal('fetch', fetchMock)

    const store = useAppStore()
    const profile = {
      id: 'browser-route',
      name: 'Browser Route',
      provider: 'openai-compatible' as const,
      endpoint: 'https://api.example.test/relay/v1/chat/completions',
      apiKey: 'sk-text',
      model: '',
      kind: 'text' as const,
      isPrimary: false,
      status: 'untested' as const,
    }

    const models = await store.fetchModelCatalog(profile)

    expect(models).toEqual([
      expect.objectContaining({ id: 'agnes-2.0-flash', kind: 'text' }),
      expect.objectContaining({ id: 'custom-model-v1', kind: 'unknown' }),
      expect.objectContaining({ id: 'gpt-4o-mini', kind: 'text' }),
      expect.objectContaining({ id: 'gpt-image-1', kind: 'image' }),
      expect.objectContaining({ id: 'tts-1', kind: 'tts' }),
    ])
    expect(mockedInvokeOptional).not.toHaveBeenCalledWith('list_model_catalog', expect.anything())
    expect(fetchMock).toHaveBeenCalledWith('/api/model-catalog', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        endpoint: 'https://api.example.test/relay/v1/chat/completions',
        apiKey: 'sk-text',
      }),
    })
  })

  it('falls back to direct model catalog request when same-origin proxy is unavailable', async () => {
    mockedIsElectronRuntime.mockReturnValue(false)
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('', { status: 404 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: [
          { id: 'gpt-4o-mini' },
        ],
      }), {
        headers: { 'Content-Type': 'application/json' },
        status: 200,
      }))
    vi.stubGlobal('fetch', fetchMock)

    const store = useAppStore()
    const profile = {
      id: 'browser-direct-route',
      name: 'Browser Direct Route',
      provider: 'openai-compatible' as const,
      endpoint: 'https://api.example.test/v1/chat/completions',
      apiKey: 'sk-text',
      model: '',
      kind: 'text' as const,
      isPrimary: false,
      status: 'untested' as const,
    }

    const models = await store.fetchModelCatalog(profile)

    expect(models).toEqual([
      expect.objectContaining({ id: 'gpt-4o-mini', kind: 'text' }),
    ])
    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/model-catalog', expect.objectContaining({
      method: 'POST',
    }))
    expect(fetchMock).toHaveBeenNthCalledWith(2, 'https://api.example.test/v1/models', {
      headers: {
        Authorization: 'Bearer sk-text',
      },
    })
  })

  it('detects model connections through browser model catalog fallback', async () => {
    mockedIsElectronRuntime.mockReturnValue(false)
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      data: [
        { id: 'gpt-image-2' },
      ],
    }), {
      headers: { 'Content-Type': 'application/json' },
      status: 200,
    }))
    vi.stubGlobal('fetch', fetchMock)

    const store = useAppStore()
    store.saveModel({
      id: 'browser-detect-image',
      name: 'Browser Detect Image',
      provider: 'openai-compatible',
      endpoint: 'https://api.example.test/v1/images/generations',
      apiKey: 'sk-image',
      model: 'gpt-image-2',
      kind: 'image',
      isPrimary: false,
      status: 'untested',
    })

    await store.testModel('browser-detect-image')

    expect(store.models.find((model) => model.id === 'browser-detect-image')).toEqual(expect.objectContaining({
      status: 'connected',
      lastCheckedAt: expect.any(String),
    }))
    expect(store.toast).toEqual(expect.objectContaining({
      message: '模型列表接口可用，已获取 1 个模型',
      type: 'success',
    }))
    expect(fetchMock).toHaveBeenCalledWith('/api/model-catalog', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        endpoint: 'https://api.example.test',
        apiKey: 'sk-image',
      }),
    })
  })
})
