import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Auto-recover from stale chunk references after a new deploy.
// When a tab was opened before an update, its lazy-loaded route chunks point at
// hashed filenames that no longer exist on the server. Vite emits this event
// when such a dynamic import fails; reloading fetches the fresh (no-cache)
// index.html and its new chunk hashes. The timestamp guard prevents a reload
// loop if the chunk is genuinely missing rather than just stale.
window.addEventListener('vite:preloadError', () => {
  const KEY = 'chunk-reload-at'
  const last = Number(sessionStorage.getItem(KEY) || 0)
  if (Date.now() - last > 10_000) {
    sessionStorage.setItem(KEY, String(Date.now()))
    window.location.reload()
  }
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
