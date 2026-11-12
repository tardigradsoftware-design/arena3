# 03 · KVKK Uyum Notu (Teknik)

> Bu doküman **hukuki görüş değildir**. Teknik kontrolleri ve önerilen süreçleri tanımlar.
> Nihai değerlendirme için KVKK danışmanınıza başvurun.

## 1. Temel ayrım: hangi veri kişisel?

| Veri | Kişisel mi? | Platformun yaklaşımı |
|---|---|---|
| İlan fiyatı, m², oda sayısı, ilçe | ❌ | Serbestçe işlenir |
| İlanın yaklaşık konumu (lat/lng) | ⚠️ Tek başına anonim; kişiyle eşleşirse değil | Yalnızca ilan kaydıyla birlikte saklanır, kişiye bağlanmaz |
| İlan sahibinin adı + telefonu | ✅ Kişisel veri | **Toplu kazınmaz.** Yalnızca hukuki dayanakla, kendi kanalınızdan |
| Aday/müşteri adı + telefon + bütçe | ✅ Kişisel veri | Zorunlu dayanak + maskeleme + denetim izi |
| Tapu malik bilgisi | ✅ Özel nitelikli olabilir | Platformda tutulmaz; yalnızca yetkili sorgu |

**Kritik nokta:** Portalda "herkese açık" görünen bir telefon numarası, KVKK anlamında "herkesin işleyebileceği veri"
değildir. Alenileşmiş veri istisnası (m.5/2-d) dar yorumlanır; **ticari amaçla toplu iletişim/pazarlama** için
ayrıca İYS (İleti Yönetim Sistemi) yükümlülüğü ve açık rıza gerekir.

## 2. Platformun teknik garantileri

| Kontrol | Uygulama | Kod |
|---|---|---|
| Hukuki dayanak zorunlu | `lawful_basis` alanı olmadan kayıt reddedilir (HTTP 422) | `server/index.js → POST /api/leads` |
| Açık rızada kanıt | `consent_ref` (rıza metni sürümü/tarih/Kanal referansı) zorunlu | aynı yer |
| Veri minimizasyonu | TCKN, adres, doğum tarihi gibi alanlar **hiç yok** | `leads` şeması |
| Maskeli görüntüleme | Liste görünümünde telefon `055 *** ** 33` | `maskedPhone()` |
| Gerekçeli erişim | Görüntüleme gerekçesi + aktör denetim kaydına yazılır | `audit('reveal', …)` |
| Silme hakkı (m.7/m.11) | Silme, kişisel alanları anonimleştirir + kayıt bırakır | `DELETE /api/leads/:id` |
| Saklama süresi | Varsayılan 24 ay, `retention_until` alanı | `POST /api/leads` |
| Denetim izi | Tüm oluşturma/görüntüleme/silme işlemleri | `audit_log` tablosu |
| Kaynak şeffaflığı | Her adayda `source` (hangi kanal) | `leads.source` |

## 3. Önerilen süreç (operasyonel)

1. **Aydınlatma metni** — ofis web sitesinde ve aday formunda; veri sorumlusu unvanı, amaç, saklama süresi, haklar.
2. **Rıza kaydı** — açık rıza ile işlenen her alan için metin sürümü + zaman damgası + kanal (form/e-posta) saklanır.
3. **VERBİS** — çalışan sayısı/işlem hacmi eşiklerine göre kayıt yükümlülüğünü kontrol edin; veri işleme envanterini
   bu platformun `leads` + `audit_log` şeması üzerinden üretin.
4. **İYS** — ticari elektronik ileti (SMS/e-posta/WhatsApp) gönderimi için onay kaydı; rıza yoksa gönderim yapılmaz.
5. **Saklama & imha** — süre sonunda otomatik anonimleştirme; yıllık imha tutanağı.
6. **Veri işleyen sözleşmesi** — platformu barındıran bulut sağlayıcı ile KVKK m.9 uyumlu sözleşme; yurt dışı aktarım varsa
   Kurul kararlarına uygunluk.
7. **İhlal bildirimi** — 72 saat kuralı için olay müdahale planı; `audit_log` inceleme kaynağıdır.

## 4. Üçüncü taraf yükümlülükler

| Kaynak | Yükümlülük |
|---|---|
| **sahibinden / hepsiemlak / emlakjet** | Kullanım şartları: botla toplama yasak; yalnızca kurumsal API/XML feed. İlan içeriği telif kapsamında |
| **OpenStreetMap** | ODbL: atıf ("© OpenStreetMap katkıcıları") + türetilmiş veritabanı paylaşımı |
| **İBB Açık Veri** | Atıf; veri seti bazlı lisans notlarına uyum |
| **TÜİK / TCMB** | Kaynak gösterimi; serbestçe yeniden yayınlama sınırları |

## 5. Ürün kararları (ve gerekçeleri)

- **Neden telefon alanı ayrı tabloda?** İlan verisi (anonim) ile kişisel veri (aday) fiziksel olarak ayrışır; ilan
  tablosunun tamamı dışa aktarılabilir, kişisel tablo ayrı yetkiye tabidir.
- **Neden kazıma yok?** Teknik olarak mümkün olsa da hukuka aykırı; ürünün sürdürülebilirliğini riske atar.
- **Neden "aleni edilmiş veri" varsayılan değil?** Dar yorum; ayrıca pazarlama iletişimi için İYS onayı gerekir.
- **Neden demo veri etiketli?** Kurgusal ilanların gerçek sanılıp karar dayanağı yapılmasını engellemek.

## 6. Kontrol listesi (yayına çıkmadan)

- [ ] Aydınlatma metni yayında ve form ekranında bağlantılı
- [ ] Aday formunda rıza metni sürümü kaydediliyor (`consent_ref`)
- [ ] Saklama süresi politikanızla uyumlu (varsayılan 24 ay)
- [ ] Silme talebi akışı tanımlı ve test edildi
- [ ] Erişim yetkileri rol bazlı (v1.0)
- [ ] Yedeklerde kişisel veri şifreleme/erişim kontrolü
- [ ] VERBİS / İYS durumu değerlendirildi
- [ ] Portal feed sözleşmesi imzalı, feed dışı çekim yok
- [ ] OSM atıfı haritada görünür
