# Bot Auto Order Config — GEN SSH STORE

Bot Telegram jualan config semi-auto: order → QRIS → admin approve → kirim file config.

## Cara Install (VPS)
```
apt update && apt install -y nodejs npm git screen
git clone https://github.com/akunkhususjualanssh-create/bot-auto-order-config.git
cd bot-auto-order-config
npm install
screen -dmS botconfig bash -c 'node index.js'
screen -r botconfig
```

## Setup Awal
Saat pertama kali dijalankan, bot akan **bertanya di terminal**:
1. `Masukan token bot:` → paste token dari @BotFather
2. `Masukan owner id:` → paste ID Telegram kamu (cek @userinfobot)

Config disimpan otomatis ke `config.json` (tidak ikut ke git).

## Fitur
- 🛍️ Katalog produk (harga berbeda 2 IP / 5 IP)
- 💳 QRIS manual (admin set via /setqris)
- 📦 Order tracking + re-download config
- 🔧 Panel admin: /addproduk /delproduk /editproduk /orderlist /stats /broadcast
