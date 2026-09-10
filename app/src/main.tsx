import { Buffer } from 'buffer'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// @solana/web3.js and the Anchor client expect a global Buffer in the
// browser. vite-plugin-node-polyfills should already provide one, but this
// is a cheap, explicit fallback in case that ever silently stops working.
if (!(globalThis as { Buffer?: unknown }).Buffer) (globalThis as { Buffer?: unknown }).Buffer = Buffer

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
