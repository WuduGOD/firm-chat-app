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

            else if (data.type === 'message' && userData) {
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
            else if (data.type === 'typing' && userData) {
                // Rozsyłaj wiadomość typing tylko do klientów w tym samym pokoju
                const typingMsg = {
                    type: 'typing',
                    username: userData.username,
                    room: userData.room // upewnij się, że room jest przekazywany dalej
                };
                broadcastToRoom(userData.room, JSON.stringify(typingMsg)); 
            }

            // Opcjonalnie: Obsługa wiadomości 'leave' (z front-endu)
            else if (data.type === 'leave' && userData) {
                clients.delete(ws); // Usuń połączenie WS
                // Nie ustawiaj na offline od razu, ponieważ on('close') to zrobi bardziej niezawodnie
                console.log(`Użytkownik ${userData.username} zgłosił opuszczenie pokoju ${userData.room || 'nieznany'}.`);
            }

            // ***** KLUCZOWY DODATEK: Obsługa żądania 'get_active_users' *****
            else if (data.type === 'get_active_users' && userData) {
                console.log(`Received request for active users from ${userData.username}.`);
                const activeUsers = await getOnlineStatusesFromDb(); 
                const formattedUsers = activeUsers.map(user => ({
                    id: user.id,
                    username: user.id, // Zakładamy, że ID jest nazwą użytkownika; dostosuj, jeśli masz inną kolumnę (np. user.name)
                    online: user.is_online
                }));
                ws.send(JSON.stringify({
                    type: 'active_users',
                    users: formattedUsers
                }));
                console.log(`Sent active users list to ${userData.username}.`);
            }

            else {
                console.warn('Unhandled message type or missing userData:', data);
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
            SELECT id, is_online, username, email -- Dodaj kolumny, których potrzebujesz na froncie do wyświetlenia nazwy
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

function broadcastToRoom(room, msg) {
    for (const [client, data] of clients.entries()) {
        if (client.readyState === WebSocket.OPEN && data.room === room) {
            client.send(msg);
        }
    }
}

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
    return new Date(); // Zwróć aktualną datę, nawet jeśli zapis się nie powiedzie
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