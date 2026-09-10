import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { nodePolyfills } from 'vite-plugin-node-polyfills'

// https://vite.dev/config/
export default defineConfig({
  // Relative, not '/cookie-vault/' hardcoded — works whether this deploys to
  // a GitHub Pages project page (a subpath), Vercel/Netlify (domain root),
  // or the repo ever gets renamed, with no config change needed either way.
  base: './',
  plugins: [
    // @solana/web3.js and the Anchor client expect Node's Buffer global.
    nodePolyfills({ include: ['buffer'] }),
    react(),
  ],
})
