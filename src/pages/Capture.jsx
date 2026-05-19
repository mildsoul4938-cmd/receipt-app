import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { compressImage, analyzeReceipt } from '../services/vision.js'
import ImageEditor from '../components/ImageEditor.jsx'

export default function Capture() {
  const navigate = useNavigate()
  const cameraRef = useRef(null)
  const galleryRef = useRef(null)

  const [preview, setPreview] = useState(null)
  const [status, setStatus] = useState('idle') // idle | compressing | editing | analyzing | done | error
  const [progress, setProgress] = useState(0)
  const [progressMsg, setProgressMsg] = useState('')
  const [result, setResult] = useState(null)
  const [errorMsg, setErrorMsg] = useState('')
  const [rawImage, setRawImage] = useState(null) // 편집 전 원본
  const [originalFile, setOriginalFile] = useState(null) // Drive 업로드용 원본

  async function handleFile(file) {
    if (!file) return
    setOriginalFile(file)           // 원본 파일 보존 (Drive 고화질 업로드용)
    setResult(null); setErrorMsg(''); setStatus('compressing'); setProgress(0)

    const compressed = await compressImage(file)
    setRawImage(compressed)
    setStatus('editing') // 편집기 열기
  }

  function handleEditConfirm(editedImage) {
    setPreview(editedImage)
    setStatus('analyzing')
    analyzeImage(editedImage)
  }

  function handleEditCancel() {
    setRawImage(null)
    setStatus('idle')
  }

  async function analyzeImage(imageDataUrl) {
    try {
      const extracted = await analyzeReceipt(imageDataUrl, (pct, msg) => {
        setProgress(pct)
        setProgressMsg(msg)
      })
      setResult(extracted)
      setStatus('done')
    } catch (e) {
      setErrorMsg(e.message)
      setStatus('error')
    }
  }

  const analyzing = status === 'analyzing' || status === 'compressing'

  return (
    <>
    {status === 'editing' && rawImage && (
      <ImageEditor
        imageDataUrl={rawImage}
        onConfirm={handleEditConfirm}
        onCancel={handleEditCancel}
      />
    )}
    <div style={{
      display: 'flex', flexDirection: 'column', minHeight: '100dvh', background: '#111827',
      paddingTop: 'env(safe-area-inset-top, 0px)',
      paddingLeft: 'env(safe-area-inset-left, 0px)',
      paddingRight: 'env(safe-area-inset-right, 0px)',
    }}>
      {/* 헤더 */}
      <div style={{ padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={() => navigate(-1)}
          style={{ background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 10,
            width: 36, height: 36, cursor: 'pointer', color: 'white', fontSize: 18 }}>←</button>
        <span style={{ color: 'white', fontWeight: 700, fontSize: 17 }}>영수증 촬영</span>
      </div>

      {/* 이미지 영역 */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px 24px' }}>
        {preview ? (
          <div style={{ position: 'relative', width: '100%', maxWidth: 360 }}>
            <img src={preview} alt="영수증"
              style={{ width: '100%', borderRadius: 16, maxHeight: '50vh', objectFit: 'contain',
                filter: analyzing ? 'brightness(0.6)' : 'none', transition: '0.3s' }} />
            {!analyzing && (
              <button onClick={() => { setPreview(null); setStatus('idle'); setResult(null) }}
                style={{ position: 'absolute', top: 8, right: 8, background: 'rgba(0,0,0,0.6)',
                  border: 'none', borderRadius: '50%', width: 32, height: 32, color: 'white', cursor: 'pointer', fontSize: 16 }}>✕</button>
            )}
          </div>
        ) : (
          <div style={{ width: '100%', maxWidth: 280, aspectRatio: '3/4',
            border: '2px dashed rgba(255,255,255,0.2)', borderRadius: 20,
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', gap: 14, color: 'rgba(255,255,255,0.4)' }}>
            <span style={{ fontSize: 56 }}>🧾</span>
            <span style={{ fontSize: 13, textAlign: 'center', lineHeight: 1.7 }}>
              카메라로 찍거나<br />갤러리에서 불러오세요
            </span>
          </div>
        )}
      </div>

      {/* 분석 상태 / 결과 */}
      {analyzing && (
        <div style={{ margin: '0 24px 12px', background: 'rgba(255,255,255,0.08)',
          borderRadius: 16, padding: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
            <div className="spinner" />
            <div style={{ color: 'white', fontSize: 14, fontWeight: 600 }}>AI 인식 중...</div>
          </div>
          <div style={{ background: 'rgba(255,255,255,0.1)', borderRadius: 4, height: 6, overflow: 'hidden' }}>
            <div style={{ height: '100%', background: '#34d399', borderRadius: 4,
              width: `${progress}%`, transition: 'width 0.4s ease' }} />
          </div>
          <div style={{ marginTop: 8, fontSize: 11, color: 'rgba(255,255,255,0.5)', whiteSpace: 'pre-line', lineHeight: 1.5 }}>
            {progressMsg}
          </div>
        </div>
      )}

      {result && status === 'done' && (
        <div style={{ margin: '0 24px 12px', background: 'rgba(5,150,105,0.2)',
          border: '1px solid rgba(52,211,153,0.4)', borderRadius: 16, padding: '14px 16px' }}>
          <div style={{ fontSize: 12, color: '#34d399', fontWeight: 700, marginBottom: 10 }}>
            🤖 자동 인식 완료 — 다음 화면에서 확인하세요
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <InfoRow label="가맹점" value={result.merchant || '—'} />
            <InfoRow label="금액" value={result.amount ? `₩${result.amount.toLocaleString()}` : '—'} accent />
            <InfoRow label="날짜" value={result.date} />
            <InfoRow label="카테고리" value={result.category} />
          </div>
          {result.rawText && (
            <details style={{ marginTop: 10 }}>
              <summary style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', cursor: 'pointer' }}>🔍 OCR 원문 보기</summary>
              <pre style={{ fontSize: 9, color: 'rgba(255,255,255,0.5)', whiteSpace: 'pre-wrap', marginTop: 6, maxHeight: 120, overflow: 'auto' }}>{result.rawText}</pre>
            </details>
          )}
        </div>
      )}

      {status === 'error' && (
        <div style={{ margin: '0 24px 12px', background: 'rgba(220,38,38,0.15)',
          border: '1px solid rgba(220,38,38,0.3)', borderRadius: 14, padding: '12px 16px',
          color: '#fca5a5', fontSize: 13 }}>
          ⚠️ 인식 실패 — 다음 화면에서 직접 입력하세요
          {errorMsg && (
            <div style={{ marginTop: 6, fontSize: 11, color: '#fca5a5', opacity: 0.8, wordBreak: 'break-all' }}>
              ({errorMsg})
            </div>
          )}
        </div>
      )}

      {/* 하단 버튼 */}
      <div style={{ background: '#1f2937', padding: '18px 24px',
        paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 80px)', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <input ref={cameraRef} type="file" accept="image/*" capture="environment"
          style={{ display: 'none' }} onChange={e => handleFile(e.target.files[0])} />
        <input ref={galleryRef} type="file" accept="image/*"
          style={{ display: 'none' }} onChange={e => handleFile(e.target.files[0])} />

        {!preview ? (
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn btn-primary" style={{ flex: 1, padding: '15px 10px', fontSize: 15 }}
              onClick={() => cameraRef.current.click()}>📷 카메라로 찍기</button>
            <button className="btn btn-secondary" style={{ flex: 1, padding: '15px 10px', fontSize: 15 }}
              onClick={() => galleryRef.current.click()}>🖼️ 갤러리에서</button>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn btn-secondary" style={{ flex: 1 }} disabled={analyzing}
              onClick={() => galleryRef.current.click()}>🔄 다시 선택</button>
            <button className="btn btn-primary" style={{ flex: 1 }} disabled={analyzing}
              onClick={() => navigate('/confirm', { state: { image: preview, extracted: result, originalFile } })}>
              {analyzing ? '인식 중...' : '다음 →'}
            </button>
          </div>
        )}
      </div>
    </div>
    </>
  )
}

function InfoRow({ label, value, accent }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 600, color: accent ? '#34d399' : 'rgba(255,255,255,0.9)' }}>{value}</div>
    </div>
  )
}
