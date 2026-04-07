const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mysql = require('mysql2');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} request to ${req.url}`);
    next();
})

// 1. MySQL Pool Setup
const pool = mysql.createPool({
    host: 'mysql.railway.internal',
    user: 'root',
    password: 'BHLbRunXGxshCGKsbAwIKJXrQBLTPopS',
    database: 'railway',
    waitForConnections: true,
    connectionLimit: 10,
}).promise();// Using .promise() makes code cleaner with async/await

// 2. Initialize Database & Start Server
async function initDB() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS messages (
                id INT AUTO_INCREMENT PRIMARY KEY,
                username VARCHAR(255) NOT NULL,
                message TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('Database table ready.');

        // Start listening ONLY after DB is ready
        server.listen(PORT, () => console.log(`Server on http://localhost:${PORT}`));
    } catch (err) {
        console.error('DB Initialization Error:', err);
        process.exit(1);
    }
}

initDB();


// 3. Socket.io Logic
io.on('connection', async (socket) => {
    console.log('User connected:', socket.id);

    // Load history using async/await for readability
    try {
        const [rows] = await pool.query('SELECT * FROM messages ORDER BY created_at ASC LIMIT 50');
        socket.emit('message_history', rows);
    } catch (err) {
        console.error(err);
    }

    socket.on('send_message', async (data) => {
        try {
            // Add [result] here to capture the DB response!
            const [result] = await pool.query('INSERT INTO messages (username, message) VALUES (?, ?)',
                [data.username, data.text]);

            io.emit('receive_message', {
                id: result.insertId, // Now result is defined
                username: data.username,
                text: data.text,
                time: new Date(),
            });
        } catch (err) {
            console.error('Error saving message:', err);
        }
    });

    socket.on('disconnect', () => {
        console.log('User disconnected');
    });
});

const adminVerification = (req, res, next) => {
    const adminKey = req.headers['x-admin-key'];
    if (adminKey === 'secretKey123') {
        next();
    } else {
        res.status(403).json({
            error: "Forbidden: Invalid Admin Key",
        })
    }
}

app.get('/chatroom', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/chat.html'));
});

app.get('/chatroom/statistics', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT COUNT(*) as count FROM messages');
        res.send(`the amount of messages so far: ${rows[0].count}`);
    }
    catch (err) {
        res.status(500).json({ error: "Database error" });
    }
});


app.delete('/chatroom/:id', adminVerification, async (req, res) => {
    const messageId = req.params.id;

    try {

        const [result] = await pool.query("DELETE FROM messages WHERE id=?", [messageId]);

        if (result.affectedRows === 0) {
            return res.status(404).json({
                error: "Message Not Found",
            })
        }
        res.json({
            success: true,
            deletedId: messageId,
        })

    }
    catch (err) {
        res.status(500).json({
            error: "server error"
        })
    }
})

app.post('/chatroom/messages', async (req, res) => {
    const { username, text } = req.body;

    if (!username || !text) {
        return res.status(400).json({
            error: "Username and Text required"
        });
    }

    try {
        const [result] = await pool.query("INSERT INTO messages (username, message) VALUES (?, ?)", [username, text]);

        io.emit('receive_message', { username, text });

        res.status(201).json({
            success: true,
            messageId: result.insertId
        });
    }
    catch (err) {
        res.status(500).json({
            error: "Database error"
        })
    }
})

app.put('/chatroom/messages/:id', async (req, res) => {
    const messageId = req.params.id;
    const { text } = req.body;

    if (!text) {
        return res.status(400).json({
            error: "New text is required to update!!!",
        })
    }

    try {
        const [result] = await pool.query("UPDATE messages SET message = ? WHERE id = ?", [text, messageId]);
        if (result.affectedRows === 0) {
            res.status(404).json({
                error: "Message not found",
            })
        }

        const [rows] = await pool.query("SELECT username, created_at  FROM messages WHERE id=?", [messageId]);
        const actualUsername = rows[0].username;
        const time = rows[0].created_at;

        io.emit('message_updated', { id: messageId, newText: text, username: actualUsername, time: time });

        res.json({
            success: true,
            message: "Message Updated"
        })
    } catch (err) {
        res.status(500).json({
            error: "Database error"
        })
    }

})
