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
                if (data.room !== 'global') {
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
                } else {
                    console.log("Joined global room, not sending history.");
                }

            }
            else if (data.type === 'message' && userData) {
                // Ważne: data.room dla wiadomości powinien być już ustawiony poprawnie z frontendu (czyli konkretny pokój czatu)
                // Użyj data.room zamiast userData.room, aby mieć pewność, że to pokój z wysyłanej wiadomości
                const targetRoom = data.room; 
                console.log('Processing MESSAGE type for room:', targetRoom, 'Data:', data);
                console.log('UserData for this WebSocket connection:', userData);

                const inserted_at = await saveMessage(userData.username, targetRoom, data.text);
                const msgObj = {
                    type: 'message',
                    username: userData.username,
                    text: data.text,
                    inserted_at,
                    room: targetRoom, // Użyj targetRoom, nie userData.room
                };
                console.log('Message saved to DB, attempting to broadcast:', msgObj);
                broadcastToRoom(targetRoom, JSON.stringify(msgObj)); // Rozgłoś do konkretnego pokoju
            }

            // Handle typing messages
            else if (data.type === 'typing' && userData) {
                // Broadcast the typing message only to clients in the same room, excluding sender
                // Użyj data.room dla typingu również
                const typingMsg = {
                    type: 'typing',
                    username: userData.username,
                    room: data.room // Użyj data.room
                };
                for (const [client, clientData] of clients.entries()) {
                    if (client.readyState === WebSocket.OPEN && clientData.room === data.room && client !== ws) {
                        client.send(JSON.stringify(typingMsg));
                    }
                }
                console.log(`Broadcasted typing status for user ${userData.username} in room ${data.room}.`);
            }

            // Optional: Handle 'leave' message (from frontend)
            else if (data.type === 'leave' && userData) {
                // Clients are deleted on 'close' event for reliability, but we can log it.
                // If a user explicitly leaves a room, update their 'room' in the map if they are still connected
                // This is important for correct message routing in broadcastToRoom
                if (data.room !== 'global') { // Don't reset if leaving 'global' as it's a special case
                    userData.room = 'global'; // Reset to global or null if leaving a specific chat
                    clients.set(ws, userData); // Update the map
                    console.log(`User ${userData.username} reported leaving room ${data.room}. Updated WS state to global.`);
                }
            }

            // ***** KLUCZOWY DODATEK: Obsługa żądania 'get_active_users' *****
            // To jest wywoływane przez frontend w WebSocket 'onopen'
            else if (data.type === 'get_active_users' && userData) {
                console.log(`Received request for active users from ${userData.username}.`);
                const activeUsersFromDb = await getOnlineStatusesFromDb(); // Fetch from DB
                const formattedUsers = activeUsersFromDb.map(user => ({
                    id: user.id,
                    username: user.username, // Use the 'username' (display name) from the profiles table
                    online: user.is_online
                }));
                ws.send(JSON.stringify({
                    type: 'active_users',
                    users: formattedUsers
                }));
                console.log(`Sent active users list to ${userData.username}. List size: ${formattedUsers.length}`);
            }
            // ***** NOWY DODATEK: Obsługa wiadomości 'status' z frontendu *****
            else if (data.type === 'status') {
                const userId = data.user;
                const isOnline = data.online;

                if (!userData) {
                    userData = { username: userId, room: 'global' }; // Domyślny pokój 'global' dla statusów
                    clients.set(ws, userData);
                } else {
                    // Update username in userData if needed (unlikely)
                    userData.username = userId;
                    // If this status message is part of initial connection, ensure room is 'global'
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
            // Update status in the database to offline
            await updateProfileStatus(userData.username, false);
            console.log(`User ${userData.username} disconnected. Database status updated to offline.`);

            // Broadcast that this user is offline to all remaining connected clients
            broadcastUserStatus(userData.username, false);
        }
    });

    ws.on('error', (error) => {
        console.error('WebSocket error for client:', error);
        // Error handling that might also lead to disconnection
    });
});

// ---------------------- Helper functions --------------------------

// Function to update user status in the database
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

// Function to get online statuses from the database
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

// Broadcasts message to all clients in a specific room
function broadcastToRoom(room, msg) {
    console.log(`Attempting to broadcast message to room: ${room}`);
    let sentCount = 0;
    for (const [client, data] of clients.entries()) {
        if (client.readyState === WebSocket.OPEN) {
            // Logika dla wiadomości: wysyłaj tylko do klientów, którzy są w tym SAMYM pokoju czatu
            // To jest kluczowe, aby zapobiec wysyłaniu wiadomości do "global" room
            // chyba że wiadomość rzeczywiście ma iść do "global" (co nie powinno mieć miejsca dla czatu 1:1)
            if (data.room === room) {
                client.send(msg);
                sentCount++;
                console.log(`Sent message to client ${data.username} in room ${data.room}`);
            } else {
                console.log(`Client ${data.username} is in room ${data.room}, not sending to ${room}.`);
            }
        }
    }
    console.log(`Broadcasted message to room ${room}. Sent to ${sentCount} clients.`);
}

// Broadcasts user status change to ALL connected clients
function broadcastUserStatus(userId, isOnline) {
    const msg = JSON.stringify({
        type: 'status',
        user: userId, // Use userId (Supabase ID)
        online: isOnline,
    });

    // Send status to all connected clients
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
    return new Date(); // Return current date even if save fails
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
