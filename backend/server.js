// server.js
import { WebSocketServer, WebSocket } from 'ws';
import pkg from 'pg';
import dotenv from 'dotenv';

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

// Test connection (your existing code)
pool.connect()
    .then(client => {
        console.log("Successfully connected to PostgreSQL!");
        client.release();
    })
    .catch(err => {
        console.error("Failed to connect to PostgreSQL on startup:", err.message);
    });

export const wss = new WebSocketServer({ noServer: true });

const clients = new Map(); // Map(ws, { userId, activeRoom }) - userId to Supabase ID
// NOWA STRUKTURA: rooms Map(roomName, Set(ws_clients_in_this_room))
const rooms = new Map(); // Map(string (roomName), Set<WebSocket>)

wss.on('connection', (ws) => {
    // let userData = null; // Stores { username, room } - to będzie bardziej dynamiczne teraz

    ws.on('message', async (message) => {
        const data = JSON.parse(message);
        console.log(`Received message from client: type=${data.type}, user=${data.username}, room=${data.room}`);

        switch (data.type) {
            case 'join':
                // Client wants to join a room
                const userId = data.name; // 'name' from frontend is userId
                const requestedRoom = data.room;

                // Update client's current active room
                clients.set(ws, { userId: userId, activeRoom: requestedRoom });

                // Add client to the requested room's set
                if (!rooms.has(requestedRoom)) {
                    rooms.set(requestedRoom, new Set());
                }
                rooms.get(requestedRoom).add(ws);
                console.log(`User ${userId} joined room: ${requestedRoom}. Current clients in room ${requestedRoom}: ${rooms.get(requestedRoom).size}`);

                // Send history for the joined room
                if (requestedRoom !== 'global') { // Don't send history for 'global' room
                    const history = await getLastMessages(requestedRoom);
                    ws.send(JSON.stringify({ type: 'history', room: requestedRoom, messages: history }));
                    console.log(`Sent history for room ${requestedRoom} to user ${userId}.`);
                }
                
                // If it's a global join (on connection init), send active users
                if (requestedRoom === 'global') {
                     sendActiveUsersToClient(ws);
                }
                // Broadcast 'online' status immediately after joining 'global' room
                if (requestedRoom === 'global') {
                    broadcastUserStatus(userId, true);
                }

                break;

            case 'leave':
                // Client wants to leave a room
                const userToLeave = data.name;
                const roomToLeave = data.room;

                if (rooms.has(roomToLeave)) {
                    rooms.get(roomToLeave).delete(ws);
                    if (rooms.get(roomToLeave).size === 0) {
                        rooms.delete(roomToLeave); // Clean up empty rooms
                    }
                    console.log(`User ${userToLeave} left room: ${roomToLeave}. Remaining clients in room ${roomToLeave}: ${rooms.has(roomToLeave) ? rooms.get(roomToLeave).size : 0}`);
                }
                // Also update client's activeRoom if they leave the one they were in
                const clientData = clients.get(ws);
                if (clientData && clientData.activeRoom === roomToLeave) {
                    clients.set(ws, { userId: clientData.userId, activeRoom: null }); // Or set to 'global'
                }
                break;

            case 'message':
                // Handle chat messages - now, only send to clients in the specific room
                const { username, text, room } = data;
                const insertedAt = await saveMessage(username, room, text); // Save to DB

                const msgToBroadcast = JSON.stringify({
                    type: 'message',
                    username,
                    text,
                    room, // Include room in broadcast for frontend filtering
                    inserted_at: insertedAt,
                });

                if (rooms.has(room)) {
                    rooms.get(room).forEach(client => {
                        if (client.readyState === WebSocket.OPEN) {
                            client.send(msgToBroadcast);
                        }
                    });
                    console.log(`Broadcasted message to room ${room}.`);
                } else {
                    console.warn(`Attempted to send message to non-existent room: ${room}`);
                }
                break;

            case 'typing':
                // Broadcast typing status only within the specific room
                const { username: typingUser, room: typingRoom } = data;
                const typingMsg = JSON.stringify({
                    type: 'typing',
                    username: typingUser,
                    room: typingRoom,
                });

                if (rooms.has(typingRoom)) {
                    rooms.get(typingRoom).forEach(client => {
                        if (client.readyState === WebSocket.OPEN && client !== ws) { // Don't send to self
                            client.send(typingMsg);
                        }
                    });
                }
                break;

            case 'status':
                // Status updates (online/offline) are typically global.
                // You already have a broadcastUserStatus function.
                broadcastUserStatus(data.user, data.online);
                break;
            
            case 'get_active_users':
                sendActiveUsersToClient(ws); // Send current active users list to the requesting client
                break;

            default:
                console.warn('Unknown message type received:', data.type);
        }
    });

    ws.on('close', () => {
        // When a client disconnects, remove them from all rooms they were in
        // and update their status to offline globally.
        const disconnectedClientData = clients.get(ws);
        if (disconnectedClientData) {
            console.log(`Client disconnected: ${disconnectedClientData.userId}`);
            // Remove from all rooms
            rooms.forEach((clientSet, roomName) => {
                if (clientSet.has(ws)) {
                    clientSet.delete(ws);
                    if (clientSet.size === 0) {
                        rooms.delete(roomName);
                    }
                    console.log(`Removed ${disconnectedClientData.userId} from room ${roomName}.`);
                }
            });
            clients.delete(ws); // Remove from main clients map

            // Broadcast offline status
            broadcastUserStatus(disconnectedClientData.userId, false);
        } else {
            console.log("Unknown client disconnected.");
        }
    });

    ws.on('error', (error) => {
        console.error('WebSocket Error on server:', error);
    });
});

// Helper function to broadcast user status (online/offline)
function broadcastUserStatus(userId, isOnline) {
    const msg = JSON.stringify({
        type: 'status',
        user: userId,
        online: isOnline,
    });

    // Send status to all clients that are in the 'global' room (or all clients, if you want)
    // For a status update, you probably want to send it to all connected clients,
    // as knowing status is usually a global concern.
    clients.forEach((clientData, clientWs) => {
        if (clientWs.readyState === WebSocket.OPEN) {
            clientWs.send(msg);
        }
    });
    console.log(`Broadcasted user ${userId} status: ${isOnline ? 'online' : 'offline'}.`);
}

// Function to send current active users to a newly connected client
function sendActiveUsersToClient(clientWs) {
    const activeUsers = Array.from(clients.values())
                             .filter(client => client.userId && client.activeRoom === 'global') // Only consider those who explicitly joined 'global' or are generally active
                             .map(client => ({ id: client.userId })); // Only send IDs for now

    const msg = JSON.stringify({
        type: 'active_users',
        users: activeUsers,
    });
    if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(msg);
        console.log(`Sent active users list to a client.`);
    }
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
    const query = 'SELECT username, text, inserted_at FROM messages WHERE room = $1 ORDER BY inserted_at ASC LIMIT $2'; // ASC for chronological order
    try {
        const res = await pool.query(query, [room, limit]);
        console.log(`DB: Fetched ${res.rows.length} messages for room ${room}.`);
        return res.rows;
    } catch (err) {
        console.error('DB Error: Failed to fetch last messages:', err);
    }
    return [];
}

// Ensure you also export the wss instance if this file is imported elsewhere
// export { wss }; // You already have this