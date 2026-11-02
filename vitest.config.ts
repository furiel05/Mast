import { defineConfig } from 'vitest/config';
import { WxtVitest } from 'wxt/testing/vitest-plugin';

export default defineConfig({
  // browser.* を fakeBrowser（メモリ上の偽物）に差し替える
  plugins: [WxtVitest()],
  test: {
    include: ['src/**/*.test.ts'],
    // 実行するPCのタイムゾーンに結果が左右されないよう固定する
    env: { TZ: 'Asia/Tokyo' },
    restoreMocks: true,
  },
});
