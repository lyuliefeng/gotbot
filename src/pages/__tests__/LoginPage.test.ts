import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const loginPagePath = resolve('src/pages/LoginPage.vue')
const zhLocalePath = resolve('src/i18n/locales/zh-CN.ts')

describe('LoginPage customer style login surface', () => {
  it('renders a MuMu-style split login screen for gotbot', () => {
    const source = readFileSync(loginPagePath, 'utf8')
    const zh = readFileSync(zhLocalePath, 'utf8')

    // i18n wiring: copy lives in locale files, referenced via t('login.*')
    expect(source).toContain("t('login.welcome')")
    expect(source).toContain("t('login.tabLocalLogin')")
    expect(source).toContain("t('login.tabEmailLogin')")

    // Chinese copy preserved in the zh-CN locale
    expect(zh).toContain('基于 AI 的')
    expect(zh).toContain('图像视频创作助手')
    expect(zh).toContain('欢迎回来')
    expect(zh).toContain('本地登录')
    expect(zh).toContain('本地注册')
    expect(zh).toContain('邮箱登录')
    expect(zh).toContain('邮箱注册')
    expect(zh).toContain('管理账号')
    expect(zh).toContain('访问密钥')
    expect(zh).toContain('我已阅读并同意')
    expect(zh).toContain('发送验证码')
    expect(zh).toContain('请输入 6 位验证码')
    expect(zh).toContain('验证码 10 分钟内有效')

    // login logic still present
    expect(source).toContain('store.loginAccount')
    expect(source).toContain('store.loginAccountByIdentifier')
    expect(source).toContain('store.createAccount')
    expect(source).toContain('function registerLocal')
    expect(source).toContain('function registerEmail')
    expect(source).toContain('function loginEmail')
    expect(source).toContain('emailRegisterVerificationCode')
    expect(source).toContain('function sendEmailRegisterCode')
    expect(source).toContain('function verifyEmailRegisterCode')

    // removed legacy copy should be gone
    expect(source).not.toContain('emailRegisterDisplayName')
    expect(source).not.toContain('默认使用邮箱前缀')
    expect(source).not.toContain('邮箱登录/注册界面已预留')
  })
})
