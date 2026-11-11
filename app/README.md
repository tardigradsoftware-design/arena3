# Emlak Kayıt Yönetimi

TÜMÜ-revize.xlsx verisini yönetmek için web uygulaması.

## Özellikler

- **Panel:** KPI kartları, durum pastası, proje grafikleri, yaklaşan görevler, hareket akışı
- **Kayıtlar:** sayfalama, sıralama (sayı/tarih uyumlu), sütun gösterme-gizleme, sıkışık/rahat görünüm
- **Filtreleme:** genel arama (Türkçe uyumlu) + her sütunda ayrı filtre + kayıtlı görünümler
- **Toplu işlem:** çoklu seçimle toplu etiket atama ve toplu görev oluşturma
- **Canlı özetler:** filtreye göre satış toplamı/ortalaması ve kira ortalaması
- **Kayıt detayı:** genel + tüm alanlar, tek tıkla arama (telefon), durum rozetleri
- **Revizyon geçmişi:** her değişiklikte alan bazında eski → yeni kaydı (zaman çizelgesi)
- **Notlar:** her kayda sınırsız not ekleme / düzenleme / silme
- **Görevler:** kayıt bazında yapılacaklar, bitiş tarihi, gecikmiş/bugün gruplu genel liste
- **Etiketler:** renkli etiketler, kullanım sayıları, etikete göre filtreleme
- **Komut paleti (Ctrl+K):** kayıtlara hızlı gitme + komutlar
- **Dışa aktarma:** filtrelenmiş sonucu CSV veya XLSX indirme
- **Koyu tema** + klavye kısayolları (Ctrl+K, Esc)
- **Excel'den güncelle:** yeni export ile tek tıkla senkron (not/görev/etiket korunur, değişiklikler revizyona işlenir)
- **Yeni ilan:** programa manuel kayıt girişi
- **Toplu durum:** seçili kayıtların durumunu tek seferde değiştirme (revizyonlu)
- **Karşılaştırma:** 2-4 kaydı yan yana kıyaslama
- **İlan sayfası:** yazdırılabilir / paylaşılabilir ilan föyü (`/ilan/<id>`)
- **Fiyat analizi:** m² birim fiyatı + fiyat geçmişi grafiği
- **Harita + ilan linki** kısayolları, **bugünkü ajanda** paneli

## Çalıştırma

```bash
cd app
./run.sh
# tarayıcıda: http://sunucu:5000
```

İlk çalışmada `TÜMÜ-revize.xlsx` okunup `data/app.db` (SQLite) oluşturulur.
Farklı dosya kullanmak için:

```bash
DATA_XLSX=/yol/dosya.xlsx PORT=8000 ./run.sh
```

## Gizlilik

`*.xlsx` ve `*.db` dosyaları `.gitignore` ile git dışında tutulur;
kişisel veri repoya eklenmez. Notlar, görevler, etiketler ve revizyonlar
yalnızca yerel `data/app.db` dosyasında saklanır.
