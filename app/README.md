# Emlak Kayıt Yönetimi

TÜMÜ-revize.xlsx verisini yönetmek için web uygulaması.

## Özellikler

- **Tablo:** sayfalama, sıralama (sayı/tarih uyumlu), sütun gösterme-gizleme
- **Filtreleme:** genel arama (Türkçe uyumlu) + her sütunda ayrı filtre
- **Özet kartları:** duruma / türe göre tek tıkla filtreleme
- **Kayıt detayı:** tüm alanları görme ve düzenleme (revizyon notu ile)
- **Revizyon geçmişi:** her değişiklikte alan bazında eski → yeni kaydı
- **Notlar:** her kayda sınırsız not ekleme / düzenleme / silme
- **Görevler:** kayıt bazında yapılacaklar, bitiş tarihi, genel görev listesi
- **Etiketler:** renkli etiketler, etikete göre filtreleme
- **Dışa aktarma:** filtrelenmiş sonucu CSV veya XLSX indirme

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
