import { createContext, useContext, useState, useEffect, useCallback } from 'react'

const AppContext = createContext()

export function AppProvider({ children }) {
  const [receipts, setReceipts] = useState(() => {
    try { return JSON.parse(localStorage.getItem('receipts') || '[]') }
    catch { return [] }
  })

  const [settings, setSettingsState] = useState(() => {
    try { return JSON.parse(localStorage.getItem('settings') || '{}') }
    catch { return {} }
  })

  const [googleToken, setGoogleTokenState] = useState(() =>
    sessionStorage.getItem('googleToken') || null
  )

  const [toast, setToastState] = useState(null)

  useEffect(() => { localStorage.setItem('receipts', JSON.stringify(receipts)) }, [receipts])
  useEffect(() => { localStorage.setItem('settings', JSON.stringify(settings)) }, [settings])
  useEffect(() => {
    if (googleToken) sessionStorage.setItem('googleToken', googleToken)
    else sessionStorage.removeItem('googleToken')
  }, [googleToken])

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

  const setGoogleToken = useCallback((token) => {
    setGoogleTokenState(token)
  }, [])

  return (
    <AppContext.Provider value={{
      receipts, addReceipt, updateReceipt, deleteReceipt,
      settings, updateSettings,
      googleToken, setGoogleToken,
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
