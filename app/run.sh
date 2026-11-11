#!/bin/bash
# Emlak Kayıt Yönetimi - kurulum + başlatma
# Kullanım: ./run.sh   (tarayıcıda http://sunucu:5000)
set -e
cd "$(dirname "$0")"
if [ ! -x .venv/bin/python ]; then
  echo ">> sanal ortam kuruluyor..."
  python3 -m venv .venv
fi
echo ">> bağımlılıklar denetleniyor..."
.venv/bin/pip install -q -r requirements.txt
if [ ! -f data/app.db ]; then
  echo ">> veri tabanı oluşturuluyor..."
  .venv/bin/python import_data.py
fi
echo ">> uygulama başlatıldı: http://0.0.0.0:${PORT:-5000}"
exec .venv/bin/python app.py
