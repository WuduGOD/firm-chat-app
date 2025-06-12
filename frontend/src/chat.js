// Importy z Twojego oryginalnego chat.js
// WAŻNE: Upewnij się, że te pliki są dostępne w Twoim projekcie w odpowiednich ścieżkach
import { loadAllProfiles, getUserLabelById } from './profiles.js';
import { supabase } from './supabaseClient.js';

// Globalne zmienne UI i czatu - zadeklarowane na początku, aby były dostępne wszędzie
// Zaktualizowane selektory zgodnie z nowym HTML
let mainHeader;
let menuButton;
let dropdownMenu;
let themeToggle;
let logoutButton;

let container; // Główny kontener
let sidebarWrapper; // Nowy element dla sidebara
let mainNavIcons; // Kontener na ikony nawigacyjne
let navIcons; // Wszystkie przyciski ikon nawigacyjnych

let sidebarEl; // Zmieniona nazwa, aby uniknąć kolizji z lokalną zmienną `conversationList` w `initChatApp`
let searchInput; // Nowa klasa search-bar input
let contactsListEl; // Element <ul> dla listy kontaktów

let logoScreen; // Ekran powitalny
let chatArea; // Główna sekcja czatu

let chatHeader;
let backButton;
let chatUserName;
let userStatusSpan;
let chatHeaderActions; // Nowy element dla przycisków w nagłówku czatu
let chatSettingsButton;
let chatSettingsDropdown;
let typingStatusDiv; // Zmieniona nazwa zmiennej, aby była bardziej opisowa

let messageContainer; // Kontener wiadomości
let typingIndicatorDiv; // Wskaźnik pisania

let chatFooter;
let attachButton;
let messageInput;
let emojiButton;
let sendButton;

// Zmienne czatu
let allConversations = [];
let currentUser = null;
let currentChatUser = null;
let currentRoom = null;
let socket = null;
let reconnectAttempts = 0;
let typingTimeout; // Dla wskaźnika pisania
let currentActiveConvoItem = null; // Aby śledzić aktywny element listy konwersacji do usuwania klasy 'active'

// UWAGA: Następujące zmienne były obecne w Twoim JS, ale nie mają odpowiedników w nowym HTML.
// Zostaną one usunięte z inicjalizacji, a kod je wykorzystujący zostanie pominięty lub usunięty.
// let appContainer; // Zastąpione przez logiczne pokazywanie/ukrywanie chatArea/logoScreen
// let accountIcon; // Brak w HTML
// let accountPanel; // Brak w HTML
// let closeAccountBtn; // Brak w HTML
// let flowBar; // Brak w HTML
// let contextCapsule; // Brak w HTML
// let closeCapsuleBtn; // Brak w HTML
// let whisperModeBtn; // Brak w HTML
// let chatContentView; // Zastąpione przez messageContainer
// let chatInputArea; // Zastąpione przez chatFooter
// let filterBtn; // Brak w HTML

// Funkcja resetująca widok czatu
function resetChatView() {
    console.log("Resetting chat view...");
    if (messageContainer) {
        messageContainer.innerHTML = ""; // Clear chat content
        messageContainer.classList.remove('blue-theme', 'green-theme', 'red-theme', 'dark-bg', 'pattern-bg'); // Usuń klasy motywu
    }
    if (messageInput) {
        messageInput.disabled = true;
        messageInput.value = "";
    }
    if (sendButton) { // Zmieniona nazwa zmiennej
        sendButton.disabled = true;
    }
    if (chatUserName) { // Zmieniona nazwa zmiennej
        chatUserName.textContent = "";
    }
    // W nowym HTML nie ma chatHeaderAvatar, używamy domyślnego avatara konwersacji
    // if (chatHeaderAvatar) {
    //     chatHeaderAvatar.src = "";
    // }
    if (userStatusSpan) { // Zmieniona nazwa zmiennej
        userStatusSpan.textContent = "";
        userStatusSpan.classList.remove('online', 'offline');
    }
    if (typingIndicatorDiv) {
        typingIndicatorDiv.classList.add('hidden'); // Ukryj wskaźnik pisania
    }

    currentChatUser = null;
    currentRoom = null;

    // Pokaż logoScreen i ukryj chatArea
    if (logoScreen) {
        logoScreen.classList.remove('hidden');
    }
    if (chatArea) {
        chatArea.classList.remove('active');
    }

    if (currentActiveConvoItem) {
        currentActiveConvoItem.classList.remove('active');
        currentActiveConvoItem = null;
    }

    // Usunięcie logiki związanej z trybem szeptu (bo nie ma go już w HTML)
    // if (whisperModeActive && chatContentView && chatInputArea && whisperModeBtn) {
    //     chatContentView.classList.remove('blurred-focus');
    //     chatInputArea.classList.remove('blurred-focus-input');
    //     whisperModeBtn.classList.remove('active');
    //     whisperModeActive = false;
    // }

    // Ukryj dropdown ustawień czatu
    if (chatSettingsDropdown) {
        chatSettingsDropdown.classList.add('hidden');
    }
}


// --- Funkcje z chat.js zaadaptowane do nowej struktury ---

/**
 * Generuje unikalną nazwę pokoju czatu na podstawie dwóch ID użytkowników, posortowanych alfabetycznie.
 * @param {string} user1Id - ID pierwszego użytkownika.
 * @param {string} user2Id - ID drugiego użytkownika.
 * @returns {string} Nazwa pokoju czatu.
 */
function getRoomName(user1Id, user2Id) {
    return [String(user1Id), String(user2Id)].sort().join('_'); // Upewnij się, że są stringami przed sortowaniem
}

/**
 * Asynchronicznie pobiera ostatnią wiadomość dla danego pokoju czatu z Supabase.
 * @param {string} roomId - ID pokoju czatu.
 * @returns {Promise<Object|null>} Obiekt ostatniej wiadomości lub null, jeśli brak wiadomości.
 */
async function getLastMessageForRoom(roomId) {
    const { data, error } = await supabase
        .from('messages')
        .select('text, username, inserted_at')
        .eq('room', roomId)
        .order('inserted_at', { ascending: false })
        .limit(1);

    if (error) {
        console.error('Błąd podczas pobierania ostatniej wiadomości:', error);
        return null;
    }
    return data && data.length > 0 ? data[0] : null;
}

// *** NOWA FUNKCJA: Sortowanie konwersacji ***
function sortConversations(conversations) {
    return [...conversations].sort((a, b) => {
        const timeA = a.lastMessage ? new Date(a.lastMessage.inserted_at) : new Date(0);
        const timeB = b.lastMessage ? new Date(b.lastMessage.inserted_at) : new Date(0);
        return timeB.getTime() - timeA.getTime();
    });
}


async function loadContacts() {
    console.log("Loading contacts...");
    const { data: users, error } = await supabase.rpc('get_other_users', { current_email: currentUser.email });
    if (error) {
        console.error('Błąd ładowania kontaktów:', error);
        return;
    }

    if (contactsListEl) { // Zmieniona nazwa zmiennej na contactsListEl
        contactsListEl.innerHTML = ''; // Wyczyść listę konwersacji
    } else {
        console.error("contactsListEl element not found!");
        return;
    }

    const contactsWithLastMessage = await Promise.all(users.map(async user => {
        const roomId = getRoomName(String(currentUser.id), String(user.id));
        const lastMessage = await getLastMessageForRoom(roomId);
        return { user, lastMessage, roomId };
    }));

    const sortedContacts = sortConversations(contactsWithLastMessage);

    sortedContacts.forEach(({ user, lastMessage, roomId }) => {
        const convoItem = document.createElement('li'); // Zmieniono na <li>
        convoItem.classList.add('contact'); // Zaktualizowano klasę na 'contact'
        convoItem.dataset.convoId = user.id;
        convoItem.dataset.email = user.email;
        convoItem.dataset.roomId = roomId;

        const avatarSrc = `https://i.pravatar.cc/150?img=${user.id % 70 + 1}`; // Tymczasowy losowy avatar

        let previewText = "Brak wiadomości";
        let timeText = "";

        if (lastMessage) {
            const senderName = String(lastMessage.username) === String(currentUser.id) ? "Ja" : (getUserLabelById(lastMessage.username) || lastMessage.username);
            previewText = `${senderName}: ${lastMessage.text}`;

            const lastMessageTime = new Date(lastMessage.inserted_at);
            timeText = lastMessageTime.toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" });
        }

        convoItem.innerHTML = `
            <img src="${avatarSrc}" alt="Avatar" class="avatar">
            <div class="contact-info">
                <span class="contact-name">${getUserLabelById(user.id) || user.email}</span>
                <span class="last-message">${previewText}</span>
            </div>
            <div class="contact-meta">
                <span class="message-time">${timeText}</span>
                <span class="unread-count hidden">0</span>
            </div>
        `;

        convoItem.addEventListener('click', () => {
            handleConversationClick(user, convoItem);
        });

        contactsListEl.appendChild(convoItem); // Zmieniona zmienna
    });
    console.log("Contacts loaded and rendered with last messages (and sorted).");
}


async function handleConversationClick(user, clickedConvoItemElement) {
    console.log('Conversation item clicked, user:', user);

    if (currentActiveConvoItem) {
        currentActiveConvoItem.classList.remove('active');
    }
    clickedConvoItemElement.classList.add('active');
    currentActiveConvoItem = clickedConvoItemElement;

    resetChatView(); // Resetuje widok przed załadowaniem nowej rozmowy

    currentChatUser = {
        id: user.id,
        username: getUserLabelById(user.id) || user.email,
        email: user.email,
    };
    currentRoom = getRoomName(String(currentUser.id), String(currentChatUser.id));
    console.log(`Starting chat with ${currentChatUser.username}, room ID: ${currentRoom}`);

    if (chatUserName && messageInput && sendButton) { // Zaktualizowane zmienne
        chatUserName.textContent = currentChatUser.username;
        // Ustaw avatar w nagłówku czatu, jeśli masz takie miejsce w HTML
        // Jeśli nie, możesz np. zaktualizować avatar w elemencie 'contact' w contactsListEl
        // (chociaż w nowym HTML nie ma osobnego avatara w nagłówku czatu)
        // chatHeaderAvatar.src = `https://i.pravatar.cc/150?img=${user.id % 70 + 1}`;
        messageInput.disabled = false;
        sendButton.disabled = false;
        messageInput.focus();
    }

    // Pokaż chatArea i ukryj logoScreen
    if (logoScreen) {
        logoScreen.classList.add('hidden');
    }
    if (chatArea) {
        chatArea.classList.add('active');
    }

    // Obsługa responsywnego przycisku "Wróć"
    if (backButton) { // Sprawdzanie czy backButton istnieje
        const mq = window.matchMedia('(max-width: 768px)');
        if (mq.matches) {
            backButton.classList.add('show-on-mobile');
        } else {
            backButton.classList.remove('show-on-mobile');
        }
    }


    const unreadCount = clickedConvoItemElement.querySelector('.unread-count');
    if (unreadCount) {
        // Usunięto animate-activity z CSS, więc można po prostu zresetować licznik
        unreadCount.textContent = '0';
        unreadCount.classList.add('hidden');
    }

    if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({
            type: 'join',
            name: currentUser.id,
            room: currentRoom,
        }));
        console.log(`Sent join message to WebSocket for room: ${currentRoom}`);
    } else {
        console.warn("WebSocket not open, attempting to re-initialize and join on open.");
        initWebSocket();
    }
}

function setupSendMessage() {
    if (!messageInput || !sendButton || !messageContainer) { // Zaktualizowane zmienne
        console.error("Message input or send button or messageContainer not found for setup.");
        return;
    }

    messageInput.addEventListener('input', () => {
        if (currentRoom && socket && socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({
                type: 'typing',
                username: currentUser.id,
                room: currentRoom,
            }));
        }
    });

    sendButton.onclick = () => { // Zaktualizowana zmienna
        const text = messageInput.value.trim();
        if (!text || !currentChatUser || !socket || socket.readyState !== WebSocket.OPEN) {
            console.warn("Cannot send message: empty, no recipient, or WebSocket not open.");
            return;
        }

        const msgData = {
            type: 'message',
            username: currentUser.id,
            text,
            room: currentRoom,
            inserted_at: new Date().toISOString()
        };

        console.log("Sending message via WS:", msgData);
        socket.send(JSON.stringify(msgData));
        messageInput.value = '';
        messageInput.focus();
    };

    messageInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            sendButton.click(); // Zaktualizowana zmienna
        }
    });
}

/**
 * Dodaje wiadomość do widoku czatu i aktualizuje podgląd konwersacji na liście.
 * @param {Object} msg - Obiekt wiadomości.
 */
function addMessageToChat(msg) {
    console.log("Adding message to UI:", msg);
    console.log("Porównanie pokoi: msg.room =", msg.room, ", currentRoom =", currentRoom);

    const convoItemToUpdate = contactsListEl.querySelector(`.contact[data-room-id="${msg.room}"]`); // Zmieniona klasa
    if (convoItemToUpdate) {
        const previewEl = convoItemToUpdate.querySelector('.last-message'); // Zmieniona klasa
        const timeEl = convoItemToUpdate.querySelector('.message-time'); // Zmieniona klasa

        if (previewEl && timeEl) {
            const senderName = String(msg.username) === String(currentUser.id) ? "Ja" : (getUserLabelById(msg.username) || msg.username);
            previewEl.textContent = `${senderName}: ${msg.text}`;

            const timestamp = new Date(msg.inserted_at || Date.now());
            timeEl.textContent = timestamp.toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" });
        }

        if (msg.room !== currentRoom) {
            contactsListEl.prepend(convoItemToUpdate);

            const unreadCountEl = convoItemToUpdate.querySelector('.unread-count');
            if (unreadCountEl) {
                let currentUnread = parseInt(unreadCountEl.textContent, 10);
                if (isNaN(currentUnread)) currentUnread = 0;
                unreadCountEl.textContent = currentUnread + 1;
                unreadCountEl.classList.remove('hidden');
                // Usunięto klasę 'animate-activity' z CSS
            }
        }
    }

    if (msg.room !== currentRoom) {
        console.log("Wiadomość nie jest dla aktywnego pokoju, nie dodaję do widoku czatu.");
        return;
    }

    const div = document.createElement('div');
    div.classList.add('message', String(msg.username) === String(currentUser.id) ? 'sent' : 'received'); // Zmieniona klasa na 'message'

    const timestamp = new Date(msg.inserted_at || Date.now());
    const timeString = timestamp.toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" });

    div.innerHTML = `
        <p>${msg.text}</p>
        <span class="timestamp">${timeString}</span>
    `;
    if (messageContainer) { // Zmieniona zmienna
        messageContainer.appendChild(div);
        messageContainer.scrollTop = messageContainer.scrollHeight;
    } else {
        console.error("messageContainer is null when trying to add message.");
    }
}

function updateUserStatusIndicator(userId, isOnline) {
    if (currentChatUser && String(currentChatUser.id) === String(userId) && userStatusSpan) { // Zaktualizowana zmienna
        userStatusSpan.textContent = isOnline ? 'Online' : 'Offline';
        userStatusSpan.classList.toggle('online', isOnline);
        userStatusSpan.classList.toggle('offline', !isOnline);
        console.log(`Status for ${getUserLabelById(userId)} changed to: ${isOnline ? 'Online' : 'Offline'}`);
    }
}

function showTypingIndicator(usernameId) {
    // Sprawdź, czy wskaźnik pisania jest dla aktualnie aktywnego czatu
    if (currentChatUser && String(usernameId) === String(currentChatUser.id) && typingIndicatorDiv) {
        typingIndicatorDiv.classList.remove('hidden');
        clearTimeout(typingTimeout);
        typingTimeout = setTimeout(() => {
            typingIndicatorDiv.classList.add('hidden');
        }, 3000);
        console.log(`${getUserLabelById(usernameId)} is typing...`);
    }
}

function initWebSocket() {
    const wsUrl = import.meta.env.VITE_CHAT_WS_URL || "wss://firm-chat-app-backend.onrender.com";

    if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
        console.log("WebSocket connection already open or connecting.");
        return;
    }

    socket = new WebSocket(wsUrl);

    socket.onopen = () => {
        console.log('WebSocket połączony');
        reconnectAttempts = 0;
        if (currentRoom && currentUser) {
            socket.send(JSON.stringify({
                type: 'join',
                name: currentUser.id,
                room: currentRoom,
            }));
            console.log(`Joined room ${currentRoom} on WebSocket open.`);
        } else {
            console.warn("WebSocket opened but currentRoom or currentUser is not set. Cannot join room yet.");
        }
    };

    socket.onmessage = (event) => {
        const data = JSON.parse(event.data);
        console.log('Received via WS (full data object):', data);

        switch (data.type) {
            case 'message':
                addMessageToChat({
                    username: data.username,
                    text: data.text,
                    inserted_at: data.inserted_at,
                    room: data.room,
                });
                break;
            case 'typing':
                showTypingIndicator(data.username);
                break;
            case 'history':
                console.log("Loading message history. History room:", data.room, "Current room:", currentRoom);
                if (messageContainer) { // Zmieniona zmienna
                    messageContainer.innerHTML = '';
                    data.messages.forEach((msg) => addMessageToChat(msg));
                }
                break;
            case 'status':
                updateUserStatusIndicator(data.user, data.online);
                break;
            default:
                console.warn("Unknown WS message type:", data.type, data);
        }
    };

    socket.onclose = (event) => {
        console.log('WebSocket disconnected. Code:', event.code, 'Reason:', event.reason);
        if (event.code !== 1000) {
            console.log('Attempting to reconnect...');
            setTimeout(initWebSocket, Math.min(1000 * ++reconnectAttempts, 10000));
        }
    };

    socket.onerror = (error) => {
        console.error('Błąd WebSocket:', error);
        if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
            socket.close();
        }
    };
}


// Obsługa dropdownu ustawień czatu (nowa funkcjonalność)
function setupChatSettingsDropdown() {
    if (!chatSettingsButton || !chatSettingsDropdown) return;

    chatSettingsButton.addEventListener('click', (event) => {
        event.stopPropagation(); // Zapobiegaj zamykaniu po kliknięciu na przycisk
        chatSettingsDropdown.classList.toggle('hidden');
    });

    // Zamykanie dropdownu po kliknięciu poza nim
    document.addEventListener('click', (event) => {
        if (!chatSettingsDropdown.classList.contains('hidden') && !chatSettingsButton.contains(event.target)) {
            chatSettingsDropdown.classList.add('hidden');
        }
    });

    // Obsługa wyboru motywu wiadomości
    const colorOptions = chatSettingsDropdown.querySelectorAll('.color-box');
    colorOptions.forEach(option => {
        option.addEventListener('click', () => {
            colorOptions.forEach(box => box.classList.remove('active'));
            option.classList.add('active');
            const colorTheme = option.dataset.color;
            if (messageContainer) {
                messageContainer.classList.remove('default-theme', 'blue-theme', 'green-theme', 'red-theme');
                if (colorTheme !== 'default') {
                    messageContainer.classList.add(`${colorTheme}-theme`);
                }
            }
            console.log('Motyw wiadomości zmieniony na:', colorTheme);
        });
    });

    // Obsługa wyboru tła czatu
    const backgroundOptions = chatSettingsDropdown.querySelectorAll('.bg-box');
    backgroundOptions.forEach(option => {
        option.addEventListener('click', () => {
            backgroundOptions.forEach(box => box.classList.remove('active'));
            option.classList.add('active');
            const bgTheme = option.dataset.bg;
            if (messageContainer) {
                messageContainer.classList.remove('default-bg', 'dark-bg', 'pattern-bg');
                if (bgTheme !== 'default') {
                    messageContainer.classList.add(`${bgTheme}-bg`);
                }
            }
            console.log('Tło czatu zmienione na:', bgTheme);
        });
    });

    // Obsługa ustawiania nicku
    const nicknameInput = document.getElementById('nicknameInput');
    const setNicknameButton = document.getElementById('setNicknameButton');
    if (nicknameInput && setNicknameButton) {
        setNicknameButton.addEventListener('click', () => {
            const newNickname = nicknameInput.value.trim();
            if (newNickname) {
                // Tutaj powinieneś dodać logikę do aktualizacji nicku w Twojej bazie danych (np. w tabeli profiles)
                // i ewentualnie zaktualizować currentUser oraz odświeżyć UI.
                // Na potrzeby tej aktualizacji, tylko zalogujemy:
                console.log('Ustawiono nowy nick:', newNickname);
                alert(`Nick '${newNickname}' został ustawiony (wymaga implementacji zapisu do DB).`);
            }
        });
    }

    // Obsługa wyszukiwania wiadomości (funkcjonalność do zaimplementowania)
    const messageSearchInput = document.getElementById('messageSearchInput');
    const searchMessagesButton = document.getElementById('searchMessagesButton');
    if (messageSearchInput && searchMessagesButton) {
        searchMessagesButton.addEventListener('click', () => {
            const searchTerm = messageSearchInput.value.trim();
            console.log('Wyszukaj wiadomości z frazą:', searchTerm, '(funkcjonalność do zaimplementowania)');
            alert(`Wyszukiwanie wiadomości z frazą '${searchTerm}' (funkcjonalność do zaimplementowania).`);
        });
    }
}


// GŁÓWNA FUNKCJA INICJALIZUJĄCA CAŁĄ APLIKACJĘ
async function initializeApp() {
    console.log("Initializing Komunikator application...");

    // 1. Pobieranie referencji do wszystkich elementów DOM (ZAKTUALIZOWANE SELEKTORY!)
    mainHeader = document.querySelector('.main-header');
    menuButton = document.getElementById('menuButton');
    dropdownMenu = document.getElementById('dropdownMenu');
    themeToggle = document.getElementById('themeToggle');
    logoutButton = document.getElementById('logoutButton');

    container = document.querySelector('.container');
    sidebarWrapper = document.querySelector('.sidebar-wrapper');
    mainNavIcons = document.querySelector('.main-nav-icons');
    navIcons = document.querySelectorAll('.nav-icon'); // Wszystkie przyciski ikon nawigacyjnych

    sidebarEl = document.getElementById('sidebar'); // Było conversationListEl, teraz sidebarEl
    searchInput = sidebarEl.querySelector('.search-bar input'); // selektor dla inputa w search-bar
    contactsListEl = document.getElementById('contactsList'); // Element <ul> dla listy kontaktów

    logoScreen = document.getElementById('logoScreen');
    chatArea = document.getElementById('chatArea');

    chatHeader = chatArea.querySelector('.chat-header');
    backButton = chatHeader.querySelector('#backButton'); // Przycisk wstecz
    chatUserName = chatHeader.querySelector('#chatUserName');
    userStatusSpan = chatHeader.querySelector('#userStatus');
    chatHeaderActions = chatHeader.querySelector('.chat-header-actions');
    chatSettingsButton = chatHeader.querySelector('#chatSettingsButton');
    chatSettingsDropdown = chatHeader.querySelector('#chatSettingsDropdown');
    typingStatusDiv = chatHeader.querySelector('#typingStatus');


    messageContainer = chatArea.querySelector('#messageContainer');
    typingIndicatorDiv = chatArea.querySelector('#typingIndicator');

    chatFooter = chatArea.querySelector('.chat-footer');
    attachButton = chatFooter.querySelector('.attach-button');
    messageInput = chatFooter.querySelector('#messageInput');
    emojiButton = chatFooter.querySelector('.emoji-button');
    sendButton = chatFooter.querySelector('#sendButton');

    // 2. Walidacja, czy kluczowe elementy UI zostały znalezione
    if (!mainHeader || !menuButton || !dropdownMenu || !themeToggle || !logoutButton ||
        !container || !sidebarWrapper || !mainNavIcons || !navIcons.length ||
        !sidebarEl || !searchInput || !contactsListEl ||
        !logoScreen || !chatArea ||
        !chatHeader || !backButton || !chatUserName || !userStatusSpan ||
        !messageContainer || !typingIndicatorDiv ||
        !chatFooter || !messageInput || !sendButton) {
        console.error('Error: One or more critical UI elements not found. Please check your HTML selectors. Missing elements:', {
            mainHeader, menuButton, dropdownMenu, themeToggle, logoutButton,
            container, sidebarWrapper, mainNavIcons, navIcons: navIcons.length > 0,
            sidebarEl, searchInput, contactsListEl,
            logoScreen, chatArea,
            chatHeader, backButton, chatUserName, userStatusSpan,
            messageContainer, typingIndicatorDiv,
            chatFooter, messageInput, sendButton
        });
        return;
    } else {
        console.log('All critical UI elements found.');
    }


    // 3. Sprawdzenie sesji użytkownika Supabase
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
        console.log('No active Supabase session found. Redirecting to login.html');
        window.location.href = 'login.html';
        return;
    }
    currentUser = session.user;
    console.log('Current authenticated user:', currentUser.id);

    // 4. Ładowanie profili i kontaktów
    await loadAllProfiles();
    await loadContacts();

    // 5. Inicjalizacja WebSocket
    initWebSocket();

    // 6. Ustawienie obsługi wysyłania wiadomości
    setupSendMessage();

    // 7. Ustawienie domyślnego stanu UI po załadowaniu
    // Domyślnie pokazujemy logoScreen, ukrywamy chatArea
    logoScreen.classList.remove('hidden');
    chatArea.classList.remove('active');

    messageInput.disabled = true;
    sendButton.disabled = true;

    // 8. Dodatkowe event listenery dla całej aplikacji
    // Obsługa przycisku Wstecz (dla responsywności)
    backButton.addEventListener('click', () => {
        console.log('Back button clicked (UI)');
        resetChatView();
        // Po powrocie do listy, jeśli WebSocket jest otwarty, możesz opuścić pokój
        if (socket && socket.readyState === WebSocket.OPEN && currentRoom) {
            socket.send(JSON.stringify({
                type: 'leave',
                name: currentUser.id,
                room: currentRoom
            }));
            console.log(`Sent leave message for room: ${currentRoom}`);
        }
        // Ukryj sidebar (dla mobilnych) i pokaż listę
        if (sidebarWrapper) { // sidebarWrapper to główny kontener sidebara
            sidebarWrapper.classList.remove('visible'); // Klasa show na .sidebar-wrapper dla responsywności
        }
    });

    // Obsługa głównego menu (themeToggle, logoutButton)
    menuButton.addEventListener('click', (event) => {
        event.stopPropagation(); // Zapobiegaj zamykaniu po kliknięciu na przycisk
        dropdownMenu.classList.toggle('hidden');
    });

    // Zamykanie głównego dropdownu po kliknięciu poza nim
    document.addEventListener('click', (event) => {
        if (!dropdownMenu.classList.contains('hidden') && !menuButton.contains(event.target)) {
            dropdownMenu.classList.add('hidden');
        }
    });

    // Obsługa przełączania trybu ciemnego
    themeToggle.addEventListener('click', () => {
        document.body.classList.toggle('dark-mode');
        // Zapisz preferencje użytkownika w localStorage
        if (document.body.classList.contains('dark-mode')) {
            localStorage.setItem('theme', 'dark');
            themeToggle.innerHTML = '<i class="fas fa-sun"></i> Tryb jasny';
        } else {
            localStorage.setItem('theme', 'light');
            themeToggle.innerHTML = '<i class="fas fa-moon"></i> Tryb ciemny';
        }
    });

    // Wczytaj preferencje motywu przy starcie
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark') {
        document.body.classList.add('dark-mode');
        themeToggle.innerHTML = '<i class="fas fa-sun"></i> Tryb jasny';
    } else {
        document.body.classList.remove('dark-mode');
        themeToggle.innerHTML = '<i class="fas fa-moon"></i> Tryb ciemny';
    }


    // Obsługa wylogowania
    logoutButton.addEventListener('click', async () => {
        const { error } = await supabase.auth.signOut();
        if (error) {
            console.error('Błąd wylogowania:', error.message);
        } else {
            console.log('Wylogowano pomyślnie. Przekierowanie do login.html');
            window.location.href = 'login.html';
        }
    });

    // Obsługa ikon nawigacyjnych (Rozmowy, Grupy, Praca)
    // Zaktualizowano tooltipy na `title` w HTML
    navIcons.forEach(icon => {
        icon.addEventListener('click', () => {
            // Logika do przełączania widoku (jeśli mają się zmieniać panele po prawej)
            // Na razie tylko aktywna klasa
            navIcons.forEach(i => i.classList.remove('active'));
            icon.classList.add('active');
            console.log('Nav icon clicked:', icon.title); // Użyj title zamiast data-tooltip
            // Tutaj możesz dodać logikę do filtrowania listy kontaktów
            // np. contactsListEl.dataset.filter = icon.title;
            // i wywołać funkcję loadContacts() ponownie z filtrem
        });
    });

    // Ustawienie domyślnego aktywnego ikony (jeśli nie jest już ustawiona w HTML)
    // Domyślnie "Rozmowy" powinny być aktywne, ale HTML to już ustawia.
    // const defaultActiveIcon = document.querySelector('.nav-icon[title="Rozmowy"]');
    // if (defaultActiveIcon) {
    //     defaultActiveIcon.classList.add('active');
    // }


    // Obsługa tooltipów - dostosowano do nowego HTML i ogólnych elementów
    const tooltip = document.createElement('div');
    tooltip.classList.add('tooltip');
    document.body.appendChild(tooltip);

    document.querySelectorAll('[title]').forEach(element => { // Używamy atrybutu title
        element.addEventListener('mouseenter', (e) => {
            // Nie pokazujemy tooltipów dla elementów z dropdownMenu, bo tam są buttony z tekstem
            if (e.target.closest('.dropdown') || e.target.closest('.main-header')) {
                return;
            }

            const text = e.target.getAttribute('title'); // Pobieramy tekst z title
            if (text) {
                tooltip.textContent = text;
                tooltip.style.opacity = '1';
                tooltip.style.pointerEvents = 'auto';

                const rect = e.target.getBoundingClientRect();
                const isMainNavIcon = e.target.closest('.main-nav-icons'); // Sprawdzamy, czy to ikona nawigacyjna

                if (isMainNavIcon) {
                    tooltip.style.left = `${rect.right + 10}px`;
                    tooltip.style.top = `${rect.top + rect.height / 2 - tooltip.offsetHeight / 2}px`;
                    tooltip.style.transform = 'none';
                } else {
                    // Domyślne pozycjonowanie dla innych elementów, np. dla inputów
                    tooltip.style.left = `${rect.left + rect.width / 2}px`;
                    tooltip.style.top = `${rect.top - 10}px`;
                    tooltip.style.transform = `translate(-50%, -100%)`;
                }
            }
        });

        element.addEventListener('mouseleave', () => {
            tooltip.style.opacity = '0';
            tooltip.style.pointerEvents = 'none';
        });
    });


    // Obsługa paska wyszukiwania (usunięto logikę z filterBtn, bo nie ma go w HTML)
    if (searchInput) {
        searchInput.addEventListener('focus', () => {
            console.log('Search input focused.');
            // Możesz tutaj dodać jakieś wizualne zmiany, np. zwiększenie szerokości
            // searchInput.style.width = '100%'; // Jeśli chcesz, żeby się rozszerzał
        });

        searchInput.addEventListener('blur', () => {
            if (searchInput.value === '') {
                console.log('Search input blurred and empty.');
                // searchInput.style.width = 'auto'; // Jeśli chcesz, żeby wracał do rozmiaru
            }
        });
    }

    // Nowa funkcja do obsługi dropdownu ustawień czatu
    setupChatSettingsDropdown();


    console.log("Komunikator application initialization complete. Ready!");
}

// WAŻNE: Dodaj tę linię na samym końcu pliku,
// aby initializeApp uruchomiła się automatycznie po załadowaniu DOM.
document.addEventListener("DOMContentLoaded", initializeApp);