const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const moment = require('moment');

const app = express();
const DB_PATH = path.join(__dirname, 'database.json');

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Đảm bảo Database luôn tồn tại
if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, JSON.stringify({ keys: {} }, null, 2));
}

const getDB = () => JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
const saveDB = (data) => fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));

// Thuật toán Engine Bitwise Deterministic
function engine(md5) {
    let weight = 0;
    const cleanMd5 = md5.toLowerCase().trim();
    for (let i = 0; i < cleanMd5.length; i++) {
        weight += cleanMd5.charCodeAt(i) * (i + 1.618);
    }
    const isTai = Math.floor(weight) % 2 === 0;
    return {
        res: isTai ? "TÀI" : "XỈU",
        conf: (70 + (weight % 28.5)).toFixed(2),
        ent: (Math.abs(Math.sin(weight)) * 0.9).toFixed(4)
    };
}

// Route trang chủ
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// API Dự đoán + Chống Share Key
app.post('/api/predict', (req, res) => {
    const { key, md5, deviceId } = req.body;
    
    if (!key || !md5 || !deviceId) {
        return res.status(400).json({ error: "MISSING_DATA" });
    }

    let db = getDB();
    const data = db.keys[key.trim().toUpperCase()];

    if (!data) return res.status(403).json({ error: "KEY_NOT_FOUND" });
    if (Date.now() > data.expireAt) return res.status(403).json({ error: "EXPIRED" });
    if (data.status === "locked") return res.status(403).json({ error: "LOCKED" });

    // Cơ chế khóa thiết bị
    if (!data.deviceId) {
        data.deviceId = deviceId;
    } else if (data.deviceId !== deviceId) {
        data.status = "locked";
        saveDB(db);
        return res.status(403).json({ error: "LOCKED_BY_SHARE" });
    }

    saveDB(db);
    res.json({ success: true, ...engine(md5) });
});

// API Admin (Dùng biến môi trường cho bảo mật)
app.post('/api/admin', (req, res) => {
    const { pass, action, key, days } = req.body;
    const ADMIN_PASS = process.env.ADMIN_SECRET || "admin";

    if (pass !== ADMIN_PASS) return res.status(401).json({ error: "123123Aa@" });

    let db = getDB();
    const targetKey = key ? key.trim().toUpperCase() : null;

    if (action === "gen") {
        const newK = "ALEX-" + Math.random().toString(36).substring(2,10).toUpperCase();
        db.keys[newK] = { 
            expireAt: Date.now() + (days * 86400000), 
            status: "active", 
            deviceId: null 
        };
        saveDB(db);
        return res.json({ success: true, key: newK });
    }

    if (action === "unlock" && db.keys[targetKey]) {
        db.keys[targetKey].status = "active";
        db.keys[targetKey].deviceId = null;
    }

    if (action === "lock" && db.keys[targetKey]) {
        db.keys[targetKey].status = "locked";
    }

    saveDB(db);
    res.json({ success: true });
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`>>> Alex Engine v12 is Live on Port ${PORT}`));
