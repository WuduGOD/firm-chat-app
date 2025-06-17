import http from 'http';
import { wss } from './server.js'; // Importujemy nasz WebSocketServer z server.js

// Pobierz port z zmiennych środowiskowych Render.com, domyślnie 8080
const PORT = process.env.PORT || 8080;

// 1. Utwórz prosty serwer HTTP
const server = http.createServer((req, res) => {
    // Tutaj możesz dodać obsługę zwykłych żądań HTTP, jeśli potrzebujesz.
    // Na przykład, możesz serwować pliki statyczne dla frontendu, jeśli Twój backend to robi.
    // Na potrzeby samej komunikacji WebSocket, ten serwer może być minimalistyczny.
    if (req.url === '/') {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('WebSocket server is running.');
    } else {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
    }
});

// 2. Podłącz serwer WebSocket do istniejącego serwera HTTP
// Zamiast wss tworzyć własny serwer na porcie, teraz będzie nasłuchiwał na połączeniach przekazywanych przez 'server'.
// W server.js, upewnij się, że wss jest tworzone BEZ opcji 'port', jeśli chcesz, aby używało istniejącego serwera HTTP.
// W tym przypadku zmieniam `new WebSocketServer({ port: PORT })` na `new WebSocketServer({ server: server })`
// w server.js, ale skoro dostarczyłem Ci pełen server.js z opcją portu, zostawmy to na razie tak.
// Ważne jest, aby server.js eksportował `wss` i NIE URUCHAMIAŁ WŁASNEGO `listen()` na porcie.
// Zatem, w `server.js` należy zmienić:
// `const wss = new WebSocketServer({ port: PORT });`
// NA:
// `const wss = new WebSocketServer({ noServer: true });` // Aby wss nie tworzył własnego serwera HTTP

// ... A następnie w `index.js` będziemy obsługiwać uaktualnienia protokołu:
server.on('upgrade', (request, socket, head) => {
    wss.handleUpgrade(request, socket, head, ws => {
        wss.emit('connection', ws, request);
    });
});

// 3. Uruchom serwer HTTP na odpowiednim porcie
server.listen(PORT, () => {
    console.log(`Serwer HTTP i WebSocket nasłuchują na porcie ${PORT}`);
});