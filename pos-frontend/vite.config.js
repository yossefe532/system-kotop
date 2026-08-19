import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.js'],
    include: ['src/**/*.{test,spec}.{js,jsx,ts,tsx}'],
    exclude: ['e2e/**', '../e2e/**', 'playwright.config.js', '../playwright.config.js', 'node_modules/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
    },
  },
})
