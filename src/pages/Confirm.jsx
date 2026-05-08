import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useApp } from '../context/AppContext.jsx'
import {
  initGoogleAuth, requestGoogleToken,
  getOrCreateSpreadsheet, appendReceiptRow, uploadReceiptImage
} from '../services/googleApi.js'

function loadGIS() {
  return new Promise((resolve, reject) => {
    if (window.google?.accounts) return resolve()
    const script = document.createElement('script')
    script.src = 'https://accounts.google.com/gsi/client'
    const timer = setTimeout(() => {
      script.remove()
      reject(new Error('Google 서비스 연결 시간 초과'))
    }, 30000)
    script.onload = () => {
      clearTimeout(timer)
      if (window.google?.accounts) resolve()
      else reject(new Error('Google 라이브러리 초기화 실패'))
    }
    script.onerror = () => {
      clearTimeout(timer)
      script.remove()
      reject(new Error('Google 서비스를 불러올 수 없습니다'))
    }
    document.head.appendChild(script)
  })
}

const CATEGORIES = ['식비', '교통', '접대비', '숙박', '소모품', '통신/IT', '의료비', '기타']
const CAT_EMOJI  = { '식비':'🍽️','교통':'🚕','접대비':'🤝','숙박':'🏨','소모품':'📦','통신/IT':'📱','의료비':'🏥','기타':'📄' }

export default function Confirm() {
  const navigate = useNavigate()
  const location = useLocation()
  const { addReceipt, updateReceipt, settings, googleToken, setGoogleToken, showToast } = useApp()

  const { image, extracted } = location.state || {}
  const today = new Date().toISOString().split('T')[0]

  const [form, setForm] = useState({
    date:     extracted?.date     || today,
    merchant: extracted?.merchant || '',
    amount:   extracted?.amount   || '',
    category: extracted?.category || '식비',
    memo:     ''
  })
  const [saving, setSaving] = useState(false)
  const [step,   setStep]   = useState('')

  function set(k, v) { setForm(p => ({ ...p, [k]: v })) }

  async function handleSave() {
    if (!form.merchant.trim()) return showToast('가맹점명을 입력해주세요', 'error')
    const amount = parseInt(String(form.amount).replace(/,/g, ''))
    if (!amount || amount <= 0) return showToast('금액을 입력해주세요', 'error')

    setSaving(true)
    const receipt = addReceipt({ date: form.date, merchant: form.merchant.trim(), amount, category: form.category, memo: form.memo.trim(), image: image || null })

    const clientId = settings.clientId || import.meta.env.VITE_GOOGLE_CLIENT_ID

    if (clientId || googleToken) {
      try {
        let token = googleToken

        // 토큰 없거나 만료됐으면 재인증
        const needAuth = !token
        if (needAuth) {
          setStep('Google 로그인 중...')
          await loadGIS()
          initGoogleAuth(clientId)
          const auth = await requestGoogleToken()
          token = auth.token
          setGoogleToken(token, auth.expiresIn)
        }

        const doUpload = async (t) => {
          setStep('이미지 Drive에 저장 중...')
          let imageUrl = ''
          if (image) imageUrl = await uploadReceiptImage(t, image, receipt)

          setStep('Google Sheets에 기록 중...')
          const year = form.date.split('-')[0]
          const ssId = await getOrCreateSpreadsheet(t, year)
          await appendReceiptRow(t, ssId, { ...receipt, imageUrl })
          return imageUrl
        }

        let imageUrl
        try {
          imageUrl = await doUpload(token)
        } catch (e) {
          // 401 / 토큰 만료 → 재인증 후 재시도
          const expired = e.message.includes('401') || e.message.includes('Invalid Credentials') || e.message.includes('UNAUTHENTICATED') || e.message.includes('invalid_token')
          if (expired) {
            setStep('토큰 갱신 중...')
            await loadGIS()
            initGoogleAuth(clientId)
            const reauth = await requestGoogleToken()
            token = reauth.token
            setGoogleToken(token, reauth.expiresIn)
            imageUrl = await doUpload(token)
          } else {
            throw e
          }
        }

        updateReceipt(receipt.id, { synced: true, imageUrl })
        showToast('☁️ Drive & Sheets 저장 완료!', 'success')
      } catch (e) {
        showToast(`저장 실패: ${e.message}`, 'error')
      }
    } else {
      showToast('로컬에 저장됐습니다', 'default')
    }

    setSaving(false); setStep('')
    navigate('/', { replace: true })
  }

  const clientId = settings.clientId || import.meta.env.VITE_GOOGLE_CLIENT_ID

  return (
    <div className="page" style={{ background: '#f9fafb' }}>
      <div className="page-header">
        <button onClick={() => navigate(-1)}
          style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#374151' }}>←</button>
        <h1>내용 확인</h1>
        <div style={{ width: 36 }} />
      </div>

      <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {image && (
          <div className="card" style={{ overflow: 'hidden' }}>
            <img src={image} alt="영수증"
              style={{ width: '100%', maxHeight: 200, objectFit: 'contain', background: '#f3f4f6' }} />
          </div>
        )}

        {extracted && (
          <div style={{ background: '#d1fae5', borderRadius: 12, padding: '10px 14px',
            fontSize: 12, color: '#065f46', display: 'flex', alignItems: 'center', gap: 8 }}>
            🤖 AI가 자동 인식했습니다. 내용을 확인하고 저장하세요.
          </div>
        )}

        <div className="card" style={{ padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="form-group">
            <label className="form-label">날짜</label>
            <input type="date" className="form-input" value={form.date} onChange={e => set('date', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">가맹점명 *</label>
            <input className="form-input" placeholder="예: 맛있는 식당"
              value={form.merchant} onChange={e => set('merchant', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">금액 (원) *</label>
            <input type="number" inputMode="numeric" className="form-input" placeholder="0"
              value={form.amount} onChange={e => set('amount', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">카테고리</label>
            <select className="form-input form-select" value={form.category} onChange={e => set('category', e.target.value)}>
              {CATEGORIES.map(c => <option key={c} value={c}>{CAT_EMOJI[c]} {c}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">메모 (선택)</label>
            <input className="form-input" placeholder="예: 거래처 A사 미팅"
              value={form.memo} onChange={e => set('memo', e.target.value)} />
          </div>
        </div>

        {!clientId && !googleToken && (
          <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 12,
            padding: '12px 14px', fontSize: 12, color: '#92400e' }}>
            💡 Google 연결 전입니다. 로컬에만 저장됩니다.
            <button onClick={() => navigate('/settings')}
              style={{ background: 'none', border: 'none', color: '#d97706', fontWeight: 700, cursor: 'pointer', fontSize: 12, marginLeft: 4 }}>
              설정 →
            </button>
          </div>
        )}

        <button className="btn btn-primary btn-full" style={{ padding: '16px', fontSize: 16 }}
          disabled={saving} onClick={handleSave}>
          {saving ? (
            <span style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center' }}>
              <div className="spinner" />{step || '저장 중...'}
            </span>
          ) : `💾 저장${clientId || googleToken ? ' & Drive 업로드' : ''}`}
        </button>
      </div>
    </div>
  )
}
