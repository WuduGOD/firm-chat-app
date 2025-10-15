// Plik: chat.js 

// Importy zależności (na razie zostawiamy, później je przeniesiemy tam, gdzie będą potrzebne)
// Importy z folderów podrzędnych
import * as elements from './ui/elements.js';
import * as helpers from './ui/helpers.js';
import * as chatService from './services/chatService.js';
import * as friendsService from './services/friendsService.js';

// Importy z tego samego folderu
import * as websocket from './websocket.js';
import { supabase } from './supabaseClient.js';
import { loadAllProfiles } from './profiles.js';

// --- Zmienne stanu aplikacji i czatu ---
export let allFriends = [];
export let allConversations = [];
export let currentUser = null;
export let currentChatUser = null;
export let currentRoom = null;
export let socket = null;
export let reconnectAttempts = 0;
export let typingTimeout;
export let currentActiveConvoItem = null;
export let notificationPermissionGranted = false;

// Mapa przechowująca status online użytkowników
// Klucz: userID, Wartość: { isOnline: boolean, lastSeen: string | null }
export let onlineUsers = new Map();

// --- Zmienne stanu powiadomień i dźwięków ---
export let audioContext = null;
export let audioContextInitiated = false;

// --- Zmienne dla tytułu strony ---
export let baseDocumentTitle = "Komunikator";
// Mapa przechowująca informacje o nieprzeczytanych wiadomościach
// Klucz: roomId, Wartość: { unreadCount: number, lastSenderId: string }
export let unreadConversationsInfo = new Map();

//
// Tutaj w przyszłości znajdą się główne funkcje inicjujące aplikację
// i łączące logikę z innych plików.
//

export function setNotificationPermission(isGranted) {
  notificationPermissionGranted = isGranted;
}

export function setAudioContextInitiated(isInitiated) {
  audioContextInitiated = isInitiated;
}

export function setSocket(newSocket) {
  socket = newSocket;
}

export function setReconnectAttempts(attempts) {
  reconnectAttempts = attempts;
}

export function setAllFriends(friends) {
  allFriends = friends;
}

export function setCurrentActiveConvoItem(item) {
  currentActiveConvoItem = item;
}

export function setCurrentChatUser(user) {
  currentChatUser = user;
}

export function setCurrentRoom(room) {
  currentRoom = room;
}

export function setAudioContext(context) {
  audioContext = context;
}

// --- Funkcje Inicjalizacyjne i Główna Logika Aplikacji ---

/**
 * Sets up event listeners for sending messages
 */
export function setupSendMessage() {
    console.log("[setupSendMessage] Setting up message send event listeners.");
    if (!messageInput || !sendButton || !messageContainer) {
        console.error("[setupSendMessage] Message input, send button or messageContainer not found. Cannot attach listeners.");
        return;
    }

    try {
        // Wysyłanie statusu "pisze..."
        messageInput.addEventListener('input', () => {
            if (currentRoom && socket && socket.readyState === WebSocket.OPEN) {
                socket.send(JSON.stringify({
                    type: 'typing',
                    username: currentUser.id,
                    room: currentRoom,
                }));
            }
        });

        // Logika wysyłania wiadomości
        const sendMessage = () => {
            const text = messageInput.value.trim();
            if (!text || !currentChatUser || !socket || socket.readyState !== WebSocket.OPEN || !currentRoom) {
                console.warn("Cannot send message: conditions not met.");
                return;
            }

            const msgData = {
                type: 'message',
                username: currentUser.id,
                text,
                room: currentRoom,
                inserted_at: new Date().toISOString()
            };

            socket.send(JSON.stringify(msgData));
			
			// Natychmiast wyświetl wysłaną wiadomość, nie czekając na serwer
			chatService.addMessageToChat(msgData);

            // Przenieś konwersację na górę listy
            const convoItemToMove = elements.contactsListEl.querySelector(`.contact[data-room-id="${currentRoom}"]`);
            if (convoItemToMove && elements.contactsListEl.firstChild !== convoItemToMove) {
                elements.contactsListEl.prepend(convoItemToMove);
            }

            messageInput.value = '';
            messageInput.focus();
        };

        // Podpięcie logiki pod przycisk i klawisz Enter
        sendButton.onclick = sendMessage;
        messageInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                sendMessage();
            }
        });

        console.log("[setupSendMessage] Message send event listeners attached.");
    } catch (e) {
        console.error("Caught error in setupSendMessage:", e);
    }
}

/**
 * Sets up the functionality for the chat settings dropdown menu and global click handlers.
 */
export function setupChatSettingsDropdown() {
    console.log("[setup] Konfiguracja menu ustawień czatu.");
    if (!chatSettingsButton || !chatSettingsDropdown) return;

    try {
        // Otwieranie/zamykanie menu ustawień
        chatSettingsButton.addEventListener('click', (event) => {
            event.stopPropagation();
            chatSettingsDropdown.classList.toggle('hidden');
        });

        // Globalny listener do zamykania okienek po kliknięciu na zewnątrz
        document.addEventListener('click', (event) => {
            // Zamknij menu ustawień czatu
            if (!chatSettingsDropdown.classList.contains('hidden') && !chatSettingsButton.contains(event.target)) {
                chatSettingsDropdown.classList.add('hidden');
            }
            // Zamknij główne menu
            if (!dropdownMenu.classList.contains('hidden') && !menuButton.contains(event.target)) {
                dropdownMenu.classList.add('hidden');
            }
            // Zamknij modal zaproszeń do znajomych
            if (friendRequestModal && friendRequestModal.classList.contains('visible') && !friendRequestModal.contains(event.target)) {
                friendRequestModal.classList.remove('visible');
            }
        });

        // Obsługa zmiany motywu kolorystycznego wiadomości
        const colorOptions = chatSettingsDropdown.querySelectorAll('.color-box');
        colorOptions.forEach(option => {
            option.addEventListener('click', () => {
                const colorTheme = option.dataset.color;
                if (messageContainer) {
                    messageContainer.className = messageContainer.className.replace(/(\S+)-color/g, '').trim();
                    if (colorTheme !== 'default') {
                        messageContainer.classList.add(`${colorTheme}-color`);
                    }
                }
            });
        });

        // Obsługa zmiany tła czatu
        const backgroundOptions = chatSettingsDropdown.querySelectorAll('.bg-box');
        backgroundOptions.forEach(option => {
            option.addEventListener('click', () => {
                const bgTheme = option.dataset.bg;
                if (messageContainer) {
                    messageContainer.classList.remove('dark-bg', 'pattern-bg');
                    if (bgTheme !== 'default') {
                        messageContainer.classList.add(bgTheme);
                    }
                }
            });
        });
        
        // ... (reszta logiki dla zmiany nicku i wyszukiwania - jest specyficzna i zostaje) ...

    } catch (e) {
        console.error("Błąd w setupChatSettingsDropdown:", e);
    }
}

/**
 * Podpina główne event listenery interfejsu.
 */
function setupEventListeners() {
    elements.menuButton.addEventListener('click', (event) => {
		event.stopPropagation();
        elements.dropdownMenu.classList.toggle('hidden');
    });

	elements.logoutButton.addEventListener('click', async () => {
        await supabase.auth.signOut();
        window.location.href = 'login.html';
    });

    elements.themeToggle.addEventListener('click', () => {
        document.body.classList.toggle('dark-mode');
    });

    // --- UZUPEŁNIONA LOGIKA PRZYCISKU "WSTECZ" ---
    elements.backButton.addEventListener('click', () => {
        // Zawsze resetujemy widok czatu
        chatService.resetChatView();

        // Logika specyficzna dla widoku mobilnego
        if (window.matchMedia('(max-width: 768px)').matches) {
            if (elements.sidebarWrapper) {
                // Pokaż listę konwersacji
                elements.sidebarWrapper.classList.remove('hidden-on-mobile');
            }
            if (elements.chatAreaWrapper) {
                // Ukryj obszar czatu
                elements.chatAreaWrapper.classList.remove('active-on-mobile');
            }
        }
    });
    // --- KONIEC UZUPEŁNIONEJ LOGIKI ---
    
    // Listenery dla modalu znajomych
    elements.addFriendButton.addEventListener('click', () => friendsService.openFriendRequestModal(true, false));
    elements.notificationButton.addEventListener('click', () => friendsService.openFriendRequestModal(false, true));
    elements.closeFriendRequestModal.addEventListener('click', () => {
        elements.friendRequestModal.classList.remove('visible');
    });
    elements.sendFriendRequestButton.addEventListener('click', friendsService.sendFriendRequest);
    
    // Globalny listener do zamykania okienek
    document.addEventListener('click', (event) => {
        if (!elements.chatSettingsDropdown.classList.contains('hidden') && !elements.chatSettingsButton.contains(event.target)) {
            elements.chatSettingsDropdown.classList.add('hidden');
        }
        if (!elements.dropdownMenu.classList.contains('hidden') && !elements.menuButton.contains(event.target)) {
            elements.dropdownMenu.classList.add('hidden');
        }
        if (elements.friendRequestModal.classList.contains('visible') && !elements.friendRequestModal.contains(event.target)) {
            elements.friendRequestModal.classList.remove('visible');
        }
    });

    console.log('[Init] Główne event listenery UI zostały podpięte.');
}

/**
 * Główna funkcja, która uruchamia całą aplikację.
 */
async function initializeApp() {
    console.log("Start inicjalizacji Komunikatora...");
    
    // 1. Inicjalizuj elementy DOM
    elements.initializeDOMElements();

    // 2. Sprawdź sesję użytkownika
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
        window.location.href = 'login.html';
        return;
    }
    currentUser = session.user;
    console.log(`[Init] Zalogowany użytkownik: ${currentUser.email}`);

    // 3. Podepnij podstawowe event listenery
    setupEventListeners();
    setupSendMessage(); // Używamy teraz nazwy modułu
    setupChatSettingsDropdown(); // Używamy teraz nazwy modułu

    // 4. Załaduj profile i poproś o uprawnienia
    await loadAllProfiles();
    await helpers.requestNotificationPermission();
    helpers.checkAudioAutoplay();
    helpers.updateDocumentTitle();

    // 5. Nawiąż połączenie WebSocket i poczekaj na nie
    try {
        await websocket.initWebSocket();
        console.log("[Init] Połączenie WebSocket nawiązane.");
    } catch (wsError) {
        console.error("[Init] Krytyczny błąd WebSocket:", wsError);
        helpers.showCustomMessage("Błąd połączenia z serwerem czatu.", "error");
        return;
    }

    // 6. Po udanym połączeniu, załaduj dane aplikacji
    await friendsService.loadFriendsAndRequests();
    await friendsService.loadActiveUsers();
    console.log("[Init] Dane znajomych i czatu załadowane.");

    // 7. Ustaw nasłuchiwanie na zmiany w Supabase Realtime
    // ... (kod dla supabase.channel(...).on(...).subscribe()) ...

    console.log("✅ Aplikacja Komunikator została pomyślnie zainicjalizowana!");
}

// --- Krok 4: Uruchomienie Aplikacji ---
document.addEventListener('DOMContentLoaded', initializeApp);
