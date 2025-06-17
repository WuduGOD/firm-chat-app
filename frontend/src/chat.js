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
let typingStatusHeader; // Nowa zmienna dla nagłówka statusu pisania
let chatHeaderActions; // <div class="chat-header-actions">
let chatSettingsButton; // <button id="chatSettingsButton">
let chatSettingsDropdown; // <div class="chat-settings-dropdown">

let messagesContainer; // <div class="messages-container" id="messagesContainer">
let typingIndicator; // <div class="typing-indicator" id="typingIndicator">

let messageInput; // <input id="messageInput">
let sendButton; // <button id="sendButton">

let activeUsersListEl; // <ul class="active-users-list" id="activeUsersList">
let noActiveUsersText; // <div id="noActiveUsersText">
let rightSidebarWrapper; // <aside class="right-sidebar-wrapper">

let userId; // ID zalogowanego użytkownika
let activeChatRecipientId = null;
let activeChatRecipientName = '';

// WebSocket
let socket;
let activeUsers = new Set();
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_INTERVAL_MS = 3000;

// ==========================================================
// Funkcje pomocnicze
// ==========================================================

/**
 * Bezpiecznie pobiera element DOM po ID.
 * @param {string} id ID elementu.
 * @returns {HTMLElement|null} Element DOM lub null, jeśli nie znaleziono.
 */
function getElement(id) {
    const element = document.getElementById(id);
    if (!element) {
        console.warn(`Element z ID '${id}' nie znaleziony.`);
    }
    return element;
}

/**
 * Inicjalizuje zmienne DOM, przypisując elementy do globalnych zmiennych.
 */
function initializeDOMElements() {
    console.log("[initializeDOMElements] Rozpoczynanie inicjalizacji elementów DOM.");
    mainHeader = getElement('mainHeader');
    menuButton = getElement('menuButton');
    dropdownMenu = getElement('dropdownMenu');
    themeToggle = getElement('themeToggle');
    logoutButton = getElement('logoutButton');

    container = getElement('container');
    sidebarWrapper = getElement('sidebarWrapper');
    mainNavIcons = getElement('mainNavIcons');
    navIcons = document.querySelectorAll('.nav-icon');

    onlineUsersMobile = getElement('onlineUsersMobile');

    sidebarEl = getElement('sidebar');
    searchInput = getElement('sidebarSearchInput'); // Poprawiono ID
    contactsListEl = getElement('contactsList');

    chatAreaWrapper = getElement('chatAreaWrapper');
    logoScreen = getElement('logoScreen');
    chatArea = getElement('chatArea');

    chatHeader = getElement('chatHeader');
    backButton = getElement('backButton');
    chatUserAvatar = getElement('chatUserAvatar');
    chatUserName = getElement('chatUserName');
    userStatusSpan = getElement('userStatus');
    typingStatusHeader = getElement('typingStatusHeader'); // Nowy element
    chatHeaderActions = getElement('chatHeaderActions');
    chatSettingsButton = getElement('chatSettingsButton');
    chatSettingsDropdown = getElement('chatSettingsDropdown');

    messagesContainer = getElement('messagesContainer');
    typingIndicator = getElement('typingIndicator'); // Poprawiono ID

    messageInput = getElement('messageInput');
    sendButton = getElement('sendButton');

    activeUsersListEl = getElement('activeUsersList');
    noActiveUsersText = getElement('noActiveUsersText');
    rightSidebarWrapper = getElement('rightSidebar'); // Poprawiono, by pasowało do ID HTML

    console.log("[initializeDOMElements] Zakończono inicjalizację elementów DOM.");
}

/**
 * Przełącza widoczność paska bocznego w zależności od stanu (otwarty/zamknięty).
 * @param {boolean} open True, aby otworzyć; false, aby zamknąć.
 */
function toggleSidebar(open) {
    if (sidebarEl) {
        sidebarEl.classList.toggle('open', open);
    }
}

/**
 * Obsługuje zmiany w media query (tryb mobilny/desktopowy).
 * @param {MediaQueryListEvent} mq Media Query List Event.
 */
function handleMediaQueryChange(mq) {
    console.log("Media Query: Tryb desktopowy aktywowany. Dostosowywanie początkowej widoczności dla desktopu.");
    if (mq.matches) { // Tryb mobilny (max-width: 768px)
        if (sidebarEl) sidebarEl.style.display = 'block'; // Pokaż sidebar by default
        if (onlineUsersMobile) onlineUsersMobile.style.display = 'none'; // Ukryj mobilną listę online users
        if (chatAreaWrapper) chatAreaWrapper.style.display = 'none'; // Ukryj obszar czatu na start mobile
        if (rightSidebarWrapper) rightSidebarWrapper.style.display = 'none'; // Ukryj prawy sidebar
        if (backButton) backButton.classList.add('mobile-only'); // Pokaż przycisk Wróć na mobile
    } else { // Tryb desktopowy
        if (sidebarEl) sidebarEl.style.display = 'block'; // Pokaż sidebar
        if (chatAreaWrapper) chatAreaWrapper.style.display = 'flex'; // Pokaż obszar czatu
        if (rightSidebarWrapper) rightSidebarWrapper.style.display = 'block'; // Pokaż prawy sidebar
        if (onlineUsersMobile) onlineUsersMobile.style.display = 'none'; // Upewnij się, że mobilna lista jest ukryta
        if (backButton) backButton.classList.remove('mobile-only'); // Ukryj przycisk Wróć na desktop
    }
}


/**
 * Uruchamia połączenie WebSocket.
 */
function connectWebSocket() {
    console.log(`[WebSocket] Próba połączenia z serwerem: ${import.meta.env.VITE_CHAT_WS_URL}`);
    socket = new WebSocket(import.meta.env.VITE_CHAT_WS_URL);

    socket.onopen = () => {
        console.log('[WebSocket] Połączono z serwerem WebSocket.');
        reconnectAttempts = 0;
        // W tym modelu (autoryzacja przez ciasteczka), frontend NIE WYSYŁA wiadomości 'authenticate'
        // Serwer powinien sam uwierzytelnić połączenie na podstawie ciasteczek
        // i odesłać wiadomość 'auth_success'.
    };

    socket.onmessage = async (event) => {
        const message = JSON.parse(event.data);
        console.log('[WebSocket] Otrzymano wiadomość:', message);

        switch (message.type) {
            case 'auth_success':
                console.log(`[WebSocket] Zalogowano jako użytkownik ID: ${message.userId}`);
                userId = message.userId; // Ustaw globalną zmienną userId
                localStorage.setItem('userId', message.userId); // Zapisz w localStorage dla przyszłych sesji
                await loadConversations(); // Załaduj konwersacje po udanym zalogowaniu
                break;
            case 'user_status':
                if (message.status === 'online') {
                    activeUsers.add(message.userId);
                } else {
                    activeUsers.delete(message.userId);
                }
                updateActiveUsersListUI(Array.from(activeUsers));
                updateConversationStatus(message.userId, message.status === 'online');
                break;
            case 'user_list':
                activeUsers = new Set(message.users);
                console.log('[WebSocket] Aktywni użytkownicy (ID):', Array.from(activeUsers));
                updateActiveUsersListUI(Array.from(activeUsers));
                break;
            case 'chat_message':
                console.log('Otrzymano wiadomość czatu:', message);
                // Wyświetl wiadomość tylko jeśli dotyczy aktywnej rozmowy lub jest powiadomieniem
                if (message.senderId === activeChatRecipientId || message.receiverId === userId) {
                    displayMessage(message);
                }
                // Oznacz konwersację jako nieprzeczytaną, jeśli wiadomość nie jest z aktywnego czatu
                if (message.senderId !== activeChatRecipientId) {
                    markConversationAsUnread(message.senderId);
                }
                break;
            case 'typing_status':
                handleTypingStatus(message.senderId, message.isTyping);
                break;
            default:
                console.warn('Nieznany typ wiadomości WebSocket:', message.type);
        }
    };

    socket.onclose = (event) => {
        console.warn(`[WebSocket] Połączenie zamknięte. Kod: ${event.code}, Powód: ${event.reason}`);
        if (event.code !== 1000 && reconnectAttempts < MAX_RECONNECT_ATTEMPTS) { // 1000 to normalne zamknięcie
            reconnectAttempts++;
            console.log(`[WebSocket] Próba ponownego połączenia (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})...`);
            setTimeout(connectWebSocket, RECONNECT_INTERVAL_MS);
        } else if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
            console.error('[WebSocket] Osiągnięto maksymalną liczbę prób ponownego połączenia. Nie można połączyć z serwerem.');
            // Tutaj możesz wyświetlić komunikat o błędzie dla użytkownika
        }
    };

    socket.onerror = (error) => {
        console.error('[WebSocket] Błąd połączenia WebSocket:', error);
        // socket.close() może być automatycznie wywołane przez przeglądarkę po błędzie,
        // ale jawne zamknięcie może pomóc w bardziej kontrolowanym ponownym połączeniu.
        // Jednak w tym przypadku, 'onclose' i tak obsłuży ponowne połączenie.
    };
}


/**
 * Wysyła wiadomość czatu przez WebSocket.
 */
async function sendMessage() {
    if (!socket || socket.readyState !== WebSocket.OPEN) {
        console.error('Błąd: Połączenie WebSocket nie jest otwarte.');
        alert('Błąd połączenia z serwerem czatu. Spróbuj odświeżyć stronę.');
        return;
    }
    if (!activeChatRecipientId) {
        console.warn('Nie wybrano odbiorcy wiadomości.');
        return;
    }

    const messageContent = messageInput.value.trim();
    if (messageContent === '') {
        return;
    }

    const chatMessage = {
        type: 'chat_message',
        senderId: userId,
        receiverId: activeChatRecipientId,
        content: messageContent,
        timestamp: new Date().toISOString()
    };

    socket.send(JSON.stringify(chatMessage));
    console.log('Wysłano wiadomość:', chatMessage);
    displayMessage(chatMessage); // Wyświetl własną wiadomość od razu
    messageInput.value = ''; // Wyczyść pole wprowadzania
    // Wyślij status "nie pisze" po wysłaniu wiadomości, jeśli jest aktywny typingTimeout
    if (typingTimeout) {
        clearTimeout(typingTimeout);
        socket.send(JSON.stringify({ type: 'typing_status', senderId: userId, receiverId: activeChatRecipientId, isTyping: false }));
    }
}

/**
 * Wyświetla wiadomość w kontenerze wiadomości.
 * @param {Object} message Wiadomość do wyświetlenia.
 */
function displayMessage(message) {
    if (!messagesContainer) return;

    const messageEl = document.createElement('div');
    messageEl.classList.add('message');
    messageEl.classList.add(message.senderId === userId ? 'outgoing' : 'incoming');

    const senderNameEl = document.createElement('div');
    senderNameEl.classList.add('sender-name');
    if (message.senderId !== userId) {
        // Dla wiadomości przychodzących wyświetl nazwę nadawcy
        getUserLabelById(message.senderId).then(name => {
            senderNameEl.textContent = name;
        });
    } else {
        senderNameEl.textContent = "Ty"; // Dla wiadomości wychodzących
    }
    messageEl.appendChild(senderNameEl);

    const messageContentEl = document.createElement('div');
    messageContentEl.classList.add('message-content');
    messageContentEl.textContent = message.content;
    messageEl.appendChild(messageContentEl);

    const timestampEl = document.createElement('div');
    timestampEl.classList.add('timestamp');
    const date = new Date(message.timestamp);
    timestampEl.textContent = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    messageEl.appendChild(timestampEl);

    messagesContainer.appendChild(messageEl);
    messagesContainer.scrollTop = messagesContainer.scrollHeight; // Przewiń na dół
}

/**
 * Ładuje konwersacje z bazy danych i wyświetla je.
 */
async function loadConversations() {
    if (!userId) {
        console.warn("[loadConversations] Brak ID użytkownika. Nie można załadować konwersacji.");
        return;
    }
    console.log(`[loadConversations] Rozpoczynanie ładowania konwersacji dla userId: ${userId}`);

    try {
        const { data: messages, error: messagesError } = await supabase
            .from('messages')
            .select('*')
            .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)
            .order('timestamp', { ascending: true });

        if (messagesError) {
            console.error('Błąd ładowania wiadomości:', messagesError);
            return;
        }

        const allProfiles = await loadAllProfiles();
        const profilesMap = new Map(allProfiles.map(p => [p.id, p]));

        const conversationsMap = new Map(); // Mapa przechowująca ostatnią wiadomość dla każdej konwersacji
        const unreadCounts = new Map(); // Mapa przechowująca liczbę nieprzeczytanych wiadomości

        messages.forEach(msg => {
            let participantId;
            if (msg.sender_id === userId) {
                participantId = msg.receiver_id;
            } else {
                participantId = msg.sender_id;
            }

            // Zapisz ostatnią wiadomość
            if (!conversationsMap.has(participantId) || new Date(msg.timestamp) > new Date(conversationsMap.get(participantId).timestamp)) {
                conversationsMap.set(participantId, msg);
            }

            // Zlicz nieprzeczytane wiadomości
            if (msg.receiver_id === userId && !msg.read) {
                unreadCounts.set(participantId, (unreadCounts.get(participantId) || 0) + 1);
            }
        });

        contactsListEl.innerHTML = ''; // Wyczyść listę przed ponownym renderowaniem

        // Przejdź przez wszystkie profile i stwórz listę konwersacji
        for (const profile of allProfiles) {
            if (profile.id === userId) continue; // Pomiń samego siebie

            const convoId = profile.id;
            const convoLabel = profile.username || profile.full_name || `Użytkownik (${convoId.substring(0, 4)}...)`;
            const lastMessage = conversationsMap.get(convoId);
            const isOnline = activeUsers.has(convoId);
            const unreadCount = unreadCounts.get(convoId) || 0;

            const li = document.createElement('li');
            li.dataset.userId = convoId;
            li.classList.add('conversation-item');
            if (isOnline) {
                li.classList.add('online');
            }

            let lastMessagePreview = 'Brak wiadomości';
            if (lastMessage) {
                const senderPrefix = lastMessage.sender_id === userId ? 'Ty: ' : '';
                lastMessagePreview = `${senderPrefix}${lastMessage.content.substring(0, 30)}${lastMessage.content.length > 30 ? '...' : ''}`;
            }

            li.innerHTML = `
                <div class="user-avatar"></div>
                <div class="conversation-info">
                    <span class="user-name">${convoLabel}</span>
                    <span class="last-message-preview">${lastMessagePreview}</span>
                </div>
                ${unreadCount > 0 ? `<span class="unread-count">${unreadCount}</span>` : ''}
                <span class="status-indicator ${isOnline ? 'online' : 'offline'}"></span>
            `;

            li.addEventListener('click', () => openChat(convoId, convoLabel));
            contactsListEl.appendChild(li);
        }
        updateActiveUsersListUI(Array.from(activeUsers)); // Aktualizuj listę aktywnych po załadowaniu konwersacji
    } catch (error) {
        console.error('Wyjątek podczas ładowania konwersacji:', error);
    }
}

/**
 * Otwiera okno czatu dla wybranego odbiorcy.
 * @param {string} recipientId ID odbiorcy.
 * @param {string} recipientName Nazwa odbiorcy.
 */
async function openChat(recipientId, recipientName) {
    if (!messagesContainer || !chatArea || !logoScreen || !chatUserAvatar || !chatUserName || !userStatusSpan || !messageInput || !sendButton) return;

    activeChatRecipientId = recipientId;
    activeChatRecipientName = recipientName;

    // Aktualizacja nagłówka czatu
    chatUserName.textContent = recipientName;
    const isOnline = activeUsers.has(recipientId);
    userStatusSpan.textContent = isOnline ? 'Online' : 'Offline';
    userStatusSpan.classList.toggle('online', isOnline);
    userStatusSpan.classList.toggle('offline', !isOnline);

    // Zmiana awatara
    const recipientProfile = await getProfileById(recipientId);
    if (recipientProfile && recipientProfile.avatar_url) {
        chatUserAvatar.style.backgroundImage = `url(${recipientProfile.avatar_url})`;
    } else {
        chatUserAvatar.style.backgroundImage = `none`; // Domyślny awatar
    }

    // Pokaż obszar czatu i ukryj ekran powitalny
    logoScreen.style.display = 'none';
    chatArea.style.display = 'flex'; // Zmienione na flex dla poprawnego układu wewnętrznego

    // Wyczyść stare wiadomości i załaduj nowe
    messagesContainer.innerHTML = '';
    await loadMessagesForChat(recipientId);

    // Aktywuj pole wprowadzania wiadomości i przycisk wysyłania
    messageInput.disabled = false;
    sendButton.disabled = false;
    messageInput.focus();

    // Na mobile, ukryj sidebar i pokaż obszar czatu
    if (window.matchMedia('(max-width: 768px)').matches) {
        if (sidebarEl) sidebarEl.style.display = 'none';
        if (onlineUsersMobile) onlineUsersMobile.style.display = 'none';
        if (chatAreaWrapper) chatAreaWrapper.style.display = 'flex';
        // Przycisk wstecz jest teraz zawsze widoczny na mobile dzięki handleMediaQueryChange
    }

    // Oznacz wszystkie wiadomości z tej konwersacji jako przeczytane
    await markMessagesAsRead(recipientId);
    // Usuń licznik nieprzeczytanych z UI
    const convoItem = contactsListEl.querySelector(`[data-user-id="${recipientId}"]`);
    if (convoItem) {
        const unreadCountSpan = convoItem.querySelector('.unread-count');
        if (unreadCountSpan) unreadCountSpan.remove();
    }
}

/**
 * Ładuje wiadomości dla aktywnej konwersacji.
 * @param {string} targetUserId ID użytkownika, z którym prowadzona jest rozmowa.
 */
async function loadMessagesForChat(targetUserId) {
    if (!userId || !targetUserId) {
        console.warn("Brak ID użytkownika lub ID odbiorcy do załadowania wiadomości czatu.");
        return;
    }

    try {
        const { data: chatMessages, error } = await supabase
            .from('messages')
            .select('*')
            .or(`and(sender_id.eq.${userId},receiver_id.eq.${targetUserId}),and(sender_id.eq.${targetUserId},receiver_id.eq.${userId})`)
            .order('timestamp', { ascending: true });

        if (error) {
            console.error('Błąd ładowania wiadomości czatu:', error);
            return;
        }

        messagesContainer.innerHTML = ''; // Wyczyść przed dodaniem nowych
        chatMessages.forEach(msg => displayMessage(msg));
        messagesContainer.scrollTop = messagesContainer.scrollHeight; // Przewiń na dół
    } catch (err) {
        console.error('Wyjątek podczas ładowania wiadomości czatu:', err);
    }
}

/**
 * Aktualizuje status online/offline na liście konwersacji.
 * @param {string} targetUserId ID użytkownika.
 * @param {boolean} isOnline Czy użytkownik jest online.
 */
function updateConversationStatus(targetUserId, isOnline) {
    const convoItem = contactsListEl.querySelector(`[data-user-id="${targetUserId}"]`);
    if (convoItem) {
        convoItem.classList.toggle('online', isOnline);
        convoItem.classList.toggle('offline', !isOnline);
        const statusIndicator = convoItem.querySelector('.status-indicator');
        if (statusIndicator) {
            statusIndicator.classList.toggle('online', isOnline);
            statusIndicator.classList.toggle('offline', !isOnline);
        }
    }
    // Aktualizuj status w nagłówku aktywnego czatu
    if (activeChatRecipientId === targetUserId && userStatusSpan) {
        userStatusSpan.textContent = isOnline ? 'Online' : 'Offline';
        userStatusSpan.classList.toggle('online', isOnline);
        userStatusSpan.classList.toggle('offline', !isOnline);
    }
}

/**
 * Aktualizuje listę aktywnych użytkowników w prawym pasku bocznym (i na mobile).
 * @param {string[]} activeUserIds Tablica ID aktywnych użytkowników.
 */
async function updateActiveUsersListUI(activeUserIds) {
    if (!activeUsersListEl && !onlineUsersMobile) return;

    const allProfiles = await loadAllProfiles();
    const profilesMap = new Map(allProfiles.map(p => [p.id, p]));

    const renderList = (element, isMobile = false) => {
        element.innerHTML = '';
        if (activeUserIds.length === 0) {
            const noUsersEl = document.createElement('li');
            noUsersEl.textContent = 'Brak aktywnych użytkowników.';
            noUsersEl.style.cssText = 'text-align: center; color: var(--text-color-medium); font-size: 0.9em; margin-top: 10px; list-style: none;';
            element.appendChild(noUsersEl);
            return;
        }

        activeUserIds.forEach(id => {
            if (id === userId) return; // Pomiń siebie

            const profile = profilesMap.get(id);
            if (!profile) return;

            const li = document.createElement('li');
            li.dataset.userId = id;
            li.classList.add('active-user-item');

            const convoLabel = profile.username || profile.full_name || `Użytkownik (${id.substring(0, 4)}...)`;

            li.innerHTML = `
                <div class="user-avatar"></div>
                <div class="user-info">
                    <span class="user-name">${convoLabel}</span>
                    <span class="status-indicator online"></span>
                </div>
            `;
            li.addEventListener('click', () => openChat(id, convoLabel));
            element.appendChild(li);
        });
    };

    // Renderuj dla desktopowego paska bocznego
    if (activeUsersListEl) {
        renderList(activeUsersListEl);
    }

    // Renderuj dla mobilnego widoku aktywnych użytkowników
    if (onlineUsersMobile) {
        // Tworzymy tymczasową listę dla mobile, jeśli onlineUsersMobile nie ma bezpośrednio ul
        let mobileUl = onlineUsersMobile.querySelector('ul.active-users-list');
        if (!mobileUl) {
            mobileUl = document.createElement('ul');
            mobileUl.classList.add('active-users-list');
            onlineUsersMobile.appendChild(mobileUl);
        }
        renderList(mobileUl, true);
    }
}


/**
 * Obsługuje status pisania użytkownika.
 * @param {string} senderId ID użytkownika, który pisze.
 * @param {boolean} isTyping True, jeśli pisze; false, jeśli przestał.
 */
function handleTypingStatus(senderId, isTyping) {
    if (!typingStatusHeader || !typingIndicator || activeChatRecipientId !== senderId) {
        return;
    }

    if (isTyping) {
        typingStatusHeader.textContent = `${activeChatRecipientName} pisze...`;
        typingIndicator.classList.remove('hidden');
    } else {
        typingStatusHeader.textContent = '';
        typingIndicator.classList.add('hidden');
    }
}

/**
 * Oznacza wiadomości w danej konwersacji jako przeczytane w bazie danych.
 * @param {string} participantId ID drugiego uczestnika konwersacji.
 */
async function markMessagesAsRead(participantId) {
    if (!userId || !participantId) return;

    try {
        const { data, error } = await supabase
            .from('messages')
            .update({ read: true })
            .eq('receiver_id', userId) // Wiadomości odebrane przez obecnego użytkownika
            .eq('sender_id', participantId) // I wysłane przez wybranego uczestnika
            .eq('read', false); // Tylko te, które jeszcze nie są przeczytane

        if (error) {
            console.error('Błąd oznaczania wiadomości jako przeczytane:', error);
        } else {
            console.log(`Oznaczono wiadomości od ${participantId} jako przeczytane.`);
        }
    } catch (err) {
        console.error('Wyjątek podczas oznaczania wiadomości jako przeczytane:', err);
    }
}

/**
 * Oznacza konwersację jako nieprzeczytaną w UI.
 * @param {string} senderId ID nadawcy nowej wiadomości.
 */
function markConversationAsUnread(senderId) {
    const convoItem = contactsListEl.querySelector(`[data-user-id="${senderId}"]`);
    if (convoItem) {
        let unreadCountSpan = convoItem.querySelector('.unread-count');
        if (!unreadCountSpan) {
            unreadCountSpan = document.createElement('span');
            unreadCountSpan.classList.add('unread-count');
            convoItem.appendChild(unreadCountSpan);
        }
        unreadCountSpan.textContent = parseInt(unreadCountSpan.textContent || '0') + 1;
    }
}


// ==========================================================
// Inicjalizacja i Listenery
// ==========================================================

/**
 * Inicjalizuje aplikację po załadowaniu DOM.
 */
async function initializeApp() {
    console.log("[initializeApp] Rozpoczęcie inicjalizacji aplikacji Komunikator.");
    initializeDOMElements(); // Inicjalizacja zmiennych DOM

    // --- KLUCZOWA LOGIKA AUTORYZACJI PRZEZ SUPABASE I PRZEKIEROWANIE ---
    try {
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();

        if (sessionError) {
            console.error("Błąd podczas pobierania sesji Supabase:", sessionError);
            // Nadal próbuj z localStorage jako backup przed przekierowaniem
            userId = localStorage.getItem('userId');
            if (!userId) {
                console.warn("[initializeApp] Brak ID użytkownika po błędzie Supabase. Przekierowanie na stronę logowania.");
                window.location.href = '/login.html';
                return;
            }
        } else if (session) {
            userId = session.user.id;
            localStorage.setItem('userId', userId); // Upewnij się, że localStorage jest aktualne
            console.log(`[initializeApp] Znaleziono ID użytkownika z Supabase Session: ${userId}`);
        } else {
            // Brak sesji i brak w localStorage - użytkownik nie jest zalogowany
            userId = localStorage.getItem('userId'); // Ostatnia szansa na userId z localStorage
            if (userId) {
                 console.log(`[initializeApp] Znaleziono ID użytkownika w localStorage (brak aktywnej sesji Supabase, ale ID było wcześniej): ${userId}`);
            } else {
                console.warn("[initializeApp] Brak ID użytkownika w localStorage i aktywnej sesji Supabase. Przekierowanie na stronę logowania.");
                window.location.href = '/login.html';
                return;
            }
        }
    } catch (error) {
        console.error("Ogólny błąd w initializeApp podczas pobierania sesji Supabase:", error);
        userId = localStorage.getItem('userId');
        if (!userId) { // Jeśli nawet po błędzie nie ma userId, przekieruj
             console.warn("[initializeApp] Brak ID użytkownika po ogólnym błędzie. Przekierowanie na stronę logowania.");
             window.location.href = '/login.html';
             return;
        }
    }
    // --- KONIEC KLUCZOWEJ LOGIKI AUTORYZACJI ---

    // Połączenie z WebSocketem powinno nastąpić TYLKO jeśli userId jest dostępne.
    // W obecnej logice userId powinno być już ustawione, albo nastąpi przekierowanie.
    if (userId) {
        connectWebSocket();
    } else {
        // Ten blok powinien być osiągnięty tylko jeśli wcześniej nastąpiło przekierowanie.
        // Jeśli jednak userId jest null tutaj, to jest to błąd logiczny.
        console.error("Błąd: userId jest null po logicznej ścieżce initializeApp. Nie można połączyć z WebSocket.");
        alert("Błąd inicjalizacji użytkownika. Odśwież stronę lub zaloguj się ponownie.");
        window.location.href = '/login.html'; // Upewnij się, że użytkownik jest przekierowany
        return;
    }

    // --- Listenery zdarzeń ---

    // Obsługa wylogowania
    if (logoutButton) {
        logoutButton.addEventListener('click', async () => {
            const { error } = await supabase.auth.signOut();
            if (error) {
                console.error('Błąd wylogowania:', error.message);
                alert('Wystąpił błąd podczas wylogowania.');
            } else {
                localStorage.removeItem('userId'); // Usuń ID użytkownika z localStorage
                // Zamknij połączenie WebSocket przed przekierowaniem
                if (socket && socket.readyState === WebSocket.OPEN) {
                    socket.close(1000, 'User logged out'); // Kod 1000 to normalne zamknięcie
                }
                window.location.href = '/login.html'; // Przekieruj na stronę logowania
            }
        });
    }

    // Obsługa przełącznika motywu
    if (themeToggle) {
        themeToggle.addEventListener('click', () => {
            document.body.classList.toggle('dark-mode');
            const isDarkMode = document.body.classList.contains('dark-mode');
            localStorage.setItem('theme', isDarkMode ? 'dark' : 'light');
            themeToggle.querySelector('i').className = isDarkMode ? 'fas fa-sun' : 'fas fa-moon';
            themeToggle.lastChild.nodeValue = isDarkMode ? ' Tryb jasny' : ' Tryb ciemny';
        });
        // Ustawienie motywu na podstawie localStorage przy starcie
        const savedTheme = localStorage.getItem('theme');
        if (savedTheme === 'dark') {
            document.body.classList.add('dark-mode');
            themeToggle.querySelector('i').className = 'fas fa-sun';
            themeToggle.lastChild.nodeValue = ' Tryb jasny';
        } else {
            document.body.classList.remove('dark-mode');
            themeToggle.querySelector('i').className = 'fas fa-moon';
            themeToggle.lastChild.nodeValue = ' Tryb ciemny';
        }
    }

    // Obsługa menu głównego
    if (menuButton && dropdownMenu) {
        menuButton.addEventListener('click', () => {
            dropdownMenu.classList.toggle('hidden');
            menuButton.setAttribute('aria-expanded', !dropdownMenu.classList.contains('hidden'));
        });
        // Zamknij menu po kliknięciu poza nim
        document.addEventListener('click', (event) => {
            if (!menuButton.contains(event.target) && !dropdownMenu.contains(event.target)) {
                dropdownMenu.classList.add('hidden');
                menuButton.setAttribute('aria-expanded', 'false');
            }
        });
    }

    // Obsługa nawigacji ikon
    if (mainNavIcons) {
        mainNavIcons.addEventListener('click', async (event) => {
            const clickedButton = event.target.closest('.nav-icon');
            if (!clickedButton) return;

            navIcons.forEach(icon => icon.classList.remove('active'));
            clickedButton.classList.add('active');

            const tooltip = clickedButton.dataset.tooltip;
            if (tooltip === 'Rozmowy') {
                if (sidebarEl) sidebarEl.style.display = 'block';
                if (onlineUsersMobile) onlineUsersMobile.style.display = 'none';
                if (chatAreaWrapper && activeChatRecipientId) { // Jeśli jest aktywna rozmowa, pokaż czat
                    chatAreaWrapper.style.display = 'flex';
                } else if (chatAreaWrapper && window.matchMedia('(max-width: 768px)').matches) {
                    chatAreaWrapper.style.display = 'none'; // Ukryj czat na mobile, jeśli nie ma rozmowy
                }
                loadConversations(); // Odśwież/załadowanie konwersacji (wszystkich użytkowników)
            } else if (tooltip === 'Użytkownicy') {
                if (sidebarEl) sidebarEl.style.display = 'none';
                if (onlineUsersMobile) {
                    onlineUsersMobile.style.display = 'block';
                    updateActiveUsersListUI(Array.from(activeUsers)); // Zapewnij aktualną listę aktywnych
                }
                if (chatAreaWrapper) chatAreaWrapper.style.display = 'none'; // Ukryj główny obszar czatu na mobile
                if (rightSidebarWrapper) rightSidebarWrapper.style.display = 'none'; // Upewnij się, że prawy sidebar jest ukryty
            } else if (tooltip === 'Ustawienia') {
                if (sidebarEl) sidebarEl.style.display = 'none';
                if (onlineUsersMobile) onlineUsersMobile.style.display = 'none';
                if (chatAreaWrapper) chatAreaWrapper.style.display = 'none'; // Ukryj główny obszar czatu na mobile
                if (rightSidebarWrapper) rightSidebarWrapper.style.display = 'none';
                // Tutaj możesz wyświetlić inny widok ustawień
            }
        });
    }

    // Obsługa przycisku "Wróć" na mobile
    if (backButton) {
        backButton.addEventListener('click', () => {
            if (chatAreaWrapper) chatAreaWrapper.style.display = 'none';
            if (sidebarEl) sidebarEl.style.display = 'block';
            if (onlineUsersMobile) onlineUsersMobile.style.display = 'none'; // Upewnij się, że mobilna lista online jest ukryta
            activeChatRecipientId = null; // Zresetuj aktywnego odbiorcę
            // Możesz również zresetować styl aktywnej konwersacji
            const activeConvoItem = contactsListEl.querySelector('.conversation-item.active');
            if (activeConvoItem) {
                activeConvoItem.classList.remove('active');
            }
        });
    }

    // Nasłuchiwanie na przycisk wysyłania
    if (sendButton) {
        sendButton.addEventListener('click', sendMessage);
    }

    // Nasłuchiwanie na Enter w polu wiadomości
    let typingTimeout;
    if (messageInput) {
        messageInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault(); // Zapobiegaj nowej linii w polu tekstowym
                sendButton.click(); // Symuluj kliknięcie przycisku "Wyślij"
            }
        });

        messageInput.addEventListener('input', () => {
            if (socket && socket.readyState === WebSocket.OPEN && activeChatRecipientId && userId) {
                // Wyślij status "pisze"
                socket.send(JSON.stringify({ type: 'typing_status', senderId: userId, receiverId: activeChatRecipientId, isTyping: true }));
                // Ustaw timer na wysłanie statusu "nie pisze" po 3 sekundach bez wprowadzania
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
    handleMediaQueryChange(mq); // Początkowe wywołanie w celu ustawienia poprawnego układu

    console.log("[initializeApp] Aplikator Komunikator zainicjalizowany pomyślnie.");
}

// Uruchomienie aplikacji po załadowaniu DOM
document.addEventListener('DOMContentLoaded', initializeApp);