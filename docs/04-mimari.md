# 04 · Mimari ve Genişletme

## Dosya düzeni

```
arena3/
├── server/
│   ├── index.js         Express API + statik arayüz servisi
│   ├── db.js            node:sqlite bağlantısı, şema, audit yardımcıları
│   ├── scoring.js       fırsat skoru, risk profili, konum profili, haversine
│   ├── ingest.js        CSV/XML ayrıştırma, alan eşleme, dedupe, upsert, benchmark
│   ├── connectors.js    İBB CKAN · OSM Overpass · TÜİK
│   ├── seed.js          deterministik demo veri üretici
│   ├── lib/districts.js 39 ilçe + 65 ulaşım/yaşam odağı referansı
│   └── data/*.db        (git dışı) SQLite dosyası
├── web/
│   ├── index.html
│   └── src/
│       ├── App.tsx           kabuk, navigasyon, yönlendirme (router yok)
│       ├── api.ts            fetch sarmalayıcı + biçimlendirme yardımcıları
│       ├── styles.css        tasarım sistemi (token + bileşenler)
│       ├── components/       Icons, Charts (SVG), ListingDrawer
│       └── views/            Radar, MapView, DistrictView, DataCenter, Alerts
├── scripts/smoke*.mjs   jsdom tabanlı duman testleri
└── docs/                ürün planı, veri kaynakları, KVKK, mimari
```

## Katmanlar

```
[CSV / XML feed]  ─┐
[İBB / OSM / TÜİK]─┼→ ingest / connectors → normalize → dedupe → SQLite
[demo seed]       ─┘                                    │
                                                        ↓
                              benchmarks + scoring (istek anında)
                                                        ↓
                                     REST API (/api/*)  → React SPA
```

**Neden skor istek anında?** Benchmark değiştiğinde (yeni içe aktarma) tüm skorların geçerli olması için. 740 ilan için
hesaplama ~15 ms; 50.000 ilan için skoru gece işine taşıyıp `listings` tablosuna yazmak gerekir (bkz. ölçekleme).

## Veritabanı şeması (özet)

| Tablo | Amaç | Anahtar alanlar |
|---|---|---|
| `districts` | İlçe referansı | `benchmark_sale_m2`, `heat`, `sales_12m` |
| `listings` | İlanlar | `fingerprint` (UNIQUE), `price_per_m2`, `first_seen`, `price_drops` |
| `price_history` | Fiyat gözlemleri | `listing_id`, `observed_at`, `price` |
| `benchmarks` | Medyan ₺/m² | PK (`district`,`deal_type`,`rooms`) |
| `market_index` | 18 aylık ilçe endeksi | PK (`district`,`month`) |
| `pois` | Ulaşım/yaşam odakları | `kind`, `lat`, `lng` |
| `alerts` | Kural tanımları | `criteria` (JSON) |
| `leads` | Adaylar (kişisel) | `lawful_basis`, `consent_ref`, `retention_until`, `deleted_at` |
| `audit_log` | Denetim izi | `action`, `entity`, `meta` |
| `sources` / `imports` | Veri kaynağı ve yükleme geçmişi | `status`, `rows_imported` |

## Skor motoru

`server/scoring.js`:

- `scoreListing(listing, benchmark, district, location)` → `{ score, tier, undervalue_pct, factors[] }`
- `riskProfile(listing)` → risk bayrakları (bina yaşı, kat, aidat, verim)
- `locationProfile(listing, pois)` → en yakın ulaşım + 2 km odak sayıları
- `WEIGHTS` → tüm katsayılar tek yerde; kalibrasyon buradan yapılır

Faktör katkıları UI'a aynen taşınır; kullanıcı "neden 82?" sorusunun yanıtını görür.

## Genişletme noktaları

### 1. Yeni bir veri kaynağı (feed)

```js
// server/connectors.js içine
export async function syncMyPortal() {
  const res = await fetch('https://portal.example/feed.xml', { headers: { Authorization: `Bearer ${process.env.TOKEN}` } })
  const xml = await res.text()
  const { importXML } = await import('./ingest.js')
  const r = importXML(xml, { sourceKey: 'my-portal', fileName: 'feed.xml' })
  return { ok: r.ok, message: `${r.imported} yeni, ${r.updated} güncelleme` }
}
```

`server/index.js` içindeki `/api/sources/:key/sync` yönlendirmesine ekleyin. Zamanlanmış çalıştırma için
`node-cron` / sistem cron'u + `POST /api/sources/my-portal/sync`.

### 2. Yeni bir alan (CSV kolonu)

`server/ingest.js → FIELD_ALIASES` içine `alan: ['tr_esdeger', 'en_esdeger']` ekleyin; şema için `db.js`'e kolon ekleyin.
`normalizeKey` Türkçe karakterleri otomatik sadeleştirir.

### 3. Bildirim kanalı

```js
// Kural çalıştırıcı (cron) → matchesFor(criteria) → Telegram
await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ chat_id, text })
})
```
`matchesFor` şu anda `server/index.js` içinde; ayrı bir `server/alerting.js` dosyasına taşınması önerilir.

### 4. Ölçekleme (50.000+ ilan)

- Skoru gece işinde hesapla → `listings.score` kolonuna yaz, indeksle.
- `benchmarks` tablosunu ilçe × oda × m² bandı olarak genişlet (şu an sadece oda).
- API'de `enrich()` yerine hazır skoru oku; filtreleri SQL'e taşı.
- SQLite → PostgreSQL + PostGIS (yarıçap sorguları, geometri indeksleri).
- İlan listesini sayfalamada `keyset` (id < son) yöntemi.

### 5. Gerçek zamanlı

Server-Sent Events ile `/api/stream`: yeni içe aktarma sonrası radar tablosunu canlı yenile.

## Test yaklaşımı

| Seviye | Araç | Kapsam |
|---|---|---|
| Duman | `scripts/smoke.mjs` | Radar görünümü, KPI, tablo, grafik |
| Görünümler | `scripts/smoke-views.mjs` | Bölge, uyarılar, veri merkezi, sekmeler, drawer |
| API | `curl` örnekleri (README) | Tüm uçların 200/422 davranışı |
| Veri | `npm run seed` deterministik | PRNG sabit → aynı evren |

## Güvenlik notları

- Şu an kimlik doğrulama yok (tek kullanıcı/local). Üretimde: oturum + rol (danışman / ofis yöneticisi / salt-okunur).
- `leads` tablosuna erişim rol kontrolüne bağlanmalı; `reveal` ucu ayrı yetki istemeli.
- Ortam değişkenleri: `PORT`, `BOLGERADAR_DB`, portal `*_TOKEN`, Telegram `TOKEN/CHAT_ID`.
- Yedekleme: SQLite `VACUUM INTO` + günlük kopya; WAL modu açık.
