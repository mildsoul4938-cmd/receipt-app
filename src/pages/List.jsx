import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext.jsx'
import ReceiptCard from '../components/ReceiptCard.jsx'

const MONTHS = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월']
const ALL_CATS = ['전체', '식비', '교통', '접대비', '숙박', '소모품', '기타']

export default function List() {
  const navigate = useNavigate()
  const { receipts } = useApp()

  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [cat, setCat] = useState('전체')

  const filtered = useMemo(() => receipts.filter(r => {
    const [y, m] = (r.date || '').split('-').map(Number)
    const matchDate = y === year && m === month
    const matchCat = cat === '전체' || r.category === cat
    return matchDate && matchCat
  }), [receipts, year, month, cat])

  const total = filtered.reduce((s, r) => s + (Number(r.amount) || 0), 0)

  const years = useMemo(() => {
    const ys = new Set(receipts.map(r => parseInt(r.date)))
    ys.add(now.getFullYear())
    return [...ys].sort((a, b) => b - a)
  }, [receipts])

  return (
    <div className="page">
      {/* 헤더 */}
      <div className="page-header">
        <h1>지출 내역</h1>
        <button className="btn btn-primary" style={{ padding: '7px 14px', fontSize: 13 }}
          onClick={() => navigate('/capture')}>
          + 추가
        </button>
      </div>

      {/* 연도 선택 */}
      <div style={{ padding: '12px 16px 0', display: 'flex', gap: 8, overflowX: 'auto' }}>
        {years.map(y => (
          <button key={y} onClick={() => setYear(y)}
            style={{
              flexShrink: 0, border: 'none', borderRadius: 20, cursor: 'pointer',
              padding: '6px 14px', fontSize: 13, fontWeight: 600,
              background: y === year ? '#059669' : '#f3f4f6',
              color: y === year ? 'white' : '#374151'
            }}>
            {y}년
          </button>
        ))}
      </div>

      {/* 월 탭 */}
      <div style={{ display: 'flex', overflowX: 'auto', padding: '10px 16px', gap: 6 }}>
        {MONTHS.map((label, i) => {
          const m = i + 1
          const count = receipts.filter(r => {
            const [y, mo] = (r.date || '').split('-').map(Number)
            return y === year && mo === m
          }).length
          return (
            <button key={m} onClick={() => setMonth(m)}
              style={{
                flexShrink: 0, border: 'none', borderRadius: 20, cursor: 'pointer',
                padding: '6px 12px', fontSize: 12, fontWeight: 600,
                background: m === month ? '#059669' : '#f3f4f6',
                color: m === month ? 'white' : count > 0 ? '#374151' : '#d1d5db',
                position: 'relative'
              }}>
              {label}
              {count > 0 && (
                <span style={{
                  position: 'absolute', top: -4, right: -4,
                  background: m === month ? '#34d399' : '#9ca3af',
                  color: 'white', borderRadius: '50%', width: 16, height: 16,
                  fontSize: 9, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontWeight: 700
                }}>{count}</span>
              )}
            </button>
          )
        })}
      </div>

      {/* 카테고리 필터 */}
      <div style={{ display: 'flex', overflowX: 'auto', padding: '0 16px 10px', gap: 6 }}>
        {ALL_CATS.map(c => (
          <button key={c} onClick={() => setCat(c)}
            style={{
              flexShrink: 0, border: 'none', borderRadius: 20, cursor: 'pointer',
              padding: '5px 12px', fontSize: 11, fontWeight: 600,
              background: c === cat ? '#111827' : '#f3f4f6',
              color: c === cat ? 'white' : '#6b7280'
            }}>
            {c}
          </button>
        ))}
      </div>

      {/* 합계 */}
      {filtered.length > 0 && (
        <div style={{
          margin: '0 16px 12px',
          background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 12,
          padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center'
        }}>
          <span style={{ fontSize: 13, color: '#065f46', fontWeight: 600 }}>
            {year}년 {month}월 합계 ({filtered.length}건)
          </span>
          <span style={{ fontSize: 18, fontWeight: 800, color: '#059669' }}>
            ₩{total.toLocaleString()}
          </span>
        </div>
      )}

      {/* 목록 */}
      <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {filtered.length === 0 ? (
          <div className="empty-state">
            <div className="icon">📭</div>
            <p>{year}년 {month}월 {cat !== '전체' ? cat + ' ' : ''}내역이 없어요</p>
          </div>
        ) : (
          filtered.map(r => <ReceiptCard key={r.id} receipt={r} />)
        )}
      </div>
    </div>
  )
}
