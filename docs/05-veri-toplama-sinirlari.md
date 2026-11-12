# 05 · Veri Toplama Sınırları ve Yasal Alternatifler

> Bu doküman hukuki görüş değildir; teknik ekibe yön verir. Nihai değerlendirme için KVKK/ceza hukuku danışmanı gerekir.
> Tüm tutanaklar 12 Kasım 2026 tarihli kamuya açık kaynaklardan derlenmiştir.

## 1. Sorulan şey neydi?

"Bölgedeki dairelerin sahiplerinin telefon ve adreslerini portallardan toplu çekmek."

Bu istek üç ayrı hukuki katmana aynı anda dokunur:

1. **Kişisel veri işleme** (KVKK 6698) — telefon + ad soyad + adres
2. **Sözleşmeye aykırılık** (portal kurumsal/kullanıcı sözleşmesi)
3. **Ceza hukuku** (TCK 135–138, 243–244)

## 2. Neden "kendi sunucumda tutarım, kimse bilmez" işe yaramaz?

Veri sorumlusu sizsiniz; programın nerede çalıştığı hukuki sorumluluğu değiştirmez.

| Kırılma noktası | Neden |
|---|---|
| **Veri sahibinin şikâyeti** | Listeye giren tek bir satıcı Kurul'a başvurduğunda inceleme başlar; "kimse bilmeyecek" varsayımı tek kişiyle çöker |
| **Kaynağın logları** | Portal tarafında IP, oturum, istek imzası kayıtlıdır; ceza dosyasında bilirkişi bu kaydı ister |
| **Ekip içi ihtilaf** | İşten ayrılan çalışan, müşteri ya da rakip; veri setinin varlığı en sık bu yolla ortaya çıkar |
| **İhbar/tesadüf** | Aynı numaralara kısa sürede çok kanaldan ulaşılması (İYS şikâyeti) otomatik sinyal üretir |
| **Yedek/cihaz** | Yerel disk, bulut yedeği, eski laptop — veri bir kez toplandığında kontrolü kaybedersiniz |

## 3. Somut yaptırımlar (2026)

**KVKK m.18 idari para cezaları** (yeniden değerleme %25,49 uygulanmış):

| İhlal | 2026 aralığı |
|---|---|
| Aydınlatma yükümlülüğü (m.10) | 85.437 ₺ – 1.709.200 ₺ |
| Veri güvenliği yükümlülükleri (m.12) | 256.357 ₺ – **17.092.242 ₺** |
| VERBİS kayıt/bildirim (m.16) | 341.809 ₺ – 17.092.242 ₺ |
| Kurul kararına uymama (m.15) | 427.263 ₺ – 17.092.242 ₺ |

**Ceza hukuku (TCK):**

| Fiil | Madde | Ceza |
|---|---|---|
| Kişisel verileri hukuka aykırı kaydetme | 135/1 | 1–3 yıl hapis |
| Verme, yayma, ele geçirme | 136/1 | 2–4 yıl hapis |
| Süresi geçen veriyi yok etmeme | 138/1 | 1–2 yıl hapis |
| Bilişim sistemine hukuka aykırı erişim | 243/1 | 1–3 yıl hapis |

**Emsal:** Yargıtay 8. Ceza Dairesi, 2022/526 E. – 2024/2623 K. — sahibinden.com ilanlarını kendi sitesine taşıyıp
ilan sahiplerine mesaj atan şirket hakkında bilişim suçlarından yargılama yürütüldü; yerel mahkeme mahkûmiyet verdi,
Yargıtay teknik inceleme eksikliği nedeniyle bozdu. Dava **açıldı** ve yıllarca sürdü — bu tek başına caydırıcı maliyet.

## 4. Portal sözleşmeleri ne diyor?

sahibinden.com Kurumsal Hesap Sözleşmesi (özet):

- m.4.15 — "Portal üzerinden yayımlanan ilanların… kopyalanması, çoğaltılması, iletilmesi, işlenmesi ve başka
  mecralarda görüntülenmesi yasaktır."
- m.4.18 — "Veritabanı ve bu veritabanında yer alan bilgiler kısmen veya tamamen yazılı rıza olmadan kopyalanamaz,
  başka veritabanlarına aktarılamaz."
- İlan içindeki kişisel veriler "başkaca bir amaçla kullanılamaz, kopyalanamaz, işlenemez, dağıtılamaz."

Sonuç: teknik engel aşılabilir olsa bile **sözleşme ihlali** ve **haksız rekabet** iddiaları ayrıca doğar
(TTK m.50 vd. ticari sır/işletme bilgisi, haksız rekabet hükümleri).

## 5. Aynı iş hedefine ulaşan yasal yollar

| Yol | Ne verir | Hukuki dayanak | Emek |
|---|---|---|---|
| **Portföy yetkilendirme sözleşmesi** | Satıcının adı, telefonu, adresi, münhasır satış hakkı | KVKK m.5/2-c (sözleşme) | Aylık görüşme/davet |
| **Gelen talep (inbound)** — değerleme formu, WhatsApp, "evimi sat" sayfası | Kendi rızasıyla gelen satıcı + alıcı | Açık rıza (m.5/1) + m.10 aydınlatma | Reklam/pazarlama |
| **Lisanslı portal feed'i** (kurumsal API) | Kendi ilanlarınızın tamamı (iletişim dahil) + pazar verisi | Sözleşme | Teknik entegrasyon (bu projede adaptör hazır) |
| **Ofislerarası portföy paylaşımı** | Diğer ofislerin münhasır portföyleri | Karşılıklı sözleşme + yetki belgesi | Sektörel ağ |
| **Açık/resmî veri** | Bölge fiyatı, nüfus, satış hacmi, ulaşım, deprem | Açık lisans | Hazır (İBB, TÜİK, OSM, AFAD) |
| **Değerleme servisleri** | Bağımsız ₺/m² tahmini, rapor | Ticari lisans | API aboneliği |
| **Kendi geçmiş işlemleriniz** | Kapattığınız satışların fiyat/süre verisi | Kendi veriniz | CRM disiplini |

## 6. Platformda hangi kararı verdik?

- ✅ İlan **ilan verisi** (fiyat, m², konum, süre) — yasal yoldan, feed/CSV ile
- ✅ **Aday/portföy kişisi** — yalnızca sözleşme veya açık rıza ile, maskeleme + denetim izi ile
- ❌ Portallardan **toplu kişisel veri kazıma** — teknik olarak mümkün, hukuken değil
- ❌ Kişi bazlı telefon eşleştirme servisi satın alma — aynı risk

## 7. Kaynaklar

- KVKK m.18 güncel tutarlar — https://www.koksalpartners.com/tr/kvkk-cezalari
- KVKK ihlal + TCK ceza tablosu — https://www.harbiyehukuk.com/kvkk-ihlal-cezalari
- Yargıtay 8. CD 2022/526 E., 2024/2623 K. özeti — https://x.com/surucudev/status/2010353939871387759
- sahibinden.com Kurumsal Hesap Sözleşmesi — https://www.sahibinden.com/sozlesmeler/kurumsal-hesap-sozlesmesi-24
- Rekabet Kurulu kararı (ilan verisi aktarımı değerlendirmesi) — https://www.kfd.com.tr/kararlar/sahibinden-bilgi-teknolojileri-pazarlama-emlak-23-39-754-263
- 6698 sayılı Kanun — https://www.mevzuat.gov.tr/mevzuat?MevzuatNo=6698
