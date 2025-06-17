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
        console.log("Serwer: Pomyślnie połączono z PostgreSQL!");
        client.release(); // Zwolnij klienta z powrotem do puli
    })
    .catch(err => {
        console.error("Serwer: Błąd połączenia z PostgreSQL na starcie:", err.message);
        // Opcjonalnie: Zakończ proces, jeśli połączenie z bazą danych jest krytyczne
        // process.exit(1);
    });

// Inicjalizacja serwera WebSocket
// noServer: true oznacza, że nie tworzy własnego serwera HTTP,
// będzie używany w połączeniu z istniejącym serwerem HTTP (np. Express)
export const wss = new WebSocketServer({ noServer: true });

// Mapa do przechowywania aktywnych klientów WebSocket
// Klucz: instancja WebSocket
// Wartość: obiekt zawierający userId (ID użytkownika Supabase) i activeRoom (aktualny pokój czatu)
const clients = new Map(); // Map(ws, { userId, activeRoom })

// Mapa do zarządzania pokojami czatu
// Klucz: nazwa pokoju (string, np. "user1_user2")
// Wartość: Set zawierający instancje WebSocket klientów w tym pokoju
const rooms = new Map(); // Map(string (roomName), Set<WebSocket>)

/**
 * Funkcja pomocnicza do rozgłaszania statusu użytkownika (online/offline) do wszystkich podłączonych klientów.
 * Przesyła status tylko, jeśli user ID jest dostępne.
 * @param {string} userId - ID użytkownika, którego status się zmienia.
 * @param {boolean} isOnline - True, jeśli użytkownik jest online; false, jeśli offline.
 */
function broadcastUserStatus(userId, isOnline) {
    if (!userId) {
        console.warn("Serwer: Próba rozgłoszenia statusu dla niezdefiniowanego userId.");
        return;
    }
    const msg = JSON.stringify({
        type: 'status',
        user: userId, // ID użytkownika
        online: isOnline, // Status online/offline
    });

    // Przesyłanie statusu do wszystkich aktywnych klientów
    clients.forEach((clientData, clientWs) => {
        if (clientWs.readyState === WebSocket.OPEN) {
            clientWs.send(msg);
        }
    });
    console.log(`Serwer: Rozgłoszono status użytkownika ${userId}: ${isOnline ? 'online' : 'offline'}.`);
}

/**
 * Funkcja pomocnicza do wysyłania listy aktywnych użytkowników do konkretnego klienta.
 * Używana zazwyczaj, gdy klient dołącza do globalnego pokoju.
 * @param {WebSocket} clientWs - Instancja WebSocket klienta, do którego ma zostać wysłana lista.
 */
function sendActiveUsersToClient(clientWs) {
    // Tworzenie listy aktywnych użytkowników (tylko ID)
    // Filtrowane są tylko te klienty, które mają przypisane userId (czyli są zalogowane)
    const activeUsers = Array.from(clients.values())
                             .filter(client => client.userId)
                             .map(client => ({ id: client.userId }));

    const msg = JSON.stringify({
        type: 'active_users',
        users: activeUsers,
    });
    if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(msg);
        console.log(`Serwer: Wysłano listę aktywnych użytkowników do klienta.`);
    }
}

/**
 * Zapisuje wiadomość do bazy danych PostgreSQL.
 * @param {string} username - Nazwa użytkownika/ID nadawcy wiadomości.
 * @param {string} room - Nazwa pokoju, do którego wiadomość należy.
 * @param {string} text - Treść wiadomości.
 * @returns {Promise<string>} Obiekt Date (ISO string) timestampu, kiedy wiadomość została wstawiona.
 */
async function saveMessage(username, room, text) {
    // Zapytanie SQL do wstawienia wiadomości
    const query = 'INSERT INTO messages (username, room, text) VALUES ($1, $2, $3) RETURNING inserted_at';
    try {
        const res = await pool.query(query, [username, room, text]);
        console.log(`Serwer: Wiadomość użytkownika ${username} w pokoju ${room} została zapisana w DB.`);
        return res.rows[0].inserted_at; // Zwróć timestamp wstawienia
    } catch (err) {
        console.error('Serwer: Błąd DB - Nie udało się zapisać wiadomości:', err);
    }
    return new Date().toISOString(); // Zwróć bieżący czas w przypadku błędu
}

/**
 * Pobiera ostatnie wiadomości dla danego pokoju z bazy danych.
 * @param {string} room - Nazwa pokoju, dla którego pobierane są wiadomości.
 * @param {number} limit - Maksymalna liczba wiadomości do pobrania.
 * @returns {Promise<Array<Object>>} Tablica obiektów wiadomości.
 */
async function getLastMessages(room, limit = 50) {
    // Zapytanie SQL do pobrania wiadomości, posortowane chronologicznie
    const query = 'SELECT username, text, inserted_at, room FROM messages WHERE room = $1 ORDER BY inserted_at ASC LIMIT $2';
    try {
        const res = await pool.query(query, [room, limit]);
        console.log(`Serwer: Pobrano ${res.rows.length} wiadomości dla pokoju ${room}.`);
        return res.rows;
    } catch (err) {
        console.error('Serwer: Błąd DB - Nie udało się pobrać wiadomości:', err);
    }
    return []; // Zwróć pustą tablicę w przypadku błędu
}

// Obsługa nowych połączeń WebSocket
wss.on('connection', (ws) => {
    // Dodaj nowego klienta do mapy 'clients' z domyślnymi danymi
    clients.set(ws, { userId: null, activeRoom: null });
    console.log('Serwer: Nowe połączenie WebSocket nawiązane.');

    // Obsługa wiadomości przychodzących od klienta
    ws.on('message', async (message) => {
        let data;
        try {
            data = JSON.parse(message); // Parsuj JSON odebrany od klienta
            console.log(`Serwer: Odebrano wiadomość od klienta: typ=${data.type}, user=${data.username || data.name}, room=${data.room}`);
        } catch (e) {
            console.error("Serwer: Błąd parsowania wiadomości JSON:", e);
            return; // Przerwij, jeśli wiadomość nie jest poprawnym JSON-em
        }

        switch (data.type) {
            case 'join':
                // Klient chce dołączyć do pokoju
                const userId = data.name; // 'name' z frontendu to ID użytkownika
                const requestedRoom = data.room; // Nazwa pokoju, do którego klient chce dołączyć

                if (!userId || !requestedRoom) {
                    console.warn("Serwer: Wiadomość 'join' bez userId lub requestedRoom.");
                    return;
                }

                // Zaktualizuj dane klienta w mapie 'clients'
                clients.set(ws, { userId: userId, activeRoom: requestedRoom });

                // Dodaj klienta do Setu dla danego pokoju w mapie 'rooms'
                if (!rooms.has(requestedRoom)) {
                    rooms.set(requestedRoom, new Set()); // Jeśli pokój nie istnieje, utwórz nowy Set
                }
                rooms.get(requestedRoom).add(ws); // Dodaj klienta do Setu pokoju
                console.log(`Serwer: Użytkownik ${userId} dołączył do pokoju: ${requestedRoom}. Aktualna liczba klientów w pokoju ${requestedRoom}: ${rooms.get(requestedRoom).size}`);

                // Jeśli dołączono do pokoju czatu (nie 'global'), wyślij historię wiadomości
                if (requestedRoom !== 'global') {
                    const history = await getLastMessages(requestedRoom);
                    ws.send(JSON.stringify({ type: 'history', room: requestedRoom, messages: history }));
                    console.log(`Serwer: Wysłano historię dla pokoju ${requestedRoom} do użytkownika ${userId}.`);
                }
                
                // Jeśli dołączono do pokoju 'global' (zazwyczaj na początku połączenia), wyślij listę aktywnych użytkowników
                if (requestedRoom === 'global') {
                     sendActiveUsersToClient(ws); // Wyślij aktualną listę aktywnych użytkowników
                     broadcastUserStatus(userId, true); // Rozgłoś status online dla nowo połączonego użytkownika
                }
                break;

            case 'leave':
                // Klient chce opuścić pokój
                const userToLeave = data.name;
                const roomToLeave = data.room;

                if (!userToLeave || !roomToLeave) {
                    console.warn("Serwer: Wiadomość 'leave' bez userToLeave lub roomToLeave.");
                    return;
                }

                if (rooms.has(roomToLeave)) {
                    rooms.get(roomToLeave).delete(ws); // Usuń klienta z Setu pokoju
                    if (rooms.get(roomToLeave).size === 0) {
                        rooms.delete(roomToLeave); // Jeśli pokój jest pusty, usuń go z mapy
                    }
                    console.log(`Serwer: Użytkownik ${userToLeave} opuścił pokój: ${roomToLeave}. Pozostałych klientów w pokoju ${roomToLeave}: ${rooms.has(roomToLeave) ? rooms.get(roomToLeave).size : 0}`);
                }
                // Zaktualizuj activeRoom klienta w mapie 'clients'
                const clientDataAfterLeave = clients.get(ws);
                if (clientDataAfterLeave && clientDataAfterLeave.activeRoom === roomToLeave) {
                    clients.set(ws, { userId: clientDataAfterLeave.userId, activeRoom: null }); // Ustaw activeRoom na null
                }
                break;

            case 'message':
                // Obsługa wiadomości czatu
                const { username, text, room } = data; // Pobierz nadawcę, treść i pokój z danych

                // Walidacja: upewnij się, że ID pokoju jest dostępne
                if (!room || !username || !text) {
                    console.error(`Serwer: Odebrano wiadomość z brakującymi danymi (pokój, nadawca lub tekst). Wiadomość odrzucona.`);
                    return; // Przerwij przetwarzanie, jeśli brakuje danych
                }

                // Zapisz wiadomość w bazie danych i uzyskaj timestamp
                const insertedAt = await saveMessage(username, room, text);

                // Przygotuj wiadomość do rozgłoszenia (dołączając ID pokoju)
                const msgToBroadcast = JSON.stringify({
                    type: 'message',
                    username,
                    text,
                    room, // Włącz ID pokoju w rozgłaszanej wiadomości
                    inserted_at: insertedAt, // Dołącz timestamp
                });

                // Rozgłoś wiadomość tylko do klientów w docelowym pokoju
                if (rooms.has(room)) {
                    rooms.get(room).forEach(client => {
                        if (client.readyState === WebSocket.OPEN) {
                            client.send(msgToBroadcast);
                        }
                    });
                    console.log(`Serwer: Rozgłoszono wiadomość do pokoju ${room}.`);
                } else {
                    console.warn(`Serwer: Próbowano wysłać wiadomość do nieistniejącego pokoju: ${room}. Wiadomość odrzucona.`);
                }
                break;

            case 'typing':
                // Obsługa statusu pisania
                const { username: typingUser, room: typingRoom } = data; // Pobierz użytkownika i pokój

                // Walidacja: upewnij się, że ID pokoju i użytkownik są dostępne
                if (!typingRoom || !typingUser) {
                     console.error(`Serwer: Odebrano status pisania z brakującymi danymi (pokój lub użytkownik). Nie można przetworzyć.`);
                     return;
                }

                // Przygotuj wiadomość o statusie pisania
                const typingMsg = JSON.stringify({
                    type: 'typing',
                    username: typingUser,
                    room: typingRoom,
                });

                // Rozgłoś status pisania tylko do klientów w docelowym pokoju (oprócz samego nadawcy)
                if (rooms.has(typingRoom)) {
                    rooms.get(typingRoom).forEach(client => {
                        // Sprawdź, czy klient ma przypisany userId i nie jest nadawcą
                        if (client.readyState === WebSocket.OPEN && clients.get(client)?.userId !== typingUser) {
                            client.send(typingMsg);
                        }
                    });
                    console.log(`Serwer: Rozgłoszono status pisania w pokoju ${typingRoom}.`);
                } else {
                    console.warn(`Serwer: Próbowano wysłać status pisania do nieistniejącego pokoju: ${typingRoom}.`);
                }
                break;

            case 'status':
                // Obsługa globalnych aktualizacji statusu (online/offline)
                if (data.user) {
                    broadcastUserStatus(data.user, data.online);
                } else {
                    console.warn("Serwer: Wiadomość 'status' bez zdefiniowanego użytkownika.");
                }
                break;
            
            case 'get_active_users':
                // Klient żąda listy aktywnych użytkowników
                sendActiveUsersToClient(ws); // Wyślij listę do konkretnego klienta
                break;

            default:
                console.warn('Serwer: Odebrano nieznany typ wiadomości:', data.type);
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
