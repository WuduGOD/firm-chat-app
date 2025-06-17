import express from 'express';
import http from 'http';
import { wss } from './server.js';  // import WebSocketServer

const app = express();
const server = http.createServer(app);

// Obsługa żądań HTTP zwykłych
app.get('/', (req, res) => {
  res.send('Hello, chat server is running');
});

// Obsługa upgrade na WebSocket
server.on('upgrade', (request, socket, head) => {
  // Możesz tu zrobić np. autoryzację

  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
