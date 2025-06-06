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


const wss = new WebSocketServer({ noServer: true });

const clients = new Map(); // Map(ws, { username, room })
const userStatus = new Map(); // Map(username, online: true/false)

wss.on('connection', (ws) => {
  let userData = null;

  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message);
	  console.log('Odebrana wiadomość przez WebSocket:', data);

      if (data.type === 'join') {
        // Najpierw wysyłamy historię wiadomości, aby klient zdążył zarejestrować onmessage
        const history = await getLastMessages(data.room);
        ws.send(JSON.stringify({
          type: 'history',
          messages: history.map(msg => ({
            username: msg.username,
            text: msg.text,
            inserted_at: msg.inserted_at,
          })),
        }));

        // Teraz rejestrujemy użytkownika i zapisujemy jego dane
        userData = { username: data.name, room: data.room };
        clients.set(ws, userData);
        userStatus.set(userData.username, true);

        // Emitujemy status online do wszystkich klientów
        broadcastUserStatus(userData.username, true);
      }

      if (data.type === 'message' && userData) {
        // Zapisz wiadomość w bazie i pobierz timestamp z bazy
        const inserted_at = await saveMessage(userData.username, userData.room, data.text);
		console.log('Zapisano wiadomość w bazie:', inserted_at);


        // Przygotuj obiekt wiadomości z czasem
        const msgObj = {
          type: 'message',
          username: userData.username,
          text: data.text,
          inserted_at,
        };

        // Rozsyłamy wiadomość do wszystkich klientów w danym pokoju
        broadcastToRoom(userData.room, JSON.stringify(msgObj));
      }
    } catch (err) {
      console.error('Błąd przy odbiorze wiadomości:', err);
    }
  });

  ws.on('close', () => {
    if (userData) {
      clients.delete(ws);
      userStatus.set(userData.username, false);
      broadcastUserStatus(userData.username, false);
    }
  });
});

// ---------------------- Funkcje pomocnicze --------------------------

function broadcastToRoom(room, msg) {
  for (const [client, data] of clients.entries()) {
    if (client.readyState === WebSocket.OPEN && data.room === room) {
      client.send(msg);
    }
  }
}

function broadcastUserStatus(username, isOnline) {
  const msg = JSON.stringify({
    type: 'status',
    user: username,
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
    console.log(`Próba zapisu wiadomości: username=${username}, room=${room}, text=${text}`);

    const res = await pool.query(query, [username, room, text]);
    console.log('Zapisano wiadomość w bazie:', res.rows[0]);

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
    console.log('Wczytana historia wiadomości:', res.rows);
    return res.rows.reverse();
  } catch (err) {
    console.error('Błąd pobierania historii:', err);
    return [];
  }
}