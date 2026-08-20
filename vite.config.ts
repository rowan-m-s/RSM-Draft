import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// `base` must match the GitHub repo name or every asset 404s on Pages and the
// page renders white. Override with VITE_BASE if the repo is ever renamed.
const base = process.env.VITE_BASE ?? '/RSM-Draft/'

export default defineConfig({
  base,
  plugins: [react(), tailwindcss()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
