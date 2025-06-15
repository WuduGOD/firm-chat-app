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

export const wss = new WebSocketServer({ noServer: true });

// Usuwamy globalną mapę userStatus, bo będziemy polegać na bazie danych
// const userStatus = new Map(); // NIE JEST JUŻ POTRZEBNA

const clients = new Map(); // Map(ws, { username, room })

wss.on('connection', (ws) => {
    let userData = null; // Przechowuje { username, room } dla tego połączenia WS

    ws.on('message', async (message) => {
        try {
            const data = JSON.parse(message);
            console.log('Odebrana wiadomość przez WebSocket:', data);

            if (data.type === 'join') {
                // Zapisujemy dane użytkownika dla tego połączenia WS
                userData = { username: data.name, room: data.room };
                clients.set(ws, userData);

                // 1. Zaktualizuj status w bazie danych na online
                await updateProfileStatus(userData.username, true);
                console.log(`Użytkownik ${userData.username} dołączył do pokoju ${userData.room}. Zaktualizowano status w DB.`);

                // 2. Pobierz aktualne statusy WS od WSów lub z bazy (teraz z bazy)
                const currentStatuses = await getOnlineStatusesFromDb(); // Pobierz z bazy
                
                // 3. Wysyłanie początkowych statusów do NOWO POŁĄCZONEGO klienta
                currentStatuses.forEach(user => {
                    if (user.id !== userData.username) { // Nie wysyłaj sobie własnego statusu
                        ws.send(JSON.stringify({
                            type: 'status',
                            user: user.id,
                            online: user.is_online,
                        }));
                    }
                });

                // 4. Następnie wyślij historię wiadomości
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
                console.log(`Wysłano historię do pokoju ${data.room}:`, history.length, 'wiadomości.');

                // 5. Rozgłoś, że ten użytkownik jest online
                broadcastUserStatus(userData.username, true);
            }

            if (data.type === 'message' && userData) {
                const inserted_at = await saveMessage(userData.username, userData.room, data.text);
                const msgObj = {
                    type: 'message',
                    username: userData.username,
                    text: data.text,
                    inserted_at,
                    room: userData.room,
                };
                broadcastToRoom(userData.room, JSON.stringify(msgObj));
            }
            // Nowa obsługa wiadomości typing
            if (data.type === 'typing' && userData) {
                // Rozsyłaj wiadomość typing tylko do klientów w tym samym pokoju
                const typingMsg = {
                    type: 'typing',
                    username: userData.username,
                    room: userData.room // upewnij się, że room jest przekazywany dalej
                };
                broadcastToRoom(userData.room, JSON.stringify(typingMsg)); // Zmieniono na broadcastToRoom
            }

            // Opcjonalnie: Obsługa wiadomości 'leave' (z front-endu)
            if (data.type === 'leave' && userData) {
                clients.delete(ws); // Usuń połączenie WS
                // Nie ustawiaj na offline od razu, ponieważ on('close') to zrobi bardziej niezawodnie
                console.log(`Użytkownik ${userData.username} zgłosił opuszczenie pokoju ${userData.room || 'nieznany'}.`);
            }


        } catch (err) {
            console.error('Błąd przy odbiorze wiadomości przez WebSocket:', err);
        }
    });

    ws.on('close', async () => {
        if (userData) {
            clients.delete(ws);
            // Zaktualizuj status w bazie danych na offline
            await updateProfileStatus(userData.username, false);
            console.log(`Użytkownik ${userData.username} rozłączył się. Zaktualizowano status w DB.`);

            // Rozgłoś, że ten użytkownik jest offline
            broadcastUserStatus(userData.username, false);
        }
    });

    ws.on('error', (error) => {
        console.error('Błąd WebSocket dla klienta:', error);
        // Obsługa błędów, która może również prowadzić do rozłączenia
    });
});

// ---------------------- Funkcje pomocnicze --------------------------

// Funkcja do aktualizacji statusu użytkownika w bazie danych
async function updateProfileStatus(userId, isOnline) {
    const client = await pool.connect();
    try {
        const query = `
            UPDATE public.profiles
            SET is_online = $1, last_seen_at = NOW()
            WHERE id = $2;
        `;
        await client.query(query, [isOnline, userId]);
    } catch (err) {
        console.error(`Błąd aktualizacji statusu użytkownika ${userId} w DB:`, err);
    } finally {
        client.release();
    }
}

// Funkcja do pobierania statusów online z bazy danych
async function getOnlineStatusesFromDb() {
    const client = await pool.connect();
    try {
        const query = `
            SELECT id, is_online
            FROM public.profiles
            WHERE is_online = TRUE;
        `;
        const res = await client.query(query);
        return res.rows;
    } catch (err) {
        console.error('Błąd pobierania statusów online z DB:', err);
        return [];
    } finally {
        client.release();
    }
}

// Pozostałe funkcje (broadcastToRoom, broadcastUserStatus, saveMessage, getLastMessages)
// pozostają bez zmian lub z minimalnymi korektami jak w server.js powyżej.

function broadcastToRoom(room, msg) {
    for (const [client, data] of clients.entries()) {
        if (client.readyState === WebSocket.OPEN && data.room === room) {
            client.send(msg);
        }
    }
}

// UWAGA: ta funkcja teraz rozgłasza statusy pobrane z bazy/utrwalone w mapie clients.
// Upewnij się, że 'user' w wiadomości 'status' to ID użytkownika.
function broadcastUserStatus(userId, isOnline) {
    const msg = JSON.stringify({
        type: 'status',
        user: userId, // Używamy userId
        online: isOnline,
    });

    // Emitujemy status do wszystkich połączonych klientów
    for (const client of clients.keys()) {
        if (client.readyState === WebSocket.OPEN) {
            client.send(msg);
        }
    }
}

async function saveMessage(username, room, text) {
    const query = 'INSERT INTO messages (username, room, text) VALUES ($1, $2, $3) RETURNING inserted_at';
    try {
        const res = await pool.query(query, [username, room, text]);
        return res.rows[0].inserted_at;
    } catch (err) {
        console.error('Błąd zapisu wiadomości:', err);
    }
    return new Date();
}

async function getLastMessages(room, limit = 50) {
    const query = 'SELECT username, text, inserted_at FROM messages WHERE room = $1 ORDER BY inserted_at DESC LIMIT $2';
    try {
        const res = await pool.query(query, [room, limit]);
        return res.rows.reverse();
    } catch (err) {
        console.error('Błąd pobierania historii:', err);
        return [];
    }
}