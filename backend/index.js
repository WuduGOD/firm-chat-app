import { WebSocketServer } from "ws";
import express from "express";
import http from "http";
import pkg from "pg";
import dotenv from 'dotenv'

dotenv.config()

const { Pool } = pkg;

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const pool = new Pool({
  user: 'postgres.tatiuvcmkzgcclwnehyr',
  host: 'aws-0-eu-central-1.pooler.supabase.com',                
  database: 'postgres',
  password: 'Wiktor167',
  port: 5432,
});

// Mapowanie klientów: ws -> { username, room }
const clients = new Map();

wss.on("connection", (ws) => {
  let userData = null; // { username, room }

  ws.on("message", async (message) => {
    try {
      const data = JSON.parse(message);
      console.log("Otrzymano wiadomość:", data);

      if (data.type === "join") {
        // Ustawiamy nazwę i pokój
        userData = { username: data.name, room: data.room };
        clients.set(ws, userData);

        console.log(`${userData.username} dołączył do pokoju ${userData.room}`);
        broadcastToRoom(userData.room, `${userData.username} dołączył(a) do pokoju ${userData.room}`);

        // Wyślij historię wiadomości do klienta
        const history = await getLastMessages(userData.room);
        history.forEach(msg => {
          ws.send(JSON.stringify({
     	    type: "history",
      	    username: msg.username,
      	    text: msg.text
	  }));
        });
      }

      if (data.type === "message" && userData) {
        console.log(`Wiadomość od ${userData.username} w pokoju ${userData.room}: ${data.text}`);
        broadcastToRoom(userData.room, `${userData.username}: ${data.text}`);
        saveMessage(userData.username, userData.room, data.text);
      }
    } catch (err) {
      console.error("❌ Błąd przy odbiorze wiadomości:", err);
    }
  });

  ws.on("close", () => {
    if (userData) {
      console.log(`${userData.username} opuścił pokój ${userData.room}`);
      broadcastToRoom(userData.room, `${userData.username} opuścił(a) pokój ${userData.room}`);
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
    return res.rows.reverse(); // odwracamy, żeby najstarsze były pierwsze
  } catch (err) {
    console.error('Błąd pobierania historii wiadomości:', err);
    return [];
  }
}

const PORT = parseInt(process.env.PORT) || 3000;
server.listen(PORT, () => {
  console.log(`✅ Serwer działa na port ${PORT}`);
});