const SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive.file'
].join(' ')

let tokenClient = null

export function initGoogleAuth(clientId) {
  if (!window.google?.accounts) throw new Error('Google Identity Services가 아직 로드되지 않았습니다')
  tokenClient = window.google.accounts.oauth2.initTokenClient({
    client_id: clientId,
    scope: SCOPES,
    callback: () => {}
  })
}

export function requestGoogleToken() {
  return new Promise((resolve, reject) => {
    if (!tokenClient) return reject(new Error('Google Auth 초기화 필요'))
    tokenClient.callback = (res) => {
      if (res.error) reject(new Error(res.error_description || res.error))
      else resolve(res.access_token)
    }
    tokenClient.requestAccessToken()
  })
}

export function revokeToken(token) {
  if (token && window.google?.accounts) window.google.accounts.oauth2.revoke(token)
}

// ── Sheets ────────────────────────────────────────────────────────────────

export async function getOrCreateSpreadsheet(token, year) {
  const cacheKey = `ssId_${year}`
  const cached = localStorage.getItem(cacheKey)
  if (cached && await verifySpreadsheet(token, cached)) return cached

  // 캐시 무효 → 새로 생성
  localStorage.removeItem(cacheKey)
  const res = await gRequest(token, 'POST', 'https://sheets.googleapis.com/v4/spreadsheets', {
    properties: { title: `영수증 정리기 ${year}` }
  })
  localStorage.setItem(cacheKey, res.spreadsheetId)
  return res.spreadsheetId
}

async function verifySpreadsheet(token, id) {
  try {
    const r = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${id}?fields=spreadsheetId`,
      { headers: { Authorization: `Bearer ${token}` } })
    return r.ok
  } catch { return false }
}

// "2026-01-05" → "2026년 1월 5일"
function korDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number)
  return `${y}년 ${m}월 ${d}일`
}

export async function appendReceiptRow(token, spreadsheetId, receipt) {
  const sheetName = receipt.date.slice(0, 7).replace('-', '_') // "2026_05"
  const sheetIndex = await ensureMonthSheet(token, spreadsheetId, sheetName)

  // 사용내역: 메모 있으면 "가맹점 - 메모", 없으면 가맹점명
  const detail = receipt.memo ? `${receipt.merchant} - ${receipt.memo}` : receipt.merchant

  // 영수증: =IMAGE() 공개 URL이면 셀 내 이미지, 아니면 빈칸
  const imgCell = receipt.imageUrl ? `=IMAGE("${receipt.imageUrl}")` : ''

  await gRequest(token, 'POST',
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}:append?valueInputOption=USER_ENTERED`,
    { values: [[korDate(receipt.date), receipt.category, detail, receipt.amount, imgCell]] }
  )

  // 영수증 열 행 높이를 120px로 확대 (이미지 보이게)
  if (receipt.imageUrl && sheetIndex !== null) {
    try {
      // 방금 추가한 행 번호 파악
      const rng = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}`,
        { headers: { Authorization: `Bearer ${token}` } }
      )
      const rngData = await rng.json()
      const rowIdx = (rngData.values?.length ?? 2) - 1 // 0-based (헤더=0)

      await gRequest(token, 'POST', `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
        requests: [{
          updateDimensionProperties: {
            range: { sheetId: sheetIndex, dimension: 'ROWS', startIndex: rowIdx, endIndex: rowIdx + 1 },
            properties: { pixelSize: 120 },
            fields: 'pixelSize'
          }
        }]
      })
    } catch { /* 행 높이 실패는 무시 */ }
  }
}

// 시트가 없으면 생성 후 헤더 추가, sheetId 반환
async function ensureMonthSheet(token, spreadsheetId, sheetName) {
  const r = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties`,
    { headers: { Authorization: `Bearer ${token}` } })
  const data = await r.json()
  const existing = data.sheets?.find(s => s.properties.title === sheetName)
  if (existing) return existing.properties.sheetId

  const res = await gRequest(token, 'POST', `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
    { requests: [{ addSheet: { properties: { title: sheetName } } }] })
  const newSheetId = res.replies?.[0]?.addSheet?.properties?.sheetId ?? null

  // 헤더 행
  await gRequest(token, 'POST',
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}!A1:append?valueInputOption=USER_ENTERED`,
    { values: [['날짜', '분류', '사용내역', '금액', '영수증']] }
  )

  // 헤더 스타일: 굵게 + 배경색 + 열 너비
  if (newSheetId !== null) {
    try {
      await gRequest(token, 'POST', `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
        requests: [
          // 헤더 굵게 + 배경
          {
            repeatCell: {
              range: { sheetId: newSheetId, startRowIndex: 0, endRowIndex: 1 },
              cell: {
                userEnteredFormat: {
                  textFormat: { bold: true },
                  backgroundColor: { red: 0.851, green: 0.918, blue: 0.827 }
                }
              },
              fields: 'userEnteredFormat(textFormat,backgroundColor)'
            }
          },
          // 날짜 열 너비 130
          { updateDimensionProperties: { range: { sheetId: newSheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: 1 }, properties: { pixelSize: 130 }, fields: 'pixelSize' } },
          // 분류 열 너비 110
          { updateDimensionProperties: { range: { sheetId: newSheetId, dimension: 'COLUMNS', startIndex: 1, endIndex: 2 }, properties: { pixelSize: 110 }, fields: 'pixelSize' } },
          // 사용내역 열 너비 200
          { updateDimensionProperties: { range: { sheetId: newSheetId, dimension: 'COLUMNS', startIndex: 2, endIndex: 3 }, properties: { pixelSize: 200 }, fields: 'pixelSize' } },
          // 금액 열 너비 110
          { updateDimensionProperties: { range: { sheetId: newSheetId, dimension: 'COLUMNS', startIndex: 3, endIndex: 4 }, properties: { pixelSize: 110 }, fields: 'pixelSize' } },
          // 영수증 열 너비 160
          { updateDimensionProperties: { range: { sheetId: newSheetId, dimension: 'COLUMNS', startIndex: 4, endIndex: 5 }, properties: { pixelSize: 160 }, fields: 'pixelSize' } },
        ]
      })
    } catch { /* 스타일 실패는 무시 */ }
  }

  return newSheetId
}

// ── Drive ─────────────────────────────────────────────────────────────────

export async function uploadReceiptImage(token, base64DataUrl, receipt) {
  const folderId = await getOrCreateReceiptFolder(token, receipt.date)
  const blob = dataUrlToBlob(base64DataUrl)
  const filename = `${receipt.date}_${receipt.merchant}_${receipt.amount}원.jpg`

  const form = new FormData()
  form.append('metadata', new Blob([JSON.stringify({
    name: filename, mimeType: 'image/jpeg', parents: [folderId]
  })], { type: 'application/json' }))
  form.append('file', blob)

  const res = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink',
    { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form }
  )
  if (!res.ok) {
    const e = await res.json().catch(() => ({}))
    throw new Error(e.error?.message || `Drive 업로드 실패 (${res.status})`)
  }
  const data = await res.json()
  const fileId = data.id

  // Sheets =IMAGE() 수식이 작동하려면 공개 읽기 권한 필요
  try {
    await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'reader', type: 'anyone' })
    })
  } catch { /* 권한 설정 실패해도 계속 */ }

  // =IMAGE() 에 사용할 직접 URL
  return `https://drive.google.com/uc?id=${fileId}`
}

async function getOrCreateReceiptFolder(token, dateStr) {
  const [year, month] = dateStr.split('-')
  const rootId = await getOrCreateFolder(token, '영수증정리기', null)
  const yearId = await getOrCreateFolder(token, year, rootId)
  return await getOrCreateFolder(token, `${year}_${month}`, yearId)
}

async function getOrCreateFolder(token, name, parentId) {
  const key = `fid_${name}_${parentId}`
  const cached = sessionStorage.getItem(key)
  if (cached) return cached

  const q = `name='${name}' and mimeType='application/vnd.google-apps.folder' and trashed=false${parentId ? ` and '${parentId}' in parents` : ''}`
  const r = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id)`,
    { headers: { Authorization: `Bearer ${token}` } })
  const data = await r.json()

  if (data.files?.length > 0) {
    sessionStorage.setItem(key, data.files[0].id)
    return data.files[0].id
  }

  const cr = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, mimeType: 'application/vnd.google-apps.folder', ...(parentId ? { parents: [parentId] } : {}) })
  })
  const folder = await cr.json()
  sessionStorage.setItem(key, folder.id)
  return folder.id
}

// ── 유틸 ──────────────────────────────────────────────────────────────────

async function gRequest(token, method, url, body) {
  const res = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  if (!res.ok) { const e = await res.json(); throw new Error(e.error?.message || 'Google API 오류') }
  return res.json()
}

function dataUrlToBlob(dataUrl) {
  const [header, data] = dataUrl.split(',')
  const mime = header.match(/:(.*?);/)[1]
  const bytes = atob(data)
  const arr = new Uint8Array(bytes.length)
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i)
  return new Blob([arr], { type: mime })
}
