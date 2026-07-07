import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const aboutPagePath = resolve('src/pages/AboutPage.vue')
const zhCnLocalePath = resolve('src/i18n/locales/zh-CN.ts')

const source = readFileSync(aboutPagePath, 'utf8') + '\n' + readFileSync(zhCnLocalePath, 'utf8')

describe('AboutPage brand information', () => {
  it('shows private mobile brand information without public contact links', () => {
    expect(source).toContain('道听徒说')
    expect(source).toContain('about-logo">L')
    expect(source).toContain('AI 图像视频创作')
    expect(source).toContain('微信小程序 + 手机应用')
    expect(source).toContain('API Key 保存在本地')

    expect(source).not.toContain('作者信息')
    expect(source).not.toContain('Samuel游')
    expect(source).not.toContain('malovoz')
    expect(source).not.toContain('github.com/SamuelYooo/sam-image-app')
    expect(source).not.toContain('求 star 哦')
    expect(source).not.toContain('authorGithubUrl')
    expect(source).not.toContain('openExternalLink')
  })
})
