<script setup lang="ts">
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  BookOpen,
  Eye,
  EyeOff,
  Lock,
  Mail,
  Moon,
  ShieldCheck,
  Sparkles,
  Sun,
  UserPlus,
  UserRound,
  WandSparkles,
  Zap,
} from 'lucide-vue-next'
import { useAppStore } from '@/stores/app'

const store = useAppStore()
const route = useRoute()
const router = useRouter()

const activeTab = ref<'local-login' | 'local-register' | 'email-login' | 'email-register'>('local-login')
const localLoginUsername = ref(store.currentAccount?.username || 'admin')
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
    <div class="theme-switch-mini" aria-label="主题模式">
      <button type="button"><Sun :size="14" /></button>
      <button type="button"><Moon :size="14" /></button>
      <button type="button"><Sparkles :size="14" /></button>
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

          <button class="login-submit" type="submit">登录系统</button>

          <div class="third-party-label">第三方登录</div>
          <button class="oauth-button" type="button" disabled>使用 LinuxDO OAuth 登录</button>
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

          <button class="login-submit" type="submit">创建本地账号</button>
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

          <button class="login-submit" type="submit">邮箱登录</button>
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

          <button class="login-submit" type="submit">邮箱注册</button>
          <p class="form-note">验证码 10 分钟内有效；注册后可直接用邮箱登录，模型配置和资产会按账号隔离。</p>
        </form>

        <div class="login-help">
          <ShieldCheck :size="18" />
          <div>
            <strong>登录说明</strong>
            <ul>
              <li>本地登录默认账号：admin / admin123</li>
              <li>本地注册和邮箱注册都会创建独立工作区。</li>
              <li>邮箱登录使用本机保存的邮箱账号密钥。</li>
            </ul>
          </div>
        </div>
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
  background: #f8f5ef;
  color: #1f2937;
  overflow: hidden;
}

.login-page::before {
  content: "";
  position: absolute;
  inset: 0 50% 0 0;
  background-image:
    linear-gradient(rgba(15, 23, 42, 0.035) 1px, transparent 1px),
    linear-gradient(90deg, rgba(15, 23, 42, 0.035) 1px, transparent 1px);
  background-size: 32px 32px;
  mask-image: linear-gradient(90deg, #000 0%, rgba(0, 0, 0, 0.72) 72%, transparent 100%);
  pointer-events: none;
}

.theme-switch-mini {
  position: absolute;
  top: 28px;
  right: 28px;
  z-index: 3;
  display: inline-flex;
  gap: 4px;
  padding: 5px;
  border: 1px solid rgba(203, 213, 225, 0.7);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.78);
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.08);
}

.theme-switch-mini button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 24px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: #64748b;
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
  color: #334155;
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
  background: linear-gradient(135deg, #6ee7b7, #60a5fa);
  color: #0f172a;
  font-weight: 950;
}

.showcase-copy {
  margin-top: 32px;
}

.showcase-copy h1 {
  margin: 0;
  color: #3f3f46;
  font-size: clamp(42px, 6vw, 76px);
  line-height: 1.08;
  letter-spacing: -0.06em;
}

.showcase-copy h1 span {
  background: linear-gradient(120deg, #0ea5e9, #8b5cf6, #ec4899);
  background-clip: text;
  color: transparent;
}

.showcase-copy p {
  max-width: 760px;
  margin: 22px 0 0;
  color: #7a7f89;
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
  border: 1px solid rgba(226, 232, 240, 0.78);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.58);
  box-shadow: 0 12px 34px rgba(15, 23, 42, 0.035);
}

.feature-grid article svg {
  color: #5b8f96;
}

.feature-grid strong {
  color: #475569;
  font-size: 13px;
  font-weight: 950;
}

.feature-grid span {
  grid-column: 2 / -1;
  color: #8a909b;
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
  border: 1px solid rgba(125, 211, 252, 0.62);
  border-radius: 7px;
  background: rgba(255, 255, 255, 0.66);
  color: #64748b;
  font-size: 11px;
  font-weight: 850;
}

.login-showcase footer {
  position: absolute;
  left: clamp(42px, 7vw, 84px);
  bottom: 26px;
  color: #b0b4bc;
  font-size: 11px;
  font-weight: 800;
}

.login-panel {
  display: grid;
  place-items: center;
  min-height: 100vh;
  padding: clamp(36px, 7vw, 92px);
  background: rgba(248, 245, 239, 0.9);
}

.login-card {
  width: min(100%, 420px);
  display: grid;
  gap: 20px;
}

.login-title h2 {
  margin: 0;
  color: #3f3f46;
  font-size: 25px;
  letter-spacing: -0.04em;
}

.login-title p {
  margin: 6px 0 0;
  color: #8b919d;
  font-size: 13px;
}

.login-tabs {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  border-bottom: 1px solid rgba(203, 213, 225, 0.75);
}

.login-tabs button {
  min-height: 38px;
  border: 0;
  border-bottom: 2px solid transparent;
  background: transparent;
  color: #8b919d;
  font-weight: 900;
  cursor: pointer;
}

.login-tabs button.active {
  border-color: #5b8f96;
  color: #3f3f46;
}

.login-form {
  display: grid;
  gap: 16px;
}

.login-form label {
  display: grid;
  gap: 8px;
  color: #5b616d;
  font-size: 12px;
  font-weight: 950;
}

.login-form label > span::before {
  content: "* ";
  color: #ef4444;
}

.input-shell {
  display: grid;
  grid-template-columns: 18px minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
  min-height: 46px;
  padding: 0 12px;
  border: 1px solid rgba(203, 213, 225, 0.92);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.84);
}

.input-shell input {
  min-width: 0;
  border: 0;
  outline: 0;
  background: transparent;
  color: #334155;
  font: inherit;
}

.input-shell svg {
  color: #94a3b8;
}

.icon-button {
  display: inline-flex;
  border: 0;
  background: transparent;
  color: #94a3b8;
  cursor: pointer;
}

.verification-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 112px;
  gap: 10px;
}

.code-button {
  min-height: 46px;
  border: 1px solid rgba(95, 154, 162, 0.36);
  border-radius: 10px;
  background: rgba(95, 154, 162, 0.1);
  color: #427780;
  font-weight: 950;
  cursor: pointer;
}

.login-submit,
.oauth-button {
  min-height: 46px;
  border: 0;
  border-radius: 10px;
  background: #5f9aa2;
  color: #fff;
  font-weight: 950;
  box-shadow: 0 12px 22px rgba(95, 154, 162, 0.2);
  cursor: pointer;
}

.third-party-label {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  gap: 10px;
  color: #8b919d;
  font-size: 12px;
  font-weight: 850;
  text-align: center;
}

.third-party-label::before,
.third-party-label::after {
  content: "";
  height: 1px;
  background: rgba(203, 213, 225, 0.72);
}

.oauth-button {
  background: #5f9aa2;
  opacity: 0.72;
  cursor: not-allowed;
}

.login-help {
  border: 1px solid rgba(147, 197, 253, 0.78);
  border-radius: 12px;
  background: rgba(239, 246, 255, 0.7);
}

.form-note {
  margin: -4px 0 0;
  color: #64748b;
  font-size: 12px;
  line-height: 1.7;
}

.login-help {
  display: grid;
  grid-template-columns: 20px minmax(0, 1fr);
  gap: 10px;
  padding: 14px;
  color: #64748b;
}

.login-help svg {
  color: #60a5fa;
}

.login-help strong {
  color: #475569;
  font-size: 13px;
}

.login-help ul {
  margin: 8px 0 0;
  padding-left: 18px;
  font-size: 12px;
  line-height: 1.8;
}

.login-footer {
  position: absolute;
  right: 28px;
  bottom: 12px;
  display: inline-flex;
  align-items: center;
  gap: 14px;
  color: #a1a6af;
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
