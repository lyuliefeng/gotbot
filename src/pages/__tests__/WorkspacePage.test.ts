import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const workspacePagePath = resolve('src/pages/WorkspacePage.vue')

describe('WorkspacePage generation feedback', () => {
  it('does not show previous history assets after a generation failure', () => {
    const source = readFileSync(workspacePagePath, 'utf8')

    expect(source).toContain("const currentAssets = computed(() => currentTask.value?.assets ?? [])")
    expect(source).toContain('const actionTask = computed(() => currentTask.value)')
    expect(source).toContain("generationError.value = error instanceof Error ? error.message : '生成失败'")
    expect(source).toContain('v-else-if="generationError"')
    expect(source).not.toContain('store.recentTasks[0]')
  })

  it('keeps a floating generate action available in the workspace', () => {
    const source = readFileSync(workspacePagePath, 'utf8')

    expect(source).toContain('class="floating-generate-btn btn-primary"')
    expect(source).toContain(':disabled="generateDisabled"')
    expect(source).toContain("{{ generating ? '生成中...' : '开始生成' }}")
    expect(source).not.toContain('class="generate-btn btn-primary"')
  })

  it('keeps generation parameters as a single workspace sidebar entry', () => {
    const source = readFileSync(workspacePagePath, 'utf8')

    expect(source).toContain('<strong>生成参数</strong>')
    expect(source).not.toContain('class="flow-row"')
    expect(source).not.toContain('<span>2 参数</span>')
    expect(source).not.toContain('<strong>参数与导出</strong>')
  })

  it('guards generation against repeated submissions', () => {
    const source = readFileSync(workspacePagePath, 'utf8')

    expect(source).toContain('const generateDebounceMs = 900')
    expect(source).toContain('const generateDisabled = computed(() => generating.value || generateCooldown.value)')
    expect(source).toContain('if (generateDisabled.value) return')
    expect(source).toContain('generateCooldown.value = true')
  })

  it('keeps prompt generation on the raw prompt instead of auto-translating', () => {
    const source = readFileSync(workspacePagePath, 'utf8')

    expect(source).toContain('async function preparePromptForGeneration')
    expect(source).toContain('return buildGenerationPrompt(prompt.value.trim())')
    expect(source).toContain('const generationPrompt = await preparePromptForGeneration()')
    expect(source).toContain('prompt: generationPrompt')
  })

  it('exposes prompt translation and bilingual library actions in the workspace', () => {
    const source = readFileSync(workspacePagePath, 'utf8')

    expect(source).toContain('const promptHasChinese = computed')
    expect(source).toContain('async function translateCurrentPrompt')
    expect(source).toContain("{{ translatingPrompt ? '翻译中...' : '译英' }}")
    expect(source).toContain("applyPrompt(item, 'en')")
    expect(source).toContain("applyPrompt(item, 'zh')")
    expect(source).toContain('promptLanguageHint')
  })

  it('paginates the workspace prompt library instead of hard slicing results', () => {
    const source = readFileSync(workspacePagePath, 'utf8')

    expect(source).toContain('const promptPage = ref(1)')
    expect(source).toContain('const promptPageSize = 12')
    expect(source).toContain('const filteredPrompts = computed')
    expect(source).toContain('const visiblePrompts = computed(() => {')
    expect(source).toContain('filteredPrompts.value.slice(start, start + promptPageSize)')
    expect(source).toContain('promptTotalPages')
    expect(source).toContain('上一页')
    expect(source).toContain('下一页')
    expect(source).not.toContain('.slice(0, 24)')
  })

  it('shows animated GIF and 3D preview treatments in the workspace', () => {
    const source = readFileSync(workspacePagePath, 'utf8')

    expect(source).toContain('function buildGenerationPrompt')
    // 模式提示词片段已迁到 domain/tools.ts，这里只断言组件引用相应的 computed
    expect(source).toContain('toolEffects')
    expect(source).toContain('mode-preview-gif')
    expect(source).toContain('mode-preview-3d')
    expect(source).toContain('mode-preview-idle')
    expect(source).toContain('sample-media-gif')
    expect(source).toContain('sample-media-3d')
    expect(source).toContain('isGifAsset(asset)')
    expect(source).toContain('isThreeDAsset(asset)')
  })
})

describe('WorkspacePage tool-aware rendering', () => {
  it('imports the tool catalog helpers from the data layer', () => {
    const source = readFileSync(workspacePagePath, 'utf8')

    expect(source).toContain("from '@/data/catalog'")
    expect(source).toContain('defaultToolForMode, findToolEntry')
    expect(source).toContain("toolGroups } from '@/data/catalog'")
  })

  it('tracks the active tool and its derived state', () => {
    const source = readFileSync(workspacePagePath, 'utf8')

    expect(source).toContain("const activeToolId = ref('')")
    expect(source).toContain('const extraOptions = reactive')
    expect(source).toContain('const activeTool = computed')
    expect(source).toContain('function selectTool')
    expect(source).toContain('function applyToolControlDefaults')
    // 旧：内联 toolPromptFragments / modePromptFragments
    // 新：集中到 resolveToolEffects
    expect(source).toContain('resolveToolEffects')
  })

  it('delegates prompt fragment composition to resolveToolEffects', () => {
    const source = readFileSync(workspacePagePath, 'utf8')

    // 重构后 buildGenerationPrompt 收窄为 base + toolEffects.promptFragments
    expect(source).toContain('function buildGenerationPrompt')
    expect(source).toContain('toolEffects.value.promptFragments')
    // 旧的内联模式片段函数已删除
    expect(source).not.toContain('function modePromptFragments')
    expect(source).not.toContain('function toolPromptFragments')
  })

  it('blocks reference-required tools without an uploaded image', () => {
    const source = readFileSync(workspacePagePath, 'utf8')

    // C7：modeOptions 不再注入冗余的 toolId/toolTitle
    expect(source).not.toContain('options.toolId = activeTool.value.id')
    expect(source).not.toContain('options.toolTitle = activeTool.value.title')
    expect(source).toContain("mode.value === 'img2video' || Boolean(activeTool.value?.referenceRequired)")
    expect(source).toContain('if (referenceRequired.value && !referenceImage.value)')
    expect(source).toContain("mode.value === 'img2video' ? '图生视频需要先上传参考图' : '当前工具需要先上传参考图'")
  })

  it('keeps text-to-video prompt-only while image-to-video requires reference', () => {
    const source = readFileSync(workspacePagePath, 'utf8')

    expect(source).toContain("const showReferenceBlock = computed(() => mode.value !== 'txt2video')")
    expect(source).toContain('v-if="showReferenceBlock"')
    expect(source).toContain("referenceImage: showReferenceBlock.value ? referenceImage.value : ''")
    expect(source).toContain("task: isVideoMode.value ? 'video-prompt' : 'polish'")
    expect(source).toContain('视频提示词会通过文本润色模型补充主体、动作、场景、镜头运动和光照。')
  })

  it('uses the text model auto route for workspace polishing actions', () => {
    const source = readFileSync(workspacePagePath, 'utf8')

    expect(source).toContain('const textAutoRouteSummary = computed')
    expect(source).toContain('store.textAutoRouteProfiles')
    expect(source).toContain('文本生成 / AI 润色')
    expect(source).toContain('正向润色、反向提示词润色和译英统一走文本模型 auto 路由')
    expect(source).toContain('class="route-info-card"')
    expect(source).not.toContain('selectedTextModelId')
    expect(source).not.toContain('id="workspace-text-model"')
  })

  it('exposes explicit 8n plus 1 frame control for video generation', () => {
    const source = readFileSync(workspacePagePath, 'utf8')

    expect(source).toContain("const videoFrameMode = ref<'duration' | 'eight-n-plus-one'>('duration')")
    expect(source).toContain("const videoNumFrames = computed(() => (videoFrameMode.value === 'eight-n-plus-one' ? videoFrameN.value * 8 + 1 : videoDurationFrames.value))")
    expect(source).toContain('options.frameMode = videoFrameMode.value')
    expect(source).toContain('options.frameN = videoFrameN.value')
    expect(source).toContain('v-if="videoFrameMode === \'duration\'" class="chip-grid"')
    expect(source).toContain('id="workspace-video-frame-n"')
    expect(source).toContain('const eightNFramePresets = [')
    expect(source).toContain("{ label: '快速预览', n: 10, frames: 81, seconds: '约 3.4s' }")
    expect(source).toContain("{ label: '长镜头', n: 45, frames: 361, seconds: '约 15s' }")
    expect(source).toContain('v-for="preset in eightNFramePresets"')
    expect(source).toContain('预计 {{ videoEstimatedSeconds }}s')
    expect(source).toContain('按 8 × ${videoFrameN} + 1 计算')
  })

  it('exposes motion guidance, facial expression, pose, and line controls', () => {
    const source = readFileSync(workspacePagePath, 'utf8')

    expect(source).toContain("const actionGuidance = ref('')")
    expect(source).toContain("const facialExpression = ref('natural')")
    expect(source).toContain('options.actionGuidance = actionGuidance.value')
    expect(source).toContain('options.facialExpression = facialExpression.value')
    expect(source).toContain('id="workspace-action-guidance"')
    expect(source).toContain('id="workspace-facial-expression"')
    expect(source).toContain('id="workspace-pose-adjustment"')
    expect(source).toContain('id="workspace-line-control"')
  })

  it('renders the tool picker grid and tool-aware control blocks', () => {
    const source = readFileSync(workspacePagePath, 'utf8')

    expect(source).toContain('tool-picker')
    expect(source).toContain('tool-pick-card')
    expect(source).toContain('tool-pick-icon')
    expect(source).toContain('tool-controls-block')
    expect(source).toContain('tool-banner')
    expect(source).toContain('工具参数')
    expect(source).toContain('使用提示')
  })

  it('opens the workspace tool picker in a modal instead of an always-expanded sidebar list', () => {
    const source = readFileSync(workspacePagePath, 'utf8')

    expect(source).toContain('const toolPickerOpen = ref(false)')
    expect(source).toContain('const activeToolGroupId = ref')
    expect(source).toContain('const activeToolGroupTools = computed')
    expect(source).toContain('function openToolPicker')
    expect(source).toContain('@click="openToolPicker"')
    expect(source).toContain('class="modal tool-picker-modal"')
    expect(source).toContain('aria-labelledby="tool-picker-title"')
    expect(source).toContain('toolPickerOpen.value = false')
    expect(source).toContain('工作台不再被长列表撑高')
    expect(source).toContain('tool-summary-card')
    expect(source).toContain('class="tool-group-tabs"')
    expect(source).toContain('v-for="tool in activeToolGroupTools"')
    expect(source).toContain('{{ activeToolGroupTools.length }} 个入口')
    expect(source).toContain('grid-template-columns: 104px minmax(0, 1fr)')
    expect(source).toContain('repeat(auto-fit, minmax(148px, 1fr))')
  })

  it('keeps the creation entrance compact with folded square cards', () => {
    const source = readFileSync(workspacePagePath, 'utf8')

    expect(source).toContain('class="workspace-fold-card reference-fold-card"')
    expect(source).toContain('class="reference-square"')
    expect(source).toContain('const referenceSummary = computed')
    expect(source).toContain('class="workspace-fold-card result-fold-card"')
    expect(source).toContain('const previewSummary = computed')
    expect(source).toContain('<strong>生成参数</strong>')
    expect(source).toContain('const generationParamsSummary = computed')
    expect(source).toContain('<strong>输出尺寸</strong>')
    expect(source).toContain('<strong>生成控制</strong>')
    expect(source).toContain('<strong>模式专属</strong>')
    expect(source).toContain('<strong>工具参数</strong>')
    expect(source).toContain('当前入口没有额外工具参数。')
  })

  it('adds AI polish support for the negative prompt field', () => {
    const source = readFileSync(workspacePagePath, 'utf8')

    expect(source).toContain('const polishingNegativePrompt = ref(false)')
    expect(source).toContain('async function polishNegativePrompt')
    expect(source).toContain("task: 'negative-prompt'")
    expect(source).toContain('id="workspace-negative-prompt"')
    expect(source).toContain("{{ polishingNegativePrompt ? '润色中...' : 'AI 润色' }}")
    expect(source).toContain("store.notify('已填入基础反向提示词')")
  })

  it('prefers the active tool flow copy over the mode fallback', () => {
    const source = readFileSync(workspacePagePath, 'utf8')

    expect(source).toContain('if (activeTool.value?.flowCopy) return activeTool.value.flowCopy')
  })

  it('wires real lucide icons in the tool picker and runs post-processing in generate', () => {
    const source = readFileSync(workspacePagePath, 'utf8')

    // 真实图标：resolveToolIcon 注册的 lucide 组件
    expect(source).toContain("import { resolveToolIcon } from '@/domain/icons'")
    expect(source).toContain('resolveToolIcon(tool.icon)')
    // 后处理管道接入 generate()
    expect(source).toContain('applyPostProcessPipeline')
    expect(source).toContain('effects.postProcessSteps')
    // 工具的诚实提示
    expect(source).toContain('effects.notes')
  })

  it('drops the legacy mode descriptions import', () => {
    const source = readFileSync(workspacePagePath, 'utf8')

    expect(source).not.toContain('modeDescriptions')
  })
})
