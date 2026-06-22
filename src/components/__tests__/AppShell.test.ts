import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const appShellPath = resolve('src/components/AppShell.vue')

describe('AppShell brand shell', () => {
  it('uses the private mobile brand instead of SamImage branding', () => {
    const source = readFileSync(appShellPath, 'utf8')

    expect(source).toContain('brand-mark">L')
    expect(source).toContain('道听徒说')
    expect(source).toContain('AI 图像视频创作')
    expect(source).not.toContain('SamImage')
    expect(source).not.toContain('本地 AI 生图')
  })
})
