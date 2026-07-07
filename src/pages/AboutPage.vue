<script setup lang="ts">
import { ref } from 'vue'
import { RouterLink } from 'vue-router'
import { CircleHelp, Keyboard, LockKeyhole, Rocket, UserRound } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const tab = ref<'about' | 'help' | 'faq' | 'shortcuts'>('about')
const openFaq = ref(0)

const faqs = t('about.faqs') as unknown as [string, string][]
const steps = t('about.steps') as unknown as string[]

const workspaceShortcuts = [
  { key: 'generate', keys: 'Ctrl + Enter' },
  { key: 'clearPrompt', keys: 'Ctrl + D' },
  { key: 'polish', keys: 'Ctrl + Shift + R' },
  { key: 'copyResult', keys: 'Ctrl + Shift + C' },
  { key: 'openPromptLib', keys: 'Ctrl + L' },
  { key: 'uploadRef', keys: 'Ctrl + U' },
  { key: 'exportResult', keys: 'Ctrl + Shift + E' },
]

const navigationShortcuts = [
  { key: 'navHome', keys: 'Ctrl + 1' },
  { key: 'navWorkspace', keys: 'Ctrl + 2' },
  { key: 'navTools', keys: 'Ctrl + 3' },
  { key: 'navHistory', keys: 'Ctrl + 4' },
  { key: 'navOperations', keys: 'Ctrl + 5' },
  { key: 'navSettings', keys: 'Ctrl + 6' },
  { key: 'navAbout', keys: 'Ctrl + 7' },
]
</script>

<template>
  <div class="page">
    <section class="about-hero">
      <div class="about-logo">L</div>
      <h1>{{ t('about.heroTitle1') }}<span>{{ t('about.heroTitle2') }}</span></h1>
      <p class="version">{{ t('about.version') }}</p>
      <p class="tagline">{{ t('about.tagline') }}</p>
      <div class="btn-row hero-actions">
        <RouterLink class="btn-primary" to="/workspace">
          <Rocket :size="16" />
          {{ t('about.enterWorkspace') }}
        </RouterLink>
        <RouterLink class="btn-soft" to="/settings">{{ t('about.modelSettings') }}</RouterLink>
      </div>
    </section>

    <div class="about-tabs">
      <button class="about-tab" :class="{ active: tab === 'about' }" type="button" @click="tab = 'about'">{{ t('about.tabAbout') }}</button>
      <button class="about-tab" :class="{ active: tab === 'help' }" type="button" @click="tab = 'help'">{{ t('about.tabHelp') }}</button>
      <button class="about-tab" :class="{ active: tab === 'faq' }" type="button" @click="tab = 'faq'">{{ t('about.tabFaq') }}</button>
      <button class="about-tab" :class="{ active: tab === 'shortcuts' }" type="button" @click="tab = 'shortcuts'">{{ t('about.tabShortcuts') }}</button>
    </div>

    <section v-if="tab === 'about'" class="about-panel">
      <article class="info-card">
        <h2><UserRound :size="17" /> {{ t('about.productInfo') }}</h2>
        <div class="info-row"><span>{{ t('about.appName') }}</span><strong>{{ t('about.appName') }}</strong></div>
        <div class="info-row"><span>{{ t('about.versionLabel') }}</span><strong>{{ t('about.versionValue') }}</strong></div>
        <div class="info-row"><span>{{ t('about.runMode') }}</span><strong>{{ t('about.runModeValue') }}</strong></div>
        <div class="info-row"><span>{{ t('about.dataStorage') }}</span><strong>{{ t('about.dataStorageValue') }}</strong></div>
      </article>
      <article class="author-card">
        <div class="author-head">
          <div>
            <h2><UserRound :size="17" /> {{ t('about.appInfo') }}</h2>
            <p>{{ t('about.appInfoDesc') }}</p>
          </div>
        </div>
        <div class="info-row"><span>{{ t('about.positioning') }}</span><strong>{{ t('about.positioningValue') }}</strong></div>
        <div class="info-row"><span>{{ t('about.platformPlan') }}</span><strong>{{ t('about.platformPlanValue') }}</strong></div>
        <div class="info-row"><span>{{ t('about.contact') }}</span><strong>{{ t('about.contactValue') }}</strong></div>
      </article>
      <article class="privacy-note">
        <LockKeyhole :size="18" />
        <span><strong>{{ t('about.privacyCommit') }}</strong>：{{ t('about.privacyText') }}</span>
      </article>
    </section>

    <section v-else-if="tab === 'help'" class="about-panel step-list">
      <article v-for="(item, index) in steps" :key="item" class="step-item">
        <span class="step-num">{{ index + 1 }}</span>
        <div>
          <h3>{{ item }}</h3>
          <p>{{ t('about.stepDesc') }}</p>
        </div>
      </article>
    </section>

    <section v-else-if="tab === 'faq'" class="about-panel faq-list">
      <article v-for="(item, index) in faqs" :key="item[0]" class="faq-item" :class="{ open: openFaq === index }">
        <button type="button" @click="openFaq = openFaq === index ? -1 : index">
          <span><CircleHelp :size="16" /> {{ item[0] }}</span>
          <b>{{ openFaq === index ? '-' : '+' }}</b>
        </button>
        <p v-if="openFaq === index">{{ item[1] }}</p>
      </article>
    </section>

    <section v-else class="about-panel shortcut-panel">
      <article class="shortcut-section">
        <h2>{{ t('about.workspaceShortcutsTitle') }}</h2>
        <div class="shortcut-grid">
          <div v-for="item in workspaceShortcuts" :key="item.keys" class="shortcut-row">
            <span><Keyboard :size="15" /> {{ t('about.shortcuts.' + item.key) }}</span>
            <kbd>{{ item.keys }}</kbd>
          </div>
        </div>
      </article>
      <article class="shortcut-section">
        <h2>{{ t('about.navShortcutsTitle') }}</h2>
        <div class="shortcut-grid">
          <div v-for="item in navigationShortcuts" :key="item.keys" class="shortcut-row">
            <span><Keyboard :size="15" /> {{ t('about.shortcuts.' + item.key) }}</span>
            <kbd>{{ item.keys }}</kbd>
          </div>
        </div>
      </article>
    </section>
  </div>
</template>

<style scoped>
.about-hero {
  text-align: center;
  padding: 46px 24px 32px;
  border-bottom: 1px solid var(--border);
}

.about-logo {
  width: 72px;
  height: 72px;
  border-radius: 18px;
  background: linear-gradient(135deg, var(--accent), var(--accent-3));
  color: var(--accent-on);
  display: grid;
  place-items: center;
  margin: 0 auto 18px;
  font-size: 30px;
  font-weight: 900;
  box-shadow: var(--elev-raised);
}

.about-hero h1 {
  font-size: 32px;
  font-weight: 780;
}

.about-hero h1 span {
  color: var(--accent);
}

.version {
  color: var(--muted);
  font-family: var(--font-mono);
}

.tagline {
  max-width: 48ch;
  margin: 12px auto 0;
  color: var(--fg-2);
  font-size: 16px;
}

.hero-actions {
  justify-content: center;
  margin-top: 20px;
}

.about-tabs {
  display: flex;
  gap: 4px;
  width: fit-content;
  margin: 24px 0;
  padding: 3px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface);
}

.about-tab {
  padding: 8px 18px;
  border-radius: 8px;
  color: var(--muted);
}

.about-tab.active {
  background: var(--surface-3);
  color: var(--fg);
}

.about-panel {
  display: grid;
  gap: 14px;
  padding-bottom: 36px;
}

.info-card,
.author-card,
.step-item,
.faq-item,
.privacy-note,
.shortcut-row {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: 18px 20px;
  transition: transform var(--dur-base), border-color var(--dur-base), box-shadow var(--dur-base);
}

.info-card:hover,
.author-card:hover,
.privacy-note:hover,
.step-item:hover {
  transform: translateY(-2px);
  border-color: var(--accent);
  box-shadow: var(--card-hover-shadow);
}

.info-card h2 {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}

.author-head {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: flex-start;
  margin-bottom: 10px;
}

.author-head h2 {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.author-head p {
  color: var(--fg-2);
  line-height: 1.7;
}

.author-link {
  max-width: min(100%, 420px);
  color: var(--accent);
  text-align: right;
  overflow-wrap: anywhere;
}

.author-link:hover {
  text-decoration: underline;
}

.info-row,
.shortcut-row,
.faq-item button {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.info-row {
  padding: 9px 0;
  border-bottom: 1px solid var(--border-soft);
}

.info-row span,
.faq-item p,
.step-item p {
  color: var(--muted);
}

.privacy-note,
.step-item {
  display: flex;
  gap: 14px;
}

.step-num {
  width: 34px;
  height: 34px;
  border-radius: 99px;
  display: grid;
  place-items: center;
  flex: 0 0 auto;
  color: var(--accent);
  background: var(--accent-soft);
  font-family: var(--font-mono);
  font-weight: 800;
}

.faq-item button {
  width: 100%;
}

.faq-item button span,
.shortcut-row span {
  display: flex;
  align-items: center;
  gap: 8px;
}

.faq-item p {
  margin-top: 12px;
  line-height: 1.7;
}

.shortcut-panel {
  gap: 18px;
}

.shortcut-section {
  display: grid;
  gap: 12px;
}

.shortcut-section h2 {
  font-size: 14px;
  color: var(--muted);
}

.shortcut-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
}

kbd {
  font-family: var(--font-mono);
  font-size: 12px;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 5px;
  padding: 2px 8px;
}

@media (max-width: 720px) {
  .author-head {
    align-items: stretch;
    flex-direction: column;
  }

  .author-link {
    text-align: left;
  }
}
</style>
