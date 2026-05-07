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
    amount:   extractAmount(lines, rawText),
    date:     extractDate(rawText),
    merchant: extractMerchant(lines),
    category: detectCategory(rawText, lines[0] || ''),
    rawText
  }
}

// ── 금액 추출 ─────────────────────────────────────────────────────────────
function extractAmount(lines, rawText) {
  // 1) 합계/결제 키워드가 있는 줄에서 숫자 추출 (줄 내부 또는 바로 다음 줄)
  const totalKeywords = /합\s*계|총\s*액|결제\s*금액|받을\s*금액|청구\s*금액|승인\s*금액|판매\s*금액|실\s*결제|total/i
  for (let i = 0; i < lines.length; i++) {
    if (totalKeywords.test(lines[i])) {
      // 같은 줄에서 숫자 찾기 (오른쪽 끝 숫자 = 금액)
      const nums = extractNumbers(lines[i])
      if (nums.length) return nums[nums.length - 1]  // 맨 마지막 숫자

      // 다음 줄에서 숫자 찾기
      for (let j = i + 1; j <= i + 2 && j < lines.length; j++) {
        const nextNums = extractNumbers(lines[j])
        if (nextNums.length) return nextNums[nextNums.length - 1]
      }
    }
  }

  // 2) ₩ 또는 원 앞/뒤의 숫자
  const wonMatch = rawText.match(/₩\s*([0-9,]+)/) || rawText.match(/([0-9,]+)\s*원/)
  if (wonMatch) {
    const v = parseInt(wonMatch[1].replace(/,/g, ''))
    if (v >= 100 && v <= 2_000_000) return v
  }

  // 3) 모든 금액 후보 중 합리적 범위의 최댓값
  const allNums = lines.flatMap(extractNumbers)
    .filter(n => n >= 100 && n <= 2_000_000)
  if (allNums.length) return Math.max(...allNums)

  return 0
}

function extractNumbers(line) {
  return [...line.matchAll(/[0-9]{1,3}(?:,[0-9]{3})+|[0-9]{4,7}/g)]
    .map(m => parseInt(m[0].replace(/,/g, '')))
    .filter(n => n >= 100 && n <= 2_000_000)
}

// ── 날짜 추출 ─────────────────────────────────────────────────────────────
function extractDate(text) {
  const patterns = [
    /(\d{4})[.\-\/](\d{1,2})[.\-\/](\d{1,2})/,
    /(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일/,
    /(\d{2})[.\-\/](\d{1,2})[.\-\/](\d{1,2})/,
    /(\d{4})(\d{2})(\d{2})/,
  ]
  for (const p of patterns) {
    const m = text.match(p)
    if (m) {
      let [, y, mo, d] = m
      if (y.length === 2) y = '20' + y
      const year = parseInt(y), month = parseInt(mo), day = parseInt(d)
      if (year >= 2020 && year <= 2035 && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
        return `${y}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`
      }
    }
  }
  return new Date().toISOString().split('T')[0]
}

// ── 가맹점 추출 ───────────────────────────────────────────────────────────
function extractMerchant(lines) {
  // 노이즈 줄 판단
  function isNoise(line) {
    if (line.length < 2 || line.length > 30) return true
    // 특수문자로 시작하거나 감싸인 줄 (ex: [주소], *** 제목 ***)
    if (/^[\[\]\*\=\-\#\{\}\/\\|]/.test(line)) return true
    if (/[\[\]]{2,}/.test(line)) return true
    // 숫자·기호만으로 이루어진 줄
    if (/^[0-9\s\-\.\(\)\+\#]+$/.test(line)) return true
    // 전화번호
    if (/\d{2,4}[-\s]\d{3,4}[-\s]\d{4}/.test(line)) return true
    // 주소/사업자/영수증 등 키워드
    if (/tel|fax|전화|팩스|주소|사업자|등록번호|영수증|receipt|합계|금액|부가세|vat|결제|승인|날짜|일시/i.test(line)) return true
    // 이메일
    if (/[a-z0-9._%+\-]+@/i.test(line)) return true
    return false
  }

  // 가맹점 키워드 뒤에 오는 값 우선
  for (const line of lines) {
    const m = line.match(/(?:가맹점|상\s*호|점\s*명|사업장)\s*[：:]\s*(.+)/)
    if (m && m[1].trim().length >= 2) return m[1].trim().slice(0, 25)
  }

  // 노이즈 아닌 첫 번째 줄
  for (const line of lines.slice(0, 10)) {
    if (!isNoise(line)) return line.slice(0, 25)
  }
  return ''
}

// ── 카테고리 감지 ─────────────────────────────────────────────────────────
function detectCategory(text, merchant) {
  const combined = (text + ' ' + merchant).toLowerCase()
  const cats = [
    { name: '식비',   kw: ['식당','음식','레스토랑','카페','커피','점심','저녁','순대','삼겹','냉면','김밥','치킨','피자','버거','분식','도시락','빵','베이커리','스타벅스','투썸','이디야','맥도날드','롯데리아','편의점','cu ','gs25','세븐일레븐','이마트24','바거킹','kfc','서브웨이'] },
    { name: '교통',   kw: ['택시','버스','지하철','ktx','srt','주유','고속도로','톨게이트','주차','카카오t','티머니','우버','쏘카','그린카'] },
    { name: '접대비', kw: ['거래처','접대','미팅','술집','바 ','호프','이자카야','포차','와인','위스키','맥주'] },
    { name: '숙박',   kw: ['호텔','모텔','숙박','게스트하우스','리조트','펜션','에어비앤비','야놀자','여기어때'] },
    { name: '소모품', kw: ['문구','사무용품','다이소','복사','인쇄','문방구','노트','서류','오피스'] },
  ]
  for (const cat of cats) {
    if (cat.kw.some(k => combined.includes(k))) return cat.name
  }
  return '기타'
}
