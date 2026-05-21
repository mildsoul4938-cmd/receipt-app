import { useState } from 'react'
import { useApp } from '../context/AppContext.jsx'
import {
  initGoogleAuth, requestGoogleToken,
  getOrCreateSpreadsheet, appendReceiptRow, uploadReceiptImage
} from '../services/googleApi.js'

const CAT_EMOJI = {
  '식사':'🍽️','간식':'🍩','회식':'🥂','사무 장비':'🖥️',
  '소모품':'📦','교통비':'🚕','디지털 상품':'💾','PC 및 부품':'🖱️','워크샵':'📋'
}

const CATEGORIES = ['식사', '간식', '회식', '사무 장비', '소모품', '교통비', '디지털 상품', 'PC 및 부품', '워크샵']

function loadGIS() {
  return new Promise((resolve, reject) => {
    if (window.google?.accounts) return resolve()
    const script = document.createElement('script')
    script.src = 'https://accounts.google.com/gsi/client'
    const timer = setTimeout(() => { script.remove(); reject(new Error('Google 연결 시간 초과')) }, 30000)
    script.onload = () => { clearTimeout(timer); window.google?.accounts ? resolve() : reject(new Error('Google 초기화 실패')) }
    script.onerror = () => { clearTimeout(timer); script.remove(); reject(new Error('Google 로드 실패')) }
    document.head.appendChild(script)
  })
}

export default function ReceiptCard({ receipt }) {
  const { updateReceipt, deleteReceipt, showToast, googleToken, setGoogleToken, settings } = useApp()
  const [editing, setEditing] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [form, setForm] = useState({
    date:       receipt.date,
    merchant:   receipt.merchant,
    amount:     receipt.amount,
    category:   receipt.category,
    cardHolder: receipt.cardHolder || '',
    memo:       receipt.memo || ''
  })

  const emoji = CAT_EMOJI[receipt.category] || '📄'

  function handleSave() {
    updateReceipt(receipt.id, {
      ...form,
      amount: parseInt(String(form.amount).replace(/,/g, '')) || 0
    })
    setEditing(false)
    showToast('수정되었습니다', 'success')
  }

  function handleDelete() {
    deleteReceipt(receipt.id)
    showToast('삭제되었습니다')
    setConfirmDelete(false)
  }

  async function handleUpload() {
    const clientId = settings.clientId || import.meta.env.VITE_GOOGLE_CLIENT_ID
    if (!clientId && !googleToken) {
      showToast('설정에서 Google 계정을 먼저 연결해주세요', 'error')
      return
    }
    setUploading(true)
    try {
      let token = googleToken
      if (!token) {
        await loadGIS()
        initGoogleAuth(clientId)
        const auth = await requestGoogleToken()
        token = auth.token
        setGoogleToken(token, auth.expiresIn)
      }

      // Drive 이미지 업로드 (이미지 있고 아직 업로드 안된 경우)
      let imageUrl = receipt.imageUrl || ''
      if (receipt.image && !imageUrl) {
        try {
          imageUrl = await uploadReceiptImage(token, receipt.image, receipt)
        } catch (e) {
          showToast(`Drive 이미지 실패: ${e.message}`, 'error')
        }
      }

      // Sheets 기록
      const year = receipt.date.split('-')[0]
      const ssId = await getOrCreateSpreadsheet(token, year)
      await appendReceiptRow(token, ssId, { ...receipt, imageUrl })

      updateReceipt(receipt.id, { synced: true, imageUrl })
      showToast('☁️ 업로드 완료!', 'success')
    } catch (e) {
      const expired = /401|Invalid Credentials|UNAUTHENTICATED/i.test(e.message)
      if (expired) {
        showToast('토큰 만료 — 설정에서 재연결해주세요', 'error')
      } else {
        showToast(`업로드 실패: ${e.message}`, 'error')
      }
    } finally {
      setUploading(false)
    }
  }

  if (editing) {
    return (
      <div className="card" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#059669' }}>영수증 수정</span>
          <button onClick={() => setEditing(false)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#9ca3af' }}>✕</button>
        </div>

        <div className="form-group">
          <label className="form-label">날짜</label>
          <input type="date" className="form-input" value={form.date}
            onChange={e => setForm(p => ({ ...p, date: e.target.value }))} />
        </div>
        <div className="form-group">
          <label className="form-label">가맹점명</label>
          <input className="form-input" value={form.merchant}
            onChange={e => setForm(p => ({ ...p, merchant: e.target.value }))} />
        </div>
        <div className="form-group">
          <label className="form-label">금액 (원)</label>
          <input type="number" className="form-input" value={form.amount}
            onChange={e => setForm(p => ({ ...p, amount: e.target.value }))} />
        </div>
        <div className="form-group">
          <label className="form-label">카드 담당자</label>
          <input className="form-input" value={form.cardHolder} placeholder="선택 입력"
            onChange={e => setForm(p => ({ ...p, cardHolder: e.target.value }))} />
        </div>
        <div className="form-group">
          <label className="form-label">카테고리</label>
          <select className="form-input form-select" value={form.category}
            onChange={e => setForm(p => ({ ...p, category: e.target.value }))}>
            {CATEGORIES.map(c => <option key={c} value={c}>{CAT_EMOJI[c]} {c}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">메모</label>
          <input className="form-input" value={form.memo} placeholder="선택 입력"
            onChange={e => setForm(p => ({ ...p, memo: e.target.value }))} />
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setEditing(false)}>취소</button>
          <button className="btn btn-primary" style={{ flex: 1 }} onClick={handleSave}>저장</button>
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="card" style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
        {/* 카테고리 아이콘 */}
        <div style={{
          width: 44, height: 44, borderRadius: 12, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22
        }} className={`cat-badge cat-${receipt.category}`}>
          {emoji}
        </div>

        {/* 내용 */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#111827', marginBottom: 2,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {receipt.merchant}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, color: '#9ca3af' }}>{receipt.date}</span>
            <span className={`cat-badge cat-${receipt.category}`} style={{ fontSize: 10, padding: '1px 7px' }}>
              {receipt.category}
            </span>
            {receipt.synced
              ? <span style={{ fontSize: 10, color: '#059669' }}>☁️ 동기화</span>
              : <span style={{ fontSize: 10, color: '#f59e0b' }}>● 미업로드</span>
            }
          </div>
          {receipt.memo && (
            <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {receipt.memo}
            </div>
          )}
        </div>

        {/* 금액 + 액션 */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: '#111827' }}>
            ₩{Number(receipt.amount).toLocaleString()}
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            {/* 업로드 버튼 — 미동기화 항목만 강조 */}
            <button onClick={handleUpload} disabled={uploading}
              style={{ background: receipt.synced ? '#f3f4f6' : '#d1fae5', border: 'none', borderRadius: 8,
                padding: '4px 8px', fontSize: 12, cursor: 'pointer',
                color: receipt.synced ? '#9ca3af' : '#059669', opacity: uploading ? 0.6 : 1 }}>
              {uploading ? '⏳' : '☁️'}
            </button>
            <button onClick={() => setEditing(true)}
              style={{ background: '#f3f4f6', border: 'none', borderRadius: 8,
                padding: '4px 8px', fontSize: 12, cursor: 'pointer', color: '#374151' }}>
              ✏️
            </button>
            <button onClick={() => setConfirmDelete(true)}
              style={{ background: '#fee2e2', border: 'none', borderRadius: 8,
                padding: '4px 8px', fontSize: 12, cursor: 'pointer', color: '#dc2626' }}>
              🗑️
            </button>
          </div>
        </div>
      </div>

      {/* 삭제 확인 다이얼로그 */}
      {confirmDelete && (
        <div className="dialog-overlay" onClick={() => setConfirmDelete(false)}>
          <div className="dialog-box" onClick={e => e.stopPropagation()}>
            <div className="dialog-title">영수증 삭제</div>
            <div className="dialog-desc">
              {receipt.merchant}의 영수증을 삭제하시겠어요?<br />
              로컬에서만 삭제되며 Drive 시트는 유지됩니다.
            </div>
            <button className="btn btn-danger btn-full" onClick={handleDelete}>삭제</button>
            <button className="btn btn-secondary btn-full" onClick={() => setConfirmDelete(false)}>취소</button>
          </div>
        </div>
      )}
    </>
  )
}
