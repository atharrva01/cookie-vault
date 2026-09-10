import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { nodePolyfills } from 'vite-plugin-node-polyfills'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    // @solana/web3.js and the Anchor client expect Node's Buffer global.
    nodePolyfills({ include: ['buffer'] }),
    react(),
  ],
})
