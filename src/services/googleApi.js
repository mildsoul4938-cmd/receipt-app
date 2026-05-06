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

export async function appendReceiptRow(token, spreadsheetId, receipt) {
  const sheetName = receipt.date.slice(0, 7).replace('-', '_') // "2026_05"
  await ensureMonthSheet(token, spreadsheetId, sheetName)

  await gRequest(token, 'POST',
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}:append?valueInputOption=USER_ENTERED`,
    { values: [[receipt.id, receipt.date, receipt.merchant, receipt.amount, receipt.category, receipt.memo || '', receipt.imageUrl || '', new Date().toLocaleString('ko-KR')]] }
  )
}

async function ensureMonthSheet(token, spreadsheetId, sheetName) {
  const r = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties.title`,
    { headers: { Authorization: `Bearer ${token}` } })
  const data = await r.json()
  if (data.sheets?.some(s => s.properties.title === sheetName)) return

  await gRequest(token, 'POST', `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
    { requests: [{ addSheet: { properties: { title: sheetName } } }] })

  await gRequest(token, 'POST',
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}!A1:append?valueInputOption=USER_ENTERED`,
    { values: [['ID', '날짜', '가맹점', '금액(원)', '카테고리', '메모', '영수증사진', '등록일시']] }
  )
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
  if (!res.ok) throw new Error('이미지 업로드 실패')
  const data = await res.json()
  return data.webViewLink || ''
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
