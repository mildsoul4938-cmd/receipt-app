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
      else resolve({ token: res.access_token, expiresIn: res.expires_in || 3600 })
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

  // 캐시 무효(삭제·휴지통 포함) → 새로 생성
  localStorage.removeItem(cacheKey)
  const res = await gRequest(token, 'POST', 'https://sheets.googleapis.com/v4/spreadsheets', {
    properties: { title: `영수증 정리기 ${year}` }
  })
  try { localStorage.setItem(cacheKey, res.spreadsheetId) } catch {}
  return res.spreadsheetId
}

async function verifySpreadsheet(token, id) {
  try {
    // trashed=true 이면 삭제된 파일 → 새로 생성
    const r = await fetch(
      `https://www.googleapis.com/drive/v3/files/${id}?fields=id,trashed`,
      { headers: { Authorization: `Bearer ${token}` } }
    )
    if (!r.ok) return false
    const data = await r.json()
    return !data.trashed  // 휴지통에 있으면 false
  } catch { return false }
}

// "2026-01-05" → "2026년 1월 5일"
function korDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number)
  return `${y}년 ${m}월 ${d}일`
}

// ── 열 인덱스 → 알파벳 (0=A, 1=B, 26=AA …)
function colLetter(idx) {
  let s = '', i = idx + 1
  while (i > 0) { i--; s = String.fromCharCode(65 + i % 26) + s; i = Math.floor(i / 26) }
  return s
}

const BD  = { style: 'SOLID', width: 1, color: { red: 0.75, green: 0.75, blue: 0.75 } }
const GRN = { red: 0.851, green: 0.918, blue: 0.827 }

/*
 * 레이아웃: 영수증 한 건 = 열(column) 하나
 *   A열   : 레이블 (날짜 / 분류 / 사용내역 / 금액 / 영수증)
 *   B열~  : 영수증 데이터 (날짜 위→영수증사진 아래)
 *
 *       A          B               C
 *  1  날짜    2026년 1월 2일   2026년 1월 5일
 *  2  분류    식사             사무 장비
 *  3  사용내역 식권 구입        사무 용품 구입
 *  4  금액    ₩80,000         ₩59,200
 *  5  영수증  (사진)           (사진)
 */
export async function appendReceiptRow(token, spreadsheetId, receipt) {
  const sheetName = receipt.date.slice(0, 7).replace('-', '_')
  const sheetId   = await ensureMonthSheet(token, spreadsheetId, sheetName)

  // 1행(날짜 행) 읽어서 다음 빈 열 결정
  const r1    = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}!1:1`,
    { headers: { Authorization: `Bearer ${token}` } }
  )
  const r1d   = await r1.json()
  const colIdx = r1d.values?.[0]?.length ?? 1  // A=0 이미 레이블, B=1 부터 데이터
  const col    = colLetter(colIdx)

  const detail = receipt.memo || ''
  const cardHolder = receipt.cardHolder || ''

  // 1~5행: 텍스트 값 기록 (이미지 행 제외)
  // 행 순서: 날짜 / 카드 담당자 / 분류 / 사용내역 / 금액
  await gRequest(token, 'PUT',
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}!${col}1:${col}5?valueInputOption=USER_ENTERED`,
    {
      range: `${sheetName}!${col}1:${col}5`,
      majorDimension: 'COLUMNS',
      values: [[korDate(receipt.date), cardHolder, receipt.category, detail, receipt.amount]]
    }
  )

  // 6행: 이미지 셀 직접 삽입 (=IMAGE 수식 대신 네이티브 이미지)
  if (receipt.imageUrl && sheetId !== null) {
    try {
      await gRequest(token, 'POST', `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
        requests: [{
          updateCells: {
            rows: [{ values: [{ image: { sourceUri: receipt.imageUrl, altText: '영수증' } }] }],
            fields: 'image',
            range: { sheetId, startRowIndex: 5, endRowIndex: 6, startColumnIndex: colIdx, endColumnIndex: colIdx + 1 }
          }
        }]
      })
    } catch {
      // 네이티브 삽입 실패 시 =IMAGE() 수식으로 폴백
      await gRequest(token, 'PUT',
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}!${col}6?valueInputOption=USER_ENTERED`,
        { range: `${sheetName}!${col}6`, majorDimension: 'COLUMNS', values: [[`=IMAGE("${receipt.imageUrl}",2)`]] }
      )
    }
  }

  // 새 열 서식
  if (sheetId !== null) {
    try {
      await gRequest(token, 'POST', `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
        requests: [
          // 열 너비 800px
          { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: colIdx, endIndex: colIdx + 1 }, properties: { pixelSize: 800 }, fields: 'pixelSize' } },
          // 상하좌우 가운데 정렬
          {
            repeatCell: {
              range: { sheetId, startRowIndex: 0, endRowIndex: 6, startColumnIndex: colIdx, endColumnIndex: colIdx + 1 },
              cell: { userEnteredFormat: { horizontalAlignment: 'CENTER', verticalAlignment: 'MIDDLE' } },
              fields: 'userEnteredFormat(horizontalAlignment,verticalAlignment)'
            }
          },
          // 테두리
          {
            updateBorders: {
              range: { sheetId, startRowIndex: 0, endRowIndex: 6, startColumnIndex: colIdx, endColumnIndex: colIdx + 1 },
              top: BD, bottom: BD, left: BD, right: BD, innerHorizontal: BD
            }
          }
        ]
      })
    } catch { /* 서식 실패 무시 */ }
  }
}

// 시트가 없으면 생성 + A열 레이블 + 기본 서식 설정
async function ensureMonthSheet(token, spreadsheetId, sheetName) {
  const r    = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties`,
    { headers: { Authorization: `Bearer ${token}` } })
  const data = await r.json()
  const existing = data.sheets?.find(s => s.properties.title === sheetName)
  if (existing) return existing.properties.sheetId

  // 시트 생성
  const res        = await gRequest(token, 'POST', `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
    { requests: [{ addSheet: { properties: { title: sheetName } } }] })
  const newSheetId = res.replies?.[0]?.addSheet?.properties?.sheetId ?? null

  // A열 레이블 (세로) — 날짜/카드 담당자/분류/사용내역/금액/영수증
  await gRequest(token, 'PUT',
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}!A1:A6?valueInputOption=USER_ENTERED`,
    { range: `${sheetName}!A1:A6`, majorDimension: 'COLUMNS', values: [['날짜', '카드 담당자', '분류', '사용내역', '금액', '영수증']] }
  )

  if (newSheetId !== null) {
    try {
      await gRequest(token, 'POST', `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
        requests: [
          // 전체 셀 가운데 정렬
          { repeatCell: { range: { sheetId: newSheetId }, cell: { userEnteredFormat: { horizontalAlignment: 'CENTER', verticalAlignment: 'MIDDLE' } }, fields: 'userEnteredFormat(horizontalAlignment,verticalAlignment)' } },
          // A열 레이블: 굵게 + 연두 배경
          {
            repeatCell: {
              range: { sheetId: newSheetId, startColumnIndex: 0, endColumnIndex: 1 },
              cell: { userEnteredFormat: { backgroundColor: GRN, textFormat: { bold: true, fontSize: 10 }, horizontalAlignment: 'CENTER', verticalAlignment: 'MIDDLE' } },
              fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)'
            }
          },
          // A열 테두리 (6행)
          { updateBorders: { range: { sheetId: newSheetId, startRowIndex: 0, endRowIndex: 6, startColumnIndex: 0, endColumnIndex: 1 }, top: BD, bottom: BD, left: BD, right: BD, innerHorizontal: BD } },
          // A열 너비 100px
          { updateDimensionProperties: { range: { sheetId: newSheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: 1 }, properties: { pixelSize: 100 }, fields: 'pixelSize' } },
          // 행 1~5: 40px / 행 6(영수증): 1200px
          { updateDimensionProperties: { range: { sheetId: newSheetId, dimension: 'ROWS', startIndex: 0, endIndex: 5 }, properties: { pixelSize: 40  }, fields: 'pixelSize' } },
          { updateDimensionProperties: { range: { sheetId: newSheetId, dimension: 'ROWS', startIndex: 5, endIndex: 6 }, properties: { pixelSize: 1200 }, fields: 'pixelSize' } },
          // 분류 행(3행, index 2) B열 이후 드롭다운
          {
            setDataValidation: {
              range: { sheetId: newSheetId, startRowIndex: 2, endRowIndex: 3, startColumnIndex: 1, endColumnIndex: 100 },
              rule: {
                condition: { type: 'ONE_OF_LIST', values: ['식사','간식','회식','사무 장비','소모품','교통비','디지털 상품','PC 및 부품','워크샵'].map(v => ({ userEnteredValue: v })) },
                showCustomUi: true, strict: false
              }
            }
          }
        ]
      })
    } catch { /* 서식 실패 무시 */ }
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

  // Google 썸네일 CDN — 리다이렉트 없는 직접 이미지 URL, Sheets에서 안정적으로 로드
  return `https://drive.google.com/thumbnail?id=${fileId}&sz=w3000-h3000`
}

async function getOrCreateReceiptFolder(token, dateStr) {
  const [year, month] = dateStr.split('-')
  const rootId = await getOrCreateFolder(token, '영수증정리기', null)
  const yearId = await getOrCreateFolder(token, year, rootId)
  return await getOrCreateFolder(token, `${year}_${month}`, yearId)
}

async function folderExists(token, id) {
  try {
    const r = await fetch(
      `https://www.googleapis.com/drive/v3/files/${id}?fields=id,trashed`,
      { headers: { Authorization: `Bearer ${token}` } }
    )
    if (!r.ok) return false
    const d = await r.json()
    return !d.trashed
  } catch { return false }
}

async function getOrCreateFolder(token, name, parentId) {
  const key = `fid_${name}_${parentId}`
  const cached = sessionStorage.getItem(key)
  // 캐시된 폴더가 실제로 존재하는지 확인
  if (cached && await folderExists(token, cached)) return cached
  sessionStorage.removeItem(key)

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
