const express = require('express');
const session = require('express-session');
const bcrypt = require('bcrypt');
const mysql = require('mysql2/promise');
const cookieParser = require('cookie-parser');
const cookie = require('cookie');
const multer = require('multer');
const sharp = require('sharp');
const path = require('path');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, {
    cors: {
        origin: "http://localhost:3000",
        credentials: true
    },
    maxHttpBufferSize: 50 * 1024 * 1024 // 50MB
});

const onlineUsers = new Map();

const db = mysql.createPool({
    host: 'localhost',
    user: 'root',
    password: 'root',
    database: 'epicgame',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// Créer les tables si elles n'existent pas
(async () => {
    try {
        await db.execute(`CREATE TABLE IF NOT EXISTS users (
            id INT AUTO_INCREMENT PRIMARY KEY,
            username VARCHAR(50) UNIQUE NOT NULL,
            password VARCHAR(255) NOT NULL
        )`);
        await db.execute(`ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_pic VARCHAR(255)`);
        await db.execute(`ALTER TABLE users ADD COLUMN IF NOT EXISTS banner VARCHAR(255)`);
        await db.execute(`ALTER TABLE users ADD COLUMN IF NOT EXISTS bio TEXT`);
        await db.execute(`ALTER TABLE users ADD COLUMN IF NOT EXISTS banner_zoom FLOAT DEFAULT 1`);
        await db.execute(`ALTER TABLE users ADD COLUMN IF NOT EXISTS banner_pos_x FLOAT DEFAULT 50`);
        await db.execute(`ALTER TABLE users ADD COLUMN IF NOT EXISTS banner_pos_y FLOAT DEFAULT 50`);
        await db.execute(`ALTER TABLE users ADD COLUMN IF NOT EXISTS banner_rotate INT DEFAULT 0`);
        await db.execute(`CREATE TABLE IF NOT EXISTS messages (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL,
            text TEXT NOT NULL,
            time DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )`);
        await db.execute(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS edited BOOLEAN DEFAULT FALSE`);
        await db.execute(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS attachment LONGTEXT`);
        await db.execute(`ALTER TABLE messages MODIFY COLUMN attachment LONGTEXT`);
        await db.execute(`ALTER TABLE messages CHANGE attachment attachment LONGTEXT`);
        await db.execute(`CREATE TABLE IF NOT EXISTS reactions (
            id INT AUTO_INCREMENT PRIMARY KEY,
            message_id INT NOT NULL,
            emoji VARCHAR(10) NOT NULL,
            user_id INT NOT NULL,
            FOREIGN KEY (message_id) REFERENCES messages(id),
            FOREIGN KEY (user_id) REFERENCES users(id),
            UNIQUE KEY unique_reaction (message_id, emoji, user_id)
        )`);
        console.log('Tables créées ou mises à jour');
    } catch (err) {
        console.error('Erreur création tables:', err);
    }
})();

app.use(express.static('public'));
app.use('/uploads', express.static('temp'));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(session({
    secret: 'new-secret-key',
    resave: true,
    saveUninitialized: true,
    name: 'mysession'
}));

const upload = multer({ dest: 'temp/' });

// DB gère users et messages

const requireAuth = (req, res, next) => {
    if (req.session.user) {
        return next();
    }
    res.redirect('/login');
};

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/public/index.html');
});

app.get('/login', (req, res) => {
    res.sendFile(__dirname + '/public/login.html');
});

app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const [rows] = await db.execute('SELECT id, username, password, profile_pic FROM users WHERE username = ?', [username]);
        if (rows.length > 0 && await bcrypt.compare(password, rows[0].password)) {
            const user = { id: rows[0].id, username: rows[0].username, profile_pic: rows[0].profile_pic };
            req.session.user = user;
            res.send(`<script>localStorage.setItem('user', '${JSON.stringify(user)}'); window.location='/me';</script>`);
        } else {
            res.send('Nom d\'utilisateur ou mot de passe incorrect');
        }
    } catch (err) {
        console.error(err);
        res.send('Erreur serveur');
    }
});

app.get('/register', (req, res) => {
    res.sendFile(__dirname + '/public/register.html');
});

app.post('/register', async (req, res) => {
    const { username, password } = req.body;
    try {
        const hashed = await bcrypt.hash(password, 10);
        await db.execute('INSERT INTO users (username, password) VALUES (?, ?)', [username, hashed]);
        const [rows] = await db.execute('SELECT id, username, profile_pic FROM users WHERE username = ?', [username]);
        const user = { id: rows[0].id, username: rows[0].username, profile_pic: rows[0].profile_pic };
        req.session.user = user;
        res.send(`<script>localStorage.setItem('user', '${JSON.stringify(user)}'); window.location='/me';</script>`);
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') {
            res.send('Utilisateur déjà existant');
        } else {
            console.error(err);
            res.send('Erreur serveur');
        }
    }
});

app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/');
});

app.get('/me', (req, res) => {
    res.sendFile(__dirname + '/public/chat.html');
});

app.get('/profile', requireAuth, async (req, res) => {
    try {
        const userId = req.session.user.id;
        const [rows] = await db.execute('SELECT username, profile_pic, banner, bio FROM users WHERE id = ?', [userId]);
        if (rows.length > 0) {
            res.sendFile(__dirname + '/public/profile.html');
        } else {
            res.redirect('/login');
        }
    } catch (err) {
        console.error(err);
        res.send('Erreur serveur');
    }
});

app.post('/profile', requireAuth, upload.any(), async (req, res) => {
    try {
        console.log('Profile update req.body:', req.body);
        console.log('Profile update req.files:', req.files);
        const userId = req.session.user.id;
        const { bio, bannerZoom, bannerPosX, bannerPosY, bannerRotate } = req.body;
        const updates = [];
        const values = [];
        const profilePic = req.files.find(f => f.fieldname === 'profile_pic');
        if (profilePic) {
            updates.push('profile_pic = ?');
            values.push(profilePic.filename);
        }
        const banner = req.files.find(f => f.fieldname === 'banner');
        if (banner) {
            const imagePath = path.join(__dirname, 'temp', banner.filename);
            const metadata = await sharp(imagePath).metadata();
            const originalW = metadata.width;
            const originalH = metadata.height;
            const w = 600 / bannerZoom;
            const h = w * 0.25;
            const left_offset = (bannerPosX / 100) * 600 - (bannerPosX / 100) * w;
            const top_offset = (bannerPosY / 100) * 150 - (bannerPosY / 100) * h;
            const x1 = 100 - left_offset;
            const y1 = 25 - top_offset;
            const x2 = 500 - left_offset;
            const y2 = 125 - top_offset;
            const scale = w / originalW;
            const cropLeft = Math.max(0, x1 / scale);
            const cropTop = Math.max(0, y1 / scale);
            const cropWidth = Math.min(originalW - cropLeft, (x2 - x1) / scale);
            const cropHeight = Math.min(originalH - cropTop, (y2 - y1) / scale);
            const croppedFilename = 'cropped_' + Date.now() + '_' + banner.filename;
            const croppedPath = path.join(__dirname, 'uploads', croppedFilename);
            await sharp(imagePath).extract({ left: Math.round(cropLeft), top: Math.round(cropTop), width: Math.round(cropWidth), height: Math.round(cropHeight) }).toFile(croppedPath);
            updates.push('banner = ?');
            values.push(croppedFilename);
        }
        if (bio !== undefined) {
            updates.push('bio = ?');
            values.push(bio);
        }
        if (updates.length > 0) {
            const query = `UPDATE users SET ${updates.join(', ')} WHERE id = ?`;
            values.push(userId);
            console.log('Profile update query:', query, 'values:', values);
            await db.execute(query, values);
        }
        res.json({ success: true });
    } catch (err) {
        console.error('Erreur profile update:', err);
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/profile', requireAuth, async (req, res) => {
    try {
        const userId = req.session.user.id;
        const [rows] = await db.execute('SELECT username, profile_pic, banner, bio, banner_zoom, banner_pos_x, banner_pos_y, banner_rotate FROM users WHERE id = ?', [userId]);
        if (rows.length > 0) {
            res.json(rows[0]);
        } else {
            res.status(404).json({ error: 'Profil non trouvé' });
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

app.get('/api/profile/:username', async (req, res) => {
    try {
        const { username } = req.params;
        const [rows] = await db.execute('SELECT username, profile_pic, banner, bio, banner_zoom, banner_pos_x, banner_pos_y, banner_rotate FROM users WHERE username = ?', [username]);
        if (rows.length > 0) {
            res.json(rows[0]);
        } else {
            res.status(404).json({ error: 'Utilisateur non trouvé' });
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

io.on('connection', (socket) => {
    const user = socket.user;
    console.log(`${user.username} connecté`);

    // Envoyer la liste des utilisateurs en ligne
    io.emit('online users', Array.from(onlineUsers.values()));

    // Envoyer l'historique des messages
    (async () => {
        try {
            const [rows] = await db.execute(`
                SELECT messages.id, messages.text, messages.time, messages.edited, messages.attachment, users.username, users.profile_pic,
                GROUP_CONCAT(CONCAT(reactions.emoji, ':', users2.username) SEPARATOR ';') as reactions_str
                FROM messages
                JOIN users ON messages.user_id = users.id
                LEFT JOIN reactions ON messages.id = reactions.message_id
                LEFT JOIN users users2 ON reactions.user_id = users2.id
                GROUP BY messages.id
                ORDER BY messages.time
            `);
            console.log('Loaded messages:', rows.length);
            socket.emit('load messages', rows.map(row => {
                const reactions = {};
                if (row.reactions_str) {
                    row.reactions_str.split(';').forEach(pair => {
                        const [emoji, user] = pair.split(':');
                        if (!reactions[emoji]) reactions[emoji] = [];
                        reactions[emoji].push(user);
                    });
                }
                return {
                    id: row.id,
                    user: row.username,
                    text: row.text,
                    time: row.time,
                    edited: row.edited,
                    attachments: row.attachment ? (row.attachment.startsWith('[') ? JSON.parse(row.attachment) : [row.attachment]) : [],
                    profile_pic: row.profile_pic,
                    reactions
                };
            }));
        } catch (err) {
            console.error('Erreur chargement messages:', err);
        }
    })();

    socket.on('chat message', async (data) => {
        console.log('Received message from', user.username, ':', data);
        try {
            await db.execute('INSERT INTO messages (user_id, text, attachment) VALUES (?, ?, ?)', [user.id, data.text || '', JSON.stringify(data.attachments || [])]);
            const message = { user: user.username, text: data.text || '', time: new Date(), attachments: data.attachments || [], profile_pic: user.profile_pic };
            socket.broadcast.emit('chat message', message); // envoyer aux autres
        } catch (err) {
            console.error('Erreur envoi message:', err);
        }
    });

    socket.on('typing', () => {
        socket.broadcast.emit('typing', { user: user.username });
    });

    socket.on('stop typing', () => {
        socket.broadcast.emit('stop typing');
    });

    socket.on('delete message', async (id) => {
        try {
            const [result] = await db.execute('DELETE FROM messages WHERE id = ? AND user_id = ?', [id, user.id]);
            if (result.affectedRows > 0) {
                io.emit('message deleted', id);
            }
        } catch (err) {
            console.error('Erreur suppression:', err);
        }
    });

    socket.on('update message', async (id, newText) => {
        try {
            const [result] = await db.execute('UPDATE messages SET text = ?, edited = TRUE WHERE id = ? AND user_id = ?', [newText, id, user.id]);
            if (result.affectedRows > 0) {
                io.emit('message updated', { id, text: newText, edited: true });
            }
        } catch (err) {
            console.error('Erreur update:', err);
        }
    });

    socket.on('add reaction', async (data) => {
        const { messageId, emoji, user } = data;
        try {
            const [userRow] = await db.execute('SELECT id FROM users WHERE username = ?', [user]);
            if (userRow.length === 0) return;
            const userId = userRow[0].id;
            await db.execute('INSERT INTO reactions (message_id, emoji, user_id) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE id=id', [messageId, emoji, userId]);
            io.emit('reaction added', { messageId, emoji, user });
        } catch (err) {
            console.error('Erreur add reaction:', err);
        }
    });

    socket.on('remove reaction', async (data) => {
        const { messageId, emoji, user } = data;
        try {
            const [userRow] = await db.execute('SELECT id FROM users WHERE username = ?', [user]);
            if (userRow.length === 0) return;
            const userId = userRow[0].id;
            await db.execute('DELETE FROM reactions WHERE message_id = ? AND emoji = ? AND user_id = ?', [messageId, emoji, userId]);
            io.emit('reaction removed', { messageId, emoji, user });
        } catch (err) {
            console.error('Erreur remove reaction:', err);
        }
    });

    socket.on('disconnect', () => {
        console.log(`${user.username} déconnecté`);
        onlineUsers.delete(user.id);
        io.emit('online users', Array.from(onlineUsers.values()));
    });
});

// Middleware pour Socket.IO auth
io.use(async (socket, next) => {
    try {
        socket.user = JSON.parse(socket.handshake.auth.user);
        const [userRow] = await db.execute('SELECT profile_pic FROM users WHERE id = ?', [socket.user.id]);
        if (userRow.length > 0) {
            socket.user.profile_pic = userRow[0].profile_pic;
        }
        onlineUsers.set(socket.user.id, socket.user);
        console.log('User authenticated:', socket.user.username);
        next();
    } catch (err) {
        console.log('Auth error:', err);
        next(new Error('Authentication failed'));
    }
});

http.listen(3000, () => {
    console.log('serveur en écoute sur *:3000');
});