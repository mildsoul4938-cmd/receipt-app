const VISION_API_KEY = import.meta.env.VITE_GOOGLE_VISION_KEY


export async function compressImage(file, maxWidth = 4000) {
  // createImageBitmap({ imageOrientation: 'from-image' }) 은
  // EXIF 회전을 반영한 올바른 width/height를 반환함
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' })
    const scale = Math.min(1, maxWidth / bmp.width)
    const canvas = document.createElement('canvas')
    canvas.width  = Math.round(bmp.width  * scale)
    canvas.height = Math.round(bmp.height * scale)
    canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height)
    bmp.close?.()
    return canvas.toDataURL('image/jpeg', 0.95)
  } catch {
    // 구형 브라우저 폴백: EXIF 수동 처리
    return new Promise((resolve) => {
      const reader = new FileReader()
      reader.onload = (e) => {
        const orientation = getExifOrientation(e.target.result)
        const img = new Image()
        img.onload = () => {
          const W = img.width, H = img.height
          const swap = [5,6,7,8].includes(orientation)
          const scale = Math.min(1, maxWidth / (swap ? H : W))
          const outW = Math.round((swap ? H : W) * scale)
          const outH = Math.round((swap ? W : H) * scale)
          const canvas = document.createElement('canvas')
          canvas.width = outW; canvas.height = outH
          const ctx = canvas.getContext('2d')
          switch (orientation) {
            case 3: ctx.translate(outW, outH); ctx.rotate(Math.PI); break
            case 6: ctx.translate(outW, 0);   ctx.rotate(Math.PI / 2); break
            case 8: ctx.translate(0, outH);   ctx.rotate(-Math.PI / 2); break
          }
          ctx.drawImage(img, 0, 0, W * scale, H * scale)
          resolve(canvas.toDataURL('image/jpeg', 0.95))
        }
        img.src = e.target.result
      }
      reader.readAsDataURL(file)
    })
  }
}

function getExifOrientation(dataUrl) {
  try {
    const bin = atob(dataUrl.split(',')[1].slice(0, 2048))
    const view = new DataView(new Uint8Array([...bin].map(c => c.charCodeAt(0))).buffer)
    if (view.getUint16(0) !== 0xFFD8) return 1
    let off = 2
    while (off < view.byteLength - 4) {
      if (view.getUint16(off) === 0xFFE1) {
        const little = view.getUint16(off + 10) === 0x4949
        const ifd = view.getUint32(off + 14, little)
        const n   = view.getUint16(off + 10 + ifd, little)
        for (let i = 0; i < n; i++) {
          if (view.getUint16(off + 10 + ifd + 2 + i * 12, little) === 0x0112)
            return view.getUint16(off + 10 + ifd + 2 + i * 12 + 8, little)
        }
        break
      }
      off += 2 + view.getUint16(off + 2)
    }
  } catch {}
  return 1
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
  // 키워드 그룹별로 금액 후보 추출
  function findByKeyword(pattern) {
    for (let i = 0; i < lines.length; i++) {
      if (pattern.test(lines[i])) {
        const candidates = []
        for (let j = i; j <= i + 5 && j < lines.length; j++) {
          candidates.push(...extractNumbers(lines[j]))
        }
        if (candidates.length) return Math.max(...candidates)
      }
    }
    return null
  }

  // 1) 합계 계열 금액  ("총 계:" / "합 계:" / "총 액:" 모두 처리)
  const totalAmt = findByKeyword(/합\s*계|총\s*계|총\s*액|total/i)

  // 2) 실제 결제(카드/현금) 금액
  //    "카 드:" 단독 줄은 결제금액, "카드 NO:" 줄은 제외
  const paidAmt = findByKeyword(/결제\s*금액|실\s*결제|승인\s*금액|청구\s*금액|받을\s*금액|내야\s*할\s*금액|카\s*드\s*매\s*출|카\s*드\s*금액|^카\s*드\s*[：:](?!\s*N)/im)

  // 3) 크로스체크: 둘 다 있으면 비교
  if (totalAmt && paidAmt) {
    // 일치하거나 10% 이내 오차면 합계 사용 (할인/부가세 차이 허용)
    if (Math.abs(totalAmt - paidAmt) / Math.max(totalAmt, paidAmt) < 0.1) {
      return Math.max(totalAmt, paidAmt)
    }
    // 다르면 실제 결제금액 우선 (카드승인금액이 진짜 납부액)
    return paidAmt
  }
  if (paidAmt) return paidAmt
  if (totalAmt) return totalAmt

  // 4) 판매금액/주유금액 등 기타 키워드
  const otherAmt = findByKeyword(/판매\s*금액|주유\s*금액|거래\s*금액|소\s*계|subtotal/i)
  if (otherAmt) return otherAmt

  // 5) ₩ 또는 숫자+원 패턴
  const wonMatch = rawText.match(/₩\s*([0-9,]+)/) || rawText.match(/([0-9,]+)\s*원/)
  if (wonMatch) {
    const v = parseInt(wonMatch[1].replace(/,/g, ''))
    if (v >= 1000 && v <= 10_000_000) return v
  }

  // 6) 모든 금액 후보 중 최댓값 (최후 수단)
  const allNums = lines.flatMap(extractNumbers).filter(n => n >= 1000 && n <= 10_000_000)
  if (allNums.length) return Math.max(...allNums)

  return 0
}

function extractNumbers(line) {
  // 전화번호 패턴, 날짜, 시간, 카드번호, 승인번호 등 제거 후 숫자 추출
  const cleaned = line
    .replace(/\d{2,4}[-\s]\d{3,4}[-\s]\d{4}/g, '')        // 전화번호 (02-3467-4530)
    .replace(/\d{4}[-\s]\d{2,4}[-\s]\d{4}[-\s\*\d]+/g, '') // 카드번호 (5585-26**-****)
    .replace(/\d+[\*]+[\d\*]*/g, '')                       // 카드번호 (558526***** 별표형)
    .replace(/\d{4}[.\-\/]\d{1,2}[.\-\/]\d{1,2}/g, '')    // 날짜 (2026-03-06)
    .replace(/\d{1,2}:\d{2}:\d{2}/g, '')                  // 시간 (13:09:45)
    .replace(/\b\d{7,}\b/g, '')                            // 8자리 이상 승인번호 등

  return [...cleaned.matchAll(/[0-9]{1,3}(?:,[0-9]{3})+|[0-9]{4,7}/g)]
    .map(m => parseInt(m[0].replace(/,/g, '')))
    .filter(n => n >= 1000 && n <= 10_000_000)
}

// ── 날짜 추출 ─────────────────────────────────────────────────────────────
function extractDate(text) {
  // 요일 표기 제거 (예: 2026.05.06(수))
  const cleaned = text.replace(/\([월화수목금토일]\)/g, '')

  const patterns = [
    // YYYY-MM-DD, YYYY.MM.DD, YYYY/MM/DD
    /(\d{4})[.\-\/](\d{1,2})[.\-\/](\d{1,2})/,
    // YYYY년 MM월 DD일
    /(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일/,
    // YY.MM.DD, YY/MM/DD (2-digit year)
    /(\d{2})[.\-\/](\d{1,2})[.\-\/](\d{1,2})/,
    // YYYYMMDD (8자리 붙어있는 경우)
    /\b(\d{4})(\d{2})(\d{2})\b/,
  ]

  for (const p of patterns) {
    const m = cleaned.match(p)
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
    if (line.length < 2 || line.length > 40) return true

    // 글자 사이 공백이 많은 헤더 ("현 금 영 수 증", "영 수 증" 등)
    if (/^([가-힣a-z]\s){2,}/i.test(line)) return true

    // 영수증 유형 헤더 (부분 OCR 포함: "수증", "영수" 등)
    if (/영\s*수\s*증|수\s*증|영\s*수|현\s*금\s*영\s*수|customer\s*copy|merchant\s*copy|간이\s*영수|세금\s*계산/i.test(line)) return true
    // 고객용/가맹점용 표기
    if (/고\s*객\s*용|가\s*맹\s*점\s*용|merchant\s*copy|customer\s*copy/i.test(line)) return true

    // 특수문자로 시작하거나 감싸인 줄
    if (/^[\[\]\*\=\-\#\{\}\/\\|_~<>]/.test(line)) return true
    if (/[\[\]]{2,}/.test(line)) return true
    if (/^[─━═\-=*#]+$/.test(line)) return true  // 구분선

    // 숫자·기호만으로 이루어진 줄
    if (/^[0-9\s\-\.\(\)\+\#\*]+$/.test(line)) return true

    // 전화번호
    if (/\d{2,4}[-\s]\d{3,4}[-\s]\d{4}/.test(line)) return true
    if (/tel|fax|☎/i.test(line)) return true

    // 주소/사업자/영수증 관련 키워드
    if (/주\s*소|사업자|등록번호|영수증|receipt|합계|금액|부가세|vat|결제|승인|날짜|일시|거래|시간|카드|승인/i.test(line)) return true

    // OCR이 영수증 헤더 레이블만 합쳐서 읽는 경우 (예: "상대전주상", "상호대표전화")
    if (/^[상대전주사]/.test(line) && line.length <= 8 && !/\d/.test(line) &&
        /상|대표|전화|주소/.test(line)) return true

    // "상 호:" "대 표:" "전 화:" 등 레이블 줄 (값이 없거나 1글자인 경우 노이즈)
    if (/^(상\s*호|대\s*표|전\s*화|주\s*소)\s*[：:]/.test(line)) return true

    // 대기번호, 주문번호, 테이블번호 등 번호 키워드
    if (/대기\s*번호|주문\s*번호|테이블|table|order\s*no|receipt\s*no|영수증\s*번호/i.test(line)) return true

    // 콜론 두 개 패턴 (대기번호:: 031 등)
    if (/::/.test(line)) return true

    // 이메일
    if (/[a-z0-9._%+\-]+@/i.test(line)) return true

    // URL
    if (/https?:\/\/|www\./i.test(line)) return true

    // 사업자 등록번호 형식 (123-45-67890)
    if (/\d{3}-\d{2}-\d{5}/.test(line)) return true

    // 카드번호 패턴 (****-****-****-****)
    if (/[\d\*]{4}[-\s][\d\*]{4}[-\s]/.test(line)) return true

    return false
  }

  // 편의점/브랜드 체인점 명칭 정규화
  function normalizeBrand(line) {
    // "CU 홍대점" → "CU 홍대점" 유지, 하지만 브랜드명만 있으면 그대로
    const chainMatch = line.match(/^(CU|GS25|GS\s*25|세븐일레븐|7-?eleven|이마트24|미니스톱|스타벅스|투썸|이디야|메가커피|빽다방|롯데리아|맥도날드|버거킹|KFC|서브웨이|파리바게뜨|뚜레쥬르|올리브영|다이소)\s*(.{0,15})/i)
    if (chainMatch) return chainMatch[0].trim().slice(0, 25)
    return line
  }

  // 1) 가맹점 키워드 뒤에 오는 값 우선 (공백 포함 패턴: "점 포 명", "상 호" 등)
  for (const line of lines) {
    const m = line.match(/(?:가\s*맹\s*점|상\s*호|점\s*포\s*명|점\s*명|포\s*명|업\s*체\s*명|상\s*점\s*명|사\s*업\s*장|사\s*업\s*체)\s*[：:]\s*(.+)/)
    if (m && m[1].trim().length >= 1) return m[1].trim().slice(0, 25)
  }

  // 1-b) OCR이 "상 호" → "상" + "호:값" 두 줄로 쪼갠 경우
  for (const line of lines) {
    const m = line.match(/^호\s*[：:]\s*(.+)/)
    if (m && m[1].trim().length >= 1) return m[1].trim().slice(0, 25)
  }

  // 2) 노이즈 아닌 첫 번째 의미있는 줄
  for (const line of lines.slice(0, 20)) {
    if (!isNoise(line)) return normalizeBrand(line).slice(0, 25)
  }
  return ''
}

// ── 카테고리 감지 ─────────────────────────────────────────────────────────
function detectCategory(text, merchant) {
  const combined = (text + ' ' + merchant).toLowerCase()

  const cats = [
    {
      name: '식사',
      kw: [
        // 음식점
        '식당','음식','레스토랑','푸드','한식','중식','일식','양식','분식',
        '삼겹','냉면','김밥','치킨','피자','버거','도시락','순대','곱창',
        '짜장','짬뽕','짬짜','탕수','만두','볶음밥','복쌈','쌈밥','갈비',
        '삼계','설렁','해장','국밥','된장','부대찌개','찌개','수제비',
        '정식','백반','돈까스','우동','라멘','라면','초밥','회','삼겹살',
        // 카페
        '카페','커피','스타벅스','투썸','이디야','맥도날드','롯데리아',
        '버거킹','kfc','서브웨이','빽다방','메가커피','컴포즈','공차',
        // 빵
        '빵','베이커리','파리바게뜨','뚜레쥬르','성심당',
        // 편의점 (음식 구매)
        '편의점','cu ','gs25','gs 25','세븐일레븐','7-eleven','이마트24','미니스톱',
        // 배달앱
        '배달의민족','요기요','쿠팡이츠','배민',
        // 마트/슈퍼 (식품)
        '이마트','롯데마트','홈플러스','마트','슈퍼','식품',
      ]
    },
    {
      name: '교통',
      kw: [
        '택시','카카오t','카카오택시','우버','타다',
        '버스','지하철','전철','티머니',
        'ktx','srt','코레일','무궁화','새마을','itx',
        '주유','주유소','sk에너지','gs칼텍스','현대오일뱅크','s-oil','오일','에너지',
        '고속도로','톨게이트','하이패스','통행료',
        '주차','파킹','parking',
        '쏘카','그린카','렌트','렌터카',
        '항공','대한항공','아시아나','진에어','제주항공',
      ]
    },
    {
      name: '접대비',
      kw: [
        '거래처','접대','미팅','비즈니스',
        '술집','바 ','호프','이자카야','포차','선술집',
        '와인','위스키','맥주','소주','양주',
        '룸살롱','노래방','클럽',
      ]
    },
    {
      name: '숙박',
      kw: [
        '호텔','모텔','숙박','게스트하우스','리조트',
        '펜션','에어비앤비','야놀자','여기어때','호스텔',
        'hotel','resort','inn',
      ]
    },
    {
      name: '소모품',
      kw: [
        '문구','사무용품','다이소','복사','인쇄','문방구',
        '노트','서류','오피스','office','프린터','토너',
        '올리브영','드럭스토어','약국','cvs',
      ]
    },
    {
      name: '통신/IT',
      kw: [
        'kt','skt','sk텔레콤','lg유플러스','알뜰폰',
        '인터넷','통신','핸드폰','스마트폰',
        '애플','apple','삼성','갤럭시',
        '소프트웨어','구독','subscription',
      ]
    },
    {
      name: '의료비',
      kw: [
        '병원','의원','클리닉','치과','한의원','약국','의약',
        '진료','처방','검사','건강',
        'hospital','clinic','pharmacy',
      ]
    },
    {
      name: '사무 장비',
      kw: [
        '컴퓨터','노트북','모니터','키보드','마우스','프린터','스캐너',
        '복합기','빔프로젝터','프로젝터','태블릿','ipad','갤럭시탭',
        'usb','하드디스크','ssd','메모리','케이블','충전기','어댑터',
        '삼성전자','lg전자','애플','apple store','microsoft',
        '전산','it장비','사무기기','전자제품',
      ]
    },
  ]

  for (const cat of cats) {
    if (cat.kw.some(k => combined.includes(k))) return cat.name
  }
  return '기타'
}
