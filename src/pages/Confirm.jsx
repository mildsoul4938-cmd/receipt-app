import { useState, useRef } from 'react'
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

const CATEGORIES = ['식사', '교통', '접대비', '숙박', '소모품', '통신/IT', '의료비', '사무 장비', '기타']
const CAT_EMOJI  = { '식사':'🍽️','교통':'🚕','접대비':'🤝','숙박':'🏨','소모품':'📦','통신/IT':'📱','의료비':'🏥','사무 장비':'🖥️','기타':'📄' }

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
    category: extracted?.category || '식사',
    memo:     ''
  })
  const [saving,     setSaving]    = useState(false)
  const [step,       setStep]      = useState('')
  const [cloudError, setCloudError] = useState('')
  const savedReceipt  = useRef(null)  // 재시도 시 중복 로컬 저장 방지
  const sheetsWritten = useRef(false) // Drive만 실패 시 재시도해도 Sheets 중복 방지

  function set(k, v) { setForm(p => ({ ...p, [k]: v })) }

  async function handleSave() {
    if (!form.merchant.trim()) return showToast('가맹점명을 입력해주세요', 'error')
    const amount = parseInt(String(form.amount).replace(/,/g, ''))
    if (!amount || amount <= 0) return showToast('금액을 입력해주세요', 'error')

    setSaving(true)
    setCloudError('')

    // 재시도 시 중복 저장 방지 — 이미 로컬에 저장한 영수증 재사용
    let receipt = savedReceipt.current
    if (!receipt) {
      receipt = addReceipt({ date: form.date, merchant: form.merchant.trim(), amount, category: form.category, memo: form.memo.trim(), image: image || null })
      savedReceipt.current = receipt
    }

    const clientId = settings.clientId || import.meta.env.VITE_GOOGLE_CLIENT_ID

    if (clientId || googleToken) {
      try {
        let token = googleToken

        if (!token) {
          setStep('Google 로그인 중...')
          await loadGIS()
          initGoogleAuth(clientId)
          const auth = await requestGoogleToken()
          token = auth.token
          setGoogleToken(token, auth.expiresIn)
        }

        // ── 토큰으로 업로드 시도, 401이면 재인증 ──────────────────
        async function tryUpload(t) {
          // 1) Drive 이미지 업로드 (실패해도 Sheets는 계속 진행)
          setStep('이미지 Drive에 저장 중...')
          let imageUrl = ''
          let driveErr = ''
          if (image) {
            try {
              imageUrl = await uploadReceiptImage(t, image, receipt)
            } catch (e) {
              driveErr = e.message
            }
          }

          // 2) Sheets 기록 — Drive만 실패 후 재시도 시 중복 방지
          if (!sheetsWritten.current) {
            setStep('Google Sheets에 기록 중...')
            const year = form.date.split('-')[0]
            const ssId = await getOrCreateSpreadsheet(t, year)
            await appendReceiptRow(t, ssId, { ...receipt, imageUrl })
            sheetsWritten.current = true
          }

          return { imageUrl, driveErr }
        }

        let result
        try {
          result = await tryUpload(token)
        } catch (e) {
          const expired = /401|Invalid Credentials|UNAUTHENTICATED|invalid_token/i.test(e.message)
          if (expired) {
            setStep('토큰 갱신 중...')
            await loadGIS()
            initGoogleAuth(clientId)
            const reauth = await requestGoogleToken()
            token = reauth.token
            setGoogleToken(token, reauth.expiresIn)
            result = await tryUpload(token)
          } else {
            throw e
          }
        }

        updateReceipt(receipt.id, { synced: true, imageUrl: result.imageUrl })

        if (result.driveErr) {
          // Sheets는 성공, Drive만 실패
          setCloudError(`Drive 업로드 실패: ${result.driveErr}`)
          setSaving(false); setStep('')
          return   // 페이지 이동 안 함 — 에러 화면에 표시
        }
        showToast('☁️ Drive & Sheets 저장 완료!', 'success')

      } catch (e) {
        setCloudError(`저장 실패: ${e.message}`)
        setSaving(false); setStep('')
        return
      }
    } else {
      showToast('로컬에 저장됐습니다', 'default')
    }

    setSaving(false); setStep('')
    savedReceipt.current  = null
    sheetsWritten.current = false
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

        {/* ── 클라우드 오류 표시 (사라지지 않고 화면에 유지) ── */}
        {cloudError && (
          <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 12, padding: '14px 16px' }}>
            <div style={{ fontWeight: 700, color: '#dc2626', fontSize: 13, marginBottom: 6 }}>⚠️ 업로드 오류</div>
            <div style={{ fontSize: 12, color: '#7f1d1d', wordBreak: 'break-all', lineHeight: 1.6 }}>{cloudError}</div>
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button onClick={() => { setCloudError(''); handleSave() }}
                style={{ flex: 1, padding: '9px 0', background: '#dc2626', border: 'none', borderRadius: 8, color: 'white', fontSize: 13, cursor: 'pointer', fontWeight: 600 }}>
                재시도
              </button>
              <button onClick={() => { setCloudError(''); navigate('/', { replace: true }) }}
                style={{ flex: 1, padding: '9px 0', background: '#f3f4f6', border: 'none', borderRadius: 8, color: '#374151', fontSize: 13, cursor: 'pointer' }}>
                로컬 저장만
              </button>
            </div>
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
