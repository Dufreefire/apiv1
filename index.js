const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const moment = require('moment');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_PATH = path.join(__dirname, 'database.json');

app.use(cors());
app.use(express.json());
app.use(express.static('public')); // Để chứa file index.html trong thư mục public

// Khởi tạo Database nếu chưa tồn tại
if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, JSON.stringify({ keys: {} }, null, 2));
}

const getDB = () => JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
const saveDB = (data) => fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));

/**
 * THUẬT TOÁN ENGINE V12 (DETERMINISTIC)
 * Đảm bảo cùng 1 MD5 luôn ra 1 kết quả duy nhất
 */
function engine(md5) {
    let weight = 0;
    const hash = md5.toLowerCase();
    for (let i = 0; i < hash.length; i++) {
        weight += hash.charCodeAt(i) * (i + 1.618);
    }
    
    const isTai = Math.floor(weight) % 2 === 0;
    const entropy = (Math.abs(Math.sin(weight)) * 0.85 + 0.1).toFixed(4);
    const confidence = (68 + (weight % 31)).toFixed(2);
    
    return {
        res: isTai ? "TÀI" : "XỈU",
        conf: confidence,
        ent: entropy
    };
}

// --- API DỰ ĐOÁN (CHO MINI APP) ---
app.post('/api/predict', (req, res) => {
    const { key, md5, deviceId } = req.body;
    let db = getDB();
    
    if (!md5 || md5.length < 5) return res.status(400).json({ error: "INVALID_MD5" });
    
    const data = db.keys[key];

    // Kiểm tra tồn tại và hạn dùng
    if (!data || Date.now() > data.expireAt) {
        return res.status(403).json({ error: "EXPIRED" });
    }

    // Kiểm tra trạng thái khóa
    if (data.status === "locked") {
        return res.status(403).json({ error: "LOCKED" });
    }

    // Logic Anti-Share Key (Device Binding)
    if (!data.deviceId) {
        data.deviceId = deviceId; // Khóa thiết bị lần đầu sử dụng
    } else if (data.deviceId !== deviceId) {
        data.status = "locked"; 
        saveDB(db);
        return res.status(403).json({ error: "LOCKED_BY_SHARE" });
    }

    saveDB(db);
    res.json({ success: true, ...engine(md5) });
});

// --- API QUẢN TRỊ (CHO TELEGRAM BOT) ---
app.post('/api/admin', (req, res) => {
    const { pass, action, key, days } = req.body;
    
    // Thay 'MY_SECRET_2026' bằng pass của bạn trong môi trường Render (Environment Variable)
    const adminPass = process.env.ADMIN_SECRET || "admin";
    
    if (pass !== adminPass) return res.status(401).json({ error: "123123Aa@" });

    let db = getDB();
    
    switch (action) {
        case "gen":
            const newK = "ALEX-" + Math.random().toString(36).substring(2, 10).toUpperCase();
            db.keys[newK] = { 
                expireAt: Date.now() + (days * 86400000), 
                status: "active", 
                deviceId: null 
            };
            saveDB(db);
            return res.json({ key: newK });

        case "unlock":
            if (db.keys[key]) {
                db.keys[key].status = "active";
                db.keys[key].deviceId = null; // Reset để login máy mới
                saveDB(db);
            }
            break;

        case "lock":
            if (db.keys[key]) {
                db.keys[key].status = "locked";
                saveDB(db);
            }
            break;

        default:
            return res.status(400).json({ error: "ACTION_INVALID" });
    }

    res.json({ success: true });
});

app.listen(PORT, () => {
    console.log(`>>> Server ALEX PRO is running on port ${PORT}`);
});
