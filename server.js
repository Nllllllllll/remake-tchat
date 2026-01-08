const express = require('express');
const session = require('express-session');
const bcrypt = require('bcrypt');
const mysql = require('mysql2/promise');
const cookieParser = require('cookie-parser');
const cookie = require('cookie');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, {
    cors: {
        origin: "http://localhost:3000",
        credentials: true
    }
});

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
        await db.execute(`CREATE TABLE IF NOT EXISTS messages (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL,
            text TEXT NOT NULL,
            time DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )`);
        await db.execute(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS edited BOOLEAN DEFAULT FALSE`);
        await db.execute(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS attachment TEXT`);
        console.log('Tables créées ou mises à jour');
    } catch (err) {
        console.error('Erreur création tables:', err);
    }
})();

app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(session({
    secret: 'new-secret-key',
    resave: true,
    saveUninitialized: true,
    name: 'mysession'
}));

// DB gère users et messages

const requireAuth = (req, res, next) => {
    if (req.session.user) {
        return next();
    }
    res.redirect('/login');
};

app.get('/', (req, res) => {
    if (req.session.user) {
        res.redirect('/chat');
    } else {
        res.sendFile(__dirname + '/public/index.html');
    }
});

app.get('/login', (req, res) => {
    res.sendFile(__dirname + '/public/login.html');
});

app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const [rows] = await db.execute('SELECT * FROM users WHERE username = ?', [username]);
        if (rows.length > 0 && await bcrypt.compare(password, rows[0].password)) {
            const user = { id: rows[0].id, username: rows[0].username };
            res.send(`<script>localStorage.setItem('user', '${JSON.stringify(user)}'); window.location='/chat';</script>`);
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
        const [rows] = await db.execute('SELECT id FROM users WHERE username = ?', [username]);
        const user = { id: rows[0].id, username };
        res.send(`<script>localStorage.setItem('user', '${JSON.stringify(user)}'); window.location='/chat';</script>`);
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

app.get('/chat', (req, res) => {
    res.sendFile(__dirname + '/public/chat.html');
});

io.on('connection', (socket) => {
    const user = socket.user;
    console.log(`${user.username} connecté`);

    // Envoyer l'historique des messages
    (async () => {
        try {
            const [rows] = await db.execute('SELECT messages.id, messages.text, messages.time, messages.edited, messages.attachment, users.username FROM messages JOIN users ON messages.user_id = users.id ORDER BY messages.time');
            console.log('Loaded messages:', rows.length);
            socket.emit('load messages', rows.map(row => ({ id: row.id, user: row.username, text: row.text, time: row.time, edited: row.edited, attachment: row.attachment })));
        } catch (err) {
            console.error('Erreur chargement messages:', err);
        }
    })();

    socket.on('chat message', async (data) => {
        console.log('Received message from', user.username, ':', data);
        try {
            await db.execute('INSERT INTO messages (user_id, text, attachment) VALUES (?, ?, ?)', [user.id, data.text || '', data.attachment || null]);
            const message = { user: user.username, text: data.text || '', time: new Date(), attachment: data.attachment };
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

    socket.on('disconnect', () => {
        console.log(`${user.username} déconnecté`);
    });
});

// Middleware pour Socket.IO auth
io.use((socket, next) => {
    try {
        socket.user = JSON.parse(socket.handshake.auth.user);
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