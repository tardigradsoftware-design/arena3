# 01 · Ürün Planı

## Problem

Bir emlak profesyonelinin günlük soruları:

1. "Şu an hangi ilan gerçekten **ucuz**?" (bölge medyanına göre)
2. "Hangi bölge **ısınıyor / soğuyor**?" (fiyat, hacim, pazarda kalma)
3. "Satıcı **ne kadar esnek**?" (kaç gündür ilanda, kaç kez indirim yaptı)
4. "Bu binanın çevresinde **ne var**?" (metro, okul, hastane, AVM)
5. "Bu ay hangi adaylara **dönmem** gerek?" — ve bunu KVKK'ya uygun biçimde

Geleneksel yanıt: portallarda elle gezmek + sezgisel fiyat tahmini + WhatsApp'ta dağınık aday listeleri.
BölgeRadar bu beş soruyu tek ekranda, tekrar üretilebilir bir skorla yanıtlar.

## Kullanıcılar

| Persona | İhtiyaç | Platformun yanıtı |
|---|---|---|
| **Portföy danışmanı** | Kendi ilçesinde alıcıya "bu fiyat iyi mi?" demek | Bölge medyanı, emsal listesi, iskonto %'si |
| **Yatırımcı** | Getiri ve likidite karşılaştırması | Brüt getiri, satış hacmi, ısı endeksi, ilçe tablosu |
| **Ofis sahibi** | Ekip verisinin ve adayların kayıt altında olması | Denetim kaydı, hukuki dayanak zorunluluğu, silme hakkı |
| **Veri meraklısı** | Ham veriyle kendi modelini kurmak | CSV dışa aktarma, şeffaf skor formülü |

## Ürün ilkeleri

1. **Açıklanabilirlik** — her skorun faktör dökümü görünür; kara kutu yok.
2. **Tek kaynak gerçeği** — fiyat/alan eşlemesi ve skor ağırlıkları tek dosyada.
3. **Veri hijyeni** — her kayıt kaynak + parmak izi (dedupe) + gözlem zamanı taşır.
4. **Yasal olan ölçeklenir** — kişisel veri toplama yerine ilan & bölge zekâsı.
5. **Offline dayanıklılık** — dış servis kapalıysa nazik hata, uygulama çalışmaya devam eder.

## Kapsam (v0.1 — bu sürüm)

- İstanbul, 39 ilçe, satılık + kiralık daire
- CSV/XML içe aktarma, otomatik kolon eşleme, dedupe, fiyat gözlem geçmişi
- Fırsat skoru, risk profili, konum profili
- Harita + yarıçap analizi, bölge analizi, ilçe karşılaştırma
- Uyarı kuralları, CSV dışa aktarma
- Portföy yetkileri (münhasırlık, komisyon, bitiş takibi) — yasal kişisel veri kapısı
- KVKK: hukuki dayanak, maskeleme, gerekçeli görüntüleme, silme, denetim kaydı

## Kapsam dışı (bilinçli)

- Kişi bazlı adres/telefon toplama (KVKK + portal şartları)
- Tapu sahibi sorgulama (yalnızca malik/yetkili erişebilir)
- Otomatik teklif/pazarlık botu
- Kredi/mortgage hesaplama (v0.2'de TCMB EVDS ile planlı)

## Ölçüm (başarı kriterleri)

| Metrik | Hedef |
|---|---|
| Skor–gerçek satış ilişkisi | Skoru ≥75 ilanların %40'ı 60 gün içinde kapanır (v1.0'da geriye dönük doğrulama) |
| Veri tazeliği | Aktif portföyün %90'ı son 48 saatte görülmüş |
| Eşleme kalitesi | CSV yüklemelerinde okunamayan satır oranı <%3 |
| Uyum | Hukuki dayanaksız kişisel kayıt = 0 |
| Kullanıcı | Günde ≥3 oturum, ortalama ≥6 dk |

## Yol haritası

**v0.2** — lisanslı feed adaptörü, zamanlanmış senkron (cron), Telegram/e-posta uyarı kanalı
**v0.3** — geocoding + adres arama, bina/parsel katmanı, fotoğraf galerisi
**v0.4** — değerleme modeli (hedonik + GBM), güven aralığı, "tahmini satış süresi"
**v1.0** — çok kullanıcı + rol, ofis izolasyonu, VERBİS envanteri, API anahtarları

## Riskler

| Risk | Etki | Önlem |
|---|---|---|
| Portal feed anlaşması alınamaması | Veri hacmi düşer | CSV içe aktarma + kendi portföy + açık veri |
| KVKK ihlali iddiası | İdari para cezası, itibar | Kişisel veri toplamama, dayanak zorunluluğu, denetim izi |
| Demo verinin gerçek sanılması | Yanlış karar | Arayüzde kalıcı "DEMO VERİ" rozeti + README uyarısı |
| Skorun yanlış yorumlanması | Kötü yatırım | Faktör dökümü, risk notları, "tavsiye değildir" ibaresi |
