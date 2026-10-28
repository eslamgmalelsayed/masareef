export const CATEGORIES = [
  { id: 'rent', name: 'سكن وإيجار', color: '#2563eb', icon: '🏠' },
  { id: 'delivery', name: 'توصيل أكل', color: '#ea580c', icon: '🛵' },
  { id: 'grocery', name: 'سوبر ماركت وبقالة', color: '#16a34a', icon: '🛒' },
  { id: 'food', name: 'مطاعم وكافيهات', color: '#db2777', icon: '☕' },
  { id: 'transport', name: 'مواصلات وبنزين', color: '#0891b2', icon: '🚗' },
  { id: 'travel', name: 'سفر وطيران وفنادق', color: '#0369a1', icon: '✈️' },
  { id: 'shop', name: 'تسوق ومحلات', color: '#e11d48', icon: '🛍️' }, // أي محل التطبيق مايعرفهوش بيروح هنا
  { id: 'online', name: 'تسوق أونلاين', color: '#9333ea', icon: '📦' },
  { id: 'clothes', name: 'ملابس وموضة', color: '#c026d3', icon: '👕' },
  { id: 'bnpl', name: 'تقسيط (تابي / تمارا)', color: '#7c3aed', icon: '💳' },
  { id: 'telecom', name: 'اتصالات وإنترنت', color: '#0d9488', icon: '📱' },
  { id: 'subs', name: 'اشتراكات وأدوات تقنية', color: '#4f46e5', icon: '💻' },
  { id: 'health', name: 'صحة وتأمين', color: '#dc2626', icon: '🩺' },
  { id: 'edu', name: 'تعليم وكتب وقيادة', color: '#65a30d', icon: '📚' },
  { id: 'sport', name: 'لعب كرة', color: '#15803d', icon: '⚽' },
  { id: 'gov', name: 'حكومية ورسوم', color: '#475569', icon: '🏛️' },
  { id: 'bills', name: 'فواتير وسداد', color: '#a16207', icon: '🧾' },
  { id: 'paypal', name: 'PayPal (متنوع)', color: '#1d4ed8', icon: '🅿️' },
  { id: 'cash', name: 'سحب نقدي', color: '#ca8a04', icon: '💵' },
  { id: 'fee', name: 'رسوم بنكية', color: '#78716c', icon: '🏦' },
  { id: 'transfer', name: 'تحويلات لأشخاص', color: '#0f766e', icon: '↔️' },
  { id: 'intl', name: 'حوالات دولية', color: '#b45309', icon: '🌍' },
  { id: 'other', name: 'أخرى', color: '#94a3b8', icon: '•' },
  { id: 'ccpay', name: 'سداد بطاقات ائتمانية', color: '#64748b', icon: '💳', hidden: true }, // مش مصروف — تحويل لسداد الكريدت
  { id: 'self', name: 'بين حساباتك', color: '#64748b', icon: '🔁', hidden: true }, // تحويل من حساب ليك لحساب تاني ليك
]
export const CAT = Object.fromEntries(CATEGORIES.map((c) => [c.id, c]))

export const RULES = [
  ['rent', /EJAR|ايجار|إيجار/i],
  ['delivery', /HUNGER|KEETA|JAHEZ|TOYOU|TO YOU|MRSOOL|MARSOOL|CAREEM ?FOOD|NINJA|THE CHEFZ|CHEFZ|ELMENUS|TALABAT|SHGARDI|نينجا|جاهز|هنقر/i],
  ['grocery', /ALJAZEERA|ALJAZE|FIVE SAVINGS|OTHAIM|PANDA|DANUBE|TAMIMI|LULU|CARREFOUR|NESTO|HYPER|MARKET|MART\b|KEEMART|BAQALA|بقال|تموين|TAWFEER|TWFYR|ALTWFYR|SPRING|NABAA WATER|WATER|ميا|ARB MARKE|NWN|NOON AL|NWN AL|ZAHRA|BASIR|AL HAMMAD|HAMMADI|ASWAQ|SUPER|غذائية|MINI ?MARKET/i],
  ['food', /MQHY|مقهى|FALAFIL|COLD STONE|CAFE|COFFE|KAFE|كافيه|قهوة|KARAK|CHAI|TEA|SHAWERMA|SHAWARMA|شاورما|FOUL|FALAFEL|KUSHARI|KOSHARY|RESTU?RA?NT|RESTAURANT|مطعم|MTAM|M[AT]?TAM|GRILL|BURGER|PIZZA|KUDU|ALBAIK|BAIK|MCDONALD|KFC|HARDEE|DUNKIN|STARBUCKS|BARNS|HALF MILLION|DOSE|FISH|SAMAK|سمك|ABU AUF|ابو عوف|KAAKAT|KAAK|ETOILE|LEMON|JAD REST|SHEIKH|BAKERY|مخبز|FATAYER|SWEET|حلويات|JUICE|عصير|THATI|KARTNGO|FAWAL|FOOD|ALREEF|ISTANBUL|HALA\b|GHELAL|GLAL|LAMST|NAJLAA|KHALED ABEL|TARIQ AHM|SFRT|QAMAH|DOUGH|DONUT|KITCHEN|مطبخ|AL-NUMAN|NAWAF|MANAZL|CATALIST|FISHERMAN/i],
  ['transport', /UBER|CAREEM|JEENY|JENNY|BOLT|KAIIAN|NAFT|SASCO|ALDREES|PETROMIN|PETROL|STATION|محطة|بنزين|SAHEL|TRANSPORT|SAPTCO|PARKING|SALIK|TAXI|RIYADH METRO|DARB/i],
  ['travel', /ALMOSAFER|MOSAFER|SAUDIA|SAUDI AIR|FLYNAS|FLYADEAL|AGODA|BOOKING|HOTEL|فندق|AIRBNB|EGYPTAIR|WEGO|TRAVEL|GATHERN|THURAYA/i],
  ['online', /AMAZON|NOON|SHEIN|TEMU|NAMSHI|TRENDYOL|ALIEXPRESS|SALLA|سلة|ZID|IONETAG|MAYASEN|EMMA/i],
  ['clothes', /REDTAG|RED TAG|MAX |CENTREPOINT|CENTER ?POINT|H&M|ZARA|GIORDANO|SHOES|LC WAIKIKI|DEFACTO|SPLASH|AMERICAN EAGLE|PULL|BERSHKA|ELEGAN|OUD|عود|عطور|PERFUME|ALHARAM|ALHARM|HARAM|FASHION|ملابس|TAILOR|خياط/i],
  ['bnpl', /TABBY|TAMARA|تابي|تمارا/i],
  ['telecom', /VIRGIN|STC\b|SAUDI TEL|STCPOSTPA|MOBILY|ZAIN|SAWA|سوا|LEBARA|SALAM MOBILE|VODAFONE|WE-|CCA\*VF|TELECOM|الاتصالات|ONECARD|RED BULL MOBILE|FRIENDI/i],
  ['subs', /ZERO TO MASTERY|FRONTENDMASTERS|VUEMASTERY|WINDSURF|ANTHROPIC|OPENAI|CHATGPT|GOOGLE|APPLE|ICLOUD|NETFLIX|SPOTIFY|SHAHID|OSN|CLOUDFLARE|MICROSOFT|LINKEDIN|GITHUB|FIGMA|ADOBE|NETLIFY|VERCEL|CANVA|NOTION|YOUTUBE|DISNEY|STARZ|ANGHAMI|AWS|DIGITALOCEAN|NAMECHEAP|GODADDY|HOSTINGER|ENVATO|UDEMY|COURSERA|PREPLY|CURSOR|MIDJOURNEY|PAYPAL \*C|STEAM|PLAYSTATION|SONY|CREEM|LEMON ?SQUEEZY|PADDLE/i],
  ['health', /PHAR|NAHDI|DAWAA|DAWA|PHARM|صيدل|HOSPITAL|مستشفى|CLINIC|عيادة|DAR ALSHEFA|SHEFA|MEDICAL|DENTAL|BUPA|TAWUNIYA|TAMEENI|TAMEE|INSURANCE|تأمين|OPTIC|GULF HEAL|MEDGULF/i],
  ['sport', /MALAEB|MALAAB|MALAB\b|ملعب|ملاعب|FOOTBALL|SOCCER|STADIUM|ستاد|KORA|كورة/i],
  ['edu', /JARIR|DRIVING|DRI\b|DALLAH|NOURA DRI|SCHOOL|ACADEM|AKADIMAT|COURSE|BOOK|مكتبة|C3 COMICS/i],
  ['gov', /MOFA|ABSHER|MOI|QIWA|MUQEEM|وزارة|SADAD|ETIMAD|NAJIZ|SPL|WWW\.SAUDI|SAUDI POST|MOSADAQA|THE ECONOMIC|IQAMA/i],
  ['paypal', /PAYPAL|PAYMOB|ACCEPT/i],
]

const KIND_CAT = { transfer: 'transfer', intl: 'intl', cash: 'cash', gov: 'gov', fee: 'fee', ccpay: 'ccpay', ccxfer: 'ccpay' }

/** مفتاح ثابت للتاجر علشان التصنيف اليدوي يتطبق على كل عملياته */
export function merchantKey(name) {
  return String(name || '')
    .toUpperCase()
    .replace(/^(TAP|PAYPAL)\s*\*?\s*/, '')
    .replace(/[^A-Z0-9؀-ۿ]/g, '')
    .slice(0, 9)
}

/** مفتاح كامل لاسم المحل (للذكاء الاصطناعي: المحل ده اتسأل عليه قبل كده؟) */
export function merchantNorm(name) {
  return String(name || '').toUpperCase().replace(/^(TAP|PAYPAL)\s*\*?\s*/, '').replace(/[^A-Z0-9؀-ۿ]/g, '').slice(0, 40)
}

/** تصنيف بالقواعد الثابتة بس (من غير الذكاء الاصطناعي) — بيتبعت للذكاء الاصطناعي كتلميح */
export function ruleCat(tx) {
  if (tx.k === 'bill') {
    if (tx.a >= 10000) return 'rent'
    if (/الاتصالات|STC|موبايلي|زين/.test(tx.m)) return 'telecom'
    return 'bills'
  }
  for (const [c, rx] of RULES) if (rx.test(tx.m)) return c
  return 'shop'
}

/**
 * ai: { norm: { b: اسم المحل الموحّد, c: البند } } من الذكاء الاصطناعي.
 * الترتيب: تصنيفك بإيدك ← نوع العملية (تحويل/سحب/رسوم) ← الذكاء الاصطناعي ← القواعد الثابتة
 */
export function categorize(tx, overrides = {}, ai = null) {
  if (tx.k === 'ccpay' || tx.k === 'ccxfer') return 'ccpay'
  const key = merchantKey(tx.m)
  if (key && overrides[key]) return overrides[key]
  if (tx.mr) { const k0 = merchantKey(tx.mr); if (k0 && overrides[k0]) return overrides[k0] } // تصنيف قديم على الاسم قبل التوحيد
  if (KIND_CAT[tx.k]) return KIND_CAT[tx.k]
  const a = ai && ['purchase', 'bill', 'refund'].includes(tx.k) ? ai[merchantNorm(tx.mr || tx.m)] : null
  if (a && CAT[a.c] && !(tx.k === 'bill' && a.c === 'shop')) return a.c
  if (tx.k === 'bill') {
    if (tx.a >= 10000) return 'rent'
    if (/الاتصالات|STC|موبايلي|زين/.test(tx.m)) return 'telecom'
    return 'bills'
  }
  for (const [c, rx] of RULES) if (rx.test(tx.m)) return c
  // محل مش معروف → تسوق ومحلات (تقدر تنقله لأخرى أو لأي بند بإيدك)
  return 'shop'
}

export const TRANSFER_CATS = new Set(['transfer', 'intl'])

/** مجموعات البنود — للعرض والاختيار (البند نفسه مبيتغيرش) */
export const GROUPS = [
  { id: 'g_shop', name: 'تسوق', icon: '🛍️', color: '#e11d48', cats: ['shop', 'online', 'clothes'] },
  { id: 'g_food', name: 'أكل', icon: '🍽️', color: '#db2777', cats: ['grocery', 'food', 'delivery'] },
  { id: 'g_home', name: 'بيت وفواتير', icon: '🏠', color: '#2563eb', cats: ['rent', 'bills', 'telecom', 'subs'] },
  { id: 'g_move', name: 'مواصلات وسفر', icon: '🚗', color: '#0891b2', cats: ['transport', 'travel'] },
  { id: 'g_life', name: 'صحة وتعليم وحكومة', icon: '🩺', color: '#dc2626', cats: ['health', 'edu', 'gov'] },
  { id: 'g_money', name: 'فلوس وأقساط', icon: '💳', color: '#7c3aed', cats: ['bnpl', 'cash', 'fee', 'paypal'] },
  { id: 'g_people', name: 'تحويلات', icon: '↔️', color: '#0f766e', cats: ['transfer', 'intl'] },
  { id: 'g_sport', name: 'رياضة', icon: '⚽', color: '#15803d', cats: ['sport'] },
  { id: 'g_other', name: 'أخرى', icon: '•', color: '#94a3b8', cats: ['other'] },
]
export const GROUP_OF = Object.fromEntries(GROUPS.flatMap((g) => g.cats.map((c) => [c, g.id])))
export const GROUP = Object.fromEntries(GROUPS.map((g) => [g.id, g]))

/**
 * بنود عملها الذكاء الاصطناعي (محل مالوش بند مناسب → بند جديد في المجموعة المناسبة).
 * { id: { name, icon, group } } — بتتضاف لنفس القوايم علشان كل الشاشات تشوفها
 */
export function registerAiCats(map) {
  let n = 0
  for (const [id, c] of Object.entries(map || {})) {
    if (CAT[id] || !/^x_[a-z0-9]+$/.test(id)) continue
    const g = GROUP[c.group] || GROUP.g_shop
    const cat = { id, name: String(c.name || 'بند').slice(0, 24), icon: String(c.icon || '•').slice(0, 4), color: g.color, ai: 1 }
    CATEGORIES.splice(CATEGORIES.findIndex((x) => x.id === 'other'), 0, cat) // قبل "أخرى"
    CAT[id] = cat
    g.cats.push(id)
    GROUP_OF[id] = g.id
    n++
  }
  return n
}
