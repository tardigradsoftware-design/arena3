/**
 * Canlı açık veri bağlayıcıları.
 *
 * Bu adaptörler internet erişimi olan bir ortamda (kendi sunucunuz / lokaliniz)
 * doğrudan çalışır. Sandbox/offline ortamda nazik bir hata mesajı döner ve
 * uygulamanın geri kalanı demo veriyle çalışmaya devam eder.
 *
 * Hiçbir bağlayıcı kişisel iletişim verisi çekmez; yalnızca kamuya açık
 * altyapı/istatistik verisi kullanır.
 */
import { db, nowISO, audit, setSetting, getSetting } from './db.js'

const TIMEOUT_MS = 12000

async function fetchJSON(url, options = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        'User-Agent': 'BolgeRadar/0.1 (gayrimenkul istihbarat; iletisim: ofis@ornek.com)',
        ...(options.headers || {})
      }
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await res.json()
  } finally {
    clearTimeout(timer)
  }
}

function offlineMessage(err) {
  const msg = String(err?.message || err)
  if (/abort|fetch failed|ENOTFOUND|EAI_AGAIN|network|timed out/i.test(msg)) {
    return 'Ağa erişilemedi. Bu ortamda dış internet kapalı olabilir; kendi sunucunuzda tekrar deneyin.'
  }
  return msg
}

/* ---------------------------------- İBB ---------------------------------- */

const IBB_BASE = 'https://data.ibb.gov.tr/api/3/action'

export async function syncIBB() {
  try {
    const queries = ['konut', 'nüfus', 'ulaşım', 'metro']
    const found = []
    for (const q of queries) {
      const url = `${IBB_BASE}/package_search?q=${encodeURIComponent(q)}&rows=8`
      const json = await fetchJSON(url)
      const items = json?.result?.results || []
      for (const pkg of items) {
        const resources = (pkg.resources || []).slice(0, 3).map((r) => ({
          name: r.name || r.format,
          format: r.format,
          id: r.id
        }))
        found.push({ query: q, title: pkg.title, name: pkg.name, resources })
      }
    }
    const unique = dedupeBy(found, 'name')
    setSetting('ibb_last_discovery', JSON.stringify({ at: nowISO(), datasets: unique }))
    db.prepare(`UPDATE sources SET status='aktif', last_sync=?, record_count=?, note=? WHERE key='ibb-open-data'`).run(
      nowISO(),
      unique.length,
      `${unique.length} veri seti keşfedildi. Datastore kaynaklarını "eşle" adımından bağlayın.`
    )
    audit('sync', 'source', 'ibb-open-data', { datasets: unique.length })
    return {
      ok: true,
      message: `İBB Açık Veri'de ${unique.length} ilgili veri seti bulundu.`,
      datasets: unique
    }
  } catch (e) {
    db.prepare(`UPDATE sources SET status='hata', note=? WHERE key='ibb-open-data'`).run(offlineMessage(e))
    return { ok: false, error: offlineMessage(e) }
  }
}

/** İBB CKAN datastore kaynağından satır çeker (resource_id biliniyorsa). */
export async function pullIBBResource(resourceId, limit = 500) {
  try {
    const json = await fetchJSON(`${IBB_BASE}/datastore_search?resource_id=${encodeURIComponent(resourceId)}&limit=${limit}`)
    const records = json?.result?.records || []
    return { ok: true, total: json?.result?.total ?? records.length, records }
  } catch (e) {
    return { ok: false, error: offlineMessage(e) }
  }
}

/* ---------------------------------- OSM ---------------------------------- */

const OVERPASS = 'https://overpass-api.de/api/interpreter'

const OVERPASS_QUERY = `[out:json][timeout:40];
(
  node["railway"="station"]["station"="subway"](40.78,28.10,41.35,29.70);
  node["station"="metro"](40.78,28.10,41.35,29.70);
  node["public_transport"="station"]["subway"="yes"](40.78,28.10,41.35,29.70);
);
out center tags 300;`

export async function syncOSM() {
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 45000)
    let json
    try {
      const res = await fetch(OVERPASS, {
        method: 'POST',
        body: 'data=' + encodeURIComponent(OVERPASS_QUERY),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'BolgeRadar/0.1' },
        signal: controller.signal
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      json = await res.json()
    } finally {
      clearTimeout(timer)
    }
    const elements = json?.elements || []
    let added = 0
    const maxId = db.prepare(`SELECT COALESCE(MAX(id),0) AS m FROM pois`).get().m
    const insert = db.prepare(`INSERT OR IGNORE INTO pois (id, kind, name, lat, lng, line) VALUES (?,?,?,?,?,?)`)
    let nextId = Number(maxId) + 1
    const existingNames = new Set(db.prepare(`SELECT name FROM pois`).all().map((r) => r.name))
    for (const el of elements) {
      const name = el.tags?.name
      if (!name || existingNames.has(name)) continue
      insert.run(nextId++, 'metro', name, el.lat ?? el.center?.lat, el.lon ?? el.center?.lon, el.tags?.ref || null)
      existingNames.add(name)
      added++
    }
    db.prepare(`UPDATE sources SET status='aktif', last_sync=?, record_count=?, note=? WHERE key='osm'`).run(
      nowISO(),
      elements.length,
      `Overpass: ${elements.length} istasyon bulundu, ${added} yeni kayıt eklendi.`
    )
    audit('sync', 'source', 'osm', { found: elements.length, added })
    return { ok: true, message: `${elements.length} istasyon bulundu, ${added} yeni POI eklendi.`, added }
  } catch (e) {
    db.prepare(`UPDATE sources SET status='hata', note=? WHERE key='osm'`).run(offlineMessage(e))
    return { ok: false, error: offlineMessage(e) }
  }
}

/* ---------------------------------- TÜİK --------------------------------- */

export async function syncTUIK() {
  // TÜİK Veri Portalı (veri.tuik.gov.tr) resmî, anahtarsız, kararlı bir JSON API sunmuyor.
  // Bu yüzden otomatik çekim yerine yarı-otomatik yolu belgeliyoruz.
  const note =
    'TÜİK konut satış istatistikleri il düzeyinde aylık yayımlanır. veri.tuik.gov.tr üzerinden ' +
    'ilgili tablo indirilip "Veri Merkezi > İçe Aktarma" ile yüklenebilir. Bu bağlayıcı kasıtlı ' +
    'olarak otomatik kazıma yapmaz.'
  db.prepare(`UPDATE sources SET status='manuel', note=? WHERE key='tuik'`).run(note)
  return { ok: true, message: note, manual: true }
}

function dedupeBy(arr, key) {
  const seen = new Map()
  for (const item of arr) if (!seen.has(item[key])) seen.set(item[key], item)
  return Array.from(seen.values())
}

export function connectorSuggestion() {
  if (getSetting('demo_mode') === '1') {
    return 'Demo modundasınız. Gerçek veri için Veri Merkezi > İçe Aktarma bölümünden CSV/XML yükleyin.'
  }
  return null
}
