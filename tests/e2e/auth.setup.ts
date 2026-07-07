import fs from 'node:fs'
import path from 'node:path'

// 全局前置：为 E2E 准备已登录状态。
// 应用路由守卫（src/router.ts）会拦截未登录的受保护页面并跳转到 /login，
// 但现有 E2E 用例只注入了任务数据（samimage.v3.state），从不注入鉴权态，
// 导致每个用例都被重定向到登录页而全部超时。这里通过 storageState 注入
// gotbot.auth.v1 的 isAuthenticated:true，使受保护路由可用。
const authFile = path.join(__dirname, '.auth', 'user.json')

async function globalSetup(): Promise<void> {
  const state = {
    cookies: [],
    origins: [
      {
        origin: 'http://127.0.0.1:3030',
        localStorage: [
          { name: 'gotbot.auth.v1', value: JSON.stringify({ isAuthenticated: true }) },
        ],
      },
    ],
  }
  fs.mkdirSync(path.dirname(authFile), { recursive: true })
  fs.writeFileSync(authFile, JSON.stringify(state, null, 2))
}

export default globalSetup
