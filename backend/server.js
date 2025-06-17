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

// Zmieniona struktura clients: Map(ws, { userId, currentRoom })
// 'userId' to ID użytkownika Supabase, 'currentRoom' to ID pokoju, w którym użytkownik aktualnie "słucha"
const clients = new Map(); 

wss.on('connection', (ws) => {
    // Inicjalizujemy dane użytkownika dla nowego połączenia
    // Domyślnie użytkownik nie jest w żadnym konkretnym pokoju czatu na początku (null lub 'global')
    let userData = { userId: null, currentRoom: null }; 
    clients.set(ws, userData); // Dodajemy nowe połączenie do mapy klientów

    ws.on('message', async (message) => {
        try {
            const data = JSON.parse(message);
            console.log('Parsed incoming WebSocket data:', data);

            if (data.type === 'join') {
                // Gdy klient dołącza, aktualizujemy jego userId i currentRoom
                // data.name to currentUser.id z frontendu
                userData.userId = data.name; 
                userData.currentRoom = data.room; // Pokój, do którego klient chce dołączyć
                clients.set(ws, userData); // Aktualizujemy mapę clients

                console.log(`User ${userData.userId} joined room ${userData.currentRoom}.`);

                // Aktualizujemy status w bazie danych na online (jeśli to pierwsze dołączenie użytkownika)
                // Ta część odpowiedzialności pozostaje tutaj, ale wywołujemy ją tylko raz per user (można dodać flagę)
                await updateProfileStatus(userData.userId, true);
                broadcastUserStatus(userData.userId, true); // Rozgłaszamy status online

                // Wysyłamy historię wiadomości tylko do klienta, który dołączył,
                // i tylko jeśli pokój nie jest 'global' (bo dla 'global' nie ma historii czatu)
                if (data.room && data.room !== 'global') {
                    const history = await getLastMessages(data.room);
                    ws.send(JSON.stringify({
                        type: 'history',
                        room: data.room,
                        messages: history.map(msg => ({
                            username: msg.sender_id, // Mapujemy sender_id na username
                            text: msg.content, // Mapujemy content na text
                            inserted_at: msg.created_at, // Mapujemy created_at na inserted_at
                            room: msg.room_id // Mapujemy room_id na room
                        })),
                    }));
                    console.log(`Sent history to room ${data.room} for user ${userData.userId}:`, history.length, 'messages.');
                } else if (data.room === 'global') {
                    console.log(`User ${userData.userId} joined global room, not sending chat history.`);
                } else {
                    console.warn("Join message received without a room, or room is null/undefined:", data);
                }

            }
            else if (data.type === 'message' && userData.userId) { // Wiadomość czatu
                const targetRoom = data.room; 
                console.log(`Processing MESSAGE type for room: ${targetRoom} from user: ${userData.userId}. Data:`, data);

                // Zapisz wiadomość w bazie danych (używamy sender_id, room_id, content)
                const created_at = await saveMessage(userData.userId, targetRoom, data.text); // text z frontendu to content
                const msgObj = {
                    type: 'message',
                    username: userData.userId, // To będzie sender_id
                    text: data.text, // To będzie content
                    inserted_at: created_at, // To będzie created_at
                    room: targetRoom, // To będzie room_id
                };
                console.log('Message saved to DB, attempting to broadcast to relevant clients:', msgObj);
                
                // KLUCZOWA ZMIANA: Rozsyłamy wiadomość tylko do klientów, którzy są w TYM SAMYM POKOJU
                broadcastToRoom(targetRoom, JSON.stringify(msgObj)); 

            }
            else if (data.type === 'typing' && userData.userId) { // Wskaźnik pisania
                const typingMsg = {
                    type: 'typing',
                    username: userData.userId,
                    room: data.room 
                };
                // Wysyłamy typing do klientów w TYM SAMYM pokoju, z wyłączeniem nadawcy
                for (const [client, clientData] of clients.entries()) {
                    // Sprawdzamy, czy klient jest w tym samym pokoju i nie jest nadawcą
                    if (client.readyState === WebSocket.OPEN && 
                        clientData.currentRoom === data.room && 
                        client !== ws) {
                        client.send(JSON.stringify(typingMsg));
                    }
                }
                console.log(`Broadcasted typing status for user ${userData.userId} in room ${data.room}.`);
            }
            else if (data.type === 'leave' && userData.userId) { // Klient opuszcza pokój (np. wraca do listy)
                if (data.room && data.room === userData.currentRoom) { // Tylko jeśli opuszcza aktualny pokój
                    userData.currentRoom = null; // Ustawiamy pokój na null (nie jest w żadnym konkretnym czacie)
                    clients.set(ws, userData); // Aktualizujemy mapę
                    console.log(`User ${userData.userId} explicitly left room ${data.room}. WS state updated to null room.`);
                } else {
                     console.log(`User ${userData.userId} sent leave for room ${data.room}, but they were in room ${userData.currentRoom}. No change.`);
                }
            }
            else if (data.type === 'get_active_users' && userData.userId) {
                console.log(`Received request for active users from ${userData.userId}.`);
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
                console.log(`Sent active users list to ${userData.userId}. List size: ${formattedUsers.length}`);
            }
            else if (data.type === 'status') { // Ten typ wiadomości służy do aktualizacji globalnego statusu
                const userId = data.user;
                const isOnline = data.online;

                // Upewniamy się, że userData jest zawsze aktualne dla tego połączenia
                if (!userData.userId) { // Jeśli userId nie było ustawione, ustaw je
                    userData.userId = userId;
                    clients.set(ws, userData);
                }
                
                await updateProfileStatus(userId, isOnline);
                console.log(`User ${userId} status updated to ${isOnline}. (from 'status' message)`);

                broadcastUserStatus(userId, isOnline); // Status zawsze rozsyłany globalnie
            }
            else {
                console.warn('Unhandled message type or missing userData.userId:', data);
            }

        } catch (err) {
            console.error('Error receiving WebSocket message:', err);
        }
    });

    ws.on('close', async () => {
        // Po zamknięciu połączenia WS, usuwamy klienta z mapy
        // I ustawiamy jego status offline w bazie danych
        if (userData.userId) { // Sprawdzamy, czy userId było ustawione dla tego połączenia
            clients.delete(ws);
            await updateProfileStatus(userData.userId, false);
            console.log(`User ${userData.userId} disconnected. Database status updated to offline.`);

            broadcastUserStatus(userData.userId, false); // Rozgłaszamy status offline
        } else {
            console.log("A WebSocket connection closed, but no userId was associated.");
            clients.delete(ws); // Usuń połączenie nawet bez userId
        }
    });

    ws.on('error', (error) => {
        console.error('WebSocket error for client:', error);
        // Ważne: błąd często prowadzi do zamknięcia połączenia, więc onclose też zadziała
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

/**
 * Broadcasts a message to all clients who are currently in the specified room.
 * @param {string} roomId - The ID of the room to broadcast to.
 * @param {string} msg - The JSON string message to send.
 */
function broadcastToRoom(roomId, msg) {
    console.log(`Attempting to broadcast message to room: ${roomId}.`);
    let sentCount = 0;
    for (const [client, clientData] of clients.entries()) { 
        // Wysyłamy wiadomość tylko jeśli klient jest w trybie OPEN i jego currentRoom zgadza się z targetRoomId
        if (client.readyState === WebSocket.OPEN && clientData.currentRoom === roomId) {
            client.send(msg); 
            sentCount++;
        }
    }
    console.log(`Broadcasted message to room ${roomId}. Sent to ${sentCount} clients.`);
}

/**
 * Broadcasts a user's online/offline status to ALL connected clients.
 * This is different from broadcastToRoom because status updates are global.
 * @param {string} userId - The ID of the user whose status is changing.
 * @param {boolean} isOnline - True if the user is online, false if offline.
 */
function broadcastUserStatus(userId, isOnline) {
    const msg = JSON.stringify({
        type: 'status',
        user: userId, 
        online: isOnline,
    });

    for (const client of clients.keys()) {
        // Wysyłamy status do wszystkich, niezależnie od tego, w którym pokoju się znajdują
        if (client.readyState === WebSocket.OPEN) {
            client.send(msg);
        }
    }
    console.log(`Broadcasted user ${userId} status: ${isOnline ? 'online' : 'offline'}.`);
}

/**
 * Saves a message to the database.
 * @param {string} senderId - The ID of the user sending the message.
 * @param {string} roomId - The ID of the room the message belongs to.
 * @param {string} content - The text content of the message.
 * @returns {Promise<string>} The 'created_at' timestamp of the inserted message.
 */
async function saveMessage(senderId, roomId, content) {
    // Zaktualizowane kolumny zgodnie ze schematem bazy danych
    const query = 'INSERT INTO messages (sender_id, room_id, content) VALUES ($1, $2, $3) RETURNING created_at';
    try {
        const res = await pool.query(query, [senderId, roomId, content]);
        console.log(`DB: Message saved for user ${senderId} in room ${roomId}.`);
        return res.rows[0].created_at; // Zwracamy created_at
    } catch (err) {
        console.error('DB Error: Failed to save message:', err);
    }
    return new Date().toISOString(); // Zwracamy bieżącą datę jako string ISO w przypadku błędu
}

/**
 * Fetches the last messages for a given room from the database.
 * @param {string} roomId - The ID of the room to fetch messages from.
 * @param {number} limit - The maximum number of messages to retrieve.
 * @returns {Promise<Array<Object>>} An array of message objects.
 */
async function getLastMessages(roomId, limit = 50) {
    // Zaktualizowane kolumny zgodnie ze schematem bazy danych
    const query = 'SELECT sender_id, content, created_at, room_id FROM messages WHERE room_id = $1 ORDER BY created_at DESC LIMIT $2';
    try {
        const res = await pool.query(query, [roomId, limit]);
        console.log(`DB: Fetched ${res.rows.length} messages for room ${roomId}.`);
        // Mapujemy nazwy kolumn z bazy danych na oczekiwane przez frontend
        return res.rows.reverse().map(row => ({
            username: row.sender_id,
            text: row.content,
            inserted_at: row.created_at,
            room: row.room_id // Dodajemy room_id, jeśli frontend tego potrzebuje
        }));
    } catch (err) {
        console.error('DB Error: Failed to get message history:', err);
        return [];
    }
}
