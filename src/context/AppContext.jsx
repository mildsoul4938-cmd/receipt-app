import { createContext, useContext, useState, useEffect, useCallback } from 'react'

const AppContext = createContext()

const TOKEN_KEY  = 'googleToken'
const EXPIRY_KEY = 'googleTokenExpiry'

// 저장된 토큰이 아직 유효하면 반환, 아니면 null
function loadStoredToken() {
  try {
    const token  = localStorage.getItem(TOKEN_KEY)
    const expiry = Number(localStorage.getItem(EXPIRY_KEY))
    // 만료 2분 전부터는 만료로 처리
    if (token && expiry && Date.now() < expiry - 120_000) return token
  } catch {}
  return null
}

export function AppProvider({ children }) {
  const [receipts, setReceipts] = useState(() => {
    try { return JSON.parse(localStorage.getItem('receipts') || '[]') }
    catch { return [] }
  })

  const [settings, setSettingsState] = useState(() => {
    try { return JSON.parse(localStorage.getItem('settings') || '{}') }
    catch { return {} }
  })

  // 앱 시작 시 저장된 토큰 복원
  const [googleToken, setGoogleTokenState] = useState(() => loadStoredToken())

  const [toast, setToastState] = useState(null)

  useEffect(() => { localStorage.setItem('receipts', JSON.stringify(receipts)) }, [receipts])
  useEffect(() => { localStorage.setItem('settings', JSON.stringify(settings)) }, [settings])

  const showToast = useCallback((message, type = 'default') => {
    setToastState({ message, type, id: Date.now() })
    setTimeout(() => setToastState(null), 3500)
  }, [])

  const addReceipt = useCallback((receipt) => {
    const newReceipt = { ...receipt, id: Date.now(), createdAt: new Date().toISOString(), synced: false }
    setReceipts(prev => [newReceipt, ...prev])
    return newReceipt
  }, [])

  const updateReceipt = useCallback((id, updates) => {
    setReceipts(prev => prev.map(r => r.id === id ? { ...r, ...updates } : r))
  }, [])

  const deleteReceipt = useCallback((id) => {
    setReceipts(prev => prev.filter(r => r.id !== id))
  }, [])

  const updateSettings = useCallback((updates) => {
    setSettingsState(prev => ({ ...prev, ...updates }))
  }, [])

  // token: 문자열 | null,  expiresIn: 초 (기본 3600 = 1시간)
  const setGoogleToken = useCallback((token, expiresIn = 3600) => {
    setGoogleTokenState(token)
    if (token) {
      localStorage.setItem(TOKEN_KEY,  token)
      localStorage.setItem(EXPIRY_KEY, String(Date.now() + expiresIn * 1000))
    } else {
      localStorage.removeItem(TOKEN_KEY)
      localStorage.removeItem(EXPIRY_KEY)
    }
  }, [])

  // 만료까지 남은 시간(분) — Settings 표시용
  const tokenExpiresInMin = useCallback(() => {
    const expiry = Number(localStorage.getItem(EXPIRY_KEY))
    if (!expiry) return 0
    return Math.max(0, Math.round((expiry - Date.now()) / 60_000))
  }, [])

  return (
    <AppContext.Provider value={{
      receipts, addReceipt, updateReceipt, deleteReceipt,
      settings, updateSettings,
      googleToken, setGoogleToken, tokenExpiresInMin,
      toast, showToast
    }}>
      {children}
      {toast && (
        <div key={toast.id} className={`toast ${toast.type}`}>{toast.message}</div>
      )}
    </AppContext.Provider>
  )
}

export const useApp = () => useContext(AppContext)
