import { Component } from 'react'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{
          padding: 24, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          minHeight: '100vh', background: '#fef2f2', gap: 16
        }}>
          <div style={{ fontSize: 40 }}>⚠️</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#dc2626' }}>앱 오류 발생</div>
          <div style={{
            fontSize: 12, color: '#7f1d1d', background: '#fee2e2',
            borderRadius: 8, padding: '12px 16px', wordBreak: 'break-all',
            maxWidth: 340, lineHeight: 1.6, textAlign: 'left'
          }}>
            {this.state.error.toString()}
          </div>
          <button
            onClick={() => window.location.reload()}
            style={{
              background: '#dc2626', color: 'white', border: 'none',
              borderRadius: 8, padding: '10px 24px', fontSize: 14,
              fontWeight: 600, cursor: 'pointer'
            }}>
            새로고침
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
