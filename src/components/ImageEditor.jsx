import { useState, useRef, useEffect } from 'react'

/**
 * 영수증 사진 편집기 — 회전 + 크롭
 * Props:
 *   imageDataUrl  : 원본 이미지 dataURL
 *   onConfirm(url): 편집 완료
 *   onCancel()    : 취소
 */
export default function ImageEditor({ imageDataUrl, onConfirm, onCancel }) {
  const [rotation, setRotation] = useState(0)           // 0 | 90 | 180 | 270
  const [box, setBox] = useState({ x: 0, y: 0, w: 100, h: 100 }) // % of canvas display
  const canvasRef = useRef(null)
  const wrapRef   = useRef(null)
  const imgRef    = useRef(null)
  const drag      = useRef(null)

  // ── 이미지 로드 ───────────────────────────────────────────────
  useEffect(() => {
    const img = new Image()
    img.onload = () => { imgRef.current = img; redraw() }
    img.src = imageDataUrl
  }, [imageDataUrl])

  useEffect(() => { redraw() }, [rotation])

  function redraw() {
    const img    = imgRef.current
    const canvas = canvasRef.current
    if (!img || !canvas) return
    const ctx  = canvas.getContext('2d')
    const odd  = rotation % 180 !== 0
    canvas.width  = odd ? img.height : img.width
    canvas.height = odd ? img.width  : img.height
    ctx.save()
    ctx.translate(canvas.width / 2, canvas.height / 2)
    ctx.rotate(rotation * Math.PI / 180)
    ctx.drawImage(img, -img.width / 2, -img.height / 2)
    ctx.restore()
  }

  // ── 드래그 핸들러 ─────────────────────────────────────────────
  function pct(e) {
    const rect = wrapRef.current.getBoundingClientRect()
    const t    = e.touches?.[0] ?? e
    return {
      px: Math.max(0, Math.min(100, (t.clientX - rect.left) / rect.width  * 100)),
      py: Math.max(0, Math.min(100, (t.clientY - rect.top)  / rect.height * 100)),
    }
  }

  function startDrag(e, handle) {
    e.preventDefault()
    e.stopPropagation()
    drag.current = { handle, box0: { ...box }, ...pct(e) }

    const MIN = 10

    function onMove(ev) {
      ev.preventDefault?.()
      if (!drag.current) return
      const { handle, box0, px: sx, py: sy } = drag.current
      const { px, py } = pct(ev)
      const dx = px - sx, dy = py - sy
      setBox(() => {
        const b = { ...box0 }
        if (handle === 'mv') {
          b.x = Math.max(0, Math.min(100 - b.w, b.x + dx))
          b.y = Math.max(0, Math.min(100 - b.h, b.y + dy))
          return b
        }
        if (handle.includes('l')) {
          const nx = Math.max(0, Math.min(b.x + b.w - MIN, b.x + dx))
          b.w = b.x + b.w - nx; b.x = nx
        }
        if (handle.includes('r')) b.w = Math.max(MIN, Math.min(100 - b.x, b.w + dx))
        if (handle.includes('t')) {
          const ny = Math.max(0, Math.min(b.y + b.h - MIN, b.y + dy))
          b.h = b.y + b.h - ny; b.y = ny
        }
        if (handle.includes('b')) b.h = Math.max(MIN, Math.min(100 - b.y, b.h + dy))
        return b
      })
    }

    function onUp() {
      drag.current = null
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup',   onUp)
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('touchend',  onUp)
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup',   onUp)
    window.addEventListener('touchmove', onMove, { passive: false })
    window.addEventListener('touchend',  onUp)
  }

  // ── 편집 적용 후 export ────────────────────────────────────────
  function apply() {
    const img = imgRef.current
    if (!img) return
    const odd = rotation % 180 !== 0
    const rw  = odd ? img.height : img.width
    const rh  = odd ? img.width  : img.height

    const cx = box.x / 100 * rw
    const cy = box.y / 100 * rh
    const cw = box.w / 100 * rw
    const ch = box.h / 100 * rh

    const out = document.createElement('canvas')
    out.width  = Math.round(cw)
    out.height = Math.round(ch)
    const ctx  = out.getContext('2d')
    ctx.save()
    ctx.translate(-cx, -cy)
    ctx.translate(rw / 2, rh / 2)
    ctx.rotate(rotation * Math.PI / 180)
    ctx.drawImage(img, -img.width / 2, -img.height / 2)
    ctx.restore()
    onConfirm(out.toDataURL('image/jpeg', 0.92))
  }

  function skipEdit() {
    onConfirm(imageDataUrl)
  }

  // ── UI ────────────────────────────────────────────────────────
  const H       = 26
  const corners = [
    { id: 'tl', s: { top: -H / 2, left:  -H / 2 } },
    { id: 'tr', s: { top: -H / 2, right: -H / 2 } },
    { id: 'bl', s: { bottom: -H / 2, left:  -H / 2 } },
    { id: 'br', s: { bottom: -H / 2, right: -H / 2 } },
  ]

  return (
    <div style={{
      position: 'fixed', inset: 0, background: '#000', zIndex: 200,
      display: 'flex', flexDirection: 'column',
      paddingTop:    'env(safe-area-inset-top, 0px)',
      paddingBottom: 'env(safe-area-inset-bottom, 0px)',
    }}>

      {/* 헤더 */}
      <div style={{ padding: '12px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
        <button onClick={onCancel} style={txt('#9ca3af')}>취소</button>
        <span style={{ color: 'white', fontWeight: 700, fontSize: 16 }}>사진 편집</span>
        <button onClick={apply} style={txt('#34d399', true)}>완료</button>
      </div>

      {/* 캔버스 + 크롭 오버레이 */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '8px 20px', overflow: 'hidden', minHeight: 0 }}>
        <div ref={wrapRef} style={{ position: 'relative', display: 'inline-block', lineHeight: 0 }}>
          <canvas
            ref={canvasRef}
            style={{ display: 'block', maxWidth: 'min(calc(100vw - 40px), 500px)', maxHeight: 'calc(100dvh - 220px)' }}
          />

          {/* 크롭 범위 밖 어둡게 */}
          <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: `${box.y}%`, background: 'rgba(0,0,0,0.55)' }} />
            <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: `${100 - box.y - box.h}%`, background: 'rgba(0,0,0,0.55)' }} />
            <div style={{ position: 'absolute', top: `${box.y}%`, left: 0, width: `${box.x}%`, height: `${box.h}%`, background: 'rgba(0,0,0,0.55)' }} />
            <div style={{ position: 'absolute', top: `${box.y}%`, right: 0, width: `${100 - box.x - box.w}%`, height: `${box.h}%`, background: 'rgba(0,0,0,0.55)' }} />
          </div>

          {/* 크롭 박스 */}
          <div
            style={{
              position: 'absolute',
              left: `${box.x}%`, top: `${box.y}%`,
              width: `${box.w}%`, height: `${box.h}%`,
              border: '2px solid rgba(255,255,255,0.9)',
              boxSizing: 'border-box', touchAction: 'none', cursor: 'move',
            }}
            onMouseDown={e => startDrag(e, 'mv')}
            onTouchStart={e => startDrag(e, 'mv')}
          >
            {/* 3등분 가이드 선 */}
            {[33, 66].flatMap(p => [
              <div key={`v${p}`} style={{ position: 'absolute', top: 0, bottom: 0, left: `${p}%`, width: 1, background: 'rgba(255,255,255,0.25)', pointerEvents: 'none' }} />,
              <div key={`h${p}`} style={{ position: 'absolute', left: 0, right: 0, top: `${p}%`, height: 1, background: 'rgba(255,255,255,0.25)', pointerEvents: 'none' }} />,
            ])}

            {/* 모서리 핸들 */}
            {corners.map(({ id, s }) => (
              <div key={id}
                style={{ position: 'absolute', width: H, height: H, background: 'white', borderRadius: 4, zIndex: 2, touchAction: 'none', ...s }}
                onMouseDown={e => startDrag(e, id)}
                onTouchStart={e => startDrag(e, id)}
              />
            ))}
          </div>
        </div>
      </div>

      {/* 하단 컨트롤 */}
      <div style={{ background: '#111827', padding: '12px 20px 16px', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {/* 회전 버튼 */}
        <div style={{ display: 'flex', gap: 10 }}>
          <RotBtn icon="↺" label="왼쪽 회전" onClick={() => { setRotation(r => (r - 90 + 360) % 360); setBox({ x: 0, y: 0, w: 100, h: 100 }) }} />
          <RotBtn icon="↻" label="오른쪽 회전" onClick={() => { setRotation(r => (r + 90) % 360); setBox({ x: 0, y: 0, w: 100, h: 100 }) }} />
        </div>
        {/* 편집 없이 바로 분석 */}
        <button onClick={skipEdit} style={{ width: '100%', padding: '10px 0', background: 'none', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 10, color: 'rgba(255,255,255,0.5)', fontSize: 13, cursor: 'pointer' }}>
          편집 없이 바로 분석
        </button>
      </div>
    </div>
  )
}

function txt(color, bold) {
  return { background: 'none', border: 'none', color, fontSize: 15, fontWeight: bold ? 700 : 400, cursor: 'pointer', padding: '8px 4px', minWidth: 44, textAlign: 'center' }
}

function RotBtn({ icon, label, onClick }) {
  return (
    <button onClick={onClick} style={{ flex: 1, padding: '13px 0', background: 'rgba(255,255,255,0.08)', border: 'none', borderRadius: 12, color: 'white', fontSize: 15, cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
      <span style={{ fontSize: 20 }}>{icon}</span>{label}
    </button>
  )
}
