// server.js

require('dotenv').config(); // Ładuje zmienne środowiskowe z pliku .env

const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const { Pool } = require('pg');
const jwt = require('jsonwebtoken');
const cookie = require('cookie');
const path = require('path');

const app = express();
const server = http.createServer(app); // Tworzymy serwer HTTP

const PORT = process.env.PORT || 10000;
const DATABASE_URL = process.env.DATABASE_URL;
const SUPABASE_JWT_SECRET = process.env.SUPABASE_JWT_SECRET;
const SUPABASE_PROJECT_ID = process.env.SUPABASE_PROJECT_ID; // Twój Project ID Supabase

if (!DATABASE_URL || !SUPABASE_JWT_SECRET || !SUPABASE_PROJECT_ID) {
    console.error('Błąd: Brak wymaganych zmiennych środowiskowych (DATABASE_URL, SUPABASE_JWT_SECRET, SUPABASE_PROJECT_ID).');
    process.exit(1);
}

// Połączenie z bazą danych PostgreSQL
const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: {
        rejectUnauthorized: false // Wymagane dla połączeń z Supabase na niektórych środowiskach (Render)
    }
});

pool.connect()
    .then(() => console.log('Serwer: Połączono z bazą danych PostgreSQL!'))
    .catch(err => console.error('Serwer: Błąd połączenia z bazą danych:', err.message));

// ---------- SERWOWANIE PLIKÓW STATYCZNYCH (Frontend) ----------
// Serwowanie plików statycznych z katalogu 'public'
app.use(express.static(path.join(__dirname, 'public')));
// Jeśli pliki są w 'src' w katalogu 'public' to możesz dodać
app.use('/src', express.static(path.join(__dirname, 'public', 'src')));

// Obsługa wszystkich innych zapytań (dla aplikacji SPA, jak React/Vue/Angular)
// W przypadku czystego HTML, to może być nadmiarowe, ale jest bezpieczne
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'chat.html'));
});

// ---------- SERWER WEBSOCKET ----------
const wss = new WebSocket.Server({
    server: server, // Powiązanie serwera WebSocket z istniejącym serwerem HTTP
    // Funkcja verifyClient autoryzuje połączenie WebSocket na podstawie nagłówków HTTP
    verifyClient: function(info, done) {
        try {
            // Parsowanie ciasteczek z nagłówka 'cookie' żądania HTTP upgrade
            const cookies = cookie.parse(info.req.headers.cookie || '');
            // Nazwa ciasteczka Supabase, np. 'sb-your-project-ref-auth-token'
            const supabaseCookieName = `sb-${SUPABASE_PROJECT_ID}-auth-token`;
            const supabaseToken = cookies[supabaseCookieName];

            if (!supabaseToken) {
                console.log('Serwer: Odrzucono połączenie WebSocket - brak tokena Supabase w ciasteczkach.');
                return done(false, 401, 'Unauthorized - No Supabase token');
            }

            // Dekodowanie i weryfikacja tokena JWT
            const decoded = jwt.verify(supabaseToken, SUPABASE_JWT_SECRET);

            // 'sub' (subject) w tokenie JWT Supabase to zazwyczaj userId
            info.req.userId = decoded.sub; // Przypisz userId do obiektu żądania (będzie dostępne w 'connection')
            console.log(`Serwer: Połączenie WebSocket uwierzytelnione dla userId: ${decoded.sub}`);
            done(true); // Akceptuj połączenie
        } catch (err) {
            console.error('Serwer: Błąd weryfikacji tokena Supabase JWT:', err.message);
            done(false, 401, 'Unauthorized - Invalid Supabase token');
        }
    }
});

// Mapa do przechowywania aktywnych połączeń WebSocket i ich userId
// Key: userId, Value: WebSocket object
const clients = new Map();

wss.on('connection', function connection(ws, req) {
    // req.userId jest dostępne dzięki funkcji verifyClient,
    // która już zweryfikowała token i przypisała userId do żądania.
    const userId = req.userId;

    if (!userId) {
        // Ten przypadek powinien być rzadki, bo verifyClient już to sprawdziło
        console.log('Serwer: Nowe połączenie WebSocket, ale brak userId po weryfikacji. Rozłączam.');
        ws.close(1008, 'Unauthorized'); // Kod 1008 oznacza naruszenie zasad
        return;
    }

    console.log(`Serwer: Nowe połączenie WebSocket od userId: ${userId}`);

    // Przypisz userId bezpośrednio do obiektu WebSocket dla łatwego dostępu
    ws.userId = userId;
    clients.set(userId, ws); // Dodaj klienta do mapy aktywnych połączeń

    // Wysłanie listy aktywnych użytkowników do nowo połączonego klienta
    const activeUsersList = Array.from(clients.keys());
    ws.send(JSON.stringify({ type: 'user_list', users: activeUsersList }));

    // Poinformuj wszystkich pozostałych klientów o nowym użytkowniku online
    clients.forEach((clientWs) => {
        if (clientWs !== ws && clientWs.readyState === WebSocket.OPEN) {
            clientWs.send(JSON.stringify({ type: 'user_status', userId: userId, status: 'online' }));
        }
    });

    // NATYCHMIAST WYŚLIJ AUTH_SUCCESS DO KLIENTA
    // To jest wiadomość oczekiwana przez frontend po udanej autoryzacji
    ws.send(JSON.stringify({ type: 'auth_success', userId: userId }));

    ws.on('message', async function incoming(message) {
        console.log(`Otrzymano wiadomość od ${ws.userId}: ${message}`);
        try {
            const parsedMessage = JSON.parse(message);

            switch (parsedMessage.type) {
                case 'chat_message':
                    // Zapisz wiadomość do bazy danych
                    const { senderId, receiverId, content, timestamp } = parsedMessage;
                    await pool.query(
                        'INSERT INTO messages (sender_id, receiver_id, content, timestamp, read) VALUES ($1, $2, $3, $4, $5)',
                        [senderId, receiverId, content, timestamp, false] // Domyślnie 'read' na false
                    );
                    console.log(`Wiadomość zapisana w DB: ${senderId} -> ${receiverId}: ${content}`);

                    // Przekaż wiadomość do odbiorcy, jeśli jest online
                    const receiverWs = clients.get(receiverId);
                    if (receiverWs && receiverWs.readyState === WebSocket.OPEN) {
                        receiverWs.send(JSON.stringify(parsedMessage));
                        console.log(`Wiadomość przekazana do ${receiverId}.`);
                    } else {
                        console.log(`Odbiorca ${receiverId} jest offline lub niepołączony.`);
                    }
                    break;
                case 'typing_status':
                    // Przekaż status pisania do odbiorcy
                    const { senderId: typingSenderId, receiverId: typingReceiverId, isTyping } = parsedMessage;
                    const targetUserWs = clients.get(typingReceiverId);
                    if (targetUserWs && targetUserWs.readyState === WebSocket.OPEN) {
                        targetUserWs.send(JSON.stringify({ type: 'typing_status', senderId: typingSenderId, isTyping: isTyping }));
                    }
                    break;
                // Możesz dodać inne typy wiadomości, np. authenticate, disconnect itp.
                // Ale w tym modelu 'authenticate' jest obsługiwane przez verifyClient
                default:
                    console.warn(`Nieznany typ wiadomości od ${ws.userId}: ${parsedMessage.type}`);
            }
        } catch (error) {
            console.error('Błąd parsowania lub obsługi wiadomości WebSocket:', error);
        }
    });

    ws.on('close', function close() {
        console.log(`Serwer: Użytkownik ${ws.userId || 'Nieznany klient'} rozłączony.`);
        // Usuń klienta z mapy aktywnych połączeń
        clients.delete(ws.userId);
        // Poinformuj pozostałych klientów o statusie offline
        clients.forEach((clientWs) => {
            if (clientWs.readyState === WebSocket.OPEN) {
                clientWs.send(JSON.stringify({ type: 'user_status', userId: ws.userId, status: 'offline' }));
            }
        });
    });

    ws.on('error', function error(err) {
        console.error(`Serwer: Błąd WebSocket dla ${ws.userId || 'Nieznany klient'}:`, err);
    });
});

// ---------- URUCHOMIENIE SERWERA ----------
server.listen(PORT, () => {
    console.log(`Serwer HTTP i WebSocket nasłuchują na porcie ${PORT}`);
});

// Eksportujemy instancje serwera i wss, aby `index.js` mógł je zaimportować,
// jeśli `index.js` jest głównym punktem wejścia i potrzebuje tych referencji.
module.exports = { wss, server };