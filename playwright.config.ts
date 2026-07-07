import { defineConfig, devices } from '@playwright/test'
import path from 'node:path'

const authFile = path.join(__dirname, 'tests', 'e2e', '.auth', 'user.json')

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  globalSetup: './tests/e2e/auth.setup.ts',
  webServer: {
    command: 'npm run dev',
    url: 'http://127.0.0.1:3030',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
  use: {
    baseURL: 'http://127.0.0.1:3030',
    storageState: authFile,
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
  ],
})
