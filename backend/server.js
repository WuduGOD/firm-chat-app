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
        SET is_online = FALSE, last_seen = NOW()
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

// Mapa przechowująca, które pokoje są aktywne (mają przynajmniej jednego użytkownika)
const activeRooms = new Map(); // roomId -> Set(userIds)


/**
 * Fetches the user's profile based on their ID from the database.
 * @param {string} userId - The ID of the user.
 * @returns {Promise<Object|null>} The user's profile object or null if not found.
 */
async function getUserProfileFromDb(userId) {
    const query = 'SELECT id, username, email, is_online, last_seen FROM profiles WHERE id = $1';
    try {
        const res = await pool.query(query, [userId]);
        if (res.rows.length > 0) {
            return res.rows[0];
        }
    } catch (err) {
        console.error('DB Error: Failed to fetch user profile:', err);
    }
    return null;
}

/**
 * Updates the user's online status in the database and broadcasts it.
 * @param {string} userId - The ID of the user.
 * @param {boolean} isOnline - True if online, false if offline.
 * @param {WebSocket} ws - The WebSocket connection of the user.
 */
async function updateUserStatusInDbAndBroadcast(userId, isOnline, ws) {
    const updateData = { is_online: isOnline };
    let lastSeenTimestamp = null;
    if (!isOnline) {
        lastSeenTimestamp = new Date().toISOString();
        updateData.last_seen = lastSeenTimestamp;
    }

    const query = `
        UPDATE profiles
        SET is_online = $1, last_seen = $2
        WHERE id = $3
        RETURNING is_online, last_seen;
    `;
    try {
        const res = await pool.query(query, [isOnline, lastSeenTimestamp, userId]);
        if (res.rows.length > 0) {
            const updatedProfile = res.rows[0];
            console.log(`DB: User ${userId} status updated to ${updatedProfile.is_online ? 'online' : 'offline'}.`);

            // Broadcast status to all connected clients
            const statusMessage = JSON.stringify({
                type: 'status',
                user: userId,
                online: updatedProfile.is_online,
                last_seen: updatedProfile.last_seen
            });
            clients.forEach((clientInfo, clientWs) => {
                if (clientWs.readyState === WebSocket.OPEN) {
                    clientWs.send(statusMessage);
                }
            });
        }
    } catch (err) {
        console.error('DB Error: Failed to update user status:', err);
    }
}

/**
 * Saves a message to the database.
 * @param {string} senderId - The ID of the sender.
 * @param {string} content - The message content.
 * @param {string} roomId - The ID of the room.
 * @returns {Promise<string>} The created_at timestamp of the saved message.
 */
async function saveMessage(senderId, content, roomId) {
    const query = 'INSERT INTO messages(sender_id, content, room_id) VALUES($1, $2, $3) RETURNING created_at';
    try {
        const res = await pool.query(query, [senderId, content, roomId]);
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
            room: row.room_id
        }));
    } catch (err) {
        console.error('DB Error: Failed to fetch last messages:', err);
        return [];
    }
}

/**
 * Fetches the last message for multiple rooms.
 * @param {Array<string>} roomIds - An array of room IDs.
 * @returns {Promise<Object>} A map of roomId to its last message.
 */
async function getLastMessagesForRooms(roomIds) {
    if (roomIds.length === 0) {
        return {};
    }
    // Użyj unnest do rozpakowania tablicy roomIds w zapytaniu SQL
    const query = `
        SELECT DISTINCT ON (room_id) room_id, sender_id, content, created_at
        FROM messages
        WHERE room_id = ANY($1::uuid[])
        ORDER BY room_id, created_at DESC;
    `;
    try {
        const res = await pool.query(query, [roomIds]);
        const result = {};
        res.rows.forEach(row => {
            result[row.room_id] = {
                username: row.sender_id,
                text: row.content,
                inserted_at: row.created_at,
                room: row.room_id
            };
        });
        console.log(`DB: Fetched last messages for ${Object.keys(result).length} rooms.`);
        return result;
    } catch (err) {
        console.error('DB Error: Failed to fetch last messages for multiple rooms:', err);
        return {};
    }
}


wss.on('connection', async (ws, req) => {
    const userId = req.url.split('?userId=')[1];
    if (!userId) {
        ws.close(1008, 'User ID not provided');
        return;
    }

    clients.set(ws, { userId, currentRoom: null }); // Domyślnie brak pokoju

    console.log(`Client connected: ${userId}. Total clients: ${clients.size}`);

    // Update user status to online in DB and broadcast
    await updateUserStatusInDbAndBroadcast(userId, true, ws);

    ws.on('message', async (message) => {
        try {
            const parsedMessage = JSON.parse(message);
            console.log(`Received message from ${userId}:`, parsedMessage.type);

            switch (parsedMessage.type) {
                case 'join':
                    const roomToJoin = parsedMessage.room;
                    clients.get(ws).currentRoom = roomToJoin; // Ustaw aktualny pokój dla klienta

                    // Dodaj użytkownika do aktywnego pokoju
                    if (!activeRooms.has(roomToJoin)) {
                        activeRooms.set(roomToJoin, new Set());
                    }
                    activeRooms.get(roomToJoin).add(userId);
                    console.log(`User ${userId} joined room ${roomToJoin}. Active users in room ${roomToJoin}: ${activeRooms.get(roomToJoin).size}`);

                    // Jeśli to nie jest pokój 'global', wyślij historię
                    if (roomToJoin !== 'global') {
                        const history = await getLastMessages(roomToJoin);
                        ws.send(JSON.stringify({ type: 'history', messages: history, room: roomToJoin }));
                        console.log(`Sent history for room ${roomToJoin} to user ${userId}.`);
                    }
                    break;

                case 'leave':
                    const roomToLeave = parsedMessage.room;
                    if (activeRooms.has(roomToLeave)) {
                        activeRooms.get(roomToLeave).delete(userId);
                        if (activeRooms.get(roomToLeave).size === 0) {
                            activeRooms.delete(roomToLeave);
                        }
                        console.log(`User ${userId} left room ${roomToLeave}. Active users in room ${roomToLeave}: ${activeRooms.has(roomToLeave) ? activeRooms.get(roomToLeave).size : 0}`);
                    }
                    // Opcjonalnie: zresetuj currentRoom na null lub 'global' jeśli opuszcza aktywny czat
                    if (clients.get(ws).currentRoom === roomToLeave) {
                        clients.get(ws).currentRoom = null; 
                    }
                    break;

                case 'message':
                    const { username, text, room } = parsedMessage;
                    const inserted_at = await saveMessage(username, text, room); // Zapisz wiadomość do DB
                    
                    // Broadcast message to all clients in the same room
                    clients.forEach((clientInfo, clientWs) => {
                        if (clientWs.readyState === WebSocket.OPEN && clientInfo.currentRoom === room) {
                            clientWs.send(JSON.stringify({
                                type: 'message',
                                username,
                                text,
                                room,
                                inserted_at // Dodaj timestamp z bazy danych
                            }));
                        }
                    });
                    break;

                case 'typing':
                    const { username: typingUsername, room: typingRoom } = parsedMessage;
                    // Broadcast typing status only to other clients in the same room
                    clients.forEach((clientInfo, clientWs) => {
                        if (clientWs.readyState === WebSocket.OPEN && clientInfo.currentRoom === typingRoom && clientInfo.userId !== typingUsername) {
                            clientWs.send(JSON.stringify({
                                type: 'typing',
                                userId: typingUsername,
                                roomId: typingRoom
                            }));
                        }
                    });
                    break;

                case 'status':
                    // Status updates are handled by updateUserStatusInDbAndBroadcast on connection/disconnection
                    // This case might be used for manual status changes if implemented on frontend
                    const { user, online, last_seen } = parsedMessage;
                    await updateUserStatusInDbAndBroadcast(user, online, ws);
                    break;

                case 'get_active_users':
                    const activeUserIds = Array.from(clients.values())
                                            .filter(info => info.currentRoom === 'global' || info.currentRoom !== null) // Consider users in any room as active
                                            .map(info => info.userId);
                    
                    const uniqueActiveUserIds = [...new Set(activeUserIds)];
                    
                    const activeUsersProfiles = await Promise.all(
                        uniqueActiveUserIds.map(id => getUserProfileFromDb(id))
                    );
                    
                    // Filter out null profiles and attach online status from DB
                    const currentActiveUsers = activeUsersProfiles.filter(p => p !== null).map(p => ({
                        id: p.id,
                        username: p.username,
                        email: p.email,
                        online: p.is_online,
                        last_seen: p.last_seen
                    }));

                    ws.send(JSON.stringify({ type: 'active_users', users: currentActiveUsers }));
                    console.log(`Sent active users list to ${userId}.`);
                    break;

                case 'get_last_messages_for_user_rooms':
                    const requestingUserId = parsedMessage.userId;
                    const userRoomsQuery = `
                        SELECT room_id FROM room_participants WHERE user_id = $1;
                    `;
                    const userRoomsRes = await pool.query(userRoomsQuery, [requestingUserId]);
                    const userRoomIds = userRoomsRes.rows.map(row => row.room_id);
                    const lastMessagesMap = await getLastMessagesForRooms(userRoomIds);
                    ws.send(JSON.stringify({ type: 'last_messages_for_user_rooms', messages: lastMessagesMap }));
                    console.log(`Sent last messages for user ${requestingUserId}'s rooms.`);
                    break;

                case 'friendRequest':
                    // Przekaż zaproszenie do docelowego użytkownika
                    const targetUserId = parsedMessage.toUserId;
                    clients.forEach((clientInfo, clientWs) => {
                        if (clientWs.readyState === WebSocket.OPEN && clientInfo.userId === targetUserId) {
                            clientWs.send(JSON.stringify({
                                type: 'friendRequest',
                                fromEmail: parsedMessage.fromEmail,
                                fromUserId: parsedMessage.fromUserId
                            }));
                            console.log(`Forwarded friend request from ${parsedMessage.fromEmail} to ${targetUserId}.`);
                        }
                    });
                    break;

                case 'friendRequestAccepted':
                    // Przekaż informację o zaakceptowaniu zaproszenia do nadawcy zaproszenia
                    const acceptedByUserId = parsedMessage.fromUserId; // To jest ID użytkownika, który zaakceptował
                    const originalSenderId = parsedMessage.otherUserId; // To jest ID użytkownika, który wysłał zaproszenie (teraz jest "drugim" użytkownikiem)
                    clients.forEach((clientInfo, clientWs) => {
                        if (clientWs.readyState === WebSocket.OPEN && clientInfo.userId === originalSenderId) {
                            clientWs.send(JSON.stringify({
                                type: 'friendRequestAccepted',
                                acceptedByEmail: parsedMessage.acceptedByEmail,
                                newRoomId: parsedMessage.newRoomId,
                                fromUserId: acceptedByUserId // Przekaż ID użytkownika, który zaakceptował
                            }));
                            console.log(`Forwarded friend request accepted notification to ${originalSenderId}.`);
                        }
                    });
                    break;

                case 'friendRequestRejected':
                    // Przekaż informację o odrzuceniu zaproszenia do nadawcy zaproszenia
                    const rejectedByUserId = parsedMessage.fromUserId; // To jest ID użytkownika, który odrzucił
                    const originalRejectedSenderId = parsedMessage.toUserId; // To jest ID użytkownika, który wysłał zaproszenie (teraz jest "drugim" użytkownikiem)
                    clients.forEach((clientInfo, clientWs) => {
                        if (clientWs.readyState === WebSocket.OPEN && clientInfo.userId === originalRejectedSenderId) {
                            clientWs.send(JSON.stringify({
                                type: 'friendRequestRejected',
                                rejectedByEmail: parsedMessage.rejectedByEmail,
                                fromUserId: rejectedByUserId // Przekaż ID użytkownika, który odrzucił
                            }));
                            console.log(`Forwarded friend request rejected notification to ${originalRejectedSenderId}.`);
                        }
                    });
                    break;

                case 'newConversation':
                    // Przekaż informację o nowej konwersacji do konkretnego użytkownika
                    const userToNotify = parsedMessage.userId;
                    clients.forEach((clientInfo, clientWs) => {
                        if (clientWs.readyState === WebSocket.OPEN && clientInfo.userId === userToNotify) {
                            clientWs.send(JSON.stringify({ type: 'newConversation' }));
                            console.log(`Notified user ${userToNotify} about new conversation.`);
                        }
                    });
                    break;

                default:
                    console.warn('Unknown message type:', parsedMessage.type);
            }
        } catch (error) {
            console.error('Error parsing or handling message:', error);
        }
    });

    ws.on('close', async (code, reason) => {
        console.log(`Client disconnected: ${userId}. Code: ${code}, Reason: ${reason.toString()}`);
        clients.delete(ws);

        // Usuń użytkownika ze wszystkich aktywnych pokoi
        activeRooms.forEach((usersInRoom, roomId) => {
            if (usersInRoom.has(userId)) {
                usersInRoom.delete(userId);
                if (usersInRoom.size === 0) {
                    activeRooms.delete(roomId);
                }
            }
        });
        console.log(`User ${userId} removed from all active rooms.`);

        // Update user status to offline in DB and broadcast
        await updateUserStatusInDbAndBroadcast(userId, false, ws);
        console.log(`Total clients remaining: ${clients.size}`);
    });

    ws.on('error', (error) => {
        console.error(`WebSocket error for client ${userId}:`, error);
    });
});
