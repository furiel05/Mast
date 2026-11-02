import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  // 自動インポートは使わず、どこから来た関数かをimport文で明示する
  imports: false,
  manifest: {
    name: 'Mast',
    description: 'Watch-time limits for YouTube',
    permissions: ['storage'],
  },
});
