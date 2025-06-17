// server.js
// Importy niezbędnych modułów:
// WebSocketServer i WebSocket z biblioteki 'ws' do obsługi połączeń WebSocket.
// 'pg' do interakcji z bazą danych PostgreSQL.
// 'dotenv' do ładowania zmiennych środowiskowych z pliku .env.
import { WebSocketServer, WebSocket } from 'ws';
import pkg from 'pg';
import dotenv from 'dotenv';

// Konfiguracja dotenv do ładowania zmiennych środowiskowych
dotenv.config();

// Destrukturyzacja modułu 'pg' do uzyskania klasy Pool
const { Pool } = pkg;

// Konfiguracja połączenia z bazą danych PostgreSQL
// Dane do połączenia są pobierane ze zmiennych środowiskowych
const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASS,
    port: parseInt(process.env.DB_PORT || '5432'), // Domyślny port 5432, jeśli nie ustawiono
    ssl: { rejectUnauthorized: false }, // Ustawienie SSL, może być wymagane dla niektórych hostingów (np. Render.com)
    connectionTimeoutMillis: 5000, // Limit czasu na nawiązanie połączenia
    keepAlive: true // Utrzymuj połączenie aktywne
});

// Testowanie połączenia z bazą danych na starcie serwera
pool.connect()
    .then(client => {
        console.log('Serwer: Połączono z bazą danych PostgreSQL!');
        client.release(); // Zwolnij klienta z powrotem do puli
    })
    .catch(err => {
        console.error('Serwer: Błąd połączenia z bazą danych:', err.message);
        process.exit(1); // Zakończ proces serwera, jeśli nie można połączyć się z bazą danych
    });

// Mapowanie klientów WebSocket na ich userId
// { WebSocket: { userId: 'uuid', lastSeen: Date } }
const clients = new Map();

// Mapowanie pokojów czatu na zestawy aktywnych połączeń WebSocket w tym pokoju
// { 'room_id': Set<WebSocket> }
const rooms = new Map();

// Inicjalizacja serwera WebSocket na porcie 8080 (lub innym z ENV)
const PORT = process.env.PORT || 8080;
const wss = new WebSocketServer({ noServer: true }); // Deklaracja wss

wss.on('listening', () => {
    console.log(`Serwer WebSocket nasłuchuje na porcie ${PORT}`);
});

// Funkcja pomocnicza do generowania room_id
function generateRoomId(userId1, userId2) {
    const sortedIds = [userId1, userId2].sort();
    return `${sortedIds[0]}_${sortedIds[1]}`;
}

/**
 * Rozgłasza aktualną listę aktywnych użytkowników do wszystkich podłączonych klientów.
 * Używane przy zmianie statusu (online/offline) lub do początkowego wysłania listy.
 */
function broadcastActiveUsersList() {
    const activeUserIds = Array.from(clients.values())
                               .map(clientData => clientData.userId)
                               .filter(id => id !== undefined); // Filtruj undefined

    console.log('Serwer: Rozgłaszanie listy aktywnych użytkowników:', activeUserIds);
    wss.clients.forEach(wsClient => {
        if (wsClient.readyState === WebSocket.OPEN && clients.has(wsClient)) {
            wsClient.send(JSON.stringify({ type: 'user_list', users: activeUserIds }));
        }
    });
}

/**
 * Rozgłasza zmianę statusu pojedynczego użytkownika (online/offline) do wszystkich klientów.
 * @param {string} userId ID użytkownika, którego status się zmienił.
 * @param {boolean} isOnline True, jeśli użytkownik jest online, false jeśli offline.
 */
function broadcastUserStatus(userId, isOnline) {
    console.log(`Serwer: Rozgłaszanie statusu użytkownika ${userId}: ${isOnline ? 'online' : 'offline'}`);
    wss.clients.forEach(wsClient => {
        if (wsClient.readyState === WebSocket.OPEN && clients.has(wsClient)) {
            wsClient.send(JSON.stringify({ type: 'user_status', userId: userId, status: isOnline ? 'online' : 'offline' }));
        }
    });
    // Po zmianie statusu, zawsze rozgłaszamy też pełną listę, aby upewnić się, że wszyscy mają aktualną.
    broadcastActiveUsersList();
}


// Obsługa nowych połączeń WebSocket
wss.on('connection', (ws) => {
    console.log('Serwer: Nowe połączenie WebSocket.');

    // Kiedy otrzymamy wiadomość od klienta
    ws.on('message', async (message) => {
        try {
            const data = JSON.parse(message.toString());
            console.log('Serwer: Otrzymano wiadomość od klienta:', data); // Loguj każdą odebraną wiadomość

            switch (data.type) {
                case 'auth':
                    const userId = data.userId;
                    if (userId) {
                        clients.set(ws, { userId: userId, lastSeen: new Date() }); // Zapisz userId i czas
                        console.log(`Serwer: Klient ${userId} uwierzytelniony.`);
                        // Wyślij potwierdzenie autoryzacji do klienta, który się właśnie połączył
                        ws.send(JSON.stringify({ type: 'auth_success', userId: userId }));
                        console.log(`Serwer: Wysłano 'auth_success' do ${userId}`);

                        // Rozgłoś status online do wszystkich pozostałych klientów
                        broadcastUserStatus(userId, true);
                    } else {
                        ws.send(JSON.stringify({ type: 'error', message: 'Brak userId w wiadomości autoryzacyjnej.' }));
                        console.warn('Serwer: Otrzymano wiadomość auth bez userId.');
                    }
                    break;

                case 'chat_message':
                    const { senderId, receiverId, content } = data;
                    console.log(`Serwer: Otrzymano wiadomość czatu: od ${senderId} do ${receiverId}, Treść: "${content}"`);

                    try {
                        // Zapisz wiadomość w bazie danych
                        const { data: dbData, error } = await pool.query(
                            'INSERT INTO messages (sender_id, receiver_id, content) VALUES ($1, $2, $3) RETURNING *',
                            [senderId, receiverId, content]
                        );

                        if (error) throw error;

                        const savedMessage = dbData.rows[0];
                        console.log('Serwer: Wiadomość zapisana w DB:', savedMessage);

                        // Rozgłoś wiadomość do odpowiednich klientów
                        const roomId = generateRoomId(senderId, receiverId);
                        const clientsInRoom = rooms.get(roomId);

                        if (clientsInRoom) {
                            console.log(`Serwer: Rozgłaszanie wiadomości w pokoju ${roomId} do ${clientsInRoom.size} klientów.`); // POPRAWIONY log
                            clientsInRoom.forEach(clientWs => {
                                if (clientWs.readyState === WebSocket.OPEN) {
                                    clientWs.send(JSON.stringify({
                                        type: 'chat_message',
                                        senderId: savedMessage.sender_id,
                                        receiverId: savedMessage.receiver_id,
                                        content: savedMessage.content,
                                        created_at: savedMessage.created_at // Użyj timestamp z bazy danych
                                    }));
                                }
                            });
                        } else {
                            console.warn(`Serwer: Pokój ${roomId} nie istnieje lub jest pusty. Wiadomość nie została rozgłoszona. To może się zdarzyć, jeśli użytkownicy nie dołączyli do pokoju.`);
                            // Jeśli pokój nie istnieje, nadal wyślij wiadomość bezpośrednio do nadawcy i odbiorcy, jeśli są online
                            // To jest fallback, główna logika powinna polegać na dołączaniu do pokoju
                            wss.clients.forEach(clientWs => {
                                const clientInfo = clients.get(clientWs);
                                if (clientInfo && (clientInfo.userId === senderId || clientInfo.userId === receiverId)) {
                                    if (clientWs.readyState === WebSocket.OPEN) {
                                        clientWs.send(JSON.stringify({
                                            type: 'chat_message',
                                            senderId: savedMessage.sender_id,
                                            receiverId: savedMessage.receiver_id,
                                            content: savedMessage.content,
                                            created_at: savedMessage.created_at
                                        }));
                                    }
                                }
                            });
                        }

                    } catch (dbError) {
                        console.error('Serwer: Błąd podczas zapisywania wiadomości w bazie danych:', dbError.message);
                        ws.send(JSON.stringify({ type: 'error', message: 'Błąd serwera podczas zapisywania wiadomości.' }));
                    }
                    break;

                case 'typing_status':
                    const { senderId: typingSenderId, receiverId: typingReceiverId, isTyping } = data;
                    console.log(`Serwer: Status pisania od ${typingSenderId} do ${typingReceiverId}: ${isTyping}`);
                    const typingRoomId = generateRoomId(typingSenderId, typingReceiverId);
                    const typingClientsInRoom = rooms.get(typingRoomId);

                    if (typingClientsInRoom) {
                        typingClientsInRoom.forEach(clientWs => {
                            const clientInfo = clients.get(clientWs);
                            // Wysyłamy status pisania tylko do odbiorcy (nie do samego nadawcy)
                            if (clientWs.readyState === WebSocket.OPEN && clientInfo && clientInfo.userId === typingReceiverId) {
                                clientWs.send(JSON.stringify({
                                    type: 'typing_status',
                                    senderId: typingSenderId,
                                    receiverId: typingReceiverId,
                                    isTyping: isTyping
                                }));
                            }
                        });
                    }
                    break;

                case 'join_room':
                    const { roomId: joinRoomId } = data;
                    if (!rooms.has(joinRoomId)) {
                        rooms.set(joinRoomId, new Set());
                        console.log(`Serwer: Utworzono nowy pokój: ${joinRoomId}`);
                    }
                    rooms.get(joinRoomId).add(ws);
                    console.log(`Serwer: Klient dołączył do pokoju: ${joinRoomId}. Aktywni w pokoju: ${rooms.get(joinRoomId).size}`);
                    break;

                case 'leave_room':
                    const { roomId: leaveRoomId } = data;
                    if (rooms.has(leaveRoomId)) {
                        rooms.get(leaveRoomId).delete(ws);
                        if (rooms.get(leaveRoomId).size === 0) {
                            rooms.delete(leaveRoomId);
                            console.log(`Serwer: Pokój ${leaveRoomId} jest pusty i został usunięty.`);
                        }
                        console.log(`Serwer: Klient opuścił pokój: ${leaveRoomId}. Aktywni w pokoju: ${rooms.has(leaveRoomId) ? rooms.get(leaveRoomId).size : 0}`);
                    }
                    break;

                default:
                    console.warn('Serwer: Nieznany typ wiadomości:', data.type);
                    break;
            }
        } catch (error) {
            console.error('Serwer: Błąd parsowania wiadomości lub przetwarzania:', error);
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'error', message: 'Błąd serwera podczas przetwarzania wiadomości.' }));
            }
        }
    });

    // Obsługa zamknięcia połączenia WebSocket
    ws.on('close', () => {
        const disconnectedClientData = clients.get(ws); // Pobierz dane odłączonego klienta
        if (disconnectedClientData && disconnectedClientData.userId) { // Upewnij się, że userId istnieje
            console.log(`Serwer: Klient rozłączony: ${disconnectedClientData.userId}`);

            // Usuń klienta ze wszystkich pokojów, do których należał
            rooms.forEach((clientSet, roomName) => {
                if (clientSet.has(ws)) {
                    clientSet.delete(ws);
                    if (clientSet.size === 0) {
                        rooms.delete(roomName); // Usuń pokój, jeśli jest pusty
                    }
                    console.log(`Serwer: Usunięto ${disconnectedClientData.userId} z pokoju ${roomName}.`);
                }
            });
            clients.delete(ws); // Usuń klienta z głównej mapy klientów

            // Rozgłoś status offline dla odłączonego użytkownika
            broadcastUserStatus(disconnectedClientData.userId, false);
        } else {
            console.log("Serwer: Nieznany klient rozłączony (brak userId lub danych).");
            clients.delete(ws); // Na wszelki wypadek usuń nawet bez userId
        }
    });

    // Obsługa błędów połączenia WebSocket
    ws.on('error', (error) => {
        console.error('Serwer: Błąd WebSocket:', error);
        // Zamknij połączenie w przypadku błędu, aby wyzwolić zdarzenie 'close' i ponowne połączenie
        if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
            ws.close();
        }
    });
});

// ** DODANA LINIA ** Eksportuj obiekt wss, aby index.js mógł go zaimportować
export { wss };