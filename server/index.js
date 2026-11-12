import express from 'express'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { db, migrate, nowISO, audit, tableCount, getSetting, setSetting } from './db.js'
import { scoreListing, locationProfile, riskProfile, daysBetween, haversineKm } from './scoring.js'
import { importCSV, importXML, refreshBenchmarks, parseCSV, normalizeKey, mapHeaderToFields } from './ingest.js'
import { syncIBB, syncOSM, syncTUIK } from './connectors.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const PORT = Number(process.env.PORT || 3000)

migrate()

const app = express()
app.disable('x-powered-by')
app.use(express.json({ limit: '40mb' }))
app.use(express.text({ type: ['text/csv', 'text/plain', 'application/xml', 'text/xml'], limit: '40mb' }))

/* ------------------------------ yardımcılar ------------------------------ */

const districtRows = () => db.prepare(`SELECT * FROM districts ORDER BY name`).all()
const pois = () => db.prepare(`SELECT * FROM pois`).all()

function benchmarkMap() {
  const map = new Map()
  for (const b of db.prepare(`SELECT * FROM benchmarks`).all()) {
    map.set(`${b.district}|${b.deal_type}|${b.rooms}`, b)
  }
  return map
}

function fallbackBenchmark(listing, districts) {
  const d = districts.get(listing.district)
  if (!d) return null
  const base = listing.deal_type === 'satilik' ? d.benchmark_sale_m2 : d.benchmark_rent_m2
  return { median_m2: base, sample_size: 3 }
}

function enrich(listing, ctx) {
  const dom = listing.first_seen ? daysBetween(listing.first_seen, nowISO()) : 0
  const enriched = { ...listing, days_on_market: dom }
  const bm =
    ctx.benchmarks.get(`${listing.district}|${listing.deal_type}|${listing.rooms}`) ||
    fallbackBenchmark(listing, ctx.districts)
  const district = ctx.districts.get(listing.district) || null
  let loc = null
  if (listing.lat != null && listing.lng != null) loc = locationProfile(listing, ctx.pois)
  const score = scoreListing(enriched, bm, district, loc)
  enriched.benchmark_m2 = bm?.median_m2 ?? null
  enriched.benchmark_sample = bm?.sample_size ?? 0
  enriched.score = score.score
  enriched.tier = score.tier
  enriched.undervalue_pct = score.undervalue_pct
  enriched.factors = score.factors
  enriched.location = loc
  return enriched
}

function buildContext() {
  const districts = new Map(districtRows().map((d) => [d.name, d]))
  return { districts, benchmarks: benchmarkMap(), pois: pois() }
}

const median = (arr) => {
  if (!arr.length) return null
  const s = [...arr].sort((a, b) => a - b)
  return s[Math.floor(s.length / 2)]
}

function parseList(v) {
  if (!v) return []
  return String(v)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

/* --------------------------------- API ---------------------------------- */

app.get('/api/health', (req, res) => {
  res.json({ ok: true, ts: nowISO(), demo: getSetting('demo_mode') === '1', version: '0.1.0' })
})

app.get('/api/meta', (req, res) => {
  const sources = db.prepare(`SELECT * FROM sources ORDER BY id`).all()
  const counts = {
    listings: tableCount('listings'),
    active: db.prepare(`SELECT COUNT(*) c FROM listings WHERE status='aktif'`).get().c,
    districts: tableCount('districts'),
    pois: tableCount('pois'),
    alerts: tableCount('alerts'),
    leads: db.prepare(`SELECT COUNT(*) c FROM leads WHERE deleted_at IS NULL`).get().c
  }
  res.json({
    demo: getSetting('demo_mode') === '1',
    seedAt: getSetting('seed_at'),
    districts: districtRows(),
    sources,
    counts,
    imports: db.prepare(`SELECT * FROM imports ORDER BY id DESC LIMIT 10`).all(),
    lastSync: getSetting('last_sync'),
    legal: {
      notice:
        'Platform kişisel iletişim verisini yalnızca hukuki dayanağı kayıtlı kayıtlardan kabul eder (KVKK m.5). ' +
        'Portallardan toplu kişisel veri çekimi yapılmaz.'
    }
  })
})

app.get('/api/overview', (req, res) => {
  const ctx = buildContext()
  const { district, dealType, districts: districtList, days } = req.query
  let rows = db.prepare(`SELECT * FROM listings WHERE status='aktif'`).all()
  const districtFilter = parseList(districtList)
  if (district) rows = rows.filter((r) => r.district === district)
  if (districtFilter.length) rows = rows.filter((r) => districtFilter.includes(r.district))
  if (dealType) rows = rows.filter((r) => r.deal_type === dealType)

  const enriched = rows.map((r) => enrich(r, ctx))
  const now = Date.now()
  const within = (d) => enriched.filter((r) => now - new Date(r.first_seen).getTime() <= d * 86400000)

  const ppm2 = enriched.map((r) => r.price_per_m2).filter(Boolean)
  const opps = enriched.filter((r) => r.score >= 70)

  const byDistrict = new Map()
  for (const r of enriched) {
    if (!byDistrict.has(r.district)) {
      byDistrict.set(r.district, { district: r.district, count: 0, opportunities: 0, ppm2: [], drops: 0 })
    }
    const b = byDistrict.get(r.district)
    b.count++
    if (r.score >= 70) b.opportunities++
    if (r.price_per_m2) b.ppm2.push(r.price_per_m2)
    if (r.price_delta_pct < 0) b.drops++
  }
  const districtTable = Array.from(byDistrict.values())
    .map((b) => ({
      district: b.district,
      count: b.count,
      opportunities: b.opportunities,
      median_m2: median(b.ppm2),
      drops: b.drops,
      opportunity_rate: b.count ? Math.round((b.opportunities / b.count) * 100) : 0,
      heat: ctx.districts.get(b.district)?.heat ?? null,
      lat: ctx.districts.get(b.district)?.lat,
      lng: ctx.districts.get(b.district)?.lng
    }))
    .sort((a, b) => b.opportunities - a.opportunities)

  const recentDrops = enriched
    .filter((r) => r.price_delta_pct < 0)
    .sort((a, b) => a.price_delta_pct - b.price_delta_pct)
    .slice(0, 8)
    .map((r) => ({
      id: r.id,
      title: r.title,
      district: r.district,
      price: r.price,
      price_per_m2: r.price_per_m2,
      price_delta_pct: r.price_delta_pct,
      price_drops: r.price_drops,
      days_on_market: r.days_on_market,
      score: r.score
    }))

  const distribution = [
    { label: '80-100', min: 80, max: 100 },
    { label: '65-79', min: 65, max: 79 },
    { label: '50-64', min: 50, max: 64 },
    { label: '0-49', min: 0, max: 49 }
  ].map((b) => ({ ...b, count: enriched.filter((r) => r.score >= b.min && r.score <= b.max).length }))

  const months = 13
  const districtNames = district ? [district] : districtFilter.length ? districtFilter : null
  const indexRows = db.prepare(`SELECT * FROM market_index ORDER BY month`).all()
  const trendMap = new Map()
  for (const r of indexRows) {
    if (districtNames && !districtNames.includes(r.district)) continue
    if (!trendMap.has(r.month)) trendMap.set(r.month, [])
    trendMap.get(r.month).push(r)
  }
  const trend = Array.from(trendMap.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-months)
    .map(([month, items]) => ({
      month,
      sale_m2: Math.round(items.reduce((s, i) => s + i.sale_m2, 0) / items.length),
      rent_m2: Math.round(items.reduce((s, i) => s + i.rent_m2, 0) / items.length),
      volume: items.reduce((s, i) => s + i.volume, 0)
    }))

  res.json({
    kpis: {
      listings: enriched.length,
      median_m2: median(ppm2),
      opportunities: opps.length,
      opportunity_rate: enriched.length ? Math.round((opps.length / enriched.length) * 100) : 0,
      avg_days_on_market: enriched.length
        ? Math.round(enriched.reduce((s, r) => s + r.days_on_market, 0) / enriched.length)
        : 0,
      new_7d: within(7).length,
      drops_7d: enriched.filter((r) => r.price_delta_pct < 0 && now - new Date(r.last_seen).getTime() <= 7 * 86400000).length,
      total_value: enriched.reduce((s, r) => s + (r.deal_type === 'satilik' ? r.price : 0), 0)
    },
    topOpportunities: enriched
      .sort((a, b) => b.score - a.score)
      .slice(0, 10)
      .map((r) => ({
        id: r.id,
        title: r.title,
        district: r.district,
        neighborhood: r.neighborhood,
        deal_type: r.deal_type,
        rooms: r.rooms,
        m2_net: r.m2_net,
        price: r.price,
        price_per_m2: r.price_per_m2,
        benchmark_m2: r.benchmark_m2,
        undervalue_pct: r.undervalue_pct,
        score: r.score,
        tier: r.tier,
        days_on_market: r.days_on_market,
        price_delta_pct: r.price_delta_pct,
        seller_type: r.seller_type,
        nearest_transport: r.location?.nearestTransport || null
      })),
    districtTable,
    recentDrops,
    distribution,
    trend
  })
})

app.get('/api/listings', (req, res) => {
  const ctx = buildContext()
  const q = req.query
  let rows = db.prepare(`SELECT * FROM listings WHERE status='aktif'`).all()
  const districts = parseList(q.districts)
  const rooms = parseList(q.rooms)
  if (q.district) rows = rows.filter((r) => r.district === q.district)
  if (districts.length) rows = rows.filter((r) => districts.includes(r.district))
  if (q.dealType) rows = rows.filter((r) => r.deal_type === q.dealType)
  if (rooms.length) rows = rows.filter((r) => rooms.includes(r.rooms))
  if (q.minPrice) rows = rows.filter((r) => r.price >= Number(q.minPrice))
  if (q.maxPrice) rows = rows.filter((r) => r.price <= Number(q.maxPrice))
  if (q.minM2) rows = rows.filter((r) => (r.m2_net || 0) >= Number(q.minM2))
  if (q.maxM2) rows = rows.filter((r) => (r.m2_net || 0) <= Number(q.maxM2))
  if (q.maxDays) rows = rows.filter((r) => daysBetween(r.first_seen, nowISO()) <= Number(q.maxDays))
  if (q.onlyDrops === '1') rows = rows.filter((r) => r.price_delta_pct < 0)
  if (q.q) {
    const needle = normalizeKey(q.q)
    rows = rows.filter((r) => normalizeKey(`${r.title} ${r.district} ${r.neighborhood || ''}`).includes(needle))
  }
  if (q.lat && q.lng && q.radius) {
    const R = Number(q.radius)
    const center = { lat: Number(q.lat), lng: Number(q.lng) }
    rows = rows.filter((r) => r.lat != null && haversineKm(center, r) <= R)
  }

  let enriched = rows.map((r) => enrich(r, ctx))
  if (q.minScore) enriched = enriched.filter((r) => r.score >= Number(q.minScore))
  if (q.minUndervalue) enriched = enriched.filter((r) => r.undervalue_pct >= Number(q.minUndervalue))
  if (q.maxPpm2Ratio) enriched = enriched.filter((r) => r.benchmark_m2 && r.price_per_m2 / r.benchmark_m2 <= Number(q.maxPpm2Ratio))
  if (q.sellerType) enriched = enriched.filter((r) => r.seller_type === q.sellerType)

  const sort = q.sort || 'score'
  const dir = q.dir === 'asc' ? 1 : -1
  const sorters = {
    score: (a, b) => (a.score - b.score) * dir,
    price: (a, b) => (a.price - b.price) * dir,
    ppm2: (a, b) => ((a.price_per_m2 || 0) - (b.price_per_m2 || 0)) * dir,
    days: (a, b) => (a.days_on_market - b.days_on_market) * dir,
    undervalue: (a, b) => (a.undervalue_pct - b.undervalue_pct) * dir,
    m2: (a, b) => ((a.m2_net || 0) - (b.m2_net || 0)) * dir
  }
  enriched.sort(sorters[sort] || sorters.score)

  const total = enriched.length
  const page = Math.max(1, Number(q.page || 1))
  const pageSize = Math.min(100, Number(q.pageSize || 25))
  const items = enriched.slice((page - 1) * pageSize, page * pageSize).map((r) => ({
    ...r,
    factors: undefined,
    location: r.location
      ? { locationScore: r.location.locationScore, nearestTransport: r.location.nearestTransport }
      : null
  }))
  res.json({ total, page, pageSize, items })
})

app.get('/api/listings/:id', (req, res) => {
  const row = db.prepare(`SELECT * FROM listings WHERE id = ?`).get(Number(req.params.id))
  if (!row) return res.status(404).json({ error: 'İlan bulunamadı' })
  const ctx = buildContext()
  const listing = enrich(row, ctx)
  const history = db.prepare(`SELECT observed_at, price FROM price_history WHERE listing_id = ? ORDER BY observed_at`).all(row.id)

  const comparables = db
    .prepare(
      `SELECT * FROM listings WHERE status='aktif' AND id != ? AND district = ? AND deal_type = ?
       AND rooms IS NOT NULL AND rooms = ? ORDER BY ABS(COALESCE(m2_net,0) - ?) LIMIT 8`
    )
    .all(row.id, row.district, row.deal_type, row.rooms || '', row.m2_net || 0)
    .map((c) => enrich(c, ctx))

  res.json({
    listing,
    history,
    comparables: comparables.map((c) => ({
      id: c.id,
      title: c.title,
      price: c.price,
      m2_net: c.m2_net,
      rooms: c.rooms,
      price_per_m2: c.price_per_m2,
      score: c.score,
      days_on_market: c.days_on_market
    })),
    risk: riskProfile(listing),
    district: ctx.districts.get(row.district) || null
  })
})

app.get('/api/geo', (req, res) => {
  const ctx = buildContext()
  const rows = db.prepare(`SELECT * FROM listings WHERE status='aktif' AND lat IS NOT NULL`).all()
  const enriched = rows.map((r) => enrich(r, ctx))
  const byDistrict = new Map()
  for (const r of enriched) {
    if (!byDistrict.has(r.district)) byDistrict.set(r.district, [])
    byDistrict.get(r.district).push(r)
  }
  const districts = Array.from(byDistrict.entries()).map(([name, items]) => ({
    district: name,
    lat: ctx.districts.get(name)?.lat,
    lng: ctx.districts.get(name)?.lng,
    count: items.length,
    median_m2: median(items.map((i) => i.price_per_m2)),
    opportunities: items.filter((i) => i.score >= 70).length,
    heat: ctx.districts.get(name)?.heat
  }))
  res.json({
    districts,
    listings: enriched.map((r) => ({
      id: r.id,
      lat: r.lat,
      lng: r.lng,
      district: r.district,
      price: r.price,
      price_per_m2: r.price_per_m2,
      rooms: r.rooms,
      m2_net: r.m2_net,
      deal_type: r.deal_type,
      score: r.score,
      title: r.title
    })),
    pois: ctx.pois.map((p) => ({ kind: p.kind, name: p.name, lat: p.lat, lng: p.lng, line: p.line }))
  })
})

app.get('/api/districts/:name', (req, res) => {
  const ctx = buildContext()
  const name = req.params.name
  const district = ctx.districts.get(name)
  if (!district) return res.status(404).json({ error: 'İlçe bulunamadı' })
  const rows = db.prepare(`SELECT * FROM listings WHERE status='aktif' AND district = ?`).all(name)
  const enriched = rows.map((r) => enrich(r, ctx))

  const index = db.prepare(`SELECT * FROM market_index WHERE district = ? ORDER BY month`).all(name)
  const byRooms = {}
  for (const r of enriched) {
    if (!r.rooms) continue
    byRooms[r.rooms] = byRooms[r.rooms] || []
    if (r.price_per_m2) byRooms[r.rooms].push(r.price_per_m2)
  }
  const roomTable = Object.entries(byRooms)
    .map(([rooms, vals]) => ({
      rooms,
      count: vals.length,
      median_m2: median(vals),
      median_price: median(enriched.filter((e) => e.rooms === rooms).map((e) => e.price))
    }))
    .sort((a, b) => a.rooms.localeCompare(b.rooms))

  const neighborhoodMap = new Map()
  for (const r of enriched) {
    const key = r.neighborhood || '—'
    if (!neighborhoodMap.has(key)) neighborhoodMap.set(key, [])
    neighborhoodMap.get(key).push(r)
  }

  const saleMedian = median(enriched.filter((r) => r.deal_type === 'satilik').map((r) => r.price_per_m2))
  const rentMedian = median(enriched.filter((r) => r.deal_type === 'kiralik').map((r) => r.price_per_m2))
  const yieldPct = saleMedian && rentMedian ? Math.round(((rentMedian * 12) / saleMedian) * 1000) / 10 : null

  const poiCounts = {}
  for (const p of ctx.pois) {
    const d = Math.hypot((p.lat - district.lat) * 111, (p.lng - district.lng) * 84)
    if (d <= 3) poiCounts[p.kind] = (poiCounts[p.kind] || 0) + 1
  }

  res.json({
    district: { ...district, demoBenchmarkSale: district.benchmark_sale_m2, demoBenchmarkRent: district.benchmark_rent_m2 },
    kpis: {
      listings: enriched.length,
      opportunities: enriched.filter((r) => r.score >= 70).length,
      median_m2_sale: saleMedian,
      median_m2_rent: rentMedian,
      gross_yield: yieldPct,
      avg_days: enriched.length ? Math.round(enriched.reduce((s, r) => s + r.days_on_market, 0) / enriched.length) : 0,
      drops: enriched.filter((r) => r.price_delta_pct < 0).length
    },
    index,
    roomTable,
    neighborhoods: Array.from(neighborhoodMap.entries())
      .map(([n, items]) => ({
        neighborhood: n,
        count: items.length,
        median_m2: median(items.map((i) => i.price_per_m2)),
        opportunities: items.filter((i) => i.score >= 70).length
      }))
      .sort((a, b) => b.count - a.count),
    top: enriched
      .sort((a, b) => b.score - a.score)
      .slice(0, 8)
      .map((r) => ({
        id: r.id,
        title: r.title,
        price: r.price,
        m2_net: r.m2_net,
        rooms: r.rooms,
        price_per_m2: r.price_per_m2,
        undervalue_pct: r.undervalue_pct,
        score: r.score,
        days_on_market: r.days_on_market
      })),
    poiCounts
  })
})

app.get('/api/compare', (req, res) => {
  const ctx = buildContext()
  const names = parseList(req.query.districts)
  const rows = db.prepare(`SELECT * FROM listings WHERE status='aktif'`).all()
  const enriched = rows.map((r) => enrich(r, ctx)).filter((r) => !names.length || names.includes(r.district))
  const groups = new Map()
  for (const r of enriched) {
    if (!groups.has(r.district)) groups.set(r.district, [])
    groups.get(r.district).push(r)
  }
  const out = Array.from(groups.entries()).map(([district, items]) => {
    const d = ctx.districts.get(district)
    const sale = median(items.filter((i) => i.deal_type === 'satilik').map((i) => i.price_per_m2))
    const rent = median(items.filter((i) => i.deal_type === 'kiralik').map((i) => i.price_per_m2))
    return {
      district,
      side: d?.side,
      heat: d?.heat,
      listings: items.length,
      median_m2_sale: sale,
      median_m2_rent: rent,
      gross_yield: sale && rent ? Math.round(((rent * 12) / sale) * 1000) / 10 : null,
      opportunities: items.filter((i) => i.score >= 70).length,
      avg_days: Math.round(items.reduce((s, i) => s + i.days_on_market, 0) / items.length),
      drops: items.filter((i) => i.price_delta_pct < 0).length,
      sales_12m: d?.sales_12m
    }
  })
  res.json({ rows: out.sort((a, b) => (b.opportunities || 0) - (a.opportunities || 0)) })
})

/* -------------------------------- uyarılar ------------------------------- */

function matchesFor(criteria) {
  const ctx = buildContext()
  let rows = db.prepare(`SELECT * FROM listings WHERE status='aktif'`).all()
  const enriched = rows.map((r) => enrich(r, ctx))
  const c = criteria || {}
  return enriched
    .filter((r) => {
      if (c.district && r.district !== c.district) return false
      if (c.districts?.length && !c.districts.includes(r.district)) return false
      if (c.dealType && r.deal_type !== c.dealType) return false
      if (c.rooms?.length && !c.rooms.includes(r.rooms)) return false
      if (c.minScore && r.score < c.minScore) return false
      if (c.maxPrice && r.price > c.maxPrice) return false
      if (c.minPrice && r.price < c.minPrice) return false
      if (c.maxPricePerM2Ratio && r.benchmark_m2 && r.price_per_m2 / r.benchmark_m2 > c.maxPricePerM2Ratio) return false
      if (c.maxDaysOnMarket && r.days_on_market > c.maxDaysOnMarket) return false
      if (c.minM2 && (r.m2_net || 0) < c.minM2) return false
      return true
    })
    .sort((a, b) => b.score - a.score)
}

app.get('/api/alerts', (req, res) => {
  const rows = db.prepare(`SELECT * FROM alerts ORDER BY id`).all()
  res.json(
    rows.map((r) => ({
      ...r,
      criteria: JSON.parse(r.criteria),
      match_count: matchesFor(JSON.parse(r.criteria)).length
    }))
  )
})

app.post('/api/alerts', (req, res) => {
  const { name, criteria } = req.body || {}
  if (!name || !criteria) return res.status(400).json({ error: 'name ve criteria gerekli' })
  const info = db
    .prepare(`INSERT INTO alerts (name, criteria, active, created_at) VALUES (?,?,?,?)`)
    .run(name, JSON.stringify(criteria), 1, nowISO())
  audit('create', 'alert', info.lastInsertRowid, { name })
  res.json({ ok: true, id: Number(info.lastInsertRowid) })
})

app.patch('/api/alerts/:id', (req, res) => {
  const id = Number(req.params.id)
  const { active, name, criteria } = req.body || {}
  const row = db.prepare(`SELECT * FROM alerts WHERE id = ?`).get(id)
  if (!row) return res.status(404).json({ error: 'Uyarı bulunamadı' })
  db.prepare(`UPDATE alerts SET name=?, criteria=?, active=? WHERE id=?`).run(
    name ?? row.name,
    criteria ? JSON.stringify(criteria) : row.criteria,
    active == null ? row.active : active ? 1 : 0,
    id
  )
  res.json({ ok: true })
})

app.delete('/api/alerts/:id', (req, res) => {
  db.prepare(`DELETE FROM alerts WHERE id = ?`).run(Number(req.params.id))
  audit('delete', 'alert', req.params.id)
  res.json({ ok: true })
})

app.get('/api/alerts/:id/matches', (req, res) => {
  const row = db.prepare(`SELECT * FROM alerts WHERE id = ?`).get(Number(req.params.id))
  if (!row) return res.status(404).json({ error: 'Uyarı bulunamadı' })
  const criteria = JSON.parse(row.criteria)
  const matches = matchesFor(criteria)
  db.prepare(`UPDATE alerts SET last_run=?, last_match_count=? WHERE id=?`).run(nowISO(), matches.length, row.id)
  res.json({
    alert: { ...row, criteria },
    matches: matches.slice(0, 50).map((m) => ({
      id: m.id,
      title: m.title,
      district: m.district,
      deal_type: m.deal_type,
      rooms: m.rooms,
      m2_net: m.m2_net,
      price: m.price,
      price_per_m2: m.price_per_m2,
      benchmark_m2: m.benchmark_m2,
      undervalue_pct: m.undervalue_pct,
      score: m.score,
      days_on_market: m.days_on_market
    }))
  })
})

/* --------------------------------- leads --------------------------------- */
/* KVKK: her lead zorunlu hukuki dayanak ile kaydedilir; telefon maskeli döner. */

const LAWFUL_BASES = ['acik_riza', 'sozlesme', 'mesru_menfaat', 'kanuni_yukumluluk', 'aleni_edilmis']

function maskedPhone(phone) {
  if (!phone) return null
  const digits = String(phone).replace(/\D/g, '')
  if (digits.length < 7) return '***'
  return `${digits.slice(0, 3)} *** ** ${digits.slice(-2)}`
}

app.get('/api/leads', (req, res) => {
  const rows = db.prepare(`SELECT * FROM leads WHERE deleted_at IS NULL ORDER BY id DESC`).all()
  res.json(
    rows.map((r) => ({
      ...r,
      phone: maskedPhone(r.phone),
      phone_masked: true,
      retention_days_left: r.retention_until
        ? Math.ceil((new Date(r.retention_until).getTime() - Date.now()) / 86400000)
        : null
    }))
  )
})

app.post('/api/leads', (req, res) => {
  const b = req.body || {}
  if (!b.full_name) return res.status(400).json({ error: 'Ad soyad gerekli' })
  if (!LAWFUL_BASES.includes(b.lawful_basis))
    return res.status(422).json({
      error: 'Hukuki dayanak zorunlu (KVKK m.5). Geçerli değerler: ' + LAWFUL_BASES.join(', ')
    })
  if (b.lawful_basis === 'acik_riza' && !b.consent_ref)
    return res.status(422).json({ error: 'Açık rıza için rıza kaydı referansı (consent_ref) zorunlu' })
  const retention = b.retention_months
    ? new Date(Date.now() + Number(b.retention_months) * 30 * 86400000).toISOString()
    : new Date(Date.now() + 730 * 86400000).toISOString()
  const info = db
    .prepare(
      `INSERT INTO leads (listing_id, full_name, phone, email, role, district, budget_min, budget_max, rooms,
        lawful_basis, consent_ref, source, notes, stage, created_at, retention_until) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
    )
    .run(
      b.listing_id ? Number(b.listing_id) : null,
      b.full_name,
      b.phone || null,
      b.email || null,
      b.role || 'alici',
      b.district || null,
      b.budget_min ? Number(b.budget_min) : null,
      b.budget_max ? Number(b.budget_max) : null,
      b.rooms || null,
      b.lawful_basis,
      b.consent_ref || null,
      b.source || 'manuel',
      b.notes || null,
      b.stage || 'yeni',
      nowISO(),
      retention
    )
  audit('create', 'lead', info.lastInsertRowid, { lawful_basis: b.lawful_basis, source: b.source || 'manuel' })
  res.json({ ok: true, id: Number(info.lastInsertRowid) })
})

app.get('/api/leads/:id/reveal', (req, res) => {
  const row = db.prepare(`SELECT * FROM leads WHERE id = ? AND deleted_at IS NULL`).get(Number(req.params.id))
  if (!row) return res.status(404).json({ error: 'Kayıt bulunamadı' })
  audit('reveal', 'lead', row.id, { reason: req.query.reason || 'belirtilmedi' }, req.query.actor || 'kullanici')
  res.json({ phone: row.phone, email: row.email })
})

app.delete('/api/leads/:id', (req, res) => {
  // KVKK m.7 / m.11: silme talebi — gerçek anonimleştirme
  db.prepare(
    `UPDATE leads SET deleted_at=?, full_name='[silindi]', phone=NULL, email=NULL, notes=NULL, consent_ref=NULL WHERE id=?`
  ).run(nowISO(), Number(req.params.id))
  audit('erase', 'lead', req.params.id, { note: 'KVKK silme talebi uygulandı' })
  res.json({ ok: true })
})

/* ------------------------------- içe aktarma ------------------------------ */

app.post('/api/import/csv', (req, res) => {
  let csv = typeof req.body === 'string' ? req.body : req.body?.csv
  const sourceKey = (typeof req.body === 'object' && req.body?.sourceKey) || 'csv-import'
  const fileName = (typeof req.body === 'object' && req.body?.fileName) || 'ice-aktarma.csv'
  const delimiter = typeof req.body === 'object' ? req.body?.delimiter : undefined
  if (!csv || typeof csv !== 'string') return res.status(400).json({ error: 'CSV içeriği boş' })
  const result = importCSV(csv, { sourceKey, fileName, delimiter })
  res.status(result.ok ? 200 : 400).json(result)
})

app.post('/api/import/preview', (req, res) => {
  const csv = typeof req.body === 'string' ? req.body : req.body?.csv
  if (!csv) return res.status(400).json({ error: 'CSV içeriği boş' })
  const { rows, delimiter } = parseCSV(csv, typeof req.body === 'object' ? req.body?.delimiter : undefined)
  res.json({
    delimiter,
    header: rows[0] || [],
    rows: rows.slice(1, 6),
    total: Math.max(0, rows.length - 1),
    mapped: (rows[0] || []).map((h) => normalizeKey(h)),
    fields: mapHeaderToFields(rows[0] || [])
  })
})

app.post('/api/import/xml', (req, res) => {
  const xml = typeof req.body === 'string' ? req.body : req.body?.xml
  if (!xml) return res.status(400).json({ error: 'XML içeriği boş' })
  const result = importXML(xml, {
    sourceKey: (typeof req.body === 'object' && req.body?.sourceKey) || 'xml-feed',
    fileName: (typeof req.body === 'object' && req.body?.fileName) || 'feed.xml'
  })
  res.status(result.ok ? 200 : 400).json(result)
})

app.post('/api/rebuild-benchmarks', (req, res) => {
  const groups = refreshBenchmarks()
  res.json({ ok: true, groups })
})

/* -------------------------------- kaynaklar ------------------------------ */

app.post('/api/sources/:key/sync', async (req, res) => {
  const key = req.params.key
  try {
    let result
    if (key === 'ibb-open-data') result = await syncIBB()
    else if (key === 'osm') result = await syncOSM()
    else if (key === 'tuik') result = await syncTUIK()
    else {
      return res.status(400).json({
        ok: false,
        error:
          'Bu kaynak manuel içe aktarma ile beslenir. Veri Merkezi > İçe Aktarma bölümünü kullanın.'
      })
    }
    res.json(result)
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e.message || e) })
  } finally {
    setSetting('last_sync', nowISO())
  }
})

app.get('/api/audit', (req, res) => {
  res.json(db.prepare(`SELECT * FROM audit_log ORDER BY id DESC LIMIT 100`).all())
})

app.get('/api/export/listings.csv', (req, res) => {
  const ctx = buildContext()
  const rows = db.prepare(`SELECT * FROM listings WHERE status='aktif'`).all()
  const enriched = rows.map((r) => enrich(r, ctx))
  const cols = [
    'id', 'district', 'neighborhood', 'deal_type', 'rooms', 'm2_net', 'm2_gross', 'price',
    'price_per_m2', 'benchmark_m2', 'undervalue_pct', 'score', 'days_on_market', 'price_delta_pct',
    'building_age', 'floor', 'dues', 'lat', 'lng', 'seller_type', 'source', 'first_seen', 'title'
  ]
  const esc = (v) => {
    if (v == null) return ''
    const s = String(v)
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const csv = [cols.join(';'), ...enriched.map((r) => cols.map((c) => esc(r[c])).join(';'))].join('\n')
  res.setHeader('Content-Type', 'text/csv; charset=utf-8')
  res.setHeader('Content-Disposition', 'attachment; filename="bolgeradar-ilanlar.csv"')
  res.send('\uFEFF' + csv)
})

app.get('/api/sample-csv', (req, res) => {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8')
  res.send(
    '\uFEFF' +
      [
        'ilan_no;baslik;ilce;mahalle;islem_tipi;oda;net_m2;brut_m2;fiyat;kat;bina_yasi;aidat;lat;lng;satici_tipi;ofis;url;ilk_gorulme',
        'OF-1001;Kadıköy Caferağa 2+1;Kadıköy;Caferağa Mah.;satılık;2+1;95;115;7.850.000;3;12;2.400;40.9906;29.0219;emlak_ofisi;Örnek Gayrimenkul;https://ornek.local/ilan/1001;2026-10-02',
        'OF-1002;Beşiktaş Levent 3+1;Beşiktaş;Levent Mah.;satılık;3+1;140;160;16.500.000;7;6;3.500;41.0805;29.0102;sahibinden;;https://ornek.local/ilan/1002;2026-10-28'
      ].join('\n')
  )
})

/* ------------------------------- statik site ----------------------------- */

const dist = path.join(ROOT, 'dist')
if (fs.existsSync(dist)) {
  app.use(express.static(dist, { maxAge: '1h', index: false }))
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next()
    res.sendFile(path.join(dist, 'index.html'))
  })
} else {
  app.get('/', (req, res) =>
    res
      .status(200)
      .type('html')
      .send('<h1>BölgeRadar API çalışıyor</h1><p>Arayüz için <code>npm run build</code> çalıştırın veya dev modunda Vite kullanın.</p>')
  )
}

app.use((err, req, res, next) => {
  console.error('[api]', err)
  res.status(500).json({ error: String(err?.message || err) })
})

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[bolgeradar] http://0.0.0.0:${PORT}  (demo=${getSetting('demo_mode')}, ilan=${tableCount('listings')})`)
  if (tableCount('listings') === 0) console.log('[bolgeradar] Veri yok. `npm run seed` ile demo veri yükleyin.')
})

export default app
