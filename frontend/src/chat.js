// chat.js
// Importy zależności
import { loadAllProfiles, getUserLabelById, getProfileById } from './profiles.js';
import { supabase } from './supabaseClient.js';

// ==========================================================
// Globalne zmienne UI i czatu
// ==========================================================
let mainHeader;
let menuButton;
let dropdownMenu; // ID: dropdownMenu, Klasa: dropdown
let themeToggle;
let logoutButton;

let container;
let sidebarWrapper;
let mainNavIcons;
let navIcons;

let onlineUsersMobile; // Kontener dla aktywnych użytkowników na mobile

let sidebarEl; // <aside class="sidebar" id="sidebar">
let searchInput; // <input id="sidebarSearchInput">
let contactsListEl; // <ul class="conversations-list" id="contactsList"> - POPRAWKA: Upewnienie się, że to contactsListEl
let searchBar; // POPRAWKA: Zmienna dla paska wyszukiwania

let chatAreaWrapper; // <div class="chat-area-wrapper">
let logoScreen; // <div id="logoScreen">
let chatArea; // <section class="chat-area" id="chatArea">

let chatHeader; // <div class="chat-header">
let backButton; // <button id="backButton">
let chatUserAvatar; // <div class="user-avatar" id="chatUserAvatar"> - POPRAWKA: Dodane do inicjalizacji
let chatUserName; // <span id="chatUserName">
let userStatusSpan; // <span id="userStatus">, Klasa: status
let chatHeaderActions; // <div class="chat-header-actions">
let chatSettingsButton; // <button id="chatSettingsButton">
let chatSettingsDropdown; // ID: chatSettingsDropdown, Klasa: dropdown chat-settings-dropdown
let typingStatusHeader; // ID: typingStatus (status w nagłówku)
let typingIndicatorMessages; // ID: typingIndicator (animowane kropki na dole)

let chatMessages; // Kontener na wiadomości w aktywnym czacie
let messageInput;
let sendButton;
let emojiButton;
let attachButton;
let rightSidebarWrapper;
let rightSidebar;
let activeUsersListEl; // <ul class="active-users-list" id="activeUsersList"> - POPRAWKA: Nazwa zmiennej dla prawego sidebara
let noActiveUsersText; // <div id="noActiveUsersText"> - POPRAWKA: Dodana zmienna

let userId; // ID zalogowanego użytkownika
let activeChatRecipientId = null; // ID użytkownika, z którym obecnie czatujemy (dla czatów 1-na-1)
let activeChatRecipientName = ''; // Nazwa użytkownika, z którym obecnie czatujemy

// NOWE: Aktualna lista ID użytkowników, którzy są online (aktualizowana przez WebSocket)
let activeUsersOnlineIds = [];

// WebSocket
let socket;
const websocketUrl = 'wss://firm-chat-app-backend.onrender.com'; // Upewnij się, że to jest poprawny URL Twojego backendu WebSocket

// ==========================================================
// Funkcje pomocnicze
// ==========================================================

/**
 * Pobiera element DOM po jego ID. Loguje błąd, jeśli element nie zostanie znaleziony.
 * @param {string} id ID elementu DOM.
 * @returns {HTMLElement | null} Element DOM lub null.
 */
function getElement(id) {
    const element = document.getElementById(id);
    if (!element) {
        console.error(`Błąd: Element o ID '${id}' nie został znaleziony.`);
    }
    return element;
}

/**
 * Generuje unikalny ID pokoju czatu z dwóch ID użytkowników (alfabetycznie posortowane).
 * @param {string} userId1 ID pierwszego użytkownika.
 * @param {string} userId2 ID drugiego użytkownika.
 * @returns {string} Unikalny ID pokoju.
 */
function generateRoomId(userId1, userId2) {
    const sortedIds = [userId1, userId2].sort();
    return `${sortedIds[0]}_${sortedIds[1]}`;
}

// ==========================================================
// Inicjalizacja elementów DOM
// ==========================================================
function initializeDOMElements() {
    console.log('[initializeDOMElements] Rozpoczynanie inicjalizacji elementów DOM.');

    mainHeader = getElement('mainHeader');
    menuButton = getElement('menuButton');
    dropdownMenu = getElement('dropdownMenu');
    themeToggle = getElement('themeToggle');
    logoutButton = getElement('logoutButton');

    container = getElement('container');
    sidebarWrapper = document.querySelector('.sidebar-wrapper');
    mainNavIcons = document.querySelector('.main-nav-icons');
    navIcons = document.querySelectorAll('.nav-icon');

    onlineUsersMobile = getElement('onlineUsersMobile'); // Sprawdź czy to ID czy klasa w HTML
    
    // POPRAWKA: Poprawna inicjalizacja sidebara i jego elementów
    sidebarEl = getElement('sidebar');
    if (!sidebarEl) console.error("Element z ID 'sidebar' nie znaleziony. Sprawdź chat.html");

    searchInput = getElement('sidebarSearchInput');
    contactsListEl = getElement('contactsList'); // POPRAWKA: Upewnienie się, że contactsListEl jest pobierane
    if (!contactsListEl) console.error("Element z ID 'contactsList' nie znaleziony. Sprawdź chat.html");
    
    searchBar = document.querySelector('.search-bar'); // NOWE: Element paska wyszukiwania
    if (!searchBar) console.warn("Element z klasą 'search-bar' nie znaleziony.");

    chatAreaWrapper = document.querySelector('.chat-area-wrapper');
    logoScreen = getElement('logoScreen');
    chatArea = getElement('chatArea');

    chatHeader = document.querySelector('.chat-header');
    backButton = getElement('backButton');
    chatUserAvatar = getElement('chatUserAvatar'); // POPRAWKA: Inicjalizacja zmiennej
    if (!chatUserAvatar) console.warn("Element z ID 'chatUserAvatar' nie znaleziony.");
    
    chatUserName = getElement('chatUserName');
    userStatusSpan = getElement('userStatus');
    chatHeaderActions = document.querySelector('.chat-header-actions');
    chatSettingsButton = getElement('chatSettingsButton');
    chatSettingsDropdown = getElement('chatSettingsDropdown');
    typingStatusHeader = getElement('typingStatus');
    typingIndicatorMessages = getElement('typingIndicator');

    chatMessages = getElement('chatMessages');
    messageInput = getElement('messageInput');
    sendButton = getElement('sendButton');
    emojiButton = document.querySelector('.emoji-button');
    attachButton = document.querySelector('.attach-button');
    rightSidebarWrapper = document.querySelector('.right-sidebar-wrapper');
    rightSidebar = getElement('rightSidebar');
    activeUsersListEl = getElement('activeUsersList'); // POPRAWKA: Użycie nowej nazwy zmiennej
    if (!activeUsersListEl) console.error("Element z ID 'activeUsersList' nie znaleziony. Sprawdź chat.html");
    
    noActiveUsersText = getElement('noActiveUsersText'); // POPRAWKA: Inicjalizacja zmiennej
    if (!noActiveUsersText) console.warn("Element z ID 'noActiveUsersText' nie znaleziony.");


    console.log('[initializeDOMElements] Zakończono inicjalizację elementów DOM.');
}

// ==========================================================
// Obsługa WebSocket
// ==========================================================
function initializeWebSocket() {
    console.log(`[WebSocket] Próba połączenia z serwerem: ${websocketUrl}`);
    socket = new WebSocket(websocketUrl);

    socket.onopen = () => {
        console.log('[WebSocket] Połączono z serwerem WebSocket.');
        if (userId) {
            socket.send(JSON.stringify({ type: 'auth', userId: userId }));
        }
    };

    socket.onmessage = (event) => {
        handleWebSocketMessage(event);
    };

    socket.onclose = (event) => {
        console.log('[WebSocket] Rozłączono z serwerem WebSocket:', event.code, event.reason);
        // Próba ponownego połączenia po 3 sekundach
        setTimeout(initializeWebSocket, 3000);
    };

    socket.onerror = (error) => {
        console.error('[WebSocket] Błąd WebSocket:', error);
    };
}

function handleWebSocketMessage(message) {
    try {
        const data = JSON.parse(message.data);
        console.log('[WebSocket] Otrzymano wiadomość:', data);

        switch (data.type) {
            case 'auth_success':
                userId = data.userId;
                localStorage.setItem('chat_user_id', userId); // Zapisz ID użytkownika po udanej autoryzacji
                console.log('[WebSocket] Zalogowano jako użytkownik ID:', userId);
                loadConversations(); // Wywołaj ładowanie konwersacji po udanej autoryzacji
                break;
            case 'user_list':
                activeUsersOnlineIds = data.users; // Aktualizuj globalną listę aktywnych ID
                console.log('[WebSocket] Aktywni użytkownicy (ID):', activeUsersOnlineIds);
                updateActiveUsersListUI(activeUsersOnlineIds); // Zaktualizuj prawy sidebar
                loadConversations(); // Odśwież lewy sidebar ze statusami online
                break;
            case 'user_status':
                // Ta wiadomość jest zazwyczaj redundantna, jeśli serwer wysyła pełną 'user_list' po każdej zmianie statusu
                console.log(`[WebSocket] Użytkownik ${data.userId} jest teraz ${data.status}.`);
                break;
            case 'chat_message':
                // Wyświetl wiadomość tylko, jeśli jest dla nas lub od nas w aktywnej konwersacji
                if ((data.senderId === activeChatRecipientId && data.receiverId === userId) ||
                    (data.senderId === userId && data.receiverId === activeChatRecipientId)) {
                    displayMessage(data); // Funkcja do wyświetlania wiadomości w UI
                }
                break;
            case 'typing_status':
                updateTypingStatus(data.senderId, data.isTyping);
                break;
            case 'error':
                console.error('[WebSocket] Błąd z serwera:', data.message);
                break;
            default:
                console.warn('[WebSocket] Nieznany typ wiadomości WebSocket:', data.type);
                break;
        }
    } catch (e) {
        console.error('[WebSocket] Błąd parsowania wiadomości WebSocket:', e, message.data);
    }
}

// ==========================================================
// Obsługa UI - Renderowanie list
// ==========================================================

/**
 * Aktualizuje UI listy aktywnych użytkowników (prawy sidebar).
 * @param {string[]} onlineUserIds Tablica ID użytkowników online.
 */
async function updateActiveUsersListUI(onlineUserIds) {
    if (!activeUsersListEl) {
        console.error("activeUsersListEl element not found in updateActiveUsersListUI.");
        return;
    }

    activeUsersListEl.innerHTML = ''; // Wyczyść obecną listę
    let usersOnlineCount = 0;

    const filteredOnlineUserIds = onlineUserIds.filter(id => id !== userId); // Odfiltruj bieżącego użytkownika

    if (filteredOnlineUserIds.length === 0) {
        if (noActiveUsersText) noActiveUsersText.style.display = 'block';
    } else {
        if (noActiveUsersText) noActiveUsersText.style.display = 'none';

        for (const id of filteredOnlineUserIds) {
            const userLabel = await getUserLabelById(id);
            if (userLabel) {
                const listItem = document.createElement('li');
                listItem.classList.add('active-user-item'); // Dodaj klasę do stylizacji
                listItem.dataset.userId = id;
                listItem.innerHTML = `
                    <div class="user-avatar">${userLabel.charAt(0).toUpperCase()}</div>
                    <span>${userLabel}</span>
                    <span class="status online"></span>
                `;
                activeUsersListEl.appendChild(listItem);
                usersOnlineCount++;
            }
        }
    }
    console.log(`[updateActiveUsersListUI] Zaktualizowano listę aktywnych użytkowników. Online: ${usersOnlineCount}`);
}

/**
 * Renderuje pojedynczy element konwersacji na liście.
 * @param {object} convo Obiekt konwersacji zawierający userId, lastMessage, timestamp itp.
 * @param {boolean} isOnline Czy użytkownik jest aktualnie online.
 * @param {string} userLabel Nazwa użytkownika do wyświetlenia.
 */
function renderConversationItem(convo, isOnline, userLabel) {
    console.log(`[renderConversationItem] Rozpoczynanie renderowania elementu dla ${userLabel}. Online: ${isOnline}`);

    const conversationItem = document.createElement('li');
    conversationItem.classList.add('conversation-item');
    conversationItem.dataset.userId = convo.userId;

    const lastMessageText = convo.lastMessage || 'Rozpocznij rozmowę';
    const date = new Date(convo.timestamp || new Date());
    const timeString = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    // POPRAWKA: Wstawienie inicjału do avatara i dodanie wszystkich klas CSS
    conversationItem.innerHTML = `
        <div class="user-avatar">${userLabel.charAt(0).toUpperCase()}</div>
        <div class="conversation-info">
            <span class="conversation-name">${userLabel}</span>
            <span class="last-message">${lastMessageText}</span>
        </div>
        <div class="conversation-meta">
            <span class="last-message-time">${timeString}</span>
            <span class="status ${isOnline ? 'online' : 'offline'}"></span>
        </div>
    `;

    conversationItem.addEventListener('click', () => {
        const currentActive = document.querySelector('.conversation-item.active');
        if (currentActive) {
            currentActive.classList.remove('active');
        }
        conversationItem.classList.add('active');

        console.log(`[UI] Kliknięto konwersację z ${userLabel} (ID: ${convo.userId})`);
        activeChatRecipientId = convo.userId;
        activeChatRecipientName = userLabel;
        
        // POPRAWKA: Aktualizacja nagłówka czatu
        if (chatUserName) chatUserName.textContent = activeChatRecipientName;
        if (chatUserAvatar) chatUserAvatar.textContent = activeChatRecipientName.charAt(0).toUpperCase();
        
        if (userStatusSpan) {
            if (isOnline) {
                userStatusSpan.classList.remove('offline');
                userStatusSpan.classList.add('online');
                userStatusSpan.textContent = 'Online';
            } else {
                userStatusSpan.classList.remove('online');
                userStatusSpan.classList.add('offline');
                userStatusSpan.textContent = 'Offline';
            }
        }

        showChatArea();
        if (messageInput) messageInput.disabled = false;
        if (sendButton) sendButton.disabled = false;

        if (socket && socket.readyState === WebSocket.OPEN) {
            const roomId = generateRoomId(userId, activeChatRecipientId);
            socket.send(JSON.stringify({ type: 'join_room', roomId: roomId }));
            console.log(`[WebSocket] Dołączono do pokoju: ${roomId}`);
        }
        // Tutaj docelowo załaduj historię wiadomości
        // loadMessages(userId, activeChatRecipientId);
    });

    if (contactsListEl) {
        contactsListEl.appendChild(conversationItem);
        console.log(`[renderConversationItem] Element dodany do DOM: ${userLabel}`);
    } else {
        console.error(`[renderConversationItem] Nie można dodać elementu konwersacji (${userLabel}) do DOM. contactsListEl nie jest zdefiniowane.`);
    }
}

/**
 * Ładuje wszystkie profile użytkowników i renderuje je jako elementy konwersacji w lewym sidebarze.
 */
async function loadConversations() {
    console.log(`[loadConversations] Rozpoczynanie ładowania wszystkich zarejestrowanych użytkowników dla userId: ${userId}`);
    if (contactsListEl) {
        contactsListEl.innerHTML = ''; // POPRAWKA: Wyczyść listę przed załadowaniem
        console.log('[loadConversations] Wyczyścino listę konwersacji.');
    }

    try {
        const profiles = await loadAllProfiles();
        console.log('[loadConversations] Pobrane wszystkie zarejestrowane profile:', profiles);

        if (!profiles || profiles.length === 0) {
            console.log('[loadConversations] Brak zarejestrowanych użytkowników do wyświetlenia.');
            return;
        }

        const profilesToDisplay = profiles.filter(p => p.id !== userId);
        console.log('[loadConversations] Profile do wyświetlenia (po odfiltrowaniu siebie):', profilesToDisplay);

        if (profilesToDisplay.length === 0) {
            console.log('[loadConversations] Brak innych zarejestrowanych użytkowników do wyświetlenia.');
            const noUsersItem = document.createElement('li');
            noUsersItem.textContent = 'Brak innych użytkowników w systemie.';
            noUsersItem.style.padding = '10px';
            noUsersItem.style.textAlign = 'center';
            noUsersItem.style.color = 'var(--text-color-medium)';
            if (contactsListEl) {
                contactsListEl.appendChild(noUsersItem);
            }
            return;
        }

        for (const profile of profilesToDisplay) {
            const userLabel = profile.label;
            const isOnline = activeUsersOnlineIds.includes(profile.id); // Sprawdź globalną listę aktywnych ID
            
            // Tymczasowe dane ostatniej wiadomości (docelowo z bazy danych)
            const convoData = {
                userId: profile.id,
                lastMessage: `Ostatnia wiadomość z ${userLabel}`,
                timestamp: new Date()
            };
            
            console.log(`[loadConversations] Próba renderowania profilu jako konwersacji: ${userLabel}, ID: ${convoData.userId}, Online: ${isOnline}`);
            renderConversationItem(convoData, isOnline, userLabel);
        }
        console.log('[loadConversations] Zakończono ładowanie i renderowanie konwersacji.');

    } catch (err) {
        console.error('Błąd podczas ładowania konwersacji:', err);
    }
}

/**
 * Dodaje wiadomość do obszaru czatu.
 * @param {object} message Obiekt wiadomości { senderId, receiverId, content, created_at }
 */
function displayMessage(message) {
    if (!chatMessages) {
        console.error("chatMessages element not found.");
        return;
    }

    const messageElement = document.createElement('div');
    messageElement.classList.add('chat-message');
    
    if (message.senderId === userId) {
        messageElement.classList.add('sent');
    } else {
        messageElement.classList.add('received');
    }

    const time = new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    messageElement.innerHTML = `
        <div class="message-content">${message.content}</div>
        <div class="message-time">${time}</div>
    `;
    chatMessages.appendChild(messageElement);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    console.log(`[UI] Wyświetlono wiadomość: "${message.content}"`);
}

/**
 * Aktualizuje status pisania w nagłówku czatu.
 * @param {string} senderId ID użytkownika, który pisze.
 * @param {boolean} isTyping Czy użytkownik pisze.
 */
function updateTypingStatus(senderId, isTyping) {
    if (!typingStatusHeader || !typingIndicatorMessages) return;

    if (senderId === activeChatRecipientId) {
        if (isTyping) {
            typingStatusHeader.textContent = 'Pisze...';
            typingIndicatorMessages.classList.remove('hidden');
        } else {
            typingStatusHeader.textContent = '';
            typingIndicatorMessages.classList.add('hidden');
        }
    }
}

// ==========================================================
// Obsługa widoczności obszarów czatu/logo i responsywności
// ==========================================================

function showChatArea() {
    if (logoScreen) logoScreen.classList.add('hidden');
    if (chatArea) chatArea.classList.add('active');
    if (chatAreaWrapper) chatAreaWrapper.classList.add('active-on-mobile');

    if (window.matchMedia('(max-width: 768px)').matches) {
        if (sidebarWrapper) sidebarWrapper.classList.add('hidden-on-mobile');
        if (backButton) backButton.style.display = 'block';
        if (rightSidebarWrapper) rightSidebarWrapper.style.display = 'none';
    }
}

function showLogoScreen() {
    if (logoScreen) logoScreen.classList.remove('hidden');
    if (chatArea) chatArea.classList.remove('active');
    if (chatAreaWrapper) chatAreaWrapper.classList.remove('active-on-mobile');

    if (window.matchMedia('(max-width: 768px)').matches) {
        if (sidebarWrapper) sidebarWrapper.classList.remove('hidden-on-mobile');
        if (backButton) backButton.style.display = 'none';
        if (rightSidebarWrapper) rightSidebarWrapper.style.display = 'none';
    }
}

function handleMediaQueryChange(mq) {
    if (mq.matches) { // Tryb mobilny (max-width: 768px)
        console.log("[handleMediaQueryChange] Media Query: Tryb mobilny aktywowany.");
        if (sidebarWrapper) {
            sidebarWrapper.classList.remove('hidden-on-mobile');
        }
        if (chatAreaWrapper) {
            chatAreaWrapper.classList.remove('active-on-mobile');
            chatAreaWrapper.style.display = 'none';
        }
        if (backButton) {
            backButton.style.display = 'none';
        }
        if (rightSidebarWrapper) {
            rightSidebarWrapper.style.display = 'none';
        }

        // POPRAWKA: Logika dla startu na mobile
        if (activeChatRecipientId) { // Jeśli jest aktywna konwersacja, pokaż obszar czatu
            showChatArea();
        } else { // W przeciwnym razie pokaż ekran logo (co na mobile oznacza widoczny sidebar)
            showLogoScreen();
        }

    } else { // Tryb desktopowy (min-width: 769px)
        console.log("[handleMediaQueryChange] Media Query: Tryb desktopowy aktywowany.");
        if (sidebarWrapper) {
            sidebarWrapper.classList.remove('hidden-on-mobile');
            sidebarWrapper.style.display = 'flex';
        }
        if (chatAreaWrapper) {
            chatAreaWrapper.classList.remove('active-on-mobile');
            chatAreaWrapper.style.display = 'flex';
        }
        if (logoScreen) {
            logoScreen.classList.remove('hidden');
        }
        if (chatArea) {
            chatArea.classList.remove('active');
        }
        if (rightSidebarWrapper) {
            rightSidebarWrapper.style.display = 'flex';
        }
        if (backButton) {
            backButton.style.display = 'none';
        }
    }
}

// ==========================================================
// Główna funkcja inicjalizująca aplikację
// ==========================================================
function initializeApp() {
    console.log("[initializeApp] Rozpoczęcie inicjalizacji aplikacji Komunikator.");
    initializeDOMElements(); // Inicjalizacja wszystkich zmiennych DOM

    // Sprawdzenie, czy użytkownik jest zalogowany (lub symulacja)
    let storedUserId = localStorage.getItem('chat_user_id');
    if (storedUserId) {
        userId = storedUserId;
        console.log(`[initializeApp] Znaleziono ID użytkownika w localStorage: ${userId}`);
        initializeWebSocket(); // Rozpocznij połączenie WebSocket po zalogowaniu
    } else {
        console.log("[initializeApp] Brak ID użytkownika w localStorage. Generowanie tymczasowego ID i inicjalizacja.");
        userId = crypto.randomUUID(); // Generuje unikalne ID
        // Nie zapisujemy od razu w localStorage, czekamy na 'auth_success' z serwera,
        // aby upewnić się, że serwer zaakceptował ID i wysłał auth_success.
        initializeWebSocket();
    }

    // Inicjalizacja nasłuchiwania zdarzeń UI
    if (menuButton) {
        menuButton.addEventListener('click', () => {
            if (dropdownMenu) dropdownMenu.classList.toggle('hidden');
        });
    }

    if (themeToggle) {
        themeToggle.addEventListener('click', () => {
            document.body.classList.toggle('dark-theme');
            const isDark = document.body.classList.contains('dark-theme');
            if (themeToggle.querySelector('i')) {
                themeToggle.querySelector('i').className = isDark ? 'fas fa-sun' : 'fas fa-moon';
            }
            themeToggle.innerHTML = `${isDark ? '<i class="fas fa-sun"></i> Tryb jasny' : '<i class="fas fa-moon"></i> Tryb ciemny'}`;
            localStorage.setItem('theme', isDark ? 'dark' : 'light');
        });
        const savedTheme = localStorage.getItem('theme');
        if (savedTheme === 'dark') {
            document.body.classList.add('dark-theme');
            if (themeToggle.querySelector('i')) {
                themeToggle.querySelector('i').className = 'fas fa-sun';
            }
            themeToggle.innerHTML = '<i class="fas fa-sun"></i> Tryb jasny';
        }
    }

    if (logoutButton) {
        logoutButton.addEventListener('click', () => {
            localStorage.removeItem('chat_user_id');
            userId = null;
            activeChatRecipientId = null;
            if (socket && socket.readyState === WebSocket.OPEN) {
                socket.close(); // Zamknij połączenie WebSocket
            }
            window.location.reload(); // Odśwież stronę, aby wyczyścić stan aplikacji
        });
    }

    // Obsługa kliknięć ikon nawigacyjnych (Rozmowy, Aktywni)
    if (navIcons) {
        navIcons.forEach(icon => {
            icon.addEventListener('click', (event) => {
                navIcons.forEach(i => i.classList.remove('active')); // Usuń active ze wszystkich
                event.currentTarget.classList.add('active'); // Dodaj active do klikniętej

                const tooltip = event.currentTarget.dataset.tooltip;
                if (tooltip === 'Rozmowy') {
                    // Pokaż lewy sidebar, ukryj prawy
                    if (sidebarEl) {
                        sidebarEl.style.display = 'flex';
                        sidebarEl.classList.remove('hidden-on-mobile'); // Upewnij się, że nie jest ukryty na mobile
                    }
                    if (searchBar) searchBar.style.display = 'flex'; // Pokaż pasek wyszukiwania
                    if (contactsListEl) contactsListEl.style.display = 'block'; // Pokaż listę kontaktów

                    if (rightSidebarWrapper) rightSidebarWrapper.style.display = 'none'; // Ukryj prawy sidebar
                    if (onlineUsersMobile) onlineUsersMobile.style.display = 'none'; // Ukryj listę mobilną

                    loadConversations(); // Odśwież listę konwersacji
                } else if (tooltip === 'Aktywni') {
                    // Ukryj lewy sidebar, pokaż prawy
                    if (sidebarEl) {
                        sidebarEl.style.display = 'none';
                        sidebarEl.classList.add('hidden-on-mobile'); // Ukryj na mobile, jeśli przejście na aktywnych
                    }
                    if (searchBar) searchBar.style.display = 'none'; // Ukryj pasek wyszukiwania
                    if (contactsListEl) contactsListEl.style.display = 'none'; // Ukryj listę kontaktów

                    if (rightSidebarWrapper) rightSidebarWrapper.style.display = 'flex'; // Pokaż prawy sidebar
                    // POPRAWKA: Pokaż onlineUsersMobile tylko jeśli jest tryb mobilny i aktywni użytkownicy są na mobile
                    if (onlineUsersMobile && window.matchMedia('(max-width: 768px)').matches) {
                        onlineUsersMobile.style.display = 'block';
                    } else if (onlineUsersMobile) {
                        onlineUsersMobile.style.display = 'none';
                    }

                    // Wymuś aktualizację listy aktywnych użytkowników z serwera
                    if (socket && socket.readyState === WebSocket.OPEN) {
                         socket.send(JSON.stringify({ type: 'request_user_list' }));
                    }
                }
                // Dodałbym również obsługę dla innych ikon, jeśli istnieją, np. 'Ustawienia'
            });
        });
    }

    // Obsługa przycisku "Wstecz" na urządzeniach mobilnych
    if (backButton) {
        backButton.addEventListener('click', () => {
            showLogoScreen(); // Wróć do ekranu logo/listy konwersacji
            if (messageInput) messageInput.disabled = true;
            if (sendButton) sendButton.disabled = true;
            
            // POPRAWKA: Opuść pokój WebSocket, jeśli byłeś w jakimś
            if (activeChatRecipientId && userId && socket && socket.readyState === WebSocket.OPEN) {
                const currentRoomId = generateRoomId(userId, activeChatRecipientId);
                socket.send(JSON.stringify({ type: 'leave_room', roomId: currentRoomId }));
                console.log(`[WebSocket] Opuszczono pokój: ${currentRoomId}`);
            }
            activeChatRecipientId = null; // Zresetuj aktywnego odbiorcę
            activeChatRecipientName = ''; // Zresetuj nazwę odbiorcy
        });
    }

    // Obsługa wysyłania wiadomości
    if (sendButton) {
        sendButton.addEventListener('click', () => {
            const content = messageInput.value.trim();
            if (content && activeChatRecipientId && userId) {
                const chatMessage = {
                    type: 'chat_message',
                    senderId: userId,
                    receiverId: activeChatRecipientId,
                    content: content,
                    created_at: new Date().toISOString() // Dodaj timestamp od klienta
                };
                socket.send(JSON.stringify(chatMessage));
                messageInput.value = ''; // Wyczyść pole wprowadzania
                // Wyświetl wiadomość od razu w swoim czacie (bez czekania na serwer)
                displayMessage(chatMessage);
            }
        });
    }

    // Nasłuchiwanie na Enter w polu wiadomości
    if (messageInput) {
        messageInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault(); // Zapobiegaj nowej linii w polu tekstowym
                sendButton.click(); // Symuluj kliknięcie przycisku "Wyślij"
            }
        });
        
        let typingTimeout;
        messageInput.addEventListener('input', () => {
            if (socket && socket.readyState === WebSocket.OPEN && activeChatRecipientId) {
                socket.send(JSON.stringify({ type: 'typing_status', senderId: userId, receiverId: activeChatRecipientId, isTyping: true }));
                clearTimeout(typingTimeout);
                typingTimeout = setTimeout(() => {
                    socket.send(JSON.stringify({ type: 'typing_status', senderId: userId, receiverId: activeChatRecipientId, isTyping: false }));
                }, 3000);
            }
        });
    }

    // Dołącz nasłuchiwanie zapytania mediów i wywołaj obsługę początkowo
    const mq = window.matchMedia('(max-width: 768px)');
    mq.addListener(handleMediaQueryChange);
    handleMediaQueryChange(mq);

    console.log("[initializeApp] Aplikator Komunikator zainicjalizowany pomyślnie.");
}

// Uruchomienie aplikacji po załadowaniu DOM
document.addEventListener('DOMContentLoaded', initializeApp);