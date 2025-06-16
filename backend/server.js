// server.js
import { WebSocketServer, WebSocket } from 'ws';
import pkg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pkg;

// Konfiguracja połączenia z PostgreSQL
const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASS,
    port: parseInt(process.env.DB_PORT),
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 5000,
    keepAlive: true
});

// Testuj połączenie z bazą danych na starcie
pool.connect()
    .then(client => {
        console.log("Successfully connected to PostgreSQL!");
        client.release();
    })
    .catch(err => {
        console.error("Failed to connect to PostgreSQL on startup:", err.message);
        // Ważne: Jeśli połączenie z bazą danych jest krytyczne, możesz tu zakończyć proces.
        // process.exit(1);
    });


export const wss = new WebSocketServer({ noServer: true });

const clients = new Map(); // Map(ws, { username (Supabase ID), room }) - 'username' here is the Supabase user ID

wss.on('connection', (ws) => {
    let userData = null; // Stores { username, room } for this WS connection

    ws.on('message', async (message) => {
        try {
            const data = JSON.parse(message);
            console.log('Parsed incoming WebSocket data:', data);

            if (data.type === 'join') {
                // Save user data for this WS connection
                userData = { username: data.name, room: data.room }; // data.name is currentUser.id from frontend
                clients.set(ws, userData);

                // 1. Update status in the database to online
                await updateProfileStatus(userData.username, true);
                console.log(`User ${userData.username} joined room ${userData.room}. Database status updated to online.`);

                // 2. BROADCAST that this user is now online to ALL other connected clients
                // This will trigger 'status' message on other clients, updating their active lists
                broadcastUserStatus(userData.username, true);

                // 3. Send message history to the newly connected client for their current room
                // ONLY send history if the room is not 'global'
                if (data.room && data.room !== 'global') { // Upewniamy się, że data.room istnieje i nie jest 'global'
                    const history = await getLastMessages(data.room);
                    ws.send(JSON.stringify({
                        type: 'history',
                        room: data.room,
                        messages: history.map(msg => ({
                            username: msg.username,
                            text: msg.text,
                            inserted_at: msg.inserted_at,
                            room: data.room
                        })),
                    }));
                    console.log(`Sent history to room ${data.room}:`, history.length, 'messages.');
                } else if (data.room === 'global') {
                    console.log("Joined global room, not sending history for global.");
                } else {
                    console.warn("Join message received without a room, or room is null/undefined:", data);
                }

            }
            else if (data.type === 'message' && userData) {
                const targetRoom = data.room; 
                console.log('Processing MESSAGE type for room:', targetRoom, 'Data:', data);
                console.log('UserData for this WebSocket connection (sender):', userData);

                // Zapisz wiadomość w bazie danych
                const inserted_at = await saveMessage(userData.username, targetRoom, data.text);
                const msgObj = {
                    type: 'message',
                    username: userData.username,
                    text: data.text,
                    inserted_at,
                    room: targetRoom, // Ważne: Upewniamy się, że `room` jest zawarty w obiekcie wiadomości
                };
                console.log('Message saved to DB, attempting to broadcast to ALL clients:', msgObj);
                
                // KLUCZOWA ZMIANA: Wysyłamy do WSZYSTKICH klientów
                broadcastToAllClients(JSON.stringify(msgObj)); 
            }

            // Handle typing messages
            else if (data.type === 'typing' && userData) {
                const typingMsg = {
                    type: 'typing',
                    username: userData.username,
                    room: data.room 
                };
                // Wysyłamy typing do klientów w TYM SAMYM pokoju, z wyłączeniem nadawcy
                for (const [client, clientData] of clients.entries()) {
                    if (client.readyState === WebSocket.OPEN && clientData.room === data.room && client !== ws) {
                        client.send(JSON.stringify(typingMsg));
                    }
                }
                console.log(`Broadcasted typing status for user ${userData.username} in room ${data.room}.`);
            }

            // Optional: Handle 'leave' message (from frontend)
            else if (data.type === 'leave' && userData) {
                if (data.room !== 'global') { 
                    // Jeśli użytkownik opuszcza konkretny pokój, ustawiamy jego stan pokoju na 'global'
                    userData.room = 'global'; 
                    clients.set(ws, userData); 
                    console.log(`User ${userData.username} reported leaving room ${data.room}. Updated WS state to global.`);
                }
            }

            else if (data.type === 'get_active_users' && userData) {
                console.log(`Received request for active users from ${userData.username}.`);
                const activeUsersFromDb = await getOnlineStatusesFromDb(); 
                const formattedUsers = activeUsersFromDb.map(user => ({
                    id: user.id,
                    username: user.username, 
                    online: user.is_online
                }));
                ws.send(JSON.stringify({
                    type: 'active_users',
                    users: formattedUsers
                }));
                console.log(`Sent active users list to ${userData.username}. List size: ${formattedUsers.length}`);
            }
            else if (data.type === 'status') {
                const userId = data.user;
                const isOnline = data.online;

                // Ustaw userData dla tego połączenia WebSocket, jeśli jeszcze nie jest ustawione
                if (!userData) {
                    userData = { username: userId, room: 'global' }; // Domyślny pokój 'global' dla statusów
                    clients.set(ws, userData);
                } else {
                    userData.username = userId;
                    if (!userData.room) {
                        userData.room = 'global';
                    }
                    clients.set(ws, userData); 
                }
                
                await updateProfileStatus(userId, isOnline);
                console.log(`User ${userId} status updated to ${isOnline}. (from 'status' message)`);

                broadcastUserStatus(userId, isOnline);
            }
            else {
                console.warn('Unhandled message type or missing userData:', data);
            }

        } catch (err) {
            console.error('Error receiving WebSocket message:', err);
        }
    });

    ws.on('close', async () => {
        if (userData) {
            clients.delete(ws);
            await updateProfileStatus(userData.username, false);
            console.log(`User ${userData.username} disconnected. Database status updated to offline.`);

            broadcastUserStatus(userData.username, false);
        }
    });

    ws.on('error', (error) => {
        console.error('WebSocket error for client:', error);
    });
});

// ---------------------- Helper functions --------------------------

async function updateProfileStatus(userId, isOnline) {
    const client = await pool.connect();
    try {
        const query = `
            UPDATE public.profiles
            SET is_online = $1, last_seen_at = NOW()
            WHERE id = $2;
        `;
        await client.query(query, [isOnline, userId]);
        console.log(`DB: User ${userId} status updated to ${isOnline ? 'online' : 'offline'}`);
    } catch (err) {
        console.error(`DB Error: Failed to update user status for ${userId}:`, err);
    } finally {
        client.release();
    }
}

async function getOnlineStatusesFromDb() {
    const client = await pool.connect();
    try {
        const query = `
            SELECT id, is_online, username, email
            FROM public.profiles
            WHERE is_online = TRUE;
        `;
        const res = await client.query(query);
        console.log(`DB: Fetched ${res.rows.length} online users.`);
        return res.rows;
    } catch (err) {
        console.error('DB Error: Failed to get online statuses:', err);
        return [];
    } finally {
        client.release();
    }
}

// NOWA/ZMODYFIKOWANA FUNKCJA: Rozsyła wiadomość do WSZYSTKICH podłączonych klientów.
function broadcastToAllClients(msg) {
    console.log(`Attempting to broadcast message to ALL clients.`);
    let sentCount = 0;
    for (const client of clients.keys()) { 
        if (client.readyState === WebSocket.OPEN) {
            client.send(msg); 
            sentCount++;
        }
    }
    console.log(`Broadcasted message to ALL clients. Sent to ${sentCount} clients.`);
}

// Ta funkcja jest używana tylko dla statusów online/offline, które powinny trafiać do wszystkich
function broadcastUserStatus(userId, isOnline) {
    const msg = JSON.stringify({
        type: 'status',
        user: userId, 
        online: isOnline,
    });

    for (const client of clients.keys()) {
        if (client.readyState === WebSocket.OPEN) {
            client.send(msg);
        }
    }
    console.log(`Broadcasted user ${userId} status: ${isOnline ? 'online' : 'offline'}.`);
}

async function saveMessage(username, room, text) {
    const query = 'INSERT INTO messages (username, room, text) VALUES ($1, $2, $3) RETURNING inserted_at';
    try {
        const res = await pool.query(query, [username, room, text]);
        console.log(`DB: Message saved for user ${username} in room ${room}.`);
        return res.rows[0].inserted_at;
    } catch (err) {
        console.error('DB Error: Failed to save message:', err);
    }
    return new Date(); 
}

async function getLastMessages(room, limit = 50) {
    const query = 'SELECT username, text, inserted_at FROM messages WHERE room = $1 ORDER BY inserted_at DESC LIMIT $2';
    try {
        const res = await pool.query(query, [room, limit]);
        console.log(`DB: Fetched ${res.rows.length} messages for room ${room}.`);
        return res.rows.reverse();
    } catch (err) {
        console.error('DB Error: Failed to get message history:', err);
        return [];
    }
}
