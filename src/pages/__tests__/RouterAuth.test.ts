import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const routerPath = resolve('src/router.ts')
const appPath = resolve('src/App.vue')

describe('router local auth gate', () => {
  it('registers a shell-free login route and protects private pages', () => {
    const routerSource = readFileSync(routerPath, 'utf8')
    const appSource = readFileSync(appPath, 'utf8')

    expect(routerSource).toContain("path: '/login'")
    expect(routerSource).toContain('meta: { public: true, shell: false }')
    expect(routerSource).toContain('router.beforeEach')
    expect(routerSource).toContain('!store.isAuthenticated')
    expect(routerSource).not.toContain("path: '/accounts'")
    expect(appSource).toContain('route.meta.shell !== false')
    expect(appSource).toContain('<RouterView v-else />')
  })
})
