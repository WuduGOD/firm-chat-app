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

/**
 * Resets the online status of all users in the database to 'offline' on server startup.
 * This prevents users from appearing online indefinitely if the server crashes or restarts.
 */
async function resetAllUserStatusesToOfflineOnStartup() {
    console.log("Attempting to reset all user statuses to offline on startup...");
    const query = `
        UPDATE profiles
        SET is_online = FALSE, last_seen_at = NOW()
        WHERE is_online = TRUE;
    `;
    try {
        const res = await pool.query(query);
        console.log(`Reset ${res.rowCount} user(s) to offline status.`);
    } catch (err) {
        console.error('DB Error: Failed to reset user statuses on startup:', err);
    }
}

// Testuj połączenie z bazą danych na starcie i zresetuj statusy
pool.connect()
    .then(async client => {
        console.log("Successfully connected to PostgreSQL!");
        client.release();
        // Wywołanie funkcji resetującej statusy na offline
        await resetAllUserStatusesToOfflineOnStartup(); 
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

// NOWA MAPA: Zarządza wieloma połączeniami WS dla pojedynczego użytkownika
// Klucz: userId (string), Wartość: Set<WebSocket> (zbiór obiektów WebSocket)
const userIdToSockets = new Map(); 

wss.on('connection', (ws) => {
    // Inicjalizujemy dane użytkownika dla nowego połączenia
    // Domyślnie użytkownik nie jest w żadnym konkretnym pokoju czatu na początku (null lub 'global')
    let userData = { userId: null, currentRoom: null }; 
    clients.set(ws, userData); // Dodajemy nowe połączenie do mapy klientów

    ws.on('message', async (message) => {
        try {
            const parsedMessage = JSON.parse(message); // Zmiana nazwy zmiennej z 'data' na 'parsedMessage'
            console.log('Parsed incoming WebSocket message:', parsedMessage);

            switch (parsedMessage.type) { // Główna instrukcja switch
                case 'join':
                    // Gdy klient dołącza, aktualizujemy jego userId i currentRoom
                    // parsedMessage.name to currentUser.id z frontendu
                    userData.userId = parsedMessage.name; 
                    userData.currentRoom = parsedMessage.room; // Pokój, do którego klient chce dołączyć
                    clients.set(ws, userData); // Aktualizujemy mapę clients

                    // DODANO: Dodaj połączenie WS do mapy userIdToSockets
                    if (!userIdToSockets.has(userData.userId)) {
                        userIdToSockets.set(userData.userId, new Set());
                    }
                    userIdToSockets.get(userData.userId).add(ws);
                    console.log(`User ${userData.userId} now has ${userIdToSockets.get(userData.userId).size} active connections.`);


                    console.log(`User ${userData.userId} joined room ${userData.currentRoom}.`);

                    // Aktualizujemy status w bazie danych na online (jeśli to pierwsze dołączenie użytkownika)
                    await updateProfileStatus(userData.userId, true);
                    broadcastUserStatus(userData.userId, true); // Rozgłaszamy status online

                    // Wysyłamy historię wiadomości tylko do klienta, który dołączył,
                    // i tylko jeśli pokój nie jest 'global' (bo dla 'global' nie ma historii czatu)
                    if (parsedMessage.room && parsedMessage.room !== 'global') {
                        const history = await getLastMessages(parsedMessage.room);
                        ws.send(JSON.stringify({
                            type: 'history',
                            room: parsedMessage.room,
                            messages: history.map(msg => ({
                                username: msg.username, 
                                text: msg.text, 
                                inserted_at: msg.inserted_at, 
                                room: msg.room 
                            })),
                        }));
                        console.log(`Sent history to room ${parsedMessage.room} for user ${userData.userId}.`);
                    } else if (parsedMessage.room === 'global') {
                        console.log(`User ${userData.userId} joined global room, not sending chat history.`);
                    } else {
                        console.warn("Join message received without a room, or room is null/undefined:", parsedMessage);
                    }
                    break;

                case 'message': // Wiadomość czatu
                    if (!userData.userId) { // Zabezpieczenie przed wiadomościami bez przypisanego użytkownika
                        console.warn("Message received from unauthenticated client, ignoring.");
                        return;
                    }
                    const targetRoom = parsedMessage.room; 
                    console.log(`Processing MESSAGE type for room: ${targetRoom} from user: ${userData.userId}. Data:`, parsedMessage);

                    // Zapisz wiadomość w bazie danych (używamy sender_id, room_id, content)
                    const created_at = await saveMessage(userData.userId, targetRoom, parsedMessage.text); 
                    const msgObj = {
                        type: 'message',
                        username: userData.userId, 
                        text: parsedMessage.text, 
                        inserted_at: created_at, 
                        room: targetRoom, 
                    };
                    console.log('Message saved to DB, attempting to broadcast to participants:', msgObj);
                    
                    const recipientId = getOtherParticipantId(userData.userId, targetRoom);
                    if (recipientId) {
                        broadcastToParticipants(userData.userId, recipientId, JSON.stringify(msgObj));
                    } else {
                        // W przypadku błędu w identyfikacji odbiorcy, wiadomość jest wysyłana tylko do nadawcy
                        console.warn(`Could not determine recipient for room ${targetRoom} and sender ${userData.userId}. Broadcasting to sender only.`);
                        broadcastToUser(userData.userId, JSON.stringify(msgObj));
                    }
                    break;

                case 'typing': // Wskaźnik pisania
                    if (!userData.userId) return;
                    const typingMsg = {
                        type: 'typing',
                        username: userData.userId,
                        room: parsedMessage.room 
                    };
                    broadcastToRoom(parsedMessage.room, JSON.stringify(typingMsg), ws); 
                    console.log(`Broadcasted typing status for user ${userData.userId} in room ${parsedMessage.room}.`);
                    break;

                case 'leave': // Klient opuszcza pokój (np. wraca do listy)
                    if (!userData.userId) return;
                    if (parsedMessage.room && parsedMessage.room === userData.currentRoom) { 
                        userData.currentRoom = null; 
                        clients.set(ws, userData); 
                        console.log(`User ${userData.userId} explicitly left room ${parsedMessage.room}. WS state updated to null room.`);
                    } else {
                         console.log(`User ${userData.userId} sent leave for room ${parsedMessage.room}, but they were in room ${userData.currentRoom}. No change.`);
                    }
                    break;

                case 'get_active_users':
                    if (!userData.userId) return;
                    console.log(`Received request for active users from ${userData.userId}.`);
                    const allUsersStatuses = await getOnlineStatusesFromDb(); 
                    const formattedUsers = allUsersStatuses.map(user => ({
                        id: user.id,
                        username: user.username, 
                        online: user.is_online,
                        last_seen: user.last_seen_at 
                    }));
                    ws.send(JSON.stringify({
                        type: 'active_users',
                        users: formattedUsers
                    }));
                    console.log(`Sent all user statuses to ${userData.userId}. List size: ${formattedUsers.length}`);
                    break;

                case 'get_last_messages_for_user_rooms':
                    if (!userData.userId) return;
                    console.log(`Received request for last messages for user rooms from ${userData.userId}.`);
                    const lastMessages = await getLastMessagesForUserRooms(userData.userId);
                    ws.send(JSON.stringify({
                        type: 'last_messages_for_user_rooms',
                        messages: lastMessages
                    }));
                    console.log(`Sent last messages for user ${userData.userId} rooms. Count: ${Object.keys(lastMessages).length}`);
                    break;

                case 'status': // Ten typ wiadomości służy do aktualizacji globalnego statusu
                    const userIdFromStatus = parsedMessage.user;
                    const isOnline = parsedMessage.online;
                    const lastSeenTimestamp = parsedMessage.last_seen; 

                    if (!userData.userId) { 
                        userData.userId = userIdFromStatus;
                        clients.set(ws, userData);
                        if (!userIdToSockets.has(userData.userId)) {
                            userIdToSockets.set(userData.userId, new Set());
                        }
                        userIdToSockets.get(userData.userId).add(ws);
                        console.log(`User ${userData.userId} (from status message) now has ${userIdToSockets.get(userData.userId).size} active connections.`);
                    }
                    
                    await updateProfileStatus(userIdFromStatus, isOnline);
                    console.log(`User ${userIdFromStatus} status updated to ${isOnline}. (from 'status' message)`);
                    broadcastUserStatus(userIdFromStatus, isOnline, lastSeenTimestamp); 
                    break;

                // NOWE TYPY WIADOMOŚCI DLA FUNKCJONALNOŚCI ZNAJOMYCH I POWIADOMIEŃ
                case 'friendRequest':
                    const targetUserId = parsedMessage.toUserId;
                    broadcastToUser(targetUserId, JSON.stringify({
                        type: 'friendRequest',
                        fromEmail: parsedMessage.fromEmail,
                        fromUserId: parsedMessage.fromUserId
                    }));
                    console.log(`Forwarded friend request from ${parsedMessage.fromEmail} to ${targetUserId}.`);
                    break;

                case 'friendRequestAccepted':
                    const acceptedByUserId = parsedMessage.fromUserId; 
                    const originalSenderId = parsedMessage.otherUserId; 
                    broadcastToUser(originalSenderId, JSON.stringify({
                        type: 'friendRequestAccepted',
                        acceptedByEmail: parsedMessage.acceptedByEmail,
                        newRoomId: parsedMessage.newRoomId,
                        fromUserId: acceptedByUserId 
                    }));
                    console.log(`Forwarded friend request accepted notification to ${originalSenderId}.`);
                    break;

                case 'friendRequestRejected':
                    const rejectedByUserId = parsedMessage.fromUserId; 
                    const originalRejectedSenderId = parsedMessage.toUserId; 
                    broadcastToUser(originalRejectedSenderId, JSON.stringify({
                        type: 'friendRequestRejected',
                        rejectedByEmail: parsedMessage.rejectedByEmail,
                        fromUserId: rejectedByUserId 
                    }));
                    console.log(`Forwarded friend request rejected notification to ${originalRejectedSenderId}.`);
                    break;

                case 'newConversation':
                    const userToNotify = parsedMessage.userId;
                    broadcastToUser(userToNotify, JSON.stringify({ type: 'newConversation' }));
                    console.log(`Notified user ${userToNotify} about new conversation.`);
                    break;

                default:
                    console.warn('Unknown message type:', parsedMessage.type);
            }
        } catch (error) {
            console.error('Error parsing or handling message:', error);
        }
    });

    ws.on('close', async () => {
        if (userData.userId) { 
            clients.delete(ws); 

            if (userIdToSockets.has(userData.userId)) {
                const sockets = userIdToSockets.get(userData.userId);
                sockets.delete(ws);
                if (sockets.size === 0) {
                    userIdToSockets.delete(userData.userId);
                    console.log(`User ${userData.userId} has no more active connections. Removed from userIdToSockets.`);
                }
            }
            
            if (!userIdToSockets.has(userData.userId) || userIdToSockets.get(userData.userId).size === 0) {
                await updateProfileStatus(userData.userId, false); 
                console.log(`User ${userData.userId} disconnected. Database status updated to offline.`);
                const client = await pool.connect();
                try {
                    const res = await client.query('SELECT last_seen_at FROM public.profiles WHERE id = $1', [userData.userId]);
                    const lastSeen = res.rows.length > 0 ? res.rows[0].last_seen_at : null;
                    broadcastUserStatus(userData.userId, false, lastSeen); 
                } catch (err) {
                    console.error('DB Error on close: Failed to get last_seen_at for broadcast:', err);
                    broadcastUserStatus(userData.userId, false, new Date().toISOString()); 
                } finally {
                    client.release();
                }
            } else {
                console.log(`User ${userData.userId} disconnected one session, but still has ${userIdToSockets.get(userData.userId).size} active connections.`);
            }

        } else {
            console.log("A WebSocket connection closed, but no userId was associated.");
            clients.delete(ws); 
        }
    });

    ws.on('error', (error) => {
        console.error('WebSocket error for client:', error);
    });
});

// ---------------------- Helper functions --------------------------

// Funkcja resetująca statusy wszystkich użytkowników na offline przy starcie serwera
// Przeniesiona na górę, aby uniknąć duplikacji i być dostępna dla pool.connect().
// async function resetAllUserStatusesToOfflineOnStartup() { /* ... */ } -- USUNIĘTO DUPLIKACJĘ

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

// Pobiera last_seen_at dla WSZYSTKICH profili
async function getOnlineStatusesFromDb() {
    const client = await pool.connect();
    try {
        const query = `
            SELECT id, is_online, username, email, last_seen_at
            FROM public.profiles; 
        `;
        const res = await client.query(query);
        console.log(`DB: Fetched ${res.rows.length} profiles with status info.`);
        return res.rows;
    } catch (err) {
        console.error('DB Error: Failed to get online statuses:', err);
        return [];
    } finally {
        client.release();
    }
}

/**
 * NOWA FUNKCJA: Pobiera ostatnią wiadomość dla każdego pokoju, w którym uczestniczy dany użytkownik.
 * Rozwiązuje problem N+1 dla ładowania ostatnich wiadomości w liście konwersacji.
 * @param {string} userId - ID użytkownika, dla którego pobierane są wiadomości.
 * @returns {Promise<Object>} Obiekt, gdzie kluczem jest room_id, a wartością jest obiekt ostatniej wiadomości.
 */
async function getLastMessagesForUserRooms(userId) {
    const client = await pool.connect();
    try {
        const query = `
            WITH RankedMessages AS (
                SELECT
                    m.room_id,
                    m.sender_id,
                    m.content,
                    m.created_at,
                    ROW_NUMBER() OVER (PARTITION BY m.room_id ORDER BY m.created_at DESC) as rn
                FROM
                    messages m
                WHERE
                    m.room_id LIKE '%' || $1 || '%' 
            )
            SELECT
                room_id,
                sender_id,
                content,
                created_at
            FROM
                RankedMessages
            WHERE
                rn = 1;
        `;
        const res = await client.query(query, [userId]);
        console.log(`DB: Fetched ${res.rows.length} last messages for user ${userId}'s rooms.`);

        const lastMessagesMap = {};
        res.rows.forEach(row => {
            lastMessagesMap[row.room_id] = {
                text: row.content,
                username: row.sender_id,
                inserted_at: row.created_at,
                room: row.room_id
            };
        });
        return lastMessagesMap;
    } catch (err) {
        console.error(`DB Error: Failed to get last messages for user rooms for ${userId}:`, err);
        return {};
    } finally {
        client.release();
    }
}


/**
 * Broadcasts a message to all clients who are currently in the specified room.
 * Używane GŁÓWIE dla wiadomości typu 'typing' lub innych, które muszą być widoczne tylko w aktywnie otwartym czacie.
 * @param {string} roomId - The ID of the room to broadcast to.
 * @param {string} msg - The JSON string message to send.
 * @param {WebSocket} [excludeWs=null] - Opcjonalne połączenie WebSocket do wykluczenia (np. nadawca).
 */
function broadcastToRoom(roomId, msg, excludeWs = null) {
    console.log(`Attempting to broadcast message to room: ${roomId}.`);
    let sentCount = 0;
    for (const [client, clientData] of clients.entries()) { 
        if (client.readyState === WebSocket.OPEN && 
            clientData.currentRoom === roomId &&
            client !== excludeWs) { 
            client.send(msg); 
            sentCount++;
        }
    }
    console.log(`Broadcasted message to room ${roomId}. Sent to ${sentCount} clients.`);
}

/**
 * Broadcasts a user's online/offline status to ALL connected clients.
 * Statusy użytkowników są globalne i wszyscy powinni je otrzymać.
 * @param {string} userId - The ID of the user whose status is changing.
 * @param {boolean} isOnline - True if the user is online, false if offline.
 * @param {string | null} lastSeen - The 'last_seen_at' timestamp if the user is going offline.
 */
function broadcastUserStatus(userId, isOnline, lastSeen = null) {
    const msg = JSON.stringify({
        type: 'status',
        user: userId, 
        online: isOnline,
        last_seen: lastSeen 
    });

    for (const client of clients.keys()) {
        if (client.readyState === WebSocket.OPEN) {
            client.send(msg);
        }
    }
    console.log(`Broadcasted user ${userId} status: ${isOnline ? 'online' : 'offline'}. Last seen: ${lastSeen || 'N/A'}.`);
}

/**
 * Determines the other participant's ID in a 1-on-1 chat room.
 * Zakłada, że room ID jest sformatowane jako 'user1Id_user2Id', gdzie ID są posortowane alfabetycznie.
 * @param {string} currentUserId - The ID of the current user (sender).
 * @param {string} roomId - The ID of the chat room (np. 'userA_userB').
 * @returns {string|null} The ID of the other participant, lub null jeśli nie znaleziono/nieprawidłowy format room ID.
 */
function getOtherParticipantId(currentUserId, roomId) {
    const parts = roomId.split('_');
    if (parts.length === 2) {
        if (parts[0] === currentUserId) {
            return parts[1];
        }
        if (parts[1] === currentUserId) {
            return parts[0];
        }
    }
    return null; 
}

/**
 * Broadcasts a message to all active WebSocket connections of specific users (sender and recipient).
 * Używane dla wiadomości czatu, aby zoptymalizować ruch sieciowy.
 * @param {string} senderId - The ID of the message sender.
 * @param {string} recipientId - The ID of the message recipient.
 * @param {string} msg - The JSON string message to send.
 */
function broadcastToParticipants(senderId, recipientId, msg) {
    let sentCount = 0;

    if (userIdToSockets.has(senderId)) {
        const senderSockets = userIdToSockets.get(senderId);
        for (const clientWs of senderSockets) {
            if (clientWs.readyState === WebSocket.OPEN) {
                clientWs.send(msg);
                sentCount++;
            }
        }
    }

    if (senderId !== recipientId && userIdToSockets.has(recipientId)) {
        const recipientSockets = userIdToSockets.get(recipientId);
        for (const clientWs of recipientSockets) {
            if (clientWs.readyState === WebSocket.OPEN) {
                clientWs.send(msg);
                sentCount++;
            }
        }
    }
    console.log(`Broadcasted message to sender (${senderId}) and recipient (${recipientId}). Sent to ${sentCount} connections.`);
}

/**
 * Helper to send a message to all active WebSocket connections of a single user.
 * Może być użyte jako fallback lub do specyficznych, spersonalizowanych powiadomień.
 * @param {string} userId - The ID of the user.
 * @param {string} msg - The JSON string message to send.
 */
function broadcastToUser(userId, msg) {
    let sentCount = 0;
    if (userIdToSockets.has(userId)) {
        const userSockets = userIdToSockets.get(userId);
        for (const clientWs of userSockets) {
            if (clientWs.readyState === WebSocket.OPEN) {
                clientWs.send(msg);
                sentCount++;
            }
        }
    }
    console.log(`Broadcasted message to user ${userId}. Sent to ${sentCount} connections.`);
}

/**
 * Saves a message to the database.
 * @param {string} senderId - The ID of the user sending the message.
 * @param {string} roomId - The ID of the room the message belongs to.
 * @param {string} content - The text content of the message.
 * @returns {Promise<string>} The 'created_at' timestamp of the inserted message.
 */
async function saveMessage(senderId, roomId, content) {
    const query = 'INSERT INTO messages (sender_id, room_id, content) VALUES ($1, $2, $3) RETURNING created_at';
    try {
        const res = await pool.query(query, [senderId, roomId, content]);
        console.log(`DB: Message saved for user ${senderId} in room ${roomId}.`);
        return res.rows[0].created_at; 
    } catch (err) {
        console.error('DB Error: Failed to save message:', err);
    }
    return new Date().toISOString(); 
}

/**
 * Fetches the last messages for a given room from the database.
 * @param {string} roomId - The ID of the room to fetch messages from.
 * @param {number} limit - The maximum number of messages to retrieve.
 * @returns {Promise<Array<Object>>} An array of message objects.
 */
async function getLastMessages(roomId, limit = 50) {
    const query = 'SELECT sender_id, content, created_at, room_id FROM messages WHERE room_id = $1 ORDER BY created_at DESC LIMIT $2';
    try {
        const res = await pool.query(query, [roomId, limit]);
        console.log(`DB: Fetched ${res.rows.length} messages for room ${roomId}.`);
        return res.rows.reverse().map(row => ({
            username: row.sender_id,
            text: row.content,
            inserted_at: row.created_at,
            room: row.room_id 
        }));
    } catch (err) {
        console.error('DB Error: Failed to get message history:', err);
        return [];
    }
}
