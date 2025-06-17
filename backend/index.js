// backend/index.js

// Importujemy nasz główny plik serwera.
// server.js teraz sam zarządza uruchomieniem serwera HTTP,
// konfiguracją Express, obsługą tras i powiązaniem z nim WebSocketServer.
import './server.js';

// Ten plik index.js jest teraz tylko punktem wejścia,
// który upewnia się, że server.js jest załadowany i jego kod wykonywany.
// Cała logika nasłuchiwania na porcie i obsługa połączeń HTTP/WebSocket
// jest już zaimplementowana w server.js.

// Możesz dodać tutaj jakieś logowanie, jeśli chcesz, aby potwierdzić, że index.js został uruchomiony.
console.log("Index.js uruchomiony. Główna logika serwera jest zarządzana przez server.js.");

// W tym pliku nie ma potrzeby dodawania żadnego kodu związanego z:
// - `http.createServer()`
// - `server.on('upgrade', ...)`
// - `server.listen(...)`
// Ponieważ wszystko to jest już w server.js.