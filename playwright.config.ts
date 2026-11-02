import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  // 拡張機能のビルド（.output/chrome-mv3）を読み込んで動かすため、先に `wxt build` が必要
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    trace: 'retain-on-failure',
  },
});
