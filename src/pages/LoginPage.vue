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
    store.notify('两次输入的访问密钥不一致', 'error')
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
    store.notify('请输入有效邮箱地址', 'error')
    return
  }

  const code = generateEmailCode()
  emailRegisterPendingCode.value = code
  emailRegisterCodeEmail.value = email
  emailRegisterCodeExpiresAt.value = Date.now() + 10 * 60 * 1000
  store.notify(`验证码已发送到 ${email}，演示验证码：${code}`, 'info')
}

function verifyEmailRegisterCode(email: string): boolean {
  if (!emailRegisterPendingCode.value) {
    store.notify('请先获取邮箱验证码', 'error')
    return false
  }
  if (emailRegisterCodeEmail.value !== email) {
    store.notify('邮箱地址已变更，请重新获取验证码', 'error')
    return false
  }
  if (Date.now() > emailRegisterCodeExpiresAt.value) {
    store.notify('验证码已过期，请重新获取', 'error')
    return false
  }
  if (emailRegisterVerificationCode.value.trim() !== emailRegisterPendingCode.value) {
    store.notify('验证码不正确', 'error')
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
          基于 AI 的<br>
          <span>图像视频创作助手</span>
        </h1>
        <p>从灵感到成稿，围绕「多模型协同、创作流程自动化、模型路由管理、资产沉淀」构建一体化创作工作台。</p>
      </div>

      <div class="feature-grid">
        <article>
          <WandSparkles :size="16" />
          <strong>多 AI 模型协同</strong>
          <span>支持 OpenAI、Agnes、GPT Image2 等模型，按场景灵活切换。</span>
        </article>
        <article>
          <Zap :size="16" />
          <strong>智能创作入口</strong>
          <span>自动匹配图像、视频和文本模型，快速进入生成流程。</span>
        </article>
        <article>
          <UserRound :size="16" />
          <strong>多账号工作区</strong>
          <span>不同账号独立保存模型配置、提示词、任务和系统设置。</span>
        </article>
        <article>
          <BookOpen :size="16" />
          <strong>资产闭环管理</strong>
          <span>支持生成记录、资产导出、后处理和批量整理。</span>
        </article>
      </div>

      <div class="tech-tags">
        <span>OpenAI</span>
        <span>Agnes</span>
        <span>GPT Image2</span>
        <span>Video</span>
        <span>Cloud Deploy</span>
      </div>

      <footer>© 2026 gotbot · 私有部署</footer>
    </section>

    <section class="login-panel" aria-label="登录 gotbot">
      <div class="login-card">
        <div class="login-title">
          <h2>欢迎回来</h2>
          <p>登录 gotbot，继续你的 AI 图像视频创作项目。</p>
        </div>

        <div class="login-tabs" role="tablist">
          <button type="button" :class="{ active: activeTab === 'local-login' }" @click="activeTab = 'local-login'">本地登录</button>
          <button type="button" :class="{ active: activeTab === 'local-register' }" @click="activeTab = 'local-register'">本地注册</button>
          <button type="button" :class="{ active: activeTab === 'email-login' }" @click="activeTab = 'email-login'">邮箱登录</button>
          <button type="button" :class="{ active: activeTab === 'email-register' }" @click="activeTab = 'email-register'">邮箱注册</button>
        </div>

        <form v-if="activeTab === 'local-login'" class="login-form" @submit.prevent="loginLocal">
          <label>
            <span>管理账号</span>
            <div class="input-shell">
              <UserRound :size="16" />
              <input v-model.trim="localLoginUsername" autocomplete="username" placeholder="请输入管理账号" />
            </div>
          </label>

          <label>
            <span>访问密钥</span>
            <div class="input-shell">
              <Lock :size="16" />
              <input
                v-model="localLoginAccessKey"
                :type="accessKeyVisible ? 'text' : 'password'"
                autocomplete="current-password"
                placeholder="请输入访问密钥"
              />
              <button class="icon-button" type="button" @click="accessKeyVisible = !accessKeyVisible">
                <EyeOff v-if="accessKeyVisible" :size="16" />
                <Eye v-else :size="16" />
              </button>
            </div>
          </label>

          <button class="login-submit" type="submit" :disabled="!agreedToTerms">登录系统</button>
        </form>

        <form v-else-if="activeTab === 'local-register'" class="login-form" @submit.prevent="registerLocal">
          <label>
            <span>管理账号</span>
            <div class="input-shell">
              <UserPlus :size="16" />
              <input v-model.trim="localRegisterUsername" autocomplete="username" placeholder="设置本地账号名称" />
            </div>
          </label>

          <label>
            <span>显示名称</span>
            <div class="input-shell">
              <UserRound :size="16" />
              <input v-model.trim="localRegisterDisplayName" autocomplete="name" placeholder="例如：运营账号" />
            </div>
          </label>

          <label>
            <span>访问密钥</span>
            <div class="input-shell">
              <Lock :size="16" />
              <input
                v-model="localRegisterAccessKey"
                :type="accessKeyVisible ? 'text' : 'password'"
                autocomplete="new-password"
                placeholder="至少 6 个字符"
              />
            </div>
          </label>

          <label>
            <span>确认密钥</span>
            <div class="input-shell">
              <Lock :size="16" />
              <input
                v-model="localRegisterConfirmKey"
                :type="accessKeyVisible ? 'text' : 'password'"
                autocomplete="new-password"
                placeholder="再次输入访问密钥"
              />
              <button class="icon-button" type="button" @click="accessKeyVisible = !accessKeyVisible">
                <EyeOff v-if="accessKeyVisible" :size="16" />
                <Eye v-else :size="16" />
              </button>
            </div>
          </label>

          <button class="login-submit" type="submit" :disabled="!agreedToTerms">创建本地账号</button>
          <p class="form-note">创建后会自动登录，并为该账号生成独立工作区。</p>
        </form>

        <form v-else-if="activeTab === 'email-login'" class="login-form" @submit.prevent="loginEmail">
          <label>
            <span>邮箱地址</span>
            <div class="input-shell">
              <Mail :size="16" />
              <input v-model.trim="emailLoginAddress" autocomplete="email" inputmode="email" placeholder="请输入邮箱地址" />
            </div>
          </label>

          <label>
            <span>登录密钥</span>
            <div class="input-shell">
              <Lock :size="16" />
              <input
                v-model="emailLoginAccessKey"
                :type="accessKeyVisible ? 'text' : 'password'"
                autocomplete="current-password"
                placeholder="请输入邮箱账号密钥"
              />
              <button class="icon-button" type="button" @click="accessKeyVisible = !accessKeyVisible">
                <EyeOff v-if="accessKeyVisible" :size="16" />
                <Eye v-else :size="16" />
              </button>
            </div>
          </label>

          <button class="login-submit" type="submit" :disabled="!agreedToTerms">邮箱登录</button>
          <p class="form-note">邮箱账号与本地账号共用本机安全存储，后续可接入服务器 Session。</p>
        </form>

        <form v-else class="login-form" @submit.prevent="registerEmail">
          <label>
            <span>邮箱地址</span>
            <div class="input-shell">
              <Mail :size="16" />
              <input v-model.trim="emailRegisterAddress" autocomplete="email" inputmode="email" placeholder="请输入邮箱地址" />
            </div>
          </label>

          <label>
            <span>邮箱验证码</span>
            <div class="verification-row">
              <div class="input-shell">
                <ShieldCheck :size="16" />
                <input v-model.trim="emailRegisterVerificationCode" inputmode="numeric" maxlength="6" placeholder="请输入 6 位验证码" />
              </div>
              <button class="code-button" type="button" @click="sendEmailRegisterCode">
                {{ emailRegisterPendingCode ? '重新发送' : '发送验证码' }}
              </button>
            </div>
          </label>

          <label>
            <span>登录密钥</span>
            <div class="input-shell">
              <Lock :size="16" />
              <input
                v-model="emailRegisterAccessKey"
                :type="accessKeyVisible ? 'text' : 'password'"
                autocomplete="new-password"
                placeholder="至少 6 个字符"
              />
            </div>
          </label>

          <label>
            <span>确认密钥</span>
            <div class="input-shell">
              <Lock :size="16" />
              <input
                v-model="emailRegisterConfirmKey"
                :type="accessKeyVisible ? 'text' : 'password'"
                autocomplete="new-password"
                placeholder="再次输入登录密钥"
              />
              <button class="icon-button" type="button" @click="accessKeyVisible = !accessKeyVisible">
                <EyeOff v-if="accessKeyVisible" :size="16" />
                <Eye v-else :size="16" />
              </button>
            </div>
          </label>

          <button class="login-submit" type="submit" :disabled="!agreedToTerms">邮箱注册</button>
          <p class="form-note">验证码 10 分钟内有效；注册后可直接用邮箱登录，模型配置和资产会按账号隔离。</p>
        </form>

        <label class="oauth-agree">
          <input v-model="agreedToTerms" type="checkbox" class="oauth-agree-check" />
          <span>我已阅读并同意<a href="#" @click.prevent>《用户协议》</a>和<a href="#" @click.prevent>《隐私政策》</a></span>
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
