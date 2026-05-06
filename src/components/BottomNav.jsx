import { useLocation, useNavigate } from 'react-router-dom'

const TABS = [
  { path: '/',        icon: '🏠', label: '홈' },
  { path: '/list',    icon: '📋', label: '내역' },
  { path: '/capture', icon: '📷', label: '촬영', primary: true },
  { path: '/settings',icon: '⚙️', label: '설정' },
]

export default function BottomNav() {
  const location = useLocation()
  const navigate = useNavigate()

  // Confirm 페이지에서는 숨김
  if (location.pathname === '/confirm') return null

  return (
    <nav style={{
      position: 'fixed',
      bottom: 0,
      left: 0,
      right: 0,
      background: 'white',
      borderTop: '1px solid #f3f4f6',
      display: 'flex',
      alignItems: 'stretch',
      paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      paddingLeft: 'env(safe-area-inset-left, 0px)',
      paddingRight: 'env(safe-area-inset-right, 0px)',
      zIndex: 100,
      boxShadow: '0 -1px 8px rgba(0,0,0,0.06)',
    }}>
      {TABS.map(tab => {
        const active = location.pathname === tab.path
        return tab.primary ? (
          <button
            key={tab.path}
            onClick={() => navigate(tab.path)}
            style={{
              flex: 1,
              border: 'none',
              background: 'none',
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '8px 0',
              gap: 2,
            }}
          >
            <div style={{
              width: 46,
              height: 46,
              background: active ? '#047857' : '#059669',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 22,
              boxShadow: '0 2px 10px rgba(5,150,105,0.4)',
              marginTop: -18,
            }}>
              {tab.icon}
            </div>
            <span style={{ fontSize: 10, color: active ? '#059669' : '#9ca3af', fontWeight: 600 }}>
              {tab.label}
            </span>
          </button>
        ) : (
          <button
            key={tab.path}
            onClick={() => navigate(tab.path)}
            style={{
              flex: 1,
              border: 'none',
              background: 'none',
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '8px 0',
              gap: 3,
              minHeight: 60,
            }}
          >
            <span style={{ fontSize: 22 }}>{tab.icon}</span>
            <span style={{
              fontSize: 10,
              fontWeight: 600,
              color: active ? '#059669' : '#9ca3af',
            }}>
              {tab.label}
            </span>
          </button>
        )
      })}
    </nav>
  )
}
