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
let navIcons; // Przycisk do przełączania rozmów, użytkowników, ustawień

let onlineUsersMobile; // Kontener dla aktywnych użytkowników na mobile

let sidebarEl; // <aside class="sidebar" id="sidebar">
let searchInput; // <input id="sidebarSearchInput">
let contactsListEl; // <ul class="conversations-list" id="contactsList"> - Lista konwersacji/kontaktów
let searchBarEl; // Zmienna dla paska wyszukiwania (jeśli jest)

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
let chatSettingsDropdown; // <div id="chatSettingsDropdown" class="dropdown chat-settings-dropdown">
let typingStatusHeader; // <span id="typingStatus">

let chatMessages; // <div class="chat-messages" id="chatMessages"> - Kontener na wiadomości w aktywnym czacie
let messageInput; // <input id="messageInput">
let sendButton; // <button id="sendButton">
let emojiButton; // <button class="emoji-button">
let attachButton; // <button class="attach-button">

let rightSidebarWrapper; // <aside class="right-sidebar-wrapper">
let rightSidebar; // <div class="right-sidebar" id="rightSidebar">
let activeUsersList; // <ul class="active-users-list" id="activeUsersList">
let noActiveUsersText; // <div id="noActiveUsersText">

let typingIndicator; // <div class="typing-indicator-messages" id="typingIndicatorMessages">

let userId; // ID zalogowanego użytkownika (aktualnie zalogowany)
let activeChatRecipientId = null; // ID użytkownika, z którym obecnie czatujemy (dla czatów 1-na-1)
let activeChatRecipientName = ''; // Nazwa użytkownika, z którym obecnie czatujemy

// WebSocket
let socket;
let activeUsers = new Set(); // Przechowuje ID użytkowników online
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_INTERVAL_MS = 3000;

// ==========================================================
// Funkcje pomocnicze
// ==========================================================

/**
 * Prosta funkcja pomocnicza do pobierania elementów DOM po ID.
 * @param {string} id ID elementu.
 * @returns {HTMLElement|null} Element DOM lub null.
 */
function getElement(id) {
    const el = document.getElementById(id);
    if (!el) {
        console.warn(`Element z ID '${id}' nie znaleziony.`);
    }
    return el;
}

/**
 * Inicjalizuje wszystkie globalne elementy DOM.
 */
function initializeDOMElements() {
    console.log("[initializeDOMElements] Rozpoczynanie inicjalizacji elementów DOM.");

    mainHeader = getElement('mainHeader');
    menuButton = getElement('menuButton');
    dropdownMenu = getElement('dropdownMenu');
    themeToggle = getElement('themeToggle');
    logoutButton = getElement('logoutButton');

    container = getElement('container');
    sidebarWrapper = document.querySelector('.sidebar-wrapper'); // Jest klasa, a nie ID
    mainNavIcons = document.querySelector('.main-nav-icons');
    navIcons = document.querySelectorAll('.main-nav-icons .nav-icon'); // NodeList

    onlineUsersMobile = getElement('onlineUsersMobile'); // Sprawdź czy to ID istnieje w HTML

    sidebarEl = getElement('sidebar');
    searchInput = getElement('sidebarSearchInput');
    contactsListEl = getElement('contactsList'); // Powinno być ul z listą konwersacji/kontaktów

    chatAreaWrapper = document.querySelector('.chat-area-wrapper');
    logoScreen = getElement('logoScreen');
    chatArea = getElement('chatArea');

    chatHeader = document.querySelector('.chat-header');
    backButton = getElement('backButton');
    chatUserAvatar = getElement('chatUserAvatar');
    chatUserName = getElement('chatUserName');
    userStatusSpan = getElement('userStatus');
    chatHeaderActions = document.querySelector('.chat-header-actions');
    chatSettingsButton = getElement('chatSettingsButton');
    chatSettingsDropdown = getElement('chatSettingsDropdown');
    typingStatusHeader = getElement('typingStatus');

    chatMessages = getElement('chatMessages');
    messageInput = getElement('messageInput');
    sendButton = getElement('sendButton');
    emojiButton = document.querySelector('.emoji-button');
    attachButton = document.querySelector('.attach-button');

    rightSidebarWrapper = document.querySelector('.right-sidebar-wrapper');
    rightSidebar = getElement('rightSidebar');
    activeUsersList = getElement('activeUsersList');
    noActiveUsersText = getElement('noActiveUsersText');

    typingIndicator = getElement('typingIndicator');

    console.log("[initializeDOMElements] Zakończono inicjalizację elementów DOM.");
}

/**
 * Uruchamia połączenie WebSocket.
 */
function connectWebSocket() {
    console.log(`[WebSocket] Próba połączenia z serwerem: ${process.env.VITE_WEBSOCKET_URL}`);
    socket = new WebSocket(process.env.VITE_WEBSOCKET_URL);

    socket.onopen = () => {
        console.log('[WebSocket] Połączono z serwerem WebSocket.');
        reconnectAttempts = 0; // Resetuj licznik prób ponownego połączenia po udanym połączeniu
        // Wyślij ID użytkownika zaraz po połączeniu
        if (userId) {
            socket.send(JSON.stringify({ type: 'authenticate', userId: userId }));
        } else {
            console.error('Brak ID użytkownika do uwierzytelnienia na WebSocket!');
            // Możesz przekierować użytkownika na stronę logowania lub pokazać błąd
        }
    };

    socket.onmessage = async (event) => {
        const message = JSON.parse(event.data);
        console.log('[WebSocket] Otrzymano wiadomość:', message);

        switch (message.type) {
            case 'auth_success':
                console.log(`[WebSocket] Zalogowano jako użytkownik ID: ${message.userId}`);
                // Po udanym zalogowaniu, załaduj listę konwersacji
                userId = message.userId;
                await loadConversations();
                break;
            case 'user_status':
                // Aktualizuj status online/offline użytkownika
                if (message.status === 'online') {
                    activeUsers.add(message.userId);
                    console.log(`[WebSocket] Użytkownik ${message.userId} jest teraz online.`);
                } else {
                    activeUsers.delete(message.userId);
                    console.log(`[WebSocket] Użytkownik ${message.userId} jest teraz offline.`);
                }
                updateActiveUsersListUI(Array.from(activeUsers));
                // Zaktualizuj UI, np. listę kontaktów
                updateConversationStatus(message.userId, message.status === 'online');
                break;
            case 'user_list':
                // Początkowa lista aktywnych użytkowników
                activeUsers = new Set(message.users);
                console.log('[WebSocket] Aktywni użytkownicy (ID):', Array.from(activeUsers));
                updateActiveUsersListUI(Array.from(activeUsers));
                // Po załadowaniu listy, upewnij się, że stany konwersacji są zaktualizowane
                // loadConversations() już to zrobi, jeśli wywoła się po tym.
                // Możesz też dodać logikę do odświeżania statusów bez przeładowywania całej listy
                break;
            case 'chat_message':
                // Obsługa nowej wiadomości czatu
                console.log('Otrzymano wiadomość czatu:', message);
                displayMessage(message);
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
        // Spróbuj ponownie połączyć, jeśli połączenie zostało nieoczekiwanie zamknięte
        if (event.code !== 1000 && reconnectAttempts < MAX_RECONNECT_ATTEMPTS) { // 1000 to normalne zamknięcie
            reconnectAttempts++;
            console.log(`[WebSocket] Próba ponownego połączenia (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})...`);
            setTimeout(connectWebSocket, RECONNECT_INTERVAL_MS);
        } else if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
            console.error('[WebSocket] Osiągnięto maksymalną liczbę prób ponownego połączenia. Nie można połączyć z serwerem.');
            // Tutaj możesz wyświetlić komunikat dla użytkownika
        }
    };

    socket.onerror = (error) => {
        console.error('[WebSocket] Błąd połączenia WebSocket:', error);
        socket.close(); // Zamknij, aby wywołać onclose i logiczne ponowne połączenie
    };
}

/**
 * Aktualizuje listę aktywnych użytkowników w UI.
 * @param {Array<string>} userIds Array ID użytkowników, którzy są online.
 */
function updateActiveUsersListUI(userIds) {
    if (!activeUsersList) {
        console.warn("Element activeUsersList nie znaleziony.");
        return;
    }
    activeUsersList.innerHTML = ''; // Wyczyść listę

    if (userIds.length === 0) {
        if (noActiveUsersText) noActiveUsersText.style.display = 'block';
        return;
    } else {
        if (noActiveUsersText) noActiveUsersText.style.display = 'none';
    }

    // Filtruj siebie z listy aktywnych użytkowników
    const onlineUsersToDisplay = userIds.filter(id => id !== userId);

    onlineUsersToDisplay.forEach(async (onlineUserId) => {
        const userProfile = await getProfileById(onlineUserId); // Pobierz pełny profil
        if (userProfile) {
            const listItem = document.createElement('li');
            listItem.classList.add('active-user-item');
            listItem.dataset.userId = onlineUserId;
            listItem.innerHTML = `
                <div class="user-avatar"></div>
                <span>${userProfile.username || userProfile.full_name || `Użytkownik (${onlineUserId.substring(0, 4)}...)`}</span>
                <span class="status online"></span>
            `;
            activeUsersList.appendChild(listItem);
        }
    });

    console.log(`[updateActiveUsersListUI] Zaktualizowano listę aktywnych użytkowników. Online: ${onlineUsersToDisplay.length}`);
}

/**
 * Aktualizuje status online/offline dla konkretnej konwersacji na liście.
 * @param {string} targetUserId ID użytkownika, którego status zmieniamy.
 * @param {boolean} isOnline Czy użytkownik jest online.
 */
function updateConversationStatus(targetUserId, isOnline) {
    if (!sidebarEl) {
        console.warn("Element sidebarEl nie znaleziony. Nie można zaktualizować statusu konwersacji.");
        return;
    }

    const conversationItem = sidebarEl.querySelector(`li[data-user-id="${targetUserId}"]`);
    if (conversationItem) {
        const statusSpan = conversationItem.querySelector('.status');
        if (statusSpan) {
            if (isOnline) {
                statusSpan.classList.remove('offline');
                statusSpan.classList.add('online');
            } else {
                statusSpan.classList.remove('online');
                statusSpan.classList.add('offline');
            }
        }
    }

    // Aktualizuj również status w nagłówku czatu, jeśli to aktywna konwersacja
    if (activeChatRecipientId === targetUserId && chatUserName) {
        if (isOnline) {
            userStatusSpan.textContent = 'online';
            userStatusSpan.classList.remove('offline');
            userStatusSpan.classList.add('online');
        } else {
            userStatusSpan.textContent = 'offline';
            userStatusSpan.classList.remove('online');
            userStatusSpan.classList.add('offline');
        }
    }
}

/**
 * Ładuje i wyświetla wszystkie zarejestrowane konwersacje (profile użytkowników).
 */
export async function loadConversations() {
    console.log(`[loadConversations] Rozpoczynanie ładowania wszystkich zarejestrowanych użytkowników dla userId: ${userId}`);
    if (!sidebarEl) {
        console.warn("Element sidebarEl nie znaleziony. Nie można załadować konwersacji.");
        return;
    }
    sidebarEl.innerHTML = ''; // Wyczyść listę konwersacji przed załadowaniem
    console.log("[loadConversations] Wyczyścino listę konwersacji.");

    try {
        const allRegisteredProfiles = await loadAllProfiles();
        console.log("[loadConversations] Pobrane wszystkie zarejestrowane profile:", allRegisteredProfiles);

        // Filtruj, aby nie wyświetlać aktualnie zalogowanego użytkownika
        const conversationsToDisplay = allRegisteredProfiles.filter(profile => profile.id !== userId);
        console.log("[loadConversations] Profile do wyświetlenia (po odfiltrowaniu siebie):", conversationsToDisplay);

        if (conversationsToDisplay.length === 0) {
            sidebarEl.innerHTML = '<li class="no-conversations-message">Brak zarejestrowanych użytkowników do wyświetlenia.</li>';
            console.log("[loadConversations] Brak zarejestrowanych użytkowników do wyświetlenia.");
            return;
        }

        for (const convo of conversationsToDisplay) {
            // Utwórz nowy element listy dla każdej konwersacji
            const conversationItem = document.createElement('li');
            conversationItem.classList.add('conversation-item');
            conversationItem.dataset.userId = convo.id; // Ustaw data-user-id na ID użytkownika
            
            // Pobierz etykietę użytkownika (username lub full_name)
            const userLabel = await getUserLabelById(convo.id); // TUTAJ BYŁ BRAK

            conversationItem.dataset.username = userLabel; // Zapisz nazwę użytkownika (teraz poprawnie pobrana)

            // Sprawdź, czy użytkownik jest online na podstawie listy aktywnych użytkowników
            const isOnline = activeUsers.has(convo.id);
            
            console.log(`[loadConversations] Próba renderowania profilu jako konwersacji: ${userLabel}, ID: ${convo.id}, Online: ${isOnline}`);
            console.log(`[renderConversationItem] Rozpoczynanie renderowania elementu dla ${userLabel}. Online: ${isOnline}`);


            // Renderuj element konwersacji
            conversationItem.innerHTML = `
                <div class="user-avatar"></div>
                <div class="conversation-info">
                    <span class="conversation-name">${userLabel}</span>
                    <span class="last-message">${convo.lastMessage || ''}</span>
                </div>
                <div class="conversation-meta">
                    <span class="last-message-time">${convo.lastMessageTime || ''}</span>
                    <span class="status ${isOnline ? 'online' : 'offline'}"></span>
                </div>
            `;
            sidebarEl.appendChild(conversationItem);

            // Dodaj obsługę kliknięcia elementu konwersacji
            conversationItem.addEventListener('click', async () => {
                // Implementacja otwierania czatu
                console.log(`Wybrano konwersację z użytkownikiem ID: ${convo.id}, Nazwa: ${userLabel}`);
                activeChatRecipientId = convo.id;
                activeChatRecipientName = userLabel; // Użyj poprawnej etykiety

                // Aktualizuj nagłówek czatu
                if (chatUserName) chatUserName.textContent = activeChatRecipientName;
                if (userStatusSpan) {
                    // Sprawdź aktualny status online
                    if (activeUsers.has(activeChatRecipientId)) {
                        userStatusSpan.textContent = 'online';
                        userStatusSpan.classList.remove('offline');
                        userStatusSpan.classList.add('online');
                    } else {
                        userStatusSpan.textContent = 'offline';
                        userStatusSpan.classList.remove('online');
                        userStatusSpan.classList.add('offline');
                    }
                }

                // Pokaż obszar czatu, ukryj logoScreen
                if (logoScreen) logoScreen.classList.add('hidden');
                if (chatArea) chatArea.classList.add('active');
                if (backButton) backButton.style.display = 'block'; // Pokaż przycisk Wstecz na mobile

                // Wyczyść stare wiadomości i załaduj nowe dla tej konwersacji
                if (chatMessages) chatMessages.innerHTML = '';
                // Tutaj będziesz ładować wiadomości z bazy danych dla tej konwersacji
                // loadMessages(userId, activeChatRecipientId); // TODO: implementuj loadMessages
                
                // Uaktywnij pole wiadomości i przycisk wyślij
                if (messageInput) messageInput.disabled = false;
                if (sendButton) sendButton.disabled = false;
                
                // Schowaj pasek boczny na mobile po wybraniu konwersacji
                if (window.matchMedia('(max-width: 768px)').matches) {
                    if (sidebarWrapper) sidebarWrapper.classList.add('hidden-on-mobile');
                    if (chatAreaWrapper) chatAreaWrapper.classList.add('active-on-mobile');
                }
            });
        }
    } catch (err) {
        console.error('Błąd podczas ładowania konwersacji:', err);
    }
}

/**
 * Wyświetla pojedynczą wiadomość w obszarze czatu.
 * @param {Object} message Wiadomość do wyświetlenia.
 */
function displayMessage(message) {
    if (!chatMessages) {
        console.warn("Element chatMessages nie znaleziony. Nie można wyświetlić wiadomości.");
        return;
    }

    const messageEl = document.createElement('div');
    messageEl.classList.add('message');
    // Sprawdź, czy wiadomość została wysłana przez aktualnego użytkownika
    if (message.senderId === userId) {
        messageEl.classList.add('outgoing');
    } else {
        messageEl.classList.add('incoming');
    }

    // Formatowanie daty i czasu
    const date = new Date(message.timestamp);
    const timeString = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    messageEl.innerHTML = `
        <div class="message-bubble">${message.content}</div>
        <div class="message-time">${timeString}</div>
    `;
    chatMessages.appendChild(messageEl);

    // Przewiń do najnowszej wiadomości
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

/**
 * Obsługuje status pisania wiadomości.
 * @param {string} senderId ID użytkownika, który pisze.
 * @param {boolean} isTyping Czy użytkownik pisze.
 */
function handleTypingStatus(senderId, isTyping) {
    if (activeChatRecipientId === senderId && typingStatusHeader) {
        if (isTyping) {
            typingStatusHeader.textContent = 'pisze...';
            // Jeśli masz animację, aktywuj ją
            if (typingIndicator) typingIndicator.classList.remove('hidden');
        } else {
            typingStatusHeader.textContent = '';
            // Jeśli masz animację, dezaktywuj ją
            if (typingIndicator) typingIndicator.classList.add('hidden');
        }
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

    // Sprawdź, czy użytkownik jest już zalogowany w lokalnym magazynie
    userId = localStorage.getItem('userId');
	connectWebSocket();
    if (userId) {
        console.log(`[initializeApp] Znaleziono ID użytkownika w localStorage: ${userId}`);
        connectWebSocket(); // Połącz z WebSocket, jeśli użytkownik jest zalogowany
    } else {
        // Jeśli brak userId, to użytkownik nie jest zalogowany
        // Przekieruj na stronę logowania lub pokaż ekran logowania
        console.warn("[initializeApp] Brak ID użytkownika w localStorage. Należy się zalogować.");
        // Tutaj możesz dodać przekierowanie: window.location.href = '/login.html';
    }

    // Globalne listenery
    if (menuButton) {
        menuButton.addEventListener('click', () => {
            if (dropdownMenu) dropdownMenu.classList.toggle('hidden');
        });
    }

    // Przełączanie motywu
    if (themeToggle) {
        themeToggle.addEventListener('click', () => {
            document.body.classList.toggle('dark-mode');
            const isDarkMode = document.body.classList.contains('dark-mode');
            themeToggle.innerHTML = isDarkMode ? '<i class="fas fa-sun"></i> Tryb jasny' : '<i class="fas fa-moon"></i> Tryb ciemny';
            localStorage.setItem('darkMode', isDarkMode);
        });
        // Ustaw początkowy motyw na podstawie localStorage
        const savedDarkMode = localStorage.getItem('darkMode');
        if (savedDarkMode === 'true') {
            document.body.classList.add('dark-mode');
            themeToggle.innerHTML = '<i class="fas fa-sun"></i> Tryb jasny';
        } else {
            themeToggle.innerHTML = '<i class="fas fa-moon"></i> Tryb ciemny';
        }
    }

    // Wylogowywanie
    if (logoutButton) {
        logoutButton.addEventListener('click', async () => {
            try {
                await supabase.auth.signOut();
                localStorage.removeItem('userId'); // Usuń ID użytkownika z localStorage
                // Zamknij połączenie WebSocket
                if (socket && socket.readyState === WebSocket.OPEN) {
                    socket.close(1000, 'User logged out'); // Kod 1000 to normalne zamknięcie
                }
                window.location.href = '/'; // Przekieruj na stronę główną/logowania
            } catch (error) {
                console.error("Błąd podczas wylogowywania:", error);
            }
        });
    }

    // Obsługa kliknięcia przycisku "Wstecz" (dla mobilnych)
    if (backButton) {
        backButton.addEventListener('click', () => {
            if (window.matchMedia('(max-width: 768px)').matches) {
                if (sidebarWrapper) sidebarWrapper.classList.remove('hidden-on-mobile');
                if (chatAreaWrapper) chatAreaWrapper.classList.remove('active-on-mobile');
                // Ukryj przycisk Wstecz
                if (backButton) backButton.style.display = 'none';
            }
        });
    }

    // Obsługa przycisków nawigacyjnych (Rozmowy, Użytkownicy, Ustawienia)
    if (navIcons && navIcons.length > 0) {
        navIcons.forEach(icon => {
            icon.addEventListener('click', () => {
                navIcons.forEach(i => i.classList.remove('active'));
                icon.classList.add('active');
                const tooltip = icon.dataset.tooltip; // Pobierz tooltip, np. "Rozmowy", "Użytkownicy"

                if (tooltip === 'Rozmowy') {
                    if (sidebarEl) sidebarEl.style.display = 'block';
                    if (onlineUsersMobile) onlineUsersMobile.style.display = 'none';
                    if (rightSidebarWrapper) rightSidebarWrapper.style.display = 'flex'; // Z powrotem na desktopie
                    // Ukryj obszar czatu na mobile, jeśli nie ma rozmowy
                } else if (tooltip === 'Użytkownicy') {
                    if (sidebarEl) sidebarEl.style.display = 'none';
                    if (onlineUsersMobile) {
                        onlineUsersMobile.style.display = 'block';
                        updateActiveUsersListUI(Array.from(activeUsers)); // Zapewnij aktualną listę aktywnych
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

    // Obsługa media query (dostosowanie UI do rozmiaru ekranu)
    function handleMediaQueryChange(mq) {
        if (mq.matches) { // Tryb mobilny (ekran < 768px)
            console.log("Media Query: Tryb mobilny aktywowany. Ukrywanie zbędnych elementów.");
            if (sidebarWrapper) {
                sidebarWrapper.classList.add('hidden-on-mobile'); // Domyślnie ukryj lewy sidebar
            }
            if (chatAreaWrapper) {
                chatAreaWrapper.classList.remove('active-on-mobile'); // Domyślnie nieaktywny
                chatAreaWrapper.style.display = 'none'; // Ukryj, dopóki nie zostanie wybrana rozmowa
            }
            if (logoScreen) {
                logoScreen.classList.remove('hidden'); // Pokaż logo screen
            }
            if (chatArea) {
                chatArea.classList.remove('active'); // Ukryj czat
            }
            if (rightSidebarWrapper) {
                rightSidebarWrapper.style.display = 'none'; // Ukryj prawy sidebar na mobile
            }
            if (backButton) {
                backButton.style.display = 'none'; // Domyślnie ukryj przycisk Wstecz
            }

            // Domyślnie pokaż listę rozmów, a nie aktywnych użytkowników na mobile
            if (sidebarEl) sidebarEl.style.display = 'block';
            if (onlineUsersMobile) onlineUsersMobile.style.display = 'none';
        } else { // Tryb desktopowy (ekran >= 768px)
            console.log("Media Query: Tryb desktopowy aktywowany. Dostosowywanie początkowej widoczności dla desktopu.");
            // Na desktopie, pokaż sidebar, logo screen początkowo, obszar czatu ukryty.
            if (sidebarWrapper) {
                sidebarWrapper.classList.remove('hidden-on-mobile'); // Upewnij się, że jest widoczny
            }
            if (chatAreaWrapper) {
                chatAreaWrapper.classList.remove('active-on-mobile'); // Usuń klasę mobilną
                chatAreaWrapper.style.display = 'flex'; // Upewnij się, że jest widoczny, aby zawierał logo screen
            }
            if (logoScreen) {
                logoScreen.classList.remove('hidden'); // Pokaż logo screen
            }
            if (chatArea) {
                chatArea.classList.remove('active'); // Obszar czatu ukryty
            }
            if (rightSidebarWrapper) {
                rightSidebarWrapper.style.display = 'flex'; // Upewnij się, że prawy sidebar jest widoczny
            }
            if (backButton) {
                backButton.style.display = 'none'; // Przycisk Wstecz niepotrzebny na desktopie
            }
        }
    }

    // Dołącz nasłuchiwanie zapytania mediów i wywołaj obsługę początkowo
    const mq = window.matchMedia('(max-width: 768px)');
    mq.addListener(handleMediaQueryChange);
    handleMediaQueryChange(mq); // Początkowe wywołanie w celu ustawienia poprawnego układu

    // Obsługa wysyłania wiadomości
    if (sendButton) {
        sendButton.addEventListener('click', () => {
            const messageContent = messageInput.value.trim();
            if (messageContent && socket && socket.readyState === WebSocket.OPEN && activeChatRecipientId) {
                const chatMessage = {
                    type: 'chat_message',
                    senderId: userId,
                    receiverId: activeChatRecipientId,
                    content: messageContent,
                    timestamp: new Date().toISOString()
                };
                socket.send(JSON.stringify(chatMessage));
                messageInput.value = ''; // Wyczyść pole wprowadzania
                displayMessage(chatMessage); // Wyświetl własną wiadomość od razu
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

    console.log("[initializeApp] Aplikator Komunikator zainicjalizowany pomyślnie.");
}

// Uruchomienie aplikacji po załadowaniu DOM
document.addEventListener('DOMContentLoaded', initializeApp);