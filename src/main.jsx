import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import App from './App.jsx'
import { AppProvider } from './context/AppContext.jsx'
import './index.css'

// 새 버전 배포 시 자동으로 페이지 새로고침
registerSW({
  onNeedRefresh() {
    // 새 서비스 워커가 준비되면 즉시 페이지 새로고침
    window.location.reload()
  },
  onOfflineReady() {}
})

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AppProvider>
      <App />
    </AppProvider>
  </StrictMode>
)
