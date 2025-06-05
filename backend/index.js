import express from "express";
import http from "http";
import { wss } from "./server.js"; // importujemy wss z server.js

const app = express();
const server = http.createServer(app);

// Endpoint do sprawdzania czy użytkownik jest online
// (zakładamy, że userStatus jest eksportowane z server.js)
import { userStatus } from "./server.js";

app.get("/status/:username", (req, res) => {
  const username = req.params.username;
  const isOnline = userStatus.get(username) || false;
  res.json({ username, online: isOnline });
});

// Podpinamy WebSocket pod HTTP server
server.on('upgrade', (request, socket, head) => {
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request);
  });
});

// Start serwera
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`✅ Serwer działa na porcie ${PORT}`);
});
