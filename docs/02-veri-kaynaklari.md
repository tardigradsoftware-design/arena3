# 02 · Veri Kaynakları

Bu doküman, projede kullanılan/kullanılabilecek **tüm açık ve yasal** veri kaynaklarını; erişim yöntemi,
lisans ve otomasyon durumu ile birlikte listeler.

> Kural: Kişisel veri (telefon, ad-soyad + adres) üreten kaynaklar toplu kazımaya **kapalıdır**.
> Yalnızca ilan, bölge ve kamuya açık istatistik verisi otomatik çekilir.

## 1. İlan verisi (portföyün omurgası)

| Kaynak | Yöntem | Durum | Not |
|---|---|---|---|
| **Kendi CRM / Excel** | CSV içe aktarma | ✅ Hazır | En yüksek kalite; `Veri Merkezi → İçe Aktarma` |
| **sahibinden.com kurumsal** | Erişim anahtarı ile API / XML feed | 🔌 Adaptör noktası hazır | Kurumsal emlak paketinde "ilan verisi transferi" sunulur; anahtar ofis panelinden alınır. Kulllanım şartları ve sözleşme gerekir. |
| **hepsiemlak** | Kurumsal XML feed | 🔌 Adaptör noktası hazır | Ofis anlaşması gerekir |
| **emlakjet** | Kurumsal feed | 🔌 Adaptör noktası hazır | Ofis anlaşması gerekir |
| **Kendi web formunuz** | POST / API | ⚙️ Geliştirilebilir | Aday verisi buradan gelir (rıza metni ile) |

**Neden botla kazıma yok?** Portalların kullanım şartları otomatik veri çekimini açıkça yasaklar; ayrıca sayfada
yayınlanan ilan sahibi telefonları kişisel veri sayılır (KVKK m.3/d, m.5). Ticari amaçla toplu işleme, hukuki dayanak
olmadan yapılamaz ve idari para cezası riski taşır.

### Beklenen feed alanları

`ilan_no, baslik, ilce, mahalle, islem_tipi, oda, net_m2, brut_m2, fiyat, kat, kat_sayisi, bina_yasi, isitma, aidat,
lat, lng, satici_tipi, ofis, url, ilk_gorulme`

`server/ingest.js` içindeki `FIELD_ALIASES` tablosu Türkçe/İngilizce eşanlamlıları otomatik eşler
(`fiyat`, `bedel`, `talep_fiyati` → `price` vb.).

## 2. Bölge ve kamuya açık veri

| Kaynak | URL | Erişim | Lisans/kural | Platformdaki durum |
|---|---|---|---|---|
| **İBB Açık Veri Portalı** | `https://data.ibb.gov.tr` | CKAN API: `/api/3/action/package_search`, `datastore_search` | Açık veri; atıf önerilir | ✅ `syncIBB()` ile veri seti keşfi, `pullIBBResource()` ile satır çekme |
| **TÜİK — Konut Satış İstatistikleri** | `https://veri.tuik.gov.tr` | İl bazında aylık tablo; resmî kararlı JSON API yok | Açık; kaynak gösterimi zorunlu | ⚠️ Yarı-otomatik (indir → içe aktar) |
| **TCMB EVDS — Konut Fiyat Endeksi, kredi faizi** | `https://evds2.tcmb.gov.tr` | API anahtarı ile seri çekme | Anahtar ücretsiz, kullanım şartları var | 🗺️ v0.2 yol haritası |
| **OpenStreetMap (Overpass)** | `https://overpass-api.de/api/interpreter` | Overpass QL | **ODbL** — atıf + türev paylaşım | ✅ `syncOSM()` metro/metrobüs istihbarı çeker |
| **Nominatim (geocoding)** | `https://nominatim.openstreetmap.org` | HTTP | 1 istek/sn, `User-Agent` zorunlu | 🗺️ v0.3 yol haritası |
| **Ulusal Açık Veri Portalı** | `https://data.gov.tr` | CKAN benzeri | Açık | 🔍 Keşif |
| **Tapu ve Kadastro (TAKBİS/parsel)** | `https://cbss.tkgm.gov.tr` | Yalnızca malik/yetkili sorgusu (e-Devlet) | Kapalı — toplu erişim yok | ❌ Kapsam dışı |
| **Deprem tehlike haritası (AFAD)** | `https://www.afad.gov.tr` | Yayın/pafta | Açık; atıf | 🗺️ İlçe risk katmanı olarak planlı |
| **Nüfus / mahalle verisi** | İBB + TÜİK | CKAN/tablo | Açık | ✅ Demo referans tabloda, canlı bağlanabilir |

## 3. Türetilmiş veriler (platformun ürettiği)

| Türev | Nasıl | Nerede |
|---|---|---|
| **Bölge medyan ₺/m²** (ilçe × işlem × oda) | Aktif ilanların medyanı, örneklem ≥1 | `benchmarks` tablosu |
| **Fırsat skoru** | `scoring.js` ağırlıklı model | istek anında hesaplanır |
| **Pazarda kalma süresi** | `first_seen` → bugün | türetilmiş alan |
| **Fiyat gözlem geçmişi** | Her senkronda fiyat değişimi | `price_history` |
| **Konum profili** | En yakın ulaşım + 2 km odak yoğunluğu | `locationProfile()` |
| **Isı endeksi** | Satış hacmi + nüfus normalizasyonu | `districts.heat` |

## 4. Veri kalitesi kuralları

1. **Dedupe**: `external_id` > `url` > (ilçe+oda+m²+işlem) imzası. Aynı parmak izi ikinci kez eklenmez, güncellenir.
2. **Fiyat gözlemi**: değişim >1 ₺ ise `price_history`'ye satır yazılır, `price_drops` sayaç artar.
3. **Sayı ayrıştırma**: `1.250.000`, `1,250,000`, `1250000 TL`, `1 250 000` biçimleri normalize edilir.
4. **Birim tutarlılığı**: tüm fiyatlar ₺; m² net öncelikli, yoksa brüt.
5. **Kaynak damgası**: her satırda `source` + içe aktarma kaydı (`imports` tablosu) tutulur.
6. **Kapsam etiketi**: demo kayıtlar `source='demo'`, arayüzde "demo kayıt" rozeti.

## 5. Güncelleme sıklığı önerisi

| Veri | Sıklık | Yöntem |
|---|---|---|
| İlan feed'i | 30–60 dk | cron + `POST /api/sources/xml-feed/sync` (v0.2) |
| Bölge endeksi | Aylık | İBB/TÜİK içe aktarma |
| POI (ulaşım) | 6 ayda bir | Overpass |
| Benchmark | Her içe aktarmada otomatik | `refreshBenchmarks()` |
