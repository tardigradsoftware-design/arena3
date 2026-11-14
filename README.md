# Kısa Video + Notion Rehber Üretim Hattı

Google Drive'daki takip tablosunu okuyup her satır için **9:16 (1080x1920) dikey video** üretir ve
eş zamanlı olarak **Notion rehber sayfası** oluşturur. Sosyal medya DM/ManyChat otomasyonu
kapsam dışıdır: yalnızca video + Notion sayfası + tablo güncellemesi yapılır.

## Hangi tablo?

Drive klasöründe iki kaynak var:

| Dosya | Rol |
| --- | --- |
| `yasal_takip` (Google E-Tablo) | **Canlı takip tablosu** — gerçek sütunlar + 1-3 satırları işlenmiş ("Hazır") |
| `yasal.csv.ods` | CSV'nin ODS kopyası (salt okunur anlık görüntü, Durum hep "Bekliyor") |

Canlı tablo kullanılır. Her çalıştırmada önce `yasal_takip_YEDEK_<tarih>` yedeği alınır,
ardından güncelleme **yalnızca** o kopyaya yazılır (yanlış sütuna yazma riskini elemek için).

## Sütunlar

`ID, Kategori, Hook, TTS_Metni, Ekran_Yazisi, Gorsel_Prompt, CTA_Kelimesi, Notion_Rehber_Ozeti, Durum, Video_Drive_Linki, Notion_Sayfa_Linki`

## Video kuralları (uygulanan)

- **Format:** 1080x1920, 30 fps, H.264 (yuv420p, faststart) + AAC 192k.
- **TTS:** `TTS_Metni`, Türkçe enerjik ton. `atempo=1.15` ile hızlandırılır, baş/son sessizlik
  kırpılır, `dynaudnorm` + `highpass` ile güven veren akıcı ton.
- **Hook (0-3 sn):** `Ekran_Yazisi` büyük punto (Montserrat Black) + kicker etiketi,
  whoosh + sub-bass impact efektleri, scale-in animasyonu.
- **B-Roll:** `Gorsel_Prompt`a göre üretilmiş 4 dikey görsel; her 3-4 sn'de kesme ve
  sürekli yavaş zoom-in / pan (Ken Burns).
- **Altyazı:** Ekran ortasının biraz altında, sarı/beyaz, kalın font, **kelime kelime parlayan
  karaoke** stili (aktif kelime sarı).
- **CTA (son 3 sn):** "Yoruma **[CTA_Kelimesi]** yaz, rehberi gönderelim!" + pill animasyonu.
- **Ses:** TTS + arka plan pad + 100 BPM düşük pulse + whoosh/pop geçişleri, hafif limiter.

## Notion sayfası iskeleti

1. ⏱️ Özet callout
2. 📌 Kimler Faydalanabilir / Ön Şartlar
3. 🚀 Adım Adım İşlem Rehberi (menü yolları **kalın**: `e-Devlet -> Arama -> Hizmet`)
4. 📋 Kopyala-Yapıştır Hazır Dilekçe / Başvuru Metni (code block)
5. ⚠️ Altın İpucu (reddedilme riskini sıfırlayan tek kritik detay)
6. Yasal uyarı paragrafı

Sayfa, "Adım Adım Uygulama Rehberleri" sayfasının altına oluşturulur.

## Yeni senaryo seti (v2)

`yasal.csv.ods` yerine artık hikâye odaklı 10 senaryoluk set kullanılıyor. Bu set için
**`yasal_takip_v2_senaryo`** adlı ayrı bir Google E-Tablo oluşturuldu (aynı sütun yapısı,
ID'ler senaryo setiyle birebir). Bir satırı işlemek için:

1. `scripts/new_scenarios.json` içinden ilgili satırı al,
2. `out/cfg.json` üret (bkz. `out/cfg_1.json` örneği): `cta`, `ekran_yazisi`, `tts`,
   `kicker`, `images` (4 sahne), `blur` (okunabilir metin içeren sahneler), `vo_src`, `out`,
3. `generate_speech` ile TTS al, `assets/v2/broll/` altına 4 dikey görsel üret,
4. `VIDEO_CFG=cfg_1.json python3 scripts/render.py`

Render artık tamamen config güdümlü: kesme sıklığı (`cut_every`), sahne sırası, blur
miktarları, hook başlığı, kicker ve CTA metni hep config'den okunur.

## Dosyalar

```
scripts/audio_build.py   # whoosh / pop / boom / pad üretimi (numpy, sıfır dış bağımlılık)
scripts/render.py        # kare-kare PIL render + ffmpeg encode
assets/fonts/            # Montserrat 700/800/900 (Türkçe karakterli birleşik alt kümeler)
assets/broll/            # sahne görselleri
out/4_AİDAT.mp4          # üretilen video
```

## Yeniden üretim

```bash
python3 -m pip install --break-system-packages pillow numpy imageio-ffmpeg
python3 scripts/audio_build.py
python3 scripts/render.py
```

Yeni bir satır için `scripts/render.py` içindeki `HOOK_TITLE`, `CTA_WORD`, `VO_TEXT` ve
`assets/broll/*` değerlerini tablodaki satırla değiştirin.
