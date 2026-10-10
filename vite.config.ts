import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'path'

/** Unusual port on purpose, so it never clashes with another project's dev server. */
const DEV_PORT = 47173

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: DEV_PORT, strictPort: true },
  preview: { port: DEV_PORT, strictPort: true },
  resolve: {
    alias: { '@': resolve(__dirname, 'src') },
  },
})
