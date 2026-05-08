import { useState } from 'react'
import { useApp } from '../context/AppContext.jsx'
import { initGoogleAuth, requestGoogleToken, revokeToken } from '../services/googleApi.js'

function loadGIS() {
  return new Promise((resolve, reject) => {
    // 이미 로드된 경우
    if (window.google?.accounts) return resolve()

    // 새 스크립트 태그로 동적 로드 (onload/onerror 로 정확히 감지)
    const script = document.createElement('script')
    script.src = 'https://accounts.google.com/gsi/client'

    const timer = setTimeout(() => {
      script.remove()
      reject(new Error('Google 서비스 연결 시간 초과. 인터넷 연결을 확인해주세요.'))
    }, 30000)

    script.onload = () => {
      clearTimeout(timer)
      if (window.google?.accounts) resolve()
      else reject(new Error('Google 라이브러리 초기화 실패. 페이지를 새로고침해주세요.'))
    }
    script.onerror = () => {
      clearTimeout(timer)
      script.remove()
      reject(new Error('Google 서비스를 불러올 수 없습니다. 인터넷 연결을 확인해주세요.'))
    }

    document.head.appendChild(script)
  })
}

export default function Settings() {
  const { settings, updateSettings, googleToken, setGoogleToken, tokenExpiresInMin, showToast } = useApp()

  const builtInClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID
  const [clientId, setClientId] = useState(settings.clientId || '')
  const [connecting, setConnecting] = useState(false)
  const [showClientIdInput, setShowClientIdInput] = useState(false)

  const effectiveClientId = builtInClientId || clientId || settings.clientId

  async function handleConnect() {
    if (!effectiveClientId) {
      setShowClientIdInput(true)
      showToast('Client ID를 먼저 입력해주세요', 'error')
      return
    }
    setConnecting(true)
    try {
      await loadGIS()
      if (clientId) updateSettings({ clientId })
      initGoogleAuth(effectiveClientId)
      const { token, expiresIn } = await requestGoogleToken()
      setGoogleToken(token, expiresIn)
      showToast('✅ Google 계정이 연결됐습니다!', 'success')
    } catch (e) {
      showToast(`연결 실패: ${e.message}`, 'error')
    } finally {
      setConnecting(false)
    }
  }

  function handleDisconnect() {
    revokeToken(googleToken)
    setGoogleToken(null)
    showToast('Google 계정 연결을 해제했습니다')
  }

  function handleSaveClientId() {
    updateSettings({ clientId })
    showToast('저장됐습니다', 'success')
  }

  return (
    <div className="page">
      <div className="page-header"><h1>설정</h1><div /></div>

      <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* Google 연결 카드 */}
        <div className="card" style={{ padding: '20px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
            <div style={{ fontSize: 40 }}>☁️</div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700 }}>Google 계정</div>
              <div style={{ fontSize: 13, color: googleToken ? '#059669' : '#9ca3af', marginTop: 2 }}>
                {googleToken
                  ? `✅ 연결됨 — 약 ${tokenExpiresInMin()}분 후 만료`
                  : '미연결 — 저장 시 자동으로 연결됩니다'}
              </div>
            </div>
          </div>

          {googleToken ? (
            <button className="btn btn-danger btn-full" onClick={handleDisconnect}>
              🔌 연결 해제
            </button>
          ) : (
            <button className="btn btn-primary btn-full" disabled={connecting} onClick={handleConnect}>
              {connecting
                ? <span style={{ display:'flex',alignItems:'center',gap:8,justifyContent:'center' }}><div className="spinner"/>연결 중...</span>
                : '🔗 Google 계정 연결'}
            </button>
          )}
        </div>

        {/* Google 연결 시 효과 */}
        {!googleToken && (
          <div className="card" style={{ padding: '16px' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#374151', marginBottom: 12 }}>
              연결하면 자동으로 됩니다
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[
                ['📊', 'Google Sheets 자동 생성', '연도별 스프레드시트, 월별 시트 자동 생성'],
                ['🖼️', 'Drive 이미지 자동 저장', '영수증 사진을 연/월 폴더에 자동 정리'],
                ['🔄', '실시간 동기화', '저장 즉시 Google 계정에 반영'],
              ].map(([icon, title, desc]) => (
                <div key={title} style={{ display: 'flex', gap: 10 }}>
                  <span style={{ fontSize: 20 }}>{icon}</span>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>{title}</div>
                    <div style={{ fontSize: 11, color: '#9ca3af' }}>{desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Client ID 입력 (빌트인 ID 없을 때만 표시) */}
        {!builtInClientId && (
          <div className="card" style={{ padding: '16px' }}>
            <button onClick={() => setShowClientIdInput(p => !p)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', width: '100%',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#374151' }}>⚙️ 고급 설정 (Client ID)</div>
              <span style={{ color: '#9ca3af', fontSize: 16, transform: showClientIdInput ? 'rotate(180deg)' : 'none', transition: '0.2s' }}>▾</span>
            </button>
            {showClientIdInput && (
              <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ fontSize: 12, color: '#9ca3af', lineHeight: 1.6 }}>
                  Google Cloud Console에서 발급한 OAuth 2.0 클라이언트 ID를 입력하세요.<br/>
                  <a href="https://console.cloud.google.com" target="_blank" rel="noreferrer"
                    style={{ color: '#059669' }}>console.cloud.google.com →</a>
                </div>
                <input className="form-input" placeholder="xxxxx.apps.googleusercontent.com"
                  value={clientId} onChange={e => setClientId(e.target.value)} />
                <button className="btn btn-primary btn-full" onClick={handleSaveClientId}>저장</button>
              </div>
            )}
          </div>
        )}

        <div style={{ textAlign: 'center', color: '#d1d5db', fontSize: 12, paddingBottom: 8 }}>
          영수증 정리기 v0.2.0
        </div>
      </div>
    </div>
  )
}
