import { defineConfig } from 'vite'
import { devtools } from '@tanstack/devtools-vite'

import { tanstackStart } from '@tanstack/react-start/plugin/vite'

import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const config = defineConfig({
  resolve: { tsconfigPaths: true },
  plugins: [devtools(), tailwindcss(), tanstackStart(), viteReact()],
  server: {
    port: 3001,
    host: true,
    proxy: {
      '/api': {
        target: 'http://server:3000',
        changeOrigin: true,
      },
      '/trpc': {
        target: 'http://server:3000',
        changeOrigin: true,
      },
    },
  },
  preview: {
    port: 3001,
    host: true,
    allowedHosts: ['biometric.indroic.dev', 'localhost'],
    proxy: {
      '/api': {
        target: 'http://server:3000',
        changeOrigin: true,
      },
      '/trpc': {
        target: 'http://server:3000',
        changeOrigin: true,
      },
    },
  },
})

export default config
