// backend/index.js

// Importujemy instancję serwera HTTP oraz WebSocketServer z naszego pliku server.js.
// server.js teraz sam zarządza uruchomieniem serwera HTTP i powiązaniem z nim WSS.
import { wss, server } from './server.js';

// Ten plik index.js jest teraz tylko punktem wejścia,
// który upewnia się, że server.js jest załadowany i uruchomiony.
// Cała logika nasłuchiwania na porcie i obsługi połączeń jest już w server.js.

// Możesz dodać tutaj jakieś logowanie, jeśli chcesz, aby potwierdzić, że index.js został uruchomiony.
console.log("Index.js uruchomiony. Serwer jest zarządzany przez server.js.");

// Nie ma potrzeby dodawania `server.on('upgrade', ...)` tutaj,
// ponieważ w nowym `server.js` WebSocketServer jest już inicjalizowany z opcją `server: server,`
// co automatycznie obsługuje upgrady protokołu.

// Nie ma potrzeby dodawania `server.listen(...)` tutaj,
// ponieważ w nowym `server.js` już jest `server.listen(PORT, ...)`.