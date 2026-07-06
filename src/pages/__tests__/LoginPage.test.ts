import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const loginPagePath = resolve('src/pages/LoginPage.vue')

describe('LoginPage customer style login surface', () => {
  it('renders a MuMu-style split login screen for gotbot', () => {
    const source = readFileSync(loginPagePath, 'utf8')

    expect(source).toContain('基于 AI 的')
    expect(source).toContain('图像视频创作助手')
    expect(source).toContain('欢迎回来')
    expect(source).toContain('本地登录')
    expect(source).toContain('本地注册')
    expect(source).toContain('邮箱登录')
    expect(source).toContain('邮箱注册')
    expect(source).toContain('管理账号')
    expect(source).toContain('访问密钥')
    expect(source).toContain('admin / admin123')
    expect(source).toContain('LinuxDO OAuth')
    expect(source).toContain('store.loginAccount')
    expect(source).toContain('store.loginAccountByIdentifier')
    expect(source).toContain('store.createAccount')
    expect(source).toContain('function registerLocal')
    expect(source).toContain('function registerEmail')
    expect(source).toContain('function loginEmail')
    expect(source).toContain('emailRegisterVerificationCode')
    expect(source).toContain('function sendEmailRegisterCode')
    expect(source).toContain('function verifyEmailRegisterCode')
    expect(source).toContain('发送验证码')
    expect(source).toContain('请输入 6 位验证码')
    expect(source).toContain('验证码 10 分钟内有效')
    expect(source).not.toContain('emailRegisterDisplayName')
    expect(source).not.toContain('默认使用邮箱前缀')
    expect(source).not.toContain('邮箱登录/注册界面已预留')
  })
})
