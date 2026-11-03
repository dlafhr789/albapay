import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // 새 버전을 배포하면 다음에 앱을 열 때 서비스 워커가 바로 바꾼다. 사용자 한 명이라 새로 고침 안내를 띄우지 않는다.
      registerType: 'autoUpdate',
      // CSP가 인라인 스크립트를 막으므로, 서비스 워커 등록 코드를 별도 파일(registerSW.js)로 낸다.
      injectRegister: 'script',
      manifest: {
        name: '알바페이',
        short_name: '알바페이',
        description: '아르바이트 근무 기록과 급여 계산',
        lang: 'ko',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#F4F5F7',
        theme_color: '#F4F5F7',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // 앱 화면(HTML, JS, CSS, 아이콘)만 미리 받아 둔다. 한글 폰트는 조각이 수백 개라 쓰는 조각만 처음 쓸 때 저장한다.
        globPatterns: ['**/*.{js,css,html,png,svg,webmanifest}'],
        navigateFallback: '/index.html',
        // API 응답은 개인 급여 정보이고 서버도 no-store로 보낸다. 서비스 워커가 가로채지 않는다.
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.origin === self.location.origin && url.pathname.endsWith('.woff2'),
            handler: 'CacheFirst',
            options: { cacheName: 'fonts', expiration: { maxEntries: 400 } },
          },
        ],
      },
    }),
  ],
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
