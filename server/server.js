const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const cron = require('node-cron');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

//  WHATSAPP CLIENT KURULUMU (GÖRÜNÜR TARAYICI MODU)
const whatsapp = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: { 
        headless: false, // 👈 BURAYI FALSE YAPTIK: Gerçek bir Chrome penceresi açılacak!
        args: ['--no-sandbox', '--disable-setuid-sandbox'] 
    }
});

// Terminalde QR Kod basma (Telefonla burayı taratacağız)
whatsapp.on('qr', (qr) => {
    console.log('\n--- WHATSAPP WEB BAĞLANTISI İÇİN QR KODU TARATIN --- \n');
    qrcode.generate(qr, { small: true });
});

whatsapp.on('ready', () => {
    console.log('\n🚀 WhatsApp Başarıyla Bağlandı ve Gönderime Hazır!\n');
});

whatsapp.initialize();

// 2. VERİTABANI BAĞLANTI VE TABLO KURULUMU
const db = new sqlite3.Database('./veritabani.db', (err) => {
    if (err) console.error(err.message);
    else {
        db.run(`CREATE TABLE IF NOT EXISTS appointments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            customer_name TEXT NOT NULL,
            phone TEXT,
            date TEXT NOT NULL,
            time TEXT NOT NULL,
            note TEXT
        )`);
    }
});

// 3. API YOLLARI (GET, POST, PUT, DELETE)

// Tüm Randevuları Listele
app.get('/api/appointments', (req, res) => {
    db.all(`SELECT * FROM appointments ORDER BY date ASC, time ASC`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// Yeni Randevu Oluştur (Mükerrer İsim, Saat ve Geçmiş Zaman Korumalı)
app.post('/api/appointments', (req, res) => {
    const { customer_name, phone, date, time, note } = req.body;
    if (!customer_name || !date || !time) {
        return res.status(400).json({ error: 'İsim, Tarih ve Saat alanları zorunludur!' });
    }

    const now = new Date();
    const inputDateTime = new Date(`${date}T${time}`);
    if (inputDateTime < now) {
        return res.status(400).json({ error: 'HATA: Geçmiş bir tarih veya saate randevu oluşturamazsınız!' });
    }

    db.get(`SELECT * FROM appointments WHERE customer_name = ?`, [customer_name], (err, rowByName) => {
        if (err) return res.status(500).json({ error: err.message });
        if (rowByName) return res.status(400).json({ error: 'Bu isimle zaten mevcut bir randevu bulunuyor!' });

        db.get(`SELECT * FROM appointments WHERE date = ? AND time = ?`, [date, time], (err, rowByTime) => {
            if (err) return res.status(500).json({ error: err.message });
            if (rowByTime) {
                return res.status(400).json({ error: `DİKKAT: O saat için zaten ${rowByTime.customer_name} adına randevu verilmiş!` });
            }

            db.run(`INSERT INTO appointments (customer_name, phone, date, time, note) VALUES (?, ?, ?, ?, ?)`, 
            [customer_name, phone, date, time, note || ''], function(err) {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ id: this.lastID });
            });
        });
    });
});

// Randevu Güncelle (Takvimden sürükle-bırak yapıldığında çalışır)
app.put('/api/appointments/:id', (req, res) => {
    const { id } = req.params;
    const { customer_name, phone, date, time, note } = req.body;

    db.get(`SELECT * FROM appointments WHERE id = ?`, [id], (err, currentApp) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!currentApp) return res.status(404).json({ error: 'Randevu bulunamadı' });

        const finalName = customer_name !== undefined ? customer_name : currentApp.customer_name;
        const finalPhone = phone !== undefined ? phone : currentApp.phone;
        const finalDate = date !== undefined ? date : currentApp.date;
        const finalTime = time !== undefined ? time : currentApp.time;
        const finalNote = note !== undefined ? note : currentApp.note;

        const now = new Date();
        const inputDateTime = new Date(`${finalDate}T${finalTime}`);
        if (inputDateTime < now) {
            return res.status(400).json({ error: 'HATA: Randevuyu geçmiş bir zaman dilimine taşıyamazsınız!' });
        }

        const timeCheckQuery = `SELECT * FROM appointments WHERE date = ? AND time = ? AND id != ?`;
        db.get(timeCheckQuery, [finalDate, finalTime, id], (err, rowByTime) => {
            if (err) return res.status(500).json({ error: err.message });
            if (rowByTime) {
                return res.status(400).json({ error: `GÜNCELLEME HATASI: Taşıdığınız saatte zaten ${rowByTime.customer_name} randevusu var!` });
            }

            const updateQuery = `UPDATE appointments SET customer_name = ?, phone = ?, date = ?, time = ?, note = ? WHERE id = ?`;
            db.run(updateQuery, [finalName, finalPhone, finalDate, finalTime, finalNote, id], (err) => {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ message: 'Ok' });
            });
        });
    });
});

// Randevu İptal Et / Sil
app.delete('/api/appointments/:id', (req, res) => {
    const { id } = req.params;
    db.run(`DELETE FROM appointments WHERE id = ?`, [id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'Ok' });
    });
});

// 4. OTOMATİK WHATSAPP BEKÇİSİ - HER DAKİKA ÇALIŞIR
cron.schedule('* * * * *', () => {
    // Türkiye saatine göre şu anki zamanı alalım
    const simdi = new Date(new Date().toLocaleString("en-US", {timeZone: "Europe/Istanbul"}));
    
    // Tam 1 saat sonrasını hesapla
    const birSaatSonra = new Date(simdi.getTime() + 60 * 60 * 1000);
    
    // YYYY-MM-DD formatı (sv-SE yerel formatı bunu düzgün verir)
    const hedefTarih = birSaatSonra.toLocaleDateString('sv-SE', {timeZone: "Europe/Istanbul"}); 
    
    // HH:mm formatı
    const hedefSaat = birSaatSonra.toLocaleTimeString('tr-TR', {hour: '2-digit', minute:'2-digit', timeZone: "Europe/Istanbul"});

    console.log(`🔍 Bekçi uyandı. Aranan Zaman -> Tarih: ${hedefTarih} | Saat: ${hedefSaat}`);

    db.all(`SELECT * FROM appointments WHERE date = ? AND time = ?`, [hedefTarih, hedefSaat], (err, rows) => {
        if (err) return console.error(err);

        if(rows.length > 0) {
            console.log(`🎯 Tam 1 saat sonra gerçekleşecek ${rows.length} randevu bulundu!`);
        }

        rows.forEach(app => {
            if (app.phone) {
                // Telefon numarasını WhatsApp formatına getir (905xxxxxxxxx)
                let temizNumara = app.phone.replace(/\D/g, ''); 
                if (temizNumara.startsWith('0')) temizNumara = temizNumara.substring(1);
                if (!temizNumara.startsWith('90')) temizNumara = '90' + temizNumara;

                const chatId = `${temizNumara}@c.us`;
                
                const mesaj = `🔔 *RANDEVU HATIRLATMA* \n\nSayın *${app.customer_name}*,\nRandevunuza tam *1 saat* kalmıştır.\n\n📅 *Tarih:* ${app.date}\n🕒 *Saat:* ${app.time}\n📝 *Not:* ${app.note || '-'}\n\nİyi günler dileriz! 🏪`;

                whatsapp.sendMessage(chatId, mesaj)
                    .then(() => console.log(`✉️ ${app.customer_name} adlı müşteriye WhatsApp hatırlatması başarıyla gönderildi.`))
                    .catch(err => console.error('WhatsApp mesaj gönderme hatası:', err));
            }
        });
    });
});

app.listen(PORT, () => {
    console.log(`Backend sunucusu http://localhost:${PORT} adresinde ayaklandı.`);
});