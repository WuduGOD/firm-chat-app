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
    port: parseInt(process.env.DB_PORT || '5432'),
    ssl: { rejectUnauthorized: false }, // Ustawienie SSL, może być wymagane dla niektórych hostingów (np. Render.com)
    connectionTimeoutMillis: 5000,
    keepAlive: true
});

pool.on('error', (err) => {
    console.error('Serwer: Nieoczekiwany błąd w puli połączeń z bazą danych:', err);
    process.exit(-1);
});

async function testDbConnection() {
    try {
        const client = await pool.connect();
        console.log('Serwer: Połączono z bazą danych PostgreSQL!');
        client.release();
    } catch (err) {
        console.error('Serwer: Błąd połączenia z bazą danych:', err.message);
        process.exit(1); // Zakończ proces, jeśli nie można połączyć się z bazą danych
    }
}

testDbConnection();

// POPRAWKA: Dodano 'export' przed 'const wss'
export const wss = new WebSocketServer({ port: process.env.WS_PORT || 8080 });
console.log(`Serwer WebSocket uruchomiony na porcie ${process.env.WS_PORT || 8080}`);

// Mapa do przechowywania aktywnych połączeń WebSocket wraz z ID użytkowników
const clients = new Map(); // Map<WebSocket, { userId: string }>

// Funkcja do generowania unikalnego ID pokoju dla czatów 1-na-1
// Zapewnia, że room_id jest zawsze taki sam dla danej pary użytkowników, niezależnie od kolejności ID
function generateRoomId(userId1, userId2) {
    const sortedIds = [userId1, userId2].sort();
    return `${sortedIds[0]}_${sortedIds[1]}`;
}

// Funkcja rozsyłająca status użytkownika
async function broadcastUserStatus(userId, isOnline) {
    try {
        // Zaktualizuj status is_online w bazie danych
        await pool.query(
            'UPDATE profiles SET is_online = $1, last_seen_at = $2 WHERE id = $3',
            [isOnline, new Date().toISOString(), userId]
        );
        console.log(`Serwer: Zaktualizowano status w DB dla użytkownika ${userId}: ${isOnline ? 'online' : 'offline'}`);
    } catch (err) {
        console.error('Serwer: Błąd aktualizacji statusu użytkownika w DB:', err);
    }

    const statusUpdate = {
        type: 'userStatusUpdate',
        userId: userId,
        isOnline: isOnline
    };
    clients.forEach((clientWs) => {
        if (clientWs.readyState === WebSocket.OPEN) {
            clientWs.send(JSON.stringify(statusUpdate));
        }
    });
    console.log(`Serwer: Rozesłano status ${isOnline ? 'online' : 'offline'} dla użytkownika ${userId} do wszystkich klientów.`);
}

// Funkcja do wysyłania początkowej listy aktywnych użytkowników do nowo połączonego klienta
async function sendInitialOnlineUsers(ws) {
    const onlineUserIds = Array.from(clients.values()).map(data => data.userId);
    const initialOnlineUsersMsg = {
        type: 'initialOnlineUsers',
        users: onlineUserIds
    };
    if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(initialOnlineUsersMsg));
        console.log(`Serwer: Wysłano początkową listę ${onlineUserIds.length} aktywnych użytkowników do nowego klienta.`);
    }
}

wss.on('connection', async (ws) => {
    console.log('Serwer: Nowy klient podłączony.');

    let currentClientData = null; // Będziemy przechowywać dane klienta tutaj

    ws.on('message', async (message) => {
        const data = JSON.parse(message);
        const { type } = data;

        if (type === 'userConnected') {
            const { userId } = data;
            if (userId) {
                currentClientData = { userId: userId };
                clients.set(ws, currentClientData);
                console.log(`Serwer: Użytkownik ${userId} podłączony i zmapowany.`);
                broadcastUserStatus(userId, true); // Rozgłoś, że użytkownik jest online
                await sendInitialOnlineUsers(ws); // Wyślij listę online do nowego klienta
            } else {
                console.warn('Serwer: Otrzymano userConnected bez userId.');
            }
        } else if (type === 'chatMessage') {
            const { senderId, recipientId, content, timestamp } = data; // content zamiast message
            if (!senderId || !recipientId || !content || !timestamp) {
                console.error('Serwer: Niekompletne dane wiadomości (wymagane: senderId, recipientId, content, timestamp):', data);
                return;
            }

            // Generuj room_id dla czatu 1-na-1
            const roomId = generateRoomId(senderId, recipientId);

            console.log(`Serwer: Otrzymano wiadomość: od ${senderId} do ${recipientId} w pokoju ${roomId}: ${content}`);

            try {
                // Zapisz wiadomość do bazy danych
                const { rows, error } = await pool.query(
                    'INSERT INTO messages (room_id, sender_id, content, created_at) VALUES ($1, $2, $3, $4) RETURNING *',
                    [roomId, senderId, content, timestamp]
                );

                if (error) {
                    console.error('Serwer: Błąd zapisu wiadomości do bazy danych:', error);
                    return;
                }
                const newMessage = rows[0]; // Pobrana nowa wiadomość z bazy danych

                // Rozgłoś wiadomość do nadawcy i odbiorcy
                const messageToClients = {
                    type: 'message',
                    roomId: roomId, // Dodaj room_id do wiadomości
                    senderId: newMessage.sender_id, // Użyj danych z bazy
                    content: newMessage.content,    // Użyj danych z bazy
                    timestamp: newMessage.created_at // Użyj danych z bazy (created_at)
                };

                // Iteruj po wszystkich połączonych klientach
                clients.forEach((clientWs, clientData) => {
                    // Wyślij wiadomość tylko do nadawcy i do odbiorcy (w kontekście czatu 1-na-1)
                    if ((clientData.userId === senderId || clientData.userId === recipientId) &&
                        clientWs.readyState === WebSocket.OPEN) {
                        clientWs.send(JSON.stringify(messageToClients));
                    }
                });
                console.log(`Serwer: Wiadomość z pokoju ${roomId} rozesłana do uczestników.`);

            } catch (dbError) {
                console.error('Serwer: Błąd bazy danych podczas przetwarzania wiadomości:', dbError);
            }
        } else if (type === 'typing' || type === 'notTyping') {
            const { senderId, recipientId } = data;
            if (senderId && recipientId) {
                // Przekaż status pisania tylko do odbiorcy
                clients.forEach((clientWs, clientData) => {
                    if (clientData.userId === recipientId && clientWs.readyState === WebSocket.OPEN) {
                        clientWs.send(JSON.stringify({ type: data.type, senderId: senderId }));
                    }
                });
                console.log(`Serwer: Status pisania od ${senderId} do ${recipientId}: ${type}.`);
            }
        } else {
            console.warn('Serwer: Otrzymano nieznany typ wiadomości:', type, data);
        }
    });

    ws.on('close', () => {
        if (currentClientData && currentClientData.userId) {
            console.log(`Serwer: Klient rozłączony: ${currentClientData.userId}`);

            // Usuń klienta z mapy
            clients.delete(ws);

            // Rozgłoś status offline dla odłączonego użytkownika
            broadcastUserStatus(currentClientData.userId, false);
        } else {
            console.log("Serwer: Nieznany klient rozłączony (brak userId lub danych przypisanych).");
            clients.delete(ws); // Na wszelki wypadek usuń nawet bez userId
        }
    });

    ws.on('error', (error) => {
        console.error('Serwer: Błąd WebSocket:', error);
        // Zamknij połączenie w przypadku błędu, aby wyzwolić zdarzenie 'close' i ponowne połączenie
        if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
            ws.close();
        }
    });
});