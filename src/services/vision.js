import Tesseract from 'tesseract.js'

export async function compressImage(file, maxWidth = 1200) {
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
        resolve(canvas.toDataURL('image/jpeg', 0.85))
      }
      img.src = e.target.result
    }
    reader.readAsDataURL(file)
  })
}

export async function analyzeReceipt(imageDataUrl, onProgress) {
  const result = await Tesseract.recognize(imageDataUrl, 'kor+eng', {
    logger: ({ status, progress }) => {
      if (!onProgress) return
      if (status === 'loading tesseract core')         onProgress(5,  '엔진 로딩 중...')
      else if (status === 'initializing tesseract')    onProgress(15, '초기화 중...')
      else if (status === 'loading language traineddata') onProgress(30, '한국어 언어 데이터 로딩 중...\n(첫 실행 시 다운로드, 이후 캐시됨)')
      else if (status === 'initializing api')          onProgress(60, '인식 준비 중...')
      else if (status === 'recognizing text')          onProgress(60 + Math.round(progress * 35), '영수증 인식 중...')
    }
  })

  return parseReceiptText(result.data.text)
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
  const totalPatterns = [
    /합\s*계\s*[:：]?\s*([0-9,]+)/,
    /총\s*액\s*[:：]?\s*([0-9,]+)/,
    /결제\s*금액\s*[:：]?\s*([0-9,]+)/,
    /받을\s*금액\s*[:：]?\s*([0-9,]+)/,
    /청구\s*금액\s*[:：]?\s*([0-9,]+)/,
    /total\s*[:：]?\s*([0-9,]+)/i,
  ]
  for (const p of totalPatterns) {
    const m = text.match(p)
    if (m) { const v = parseInt(m[1].replace(/,/g, '')); if (v > 0) return v }
  }
  const amounts = [...text.matchAll(/[₩￦]?\s*([1-9][0-9]{2,}(?:,[0-9]{3})*)/g)]
    .map(m => parseInt(m[1].replace(/,/g, '')))
    .filter(n => n >= 100 && n <= 10000000)
    .sort((a, b) => b - a)
  return amounts[0] || 0
}

function extractDate(text) {
  const patterns = [
    /(\d{4})[.\-\/](\d{1,2})[.\-\/](\d{1,2})/,
    /(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일/,
    /(\d{2})[.\-\/](\d{1,2})[.\-\/](\d{1,2})/,
  ]
  for (const p of patterns) {
    const m = text.match(p)
    if (m) {
      let [, y, mo, d] = m
      if (y.length === 2) y = '20' + y
      return `${y}-${String(mo).padStart(2,'0')}-${String(d).padStart(2,'0')}`
    }
  }
  return new Date().toISOString().split('T')[0]
}

function extractMerchant(lines) {
  const skip = [/^\d+$/, /^[0-9\s\-\(\)\+]+$/, /tel|fax|전화|팩스|주소|사업자|등록번호|영수증|receipt/i, /^[a-z0-9._%+\-]+@/i]
  for (const line of lines.slice(0, 6)) {
    if (line.length >= 2 && !skip.some(p => p.test(line))) return line.slice(0, 25)
  }
  return ''
}

function detectCategory(text, merchant) {
  const combined = (text + ' ' + merchant).toLowerCase()
  const cats = [
    { name: '식비',   kw: ['식당','음식','레스토랑','카페','커피','점심','저녁','순대','삼겹','냉면','김밥','치킨','피자','버거','분식','도시락','빵','베이커리','스타벅스','투썸','이디야','맥도날드'] },
    { name: '교통',   kw: ['택시','버스','지하철','ktx','srt','주유','고속도로','톨게이트','주차','카카오T','티머니'] },
    { name: '접대비', kw: ['거래처','접대','미팅','술집','바','호프','이자카야','포차','와인','위스키'] },
    { name: '숙박',   kw: ['호텔','모텔','숙박','게스트하우스','리조트','펜션','에어비앤비','야놀자'] },
    { name: '소모품', kw: ['문구','사무용품','다이소','복사','인쇄','문방구','노트','서류'] },
  ]
  for (const cat of cats) {
    if (cat.kw.some(k => combined.includes(k))) return cat.name
  }
  return '기타'
}
