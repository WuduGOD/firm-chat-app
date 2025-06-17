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
let chatUserAvatar; // <img id="chatUserAvatar"> lub <div class="user-avatar" id="chatUserAvatar">
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
    typingStatusHeader = getElement('typingStatusHeader'); // Upewnij się, że masz takie ID w nagłówku
    typingIndicatorMessages = getElement('typingIndicator'); // Animowane kropki na dole czatu

    // Poprawka dla chatMessages - bezpośrednie użycie querySelector
    chatMessages = document.querySelector('.chat-messages');

    messageInput = getElement('messageInput');
    sendButton = getElement('sendButton');
    emojiButton = getElement('.emoji-button', true);
    attachButton = getElement('.attach-button', true);

    rightSidebarWrapper = getElement('.right-sidebar-wrapper', true);
    rightSidebar = getElement('rightSidebar');
    activeUsersList = getElement('activeUsersList'); // Prawy pasek boczny z aktywnymi użytkownikami
    noActiveUsersText = getElement('noActiveUsersText');
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
    // WAŻNE: Upewnij się, że ten URL jest prawidłowym URL-em Twojego backendu na Render.com
    // Zastąp 'firm-chat-app-backend.onrender.com' RZECZYWISTYM URL-em TWOJEGO SERWERA WEBSOCKET!
    const wsUrl = 'wss://firm-chat-app-backend.onrender.com';

    if (socket && socket.readyState === WebSocket.OPEN) {
        console.log('WebSocket jest już otwarty, nie tworzę nowego połączenia.');
        return;
    }

    console.log(`Próba połączenia z WebSocket: ${wsUrl}`);
    socket = new WebSocket(wsUrl);

    socket.onopen = () => {
        console.log('Połączono z serwerem WebSocket.');
        // Wyślij ID użytkownika do serwera po połączeniu
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
        // Próba ponownego połączenia po krótkim opóźnieniu
        if (event.code !== 1000) { // Kod 1000 oznacza normalne zamknięcie
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

        switch (data.type) {
            case 'auth_success':
                userId = data.userId;
                console.log('Zalogowano jako użytkownik ID:', userId);
                // Po udanym zalogowaniu, załaduj konwersacje
                loadConversations();
                break;
            case 'user_list':
                // Zaktualizuj globalną listę aktywnych użytkowników
                activeUsers = new Set(data.users);
                updateActiveUsersList(data.users);
                // Po aktualizacji listy aktywnych użytkowników, odśwież status w konwersacjach
                updateConversationStatuses();
                break;
            case 'user_status':
                // Zaktualizuj globalną listę aktywnych użytkowników
                if (data.status === 'online') {
                    activeUsers.add(data.userId);
                } else {
                    activeUsers.delete(data.userId);
                }
                updateActiveUsersList(Array.from(activeUsers));
                // Po aktualizacji statusu, odśwież status w konwersacjach
                updateConversationStatuses();
                break;
            case 'chat_message':
                // Obsłuż nową wiadomość czatu
                if (activeChatRecipientId === data.senderId || activeChatRecipientId === data.receiverId) {
                    // Wiadomość jest dla aktywnego czatu
                    displayMessage(data.senderId, data.content, data.timestamp);
                }
                // Niezależnie od tego, czy czat jest aktywny, zaktualizuj konwersacje
                loadConversations(); // Odśwież konwersacje po otrzymaniu nowej wiadomości
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
        // Opcjonalnie: zaimplementuj logikę ponownego wysłania lub powiadom użytkownika
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
            item.style.display = ''; // Pokaż element
        } else {
            item.style.display = 'none'; // Ukryj element
        }
    });
}

/**
 * Ładuje i wyświetla konwersacje użytkownika.
 */
async function loadConversations() {
    if (!userId || !contactsListEl) {
        console.warn('[loadConversations] Nie można załadować konwersacji: userId lub contactsListEl nie jest dostępne.');
        return;
    }

    try {
        // Pobierz wiadomości, które dotyczą zalogowanego użytkownika (jako nadawca lub odbiorca)
        const { data, error } = await supabase
            .from('messages')
            .select('sender_id, receiver_id, content, created_at')
            .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)
            .order('created_at', { ascending: false }); // Sortuj od najnowszej

        if (error) throw error;

        const conversationsMap = new Map(); // Map: opponent_id -> { lastMessage, timestamp, opponent_id }

        // Przetwarzanie wiadomości w celu znalezienia ostatniej wiadomości dla każdej konwersacji
        for (const message of data) {
            const opponentId = message.sender_id === userId ? message.receiver_id : message.sender_id;

            // Jeśli to nowsza wiadomość dla tej konwersacji LUB to pierwsza wiadomość
            // Upewniamy się, że opponentId nie jest null (na wypadek błędnych danych)
            if (opponentId && (!conversationsMap.has(opponentId) || new Date(message.created_at) > new Date(conversationsMap.get(opponentId).timestamp))) {
                conversationsMap.set(opponentId, {
                    lastMessage: message.content,
                    timestamp: message.created_at,
                    opponentId: opponentId
                });
            }
        }

        // Konwertuj mapę na tablicę i posortuj od najnowszej wiadomości (najnowsza na górze)
        const conversations = Array.from(conversationsMap.values()).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        // Wyczyść obecną listę konwersacji
        contactsListEl.innerHTML = '';

        if (conversations.length === 0) {
            contactsListEl.innerHTML = '<li class="no-conversations-message">Brak rozpoczętych konwersacji.</li>';
            return;
        }

        // Renderuj każdą konwersację
        for (const convo of conversations) {
            const userProfile = await getProfileById(convo.opponentId); // Pobierz profil użytkownika
            if (userProfile) {
                renderConversationItem(convo.opponentId, userProfile.username, convo.lastMessage, convo.timestamp);
            }
        }

    } catch (err) {
        console.error('[loadConversations] Błąd podczas ładowania konwersacji:', err.message);
    }
}

/**
 * Renderuje pojedynczy element listy konwersacji (pojedynczy kontakt/czat).
 * @param {string} opponentId ID użytkownika po drugiej stronie konwersacji.
 * @param {string} opponentName Nazwa użytkownika.
 * @param {string} lastMessage Ostatnia wiadomość w konwersacji.
 * @param {string} timestamp Czas ostatniej wiadomości.
 */
async function renderConversationItem(opponentId, opponentName, lastMessage, timestamp) {
    if (!contactsListEl) return;

    const conversationItem = document.createElement('li');
    conversationItem.className = 'conversation-item';
    conversationItem.dataset.userId = opponentId; // Ustaw data-user-id dla łatwego dostępu

    const date = new Date(timestamp);
    const timeString = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    // Sprawdź, czy użytkownik jest online na podstawie globalnej listy aktywnych użytkowników (Set)
    const isOnline = activeUsers.has(opponentId);

    conversationItem.innerHTML = `
        <div class="user-avatar"></div> <div class="conversation-info">
            <span class="conversation-name">${opponentName}</span>
            <span class="last-message">${lastMessage}</span>
        </div>
        <div class="conversation-meta">
            <span class="last-message-time">${timeString}</span>
            <span class="status ${isOnline ? 'online' : 'offline'}"></span>
        </div>
    `;
    contactsListEl.appendChild(conversationItem);

    // Dodaj nasłuchiwanie kliknięcia na element konwersacji
    conversationItem.addEventListener('click', () => {
        openChatWithUser(opponentId, opponentName);
    });
}

/**
 * Aktualizuje statusy online/offline w liście konwersacji (kuleczki obok nazw).
 */
function updateConversationStatuses() {
    if (!contactsListEl) return;
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

    activeUsersList.innerHTML = ''; // Wyczyść listę

    if (users.length === 0) {
        if (noActiveUsersText) noActiveUsersText.style.display = 'block';
        return;
    } else {
        if (noActiveUsersText) noActiveUsersText.style.display = 'none';
    }

    // Pobierz profile dla wszystkich aktywnych użytkowników
    const activeProfiles = [];
    for (const id of users) {
        // Nie wyświetlaj samego siebie na liście aktywnych użytkowników
        if (id !== userId) {
            const profile = await getProfileById(id);
            if (profile) {
                activeProfiles.push(profile);
            }
        }
    }

    // Sortuj alfabetycznie
    activeProfiles.sort((a, b) => a.username.localeCompare(b.username));

    // Renderuj listę
    for (const profile of activeProfiles) {
        const listItem = document.createElement('li');
        listItem.dataset.userId = profile.id; // Ustaw data-user-id

        listItem.innerHTML = `
            <div class="user-avatar"></div> <span>${profile.username}</span>
            <span class="status online"></span>
        `;
        activeUsersList.appendChild(listItem);

        // Dodaj event listener do otwierania czatu
        listItem.addEventListener('click', () => {
            openChatWithUser(profile.id, profile.username);
        });
    }

    // Jeśli używasz onlineUsersMobile (dla widoku mobilnego), zaktualizuj go również
    const onlineUsersMobileList = onlineUsersMobile ? onlineUsersMobile.querySelector('.active-users-list') : null;
    if (onlineUsersMobileList) {
        onlineUsersMobileList.innerHTML = ''; // Wyczyść listę mobilną
        if (users.length === 0) {
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
    if (!chatAreaWrapper || !logoScreen || !chatArea || !messageInput || !sendButton || !chatUserName || !chatMessages || !chatUserAvatar || !userStatusSpan) {
        console.warn('[openChatWithUser] Brak wymaganych elementów DOM.');
        return;
    }

    // Ustaw aktywnego odbiorcę
    activeChatRecipientId = recipientId;
    activeChatRecipientName = recipientName;

    // Aktualizuj nagłówek czatu
    chatUserName.textContent = recipientName;
    // Tutaj możesz zaktualizować avatar chatUserAvatar.src
    // np. if (profile.avatar_url) chatUserAvatar.src = profile.avatar_url;
    // Aktualizuj status online/offline
    if (activeUsers.has(recipientId)) {
        userStatusSpan.textContent = 'online';
        userStatusSpan.classList.remove('offline');
        userStatusSpan.classList.add('online');
    } else {
        userStatusSpan.textContent = 'offline';
        userStatusSpan.classList.remove('online');
        userStatusSpan.classList.add('offline');
    }

    // Pokaż obszar czatu, ukryj ekran logo
    logoScreen.classList.add('hidden');
    chatArea.classList.add('active'); // Upewnij się, że chatArea jest widoczne

    // Upewnij się, że pole wprowadzania wiadomości i przycisk wysyłania są aktywne
    messageInput.disabled = false;
    sendButton.disabled = false;
    messageInput.focus();

    // Wyczyść stare wiadomości
    chatMessages.innerHTML = '';

    // Wczytaj historię wiadomości
    await loadChatHistory(userId, recipientId);

    // Dołącz do pokoju WebSocket dla tej konwersacji
    const roomId = generateRoomId(userId, recipientId);
    sendMessageToWebSocket({ type: 'join_room', roomId: roomId });

    // Przewiń na dół do najnowszych wiadomości
    chatMessages.scrollTop = chatMessages.scrollHeight;

    // Dla widoku mobilnego: ukryj sidebar i pokaż obszar czatu
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
    if (!chatAreaWrapper || !logoScreen || !chatArea || !sidebarWrapper || !backButton) {
        console.warn('[hideChatArea] Brak wymaganych elementów DOM.');
        return;
    }

    // Opuść pokój WebSocket dla poprzedniej konwersacji
    if (activeChatRecipientId) {
        const roomId = generateRoomId(userId, activeChatRecipientId);
        sendMessageToWebSocket({ type: 'leave_room', roomId: roomId });
    }

    // Resetuj aktywnego odbiorcę
    activeChatRecipientId = null;
    activeChatRecipientName = '';

    // Ukryj obszar czatu, pokaż ekran logo
    chatArea.classList.remove('active');
    logoScreen.classList.remove('hidden');

    // Resetuj pole wprowadzania wiadomości i przycisk wysyłania
    if (messageInput) messageInput.disabled = true;
    if (sendButton) sendButton.disabled = true;

    // Dla widoku mobilnego: pokaż sidebar i ukryj obszar czatu
    const mq = window.matchMedia('(max-width: 768px)');
    if (mq.matches) {
        if (sidebarWrapper) sidebarWrapper.classList.remove('hidden-on-mobile');
        if (chatAreaWrapper) chatAreaWrapper.classList.remove('active-on-mobile');
        if (backButton) backButton.style.display = 'none';
    }
    // Wyczyść ewentualne wskaźniki pisania
    hideTypingIndicator(null); // Ukryj wszystkie wskaźniki
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

    try {
        const { data, error } = await supabase
            .from('messages')
            .select('*')
            .or(`(sender_id.eq.${currentUserId},receiver_id.eq.${recipientId}),(sender_id.eq.${recipientId},receiver_id.eq.${currentUserId})`)
            .order('created_at', { ascending: true }); // Sortuj od najstarszej

        if (error) throw error;

        chatMessages.innerHTML = ''; // Wyczyść poprzednie wiadomości

        for (const msg of data) {
            const senderName = await getUserLabelById(msg.sender_id);
            displayMessage(msg.sender_id, msg.content, msg.created_at, senderName);
        }
        chatMessages.scrollTop = chatMessages.scrollHeight; // Przewiń na dół
    } catch (err) {
        console.error('Błąd podczas ładowania historii czatu:', err.message);
    }
}

/**
 * Wysyła wiadomość do aktywnego czatu.
 */
async function handleSendMessage() {
    if (!messageInput || !chatMessages || !userId || !activeChatRecipientId) {
        console.warn('[handleSendMessage] Brak wymaganych elementów lub danych (messageInput, chatMessages, userId, activeChatRecipientId).');
        return;
    }

    const content = messageInput.value.trim();
    if (content === '') return;

    try {
        // Wysyłamy wiadomość do serwera WebSocket
        // Serwer powinien zapisać ją w bazie danych i rozgłosić do wszystkich w pokoju
        const messagePayload = {
            type: 'chat_message',
            senderId: userId,
            receiverId: activeChatRecipientId,
            content: content
        };
        sendMessageToWebSocket(messagePayload);

        messageInput.value = ''; // Wyczyść pole wprowadzania
        // Ukryj wskaźnik pisania, ponieważ użytkownik przestał pisać (wysłał wiadomość)
        handleTypingStatus(false);

        // Opcjonalnie: możesz dodać wiadomość do DOM od razu, zanim przyjdzie z serwera,
        // ale może to prowadzić do duplikacji lub niezgodności, jeśli serwer odrzuci wiadomość.
        // Lepiej poczekać na wiadomość zwrotną z serwera.

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

    // Jeśli nazwa nadawcy nie została podana, pobierz ją
    if (senderName === null) {
        senderName = await getUserLabelById(senderId);
    }

    const messageDiv = document.createElement('div');
    messageDiv.classList.add('message');
    // Dodaj klasę 'sent' lub 'received' w zależności od nadawcy
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
    chatMessages.scrollTop = chatMessages.scrollHeight; // Przewiń na dół
}

// ==========================================================
// Obsługa wskaźnika pisania
// ==========================================================
let typingTimeout; // Zmienna do przechowywania timeoutu dla statusu pisania
let isTyping = false; // Czy użytkownik aktualnie pisze

/**
 * Obsługuje status pisania użytkownika. Wysyła status do serwera.
 * @param {Event|boolean} eventOrValue Zdarzenie input lub boolean, jeśli ręcznie ustawiamy status.
 */
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
    }

    // Zresetuj timeout, aby wysłać "nie pisze" po ustaniu aktywności
    clearTimeout(typingTimeout);
    if (isTyping) {
        typingTimeout = setTimeout(() => {
            isTyping = false; // Resetuj status pisania po ustaniu aktywności
            sendMessageToWebSocket({
                type: 'typing_status',
                senderId: userId,
                receiverId: activeChatRecipientId,
                isTyping: false
            });
        }, 1500); // 1.5 sekundy bez pisania uznane za koniec pisania
    }
}

/**
 * Wyświetla wskaźnik pisania (animowane kropki) lub status pisania w nagłówku.
 * @param {string} senderId ID użytkownika, który pisze.
 */
async function displayTypingIndicator(senderId) {
    if (!typingStatusHeader && !typingIndicatorMessages) return;

    const senderName = await getUserLabelById(senderId);

    // Wskaźnik pisania w nagłówku (jeśli istnieje)
    if (typingStatusHeader && activeChatRecipientId === senderId) {
        typingStatusHeader.textContent = `${senderName} pisze...`;
        typingStatusHeader.style.display = 'block'; // Pokaż, jeśli był ukryty
    }

    // Animowane kropki na dole czatu (jeśli istnieją)
    if (typingIndicatorMessages && activeChatRecipientId === senderId) {
        typingIndicatorMessages.classList.remove('hidden');
    }
}

/**
 * Ukrywa wskaźnik pisania.
 * @param {string|null} senderId ID użytkownika, którego wskaźnik ukryć, lub null, aby ukryć wszystkie.
 */
function hideTypingIndicator(senderId) {
    if (typingStatusHeader && (senderId === null || activeChatRecipientId === senderId)) {
        typingStatusHeader.textContent = '';
        typingStatusHeader.style.display = 'none'; // Ukryj
    }
    if (typingIndicatorMessages && (senderId === null || activeChatRecipientId === senderId)) {
        typingIndicatorMessages.classList.add('hidden');
    }
}

// ==========================================================
// Obsługa Media Queries (RWD)
// ==========================================================
/**
 * Obsługuje zmiany w media queries (zmiany rozmiaru ekranu).
 * Dostosowuje widoczność elementów na podstawie trybu mobilnego/desktopowego.
 * @param {MediaQueryList} mq Obiekt MediaQueryList.
 */
function handleMediaQueryChange(mq) {
    console.log(`[handleMediaQueryChange] Media Query: ${mq.matches ? 'Tryb mobilny' : 'Tryb desktopowy'} aktywowany. Dostosowywanie widoczności.`);

    if (mq.matches) { // Tryb mobilny (max-width: 768px)
        // Na mobile, początkowo pokaż sidebar, ukryj obszar czatu.
        if (sidebarWrapper) {
            sidebarWrapper.classList.remove('hidden-on-mobile');
            sidebarWrapper.style.display = 'flex'; // Zapewnij widoczność sidebara
        }
        if (chatAreaWrapper) {
            chatAreaWrapper.classList.add('active-on-mobile'); // Dodaj klasę, aby pokazać obszar czatu na mobile
            chatAreaWrapper.style.display = 'none'; // Ukryj obszar czatu domyślnie
        }
        if (logoScreen) {
            logoScreen.classList.remove('hidden'); // Pokaż ekran logo, gdy czat jest ukryty
        }
        if (chatArea) {
            chatArea.classList.remove('active'); // Obszar czatu ukryty
        }
        if (rightSidebarWrapper) {
            rightSidebarWrapper.style.display = 'none'; // Ukryj prawy sidebar na mobile
        }
        if (backButton) {
            backButton.style.display = 'block'; // Pokaż przycisk wstecz na mobile
        }
        // W mobile, jeśli otwarty jest czat, przycisk Wstecz i tak go ukryje.
        // Jeśli jest aktywowana sekcja "Użytkownicy" na mobile, to sidebar jest ukryty, a onlineUsersMobile widoczne.
        // Obsługa w głównym listenerze dla navIcons.
        if (sidebarEl) sidebarEl.style.display = 'block'; // Domyślnie pokaż listę konwersacji

    } else { // Tryb desktopowy (powyżej 768px)
        // Na desktopie, pokaż sidebar, ekran logo początkowo, obszar czatu ukryty.
        if (sidebarWrapper) {
            sidebarWrapper.classList.remove('hidden-on-mobile'); // Upewnij się, że jest widoczny
            sidebarWrapper.style.display = 'flex';
        }
        if (chatAreaWrapper) {
            chatAreaWrapper.classList.remove('active-on-mobile'); // Usuń klasę mobilną
            chatAreaWrapper.style.display = 'flex'; // Upewnij się, że jest widoczny, aby zawierał ekran logo
        }
        if (logoScreen) {
            logoScreen.classList.remove('hidden'); // Pokaż ekran logo
        }
        if (chatArea) {
            chatArea.classList.remove('active'); // Obszar czatu ukryty
        }
        if (rightSidebarWrapper) {
            rightSidebarWrapper.style.display = 'flex'; // Upewnij się, że prawy sidebar jest widoczny
        }
        if (backButton) {
            backButton.style.display = 'none'; // Przycisk wstecz niepotrzebny na desktopie
        }
        if (onlineUsersMobile) onlineUsersMobile.style.display = 'none'; // Ukryj mobilną listę aktywnych
        if (sidebarEl) sidebarEl.style.display = 'block'; // Zawsze pokaż główny sidebar
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

        // Wczytaj wszystkie profile od razu, buforując je
        await loadAllProfiles();

        // Po udanym pobraniu userId, nawiąż połączenie WebSocket
        setupWebSocket();

        // Załaduj konwersacje po starcie i uwierzytelnieniu
        // Zauważ, że loadConversations() jest też wywoływane po 'auth_success' z WebSocket,
        // ale to początkowe wywołanie jest ważne, jeśli połączenie WebSocket zostanie nawiązane później.
        // loadConversations(); // Zostawiłem to do wywołania po auth_success w handleWebSocketMessage

        // Wczytaj listę aktywnych użytkowników do prawego sidebara
        // (Będzie aktualizowana przez WebSocket, ale możemy zrobić początkowe zapytanie jeśli to potrzebne)
        // Jeśli server.js wysyła 'user_list' po połączeniu, to ta linia może być zbędna
        // updateActiveUsersList(Array.from(activeUsers));

    } else {
        console.warn('[initializeApp] Użytkownik niezalogowany. Przekierowanie do strony logowania.');
        window.location.href = '/login.html'; // Przekieruj do strony logowania, jeśli nie ma użytkownika
        return; // Zakończ inicjalizację, jeśli użytkownik nie jest zalogowany
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
            if (e.key === 'Enter' && !e.shiftKey) { // Wyślij wiadomość po enterze, chyba że Shift+Enter (nowa linia)
                e.preventDefault(); // Zapobiegnij domyślnej akcji (np. dodaniu nowej linii)
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
                // Usuń klasę 'active' ze wszystkich ikon
                navIcons.forEach(navIcon => navIcon.classList.remove('active'));
                // Dodaj klasę 'active' do klikniętej ikony
                icon.classList.add('active');

                // Logika przełączania widoków
                if (tooltip === 'Rozmowy') {
                    if (sidebarEl) sidebarEl.style.display = 'block';
                    if (onlineUsersMobile) onlineUsersMobile.style.display = 'none'; // Ukryj na mobile
                    loadConversations(); // Odśwież konwersacje po przełączeniu
                    if (rightSidebarWrapper && !window.matchMedia('(max-width: 768px)').matches) {
                        rightSidebarWrapper.style.display = 'flex'; // Upewnij się, że prawy sidebar jest widoczny na desktopie
                    }
                } else if (tooltip === 'Użytkownicy') {
                    if (sidebarEl) sidebarEl.style.display = 'none';
                    if (onlineUsersMobile) {
                        onlineUsersMobile.style.display = 'block'; // Pokaż mobilną listę aktywnych użytkowników
                        // Zaktualizuj listę aktywnych użytkowników (dla mobile)
                        updateActiveUsersList(Array.from(activeUsers));
                    }
                    if (rightSidebarWrapper) rightSidebarWrapper.style.display = 'none'; // Ukryj prawy sidebar
                } else if (tooltip === 'Ustawienia') {
                    // Tutaj logika dla Ustawień
                    if (sidebarEl) sidebarEl.style.display = 'none';
                    if (onlineUsersMobile) onlineUsersMobile.style.display = 'none';
                    if (rightSidebarWrapper) rightSidebarWrapper.style.display = 'none';
                    // Możesz tu wyświetlić np. jakiś inny div z ustawieniami, ukrywając resztę
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