import { useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext.jsx'

const CAT_EMOJI = { '식사':'🍽️','교통':'🚕','접대비':'🤝','숙박':'🏨','소모품':'📦','통신/IT':'📱','의료비':'🏥','사무 장비':'🖥️','기타':'📄' }
const CAT_BG    = { '식사':'#fef3c7','교통':'#dcfce7','접대비':'#dbeafe','숙박':'#fce7f3','소모품':'#f3e8ff','통신/IT':'#e0f2fe','의료비':'#fce7f3','사무 장비':'#f0fdf4','기타':'#f1f5f9' }

export default function Home() {
  const navigate = useNavigate()
  const { receipts, settings, googleToken } = useApp()

  const now = new Date()
  const thisYear = now.getFullYear(), thisMonth = now.getMonth() + 1

  const monthReceipts = receipts.filter(r => {
    const [y, m] = (r.date || '').split('-').map(Number)
    return y === thisYear && m === thisMonth
  })
  const total = monthReceipts.reduce((s, r) => s + (Number(r.amount) || 0), 0)
  const recent = receipts.slice(0, 5)

  const catTotals = monthReceipts.reduce((acc, r) => {
    acc[r.category] = (acc[r.category] || 0) + Number(r.amount)
    return acc
  }, {})
  const topCats = Object.entries(catTotals).sort((a, b) => b[1] - a[1]).slice(0, 3)

  const isConnected = googleToken || settings.clientId || import.meta.env.VITE_GOOGLE_CLIENT_ID

  return (
    <div className="page" style={{ background: '#f9fafb', padding: 0 }}>
      {/* 그린 헤더 */}
      <div style={{
        background: '#059669',
        paddingTop: 'calc(env(safe-area-inset-top, 0px) + 16px)',
        paddingLeft: 'calc(env(safe-area-inset-left, 0px) + 20px)',
        paddingRight: 'calc(env(safe-area-inset-right, 0px) + 20px)',
        paddingBottom: 24,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.75)', marginBottom: 2 }}>영수증 정리기</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: 'white' }}>{thisYear}년 {thisMonth}월</div>
          </div>
          <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(255,255,255,0.2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>
            {isConnected ? '☁️' : '👤'}
          </div>
        </div>
        <div style={{ background: 'rgba(255,255,255,0.15)', borderRadius: 16, padding: '16px 18px' }}>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.75)', marginBottom: 4 }}>이번 달 총 지출</div>
          <div style={{ fontSize: 34, fontWeight: 800, color: 'white' }}>₩{total.toLocaleString()}</div>
          <div style={{ display: 'flex', gap: 16, marginTop: 10, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.6)' }}>건수</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'white' }}>{monthReceipts.length}건</div>
            </div>
            {topCats.map(([cat, amt]) => (
              <div key={cat}>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.6)' }}>{cat}</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'white' }}>₩{Number(amt).toLocaleString()}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{
        padding: '16px',
        paddingBottom: 'calc(60px + env(safe-area-inset-bottom, 0px) + 16px)',
        display: 'flex', flexDirection: 'column', gap: 16,
      }}>
        {/* Drive 상태 */}
        <div className="card" style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 22 }}>{isConnected ? '☁️' : '🔗'}</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: isConnected ? '#059669' : '#f59e0b' }}>
              {googleToken ? 'Google Drive 연결됨' : isConnected ? 'Google 설정됨 (저장 시 로그인)' : 'Google 미연결'}
            </div>
            <div style={{ fontSize: 11, color: '#9ca3af' }}>
              {isConnected ? '저장하면 Drive & Sheets에 자동 업로드' : '설정에서 연결하세요'}
            </div>
          </div>
          {!isConnected && (
            <button className="btn btn-primary" style={{ padding: '6px 14px', fontSize: 12 }}
              onClick={() => navigate('/settings')}>연결</button>
          )}
        </div>

        {/* 촬영 버튼 */}
        <button className="btn btn-primary btn-full" style={{ padding: '18px', fontSize: 17 }}
          onClick={() => navigate('/capture')}>
          📷 영수증 촬영
        </button>

        {/* 최근 영수증 */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#374151' }}>최근 영수증</div>
            {receipts.length > 0 && (
              <button onClick={() => navigate('/list')}
                style={{ background: 'none', border: 'none', fontSize: 12, color: '#059669', fontWeight: 600, cursor: 'pointer' }}>
                전체보기 →
              </button>
            )}
          </div>
          {recent.length === 0 ? (
            <div className="empty-state">
              <div className="icon">🧾</div>
              <p>등록된 영수증이 없어요.<br/>📷 버튼으로 첫 영수증을 찍어보세요!</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {recent.map(r => (
                <div key={r.id} className="card" style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 40, height: 40, borderRadius: 10, flexShrink: 0,
                    background: CAT_BG[r.category] || '#f1f5f9',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>
                    {CAT_EMOJI[r.category] || '📄'}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.merchant}</div>
                    <div style={{ fontSize: 11, color: '#9ca3af' }}>{r.date}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 14, fontWeight: 800 }}>₩{Number(r.amount).toLocaleString()}</div>
                    {r.synced && <div style={{ fontSize: 10, color: '#059669' }}>☁️ 동기화</div>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
