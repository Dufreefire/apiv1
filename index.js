const express = require('express');
const cors = require('cors');
const fs = require('fs');
const moment = require('moment');
const app = express();

app.use(cors());
app.use(express.json());

const DB_PATH = '/tmp/database.json'; // Dùng /tmp nếu chạy trên Vercel tạm thời
if (!fs.existsSync(DB_PATH)) fs.writeFileSync(DB_PATH, JSON.stringify({ keys: {} }));

const getDB = () => JSON.parse(fs.readFileSync(DB_PATH));
const saveDB = (data) => fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));

// Thuật toán dự đoán Bitwise (Không thể soi ở Frontend)
function engine(md5) {
    let weight = 0;
    for (let i = 0; i < md5.length; i++) {
        weight += md5.charCodeAt(i) * (i + 1.618);
    }
    return {
        res: Math.floor(weight) % 2 === 0 ? "TÀI" : "XỈU",
        conf: (60 + (weight % 39)).toFixed(2),
        ent: (weight % 1).toFixed(4)
    };
}

// API PHÂN TÍCH + CHỐNG SHARE
app.post('/api/predict', (req, res) => {
    const { key, md5, deviceId } = req.body;
    let db = getDB();
    const data = db.keys[key];

    if (!data || Date.now() > data.expireAt) return res.status(403).json({ error: "EXPIRED" });
    if (data.status === "locked") return res.status(403).json({ error: "LOCKED" });

    // Logic Anti-Share: Ghi nhớ thiết bị đầu tiên
    if (!data.deviceId) {
        data.deviceId = deviceId;
    } else if (data.deviceId !== deviceId) {
        data.status = "locked"; // Khóa ngay lập tức nếu ID thiết bị khác
        saveDB(db);
        return res.status(403).json({ error: "LOCKED_BY_SHARE" });
    }

    saveDB(db);
    res.json({ success: true, ...engine(md5) });
});

// API CHO ADMIN (BOT GỌI)
app.post('/api/admin', (req, res) => {
    const { pass, action, key, days } = req.body;
    if (pass !== "MY_ADMIN_SECRET") return res.status(401).send();

    let db = getDB();
    if (action === "gen") {
        const newK = "ALEX-" + Math.random().toString(36).substring(2,10).toUpperCase();
        db.keys[newK] = { expireAt: Date.now() + (days*86400000), status: "active", deviceId: null };
        saveDB(db);
        return res.json({ key: newK });
    }
    if (action === "unlock") {
        if(db.keys[key]) { db.keys[key].status = "active"; db.keys[key].deviceId = null; }
    }
    if (action === "lock") {
        if(db.keys[key]) db.keys[key].status = "locked";
    }
    saveDB(db);
    res.json({ success: true });
});

module.exports = app;
