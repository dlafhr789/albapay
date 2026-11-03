import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // 개발 중에는 로컬 API 서버(pnpm --filter @albapay/api dev)로 넘긴다. 배포하면 CloudFront가 같은 일을 한다.
    proxy: { '/api': 'http://127.0.0.1:8787' },
  },
  build: {
    // 배포 CSP가 인라인 스크립트를 막으므로, 작은 자원도 data: URL로 넣지 않고 파일로 낸다.
    assetsInlineLimit: 0,
  },
});
