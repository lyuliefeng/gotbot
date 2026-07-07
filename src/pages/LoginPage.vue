<script setup lang="ts">
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  BookOpen,
  Eye,
  EyeOff,
  Lock,
  Mail,
  ShieldCheck,
  UserPlus,
  UserRound,
  WandSparkles,
  Zap,
} from 'lucide-vue-next'
import ThemeSwitcher from '@/components/ThemeSwitcher.vue'
import { useAppStore } from '@/stores/app'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const store = useAppStore()
const route = useRoute()
const router = useRouter()

const agreedToTerms = ref(false)

const activeTab = ref<'local-login' | 'local-register' | 'email-login' | 'email-register'>('local-login')
const localLoginUsername = ref(store.currentAccount?.username ?? '')
const localLoginAccessKey = ref('')
const localRegisterUsername = ref('')
const localRegisterDisplayName = ref('')
const localRegisterAccessKey = ref('')
const localRegisterConfirmKey = ref('')
const emailLoginAddress = ref('')
const emailLoginAccessKey = ref('')
const emailRegisterAddress = ref('')
const emailRegisterAccessKey = ref('')
const emailRegisterConfirmKey = ref('')
const emailRegisterVerificationCode = ref('')
const emailRegisterPendingCode = ref('')
const emailRegisterCodeEmail = ref('')
const emailRegisterCodeExpiresAt = ref(0)
const accessKeyVisible = ref(false)

function redirectAfterLogin(): void {
  const redirect = typeof route.query.redirect === 'string' && route.query.redirect.startsWith('/')
    ? route.query.redirect
    : '/workspace'
  void router.replace(redirect)
}

function ensureConfirmedSecret(accessKey: string, confirmKey: string): boolean {
  if (accessKey !== confirmKey) {
    store.notify(t('login.notifySecretsMismatch'), 'error')
    return false
  }
  return true
}

function normalizeEmailAddress(value: string): string {
  return value.trim().toLowerCase()
}

function isValidEmailAddress(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

function generateEmailCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000))
}

function sendEmailRegisterCode(): void {
  const email = normalizeEmailAddress(emailRegisterAddress.value)
  if (!isValidEmailAddress(email)) {
    store.notify(t('login.notifyValidEmail'), 'error')
    return
  }

  const code = generateEmailCode()
  emailRegisterPendingCode.value = code
  emailRegisterCodeEmail.value = email
  emailRegisterCodeExpiresAt.value = Date.now() + 10 * 60 * 1000
  store.notify(t('login.notifyCodeSent', { email, code }), 'info')
}

function verifyEmailRegisterCode(email: string): boolean {
  if (!emailRegisterPendingCode.value) {
    store.notify(t('login.notifyGetCodeFirst'), 'error')
    return false
  }
  if (emailRegisterCodeEmail.value !== email) {
    store.notify(t('login.notifyEmailChanged'), 'error')
    return false
  }
  if (Date.now() > emailRegisterCodeExpiresAt.value) {
    store.notify(t('login.notifyCodeExpired'), 'error')
    return false
  }
  if (emailRegisterVerificationCode.value.trim() !== emailRegisterPendingCode.value) {
    store.notify(t('login.notifyCodeWrong'), 'error')
    return false
  }
  return true
}

function loginLocal(): void {
  if (!store.loginAccountByIdentifier(localLoginUsername.value, localLoginAccessKey.value)) return
  redirectAfterLogin()
}

function registerLocal(): void {
  if (!ensureConfirmedSecret(localRegisterAccessKey.value, localRegisterConfirmKey.value)) return
  const account = store.createAccount({
    username: localRegisterUsername.value,
    displayName: localRegisterDisplayName.value,
    accessKey: localRegisterAccessKey.value,
  })
  if (!account) return
  if (!store.loginAccount(account.id, localRegisterAccessKey.value)) return
  redirectAfterLogin()
}

function loginEmail(): void {
  if (!store.loginAccountByIdentifier(emailLoginAddress.value, emailLoginAccessKey.value)) return
  redirectAfterLogin()
}

function registerEmail(): void {
  const email = emailRegisterAddress.value.trim().toLowerCase()
  if (!verifyEmailRegisterCode(email)) return
  if (!ensureConfirmedSecret(emailRegisterAccessKey.value, emailRegisterConfirmKey.value)) return
  const account = store.createAccount({
    username: email,
    email,
    displayName: email.split('@')[0],
    accessKey: emailRegisterAccessKey.value,
  })
  if (!account) return
  emailRegisterVerificationCode.value = ''
  emailRegisterPendingCode.value = ''
  emailRegisterCodeEmail.value = ''
  emailRegisterCodeExpiresAt.value = 0
  if (!store.loginAccount(account.id, emailRegisterAccessKey.value)) return
  redirectAfterLogin()
}

</script>

<template>
  <main class="login-page">
    <div class="login-theme-switch">
      <ThemeSwitcher />
    </div>

    <section class="login-showcase">
      <div class="brand-lockup">
        <span class="brand-icon">L</span>
        <strong>gotbot</strong>
      </div>

      <div class="showcase-copy">
        <h1>
          {{ t('login.heading1') }}<br>
          <span>{{ t('login.heading2') }}</span>
        </h1>
        <p>{{ t('login.subtitle') }}</p>
      </div>

      <div class="feature-grid">
        <article>
          <WandSparkles :size="16" />
          <strong>{{ t('login.featureMultiModel') }}</strong>
          <span>{{ t('login.featureMultiModelDesc') }}</span>
        </article>
        <article>
          <Zap :size="16" />
          <strong>{{ t('login.featureSmartEntry') }}</strong>
          <span>{{ t('login.featureSmartEntryDesc') }}</span>
        </article>
        <article>
          <UserRound :size="16" />
          <strong>{{ t('login.featureMultiAccount') }}</strong>
          <span>{{ t('login.featureMultiAccountDesc') }}</span>
        </article>
        <article>
          <BookOpen :size="16" />
          <strong>{{ t('login.featureAssetClosure') }}</strong>
          <span>{{ t('login.featureAssetClosureDesc') }}</span>
        </article>
      </div>

      <div class="tech-tags">
        <span>OpenAI</span>
        <span>Agnes</span>
        <span>GPT Image2</span>
        <span>Video</span>
        <span>Cloud Deploy</span>
      </div>

      <footer>© 2026 gotbot · {{ t('login.footerPrivate') }}</footer>
    </section>

    <section class="login-panel" aria-label="登录 gotbot">
      <div class="login-card">
        <div class="login-title">
          <h2>{{ t('login.welcome') }}</h2>
          <p>{{ t('login.welcomeDesc') }}</p>
        </div>

        <div class="login-tabs" role="tablist">
          <button type="button" :class="{ active: activeTab === 'local-login' }" @click="activeTab = 'local-login'">{{ t('login.tabLocalLogin') }}</button>
          <button type="button" :class="{ active: activeTab === 'local-register' }" @click="activeTab = 'local-register'">{{ t('login.tabLocalRegister') }}</button>
          <button type="button" :class="{ active: activeTab === 'email-login' }" @click="activeTab = 'email-login'">{{ t('login.tabEmailLogin') }}</button>
          <button type="button" :class="{ active: activeTab === 'email-register' }" @click="activeTab = 'email-register'">{{ t('login.tabEmailRegister') }}</button>
        </div>

        <form v-if="activeTab === 'local-login'" class="login-form" @submit.prevent="loginLocal">
          <label>
            <span>{{ t('login.adminAccount') }}</span>
            <div class="input-shell">
              <UserRound :size="16" />
              <input v-model.trim="localLoginUsername" autocomplete="username" :placeholder="t('login.placeholderAdmin')" />
            </div>
          </label>

          <label>
            <span>{{ t('login.accessKey') }}</span>
            <div class="input-shell">
              <Lock :size="16" />
              <input
                v-model="localLoginAccessKey"
                :type="accessKeyVisible ? 'text' : 'password'"
                autocomplete="current-password"
                :placeholder="t('login.placeholderAccessKey')"
              />
              <button class="icon-button" type="button" @click="accessKeyVisible = !accessKeyVisible">
                <EyeOff v-if="accessKeyVisible" :size="16" />
                <Eye v-else :size="16" />
              </button>
            </div>
          </label>

          <button class="login-submit" type="submit" :disabled="!agreedToTerms">{{ t('login.loginSystem') }}</button>
        </form>

        <form v-else-if="activeTab === 'local-register'" class="login-form" @submit.prevent="registerLocal">
          <label>
            <span>{{ t('login.adminAccount') }}</span>
            <div class="input-shell">
              <UserPlus :size="16" />
              <input v-model.trim="localRegisterUsername" autocomplete="username" :placeholder="t('login.placeholderAdmin')" />
            </div>
          </label>

          <label>
            <span>{{ t('login.displayName') }}</span>
            <div class="input-shell">
              <UserRound :size="16" />
              <input v-model.trim="localRegisterDisplayName" autocomplete="name" :placeholder="t('login.placeholderDisplayName')" />
            </div>
          </label>

          <label>
            <span>{{ t('login.accessKey') }}</span>
            <div class="input-shell">
              <Lock :size="16" />
              <input
                v-model="localRegisterAccessKey"
                :type="accessKeyVisible ? 'text' : 'password'"
                autocomplete="new-password"
                :placeholder="t('login.placeholderAtLeast6')"
              />
            </div>
          </label>

          <label>
            <span>{{ t('login.confirmKey') }}</span>
            <div class="input-shell">
              <Lock :size="16" />
              <input
                v-model="localRegisterConfirmKey"
                :type="accessKeyVisible ? 'text' : 'password'"
                autocomplete="new-password"
                :placeholder="t('login.placeholderConfirmKey')"
              />
              <button class="icon-button" type="button" @click="accessKeyVisible = !accessKeyVisible">
                <EyeOff v-if="accessKeyVisible" :size="16" />
                <Eye v-else :size="16" />
              </button>
            </div>
          </label>

          <button class="login-submit" type="submit" :disabled="!agreedToTerms">{{ t('login.createLocalAccount') }}</button>
          <p class="form-note">{{ t('login.formNoteRegister') }}</p>
        </form>

        <form v-else-if="activeTab === 'email-login'" class="login-form" @submit.prevent="loginEmail">
          <label>
            <span>{{ t('login.emailAddress') }}</span>
            <div class="input-shell">
              <Mail :size="16" />
              <input v-model.trim="emailLoginAddress" autocomplete="email" inputmode="email" :placeholder="t('login.placeholderEmail')" />
            </div>
          </label>

          <label>
            <span>{{ t('login.loginKey') }}</span>
            <div class="input-shell">
              <Lock :size="16" />
              <input
                v-model="emailLoginAccessKey"
                :type="accessKeyVisible ? 'text' : 'password'"
                autocomplete="current-password"
                :placeholder="t('login.placeholderEmailKey')"
              />
              <button class="icon-button" type="button" @click="accessKeyVisible = !accessKeyVisible">
                <EyeOff v-if="accessKeyVisible" :size="16" />
                <Eye v-else :size="16" />
              </button>
            </div>
          </label>

          <button class="login-submit" type="submit" :disabled="!agreedToTerms">{{ t('login.tabEmailLogin') }}</button>
          <p class="form-note">{{ t('login.emailLoginNote') }}</p>
        </form>

        <form v-else class="login-form" @submit.prevent="registerEmail">
          <label>
            <span>{{ t('login.emailAddress') }}</span>
            <div class="input-shell">
              <Mail :size="16" />
              <input v-model.trim="emailRegisterAddress" autocomplete="email" inputmode="email" :placeholder="t('login.placeholderEmail')" />
            </div>
          </label>

          <label>
            <span>{{ t('login.emailCode') }}</span>
            <div class="verification-row">
              <div class="input-shell">
                <ShieldCheck :size="16" />
                <input v-model.trim="emailRegisterVerificationCode" inputmode="numeric" maxlength="6" :placeholder="t('login.placeholderEmailCode')" />
              </div>
              <button class="code-button" type="button" @click="sendEmailRegisterCode">
                {{ emailRegisterPendingCode ? t('login.resendCode') : t('login.sendCode') }}
              </button>
            </div>
          </label>

          <label>
            <span>{{ t('login.loginKey') }}</span>
            <div class="input-shell">
              <Lock :size="16" />
              <input
                v-model="emailRegisterAccessKey"
                :type="accessKeyVisible ? 'text' : 'password'"
                autocomplete="new-password"
                :placeholder="t('login.placeholderAtLeast6')"
              />
            </div>
          </label>

          <label>
            <span>{{ t('login.confirmKey') }}</span>
            <div class="input-shell">
              <Lock :size="16" />
              <input
                v-model="emailRegisterConfirmKey"
                :type="accessKeyVisible ? 'text' : 'password'"
                autocomplete="new-password"
                :placeholder="t('login.placeholderConfirmLoginKey')"
              />
              <button class="icon-button" type="button" @click="accessKeyVisible = !accessKeyVisible">
                <EyeOff v-if="accessKeyVisible" :size="16" />
                <Eye v-else :size="16" />
              </button>
            </div>
          </label>

          <button class="login-submit" type="submit" :disabled="!agreedToTerms">{{ t('login.emailRegister') }}</button>
          <p class="form-note">{{ t('login.emailRegisterNote') }}</p>
        </form>

        <label class="oauth-agree">
          <input v-model="agreedToTerms" type="checkbox" class="oauth-agree-check" />
          <span>{{ t('login.agreeTerms') }}<a href="#" @click.prevent>{{ t('login.userAgreement') }}</a>{{ t('common.conjunctionAnd') }}<a href="#" @click.prevent>{{ t('login.privacyPolicy') }}</a></span>
        </label>
      </div>
    </section>

    <div class="login-footer">
      <strong>gotbot</strong>
      <span>v3.0.0</span>
      <span>Made with ❤ by gotbot</span>
    </div>
  </main>
</template>

<style scoped>
.login-page {
  position: relative;
  min-height: 100vh;
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(420px, 1fr);
  background: var(--bg);
  color: var(--fg);
  overflow: hidden;
}

.login-page::before {
  content: "";
  position: absolute;
  inset: 0 50% 0 0;
  background-image:
    linear-gradient(var(--border-soft) 1px, transparent 1px),
    linear-gradient(90deg, var(--border-soft) 1px, transparent 1px);
  background-size: 32px 32px;
  mask-image: linear-gradient(90deg, #000 0%, rgba(0, 0, 0, 0.72) 72%, transparent 100%);
  pointer-events: none;
}

.login-theme-switch {
  position: absolute;
  top: 22px;
  right: 22px;
  z-index: 3;
}

.login-showcase,
.login-panel {
  position: relative;
  z-index: 1;
}

.login-showcase {
  display: grid;
  align-content: start;
  gap: 28px;
  padding: clamp(42px, 7vw, 84px);
}

.brand-lockup {
  display: inline-flex;
  align-items: center;
  gap: 12px;
  width: fit-content;
  color: var(--fg-2);
  font-size: 17px;
  font-weight: 950;
}

.brand-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border-radius: 10px;
  background: linear-gradient(135deg, var(--accent), var(--accent-3));
  color: var(--accent-on);
  font-weight: 950;
}

.showcase-copy {
  margin-top: 32px;
}

.showcase-copy h1 {
  margin: 0;
  color: var(--fg);
  font-size: clamp(42px, 6vw, 76px);
  line-height: 1.08;
  letter-spacing: -0.06em;
}

.showcase-copy h1 span {
  background: linear-gradient(120deg, var(--accent), var(--accent-2), var(--accent-3));
  background-clip: text;
  color: transparent;
}

.showcase-copy p {
  max-width: 760px;
  margin: 22px 0 0;
  color: var(--muted);
  font-size: 15px;
  line-height: 2;
}

.feature-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
  max-width: 760px;
}

.feature-grid article {
  display: grid;
  grid-template-columns: 18px minmax(0, 1fr);
  gap: 7px 10px;
  padding: 18px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface);
  box-shadow: var(--card-shadow);
}

.feature-grid article svg {
  color: var(--accent);
}

.feature-grid strong {
  color: var(--fg);
  font-size: 13px;
  font-weight: 950;
}

.feature-grid span {
  grid-column: 2 / -1;
  color: var(--muted);
  font-size: 12px;
  line-height: 1.7;
}

.tech-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 9px;
}

.tech-tags span {
  padding: 3px 8px;
  border: 1px solid var(--border-glow);
  border-radius: 7px;
  background: var(--accent-soft);
  color: var(--accent);
  font-size: 11px;
  font-weight: 850;
}

.login-showcase footer {
  position: absolute;
  left: clamp(42px, 7vw, 84px);
  bottom: 26px;
  color: var(--muted);
  font-size: 11px;
  font-weight: 800;
}

.login-panel {
  display: grid;
  place-items: center;
  min-height: 100vh;
  padding: clamp(36px, 7vw, 92px);
  background: var(--surface);
}

.login-card {
  width: min(100%, 420px);
  display: grid;
  gap: 20px;
}

.login-title h2 {
  margin: 0;
  color: var(--fg);
  font-size: 25px;
  letter-spacing: -0.04em;
}

.login-title p {
  margin: 6px 0 0;
  color: var(--muted);
  font-size: 13px;
}

.login-tabs {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  border-bottom: 1px solid var(--border-soft);
}

.login-tabs button {
  min-height: 38px;
  border: 0;
  border-bottom: 2px solid transparent;
  background: transparent;
  color: var(--muted);
  font-weight: 900;
  cursor: pointer;
}

.login-tabs button.active {
  border-color: var(--accent);
  color: var(--fg);
}

.login-form {
  display: grid;
  gap: 16px;
}

.login-form label {
  display: grid;
  gap: 8px;
  color: var(--fg-2);
  font-size: 12px;
  font-weight: 950;
}

.login-form label > span::before {
  content: "* ";
  color: var(--danger);
}

.input-shell {
  display: grid;
  grid-template-columns: 18px minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
  min-height: 46px;
  padding: 0 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-control);
  background: var(--input-bg);
}

.input-shell input {
  min-width: 0;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--fg);
  font: inherit;
}

.input-shell svg {
  color: var(--muted);
}

.icon-button {
  display: inline-flex;
  border: 0;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
}

.verification-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 112px;
  gap: 10px;
}

.code-button {
  min-height: 46px;
  border: 1px solid var(--accent);
  border-radius: var(--radius-control);
  background: var(--accent-soft);
  color: var(--accent);
  font-weight: 950;
  cursor: pointer;
}

.login-submit {
  min-height: 46px;
  border: 0;
  border-radius: var(--radius-control);
  background: linear-gradient(135deg, var(--accent), var(--accent-3));
  color: var(--accent-on);
  font-weight: 950;
  box-shadow: var(--btn-primary-shadow);
  cursor: pointer;
}

.oauth-agree {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: var(--space-3, 12px) 2px 0;
  color: var(--muted);
  font-size: 12px;
  line-height: 1.4;
  cursor: pointer;
  user-select: none;
}

.oauth-agree a {
  color: var(--accent);
  font-weight: 800;
  text-decoration: none;
}

.oauth-agree a:hover {
  text-decoration: underline;
}

.oauth-agree-check {
  appearance: none;
  -webkit-appearance: none;
  flex: 0 0 auto;
  width: 16px;
  height: 16px;
  margin: 0;
  border: 1.5px solid var(--border);
  border-radius: 5px;
  background: var(--surface-2);
  display: grid;
  place-content: center;
  cursor: pointer;
  transition: background var(--dur-fast), border-color var(--dur-fast);
}

.oauth-agree-check::after {
  content: "";
  width: 9px;
  height: 5px;
  border: solid #fff;
  border-width: 0 0 2px 2px;
  transform: rotate(-45deg) scale(0);
  transform-origin: center;
  transition: transform var(--dur-fast);
  margin-bottom: 2px;
}

.oauth-agree-check:checked {
  background: var(--accent);
  border-color: var(--accent);
}

.oauth-agree-check:checked::after {
  transform: rotate(-45deg) scale(1);
}

.form-note {
  margin: -4px 0 0;
  color: var(--muted);
  font-size: 12px;
  line-height: 1.7;
}

.login-footer {
  position: absolute;
  right: 28px;
  bottom: 12px;
  display: inline-flex;
  align-items: center;
  gap: 14px;
  color: var(--muted);
  font-size: 11px;
  font-weight: 800;
}

@media (max-width: 960px) {
  .login-page {
    grid-template-columns: 1fr;
  }

  .login-page::before,
  .login-showcase footer,
  .login-footer {
    display: none;
  }

  .login-panel {
    min-height: auto;
    padding-top: 12px;
  }

  .verification-row {
    grid-template-columns: 1fr;
  }
}
</style>
