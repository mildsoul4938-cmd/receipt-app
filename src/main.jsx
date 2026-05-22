import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import App from './App.jsx'
import { AppProvider } from './context/AppContext.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import './index.css'

// 새 버전 감지 시 업데이트 배너 표시
const updateSW = registerSW({
  onNeedRefresh() {
    const banner = document.createElement('div')
    banner.id = 'update-banner'
    banner.style.cssText = [
      'position:fixed', 'bottom:80px', 'left:50%', 'transform:translateX(-50%)',
      'background:#059669', 'color:white', 'padding:12px 22px', 'border-radius:24px',
      'font-size:14px', 'font-weight:700', 'z-index:9999', 'cursor:pointer',
      'white-space:nowrap', 'box-shadow:0 4px 20px rgba(0,0,0,0.3)',
      'font-family:-apple-system,BlinkMacSystemFont,sans-serif'
    ].join(';')
    banner.textContent = '🔄 새 버전 업데이트'
    banner.onclick = () => { banner.textContent = '업데이트 중...'; updateSW(true) }
    document.body.appendChild(banner)
  },
  onOfflineReady() {}
})

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <AppProvider>
        <App />
      </AppProvider>
    </ErrorBoundary>
  </StrictMode>
)
