const VISION_API_KEY = import.meta.env.VITE_GOOGLE_VISION_KEY

export async function compressImage(file, maxWidth = 1600) {
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const img = new Image()
      img.onload = () => {
        const scale = Math.min(1, maxWidth / img.width)
        const canvas = document.createElement('canvas')
        canvas.width = Math.round(img.width * scale)
        canvas.height = Math.round(img.height * scale)
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
        resolve(canvas.toDataURL('image/jpeg', 0.92))
      }
      img.src = e.target.result
    }
    reader.readAsDataURL(file)
  })
}

export async function analyzeReceipt(imageDataUrl, onProgress) {
  onProgress?.(10, 'Vision API 호출 중...')

  const base64 = imageDataUrl.split(',')[1]

  const body = {
    requests: [{
      image: { content: base64 },
      features: [{ type: 'TEXT_DETECTION', maxResults: 1 }]
    }]
  }

  const res = await fetch(
    `https://vision.googleapis.com/v1/images:annotate?key=${VISION_API_KEY}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
  )

  if (!res.ok) {
    const err = await res.json()
    throw new Error(err?.error?.message || 'Vision API 오류')
  }

  onProgress?.(80, '텍스트 분석 중...')
  const data = await res.json()
  const rawText = data.responses?.[0]?.fullTextAnnotation?.text || ''

  onProgress?.(95, '정보 추출 중...')
  return parseReceiptText(rawText)
}

function parseReceiptText(rawText) {
  const lines = rawText.split('\n').map(l => l.trim()).filter(Boolean)
  return {
    amount:   extractAmount(rawText),
    date:     extractDate(rawText),
    merchant: extractMerchant(lines),
    category: detectCategory(rawText, lines[0] || ''),
    rawText
  }
}

function extractAmount(text) {
  // 합계/총액 키워드 우선
  const totalPatterns = [
    /합\s*계\s*[：:\s]*([0-9,]+)/,
    /총\s*액\s*[：:\s]*([0-9,]+)/,
    /결제\s*금액\s*[：:\s]*([0-9,]+)/,
    /받을\s*금액\s*[：:\s]*([0-9,]+)/,
    /청구\s*금액\s*[：:\s]*([0-9,]+)/,
    /승인\s*금액\s*[：:\s]*([0-9,]+)/,
    /판매\s*금액\s*[：:\s]*([0-9,]+)/,
    /total\s*[：:\s]*([0-9,]+)/i,
    /amount\s*[：:\s]*([0-9,]+)/i,
  ]
  for (const p of totalPatterns) {
    const m = text.match(p)
    if (m) {
      const v = parseInt(m[1].replace(/,/g, ''))
      if (v >= 100) return v
    }
  }

  // ₩ 또는 원 앞의 숫자
  const wonPatterns = [
    /₩\s*([0-9,]+)/g,
    /([0-9,]+)\s*원/g,
  ]
  for (const p of wonPatterns) {
    const matches = [...text.matchAll(p)]
      .map(m => parseInt(m[1].replace(/,/g, '')))
      .filter(n => n >= 100 && n <= 10_000_000)
      .sort((a, b) => b - a)
    if (matches.length) return matches[0]
  }

  // 가장 큰 숫자 폴백
  const amounts = [...text.matchAll(/[1-9][0-9]{2,}(?:,[0-9]{3})*/g)]
    .map(m => parseInt(m[0].replace(/,/g, '')))
    .filter(n => n >= 100 && n <= 10_000_000)
    .sort((a, b) => b - a)
  return amounts[0] || 0
}

function extractDate(text) {
  const patterns = [
    /(\d{4})[.\-\/](\d{1,2})[.\-\/](\d{1,2})/,
    /(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일/,
    /(\d{2})[.\-\/](\d{1,2})[.\-\/](\d{1,2})/,
    /(\d{4})(\d{2})(\d{2})/,   // 20260507
  ]
  for (const p of patterns) {
    const m = text.match(p)
    if (m) {
      let [, y, mo, d] = m
      if (y.length === 2) y = '20' + y
      const year = parseInt(y)
      const month = parseInt(mo)
      const day = parseInt(d)
      if (year >= 2000 && year <= 2099 && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
        return `${y}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`
      }
    }
  }
  return new Date().toISOString().split('T')[0]
}

function extractMerchant(lines) {
  const skipPatterns = [
    /^\d+$/,
    /^[0-9\s\-\(\)\+\.]+$/,
    /tel|fax|전화|팩스|주소|사업자|등록번호|영수증|receipt|tel\.|t\./i,
    /^[a-z0-9._%+\-]+@/i,
    /^https?:\/\//i,
    /합계|총액|결제|금액|부가세|vat|카드|승인/i,
    /^\d{3,4}-\d{3,4}-\d{4}$/,  // 전화번호
  ]
  for (const line of lines.slice(0, 8)) {
    if (line.length >= 2 && line.length <= 30 && !skipPatterns.some(p => p.test(line))) {
      return line.slice(0, 25)
    }
  }
  return ''
}

function detectCategory(text, merchant) {
  const combined = (text + ' ' + merchant).toLowerCase()
  const cats = [
    { name: '식비',   kw: ['식당','음식','레스토랑','카페','커피','점심','저녁','순대','삼겹','냉면','김밥','치킨','피자','버거','분식','도시락','빵','베이커리','스타벅스','투썸','이디야','맥도날드','롯데리아','편의점','cu','gs25','세븐일레븐','이마트24'] },
    { name: '교통',   kw: ['택시','버스','지하철','ktx','srt','주유','고속도로','톨게이트','주차','카카오t','티머니','카카오택시','우버'] },
    { name: '접대비', kw: ['거래처','접대','미팅','술집','바','호프','이자카야','포차','와인','위스키','맥주'] },
    { name: '숙박',   kw: ['호텔','모텔','숙박','게스트하우스','리조트','펜션','에어비앤비','야놀자','여기어때'] },
    { name: '소모품', kw: ['문구','사무용품','다이소','복사','인쇄','문방구','노트','서류','오피스'] },
  ]
  for (const cat of cats) {
    if (cat.kw.some(k => combined.includes(k))) return cat.name
  }
  return '기타'
}
