// backend/server.js
import { WebSocketServer, WebSocket } from 'ws';
import pkg from 'pg';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const { Pool } = pkg;

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

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
    console.error("SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not defined in .env. Supabase Realtime will not function.");
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);
console.log("Supabase client initialized for server-side Realtime.");

pool.connect()
    .then(async client => {
        console.log("Successfully connected to PostgreSQL!");
        client.release();
        await resetAllUserStatusesToOfflineOnStartup(); 
    })
    .catch(err => {
        console.error("Failed to connect to PostgreSQL on startup:", err.message);
    });

export const wss = new WebSocketServer({ noServer: true });

const clients = new Map(); 
const userIdToSockets = new Map(); 

wss.on('connection', (ws) => {
    let userData = { userId: null, currentRoom: null }; 
    clients.set(ws, userData);

    ws.on('message', async (message) => {
        try {
            const data = JSON.parse(message);
            console.log('Parsed incoming WebSocket data:', data);

            if (data.type === 'join') {
                userData.userId = data.name; 
                userData.currentRoom = data.room;
                clients.set(ws, userData);

                if (!userIdToSockets.has(userData.userId)) {
                    userIdToSockets.set(userData.userId, new Set());
                }
                userIdToSockets.get(userData.userId).add(ws);
                console.log(`User ${userData.userId} now has ${userIdToSockets.get(userData.userId).size} active connections.`);
                console.log(`User ${userData.userId} joined room ${userData.currentRoom}.`);

                // ### POPRAWKA: Usunięto stąd logikę wysyłania wiadomości. ###
                // Dołączenie do pokoju nie powinno generować wiadomości.
                
            } else if (data.type === 'message' && userData.userId) {
                const targetRoom = data.room;
                console.log(`Processing MESSAGE type for room: ${targetRoom} from user: ${userData.userId}.`);

                const isGroupChat = !targetRoom.includes('_');
                let participant1Id = null;
                let participant2Id = null;

                if (!isGroupChat) {
                    const participants = targetRoom.split('_').sort();
                    participant1Id = participants[0];
                    participant2Id = participants[1];
                }

                const created_at = await saveMessage(userData.userId, targetRoom, data.text, participant1Id, participant2Id);
                const msgObj = {
                    type: 'message',
                    username: userData.userId,
                    text: data.text,
                    inserted_at: created_at,
                    room: targetRoom,
                };

                if (isGroupChat) {
                    console.log(`Broadcasting to group: ${targetRoom}`);
                    const { data: members, error } = await supabase.from('group_members').select('user_id').eq('group_id', targetRoom);
                    if (error) {
                        console.error('DB Error: Failed to get group members:', error);
                        return;
                    }
                    const memberIds = members.map(m => m.user_id);
                    memberIds.forEach(memberId => {
                        broadcastToUser(memberId, JSON.stringify(msgObj));
                    });
                } else {
                    const recipientId = getOtherParticipantId(userData.userId, targetRoom);
                    if (recipientId) {
                        broadcastToParticipants(userData.userId, recipientId, JSON.stringify(msgObj));
                    }
                }
            }
            // ... reszta kodu pozostaje bez zmian ...
            else if (data.type === 'typing' && userData.userId) { 
                const typingMsg = {
                    type: 'typing',
                    username: userData.userId,
                    room: data.room 
                };
                broadcastToRoom(data.room, JSON.stringify(typingMsg), ws);

                console.log(`Broadcasted typing status for user ${userData.userId} in room ${data.room}.`);
            }
            else if (data.type === 'leave' && userData.userId) { 
                if (data.room && data.room === userData.currentRoom) {
                    userData.currentRoom = null;
                    clients.set(ws, userData);
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
            else if (data.type === 'get_last_messages_for_user_rooms' && userData.userId) {
                console.time(`getLastMessagesForUserRooms_total_time_${userData.userId}`);
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
                console.timeEnd(`getLastMessagesForUserRooms_total_time_${userData.userId}`);
            }
            else if (data.type === 'status') {
                const userId = data.user;
                const isOnline = data.online;
                
                if (!userData.userId) {
                    userData.userId = userId;
                    clients.set(ws, userData);
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
            clients.delete(ws);
        }
    });

    ws.on('error', (error) => {
        console.error('WebSocket error for client:', error);
    });
});

// Reszta pliku (nasłuchiwanie Supabase, funkcje pomocnicze) pozostaje bez zmian
// ...

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
        },
        (payload) => {
            console.log('[Supabase Realtime - INSERT] New friend request received:', payload.new);
            const newRequest = payload.new;
            if (newRequest.status === 'pending') {
                broadcastToUser(newRequest.friend_id, JSON.stringify({
                    type: 'new_friend_request',
                    sender_id: newRequest.user_id,
                    request_id: newRequest.id
                }));
                console.log(`[Supabase Realtime] Sent new_friend_request notification to ${newRequest.friend_id} from ${newRequest.user_id}.`);
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
            table: 'friends',
        },
        (payload) => {
            console.log('[Supabase Realtime - UPDATE] Friend request status updated:', payload.new);
            const updatedRequest = payload.new;
            if (updatedRequest.status === 'accepted' || updatedRequest.status === 'declined') {
                broadcastToUser(updatedRequest.user_id, JSON.stringify({
                    type: 'friend_request_status_update',
                    request_id: updatedRequest.id,
                    receiver_id: updatedRequest.friend_id,
                    status: updatedRequest.status
                }));
                console.log(`[Supabase Realtime] Sent friend_request_status_update notification to ${updatedRequest.user_id} for request ${updatedRequest.id} (status: ${updatedRequest.status}).`);
            }
        }
    )
    .subscribe();
console.log("[Supabase Realtime] Subscribed to 'friend_requests_status_channel'.");


// ---------------------- Helper functions --------------------------

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

async function getLastMessagesForUserRooms(userId) {
    const client = await pool.connect();
    try {
        console.time(`getLastMessagesForUserRooms_db_query_${userId}`);
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
                    m.participant1_id = $1 OR m.participant2_id = $1
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
        console.timeEnd(`getLastMessagesForUserRooms_db_query_${userId}`);
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


async function saveMessage(senderId, roomId, content, participant1Id, participant2Id) {
    const query = 'INSERT INTO messages (sender_id, room_id, content, participant1_id, participant2_id) VALUES ($1, $2, $3, $4, $5) RETURNING created_at';
    try {
        const res = await pool.query(query, [senderId, roomId, content, participant1Id, participant2Id]);
        console.log(`DB: Message saved for user ${senderId} in room ${roomId} with participants ${participant1Id} and ${participant2Id}.`);
        return res.rows[0].created_at;
    } catch (err) {
        console.error('DB Error: Failed to save message:', err);
    }
    return new Date().toISOString();
}

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