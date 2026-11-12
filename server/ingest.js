/**
 * Veri alım katmanı: CSV/TSV/Excel-copy ve XML feed içe aktarma.
 *
 * Tasarım ilkesi: kaynak ne olursa olsun (portal feed, kendi CRM export'u,
 * elle tutulan liste) alan eşlemesi tek yerden yapılır ve her kayıt
 * "kaynak + güven" etiketiyle saklanır.
 */
import crypto from 'node:crypto'
import { XMLParser } from 'fast-xml-parser'
import { db, nowISO, audit } from './db.js'

const TR_MAP = { ı: 'i', ş: 's', ğ: 'g', ü: 'u', ö: 'o', ç: 'c', İ: 'i', Ş: 's', Ğ: 'g', Ü: 'u', Ö: 'o', Ç: 'c' }

export function normalizeKey(s) {
  return String(s)
    .trim()
    .replace(/[ışğüöçİŞĞÜÖÇ]/g, (m) => TR_MAP[m] || m)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
}

const FIELD_ALIASES = {
  external_id: ['external_id', 'ilan_no', 'ilan_id', 'id', 'referans', 'referans_no', 'portfoy_no'],
  url: ['url', 'link', 'ilan_link', 'ilan_url'],
  title: ['title', 'baslik', 'ilan_basligi', 'aciklama_basligi'],
  property_type: ['property_type', 'emlak_tipi', 'konut_tipi', 'kategori'],
  deal_type: ['deal_type', 'islem_tipi', 'ilan_tipi', 'durum', 'satis_kiralama', 'tip'],
  district: ['district', 'ilce', 'ilce_adi', 'county'],
  neighborhood: ['neighborhood', 'mahalle', 'semt', 'mahalle_semt', 'bolge'],
  lat: ['lat', 'enlem', 'latitude'],
  lng: ['lng', 'lon', 'boylam', 'longitude'],
  m2_net: ['m2_net', 'net_m2', 'net_metrekare', 'net_alan', 'm2', 'metrekare', 'brut_net'],
  m2_gross: ['m2_gross', 'brut_m2', 'brut_metrekare', 'brut_alan', 'gross_m2'],
  rooms: ['rooms', 'oda', 'oda_sayisi', 'oda_sayisi_1', 'room'],
  floor: ['floor', 'kat', 'bulundugu_kat'],
  total_floors: ['total_floors', 'kat_sayisi', 'toplam_kat'],
  building_age: ['building_age', 'bina_yasi', 'yas'],
  heating: ['heating', 'isitma', 'isitma_tipi'],
  dues: ['dues', 'aidat', 'aidat_tl'],
  price: ['price', 'fiyat', 'bedel', 'satis_fiyati', 'talep_fiyati'],
  seller_type: ['seller_type', 'satici_tipi', 'satici', 'ilan_sahibi_tipi'],
  office_name: ['office_name', 'ofis', 'ofis_adi', 'danismanlik', 'magaza'],
  first_seen: ['first_seen', 'ilk_gorulme', 'yayin_tarihi', 'tarih', 'ilan_tarihi'],
  status: ['status', 'durum_bilgisi']
}

const ALIAS_INDEX = new Map()
for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
  ALIAS_INDEX.set(normalizeKey(field), field)
  for (const a of aliases) ALIAS_INDEX.set(normalizeKey(a), field)
}

export function mapHeaderToFields(header) {
  return header.map((h) => ALIAS_INDEX.get(normalizeKey(h)) || null)
}

export function detectDelimiter(text) {
  const sample = text.split(/\r?\n/).slice(0, 5).join('\n')
  const candidates = [';', ',', '\t', '|']
  let best = ','
  let bestCount = -1
  for (const c of candidates) {
    const count = sample.split(c).length
    if (count > bestCount) {
      bestCount = count
      best = c
    }
  }
  return best
}

/** RFC4180 uyumlu, tırnak ve gömülü yeni satır destekli CSV ayrıştırıcı. */
export function parseCSV(text, delimiter) {
  const clean = text.replace(/^\uFEFF/, '')
  const delim = delimiter || detectDelimiter(clean)
  const rows = []
  let row = []
  let field = ''
  let inQuotes = false

  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i]
    if (inQuotes) {
      if (ch === '"') {
        if (clean[i + 1] === '"') {
          field += '"'
          i++
        } else inQuotes = false
      } else field += ch
      continue
    }
    if (ch === '"') {
      inQuotes = true
    } else if (ch === delim) {
      row.push(field)
      field = ''
    } else if (ch === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else if (ch === '\r') {
      // yut
    } else {
      field += ch
    }
  }
  if (field.length || row.length) {
    row.push(field)
    rows.push(row)
  }
  return { rows: rows.filter((r) => r.some((c) => String(c).trim() !== '')), delimiter: delim }
}

export function parseNumber(value) {
  if (value == null) return null
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  let s = String(value).trim()
  if (!s) return null
  s = s.replace(/[^\d.,-]/g, '')
  if (!s) return null
  const hasComma = s.includes(',')
  const hasDot = s.includes('.')
  if (hasComma && hasDot) {
    // son görülen ayırıcı ondalık kabul edilir
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) s = s.replace(/\./g, '').replace(',', '.')
    else s = s.replace(/,/g, '')
  } else if (hasComma) {
    const parts = s.split(',')
    s = parts.length === 2 && parts[1].length <= 2 ? s.replace(',', '.') : s.replace(/,/g, '')
  } else if (hasDot) {
    const parts = s.split('.')
    if (parts.length > 2) s = s.replace(/\./g, '')
    else if (parts[1].length === 3) s = s.replace('.', '')
  }
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

export function normalizeDealType(value) {
  const v = normalizeKey(value)
  if (!v) return null
  if (/kiral|rent|kirala/.test(v)) return 'kiralik'
  if (/satil|sale|satis/.test(v)) return 'satilik'
  return null
}

export function normalizeRooms(value) {
  if (value == null) return null
  const s = String(value).replace(/\s/g, '')
  const m = s.match(/(\d+)\s*[+\-xX]\s*(\d+)/)
  if (m) return `${m[1]}+${m[2]}`
  const n = s.match(/^(\d+)$/)
  if (n) return `${n[1]}+1`
  return null
}

function mapRow(rawRow) {
  const out = {}
  for (const [key, value] of Object.entries(rawRow)) {
    const field = ALIAS_INDEX.get(normalizeKey(key))
    if (!field) continue
    if (value == null || String(value).trim() === '') continue
    out[field] = value
  }
  return out
}

function toListing(mapped, sourceKey) {
  const price = parseNumber(mapped.price)
  if (!price || price <= 0) return { error: 'fiyat okunamadı' }
  const district = mapped.district ? String(mapped.district).trim() : null
  if (!district) return { error: 'ilçe boş' }
  const dealType = normalizeDealType(mapped.deal_type) || 'satilik'
  const m2Net = parseNumber(mapped.m2_net)
  const m2Gross = parseNumber(mapped.m2_gross) || m2Net
  const rooms = normalizeRooms(mapped.rooms)
  const title =
    mapped.title ||
    `${district}${rooms ? ' ' + rooms : ''}${m2Net ? ' ' + m2Net + ' m²' : ''} ${dealType === 'satilik' ? 'satılık' : 'kiralık'} daire`
  const ppm2 = m2Net ? Math.round(price / m2Net) : null
  const firstSeen = mapped.first_seen ? safeDate(mapped.first_seen) : nowISO()
  const fingerprint = makeFingerprint(sourceKey, mapped, { district, price, m2Net, rooms, dealType })

  return {
    listing: {
      external_id: mapped.external_id ? String(mapped.external_id) : null,
      source: sourceKey,
      url: mapped.url || null,
      title: String(title),
      property_type: mapped.property_type ? normalizeKey(mapped.property_type) : 'daire',
      deal_type: dealType,
      district,
      neighborhood: mapped.neighborhood ? String(mapped.neighborhood) : null,
      lat: parseNumber(mapped.lat),
      lng: parseNumber(mapped.lng),
      m2_net: m2Net,
      m2_gross: m2Gross,
      rooms,
      floor: parseNumber(mapped.floor),
      total_floors: parseNumber(mapped.total_floors),
      building_age: parseNumber(mapped.building_age),
      heating: mapped.heating ? String(mapped.heating) : null,
      dues: parseNumber(mapped.dues),
      price,
      price_per_m2: ppm2,
      seller_type: mapped.seller_type ? normalizeKey(mapped.seller_type) : null,
      office_name: mapped.office_name ? String(mapped.office_name) : null,
      first_seen: firstSeen,
      last_seen: nowISO(),
      fingerprint
    }
  }
}

function safeDate(value) {
  const d = new Date(value)
  if (!Number.isNaN(d.getTime())) return d.toISOString()
  // gg.aa.yyyy
  const m = String(value).match(/(\d{1,2})[./-](\d{1,2})[./-](\d{4})/)
  if (m) {
    const dt = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]))
    if (!Number.isNaN(dt.getTime())) return dt.toISOString()
  }
  return nowISO()
}

function makeFingerprint(sourceKey, mapped, ctx) {
  if (mapped.external_id) return `${sourceKey}:ext:${String(mapped.external_id).trim()}`
  if (mapped.url) return `${sourceKey}:url:${sha1(String(mapped.url).trim())}`
  return `${sourceKey}:sig:${sha1([ctx.district, ctx.rooms, ctx.m2Net, ctx.dealType].join('|'))}`
}

function sha1(s) {
  return crypto.createHash('sha1').update(s).digest('hex').slice(0, 16)
}

export function upsertListing(l) {
  const existing = db.prepare(`SELECT id, price, price_drops, first_seen FROM listings WHERE fingerprint = ?`).get(l.fingerprint)
  const ts = nowISO()
  if (existing) {
    const changed = Math.abs((existing.price || 0) - l.price) > 1
    let drops = existing.price_drops || 0
    if (changed) drops += l.price < existing.price ? 1 : 0
    db.prepare(
      `UPDATE listings SET price=?, price_per_m2=?, last_seen=?, price_drops=?, price_delta_pct=?, status='aktif', updated_at=? WHERE id=?`
    ).run(
      l.price,
      l.price_per_m2,
      ts,
      drops,
      existing.price ? Math.round(((l.price - existing.price) / existing.price) * 1000) / 10 : 0,
      ts,
      existing.id
    )
    if (changed) {
      db.prepare(`INSERT INTO price_history (listing_id, observed_at, price) VALUES (?,?,?)`).run(existing.id, ts, l.price)
    }
    return { id: existing.id, updated: true }
  }
  const info = db.prepare(`
    INSERT INTO listings (external_id, source, url, title, property_type, deal_type, district, neighborhood,
      lat, lng, m2_net, m2_gross, rooms, floor, total_floors, building_age, heating, dues, price, price_per_m2,
      seller_type, office_name, first_seen, last_seen, price_drops, price_delta_pct, status, fingerprint, created_at, updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    l.external_id, l.source, l.url, l.title, l.property_type, l.deal_type, l.district, l.neighborhood,
    l.lat, l.lng, l.m2_net, l.m2_gross, l.rooms, l.floor, l.total_floors, l.building_age, l.heating, l.dues,
    l.price, l.price_per_m2, l.seller_type, l.office_name, l.first_seen, l.last_seen, 0, 0, 'aktif',
    l.fingerprint, ts, ts
  )
  const id = Number(info.lastInsertRowid)
  db.prepare(`INSERT INTO price_history (listing_id, observed_at, price) VALUES (?,?,?)`).run(id, ts, l.price)
  return { id, updated: false }
}

export function refreshBenchmarks() {
  db.exec(`DELETE FROM benchmarks`)
  const rows = db.prepare(`SELECT district, deal_type, rooms, price_per_m2 FROM listings WHERE status='aktif' AND rooms IS NOT NULL AND price_per_m2 IS NOT NULL`).all()
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
    insert.run(district, dealType, rooms, Math.round(values[Math.floor(values.length / 2)]), values.length, nowISO())
  }
  return groups.size
}

/** CSV metnini içe aktarır. */
export function importCSV(text, { sourceKey = 'csv-import', fileName = 'pano.csv', delimiter } = {}) {
  const { rows } = parseCSV(text, delimiter)
  if (rows.length < 2) return { ok: false, error: 'Dosyada başlık + en az 1 satır olmalı.' }
  const header = rows[0].map((h) => String(h).trim())
  const mapped = header.map((h) => ALIAS_INDEX.get(normalizeKey(h)) || null)
  const unknown = header.filter((_, i) => !mapped[i])
  const records = rows.slice(1)
  const result = runImport(records, header, sourceKey, fileName)
  return { ...result, header, mapped, unknownColumns: unknown }
}

function runImport(records, header, sourceKey, fileName) {
  let imported = 0
  let updated = 0
  let skipped = 0
  const errors = []
  db.exec('BEGIN')
  try {
    for (const cells of records) {
      const raw = {}
      header.forEach((h, i) => (raw[h] = cells[i]))
      const parsed = toListing(mapRow(raw), sourceKey)
      if (parsed.error) {
        skipped++
        if (errors.length < 5) errors.push(parsed.error)
        continue
      }
      const res = upsertListing(parsed.listing)
      if (res.updated) updated++
      else imported++
    }
    refreshBenchmarks()
    db.exec('COMMIT')
  } catch (e) {
    db.exec('ROLLBACK')
    return { ok: false, error: `İçe aktarma hatası: ${e.message}` }
  }
  db.prepare(
    `INSERT INTO imports (source_key, file_name, rows_total, rows_imported, rows_skipped, created_at, detail) VALUES (?,?,?,?,?,?,?)`
  ).run(sourceKey, fileName, records.length, imported + updated, skipped, nowISO(), JSON.stringify({ errors }))
  db.prepare(`UPDATE sources SET last_sync=?, record_count=record_count+?, status='aktif' WHERE key=?`).run(
    nowISO(),
    imported + updated,
    sourceKey
  )
  audit('import', 'listings', null, { sourceKey, fileName, imported, updated, skipped })
  return { ok: true, imported, updated, skipped, errors, total: records.length }
}

/** Portal XML feed'lerini (RSS/özel şema) esnek biçimde ayrıştırır. */
export function importXML(xmlText, { sourceKey = 'xml-feed', fileName = 'feed.xml' } = {}) {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    trimValues: true,
    parseTagValue: true,
    cdataPropName: '#cdata'
  })
  let doc
  try {
    doc = parser.parse(xmlText)
  } catch (e) {
    return { ok: false, error: `XML ayrıştırılamadı: ${e.message}` }
  }
  const candidates = collectObjects(doc)
  const records = candidates.filter((o) => hasAnyKey(o, ['price', 'fiyat', 'bedel']) && hasAnyKey(o, ['district', 'ilce', 'il', 'semt', 'mahalle']))
  if (!records.length) {
    return {
      ok: false,
      error:
        'Feed içinde ilan düğümü bulunamadı. Beklenen: fiyat ve ilçe alanı olan tekrar eden <ilan> düğümleri.'
    }
  }
  const flat = records.map(flatten)
  const header = Array.from(new Set(flat.flatMap((r) => Object.keys(r))))
  const rows = flat.map((r) => header.map((h) => r[h] ?? ''))
  const result = runImport(rows, header, sourceKey, fileName)
  return { ...result, header, mapped: header.map((h) => ALIAS_INDEX.get(normalizeKey(h)) || null) }
}

function hasAnyKey(obj, keys) {
  return keys.some((k) => Object.keys(obj).some((ok) => normalizeKey(ok) === k))
}

function collectObjects(node, acc = [], depth = 0) {
  if (node == null || depth > 8) return acc
  if (Array.isArray(node)) {
    for (const item of node) collectObjects(item, acc, depth + 1)
    return acc
  }
  if (typeof node === 'object') {
    acc.push(node)
    for (const v of Object.values(node)) {
      if (v && (Array.isArray(v) || typeof v === 'object')) collectObjects(v, acc, depth + 1)
    }
  }
  return acc
}

function flatten(obj, prefix = '', out = {}) {
  for (const [k, v] of Object.entries(obj)) {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      flatten(v, prefix ? `${prefix}_${k}` : k, out)
    } else if (!Array.isArray(v)) {
      out[prefix ? `${prefix}_${k}` : k] = v
    }
  }
  return out
}
