import { defineConfig } from '@playwright/test'

const baseURL = 'http://127.0.0.1:4178'

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.e2e.ts',
  use: {
    baseURL,
    channel: process.env.PLAYBOOK_BROWSER_CHANNEL,
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 4178 --strictPort',
    url: baseURL,
  },
})
