import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  outDir: 'dist',

  dev: {
    server: {
      port: 3003,
      hostname: 'localhost',
    },
  },

  manifest: {
    name: 'NotebookLM Importer - 社群版',
    description: '一键导入网页、YouTube视频、播放列表、RSS到NotebookLM（需订阅「绿皮火车」频道解锁）',
    version: '1.0.0',
    permissions: [
      'storage',
      'activeTab',
      'tabs',
      'identity',
      'scripting',
    ],
    host_permissions: [
      'https://notebooklm.google.com/*',
      'https://www.googleapis.com/*',
      'https://www.youtube.com/*',
    ],
    oauth2: {
      client_id: 'YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com',
      scopes: [
        'https://www.googleapis.com/auth/youtube.readonly',
      ],
    },
    action: {
      default_title: 'NotebookLM Importer',
      default_popup: 'popup.html',
    },
    icons: {
      '16': 'icons/icon-16.png',
      '48': 'icons/icon-48.png',
      '128': 'icons/icon-128.png',
    },
  },

  vite: ({ mode }) => ({
    define: {
      'process.env': '{}',
      'process.env.NODE_ENV': mode === 'development' ? '"development"' : '"production"',
    },
  }),
});
