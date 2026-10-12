import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => {
  // 本地调试专用: 从 .env.local(不入库)读备用电脑的 AI 服务地址, 仓库中不暴露真实值
  const env = loadEnv(mode, process.cwd(), '');
  const aiProxyTarget = env.LITERT_PROXY_TARGET;

  return {
    plugins: [
      react(),
      VitePWA({
        registerType: 'autoUpdate',
        workbox: {
          navigateFallback: '/index.html',
          // 本地推理的 wasm（21–34MB）不进安装时预缓存：首次在线使用 AI
          // 时由运行时规则缓存，之后离线可用（016）。
          globIgnores: ['**/wasm/**'],
          runtimeCaching: [
            {
              urlPattern: /\/wasm\//,
              handler: 'CacheFirst',
              options: {
                cacheName: 'litert-wasm',
              },
            },
          ],
        },
        manifest: {
          name: 'mind relax',
          short_name: 'mind relax',
          display: 'standalone',
          theme_color: '#b3d7ab',
          background_color: '#f1f6f0',
          icons: [
            {
              src: '/icons/icon-192.png',
              sizes: '192x192',
              type: 'image/png',
            },
            {
              src: '/icons/icon-512.png',
              sizes: '512x512',
              type: 'image/png',
            },
            {
              src: '/icons/maskable-512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
      }),
    ],
    server: {
      proxy: aiProxyTarget
        ? {
            // /v1 转发到备用电脑的 litert-lm serve(经 Tailscale), 浏览器视角同源, 避开 CORS
            '/v1': {
              target: aiProxyTarget,
              changeOrigin: true,
            },
          }
        : undefined,
    },
  };
});
