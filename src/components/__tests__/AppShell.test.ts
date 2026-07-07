import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const appShellPath = resolve('src/components/AppShell.vue')
const zhCnLocalePath = resolve('src/i18n/locales/zh-CN.ts')

// Source includes both the .vue file and the zh-CN locale catalog so that
// assertions like `toContain('中文文案')` still match after i18n migration.
const source = readFileSync(appShellPath, 'utf8') + '\n' + readFileSync(zhCnLocalePath, 'utf8')

describe('AppShell brand shell', () => {
  it('uses the private mobile brand instead of SamImage branding', () => {
    expect(source).toContain('brand-mark">L')
    expect(source).toContain('道听徒说')
    expect(source).toContain('AI 图像视频创作')
    expect(source).not.toContain("import AccountSwitcher from '@/components/AccountSwitcher.vue'")
    expect(source).not.toContain('<AccountSwitcher />')
    expect(source).not.toContain("{ to: '/accounts', label: '账号'")
    expect(source).not.toContain('SamImage')
    expect(source).not.toContain('本地 AI 生图')
  })
})
