// chat.js
// Importy zależności
import { loadAllProfiles, getUserLabelById, getProfileById } from './profiles.js';
import { supabase } from './supabaseClient.js';

// ==========================================================
// Globalne zmienne UI i czatu
// ==========================================================
let mainHeader;
let menuButton;
let dropdownMenu;
let themeToggle;
let logoutButton;

let container;
let sidebarWrapper;
let mainNavIcons;
let navIcons;

let onlineUsersMobile; // Kontener dla aktywnych użytkowników na mobile

let sidebarEl; // <aside class="sidebar" id="sidebar">
let searchInput; // <input id="sidebarSearchInput">
let contactsListEl; // <ul class="conversations-list" id="contactsList">

let chatAreaWrapper; // <div class="chat-area-wrapper">
let logoScreen; // <div id="logoScreen">
let chatArea; // <section class="chat-area" id="chatArea">

let chatHeader; // <div class="chat-header">
let backButton; // <button id="backButton">
let chatUserAvatar; // <div class="user-avatar" id="chatUserAvatar">
let chatUserName; // <span id="chatUserName">
let userStatusSpan; // <span id="userStatus">
let chatHeaderActions; // <div class="chat-header-actions">
let chatSettingsButton; // <button id="chatSettingsButton">
let chatSettingsDropdown; // <div id="chatSettingsDropdown">
let typingStatusHeader; // <span id="typingStatus"> (w nagłówku)
let typingIndicatorMessages; // <div id="typingIndicator"> (animowane kropki)

let chatMessages; // <div class="chat-messages" id="chatMessages"> - kontener na wiadomości w aktywnym czacie
let messageInput; // <input id="messageInput">
let sendButton; // <button id="sendButton">
let emojiButton; // <button class="emoji-button">
let attachButton; // <button class="attach-button">

let rightSidebarWrapper; // <aside class="right-sidebar-wrapper">
let rightSidebar; // <div class="right-sidebar" id="rightSidebar">
let activeUsersList; // <ul class="active-users-list" id="activeUsersList"> (prawy sidebar)
let noActiveUsersText; // <div id="noActiveUsersText">

let userId; // ID zalogowanego użytkownika
let activeChatRecipientId = null; // ID użytkownika, z którym obecnie czatujemy (dla czatów 1-na-1)
let activeChatRecipientName = ''; // Nazwa użytkownika, z którym obecnie czatujemy

let socket; // Zmienna do przechowywania połączenia WebSocket
let activeUsers = new Set(); // Przechowuje ID aktywnych użytkowników (Set dla szybkiego sprawdzania)

// ==========================================================
// Funkcje pomocnicze
// ==========================================================

/**
 * Generuje unikalne ID pokoju dla czatów 1-na-1 na podstawie dwóch ID użytkowników.
 * Zapewnia, że room_id jest zawsze taki sam dla danej pary użytkowników, niezależnie od kolejności ID.
 * @param {string} userId1 Pierwsze ID użytkownika.
 * @param {string} userId2 Drugie ID użytkownika.
 * @returns {string} Unikalne ID pokoju.
 */
function generateRoomId(userId1, userId2) {
    const sortedIds = [userId1, userId2].sort();
    return `${sortedIds[0]}_${sortedIds[1]}`;
}

/**
 * Funkcja pomocnicza do pobierania elementów DOM.
 * @param {string} idOrSelector ID elementu lub selektor CSS.
 * @param {boolean} isQuerySelector Czy użyć document.querySelector (true) czy document.getElementById (false).
 * @returns {HTMLElement|null} Znaleziony element DOM lub null.
 */
function getElement(idOrSelector, isQuerySelector = false) {
    const element = isQuerySelector ? document.querySelector(idOrSelector) : document.getElementById(idOrSelector);
    if (!element) {
        console.warn(`[getElement] Element with ${isQuerySelector ? 'selector' : 'ID'} "${idOrSelector}" not found.`);
    }
    return element;
}

// ==========================================================
// Inicjalizacja elementów DOM
// ==========================================================
function initializeDOMElements() {
    mainHeader = getElement('.main-header', true);
    menuButton = getElement('menuButton');
    dropdownMenu = getElement('dropdownMenu');
    themeToggle = getElement('themeToggle');
    logoutButton = getElement('logoutButton');

    container = getElement('.container', true);
    sidebarWrapper = getElement('.sidebar-wrapper', true);
    mainNavIcons = getElement('.main-nav-icons', true);
    navIcons = document.querySelectorAll('.nav-icon'); // NodeList dla wszystkich ikon nawigacyjnych

    onlineUsersMobile = getElement('onlineUsersMobile');

    sidebarEl = getElement('sidebar');
    searchInput = getElement('sidebarSearchInput');
    contactsListEl = getElement('contactsList'); // <ul class="conversations-list" id="contactsList">

    chatAreaWrapper = getElement('.chat-area-wrapper', true);
    logoScreen = getElement('logoScreen');
    chatArea = getElement('chatArea');

    chatHeader = getElement('.chat-header', true);
    backButton = getElement('backButton');
    chatUserAvatar = getElement('chatUserAvatar');
    chatUserName = getElement('chatUserName');
    userStatusSpan = getElement('userStatus');
    chatHeaderActions = getElement('.chat-header-actions', true);
    chatSettingsButton = getElement('chatSettingsButton');
    chatSettingsDropdown = getElement('chatSettingsDropdown');
    typingStatusHeader = getElement('typingStatus'); // POPRAWIONE ID!
    typingIndicatorMessages = getElement('typingIndicator');

    chatMessages = document.querySelector('.chat-messages');

    messageInput = getElement('messageInput');
    sendButton = getElement('sendButton');
    emojiButton = getElement('.emoji-button', true);
    attachButton = getElement('.attach-button', true);

    rightSidebarWrapper = getElement('.right-sidebar-wrapper', true);
    rightSidebar = getElement('rightSidebar');
    activeUsersList = getElement('activeUsersList');
    noActiveUsersText = getElement('noActiveUsersText');

    console.log('[initializeDOMElements] contactsListEl:', contactsListEl);
    console.log('[initializeDOMElements] sidebarEl:', sidebarEl);
}

// ==========================================================
// Obsługa motywu (dzień/noc)
// ==========================================================
function applySavedTheme() {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme) {
        document.body.classList.add(savedTheme);
        if (themeToggle) {
            themeToggle.querySelector('i').className = savedTheme === 'dark-theme' ? 'fas fa-sun' : 'fas fa-moon';
            themeToggle.innerHTML = savedTheme === 'dark-theme' ? '<i class="fas fa-sun"></i> Tryb jasny' : '<i class="fas fa-moon"></i> Tryb ciemny';
        }
    } else {
        document.body.classList.add('light-theme'); // Domyślny motyw
        if (themeToggle) {
            themeToggle.querySelector('i').className = 'fas fa-moon';
            themeToggle.innerHTML = '<i class="fas fa-moon"></i> Tryb ciemny';
        }
    }
}

function toggleTheme() {
    const currentTheme = document.body.classList.contains('dark-theme') ? 'dark-theme' : 'light-theme';
    if (currentTheme === 'dark-theme') {
        document.body.classList.remove('dark-theme');
        document.body.classList.add('light-theme');
        localStorage.setItem('theme', 'light-theme');
        if (themeToggle) {
            themeToggle.querySelector('i').className = 'fas fa-moon';
            themeToggle.innerHTML = '<i class="fas fa-moon"></i> Tryb ciemny';
        }
    } else {
        document.body.classList.remove('light-theme');
        document.body.classList.add('dark-theme');
        localStorage.setItem('theme', 'dark-theme');
        if (themeToggle) {
            themeToggle.querySelector('i').className = 'fas fa-sun';
            themeToggle.innerHTML = '<i class="fas fa-sun"></i> Tryb jasny';
        }
    }
}

// ==========================================================
// Obsługa menu rozwijanego
// ==========================================================
function toggleDropdownMenu() {
    if (dropdownMenu) {
        dropdownMenu.classList.toggle('hidden');
        menuButton.setAttribute('aria-expanded', dropdownMenu.classList.contains('hidden') ? 'false' : 'true');
    }
}

// Zamknij menu rozwijane, jeśli kliknięto poza nim
document.addEventListener('click', (event) => {
    if (dropdownMenu && !dropdownMenu.classList.contains('hidden')) {
        if (!menuButton.contains(event.target) && !dropdownMenu.contains(event.target)) {
            dropdownMenu.classList.add('hidden');
            menuButton.setAttribute('aria-expanded', 'false');
        }
    }
    // Zamknij również dropdown ustawień czatu
    if (chatSettingsDropdown && !chatSettingsDropdown.classList.contains('hidden')) {
        if (!chatSettingsButton.contains(event.target) && !chatSettingsDropdown.contains(event.target)) {
            chatSettingsDropdown.classList.add('hidden');
        }
    }
});


// ==========================================================
// Autoryzacja i wylogowanie
// ==========================================================
async function logoutUser() {
    try {
        const { error } = await supabase.auth.signOut();
        if (error) throw error;
        console.log('Wylogowano pomyślnie.');
        window.location.href = '/'; // Przekieruj na stronę główną lub logowania
    } catch (err) {
        console.error('Błąd podczas wylogowania:', err.message);
        alert('Wystąpił błąd podczas wylogowania: ' + err.message);
    }
}

// ==========================================================
// Obsługa WebSocket
// ==========================================================
function setupWebSocket() {
    const wsUrl = 'wss://firm-chat-app-backend.onrender.com'; // Upewnij się, że to jest POPRAWNY URL Twojego serwera!

    if (socket && socket.readyState === WebSocket.OPEN) {
        console.log('WebSocket jest już otwarty, nie tworzę nowego połączenia.');
        return;
    }

    console.log(`Próba połączenia z WebSocket: ${wsUrl}`);
    socket = new WebSocket(wsUrl);

    socket.onopen = () => {
        console.log('Połączono z serwerem WebSocket.');
        socket.send(JSON.stringify({ type: 'auth', userId: userId }));
    };

    socket.onmessage = (message) => {
        handleWebSocketMessage(message);
    };

    socket.onerror = (error) => {
        console.error('Błąd WebSocket:', error);
    };

    socket.onclose = (event) => {
        console.log(`Rozłączono z serwerem WebSocket. Kod: ${event.code} Powód: ${event.reason}`);
        if (event.code !== 1000) {
            console.log('Próba ponownego połączenia za 5 sekund...');
            setTimeout(setupWebSocket, 5000);
        }
    };
}

/**
 * Obsługuje wiadomości otrzymane przez WebSocket.
 * @param {MessageEvent} message Zdarzenie wiadomości WebSocket.
 */
function handleWebSocketMessage(message) {
    try {
        const data = JSON.parse(message.data);
        console.log('[WebSocket] Otrzymano wiadomość:', data); // Loguj każdą wiadomość WebSocket

        switch (data.type) {
            case 'auth_success':
                userId = data.userId;
                console.log('Zalogowano jako użytkownik ID:', userId);
                loadConversations(); // Wywołaj ładowanie konwersacji po udanej autoryzacji
                break;
            case 'user_list':
                activeUsers = new Set(data.users);
                console.log('[WebSocket] Aktualna lista aktywnych użytkowników:', Array.from(activeUsers));
                updateActiveUsersList(data.users);
                updateConversationStatuses();
                break;
            case 'user_status':
                if (data.status === 'online') {
                    activeUsers.add(data.userId);
                } else {
                    activeUsers.delete(data.userId);
                }
                console.log(`[WebSocket] Użytkownik ${data.userId} zmienił status na ${data.status}. Aktywni:`, Array.from(activeUsers));
                updateActiveUsersList(Array.from(activeUsers));
                updateConversationStatuses();
                break;
            case 'chat_message':
                console.log('[WebSocket] Otrzymano wiadomość czatu:', data);
                if (activeChatRecipientId === data.senderId || activeChatRecipientId === data.receiverId) {
                    displayMessage(data.senderId, data.content, data.created_at); // Użyj 'created_at' z bazy danych
                }
                // Nie wywołujemy loadConversations() tutaj, bo chcemy zawsze wyświetlać WSZYSTKICH zarejestrowanych.
                // loadConversations(); // <--- ZAKOMENTOWANE zgodnie z ustaleniami
                break;
            case 'typing_status':
                if (activeChatRecipientId === data.senderId) {
                    if (data.isTyping) {
                        displayTypingIndicator(data.senderId);
                    } else {
                        hideTypingIndicator(data.senderId);
                    }
                }
                break;
            case 'error':
                console.error('[WebSocket Error]:', data.message);
                break;
            default:
                console.warn('[WebSocket]: Nieznany typ wiadomości:', data.type, data);
        }
    } catch (e) {
        console.error('[WebSocket] Błąd parsowania wiadomości WebSocket:', e, message.data);
    }
}

/**
 * Wysyła wiadomość przez WebSocket.
 * @param {Object} message Obiekt wiadomości do wysłania.
 */
function sendMessageToWebSocket(message) {
    if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(message));
    } else {
        console.warn('Połączenie WebSocket nie jest otwarte. Nie można wysłać wiadomości.');
    }
}

// ==========================================================
// Obsługa list użytkowników i konwersacji
// ==========================================================

/**
 * Filtruje listę kontaktów/konwersacji na podstawie wprowadzonego tekstu.
 */
function filterContacts() {
    if (!searchInput || !contactsListEl) return;

    const searchTerm = searchInput.value.toLowerCase();
    const items = contactsListEl.querySelectorAll('li');

    items.forEach(item => {
        const name = item.querySelector('.conversation-name')?.textContent.toLowerCase() || '';
        const lastMessage = item.querySelector('.last-message')?.textContent.toLowerCase() || '';

        if (name.includes(searchTerm) || lastMessage.includes(searchTerm)) {
            item.style.display = '';
        } else {
            item.style.display = 'none';
        }
    });
}

/**
 * Ładuje i wyświetla WSZYSTKICH zarejestrowanych użytkowników jako "konwersacje".
 * Filtracja odbywa się tak, aby zalogowany użytkownik nie widział siebie.
 */
async function loadConversations() {
    if (!userId || !contactsListEl) {
        console.warn('[loadConversations] Nie można załadować użytkowników: userId lub contactsListEl nie jest dostępne.');
        return;
    }
    console.log(`[loadConversations] Rozpoczynanie ładowania wszystkich zarejestrowanych użytkowników dla userId: ${userId}`);

    try {
        const allRegisteredProfiles = await loadAllProfiles(); // Z profiles.js
        console.log('[loadConversations] Pobrane wszystkie zarejestrowane profile z loadAllProfiles():', allRegisteredProfiles);

        contactsListEl.innerHTML = ''; // Wyczyść obecną listę konwersacji

        const profilesToDisplay = allRegisteredProfiles.filter(profile => profile.id !== userId);
        console.log('[loadConversations] Profile do wyświetlenia (po odfiltrowaniu siebie):', profilesToDisplay);

        if (profilesToDisplay.length === 0) {
            console.log('[loadConversations] Brak innych zarejestrowanych użytkowników do wyświetlenia.');
            contactsListEl.innerHTML = '<li class="no-conversations-message">Brak innych zarejestrowanych użytkowników.</li>';
            return;
        }

        for (const profile of profilesToDisplay) {
            console.log(`[loadConversations] Próba renderowania profilu jako konwersacji: ${profile.username} (ID: ${profile.id})`);
            const lastMessagePlaceholder = "Rozpocznij rozmowę";
            const timestampPlaceholder = new Date().toISOString(); // Możesz ustawić na pusty string jeśli nie chcesz czasu
            renderConversationItem(profile.id, profile.username, lastMessagePlaceholder, timestampPlaceholder);
        }
        console.log('[loadConversations] Zakończono ładowanie i renderowanie konwersacji.');

    } catch (err) {
        console.error('[loadConversations] Błąd podczas ładowania zarejestrowanych użytkowników:', err.message);
    }
}

/**
 * Renderuje pojedynczy element listy konwersacji (pojedynczy kontakt/czat).
 * @param {string} opponentId ID użytkownika po drugiej stronie konwersacji.
 * @param {string} opponentName Nazwa użytkownika.
 * @param {string} lastMessage Ostatnia wiadomość w konwersacji (lub placeholder).
 * @param {string} timestamp Czas ostatniej wiadomości (lub placeholder).
 */
async function renderConversationItem(opponentId, opponentName, lastMessage, timestamp) {
    if (!contactsListEl) {
        console.warn('[renderConversationItem] contactsListEl nie jest dostępne. Nie można wyrenderować elementu.');
        return;
    }
    console.log(`[renderConversationItem] Rozpoczynanie renderowania elementu dla ${opponentName} (ID: ${opponentId})`);

    const conversationItem = document.createElement('li');
    conversationItem.className = 'conversation-item';
    conversationItem.dataset.userId = opponentId;

    const date = new Date(timestamp);
    const timeString = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    // Sprawdź, czy użytkownik jest online na podstawie globalnej listy aktywnych użytkowników (Set)
    const isOnline = activeUsers.has(opponentId);
    console.log(`[renderConversationItem] Użytkownik ${opponentName} (ID: ${opponentId}) jest online: ${isOnline}`);

    conversationItem.innerHTML = `
        <div class="user-avatar"></div>
        <div class="conversation-info">
            <span class="conversation-name">${opponentName}</span>
            <span class="last-message">${lastMessage}</span>
        </div>
        <div class="conversation-meta">
            <span class="last-message-time">${timeString}</span>
            <span class="status ${isOnline ? 'online' : 'offline'}"></span>
        </div>
    `;
    contactsListEl.appendChild(conversationItem);
    console.log('[renderConversationItem] Element dodany do DOM:', conversationItem);

    conversationItem.addEventListener('click', () => {
        console.log(`Kliknięto na konwersację z ${opponentName} (ID: ${opponentId}). Otwieram czat.`);
        openChatWithUser(opponentId, opponentName);
    });
}

/**
 * Aktualizuje statusy online/offline w liście konwersacji (kuleczki obok nazw).
 */
function updateConversationStatuses() {
    if (!contactsListEl) return;
    console.log('[updateConversationStatuses] Aktualizowanie statusów w liście konwersacji.');
    const conversationItems = contactsListEl.querySelectorAll('.conversation-item');
    conversationItems.forEach(item => {
        const currentUserId = item.dataset.userId;
        const statusSpan = item.querySelector('.status');
        if (statusSpan && currentUserId) {
            if (activeUsers.has(currentUserId)) {
                statusSpan.classList.remove('offline');
                statusSpan.classList.add('online');
            } else {
                statusSpan.classList.remove('online');
                statusSpan.classList.add('offline');
            }
        }
    });
}

/**
 * Aktualizuje listę aktywnych użytkowników w prawym sidebarze.
 * @param {Array<string>} users Array ID aktywnych użytkowników.
 */
async function updateActiveUsersList(users) {
    if (!activeUsersList) {
        console.warn('[updateActiveUsersList] Element activeUsersList nie znaleziony.');
        return;
    }
    console.log('[updateActiveUsersList] Aktualizowanie listy aktywnych użytkowników:', users);

    activeUsersList.innerHTML = ''; // Wyczyść listę

    const activeProfiles = [];
    for (const id of users) {
        if (id !== userId) { // Nie wyświetlaj samego siebie
            const profile = await getProfileById(id);
            if (profile) {
                activeProfiles.push(profile);
            }
        }
    }

    if (activeProfiles.length === 0) {
        if (noActiveUsersText) noActiveUsersText.style.display = 'block';
    } else {
        if (noActiveUsersText) noActiveUsersText.style.display = 'none';
        activeProfiles.sort((a, b) => a.username.localeCompare(b.username));

        for (const profile of activeProfiles) {
            const listItem = document.createElement('li');
            listItem.dataset.userId = profile.id;
            listItem.innerHTML = `
                <div class="user-avatar"></div>
                <span>${profile.username}</span>
                <span class="status online"></span>
            `;
            activeUsersList.appendChild(listItem);
            listItem.addEventListener('click', () => {
                console.log(`Kliknięto na aktywnego użytkownika ${profile.username} (ID: ${profile.id}). Otwieram czat.`);
                openChatWithUser(profile.id, profile.username);
            });
        }
    }

    // Aktualizacja mobilnej listy aktywnych użytkowników
    const onlineUsersMobileList = onlineUsersMobile ? onlineUsersMobile.querySelector('.active-users-list') : null;
    if (onlineUsersMobileList) {
        onlineUsersMobileList.innerHTML = '';
        if (activeProfiles.length === 0) {
            const noActiveUsersMobileText = onlineUsersMobile.querySelector('.no-active-users-message');
            if (noActiveUsersMobileText) noActiveUsersMobileText.style.display = 'block';
        } else {
            const noActiveUsersMobileText = onlineUsersMobile.querySelector('.no-active-users-message');
            if (noActiveUsersMobileText) noActiveUsersMobileText.style.display = 'none';
            for (const profile of activeProfiles) {
                const listItem = document.createElement('li');
                listItem.dataset.userId = profile.id;
                listItem.innerHTML = `
                    <div class="user-avatar"></div>
                    <span>${profile.username}</span>
                    <span class="status online"></span>
                `;
                onlineUsersMobileList.appendChild(listItem);
                listItem.addEventListener('click', () => {
                    openChatWithUser(profile.id, profile.username);
                });
            }
        }
    }
}

// ==========================================================
// Obsługa obszaru czatu
// ==========================================================

/**
 * Otwiera obszar czatu z wybranym użytkownikiem.
 * @param {string} recipientId ID użytkownika, z którym ma być otwarty czat.
 * @param {string} recipientName Nazwa użytkownika.
 */
async function openChatWithUser(recipientId, recipientName) {
    console.log(`[openChatWithUser] Otwieranie czatu z: ${recipientName} (ID: ${recipientId})`);
    if (!chatAreaWrapper || !logoScreen || !chatArea || !messageInput || !sendButton || !chatUserName || !chatMessages || !chatUserAvatar || !userStatusSpan) {
        console.warn('[openChatWithUser] Brak wymaganych elementów DOM do otwarcia czatu.');
        return;
    }

    activeChatRecipientId = recipientId;
    activeChatRecipientName = recipientName;

    chatUserName.textContent = recipientName;
    // Tutaj możesz zaktualizować avatar chatUserAvatar.src
    // np. if (profile.avatar_url) chatUserAvatar.src = profile.avatar_url;
    if (activeUsers.has(recipientId)) {
        userStatusSpan.textContent = 'online';
        userStatusSpan.classList.remove('offline');
        userStatusSpan.classList.add('online');
    } else {
        userStatusSpan.textContent = 'offline';
        userStatusSpan.classList.remove('online');
        userStatusSpan.classList.add('offline');
    }

    logoScreen.classList.add('hidden');
    chatArea.classList.add('active');

    messageInput.disabled = false;
    sendButton.disabled = false;
    messageInput.focus();

    chatMessages.innerHTML = ''; // Wyczyść stare wiadomości

    await loadChatHistory(userId, recipientId);

    const roomId = generateRoomId(userId, recipientId);
    sendMessageToWebSocket({ type: 'join_room', roomId: roomId });
    console.log(`[openChatWithUser] Dołączono do pokoju WebSocket: ${roomId}`);

    chatMessages.scrollTop = chatMessages.scrollHeight;

    const mq = window.matchMedia('(max-width: 768px)');
    if (mq.matches) {
        if (sidebarWrapper) sidebarWrapper.classList.add('hidden-on-mobile');
        if (chatAreaWrapper) chatAreaWrapper.classList.add('active-on-mobile');
        if (backButton) backButton.style.display = 'block';
    }
}

/**
 * Ukrywa obszar czatu i pokazuje ekran logo.
 * Głównie używane na urządzeniach mobilnych przyciskiem "Wstecz".
 */
function hideChatArea() {
    console.log('[hideChatArea] Ukrywanie obszaru czatu.');
    if (!chatAreaWrapper || !logoScreen || !chatArea || !sidebarWrapper || !backButton) {
        console.warn('[hideChatArea] Brak wymaganych elementów DOM do ukrycia czatu.');
        return;
    }

    if (activeChatRecipientId) {
        const roomId = generateRoomId(userId, activeChatRecipientId);
        sendMessageToWebSocket({ type: 'leave_room', roomId: roomId });
        console.log(`[hideChatArea] Opuszczono pokój WebSocket: ${roomId}`);
    }

    activeChatRecipientId = null;
    activeChatRecipientName = '';

    chatArea.classList.remove('active');
    logoScreen.classList.remove('hidden');

    if (messageInput) messageInput.disabled = true;
    if (sendButton) sendButton.disabled = true;

    const mq = window.matchMedia('(max-width: 768px)');
    if (mq.matches) {
        if (sidebarWrapper) sidebarWrapper.classList.remove('hidden-on-mobile');
        if (chatAreaWrapper) chatAreaWrapper.classList.remove('active-on-mobile');
        if (backButton) backButton.style.display = 'none';
    }
    hideTypingIndicator(null);
}

/**
 * Ładuje i wyświetla historię wiadomości dla danej konwersacji.
 * @param {string} currentUserId ID zalogowanego użytkownika.
 * @param {string} recipientId ID drugiego użytkownika w konwersacji.
 */
async function loadChatHistory(currentUserId, recipientId) {
    if (!chatMessages) {
        console.warn('[loadChatHistory] Element chatMessages nie znaleziony.');
        return;
    }
    console.log(`[loadChatHistory] Ładowanie historii czatu dla ${currentUserId} i ${recipientId}`);

    try {
        const { data, error } = await supabase
            .from('messages')
            .select('*')
            .or(`(sender_id.eq.${currentUserId},receiver_id.eq.${recipientId}),(sender_id.eq.${recipientId},receiver_id.eq.${currentUserId})`)
            .order('created_at', { ascending: true });

        if (error) throw error;
        console.log('[loadChatHistory] Pobrana historia wiadomości:', data);

        chatMessages.innerHTML = '';

        for (const msg of data) {
            const senderName = await getUserLabelById(msg.sender_id);
            displayMessage(msg.sender_id, msg.content, msg.created_at, senderName);
        }
        chatMessages.scrollTop = chatMessages.scrollHeight;
        console.log('[loadChatHistory] Historia czatu załadowana i wyświetlona.');
    } catch (err) {
        console.error('Błąd podczas ładowania historii czatu:', err.message);
    }
}

/**
 * Wysyła wiadomość do aktywnego czatu.
 */
async function handleSendMessage() {
    if (!messageInput || !chatMessages || !userId || !activeChatRecipientId) {
        console.warn('[handleSendMessage] Brak wymaganych elementów lub danych.');
        return;
    }

    const content = messageInput.value.trim();
    if (content === '') return;
    console.log(`[handleSendMessage] Wysyłanie wiadomości od ${userId} do ${activeChatRecipientId}: "${content}"`);

    try {
        const messagePayload = {
            type: 'chat_message',
            senderId: userId,
            receiverId: activeChatRecipientId,
            content: content
        };
        sendMessageToWebSocket(messagePayload);

        messageInput.value = '';
        handleTypingStatus(false); // Zresetuj status pisania
        console.log('[handleSendMessage] Wiadomość wysłana przez WebSocket.');

    } catch (err) {
        console.error('Błąd podczas wysyłania wiadomości:', err.message);
    }
}

/**
 * Wyświetla pojedynczą wiadomość w obszarze czatu.
 * @param {string} senderId ID nadawcy wiadomości.
 * @param {string} content Treść wiadomości.
 * @param {string} timestamp Czas wysłania wiadomości.
 * @param {string} [senderName] Opcjonalna nazwa nadawcy. Jeśli nie podana, zostanie pobrana.
 */
async function displayMessage(senderId, content, timestamp, senderName = null) {
    if (!chatMessages) return;

    if (senderName === null) {
        senderName = await getUserLabelById(senderId);
    }
    console.log(`[displayMessage] Wyświetlanie wiadomości: "${content}" od ${senderName} (${senderId})`);

    const messageDiv = document.createElement('div');
    messageDiv.classList.add('message');
    if (senderId === userId) {
        messageDiv.classList.add('sent');
    } else {
        messageDiv.classList.add('received');
    }

    const time = new Date(timestamp);
    const timeString = time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    messageDiv.innerHTML = `
        <div class="message-bubble">
            <span class="message-sender">${senderName}</span>
            <p>${content}</p>
            <span class="message-time">${timeString}</span>
        </div>
    `;
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// ==========================================================
// Obsługa wskaźnika pisania
// ==========================================================
let typingTimeout;
let isTyping = false;

function handleTypingStatus(eventOrValue) {
    if (!userId || !activeChatRecipientId) return;

    const currentTypingStatus = (typeof eventOrValue === 'boolean') ? eventOrValue : (messageInput.value.length > 0);

    if (currentTypingStatus !== isTyping) {
        isTyping = currentTypingStatus;
        sendMessageToWebSocket({
            type: 'typing_status',
            senderId: userId,
            receiverId: activeChatRecipientId,
            isTyping: isTyping
        });
        console.log(`[handleTypingStatus] Wysyłanie statusu pisania: ${isTyping}`);
    }

    clearTimeout(typingTimeout);
    if (isTyping) {
        typingTimeout = setTimeout(() => {
            isTyping = false;
            sendMessageToWebSocket({
                type: 'typing_status',
                senderId: userId,
                receiverId: activeChatRecipientId,
                isTyping: false
            });
            console.log('[handleTypingStatus] Resetowanie statusu pisania (timeout).');
        }, 1500);
    }
}

function displayTypingIndicator(senderId) {
    if (!typingStatusHeader && !typingIndicatorMessages) return;
    if (activeChatRecipientId !== senderId) return; // Upewnij się, że wskaźnik jest dla aktywnego czatu

    getUserLabelById(senderId).then(senderName => {
        if (typingStatusHeader) {
            typingStatusHeader.textContent = `${senderName} pisze...`;
            typingStatusHeader.style.display = 'block';
            console.log(`[displayTypingIndicator] Wyświetlam wskaźnik dla ${senderName}.`);
        }
    });

    if (typingIndicatorMessages) {
        typingIndicatorMessages.classList.remove('hidden');
    }
}

function hideTypingIndicator(senderId) {
    // Jeśli senderId jest null, ukryj wszystkie, w przeciwnym razie tylko dla danego nadawcy
    if (typingStatusHeader && (senderId === null || activeChatRecipientId === senderId)) {
        typingStatusHeader.textContent = '';
        typingStatusHeader.style.display = 'none';
        console.log(`[hideTypingIndicator] Ukrywam wskaźnik w nagłówku.`);
    }
    if (typingIndicatorMessages && (senderId === null || activeChatRecipientId === senderId)) {
        typingIndicatorMessages.classList.add('hidden');
        console.log(`[hideTypingIndicator] Ukrywam animowany wskaźnik.`);
    }
}

// ==========================================================
// Obsługa Media Queries (RWD)
// ==========================================================
function handleMediaQueryChange(mq) {
    console.log(`[handleMediaQueryChange] Media Query: ${mq.matches ? 'Tryb mobilny' : 'Tryb desktopowy'} aktywowany. Dostosowywanie widoczności.`);

    if (mq.matches) { // Tryb mobilny (max-width: 768px)
        if (sidebarWrapper) {
            sidebarWrapper.classList.remove('hidden-on-mobile');
            sidebarWrapper.style.display = 'flex';
        }
        if (chatAreaWrapper) {
            chatAreaWrapper.classList.add('active-on-mobile');
            chatAreaWrapper.style.display = 'none';
        }
        if (logoScreen) {
            logoScreen.classList.remove('hidden');
        }
        if (chatArea) {
            chatArea.classList.remove('active');
        }
        if (rightSidebarWrapper) {
            rightSidebarWrapper.style.display = 'none';
        }
        if (backButton) {
            backButton.style.display = 'block';
        }
        if (sidebarEl) sidebarEl.style.display = 'block';
        if (onlineUsersMobile) onlineUsersMobile.style.display = 'none'; // Domyślnie ukryte na mobile, pokażemy przy kliknięciu "Użytkownicy"
    } else { // Tryb desktopowy (powyżej 768px)
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
        if (onlineUsersMobile) onlineUsersMobile.style.display = 'none';
        if (sidebarEl) sidebarEl.style.display = 'block';
    }
}

// ==========================================================
// Główna inicjalizacja aplikacji
// ==========================================================
async function initializeApp() {
    console.log("[initializeApp] Rozpoczęcie inicjalizacji aplikacji Komunikator.");

    initializeDOMElements(); // Inicjalizacja wszystkich elementów DOM
    applySavedTheme(); // Zastosuj zapisany motyw

    // Upewnij się, że userId jest dostępne przed nawiązaniem połączenia WebSocket
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
        userId = user.id;
        console.log(`[initializeApp] Zalogowany użytkownik ID: ${userId}`);

        await loadAllProfiles(); // Wczytaj wszystkie profile i buforuj je
        console.log('[initializeApp] Wszystkie profile załadowane.');

        setupWebSocket(); // Nawiąż połączenie WebSocket
        console.log('[initializeApp] Inicjalizacja połączenia WebSocket.');

    } else {
        console.warn('[initializeApp] Użytkownik niezalogowany. Przekierowanie do strony logowania.');
        window.location.href = '/login.html';
        return;
    }

    // Dodaj wszystkie event listenery
    if (menuButton) menuButton.addEventListener('click', toggleDropdownMenu);
    if (themeToggle) themeToggle.addEventListener('click', toggleTheme);
    if (logoutButton) logoutButton.addEventListener('click', logoutUser);
    if (searchInput) searchInput.addEventListener('input', filterContacts);
    if (backButton) backButton.addEventListener('click', hideChatArea);
    if (sendButton) sendButton.addEventListener('click', handleSendMessage);
    if (messageInput) {
        messageInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSendMessage();
            }
        });
        messageInput.addEventListener('input', handleTypingStatus);
    }
    if (chatSettingsButton) chatSettingsButton.addEventListener('click', () => {
        if (chatSettingsDropdown) chatSettingsDropdown.classList.toggle('hidden');
    });

    // Event listener dla przycisków nawigacyjnych (Rozmowy, Użytkownicy, Ustawienia)
    if (mainNavIcons) {
        mainNavIcons.querySelectorAll('.nav-icon').forEach(icon => {
            icon.addEventListener('click', (e) => {
                const tooltip = icon.dataset.tooltip;
                navIcons.forEach(navIcon => navIcon.classList.remove('active'));
                icon.classList.add('active');
                console.log(`[mainNavIcons] Kliknięto ikonę: ${tooltip}`);

                if (tooltip === 'Rozmowy') {
                    if (sidebarEl) sidebarEl.style.display = 'block';
                    if (onlineUsersMobile) onlineUsersMobile.style.display = 'none';
                    if (rightSidebarWrapper && !window.matchMedia('(max-width: 768px)').matches) {
                        rightSidebarWrapper.style.display = 'flex';
                    } else if (rightSidebarWrapper) {
                         rightSidebarWrapper.style.display = 'none'; // Ukryj prawy sidebar na mobile, jeśli nie ma rozmowy
                    }
                    loadConversations(); // Odśwież/załadowanie konwersacji (wszystkich użytkowników)
                } else if (tooltip === 'Użytkownicy') {
                    if (sidebarEl) sidebarEl.style.display = 'none';
                    if (onlineUsersMobile) {
                        onlineUsersMobile.style.display = 'block';
                        updateActiveUsersList(Array.from(activeUsers)); // Zapewnij aktualną listę aktywnych
                    }
                    if (rightSidebarWrapper) rightSidebarWrapper.style.display = 'none';
                } else if (tooltip === 'Ustawienia') {
                    if (sidebarEl) sidebarEl.style.display = 'none';
                    if (onlineUsersMobile) onlineUsersMobile.style.display = 'none';
                    if (rightSidebarWrapper) rightSidebarWrapper.style.display = 'none';
                    // Tutaj możesz wyświetlić inny widok ustawień
                }
            });
        });
    }

    // Obsługa zmiany rozmiaru okna (media query)
    const mq = window.matchMedia('(max-width: 768px)');
    mq.addListener(handleMediaQueryChange);
    handleMediaQueryChange(mq); // Początkowe wywołanie w celu ustawienia poprawnego układu

    console.log("[initializeApp] Aplikacja Komunikator zainicjalizowana pomyślnie.");
}

// Uruchomienie aplikacji po załadowaniu DOM
document.addEventListener('DOMContentLoaded', initializeApp);