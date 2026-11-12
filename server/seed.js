/**
 * Demo veri üretici.
 *
 * Amaç: platformun tüm ekranlarını gerçekçi yoğunlukta çalıştırmak.
 * Üretilen ilanlar TAMAMEN KURGUDUR (adres, ofis adı, fiyat). Amaç demo;
 * canlı veri için "Veri Merkezi" ekranından CSV/XML içe aktarın.
 */
import { db, migrate, nowISO, setSetting, tableCount } from './db.js'
import { DISTRICTS, POIS } from './lib/districts.js'

const reset = process.argv.includes('--reset')

// --- deterministik PRNG (aynı seed -> aynı demo veri) ---
function mulberry32(a) {
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const rnd = mulberry32(20261112)
const pick = (arr) => arr[Math.floor(rnd() * arr.length)]
const between = (min, max) => min + rnd() * (max - min)
const intBetween = (min, max) => Math.floor(between(min, max + 1))
const round = (v, d = 0) => Math.round(v * 10 ** d) / 10 ** d

const OFFICES = [
  'Marmara Gayrimenkul',
  'Boğaz Emlak',
  'Kuzey Yatırım Danışmanlığı',
  'Anadolu Konut Ofisi',
  'Vadi Real Estate',
  'Şehir Portföy',
  'Liman Gayrimenkul',
  'Metropol Danışmanlık'
]
const NEIGHBORHOOD_SUFFIX = ['Merkez', 'Yeni', 'Bahçe', 'Sahil', 'Çamlık', 'Gül', 'Kartal', 'Yeşil']
const HEATING = ['Kombi (Doğalgaz)', 'Merkezi', 'Yerden Isıtma', 'Klima', 'Soba']
const SELLERS = [
  ['emlak_ofisi', 0.62],
  ['sahibinden', 0.27],
  ['insaat_firmasi', 0.11]
]

function weightedPick(pairs) {
  const r = rnd()
  let acc = 0
  for (const [value, w] of pairs) {
    acc += w
    if (r <= acc) return value
  }
  return pairs[pairs.length - 1][0]
}

const ROOM_OPTIONS = [
  ['1+1', 0.18, 55, 75],
  ['2+1', 0.34, 85, 115],
  ['3+1', 0.29, 120, 155],
  ['4+1', 0.12, 155, 220],
  ['2+2', 0.05, 100, 140],
  ['5+1', 0.02, 210, 320]
]

function pickRooms(dealType) {
  const r = rnd()
  let acc = 0
  const options = dealType === 'kiralik' ? [...ROOM_OPTIONS.slice(0, 5)] : ROOM_OPTIONS
  for (const [rooms, w, min, max] of options) {
    acc += w
    if (r <= acc) return { rooms, min, max }
  }
  return { rooms: '2+1', min: 85, max: 115 }
}

function isoDaysAgo(days) {
  return new Date(Date.now() - days * 86400000).toISOString()
}

function monthKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function seedDistricts() {
  const stmt = db.prepare(
    `INSERT INTO districts (id, name, side, lat, lng, benchmark_sale_m2, benchmark_rent_m2, population, sales_12m, heat)
     VALUES (?,?,?,?,?,?,?,?,?,?)
     ON CONFLICT(id) DO UPDATE SET
       name=excluded.name, side=excluded.side, lat=excluded.lat, lng=excluded.lng,
       benchmark_sale_m2=excluded.benchmark_sale_m2, benchmark_rent_m2=excluded.benchmark_rent_m2,
       population=excluded.population, sales_12m=excluded.sales_12m, heat=excluded.heat`
  )
  for (const d of DISTRICTS) {
    stmt.run(d.id, d.name, d.side, d.lat, d.lng, d.benchmarkSaleM2, d.benchmarkRentM2, d.population, d.sales12m, d.heat)
  }
}

function seedPois() {
  const stmt = db.prepare(`INSERT OR REPLACE INTO pois (id, kind, name, lat, lng, line) VALUES (?,?,?,?,?,?)`)
  for (const p of POIS) stmt.run(p.id, p.kind, p.name, p.lat, p.lng, p.line)
}

function seedMarketIndex() {
  const stmt = db.prepare(
    `INSERT OR REPLACE INTO market_index (district, month, sale_m2, rent_m2, volume) VALUES (?,?,?,?,?)`
  )
  for (const d of DISTRICTS) {
    // 18 aylık seri: yıllık ~%32 nominal artış + mevsimsel gürültü
    let sale = d.benchmarkSaleM2 * 0.76
    let rent = d.benchmarkRentM2 * 0.74
    const now = new Date()
    for (let i = 17; i >= 0; i--) {
      const dt = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const growth = 1 + between(0.008, 0.026)
      const noise = between(0.985, 1.02)
      sale = Math.round((sale * growth * noise) / 500) * 500
      rent = Math.round(rent * (1 + between(0.006, 0.022)) * noise)
      const seasonal = 0.85 + 0.3 * Math.sin(((dt.getMonth() + 9) / 12) * Math.PI * 2)
      const volume = Math.round((d.sales12m / 12) * between(0.7, 1.3) * seasonal)
      stmt.run(d.name, monthKey(dt), sale, rent, volume)
    }
  }
}

function generateListings() {
  const insert = db.prepare(`
    INSERT INTO listings (
      external_id, source, url, title, property_type, deal_type, district, neighborhood,
      lat, lng, m2_net, m2_gross, rooms, floor, total_floors, building_age, heating, dues,
      price, price_per_m2, seller_type, office_name, first_seen, last_seen,
      price_drops, price_delta_pct, status, fingerprint, created_at, updated_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
  const pHist = db.prepare(`INSERT INTO price_history (listing_id, observed_at, price) VALUES (?,?,?)`)

  let count = 0
  for (const d of DISTRICTS) {
    const listingsPerDistrict = Math.round(6 + d.heat / 4.2) // ~13-26
    for (let i = 0; i < listingsPerDistrict; i++) {
      const dealType = rnd() < 0.72 ? 'satilik' : 'kiralik'
      const { rooms, min, max } = pickRooms(dealType)
      const m2Net = intBetween(min, max)
      const m2Gross = Math.round(m2Net * between(1.05, 1.32))
      const benchmarkM2 = dealType === 'satilik' ? d.benchmarkSaleM2 : d.benchmarkRentM2
      const qualityFactor = between(0.72, 1.32)
      const underpriced = rnd() < 0.12 ? between(0.66, 0.84) : 1
      const price =
        dealType === 'satilik'
          ? Math.round((m2Net * benchmarkM2 * qualityFactor * underpriced) / 5000) * 5000
          : Math.round((m2Net * benchmarkM2 * qualityFactor * underpriced) / 500) * 500
      const ppm2 = Math.round((price / m2Net) / 10) * 10

      const dom = rnd() < 0.55 ? intBetween(1, 30) : intBetween(31, 210)
      const drops = rnd() < 0.3 ? intBetween(1, 3) : 0
      const initialPrice = Math.round(price * (1 + drops * between(0.02, 0.09)))
      const deltaPct = drops ? round(((price - initialPrice) / initialPrice) * 100, 1) : 0

      const sellerType = weightedPick(SELLERS)
      const totalFloors = intBetween(3, 16)
      const floor = intBetween(0, totalFloors - 1)
      const buildingAge = intBetween(0, 45)
      const dues = dealType === 'satilik' ? intBetween(500, 6500) / 1 : intBetween(800, 9000)

      const lat = d.lat + between(-0.024, 0.024)
      const lng = d.lng + between(-0.03, 0.03)
      const fingerprint = `demo:${d.name}:${i}:${dealType}:${rooms}:${m2Net}`

      const createdAt = isoDaysAgo(dom)
      const info = insert.run(
        `DM-${d.id}-${i + 1}`,
        'demo',
        null,
        `${d.name} ${rooms} ${m2Net} m² ${dealType === 'satilik' ? 'satılık' : 'kiralık'} daire`,
        'daire',
        dealType,
        d.name,
        `${pick(NEIGHBORHOOD_SUFFIX)} Mah.`,
        round(lat, 5),
        round(lng, 5),
        m2Net,
        m2Gross,
        rooms,
        floor,
        totalFloors,
        buildingAge,
        pick(HEATING),
        dues,
        price,
        ppm2,
        sellerType,
        sellerType === 'emlak_ofisi' ? pick(OFFICES) : null,
        createdAt,
        nowISO(),
        drops,
        deltaPct,
        'aktif',
        fingerprint,
        createdAt,
        nowISO()
      )
      const listingId = Number(info.lastInsertRowid)
      pHist.run(listingId, createdAt, initialPrice)
      if (drops) {
        for (let k = 1; k <= drops; k++) {
          const step = Math.round(initialPrice - ((initialPrice - price) * k) / drops)
          pHist.run(listingId, isoDaysAgo(Math.max(0, dom - k * Math.max(2, Math.floor(dom / (drops + 1))))), step)
        }
      }
      count++
    }
  }
  return count
}

function refreshBenchmarks() {
  db.exec(`DELETE FROM benchmarks`)
  const rows = db.prepare(`SELECT district, deal_type, rooms, price_per_m2 FROM listings WHERE status='aktif'`).all()
  const groups = new Map()
  for (const r of rows) {
    const key = `${r.district}|${r.deal_type}|${r.rooms}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(r.price_per_m2)
  }
  const insert = db.prepare(
    `INSERT OR REPLACE INTO benchmarks (district, deal_type, rooms, median_m2, sample_size, updated_at) VALUES (?,?,?,?,?,?)`
  )
  for (const [key, values] of groups) {
    const [district, dealType, rooms] = key.split('|')
    values.sort((a, b) => a - b)
    const median = values[Math.floor(values.length / 2)]
    insert.run(district, dealType, rooms, Math.round(median), values.length, nowISO())
  }
  return groups.size
}

function seedMandates() {
  const rows = db.prepare(`SELECT id, district, neighborhood, price FROM listings WHERE deal_type='satilik' ORDER BY id LIMIT 6`).all()
  const names = ['A. Yılmaz', 'M. Demir', 'S. Kaya', 'H. Şahin', 'E. Çelik', 'N. Arslan']
  const types = ['munhasir', 'yari_munhasir', 'munhasir', 'acik', 'yari_munhasir', 'munhasir']
  const stmt = db.prepare(`
    INSERT INTO mandates (listing_id, owner_name, phone, district, neighborhood, mandate_type, status,
      commission_pct, starts_at, ends_at, doc_ref, lawful_basis, notes, demo, created_at, updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,'sozlesme',?,1,?,?)`)
  const ts = nowISO()
  rows.forEach((r, i) => {
    const start = isoDaysAgo(90 - i * 7)
    const endDays = [-8, 12, 45, 180, 24, 300][i] // biri süresi geçmiş, ikisi 30 gün içinde
    stmt.run(
      r.id,
      names[i],
      `0500 000 00 0${i + 1}`,
      r.district,
      r.neighborhood,
      types[i],
      'aktif',
      [2, 2, 3, 1.5, 2, 2.5][i],
      start,
      new Date(Date.now() + endDays * 86400000).toISOString(),
      `DEMO-YTK-${1000 + i}`,
      'DEMO kayıt — kurgusal satıcı ve örnek telefon',
      ts,
      ts
    )
  })
}

function seedSources() {
  const rows = [
    ['demo-seed', 'Demo Veri Seti', 'seed', 'aktif', 'Platform demo amaçlı kurgusal ilanlar. Canlı kullanımda kapatın.', tableCount('listings')],
    ['csv-import', 'CSV / Excel İçe Aktarma', 'manuel', 'hazir', 'Kendi portföyünüz veya portal dışa aktarımı.', 0],
    ['xml-feed', 'Portal XML Feed (lisanslı)', 'feed', 'yapilandirilmadi', 'sahibinden / hepsiemlak kurumsal feed anlaşması gerekir.', 0],
    ['ibb-open-data', 'İBB Açık Veri', 'acik-veri', 'beklemede', 'data.ibb.gov.tr CKAN API — bölge, ulaşım, nüfus zenginleştirme.', 0],
    ['osm', 'OpenStreetMap / Overpass', 'acik-veri', 'beklemede', 'POI, ulaşım ve bina zenginleştirme.', 0],
    ['tuik', 'TÜİK Konut Satış İstatistikleri', 'acik-veri', 'beklemede', 'Aylık il bazında satış adetleri ve fiyat endeksi.', 0]
  ]
  const stmt = db.prepare(
    `INSERT INTO sources (key, name, kind, status, note, record_count) VALUES (?,?,?,?,?,?)
     ON CONFLICT(key) DO UPDATE SET name=excluded.name, kind=excluded.kind, note=excluded.note`
  )
  for (const r of rows) stmt.run(...r)
}

function seedAlerts() {
  const existing = tableCount('alerts')
  if (existing > 0) return
  const stmt = db.prepare(`INSERT INTO alerts (name, criteria, active, created_at) VALUES (?,?,?,?)`)
  stmt.run(
    'Kadıköy fırsat radarı',
    JSON.stringify({ district: 'Kadıköy', dealType: 'satilik', minScore: 75, maxPricePerM2Ratio: 0.92 }),
    1,
    nowISO()
  )
  stmt.run(
    'Esenyurt & Beylikdüzü yatırım',
    JSON.stringify({ districts: ['Esenyurt', 'Beylikdüzü'], dealType: 'satilik', minScore: 68, rooms: ['2+1', '3+1'] }),
    1,
    nowISO()
  )
}

function run() {
  migrate()
  if (reset) {
    for (const t of ['price_history', 'listings', 'benchmarks', 'market_index', 'districts', 'pois', 'alerts', 'leads', 'mandates', 'audit_log', 'imports']) {
      db.exec(`DELETE FROM ${t}`)
    }
  }
  if (tableCount('listings') > 50) {
    console.log(`[seed] ${tableCount('listings')} ilan zaten var, atlanıyor (sıfırlamak için: npm run seed)`)
    return
  }
  seedDistricts()
  seedPois()
  seedMarketIndex()
  const n = generateListings()
  const groups = refreshBenchmarks()
  seedMandates()
  seedSources()
  seedAlerts()
  setSetting('demo_mode', '1')
  setSetting('seed_at', nowISO())
  setSetting('currency', 'TRY')
  console.log(`[seed] ${DISTRICTS.length} ilçe, ${POIS.length} POI, ${n} ilan, ${groups} fiyat benchmark grubu oluşturuldu.`)
}

run()
