// server.js
import { WebSocketServer, WebSocket } from 'ws';
import pkg from 'pg';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js'; // NOWY IMPORT: Supabase

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

// NOWA KONFIGURACJA: Klient Supabase dla Realtime
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY; // Użyj Service Role Key dla operacji serwerowych

if (!supabaseUrl || !supabaseServiceRoleKey) {
    console.error("SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not defined in .env. Supabase Realtime will not function.");
    // Możesz zdecydować, czy aplikacja ma się zakończyć, czy kontynuować bez Realtime
    // process.exit(1); 
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);
console.log("Supabase client initialized for server-side Realtime.");


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
            const data = JSON.parse(message);
            console.log('Parsed incoming WebSocket data:', data);

            if (data.type === 'join') {
                // Gdy klient dołącza, aktualizujemy jego userId i currentRoom
                // data.name to currentUser.id z frontendu
                userData.userId = data.name; 
                userData.currentRoom = data.room; // Pokój, do którego klient chce dołączyć
                clients.set(ws, userData); // Aktualizujemy mapę clients

                // DODANO: Dodaj połączenie WS do mapy userIdToSockets
                if (!userIdToSockets.has(userData.userId)) {
                    userIdToSockets.set(userData.userId, new Set());
                }
                userIdToSockets.get(userData.userId).add(ws);
                console.log(`User ${userData.userId} now has ${userIdToSockets.get(userData.userId).size} active connections.`);


                console.log(`User ${userData.userId} joined room ${userData.currentRoom}.`);


                // Wysyłamy historię wiadomości tylko do klienta, który dołączył,
                // i tylko jeśli pokój nie jest 'global' (bo dla 'global' nie ma historii czatu)
                if (data.room && data.room !== 'global') {
                    const history = await getLastMessages(data.room);
                    ws.send(JSON.stringify({
                        type: 'history',
                        room: data.room,
                        messages: history.map(msg => ({
                            username: msg.username, // Mapujemy z powrotem na username
                            text: msg.text, // Mapujemy z powrotem na text
                            inserted_at: msg.inserted_at, // Mapujemy z powrotem na inserted_at
                            room: msg.room // Zapewniamy, że room jest przekazywany dalej
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

                // WYODRĘBNIANIE participant1_id i participant2_id z room_id
                const participants = targetRoom.split('_').sort(); // Zakładamy, że room_id to 'id1_id2' posortowane alfabetycznie
                const participant1Id = participants[0];
                const participant2Id = participants[1];

                // Zapisz wiadomość w bazie danych (używamy sender_id, room_id, content, participant1_id, participant2_id)
                const created_at = await saveMessage(userData.userId, targetRoom, data.text, participant1Id, participant2Id); // Dodano nowe parametry
                const msgObj = {
                    type: 'message',
                    username: userData.userId, // To będzie sender_id
                    text: data.text, // To będzie content
                    inserted_at: created_at, // To będzie created_at
                    room: targetRoom, // To będzie room_id
                };
                console.log('Message saved to DB, attempting to broadcast to participants:', msgObj);
                
                // KLUCZOWA ZMIANA: Zamiast broadcastToAllConnectedClients, używamy broadcastToParticipants
                const recipientId = getOtherParticipantId(userData.userId, targetRoom);
                if (recipientId) {
                    broadcastToParticipants(userData.userId, recipientId, JSON.stringify(msgObj));
                } else {
                    // W przypadku błędu w identyfikacji odbiorcy, wiadomość jest wysyłana tylko do nadawcy
                    console.warn(`Could not determine recipient for room ${targetRoom} and sender ${userData.userId}. Broadcasting to sender only.`);
                    broadcastToUser(userData.userId, JSON.stringify(msgObj));
                }

            }
            else if (data.type === 'typing' && userData.userId) { // Wskaźnik pisania
                const typingMsg = {
                    type: 'typing',
                    username: userData.userId,
                    room: data.room 
                };
                // Wysyłamy typing do klientów w TYM SAMYM pokoju, z wyłączeniem nadawcy
                // Ważne: `broadcastToRoom` jest nadal używane dla wskaźnika pisania, ponieważ on dotyczy TYLKO konkretnego pokoju
                broadcastToRoom(data.room, JSON.stringify(typingMsg), ws); // Dodano `ws` aby wykluczyć nadawcę

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
            }
            // NOWY TYP WIADOMOŚCI: Żądanie ostatnich wiadomości dla pokoi użytkownika
            else if (data.type === 'get_last_messages_for_user_rooms' && userData.userId) {
                console.time(`getLastMessagesForUserRooms_total_time_${userData.userId}`); // Start total timer
                console.log(`Received request for last messages for user rooms from ${userData.userId}.`);
                const lastMessages = await getLastMessagesForUserRooms(userData.userId);
                try {
                    ws.send(JSON.stringify({
                        type: 'last_messages_for_user_rooms',
                        messages: lastMessages
                    }));
                    console.log(`Sent last messages for user ${userData.userId} rooms. Count: ${Object.keys(lastMessages).length}`);
                } catch (sendError) {
                    console.error(`Error sending 'last_messages_for_user_rooms' to ${userData.userId}:`, sendError);
                }
                console.timeEnd(`getLastMessagesForUserRooms_total_time_${userData.userId}`); // End total timer
            }
            else if (data.type === 'status') { // Ten typ wiadomości służy do aktualizacji globalnego statusu
                const userId = data.user;
                const isOnline = data.online;
                const lastSeenTimestamp = data.last_seen; // Odbierz last_seen z klienta

                // Upewniamy się, że userData jest zawsze aktualne dla tego połączenia
                if (!userData.userId) { // Jeśli userId nie było ustawione, ustaw je
                    userData.userId = userId;
                    clients.set(ws, userData);
                     // DODANO: Dodaj połączenie WS do mapy userIdToSockets dla nowo ustawionego userId
                    if (!userIdToSockets.has(userData.userId)) {
                        userIdToSockets.set(userData.userId, new Set());
                    }
                    userIdToSockets.get(userData.userId).add(ws);
                    console.log(`User ${userData.userId} (from status message) now has ${userIdToSockets.get(userData.userId).size} active connections.`);
                }
                
                await updateProfileStatus(userId, isOnline);
                console.log(`User ${userId} status updated to ${isOnline}. (from 'status' message)`);

            }
            else {
                console.warn('Unhandled message type or missing userData.userId:', data);
            }

        } catch (err) {
            console.error('Error receiving WebSocket message:', err);
        }
    });

    ws.on('close', async () => {
        // Po zamknięciu połączenia WS, usuwamy klienta z mapy clients
        if (userData.userId) { 
            clients.delete(ws); // Usuń z mapy klientów ogólnych

            // USUWANIE: Usuń połączenie WS z mapy userIdToSockets
            if (userIdToSockets.has(userData.userId)) {
                const sockets = userIdToSockets.get(userData.userId);
                sockets.delete(ws);
                if (sockets.size === 0) {
                    userIdToSockets.delete(userData.userId);
                    console.log(`User ${userData.userId} has no more active connections. Removed from userIdToSockets.`);
                }
            }
            
            // Tylko jeśli użytkownik nie ma innych aktywnych połączeń, ustawiamy go na offline
            if (!userIdToSockets.has(userData.userId) || userIdToSockets.get(userData.userId).size === 0) {
                await updateProfileStatus(userData.userId, false); // Zaktualizuj bazę danych na offline
                console.log(`User ${userData.userId} disconnected. Database status updated to offline.`);
                // Pobierz last_seen_at z bazy danych dla użytkownika, który właśnie stał się offline
                const client = await pool.connect();
                try {
                    const res = await client.query('SELECT last_seen_at FROM public.profiles WHERE id = $1', [userData.userId]);
                    const lastSeen = res.rows.length > 0 ? res.rows[0].last_seen_at : null;
                } catch (err) {
                    console.error('DB Error on close: Failed to get last_seen_at for broadcast:', err);
                } finally {
                    client.release();
                }
            } else {
                console.log(`User ${userData.userId} disconnected one session, but still has ${userIdToSockets.get(userData.userId).size} active connections.`);
            }

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

// ---------------------- Supabase Realtime Listeners --------------------------

// Nasłuchiwanie na nowe zaproszenia do znajomych (INSERT)
supabase
    .channel('friend_requests_channel') // Nazwa kanału
    .on(
        'postgres_changes',
        {
            event: 'INSERT', // Interesują nas tylko nowe wpisy
            schema: 'public',
            table: 'friends', // Zmieniono z 'friend_requests' na 'friends'
            // Możesz dodać filtr, np. `filter: 'receiver_id=eq.' + userId` jeśli chcesz,
            // aby serwer nasłuchiwał tylko dla konkretnego użytkownika,
            // ale dla serwera lepiej jest nasłuchiwać globalnie i filtrować w kodzie.
        },
        (payload) => {
            console.log('[Supabase Realtime - INSERT] New friend request received:', payload.new);
            const newRequest = payload.new;
            // Wysyłamy powiadomienie do odbiorcy zaproszenia
            if (newRequest.status === 'pending') {
                broadcastToUser(newRequest.friend_id, JSON.stringify({ // Zmieniono receiver_id na friend_id
                    type: 'new_friend_request',
                    sender_id: newRequest.user_id, // Zmieniono sender_id na user_id
                    request_id: newRequest.id
                }));
                console.log(`[Supabase Realtime] Sent new_friend_request notification to ${newRequest.friend_id} from ${newRequest.user_id}.`); // Zmieniono receiver_id na friend_id, sender_id na user_id
            }
        }
    )
    .subscribe();
console.log("[Supabase Realtime] Subscribed to 'friend_requests_channel'.");

// Nasłuchiwanie na aktualizacje statusu zaproszeń do znajomych (UPDATE)
supabase
    .channel('friend_requests_status_channel')
    .on(
        'postgres_changes',
        {
            event: 'UPDATE',
            schema: 'public',
            table: 'friends', // Zmieniono z 'friend_requests' na 'friends'
        },
        (payload) => {
            console.log('[Supabase Realtime - UPDATE] Friend request status updated:', payload.new);
            const updatedRequest = payload.new;
            // Wysyłamy powiadomienie do nadawcy zaproszenia o zmianie statusu
            if (updatedRequest.status === 'accepted' || updatedRequest.status === 'declined') {
                broadcastToUser(updatedRequest.user_id, JSON.stringify({ // Zmieniono sender_id na user_id
                    type: 'friend_request_status_update',
                    request_id: updatedRequest.id,
                    receiver_id: updatedRequest.friend_id, // Zmieniono receiver_id na friend_id
                    status: updatedRequest.status
                }));
                console.log(`[Supabase Realtime] Sent friend_request_status_update notification to ${updatedRequest.user_id} for request ${updatedRequest.id} (status: ${updatedRequest.status}).`); // Zmieniono sender_id na user_id
            }
        }
    )
    .subscribe();
console.log("[Supabase Realtime] Subscribed to 'friend_requests_status_channel'.");


// ---------------------- Helper functions --------------------------

// Funkcja resetująca statusy wszystkich użytkowników na offline przy starcie serwera
async function resetAllUserStatusesToOfflineOnStartup() {
    const client = await pool.connect();
    try {
        const query = `
            UPDATE public.profiles
            SET is_online = FALSE, last_seen_at = NOW()
            WHERE is_online = TRUE;
        `;
        await client.query(query);
        console.log(`DB: All previously online users reset to offline on server startup.`);
    } catch (err) {
        console.error('DB Error: Failed to reset all user statuses to offline on startup:', err);
    } finally {
        client.release();
    }
}


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
        console.time(`getLastMessagesForUserRooms_db_query_${userId}`); // Start DB query timer
        // Używamy CTE (Common Table Expression) z ROW_NUMBER() do znalezienia najnowszej wiadomości dla każdego pokoju.
        // Zmieniono klauzulę WHERE, aby używać nowych kolumn participant1_id i participant2_id.
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
                    m.participant1_id = $1 OR m.participant2_id = $1 -- Zoptymalizowane zapytanie
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
        console.timeEnd(`getLastMessagesForUserRooms_db_query_${userId}`); // End DB query timer
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
        // Wysyłamy wiadomość tylko jeśli klient jest w trybie OPEN i jego currentRoom zgadza się z targetRoomId
        if (client.readyState === WebSocket.OPEN && 
            clientData.currentRoom === roomId &&
            client !== excludeWs) { // Wykluczamy nadawcę, jeśli podano
            client.send(msg); 
            sentCount++;
        }
    }
    console.log(`Broadcasted message to room ${roomId}. Sent to ${sentCount} clients.`);
}

/**
 * Determines the other participant's ID in a 1-on-1 chat room.
 * Zakłada, że room ID jest sformatowane jako 'user1Id_user2Id', gdzie ID są posortowane alfabetycznie.
 * @param {string} currentUserId - The ID of the current user (sender).
 * @param {string} roomId - The ID of the chat room (np. 'userA_userB').
 * @returns {string|null} The ID of the other participant, lub null jeśli nie znaleziono/nieprawidłowy format room ID.
 */
function getOtherParticipantId(currentUserId, roomId) {
    // Sprawdzamy czy roomId jest prawidłowo sformatowane jako 'id1_id2'
    const parts = roomId.split('_');
    if (parts.length === 2) {
        // Jeśli pierwszy element to currentUserId, to drugi jest odbiorcą
        if (parts[0] === currentUserId) {
            return parts[1];
        }
        // Jeśli drugi element to currentUserId, to pierwszy jest odbiorcą
        if (parts[1] === currentUserId) {
            return parts[0];
        }
    }
    // Jeśli format nie pasuje lub currentUserId nie jest częścią roomId
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

    // Wysyłamy do wszystkich aktywnych połączeń nadawcy
    if (userIdToSockets.has(senderId)) {
        const senderSockets = userIdToSockets.get(senderId);
        for (const clientWs of senderSockets) {
            if (clientWs.readyState === WebSocket.OPEN) {
                clientWs.send(msg);
                sentCount++;
            }
        }
    }

    // Wysyłamy do wszystkich aktywnych połączeń odbiorcy (tylko jeśli odbiorca jest inny niż nadawca, aby uniknąć podwójnego wysłania)
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
 * @param {string} participant1Id - The ID of the first participant in the room.
 * @param {string} participant2Id - The ID of the second participant in the room.
 * @returns {Promise<string>} The 'created_at' timestamp of the inserted message.
 */
async function saveMessage(senderId, roomId, content, participant1Id, participant2Id) {
    // Zaktualizowane kolumny zgodnie ze schematem bazy danych
    const query = 'INSERT INTO messages (sender_id, room_id, content, participant1_id, participant2_id) VALUES ($1, $2, $3, $4, $5) RETURNING created_at';
    try {
        const res = await pool.query(query, [senderId, roomId, content, participant1Id, participant2Id]);
        console.log(`DB: Message saved for user ${senderId} in room ${roomId} with participants ${participant1Id} and ${participant2Id}.`);
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
