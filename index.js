/**
 * GEN SSH STORE — Bot Auto Order Config (v3)
 * Navigasi full inline: semua layar di-EDIT di satu pesan, chat bersih.
 */
const TelegramBot = require('node-telegram-bot-api');
const readline = require('readline');

const CONFIG_FILE = path.join(__dirname, 'config.json');

function ask(q) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(res => rl.question(q, a => { rl.close(); res(a.trim()); }));
}

async function loadConfig() {
  if (fs.existsSync(CONFIG_FILE)) {
    try {
      const c = JSON.parse(fs.readFileSync(CONFIG_FILE));
      if (c.token && c.owner_id) return c;
    } catch (e) {}
  }
  console.log('\n════════════════════════════════════');
  console.log('  SETUP AWAL — GEN SSH STORE BOT');
  console.log('════════════════════════════════════');
  const token = await ask('Masukan token bot: ');
  const owner = await ask('Masukan owner id: ');
  if (!token || !/^\d+:[\w-]{30,}$/.test(token)) {
    console.error('❌ Token bot tidak valid! Format: 123456789:AAxxxxxxx...');
    process.exit(1);
  }
  if (!owner || !/^\d+$/.test(owner)) {
    console.error('❌ Owner id tidak valid! Harus angka (ID Telegram kamu, cek @userinfobot).');
    process.exit(1);
  }
  const c = { token, owner_id: Number(owner) };
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(c, null, 2));
  console.log('✅ Config disimpan ke config.json — bot siap dijalankan!\n');
  return c;
}

(async () => {
const CONFIG = await loadConfig();
const TOKEN = CONFIG.token;
const ADMIN_ID = CONFIG.owner_id;
const STORE_NAME = 'GEN SSH STORE';
const ADMIN_CONTACT = '@gensshstore';
const OPERATING_HOURS = '08.00 - 23.00 WIB';
const WAIT_MINUTES = '10-15 menit';
const REMINDER_MS = 15 * 60 * 1000;
const SEP = '━━━━━━━━━━━━━━━';

const DB_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DB_DIR, 'db.json');
if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });

let db = {
  users: {}, orders: {}, products: {},
  counters: { order: 0 }, qris_file_id: null, settings: { order_open: true }
};
if (fs.existsSync(DB_FILE)) {
  try { db = Object.assign(db, JSON.parse(fs.readFileSync(DB_FILE))); } catch (e) { console.error('DB load err', e); }
}
const save = () => { try { fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2)); } catch (e) { console.error(e); } };

const bot = new TelegramBot(TOKEN, { polling: true });
console.log('✅ ' + STORE_NAME + ' bot v3 started');

// ==================== HELPERS ====================
const rupiah = n => 'Rp' + Number(n).toLocaleString('id-ID');
const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const now = () => Date.now();
const stamp = t => new Date(t).toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const STATUS = {
  pending_pay: '⏳ Menunggu pembayaran',
  waiting: '🕓 Sedang diproses',
  done: '✅ Selesai',
  rejected: '❌ Ditolak',
  cancelled: '🚫 Dibatalkan'
};

function user(uid) { db.users[uid] = db.users[uid] || { state: null, temp: {}, joined: now(), msgs: [] }; return db.users[uid]; }
function isAdmin(uid) { return uid === ADMIN_ID; }
function newOrderId() { db.counters.order++; return 'A' + String(db.counters.order).padStart(4, '0'); }
function activeProducts() { return Object.values(db.products).filter(p => p.active); }
function pendingOrderOf(uid) {
  return Object.values(db.orders).find(o => o.buyer_id === uid && ['pending_pay', 'waiting'].includes(o.status));
}
function rev(arr) { return arr.reduce((s, x) => s + (x.base_price || x.price || 0), 0); }

// ---------- pelacakan pesan bot (untuk auto-edit) ----------
function track(uid, msg) {
  const u = user(uid);
  if (!u.msgs) u.msgs = [];
  if (msg && msg.message_id) {
    u.msgs.push(msg.message_id);
    if (u.msgs.length > 5) u.msgs.shift(); // simpan 5 terakhir
  }
  save();
}
// kirim/edit pesan "utama" — kalau sudah ada pesan bot aktif, EDIT itu; kalau tidak, kirim baru
async function show(chatId, text, kb) {
  const u = user(chatId);
  if (!u.msgs) u.msgs = [];
  let last = u.msgs[u.msgs.length - 1];
  if (last) {
    try {
      const opts = kb ? { chat_id: chatId, message_id: last, text, parse_mode: 'HTML', link_preview_options: { is_disabled: true }, reply_markup: { inline_keyboard: kb } }
                      : { chat_id: chatId, message_id: last, text, parse_mode: 'HTML', link_preview_options: { is_disabled: true } };
      await bot.editMessageText(text, opts);
      return last;
    } catch (e) {
      // pesan sudah hilang/tidak bisa diedit → kirim baru
    }
  }
  const m = await bot.sendMessage(chatId, text, { parse_mode: 'HTML', link_preview_options: { is_disabled: true }, reply_markup: kb ? { inline_keyboard: kb } : undefined });
  track(chatId, m);
  return m.message_id;
}
// pesan penting yang harus tetap ada (QRIS, config, dsb) — TIDAK diedit, tidak dihapus
async function keepMsg(chatId, text, kb) {
  return bot.sendMessage(chatId, text, { parse_mode: 'HTML', link_preview_options: { is_disabled: true }, reply_markup: kb ? { inline_keyboard: kb } : undefined });
}

// ==================== TAMPILAN ====================
const BTN_HOME = [{ text: '⬅️ Menu Utama', callback_data: 'nav:home' }];

function welcomeHTML(name) {
  return `<b>👋 Halo ${esc(name || 'Kak')}, selamat datang di</b>\n<b>🏪 ${STORE_NAME}</b>\n${SEP}\n\n` +
    `<blockquote>Kami jual <b>config premium</b> siap pakai — proses cepat, aman, dan bergaransi.</blockquote>\n\n` +
    `🛒 <b>Beli Config</b> — lihat daftar & order\n` +
    `📦 <b>Pesanan Saya</b> — cek status / download ulang\n` +
    `📖 <b>Cara Order</b> — panduan lengkap\n` +
    `🆘 <b>Hubungi Admin</b> — bantuan langsung\n\n` +
    `${SEP}\n` +
    `⚡ Proses ${WAIT_MINUTES} • 🕐 ${OPERATING_HOURS}\n` +
    `👨‍💻 Admin: ${ADMIN_CONTACT}`;
}
function homeKB(uid) {
  const kb = [
    [{ text: '🛒 Beli Config', callback_data: 'nav:shop' }, { text: '📦 Pesanan Saya', callback_data: 'nav:orders' }],
    [{ text: '📖 Cara Order', callback_data: 'nav:howto' }, { text: '🆘 Hubungi Admin', callback_data: 'nav:support' }]
  ];
  if (isAdmin(uid)) kb.push([{ text: '🛠️ Panel Admin', callback_data: 'adm:panel' }]);
  return kb;
}
function howtoHTML() {
  return `<b>📖 CARA ORDER</b>\n${SEP}\n\n` +
    `<blockquote>Ikuti 6 langkah mudah di bawah ini, config langsung dikirim ke chat kamu.</blockquote>\n\n` +
    `<b>1️⃣ Pilih Config</b>\nKetuk 🛒 <b>Beli Config</b>, pilih config yang kamu mau.\n\n` +
    `<b>2️⃣ Pilih Paket IP</b>\nTersedia paket <b>2 IP</b> (maks 2 perangkat) dan <b>5 IP</b> (maks 5 perangkat).\n\n` +
    `<b>3️⃣ Isi Username</b>\nKetik username untuk config kamu (huruf/angka, 4-16 karakter).\n\n` +
    `<b>4️⃣ Bayar via QRIS</b>\nScan QRIS & bayar <b>PERSIS</b> sesuai nominal — tanpa biaya admin.\n\n` +
    `<b>5️⃣ Kirim Bukti Transfer</b>\nScreenshot bukti transfer, lalu kirim sebagai <b>foto</b>.\n\n` +
    `<b>6️⃣ Config Dikirim Otomatis</b>\nTunggu ${WAIT_MINUTES}, config masuk ke chat ini.\n\n` +
    `${SEP}\n` +
    `❓ Config hilang? Buka <b>📦 Pesanan Saya</b> untuk download ulang.\n` +
    `🆘 Belum kelar &gt;15 menit? Hubungi ${ADMIN_CONTACT}`;
}
function supportHTML() {
  return `<b>🆘 HUBUNGI ADMIN</b>\n${SEP}\n\n` +
    `<blockquote>Ada kendala order atau config? Admin siap bantu.</blockquote>\n\n` +
    `👨‍💻 Admin : ${ADMIN_CONTACT}\n` +
    `🕐 Jam     : ${OPERATING_HOURS}\n\n` +
    `💡 <i>Tips: sertakan nomor order kamu (contoh #A0001) biar cepat ditangani.</i>`;
}
function shopHTML() {
  const prods = activeProducts();
  if (!prods.length) {
    return `<b>🛒 DAFTAR CONFIG</b>\n${SEP}\n\n<blockquote>📭 Belum ada config tersedia saat ini.\nSilakan cek lagi nanti atau hubungi ${ADMIN_CONTACT}.</blockquote>`;
  }
  let t = `<b>🛒 DAFTAR CONFIG</b>\n${SEP}\n\n`;
  prods.forEach((p, i) => {
    t += `<b>${i + 1}. ${esc(p.name)}</b>\n`;
    t += `⏱️ ${esc(p.duration_label)} • 🌐 ${esc(p.server || '-')}\n`;
    t += `💰 2 IP: <b>${rupiah(p.price)}</b> | 5 IP: <b>${rupiah(p.price5 || p.price)}</b>\n`;
    if (p.desc) t += `📝 ${esc(p.desc)}\n`;
    t += `\n`;
  });
  t += `${SEP}\n👇 <i>Ketuk config di bawah untuk mulai order</i>`;
  return t;
}
function shopKB() {
  const prods = activeProducts();
  const kb = prods.map(p => [{ text: `🛒 ${p.name} — ${p.duration_label}`, callback_data: 'prod:' + p.id }]);
  kb.push(BTN_HOME);
  return kb;
}
function prodHTML(p) {
  return `<b>📦 ${esc(p.name)}</b>\n${SEP}\n\n` +
    `<blockquote>${p.desc ? esc(p.desc) + '\n\n' : ''}Config siap pakai, dikirim otomatis ke chat kamu setelah pembayaran dikonfirmasi.</blockquote>\n\n` +
    `⏱️ Durasi : <b>${esc(p.duration_label)}</b>\n` +
    `🌐 Server : <b>${esc(p.server || '-')}</b>\n\n` +
    `${SEP}\n<b>📶 PILIH PAKET LIMIT IP</b>\n\n` +
    `Paket 2 IP  = dipakai maksimal <b>2 perangkat</b>\nPaket 5 IP  = dipakai maksimal <b>5 perangkat</b>\n\n` +
    `💰 2 IP → bayar <b>${rupiah(p.price)}</b>\n` +
    `💰 5 IP → bayar <b>${rupiah(p.price5 || p.price)}</b>\n\n` +
    `👇 <i>Ketuk paket pilihan kamu</i>`;
}
function prodKB(p) {
  return [
    [{ text: `📶 2 IP — ${rupiah(p.price)}`, callback_data: 'ip:2:' + p.id }, { text: `📶 5 IP — ${rupiah(p.price5 || p.price)}`, callback_data: 'ip:5:' + p.id }],
    [{ text: '⬅️ Daftar Config', callback_data: 'nav:shop' }]
  ];
}
function ordersHTML(uid) {
  const mine = Object.values(db.orders).filter(o => o.buyer_id === uid).sort((a, b) => b.created - a.created);
  if (!mine.length) {
    return `<b>📦 PESANAN SAYA</b>\n${SEP}\n\n<blockquote>📭 Kamu belum punya pesanan.\nYuk mulai order pertama kamu!</blockquote>`;
  }
  let t = `<b>📦 PESANAN SAYA</b>\n${SEP}\n\n`;
  mine.slice(0, 10).forEach(o => {
    t += `<b>#${o.id}</b> — ${esc(o.product_name)}\n`;
    t += `${STATUS[o.status] || o.status} • ${o.limit_ip} IP • ${rupiah(o.price)}\n`;
    t += `🕐 ${stamp(o.created)}\n\n`;
  });
  t += `${SEP}\n<i>Config yang sudah selesai bisa di-download ulang lewat tombol di bawah 👇</i>`;
  return t;
}
function ordersKB(uid) {
  const mine = Object.values(db.orders).filter(o => o.buyer_id === uid && o.file_id).sort((a, b) => b.created - a.created);
  const kb = mine.slice(0, 10).map(o => [{ text: `⬇️ Download config #${o.id}`, callback_data: 'dl:' + o.id }]);
  kb.push(BTN_HOME);
  return kb;
}
function orderCard(o) {
  return `<b>🔔 ORDER BARU #${o.id}</b>\n${SEP}\n\n` +
    `👤 Buyer    : <b>${esc(o.buyer_name)}</b> (@${esc(o.buyer_username || '-')})\n` +
    `🆔 User ID  : <code>${o.buyer_id}</code>\n` +
    `📦 Produk   : ${esc(o.product_name)}\n` +
    `⏱️ Durasi   : ${esc(o.duration_label)}\n` +
    `🌐 Server   : ${esc(o.server || '-')}\n` +
    `👤 Username : <code>${esc(o.username)}</code>\n` +
    `📶 Limit IP : <b>${o.limit_ip} IP</b>\n` +
    `💰 Nominal  : <b>${rupiah(o.price)}</b>\n` +
    `🕐 Waktu    : ${stamp(o.created)}\n` +
    `${SEP}`;
}
function orderButtons(o) {
  return [[
    { text: '✅ Kirim Config', callback_data: 'sendcfg:' + o.id },
    { text: '❌ Tolak', callback_data: 'reject:' + o.id }
  ]];
}
function qrisCaption(o) {
  return `<b>💳 PEMBAYARAN — ORDER #${o.id}</b>\n${SEP}\n\n` +
    `📦 Produk   : ${esc(o.product_name)}\n` +
    `⏱️ Durasi   : ${esc(o.duration_label)}\n` +
    `🌐 Server   : ${esc(o.server || '-')}\n` +
    `👤 Username : <code>${esc(o.username)}</code>\n` +
    `${SEP}\n` +
    `📶 <b>PAKET KAMU : ${o.limit_ip} IP</b>\n` +
    `💰 <b>TOTAL BAYAR : ${rupiah(o.price)}</b>\n` +
    `${SEP}\n\n` +
    `<blockquote><b>📌 CARA BAYAR:</b>\n1️⃣ Scan QRIS di atas (GoPay/DANA/OVO/QRIS apapun)\n2️⃣ Bayar <b>PERSIS ${rupiah(o.price)}</b> — tanpa biaya admin\n3️⃣ Screenshot bukti transfernya\n4️⃣ Ketuk tombol <b>📤 Kirim Bukti Transfer</b> lalu kirim fotonya\n\n⚠️ Nominal harus PERSIS! Kalau beda, admin tidak bisa konfirmasi.</blockquote>\n\n` +
    `👇 <i>Sudah bayar? Ketuk tombol di bawah</i>`;
}
function qrisKB(o) {
  return [
    [{ text: '📤 Kirim Bukti Transfer', callback_data: 'pay:' + o.id }],
    [{ text: '❌ Batalkan Order', callback_data: 'canceluser:' + o.id }]
  ];
}
function buyerWaiting(o) {
  return `<b>✅ PESANAN DITERIMA!</b>\n${SEP}\n\n` +
    `📋 Order    : <b>#${o.id}</b>\n` +
    `📦 Produk   : ${esc(o.product_name)} (${esc(o.duration_label)})\n` +
    `👤 Username : <code>${esc(o.username)}</code>\n` +
    `📶 Paket    : ${o.limit_ip} IP\n` +
    `💰 Nominal  : ${rupiah(o.price)}\n\n` +
    `${SEP}\n<blockquote>🕓 Mohon tunggu sekitar <b>${WAIT_MINUTES}</b>, config akan dikirim ke chat ini.\n\n⏰ Lebih dari 15 menit belum masuk? Hubungi ${ADMIN_CONTACT}\n📖 Cek status kapan aja di 📦 Pesanan Saya</blockquote>`;
}
function askUsernameHTML(p, uname) {
  return `<b>👤 ISI USERNAME</b>\n${SEP}\n\n` +
    `📦 Config : <b>${esc(p.name)}</b>\n` +
    `⏱️ Durasi : ${esc(p.duration_label)} • 🌐 ${esc(p.server || '-')}\n` +
    (uname ? `✅ Username : <code>${esc(uname)}</code>\n\n👇 <i>Konfirmasi dengan pilih paket di bawah</i>` :
      `<blockquote>Ketik username untuk config kamu.\nHuruf kecil &amp; angka, 4-16 karakter.\nContoh: <code>rudi123</code></blockquote>\n\n💡 <i>Ketik /cancel bila ingin membatalkan</i>`);
}
function askUsernameKB(p) {
  return [[{ text: '⬅️ Daftar Config', callback_data: 'nav:shop' }]];
}

// ==================== NAV (edit pesan utama) ====================
async function go(chatId, page, cbArg) {
  const u = user(chatId);
  switch (page) {
    case 'home': u.state = null; u.temp = {}; save(); return show(chatId, welcomeHTML(''), homeKB(chatId));
    case 'shop': u.state = null; u.temp = {}; save(); return show(chatId, shopHTML(), shopKB());
    case 'howto': return show(chatId, howtoHTML(), [BTN_HOME]);
    case 'support': return show(chatId, supportHTML(), [BTN_HOME, [{ text: '💬 Chat Admin Sekarang', url: 'https://t.me/' + ADMIN_CONTACT.replace('@', '') }]]);
    case 'orders': return show(chatId, ordersHTML(chatId), ordersKB(chatId));
    case 'prod': {
      const p = db.products[cbArg];
      if (!p || !p.active) return show(chatId, `⚠️ Config tidak tersedia.`, [BTN_HOME]);
      u.state = 'ask_username'; u.temp = { product_id: p.id }; save();
      return show(chatId, askUsernameHTML(p), askUsernameKB(p));
    }
  }
}

// ==================== KIRIM CONFIG KE BUYER ====================
function sendConfigToBuyer(o) {
  return bot.sendDocument(o.buyer_id, o.file_id, {
    caption: `<b>✅ CONFIG KAMU — ORDER #${o.id}</b>\n${SEP}\n` +
      `📦 ${esc(o.product_name)} (${esc(o.duration_label)})\n` +
      `👤 Username : <code>${esc(o.username)}</code>\n` +
      `📶 Limit IP : ${o.limit_ip} IP\n` +
      `🌐 Server   : ${esc(o.server || '-')}\n${SEP}\n` +
      `⚠️ <b>Jangan bagikan config ini ke orang lain!</b>\n` +
      `🆘 Ada masalah? Hubungi ${ADMIN_CONTACT}`,
    parse_mode: 'HTML'
  }).catch(e => console.error('sendconfig', e.message));
}
function finishSendConfig(o, fileId) {
  const u = user(ADMIN_ID);
  o.status = 'done'; o.file_id = fileId; o.done_at = now(); save();
  u.state = null; u.temp = {}; save();
  return sendConfigToBuyer(o).then(() =>
    bot.sendMessage(ADMIN_ID, `✅ <b>Config terkirim ke buyer!</b>\n\n📋 Order #${o.id}\n👤 ${esc(o.buyer_name)} (@${esc(o.buyer_username || '-')})\n💰 ${rupiah(o.price)} — selesai ✅`, { parse_mode: 'HTML' })
  ).catch(e => console.error('finishcfg', e.message));
}

// ==================== USER: COMMANDS ====================
bot.onText(/^\/start/, (msg) => {
  const u = user(msg.from.id);
  u.name = msg.from.first_name || ''; u.username = msg.from.username || ''; u.state = null; u.temp = {}; save();
  show(msg.from.id, welcomeHTML(msg.from.first_name), homeKB(msg.from.id));
});
bot.onText(/^\/cancel/, (msg) => {
  const u = user(msg.from.id); u.state = null; u.temp = {}; save();
  show(msg.from.id, welcomeHTML(msg.from.first_name), homeKB(msg.from.id));
});

// ==================== INPUT TEKS ====================
bot.on('message', async (msg) => {
  if (!msg.from || !msg.text) return;
  const uid = msg.from.id;
  if (/^\/(start|cancel|admin|addproduk|delproduk|setqris|orderlist|stats|toko|broadcast)/.test(msg.text)) return;
  const u = user(uid); const t = msg.text.trim();

  try {
    // ---------- ADMIN ----------
    if (isAdmin(uid)) {
      if (u.state === 'adm_add_name') {
        u.temp = { name: t }; u.state = 'adm_add_dur'; save();
        return show(uid, `<b>➕ TAMBAH PRODUK (2/6)</b>\n${SEP}\n\n✅ Nama: <b>${esc(t)}</b>\n\n2️⃣ Ketik <b>durasi</b> (contoh: 30 Hari):`, [[{ text: '❌ Batal', callback_data: 'nav:home' }]]);
      }
      if (u.state === 'adm_add_dur') {
        u.temp.duration_label = t; u.state = 'adm_add_server'; save();
        return show(uid, `<b>➕ TAMBAH PRODUK (3/6)</b>\n${SEP}\n\n✅ Durasi: <b>${esc(t)}</b>\n\n3️⃣ Ketik <b>nama server</b> (contoh: SG1 / ID1):`, [[{ text: '❌ Batal', callback_data: 'nav:home' }]]);
      }
      if (u.state === 'adm_add_server') {
        u.temp.server = t; u.state = 'adm_add_desc'; save();
        return show(uid, `<b>➕ TAMBAH PRODUK (4/6)</b>\n${SEP}\n\n✅ Server: <b>${esc(t)}</b>\n\n4️⃣ Ketik <b>keterangan</b> singkat (contoh: Unlimited kuota).\nKetik <b>-</b> kalau kosong:`, [[{ text: '❌ Batal', callback_data: 'nav:home' }]]);
      }
      if (u.state === 'adm_add_desc') {
        u.temp.desc = (t === '-') ? '' : t; u.state = 'adm_add_p2'; save();
        return show(uid, `<b>➕ TAMBAH PRODUK (5/6)</b>\n${SEP}\n\n5️⃣ Ketik <b>harga paket 2 IP</b> (angka saja, contoh: 12000):`, [[{ text: '❌ Batal', callback_data: 'nav:home' }]]);
      }
      if (u.state === 'adm_add_p2') {
        const p2 = parseInt(t.replace(/\D/g, ''));
        if (!p2) return show(uid, `❌ Harus angka. Contoh: 12000\nCoba lagi:`, [[{ text: '❌ Batal', callback_data: 'nav:home' }]]);
        u.temp.price = p2; u.state = 'adm_add_p5'; save();
        return show(uid, `<b>➕ TAMBAH PRODUK (6/6)</b>\n${SEP}\n\n✅ 2 IP: <b>${rupiah(p2)}</b>\n\n6️⃣ Ketik <b>harga paket 5 IP</b> (contoh: 15000):`, [[{ text: '❌ Batal', callback_data: 'nav:home' }]]);
      }
      if (u.state === 'adm_add_p5') {
        const p5 = parseInt(t.replace(/\D/g, ''));
        if (!p5) return show(uid, `❌ Harus angka. Contoh: 15000\nCoba lagi:`, [[{ text: '❌ Batal', callback_data: 'nav:home' }]]);
        const pid = 'P' + Date.now();
        db.products[pid] = { id: pid, name: u.temp.name, duration_label: u.temp.duration_label, server: u.temp.server, desc: u.temp.desc || '', price: u.temp.price, price5: p5, active: true, created: now() };
        const p = db.products[pid];
        u.state = null; u.temp = {}; save();
        return show(uid, `<b>🎉 PRODUK BERHASIL DITAMBAHKAN!</b>\n${SEP}\n\n📦 <b>${esc(p.name)}</b>\n⏱️ ${esc(p.duration_label)} • 🌐 ${esc(p.server || '-')}\n📝 ${esc(p.desc || '-')}\n💰 2 IP: <b>${rupiah(p.price)}</b> | 5 IP: <b>${rupiah(p.price5)}</b>\n\n✅ Langsung tampil di menu pembeli!`, [
          [{ text: '📦 Lihat Daftar Config', callback_data: 'nav:shop' }],
          [{ text: '⬅️ Menu Utama', callback_data: 'nav:home' }]
        ]);
      }
      if (u.state === 'adm_edit_value') {
        const field = u.temp.field; const p = db.products[u.temp.pid];
        if (!p) { u.state = null; save(); return show(uid, `❌ Produk tidak ditemukan.`, [BTN_HOME]); }
        if (field === 'price' || field === 'price5') {
          const v = parseInt(t.replace(/\D/g, ''));
          if (!v) return show(uid, `❌ Harus angka. Coba lagi:`, [[{ text: '❌ Batal', callback_data: 'adm:prods' }]]);
          p[field] = v;
        } else if (field === 'active') {
          p.active = /^(ya|yes|y|1|on|aktif)$/i.test(t);
        } else {
          p[field] = t;
        }
        u.state = null; u.temp = {}; save();
        return show(uid, `<b>✅ PRODUK DIPERBARUI</b>\n${SEP}\n\n📦 <b>${esc(p.name)}</b>\n⏱️ ${esc(p.duration_label)} • 🌐 ${esc(p.server || '-')}\n📝 ${esc(p.desc || '-')}\n💰 2 IP: <b>${rupiah(p.price)}</b> | 5 IP: <b>${rupiah(p.price5 || p.price)}</b>\n📌 ${p.active ? 'Aktif 🟢' : 'Nonaktif 🔴'}`, [
          [{ text: '⚙️ Edit Lagi', callback_data: 'prod:' + p.id }],
          [{ text: '⬅️ Kelola Produk', callback_data: 'adm:prods' }]
        ]);
      }
      if (u.state === 'adm_bc_text') {
        u.temp = Object.assign({}, u.temp, { bc: t }); u.state = 'adm_bc_confirm'; save();
        return show(uid, `<b>📣 PREVIEW BROADCAST</b>\n${SEP}\n\n<blockquote>${esc(t)}</blockquote>\n\nKirim ke <b>${Object.keys(db.users).length}</b> user?`, [
          [{ text: '✅ Kirim', callback_data: 'adm:bc_yes' }, { text: '❌ Batal', callback_data: 'adm:bc_no' }]
        ]);
      }
    }

    // ---------- USER: username ----------
    if (u.state === 'ask_username') {
      const uname = t.toLowerCase();
      if (!/^[a-z0-9]{4,16}$/.test(uname)) {
        return show(uid, `<b>❌ USERNAME TIDAK VALID</b>\n${SEP}\n\nGunakan 4-16 karakter, huruf kecil &amp; angka saja (tanpa spasi/simbol).\n\nContoh: <code>rudi123</code>\n\nCoba ketik lagi ya 👇`, [[{ text: '⬅️ Daftar Config', callback_data: 'nav:shop' }]]);
      }
      if (pendingOrderOf(uid)) {
        return show(uid, `<b>⏳ MASIH ADA PESANAN AKTIF</b>\n${SEP}\n\n<blockquote>Kamu masih punya pesanan yang belum selesai.\nSelesaikan dulu sebelum order baru.</blockquote>`, [[{ text: '📦 Lihat Pesanan Saya', callback_data: 'nav:orders' }]]);
      }
      const p = db.products[u.temp.product_id];
      if (!p) { u.state = null; save(); return show(uid, `❌ Produk tidak tersedia. Silakan mulai lagi.`, [[{ text: '🛒 Daftar Config', callback_data: 'nav:shop' }]]); }
      u.state = 'confirm_ip'; u.temp.username = uname; save();
      return show(uid, askUsernameHTML(p, uname), prodKB(p));
    }

    // ---------- USER: minta bukti tapi kirim teks ----------
    if (u.state === 'ask_proof') {
      return keepMsg(uid, `📸 <b>Kirim FOTO bukti transfer ya!</b>\n\nScreenshot bukti transfer kamu, lalu kirim ke sini sebagai <b>foto</b> (bukan teks).`, undefined);
    }
  } catch (e) {
    console.error('msg err', e);
    bot.sendMessage(uid, '⚠️ Terjadi kendala teknis. Coba lagi sebentar.').catch(() => {});
  }
});

// ==================== FOTO ====================
bot.on('photo', async (msg) => {
  const uid = msg.from.id; const u = user(uid);
  const fileId = msg.photo[msg.photo.length - 1].file_id;
  try {
    if (isAdmin(uid) && u.state === 'adm_set_qris') {
      db.qris_file_id = fileId; u.state = null; save();
      return bot.sendMessage(uid, `✅ <b>QRIS berhasil disimpan!</b>\n\nGambar ini otomatis dikirim ke pembeli saat order.`, { parse_mode: 'HTML' });
    }
    if (u.state === 'ask_proof') {
      const o = db.orders[u.temp.order_id];
      if (!o) { u.state = null; save(); return keepMsg(uid, `❌ Order tidak ditemukan. Mulai lagi dari 🛒 Beli Config.`); }
      o.status = 'waiting'; o.proof_file_id = fileId; o.proof_at = now(); save();
      u.state = null; u.temp = {}; save();
      bot.sendMessage(ADMIN_ID, orderCard(o) + `\nStatus: ${STATUS[o.status]}`, { parse_mode: 'HTML', reply_markup: { inline_keyboard: orderButtons(o) } }).catch(() => {});
      bot.sendPhoto(ADMIN_ID, fileId, { caption: `🧾 <b>Bukti transfer — Order #${o.id}</b>\n👤 ${esc(o.buyer_name)} (@${esc(o.buyer_username || '-')})\n💰 ${rupiah(o.price)}\n\nTekan <b>✅ Kirim Config</b> di pesan order atas kalau pembayaran valid.`, parse_mode: 'HTML' }).catch(() => {});
      // kirim pesan "menunggu" sebagai pesan baru (penting, jangan diedit)
      await keepMsg(uid, buyerWaiting(o));
      return show(uid, `<b>📦 PESANAN SAYA</b>\n${SEP}\n\n<b>#${o.id}</b> — ${esc(o.product_name)}\n${STATUS[o.status]}\n🕐 ${stamp(o.created)}\n\n<i>Kamu akan menerima config di chat ini sekitar ${WAIT_MINUTES}.</i>`, ordersKB(uid));
    }
  } catch (e) { console.error('photo err', e); }
});

// ==================== DOKUMEN (admin) ====================
bot.on('document', async (msg) => {
  const uid = msg.from.id; const u = user(uid);
  if (uid !== ADMIN_ID) return;
  const fileId = msg.document.file_id;
  const fileName = msg.document.file_name || 'config';

  if (u.state === 'adm_send_file' && u.temp.order_id) {
    const o = db.orders[u.temp.order_id];
    if (!o) { u.state = null; save(); return bot.sendMessage(uid, '❌ Order tidak ditemukan.'); }
    return finishSendConfig(o, fileId);
  }

  const waiting = Object.values(db.orders).filter(o => o.status === 'waiting');
  if (!waiting.length) {
    return bot.sendMessage(uid, `📄 File <b>${esc(fileName)}</b> diterima.\n\nTapi belum ada order yang menunggu config. Tap <b>✅ Kirim Config</b> di pesan order dulu, baru kirim filenya.`, { parse_mode: 'HTML' });
  }
  u.temp = Object.assign({}, u.temp, { last_file: fileId }); save();
  const kb = waiting.map(o => [{ text: `📤 Kirim ke #${o.id} — ${o.buyer_name} (${o.limit_ip} IP)`, callback_data: 'usefile:' + o.id }]);
  return bot.sendMessage(uid, `📄 File <b>${esc(fileName)}</b> diterima!\n\nKirim file ini ke order mana? 👇`, { parse_mode: 'HTML', reply_markup: { inline_keyboard: kb } });
});

// ==================== CALLBACK QUERY (satu handler) ====================
bot.on('callback_query', async (q) => {
  const [act, a2, a3] = (q.data || '').split(':');
  const uid = q.from.id;
  const u = user(uid);
  const chatId = q.message ? q.message.chat.id : uid;
  const answer = (o) => bot.answerCallbackQuery(q.id, o).catch(() => {});

  try {
    // ---------- NAV ----------
    if (act === 'nav') { await go(chatId, a2); return answer(); }

    // ---------- USER ----------
    if (act === 'prod') {
      const p = db.products[a2];
      if (!p || !p.active) { await show(chatId, `⚠️ Config tidak tersedia.`, [BTN_HOME]); return answer({ text: 'Tidak tersedia' }); }
      u.state = 'ask_username'; u.temp = { product_id: p.id }; save();
      await show(chatId, askUsernameHTML(p), askUsernameKB(p));
      return answer();
    }

    if (act === 'ip') {
      // a2 = jumlah IP, a3 = product id (baru) — fallback ke state lama
      let p = a3 ? db.products[a3] : db.products[u.temp.product_id];
      if (u.state !== 'confirm_ip' || !p) {
        if (!p) return answer({ text: '⚠️ Sesi habis, ulangi dari 🛒 Beli Config' });
      }
      if (!db.qris_file_id) {
        u.state = null; save();
        await show(chatId, `<b>⚠️ PEMBAYARAN BELUM SIAP</b>\n${SEP}\n\n<blockquote>Admin belum memasang QRIS.\nSilakan hubungi ${ADMIN_CONTACT}.</blockquote>`, [[{ text: '🆘 Hubungi Admin', callback_data: 'nav:support' }]]);
        return answer();
      }
      if (!u.temp.username) return answer({ text: '⚠️ Isi username dulu' });
      const price = (a2 === '5') ? (p.price5 || p.price) : p.price;
      const oid = newOrderId();
      const o = {
        id: oid, buyer_id: uid, buyer_name: q.from.first_name || '', buyer_username: q.from.username || '',
        product_id: p.id, product_name: p.name, duration_label: p.duration_label, server: p.server,
        username: u.temp.username, limit_ip: a2, price, base_price: price,
        status: 'pending_pay', created: now()
      };
      db.orders[oid] = o; save();
      u.state = 'ask_proof'; u.temp = { order_id: oid }; save();
      await bot.sendPhoto(chatId, db.qris_file_id, { caption: qrisCaption(o), parse_mode: 'HTML', reply_markup: { inline_keyboard: qrisKB(o) } });
      await show(chatId, `<b>⏳ MENUNGGU PEMBAYARAN</b>\n${SEP}\n\n<blockquote>QRIS sudah dikirim di atas 👆\n\nBayar <b>PERSIS ${rupiah(price)}</b> lalu kirim bukti transfernya.\n\nKalau gambar QRIS tidak muncul, ketuk /start lalu order ulang, atau hubungi ${ADMIN_CONTACT}.</blockquote>`, [
        [{ text: '📤 Kirim Bukti Transfer', callback_data: 'pay:' + oid }],
        [{ text: '❌ Batalkan Order', callback_data: 'canceluser:' + oid }]
      ]);
      return answer();
    }

    if (act === 'pay') {
      const o = db.orders[a2];
      if (!o || o.buyer_id !== uid) return answer({ text: 'Order tidak ditemukan' });
      u.state = 'ask_proof'; u.temp = { order_id: o.id }; save();
      await keepMsg(chatId, `📤 <b>KIRIM BUKTI TRANSFER</b>\n${SEP}\n\n📋 Order    : <b>#${o.id}</b>\n💰 Nominal  : <b>${rupiah(o.price)}</b>\n\n<blockquote>Screenshot bukti transfer kamu, lalu kirim sebagai <b>FOTO</b> ke chat ini 📸</blockquote>`);
      return answer();
    }

    if (act === 'canceluser') {
      const o = db.orders[a2];
      if (o && o.buyer_id === uid && o.status === 'pending_pay') {
        o.status = 'cancelled'; save();
        u.state = null; u.temp = {}; save();
        await show(chatId, `<b>🚫 ORDER DIBATALKAN</b>\n${SEP}\n\nOrder #${a2} dibatalkan.\n\n<blockquote>Tidak ada biaya apa pun yang dikenakan.\nKalau mau order lagi, ketuk 🛒 Beli Config.</blockquote>`, [[{ text: '🛒 Beli Config', callback_data: 'nav:shop' }], BTN_HOME]);
        bot.sendMessage(ADMIN_ID, `🚫 Order #${a2} dibatalkan oleh buyer ${esc(o.buyer_name)}.`, { parse_mode: 'HTML' }).catch(() => {});
      }
      return answer({ text: 'Order dibatalkan' });
    }

    if (act === 'dl') {
      const o = db.orders[a2];
      if (!o || o.buyer_id !== uid || !o.file_id) return answer({ text: 'Config tidak tersedia' });
      await sendConfigToBuyer(o);
      return answer({ text: 'Config dikirim ulang ✅' });
    }

    // ---------- ADMIN ----------
    if (!isAdmin(uid)) return answer();

    if (act === 'reject') {
      const o = db.orders[a2];
      if (!o) return answer();
      o.status = 'rejected'; save();
      bot.editMessageReplyMarkup({ inline_keyboard: [[{ text: '❌ Ditolak', callback_data: 'x' }]] }, { chat_id: chatId, message_id: q.message.message_id }).catch(() => {});
      keepMsg(o.buyer_id, `❌ <b>ORDER DITOLAK</b>\n${SEP}\n\nOrder #${o.id} ditolak admin.\n\n<blockquote>Kemungkinan pembayaran tidak valid atau stok kosong.\nHubungi ${ADMIN_CONTACT} untuk klarifikasi/refund.</blockquote>`);
      return answer({ text: 'Order ditolak' });
    }

    if (act === 'sendcfg') {
      const o = db.orders[a2];
      if (!o) return answer();
      u.state = 'adm_send_file'; u.temp = { order_id: o.id }; save();
      bot.sendMessage(ADMIN_ID, `📤 <b>Kirim file config untuk Order #${o.id}</b>\n${SEP}\n\n👤 Buyer    : ${esc(o.buyer_name)} (@${esc(o.buyer_username || '-')})\n👤 Username : <code>${esc(o.username)}</code>\n📶 Limit IP : ${o.limit_ip} IP\n📦 Produk   : ${esc(o.product_name)} (${esc(o.duration_label)})\n🌐 Server   : ${esc(o.server || '-')}\n${SEP}\n\n<blockquote>Kirim file config ke chat ini sebagai <b>dokumen</b> — otomatis diteruskan ke buyer ✅</blockquote>`, { parse_mode: 'HTML' });
      return answer();
    }

    if (act === 'usefile') {
      const o = db.orders[a2];
      if (!o || o.status !== 'waiting') return answer({ text: 'Order sudah tidak menunggu' });
      const fileId = u.temp && u.temp.last_file;
      if (!fileId) return answer({ text: 'File tidak ditemukan, kirim ulang file-nya' });
      await finishSendConfig(o, fileId);
      return answer({ text: 'Config terkirim ✅' });
    }

    // ---------- ADMIN PANEL ----------
    if (act === 'adm') {
      const sub = a2;
      if (sub === 'orders') {
        const recent = Object.values(db.orders).sort((a, b) => b.created - a.created).slice(0, 10);
        if (!recent.length) { await show(ADMIN_ID, `<b>📋 ORDER TERBARU</b>\n${SEP}\n\n<blockquote>📭 Belum ada order.</blockquote>`, adminNavKB()); return answer({ text: 'Belum ada order' }); }
        let t = `<b>📋 ORDER TERBARU</b>\n${SEP}\n\n`;
        recent.forEach(o => { t += `<b>#${o.id}</b> — ${esc(o.product_name)} — ${o.limit_ip} IP\n${STATUS[o.status] || o.status} • ${rupiah(o.price)} • ${esc(o.buyer_name)}\n\n`; });
        const kb = recent.filter(o => o.status === 'waiting').map(o => [{ text: `✅ Kirim config #${o.id}`, callback_data: 'sendcfg:' + o.id }]);
        kb.push(adminHomeRow());
        await show(ADMIN_ID, t, kb);
        return answer();
      }
      if (sub === 'prods') {
        const prods = Object.values(db.products);
        if (!prods.length) { await show(ADMIN_ID, `<b>📦 KELOLA PRODUK</b>\n${SEP}\n\n<blockquote>📭 Belum ada produk.</blockquote>`, [[{ text: '➕ Tambah Produk', callback_data: 'adm:addprod' }], adminHomeRow()]); return answer(); }
        let t = `<b>📦 KELOLA PRODUK</b>\n${SEP}\n\n`;
        prods.forEach(p => { t += `${p.active ? '🟢' : '🔴'} <b>${esc(p.name)}</b> — ${esc(p.duration_label)}\n   💰 ${rupiah(p.price)} / ${rupiah(p.price5 || p.price)}\n\n`; });
        t += `<i>Ketuk produk untuk edit/hapus 👇</i>`;
        const kb = prods.map(p => [{ text: `${p.active ? '🟢' : '🔴'} ${p.name}`, callback_data: 'prodadm:' + p.id }]);
        kb.push([{ text: '➕ Tambah Produk', callback_data: 'adm:addprod' }]);
        kb.push(adminHomeRow());
        await show(ADMIN_ID, t, kb);
        return answer();
      }
      if (sub === 'addprod') {
        u.state = 'adm_add_name'; u.temp = {}; save();
        await show(ADMIN_ID, `<b>➕ TAMBAH PRODUK (1/6)</b>\n${SEP}\n\n1️⃣ Ketik <b>nama produk</b>\nContoh: <code>VLess Premium</code>`, [[{ text: '❌ Batal', callback_data: 'adm:prods' }]]);
        return answer();
      }
      if (sub === 'stats') {
        const orders = Object.values(db.orders);
        const done = orders.filter(o => o.status === 'done');
        const today = done.filter(o => new Date(o.created).toDateString() === new Date().toDateString());
        const wait = orders.filter(o => o.status === 'waiting').length;
        await show(ADMIN_ID,
          `<b>💰 STATISTIK TOKO</b>\n${SEP}\n\n` +
          `👥 Total user     : <b>${Object.keys(db.users).length}</b>\n` +
          `📦 Total order    : <b>${orders.length}</b>\n` +
          `✅ Selesai        : <b>${done.length}</b>\n` +
          `🕓 Perlu diproses : <b>${wait}</b>\n` +
          `📦 Produk aktif   : <b>${activeProducts().length}</b>\n${SEP}\n` +
          `💰 Hari ini : <b>${rupiah(rev(today))}</b>\n` +
          `💰 Total    : <b>${rupiah(rev(done))}</b>`, adminNavKB());
        return answer();
      }
      if (sub === 'qris') {
        u.state = 'adm_set_qris'; save();
        await show(ADMIN_ID, `<b>🖼️ SET QRIS</b>\n${SEP}\n\n<blockquote>Kirim gambar QRIS kamu sebagai <b>FOTO</b> ke chat ini.</blockquote>`, [[{ text: '❌ Batal', callback_data: 'adm:panel' }]]);
        return answer();
      }
      if (sub === 'bc') {
        u.state = 'adm_bc_text'; save();
        await show(ADMIN_ID, `<b>📣 BROADCAST</b>\n${SEP}\n\nKetik <b>pesan</b> yang mau dikirim ke semua user:`, [[{ text: '❌ Batal', callback_data: 'adm:panel' }]]);
        return answer();
      }
      if (sub === 'bc_yes') {
        const tmp = u.temp || {}; u.state = null; u.temp = {}; save();
        let ok = 0;
        const uids = Object.keys(db.users);
        for (const id of uids) {
          try { await bot.sendMessage(id, `📣 <b>PENGUMUMAN — ${STORE_NAME}</b>\n${SEP}\n\n${esc(tmp.bc)}`, { parse_mode: 'HTML' }); ok++; } catch (e) {}
        }
        await show(ADMIN_ID, `<b>✅ BROADCAST TERKIRIM</b>\n\nTerkirim ke <b>${ok}/${uids.length}</b> user.`, adminNavKB());
        return answer({ text: `Terkirim ke ${ok} user` });
      }
      if (sub === 'bc_no') {
        u.state = null; u.temp = {}; save();
        await show(ADMIN_ID, `<b>❌ Broadcast dibatalkan.</b>`, adminNavKB());
        return answer();
      }
      if (sub === 'toggle') {
        db.settings.order_open = !db.settings.order_open; save();
        await show(ADMIN_ID, `<b>🔄 STATUS TOKO</b>\n\n${db.settings.order_open ? '🟢 <b>Toko DIBUKA</b> — pembeli bisa order.' : '🔴 <b>Toko DITUTUP</b> — pembeli tidak bisa order sementara.'}`, adminNavKB());
        return answer({ text: db.settings.order_open ? 'Toko dibuka' : 'Toko ditutup' });
      }
      if (sub === 'panel') {
        await show(ADMIN_ID, adminPanelHTML(), adminNavKB());
        return answer();
      }
      return answer();
    }

    // kelola 1 produk (admin)
    if (act === 'prodadm') {
      const p = db.products[a2];
      if (!p) return answer({ text: 'Produk tidak ada' });
      await show(ADMIN_ID,
        `<b>⚙️ EDIT PRODUK</b>\n${SEP}\n\n` +
        `📦 <b>${esc(p.name)}</b>\n⏱️ ${esc(p.duration_label)} • 🌐 ${esc(p.server || '-')}\n📝 ${esc(p.desc || '-')}\n💰 2 IP: <b>${rupiah(p.price)}</b> | 5 IP: <b>${rupiah(p.price5 || p.price)}</b>\n📌 ${p.active ? 'Aktif 🟢' : 'Nonaktif 🔴'}`, [
        [{ text: '✏️ Nama', callback_data: `pf:${p.id}:name` }, { text: '✏️ Durasi', callback_data: `pf:${p.id}:duration_label` }],
        [{ text: '✏️ Server', callback_data: `pf:${p.id}:server` }, { text: '✏️ Keterangan', callback_data: `pf:${p.id}:desc` }],
        [{ text: '💰 Harga 2 IP', callback_data: `pf:${p.id}:price` }, { text: '💰 Harga 5 IP', callback_data: `pf:${p.id}:price5` }],
        [{ text: p.active ? '🔴 Nonaktifkan' : '🟢 Aktifkan', callback_data: `pf:${p.id}:active` }],
        [{ text: '🗑️ HAPUS PRODUK', callback_data: `delprod:${p.id}` }],
        adminHomeRow()
      ]);
      return answer();
    }

    if (act === 'pf') {
      const [pid, field] = a2.split('|');
      const p = db.products[pid];
      if (!p) return answer({ text: 'Produk tidak ada' });
      if (field === 'active') {
        p.active = !p.active; save();
        await go(uid, 'shop'); // refresh tidak perlu; tampilkan konfirmasi
        return answer({ text: p.active ? 'Produk diaktifkan 🟢' : 'Produk dinonaktifkan 🔴' });
      }
      u.state = 'adm_edit_value'; u.temp = { pid, field }; save();
      const labels = { name: 'nama produk', duration_label: 'durasi', server: 'nama server', desc: 'keterangan', price: 'harga 2 IP (angka)', price5: 'harga 5 IP (angka)' };
      await show(ADMIN_ID, `<b>✏️ EDIT ${esc(labels[field]).toUpperCase()}</b>\n${SEP}\n\nProduk: <b>${esc(p.name)}</b>\n\nKetik nilai baru:`, [[{ text: '❌ Batal', callback_data: `prodadm:${pid}` }]]);
      return answer();
    }

    if (act === 'delprod') {
      const p = db.products[a2];
      if (!p) return answer({ text: 'Produk tidak ada' });
      delete db.products[a2]; save();
      await show(ADMIN_ID, `<b>🗑️ PRODUK DIHAPUS</b>\n\n${esc(p.name)} (${esc(p.duration_label)}) berhasil dihapus.`, [[{ text: '⬅️ Kelola Produk', callback_data: 'adm:prods' }]]);
      return answer({ text: 'Produk dihapus' });
    }

    return answer();
  } catch (e) {
    console.error('cb err', e);
    answer({ text: '⚠️ Terjadi kendala, coba lagi' });
  }
});

function adminHomeRow() { return [{ text: '⬅️ Panel Admin', callback_data: 'adm:panel' }]; }
function adminNavKB() {
  return [
    [{ text: '📋 Orders', callback_data: 'adm:orders' }, { text: '📦 Produk', callback_data: 'adm:prods' }],
    [{ text: '💰 Statistik', callback_data: 'adm:stats' }, { text: '🖼️ QRIS', callback_data: 'adm:qris' }],
    [{ text: '📣 Broadcast', callback_data: 'adm:bc' }, { text: '🔄 Buka/Tutup', callback_data: 'adm:toggle' }]
  ];
}
function adminPanelHTML() {
  return `<b>🛠️ PANEL ADMIN — ${STORE_NAME}</b>\n${SEP}\n\n` +
    `Status toko: ${db.settings.order_open ? '🟢 <b>BUKA</b>' : '🔴 <b>TUTUP</b>'}\n` +
    `📦 Produk aktif: <b>${activeProducts().length}</b>\n` +
    `🕓 Order menunggu: <b>${Object.values(db.orders).filter(o => o.status === 'waiting').length}</b>\n\n` +
    `<blockquote>Pilih menu di bawah untuk mengelola toko 👇</blockquote>`;
}

// ==================== ADMIN COMMANDS ====================
bot.onText(/^\/admin/, (msg) => {
  if (!isAdmin(msg.from.id)) return;
  show(ADMIN_ID, adminPanelHTML(), adminNavKB());
});
bot.onText(/^\/addproduk/, (msg) => {
  if (!isAdmin(msg.from.id)) return;
  const u = user(ADMIN_ID); u.state = 'adm_add_name'; u.temp = {}; save();
  show(ADMIN_ID, `<b>➕ TAMBAH PRODUK (1/6)</b>\n${SEP}\n\n1️⃣ Ketik <b>nama produk</b>\nContoh: <code>VLess Premium</code>`, [[{ text: '❌ Batal', callback_data: 'adm:prods' }]]);
});
bot.onText(/^\/setqris/, (msg) => {
  if (!isAdmin(msg.from.id)) return;
  const u = user(ADMIN_ID); u.state = 'adm_set_qris'; save();
  show(ADMIN_ID, `<b>🖼️ SET QRIS</b>\n${SEP}\n\n<blockquote>Kirim gambar QRIS kamu sebagai <b>FOTO</b> ke chat ini.</blockquote>`, [[{ text: '❌ Batal', callback_data: 'adm:panel' }]]);
});
bot.onText(/^\/orderlist/, (msg) => {
  if (!isAdmin(msg.from.id)) return;
  const recent = Object.values(db.orders).sort((a, b) => b.created - a.created).slice(0, 15);
  if (!recent.length) return show(ADMIN_ID, `<b>📋 ORDER TERBARU</b>\n${SEP}\n\n<blockquote>📭 Belum ada order.</blockquote>`, adminNavKB());
  let t = `<b>📋 ORDER TERBARU</b>\n${SEP}\n\n`;
  recent.forEach(o => { t += `<b>#${o.id}</b> — ${esc(o.product_name)} — ${o.limit_ip} IP\n${STATUS[o.status] || o.status} • ${rupiah(o.price)} • ${esc(o.buyer_name)}\n\n`; });
  const kb = recent.filter(o => o.status === 'waiting').map(o => [{ text: `✅ Kirim config #${o.id}`, callback_data: 'sendcfg:' + o.id }]);
  kb.push(adminHomeRow());
  show(ADMIN_ID, t, kb);
});
bot.onText(/^\/stats/, (msg) => {
  if (!isAdmin(msg.from.id)) return;
  const orders = Object.values(db.orders);
  const done = orders.filter(o => o.status === 'done');
  const today = done.filter(o => new Date(o.created).toDateString() === new Date().toDateString());
  const wait = orders.filter(o => o.status === 'waiting').length;
  show(ADMIN_ID,
    `<b>💰 STATISTIK TOKO</b>\n${SEP}\n\n` +
    `👥 Total user     : <b>${Object.keys(db.users).length}</b>\n` +
    `📦 Total order    : <b>${orders.length}</b>\n` +
    `✅ Selesai        : <b>${done.length}</b>\n` +
    `🕓 Perlu diproses : <b>${wait}</b>\n` +
    `📦 Produk aktif   : <b>${activeProducts().length}</b>\n${SEP}\n` +
    `💰 Hari ini : <b>${rupiah(rev(today))}</b>\n` +
    `💰 Total    : <b>${rupiah(rev(done))}</b>`, adminNavKB());
});
bot.onText(/^\/toko/, (msg) => {
  if (!isAdmin(msg.from.id)) return;
  db.settings.order_open = !db.settings.order_open; save();
  show(ADMIN_ID, db.settings.order_open ? `🟢 <b>Toko DIBUKA</b>` : `🔴 <b>Toko DITUTUP</b>`, adminNavKB());
});
bot.onText(/^\/broadcast/, (msg) => {
  if (!isAdmin(msg.from.id)) return;
  const u = user(ADMIN_ID); u.state = 'adm_bc_text'; save();
  show(ADMIN_ID, `<b>📣 BROADCAST</b>\n${SEP}\n\nKetik <b>pesan</b> yang mau dikirim ke semua user:`, [[{ text: '❌ Batal', callback_data: 'adm:panel' }]]);
});

// ==================== PENGINGAT ORDER NGANGGUR ====================
setInterval(() => {
  const nowTs = now();
  Object.values(db.orders).forEach(o => {
    if (o.status === 'waiting' && !o.reminded && (nowTs - (o.proof_at || o.created)) > REMINDER_MS) {
      o.reminded = true; save();
      bot.sendMessage(ADMIN_ID, `⏰ <b>PENGINGAT!</b>\n\nOrder <b>#${o.id}</b> (${esc(o.product_name)} • ${o.limit_ip} IP) sudah menunggu lebih dari 15 menit.\n\n👤 Buyer: ${esc(o.buyer_name)} (@${esc(o.buyer_username || '-')})`, {
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: [[{ text: '✅ Kirim Config Sekarang', callback_data: 'sendcfg:' + o.id }]] }
      }).catch(() => {});
    }
  });
}, 2 * 60 * 1000);

// ==================== BAWAH ====================
bot.on('polling_error', (e) => console.error('polling', e.message));
process.on('uncaughtException', (e) => console.error('uncaught', e));
process.on('unhandledRejection', (e) => console.error('unhandled', e));
})();
