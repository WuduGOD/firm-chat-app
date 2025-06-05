import { WebSocketServer } from "ws";
import pkg from "pg";
import dotenv from "dotenv";

dotenv.config();

const { Pool } = pkg;

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASS,
  port: parseInt(process.env.DB_PORT),
});

// Mapa klientów (ws -> { username, room })
export const clients = new Map();
// Mapa statusów online (username -> true/false)
export const userStatus = new Map();

export const wss = new WebSocketServer({ noServer: true });

wss.on("connection", (ws) => {
  let userData = null;

  ws.on("message", async (message) => {
    try {
      const data = JSON.parse(message);

      if (data.type === "join") {
        userData = { username: data.name, room: data.room };
        clients.set(ws, userData);

        userStatus.set(userData.username, true); // ustawiamy online

        broadcastToRoom(userData.room, JSON.stringify({
          type: "info",
          text: `${userData.username} dołączył(a) do pokoju ${userData.room}`,
        }));

        const history = await getLastMessages(userData.room);
        history.forEach(msg => {
          ws.send(JSON.stringify({
            type: "history",
            username: msg.username,
            text: msg.text,
          }));
        });
      }

      if (data.type === "message" && userData) {
        broadcastToRoom(userData.room, JSON.stringify({
          type: "message",
          username: userData.username,
          text: data.text,
        }));
        saveMessage(userData.username, userData.room, data.text);
      }
    } catch (err) {
      console.error("Błąd przy odbiorze wiadomości:", err);
    }
  });

  ws.on("close", () => {
    if (userData) {
      userStatus.set(userData.username, false); // ustawiamy offline
      broadcastToRoom(userData.room, JSON.stringify({
        type: "info",
        text: `${userData.username} opuścił(a) pokój ${userData.room}`,
      }));
      clients.delete(ws);
    }
  });
});

function broadcastToRoom(room, msg) {
  for (const [client, data] of clients.entries()) {
    if (client.readyState === WebSocket.OPEN && data.room === room) {
      client.send(msg);
    }
  }
}

async function saveMessage(username, room, text) {
  const query = 'INSERT INTO messages (username, room, text) VALUES ($1, $2, $3)';
  try {
    await pool.query(query, [username, room, text]);
  } catch (err) {
    console.error('Błąd zapisu wiadomości:', err);
  }
}

async function getLastMessages(room, limit = 50) {
  const query = 'SELECT username, text FROM messages WHERE room = $1 ORDER BY inserted_at DESC LIMIT $2';
  try {
    const res = await pool.query(query, [room, limit]);
    return res.rows.reverse();
  } catch (err) {
    console.error('Błąd pobierania historii wiadomości:', err);
    return [];
  }
}
