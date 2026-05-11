import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import App from './App.jsx'
import { AppProvider } from './context/AppContext.jsx'
import './index.css'

// 새 버전 배포 시 사용자가 직접 새로고침 (자동 새로고침 제거 — 저장 중 흰 화면 방지)
registerSW({
  onNeedRefresh() {
    // 작업 중 강제 새로고침하지 않음 — 다음 앱 실행 시 자동 적용됨
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
