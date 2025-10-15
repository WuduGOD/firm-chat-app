// Plik: websocket.js

import { addMessageToChat, showTypingIndicator, updateUserStatusIndicator } from './services/chatService.js';
import { displayActiveUsers, handleNewFriendRequestNotification, loadFriendsAndRequests } from './services/friendsService.js';
import { setSocket, setReconnectAttempts, socket, reconnectAttempts, currentUser, currentRoom } from './chat.js';
import { contactsListEl } from './ui/elements.js';
import { showCustomMessage } from './ui/helpers.js';
import { getUserLabelById } from './profiles.js';

/**
 * Initializes the WebSocket connection and sets up all event handlers
 */
export function initWebSocket() {
    const wsUrl = import.meta.env.VITE_CHAT_WS_URL || "wss://firm-chat-app-backend.onrender.com";

    if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
        console.log("[WebSocket] Połączenie już istnieje lub jest w trakcie. Pomijam.");
        return Promise.resolve();
    }

    const newSocket = new WebSocket(wsUrl);
	setSocket(newSocket);
    console.log(`[WebSocket] Próba połączenia z: ${wsUrl}`);

    return new Promise((resolve, reject) => {
        socket.onopen = () => {
            console.log('[WebSocket] Połączono pomyślnie.');
            setReconnectAttempts(0);
            if (currentUser) {
                // Dołącz do globalnego kanału i wyślij status online
                socket.send(JSON.stringify({ type: 'join', room: 'global' }));
                socket.send(JSON.stringify({ type: 'status', user: currentUser.id, online: true }));
                
                // Jeśli byliśmy w jakimś pokoju, dołącz do niego ponownie
                if (currentRoom && currentRoom !== 'global') {
                    socket.send(JSON.stringify({ type: 'join', room: currentRoom }));
                }
                resolve();
            } else {
                reject(new Error("Brak currentUser po otwarciu WebSocket."));
            }
        };

        newSocket.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                console.log(`[WS] Otrzymano wiadomość typu: ${data.type}`);

                // Centralny router dla wiadomości z serwera
                switch (data.type) {
                    case 'message':
                        addMessageToChat(data);
                        break;
                    case 'typing':
                        showTypingIndicator(data.username);
                        break;
                    case 'status':
                        updateUserStatusIndicator(data.user, data.online, data.last_seen || null);
                        break;
                    case 'active_users':
                        displayActiveUsers(data.users);
                        break;
                    case 'new_friend_request':
                        handleNewFriendRequestNotification(data.sender_id);
                        break;
                    case 'friend_request_status_update':
                        if (data.status === 'accepted') {
                           showCustomMessage(`Zaproszenie do ${getUserLabelById(data.friend_id)} zostało zaakceptowane!`, 'success');
                           loadFriendsAndRequests();
                        }
                        break;
					case 'last_messages_for_user_rooms':
						// Ta wiadomość jest obsługiwana w innym miejscu, więc tutaj ją ignorujemy.
						break;
                    // Inne typy wiadomości są obsługiwane w innych miejscach (np. przez Promise)
                    default:
                        console.warn("[WS] Nieznany typ wiadomości:", data.type);
                }
            } catch (e) {
                console.error("Błąd przetwarzania wiadomości WebSocket:", e);
            }
        };

        newSocket.onclose = (event) => {
            console.log(`[WebSocket] Rozłączono. Kod: ${event.code}`);
            if (event.code !== 1000) { // Jeśli to nie było normalne zamknięcie
                console.log('[WebSocket] Próba ponownego połączenia...');
                setTimeout(() => initWebSocket().then(resolve).catch(reject), Math.min(1000 * ++reconnectAttempts, 10000));
            }
        };

        newSocket.onerror = (error) => {
            console.error('[WebSocket] Błąd:', error);
            reject(error);
        };
    });
}