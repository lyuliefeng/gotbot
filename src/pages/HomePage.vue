<script setup lang="ts">
import { computed, ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { Download, Eye, FolderOpen, RotateCcw, ShieldCheck, Sparkles, Settings, WandSparkles } from 'lucide-vue-next'
import { getExportFormatOptions, modeLabels, toolGroups } from '@/data/catalog'
import type { ToolEntry } from '@/data/catalog'
import { resolveToolIcon } from '@/domain/icons'
import { useAppStore } from '@/stores/app'
import { pickDirectory } from '@/services/desktop'
import EmptyState from '@/components/EmptyState.vue'
import { useI18n } from 'vue-i18n'
import type { ExportFormat, GeneratedAsset, GenerationMode, GenerationTask, ModelProfile } from '@/types/domain'

const { t } = useI18n()
const router = useRouter()
const store = useAppStore()
const selectedRecent = ref<{ task: GenerationTask; asset: GeneratedAsset } | null>(null)
const exportOpen = ref(false)
const exportFormat = ref<ExportFormat>(store.settings.defaultExportFormat)
const availableExportFormatOptions = computed(() => getExportFormatOptions(selectedRecent.value?.task.mode))
const quickTools = computed(() => toolGroups.flatMap((group) => group.tools).slice(0, 6))
type ModelSummaryTone = 'ok' | 'warn' | 'error'

interface ModelSummaryRow {
  id: string
  label: string
  tag: string
  statusLabel: string
  tone: ModelSummaryTone
}

function modelTag(model: ModelProfile | undefined): string {
  if (!model) return t('home.modelTagUnconfigured')
  return model.model || t('home.modelTagUnset')
}

function isModelConfigured(model: ModelProfile | undefined): boolean {
  if (!model) return false
  return Boolean(model.endpoint.trim() && model.apiKey.trim() && model.model.trim())
}

function modelStatus(model: ModelProfile | undefined): Pick<ModelSummaryRow, 'statusLabel' | 'tone'> {
  if (!isModelConfigured(model)) return { statusLabel: t('home.modelTagUnconfigured'), tone: 'warn' }
  if (model?.status === 'failed') return { statusLabel: t('home.statusFailed'), tone: 'error' }
  if (model?.status === 'connected') return { statusLabel: t('home.statusConnected'), tone: 'ok' }
  return { statusLabel: t('home.statusPending'), tone: 'warn' }
}

const modelRows = computed<ModelSummaryRow[]>(() => {
  const imageModel = store.primaryImageModel
  const videoModel = store.primaryVideoModel
  const textModel = store.primaryTextModel
  const apiKeyReady = store.models.some((model) => model.provider === 'openai-compatible' && model.apiKey.trim())

  return [
    {
      id: 'primary-image',
      label: t('home.modelPrimaryImage'),
      tag: modelTag(imageModel),
      ...modelStatus(imageModel),
    },
    {
      id: 'primary-video',
      label: t('home.modelPrimaryVideo'),
      tag: modelTag(videoModel),
      ...modelStatus(videoModel),
    },
    {
      id: 'primary-text',
      label: t('home.modelPrimaryText'),
      tag: modelTag(textModel),
      ...modelStatus(textModel),
    },
    {
      id: 'api-key',
      label: t('home.modelApiKey'),
      tag: apiKeyReady ? t('home.statusSet') : t('home.modelTagUnset'),
      statusLabel: apiKeyReady ? t('home.statusSet') : t('home.modelTagUnset'),
      tone: apiKeyReady ? 'ok' : 'warn',
    },
  ]
})

function toolWorkspaceLink(tool: { id: string; mode: GenerationMode }) {
  return { path: '/workspace', query: { mode: tool.mode, tool: tool.id } }
}

function quickToolTone(tool: ToolEntry): string {
  if (tool.id.includes('face') || tool.id.includes('portrait')) return 'portrait'
  if (tool.mode === 'txt2video' || tool.mode === 'img2video') return 'motion'
  if (tool.mode === 'img2img') return 'remix'
  if (tool.mode === '3d') return 'cube'
  if (tool.mode === 'gif') return 'motion'
  return 'image'
}

function isVideoAsset(asset: GeneratedAsset | undefined): boolean {
  return asset?.mediaType === 'video' || asset?.format === 'mp4'
}

function openRecentDetail(task: GenerationTask): void {
  const asset = task.assets[0]
  if (!asset) return
  selectedRecent.value = { task, asset }
}

function reusePrompt(task: GenerationTask): void {
  store.setActivePrompt(task.prompt)
  router.push({
    path: '/workspace',
    query: {
      mode: task.mode,
      prompt: task.prompt,
      negativePrompt: task.negativePrompt,
      modelId: task.modelId,
      width: String(task.width),
      height: String(task.height),
      batchSize: String(task.batchSize),
      steps: String(task.steps),
      seed: String(task.seed),
      style: task.style,
      modeOptions: JSON.stringify(task.modeOptions ?? {}),
    },
  })
}

function retryRecent(task: GenerationTask): void {
  store.setActivePrompt(task.prompt)
  router.push({
    path: '/workspace',
    query: {
      retryTaskId: task.id,
      mode: task.mode,
      prompt: task.prompt,
      negativePrompt: task.negativePrompt,
      modelId: task.modelId,
      width: String(task.width),
      height: String(task.height),
      batchSize: String(task.batchSize),
      steps: String(task.steps),
      seed: String(task.seed),
      style: task.style,
      modeOptions: JSON.stringify(task.modeOptions ?? {}),
    },
  })
}

function openRecentExport(): void {
  const options = availableExportFormatOptions.value
  exportFormat.value = options.some((option) => option.value === store.settings.defaultExportFormat)
    ? store.settings.defaultExportFormat
    : options[0]?.value ?? 'png'
  exportOpen.value = true
}

async function confirmRecentExport(): Promise<void> {
  if (!selectedRecent.value) return
  await store.downloadAsset(selectedRecent.value.asset, exportFormat.value, 1, selectedRecent.value.task)
  exportOpen.value = false
}

async function chooseRecentExportDir(): Promise<void> {
  const directory = await pickDirectory(store.settings.defaultOutputDir)
  if (!directory) return

  store.saveSettings({ defaultOutputDir: directory })
  store.notify(t('home.notifyExportDir', { dir: directory }))
}
</script>

<template>
  <div class="page">
    <section class="home-hero card">
      <div>
        <p class="page-kicker">{{ t('nav.brand') }}</p>
        <h1 class="page-title">{{ t('home.title') }}</h1>
        <p class="page-desc">{{ t('home.desc') }}</p>
        <div class="hero-chips" aria-label="核心能力">
          <span>{{ t('home.chipTxt2img') }}</span>
          <span>{{ t('home.chipImg2img') }}</span>
          <span>{{ t('home.chipTxt2video') }}</span>
          <span>{{ t('home.chipImg2video') }}</span>
        </div>
      </div>
      <div class="hero-preview" aria-hidden="true">
        <span class="hero-media-card hero-media-image">
          <i class="hero-sun" />
          <b class="hero-mountain hero-mountain-a" />
          <b class="hero-mountain hero-mountain-b" />
          <em>IMG</em>
        </span>
        <span class="hero-media-card hero-media-video">
          <i class="hero-play" />
          <b />
          <b />
          <b />
          <em>MP4</em>
        </span>
        <RouterLink class="btn-primary" to="/workspace">
          <WandSparkles :size="16" />
          {{ t('home.startCreate') }}
        </RouterLink>
      </div>
    </section>

    <section class="home-section">
      <div class="section-head">
        <h2><span class="section-dot" />{{ t('home.sectionQuickStart') }}</h2>
        <span class="mono">{{ t('home.toolsCount', { n: quickTools.length }) }}</span>
      </div>
      <div class="grid grid-3">
        <RouterLink v-for="tool in quickTools" :key="tool.title" class="tool-card quick-tool-card" :class="`tone-${quickToolTone(tool)}`" :to="toolWorkspaceLink(tool)">
          <span class="icon-tile quick-tool-icon" :class="`tone-${quickToolTone(tool)}`">
            <component :is="resolveToolIcon(tool.icon)" :size="19" />
          </span>
          <h3>{{ tool.title }}</h3>
          <p>{{ tool.desc }}</p>
        </RouterLink>
      </div>
    </section>

    <section class="home-section">
      <div class="section-head">
        <h2><span class="section-dot" />{{ t('home.sectionModelStatus') }}</h2>
        <RouterLink class="btn-soft btn-sm" to="/settings">
          <Settings :size="14" />
          {{ t('home.configModels') }}
        </RouterLink>
      </div>
      <div class="card">
        <div class="card-body model-detail">
          <div v-for="model in modelRows" :key="model.id" class="model-row">
            <div>
              <strong>{{ model.label }}</strong>
              <span class="model-tag">{{ model.tag }}</span>
            </div>
            <span class="status-pill">
              <span class="status-dot" :class="{ warn: model.tone === 'warn', error: model.tone === 'error' }" />
              {{ model.statusLabel }}
            </span>
          </div>
        </div>
      </div>
    </section>

    <section class="home-section">
      <div class="section-head">
        <h2><span class="section-dot" />{{ t('home.sectionCoverPresets') }}</h2>
        <RouterLink class="mono" to="/tools">{{ t('home.viewAll') }}</RouterLink>
      </div>
      <div class="preset-grid">
        <RouterLink
          v-for="preset in store.enabledCoverPresets"
          :key="preset.id"
          class="preset-btn"
          :to="{ path: '/workspace', query: { mode: 'cover', preset: preset.id } }"
        >
          <span>{{ preset.name }}</span>
          <small>{{ preset.width }} x {{ preset.height }}</small>
        </RouterLink>
      </div>
    </section>

    <section class="home-section">
      <div class="section-head">
        <h2><span class="section-dot" />{{ t('home.sectionRecent') }}</h2>
        <RouterLink class="mono" to="/history">{{ t('home.viewAll') }}</RouterLink>
      </div>
      <div v-if="store.recentTasks.length" class="recent-grid">
        <button
          v-for="task in store.recentTasks.slice(0, 6)"
          :key="task.id"
          class="recent-card"
          type="button"
          @click="openRecentDetail(task)"
        >
          <div class="art-preview recent-thumb">
            <video v-if="isVideoAsset(task.assets[0])" :src="task.assets[0]?.remoteUrl ?? task.assets[0]?.dataUrl" muted playsinline />
            <img v-else :src="task.assets[0]?.dataUrl" :alt="task.prompt" />
          </div>
          <div class="recent-meta">
            <span>{{ modeLabels[task.mode] }}</span>
            <small>{{ t('home.assetCount', { n: task.assets.length }) }}</small>
          </div>
          <strong>{{ task.prompt }}</strong>
        </button>
      </div>
      <EmptyState
        v-else
        :icon="Sparkles"
        :title="t('home.recentEmptyTitle')"
        :description="t('home.recentEmptyDesc')"
      />
    </section>

    <div v-if="selectedRecent" class="modal-overlay" @click.self="selectedRecent = null">
      <div class="modal">
        <div class="modal-head">
          <div>
            <h2>{{ t('home.detailTitle') }}</h2>
            <p class="muted">{{ t('home.detailDesc') }}</p>
          </div>
          <button class="btn-icon" type="button" @click="selectedRecent = null">×</button>
        </div>
        <div class="modal-body home-detail-grid">
          <video v-if="isVideoAsset(selectedRecent.asset)" :src="selectedRecent.asset.remoteUrl ?? selectedRecent.asset.dataUrl" controls playsinline />
          <img v-else :src="selectedRecent.asset.dataUrl" :alt="selectedRecent.asset.title" />
          <div class="stack">
            <div class="detail-row"><span>{{ t('home.detailType') }}</span><strong>{{ modeLabels[selectedRecent.task.mode] }}</strong></div>
            <div class="detail-row"><span>{{ t('home.detailModel') }}</span><strong>{{ selectedRecent.task.modelId }}</strong></div>
            <div class="detail-row"><span>{{ t('home.detailSize') }}</span><strong>{{ selectedRecent.asset.width }} x {{ selectedRecent.asset.height }}</strong></div>
            <div class="detail-row">
              <span>{{ t('home.detailStatus') }}</span>
              <strong :class="{ 'status-error': selectedRecent.task.status === 'failed' }">
                {{ selectedRecent.task.status === 'failed' ? t('home.detailStatusFailed') : selectedRecent.task.status === 'completed' ? t('home.detailStatusCompleted') : selectedRecent.task.status }}
              </strong>
            </div>
            <div v-if="selectedRecent.task.error" class="prompt-box error-box">{{ selectedRecent.task.error }}</div>
            <div class="prompt-box">{{ selectedRecent.task.prompt }}</div>
          </div>
        </div>
        <div class="modal-foot">
          <button class="btn-soft" type="button" @click="reusePrompt(selectedRecent.task)">
            <Eye :size="15" />
            {{ t('home.reusePrompt') }}
          </button>
          <button v-if="selectedRecent.task.status === 'failed'" class="btn-soft" type="button" @click="retryRecent(selectedRecent.task)">
            <RotateCcw :size="15" />
            {{ t('home.retryFailed') }}
          </button>
          <button class="btn-primary" type="button" @click="openRecentExport">
            <Download :size="15" />
            {{ t('home.exportLocal') }}
          </button>
        </div>
      </div>
    </div>

    <div v-if="exportOpen && selectedRecent" class="modal-overlay" @click.self="exportOpen = false">
      <div class="modal small">
        <div class="modal-head">
          <div>
            <h2>{{ t('home.exportTitle') }}</h2>
            <p class="muted">{{ t('home.exportDesc') }}</p>
          </div>
          <button class="btn-icon" type="button" @click="exportOpen = false">×</button>
        </div>
        <div class="modal-body stack">
          <div class="field">
            <label for="home-export-dir">{{ t('home.exportDir') }}</label>
            <div class="directory-picker">
              <input id="home-export-dir" v-model="store.settings.defaultOutputDir" />
              <button class="btn-soft" type="button" @click="chooseRecentExportDir">
                <FolderOpen :size="16" />
                {{ t('home.reselectDir') }}
              </button>
            </div>
          </div>
          <div class="field">
            <label for="home-export-format">{{ t('home.exportFormat') }}</label>
            <select id="home-export-format" v-model="exportFormat">
              <option v-for="option in availableExportFormatOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
            </select>
          </div>
          <p v-if="exportFormat === 'ico'" class="muted">{{ t('home.icoNote') }}</p>
          <p class="muted">{{ t('home.exportMetaNote') }}</p>
        </div>
        <div class="modal-foot">
          <button class="btn-soft" type="button" @click="exportOpen = false">{{ t('common.cancel') }}</button>
          <button class="btn-primary" type="button" @click="confirmRecentExport">{{ t('home.confirmExport') }}</button>
        </div>
      </div>
    </div>

    <section class="privacy-card">
      <ShieldCheck :size="20" />
      <span><strong>{{ t('home.privacyTitle') }}</strong>：{{ t('home.privacyText') }}</span>
    </section>
  </div>
</template>

<style scoped>
.home-hero {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  padding: clamp(22px, 4vw, 38px);
  margin-bottom: 26px;
  border-radius: var(--radius-xl);
  overflow: hidden;
  isolation: isolate;
  min-height: 260px;
  background:
    radial-gradient(circle at 82% 22%, rgba(46, 232, 200, 0.20), transparent 28%),
    radial-gradient(circle at 62% 68%, rgba(157, 124, 255, 0.16), transparent 32%),
    var(--card-bg);
}

.home-hero > div:first-child {
  position: relative;
  z-index: 1;
  max-width: 620px;
}

.hero-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 18px;
}

.hero-chips span {
  border: 1px solid var(--border-glow);
  border-radius: var(--radius-pill);
  background: var(--accent-soft);
  color: var(--accent);
  padding: 6px 10px;
  font-size: 12px;
  font-weight: 700;
}

.hero-preview {
  position: relative;
  z-index: 1;
  display: grid;
  justify-items: center;
  gap: 16px;
  min-width: 180px;
}

.hero-media-card {
  position: relative;
  display: block;
  width: 152px;
  height: 118px;
  border: 1px solid var(--border-glow);
  border-radius: 24px;
  background:
    linear-gradient(160deg, rgba(255,255,255,.22), transparent 42%),
    var(--surface);
  box-shadow: var(--elev-raised);
  overflow: hidden;
}

.hero-media-card em {
  position: absolute;
  left: 12px;
  top: 10px;
  z-index: 3;
  padding: 4px 8px;
  border-radius: var(--radius-pill);
  background: rgba(255,255,255,.72);
  color: #0b1728;
  font-family: var(--font-mono);
  font-size: 10px;
  font-style: normal;
  font-weight: 900;
  letter-spacing: .08em;
}

.hero-media-image {
  transform: rotate(-5deg) translate(6px, 8px);
  background:
    radial-gradient(circle at 78% 24%, rgba(246, 196, 83, .96) 0 11px, transparent 12px),
    linear-gradient(160deg, rgba(87,166,255,.28), rgba(46,232,200,.18)),
    var(--surface);
}

.hero-media-image::before,
.hero-media-image::after {
  content: "";
  position: absolute;
  left: -8px;
  bottom: -26px;
  width: 118px;
  height: 82px;
  border-radius: 28px 28px 0 0;
  background: linear-gradient(135deg, rgba(66,211,146,.88), rgba(46,232,200,.48));
  transform: rotate(18deg);
}

.hero-media-image::after {
  left: 58px;
  bottom: -20px;
  width: 112px;
  height: 76px;
  background: linear-gradient(135deg, rgba(87,166,255,.92), rgba(157,124,255,.46));
  transform: rotate(-18deg);
}

.hero-media-video {
  margin-top: -36px;
  transform: rotate(6deg) translate(-10px, 2px);
  background:
    linear-gradient(90deg, rgba(255,255,255,.15) 0 9px, transparent 9px calc(100% - 9px), rgba(255,255,255,.15) calc(100% - 9px)),
    radial-gradient(circle at 64% 50%, rgba(157,124,255,.26), transparent 32%),
    linear-gradient(135deg, rgba(8, 13, 24, .90), rgba(22, 36, 62, .86));
}

.hero-media-video > b {
  position: absolute;
  left: 9px;
  width: 5px;
  height: 5px;
  border-radius: 2px;
  background: rgba(255,255,255,.62);
  box-shadow: 129px 0 0 rgba(255,255,255,.62);
}

.hero-media-video > b:nth-of-type(1) { top: 20px; }
.hero-media-video > b:nth-of-type(2) { top: 54px; }
.hero-media-video > b:nth-of-type(3) { top: 88px; }

.hero-play {
  position: absolute;
  inset: 0;
  margin: auto;
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--accent), var(--accent-3));
  box-shadow: 0 16px 32px rgba(87, 166, 255, .28);
}

.hero-play::after {
  content: "";
  position: absolute;
  left: 19px;
  top: 14px;
  border-left: 15px solid white;
  border-top: 10px solid transparent;
  border-bottom: 10px solid transparent;
}


.home-section {
  margin-bottom: 30px;
}

.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  margin-bottom: 14px;
}

.section-head h2 {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 16px;
  font-weight: 700;
}

.section-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--accent);
}

.quick-tool-card {
  min-height: 132px;
  overflow: hidden;
}

.quick-tool-card::after {
  content: "";
  position: absolute;
  right: -28px;
  top: -34px;
  width: 112px;
  height: 112px;
  border-radius: 36px;
  background: var(--quick-tool-glow, var(--accent-soft));
  opacity: .62;
  transform: rotate(18deg);
}

.quick-tool-card h3,
.quick-tool-card p,
.quick-tool-icon {
  position: relative;
  z-index: 1;
}

.quick-tool-icon {
  width: 42px;
  height: 42px;
  border-radius: 14px;
}

.quick-tool-card.tone-image {
  --quick-tool-glow: rgba(66, 211, 146, .18);
}

.quick-tool-card.tone-remix {
  --quick-tool-glow: rgba(157, 124, 255, .18);
}

.quick-tool-card.tone-video,
.quick-tool-card.tone-motion {
  --quick-tool-glow: rgba(87, 166, 255, .18);
}

.quick-tool-card.tone-portrait {
  --quick-tool-glow: rgba(239, 93, 168, .16);
}

.quick-tool-card.tone-cube {
  --quick-tool-glow: rgba(246, 196, 83, .18);
}

.quick-tool-icon.tone-image {
  color: #16a565;
  background: rgba(66, 211, 146, .16);
  border-color: rgba(66, 211, 146, .34);
}

.quick-tool-icon.tone-remix {
  color: #7c5cff;
  background: rgba(157, 124, 255, .16);
  border-color: rgba(157, 124, 255, .34);
}

.quick-tool-icon.tone-video,
.quick-tool-icon.tone-motion {
  color: #1689ff;
  background: rgba(87, 166, 255, .16);
  border-color: rgba(87, 166, 255, .34);
}

.quick-tool-icon.tone-portrait {
  color: #ef5da8;
  background: rgba(239, 93, 168, .14);
  border-color: rgba(239, 93, 168, .30);
}

.quick-tool-icon.tone-cube {
  color: #f59e0b;
  background: rgba(246, 196, 83, .16);
  border-color: rgba(246, 196, 83, .34);
}

.model-detail {
  display: grid;
  gap: 10px;
}

.model-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 11px 14px;
  background: var(--tint);
  border-radius: var(--radius-sm);
}

.model-row > div {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.model-tag {
  color: var(--muted);
  font-family: var(--font-mono);
  font-size: 11px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.preset-grid,
.recent-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.preset-btn {
  display: grid;
  gap: 2px;
  padding: 14px 18px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  transition: transform 160ms, border-color 160ms, box-shadow 160ms;
}

.preset-btn:hover {
  border-color: var(--accent);
  box-shadow: var(--card-hover-shadow);
  transform: translateY(-2px);
}

.preset-btn span {
  font-weight: 650;
}

.preset-btn small,
.recent-meta small {
  color: var(--muted);
  font-family: var(--font-mono);
}

.recent-card {
  overflow: hidden;
  text-align: left;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  transition: border-color 160ms, box-shadow 160ms, transform 160ms;
}

.recent-card:hover {
  border-color: var(--accent);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.08), 0 0 0 1px var(--border-glow);
  transform: translateY(-2px);
}

.recent-thumb {
  height: 120px;
}

.recent-meta {
  display: flex;
  justify-content: space-between;
  padding: 10px 12px 4px;
  color: var(--accent);
  font-family: var(--font-mono);
  font-size: 11px;
}

.recent-card strong {
  display: block;
  padding: 0 12px 12px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.privacy-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px 20px;
  color: var(--fg-2);
}

.privacy-card {
  background: rgba(66, 211, 146, 0.08);
  border: 1px solid rgba(66, 211, 146, 0.24);
  border-radius: var(--radius-md);
}

.home-detail-grid {
  display: grid;
  grid-template-columns: 260px 1fr;
  gap: 18px;
}

.home-detail-grid img,
.home-detail-grid video {
  width: 100%;
  aspect-ratio: 1;
  object-fit: cover;
  border-radius: var(--radius-md);
}

.detail-row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  border-bottom: 1px solid var(--border-soft);
  padding-bottom: 10px;
}

.detail-row span {
  color: var(--muted);
}

.status-error,
.error-box {
  color: var(--danger);
}

.error-box {
  border-color: rgba(184, 76, 76, .42);
  background: rgba(184, 76, 76, .1);
}

.prompt-box {
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--tint);
  line-height: 1.7;
}

@media (max-width: 760px) {
  .home-hero,
  .section-head {
    align-items: flex-start;
    flex-direction: column;
  }

  .hero-preview {
    width: 100%;
    grid-template-columns: auto 1fr;
    justify-items: stretch;
    align-items: center;
  }

  .hero-media-card {
    width: 118px;
    height: 92px;
    border-radius: 20px;
  }

  .hero-media-video {
    margin-top: -30px;
  }

  .hero-preview .btn-primary {
    width: 100%;
    min-height: 44px;
  }

  .grid-3,
  .preset-grid,
  .recent-grid,
  .home-detail-grid {
    grid-template-columns: 1fr;
  }
}
</style>
