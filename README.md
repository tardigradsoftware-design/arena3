# BölgeRadar — Gayrimenkul İstihbarat & Fırsat Radarı

İstanbul odaklı, **açıklanabilir skorlamayla** bölge ve ilan analizi yapan, kendi verinizi (CSV/XML feed) içine alan
ve **KVKK uyumlu** aday/portföy yönetimi sunan tek dosya tabanlı bir platform.

> **Neden "kişisel veri kazıma" değil?** Bölgedeki dairelerin sahiplerinin telefon/adres bilgisini portallardan toplu
> çekmek KVKK 6698 ve portal kullanım şartlarına aykırıdır. Bu platform bunun yerine **ilan + bölge zekâsı** üretir;
> kişisel iletişim verisini yalnızca hukuki dayanağı kayıtlı kaynaklardan (kendi formunuz, CRM'iniz, rıza kaydı) kabul eder.
> Ayrıntı: [`docs/03-kvkk-uyum.md`](docs/03-kvkk-uyum.md)

---

## Ne yapar?

| Yetenek | Açıklama |
|---|---|
| **Fırsat radarı** | Her ilanı ilçe + oda tipi medyan ₺/m²'siyle karşılaştırır, 0–100 fırsat skoru üretir, *neden* o skoru verdiğini faktör faktör gösterir |
| **Konum haritası** | İlçe balonları (ilan yoğunluğu + fiyat seviyesi), ilan noktaları (skor rengi), tıklayarak **yarıçap analizi** (500 m – 8 km) |
| **Bölge analizi** | 18 aylık fiyat endeksi, oda tipi kırılımı, mahalle tablosu, brüt getiri, likidite, 39 ilçe karşılaştırma tablosu |
| **Veri merkezi** | CSV/TSV/Excel-kopyala ve portal XML feed içe aktarma (otomatik kolon eşleme), dışa aktarma, kaynak durumu |
| **Uyarı kuralları** | "Kadıköy · satılık · 2+1 · skor ≥ 75 · medyanın %92'sinden ucuz" gibi kurallar; eşleşmeler anlık hesaplanır |
| **KVKK kayıtları** | Hukuki dayanak zorunlu aday kaydı, maskeli telefon, gerekçeli görüntüleme, silme hakkı, denetim kaydı |
| **Açık veri bağlayıcıları** | İBB CKAN API, OpenStreetMap Overpass, TÜİK yönlendirmesi (internet erişimi olan ortamda canlı) |

---

## Hızlı başlangıç

```bash
npm install
npm run seed        # 39 ilçe, 65 odak noktası, ~740 kurgusal ilan, 18 aylık endeks
npm run build       # arayüzü derle (dist/)
npm start           # http://localhost:3000
```

Geliştirme modu (iki terminal):

```bash
npm run dev:api     # API :3000, dosya değişiminde yeniden başlar
npm run dev:web     # Vite :5173, /api isteklerini 3000'e proxy'ler
```

Gereksinim: **Node ≥ 22.5** (yerleşik `node:sqlite` kullanılır, native derleme yok).

Duman testleri (sunucu açıkken):

```bash
node scripts/smoke.mjs          # radar görünümü render + KPI + tablo
node scripts/smoke-views.mjs    # tüm görünümler + sekmeler
```

---

## Mimari

```
web/  (React + Vite + Leaflet)   ──►  server/  (Express + node:sqlite)
                                        │
                                        ├── ingest.js     CSV / XML → normalize → upsert / dedupe
                                        ├── scoring.js    fırsat skoru + risk + konum profili
                                        ├── connectors.js İBB CKAN · OSM Overpass · TÜİK
                                        ├── seed.js       deterministik demo evreni
                                        └── data/*.db     tek dosya veritabanı
```

* Skorlama tek yerde: `server/scoring.js` (ağırlıklar `WEIGHTS` objesinde).
* Alan eşlemesi tek yerde: `server/ingest.js` (`FIELD_ALIASES` — Türkçe başlıklar dahil).
* Tüm kişisel veri işlemleri `audit_log` tablosuna yazılır.
* Ayrıntı: [`docs/04-mimari.md`](docs/04-mimari.md)

### Skor formülü (özet)

```
skor = 50
     + 1.6 × (%m² iskontosu, ±35 sınırlı) × örneklem güveni
     + 0.55 × (fiyat düşüş sayısı + indirim oranı)
     + likidite (ilçe satış hacmi & ısı endeksi)
     + 0.35 × (45 günü aşan pazarda kalma)
     + konum (metro/metrobüs mesafesi + 2 km odak yoğunluğu)
     − risk (bina yaşı, kat, aidat oranı, net/brüt verim)
     + 4 (son 7 gün)
```

Eşikler: **≥80** yüksek · **65–79** iyi · **50–64** normal · **<50** zayıf.

---

## API

| Yöntem | Yol | Açıklama |
|---|---|---|
| GET | `/api/overview` | KPI'lar, ilçe tablosu, fiyat düşüşleri, skor dağılımı, 13 aylık trend |
| GET | `/api/listings` | Filtre + sıralama + sayfalama (`district`, `rooms`, `minScore`, `maxPpm2Ratio`, `lat/lng/radius`…) |
| GET | `/api/listings/:id` | Skor kırılımı, fiyat geçmişi, emsaller, risk notları, konum profili |
| GET | `/api/districts/:name` | İlçe endeksi, oda tablosu, mahalle kırılımı, fırsatlar, odak sayıları |
| GET | `/api/compare` | İlçe karşılaştırma tablosu |
| GET | `/api/geo` | Harita: ilçe balonları, ilan noktaları, POI |
| GET/POST/PATCH/DELETE | `/api/alerts` | Kural CRUD + `/api/alerts/:id/matches` |
| GET/POST/DELETE | `/api/leads` | KVKK kapılı aday kaydı, gerekçeli görüntüleme, anonimleştirme |
| POST | `/api/import/csv`, `/api/import/xml`, `/api/import/preview` | İçe aktarma ve kolon eşleme önizlemesi |
| POST | `/api/sources/:key/sync` | `ibb-open-data` · `osm` · `tuik` |
| GET | `/api/export/listings.csv`, `/api/sample-csv` | Dışa aktarma ve şablon |
| GET | `/api/audit` | Denetim kaydı |

---

## Demo veri uyarısı

`npm run seed` ile gelen **740 ilan, ofis adları ve fiyatlar tamamen kurgusaldır**; yalnızca arayüzü ve skor motorunu
gerçekçi yoğunlukta göstermek içindir. İlçe koordinatları, nüfus/satış büyüklükleri ve ulaşım noktaları gerçeğe
yakın referanslardır; resmî istatistik yerine kullanılamaz.

Gerçek kullanım için: Veri Merkezi → CSV/XML içe aktarma veya lisanslı portal feed'i
(bkz. [`docs/02-veri-kaynaklari.md`](docs/02-veri-kaynaklari.md)).

---

## Yol haritası

1. **Lisanslı portal feed adaptörü** (sahibinden / hepsiemlak kurumsal API) + zamanlanmış senkron
2. **Bildirim kanalları**: Telegram botu, e-posta (SMTP), günlük özet
3. **Geocoding**: adres → koordinat (Nominatim, 1 istek/sn politikası) + haritada adres arama
4. **Değerleme modeli**: hedonik regresyon / gradient boosting ile ₺/m² tahmini ve güven aralığı
5. **Ekip yönetimi**: kullanıcı/rol, ofis bazlı veri izolasyonu, VERBİS envanter dışa aktarımı
6. **Ekonomik göstergeler**: TCMB EVDS ile konut kredisi faizi, TÜFE, konut fiyat endeksi entegrasyonu

---

## Yasal not

Bu yazılım bir analiz aracıdır; yatırım tavsiyesi değildir. Kişisel veri işleyen her özellik kayıt tutar ve hukuki
dayanak ister. Nihai uyum değerlendirmesi için KVKK danışmanına başvurun.
