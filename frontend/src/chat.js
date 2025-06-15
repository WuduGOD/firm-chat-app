// Importy z Twojego oryginalnego chat.js
import { loadAllProfiles, getUserLabelById } from './profiles.js';
import { supabase } from './supabaseClient.js';

// Globalne zmienne UI i czatu - zadeklarowane na początku, aby były dostępne wszędzie
let mainHeader;
let menuButton;
let dropdownMenu;
let themeToggle;
let logoutButton;

let container;
let sidebarWrapper;
let mainNavIcons;
let navIcons;

let sidebarEl;
let searchInput;
let contactsListEl;

let logoScreen;
let chatArea;

let chatHeader;
let backButton;
let chatUserName;
let userStatusSpan;
let chatHeaderActions;
let chatSettingsButton;
let chatSettingsDropdown;
let typingStatusDiv;

let messageContainer;
let typingIndicatorDiv;

let chatFooter;
let attachButton;
let messageInput;
let emojiButton;
let sendButton;

// Zmienne dla prawego sidebara (Aktywni Użytkownicy)
let rightSidebar;
let activeUsersListEl;
let noActiveUsersText; // NOWA ZMIENNA: do przechowywania referencji do elementu tekstu 'Brak aktywnych użytkowników.'

// Zmienne czatu
let allConversations = [];
let currentUser = null; // Używamy tego obiektu z Supabase
let currentChatUser = null;
let currentRoom = null;
let socket = null;
let reconnectAttempts = 0;
let typingTimeout;
let currentActiveConvoItem = null;

// Funkcja resetująca widok czatu
function resetChatView() {
    console.log("Resetting chat view...");
    if (messageContainer) {
        messageContainer.innerHTML = "";
        messageContainer.classList.remove('blue-theme', 'green-theme', 'red-theme', 'dark-bg', 'pattern-bg');
    }
    if (messageInput) {
        messageInput.disabled = true;
        messageInput.value = "";
    }
    if (sendButton) {
        sendButton.disabled = true;
    }
    if (chatUserName) {
        chatUserName.textContent = "";
    }
    if (userStatusSpan) {
        userStatusSpan.textContent = "";
        userStatusSpan.classList.remove('online', 'offline');
    }
    if (typingIndicatorDiv) {
        typingIndicatorDiv.classList.add('hidden');
    }

    currentChatUser = null;
    currentRoom = null;

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

    if (chatSettingsDropdown) {
        chatSettingsDropdown.classList.add('hidden');
    }
}


/**
 * Generuje unikalną nazwę pokoju czatu na podstawie dwóch ID użytkowników, posortowanych alfabetycznie.
 * @param {string} user1Id - ID pierwszego użytkownika.
 * @param {string} user2Id - ID drugiego użytkownika.
 * @returns {string} Nazwa pokoju czatu.
 */
function getRoomName(user1Id, user2Id) {
    return [String(user1Id), String(user2Id)].sort().join('_');
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

// NOWA FUNKCJA: Sortowanie konwersacji
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

    if (contactsListEl) {
        contactsListEl.innerHTML = '';
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
        const convoItem = document.createElement('li');
        convoItem.classList.add('contact');
        convoItem.dataset.convoId = user.id;
        convoItem.dataset.email = user.email;
        convoItem.dataset.roomId = roomId;

        const avatarSrc = `https://i.pravatar.cc/150?img=${user.id.charCodeAt(0) % 70 + 1}`; // Tymczasowy losowy avatar z user.id

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

        contactsListEl.appendChild(convoItem);
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

    resetChatView();

    currentChatUser = {
        id: user.id,
        username: getUserLabelById(user.id) || user.email,
        email: user.email,
    };
    currentRoom = getRoomName(String(currentUser.id), String(currentChatUser.id));
    console.log(`Starting chat with ${currentChatUser.username}, room ID: ${currentRoom}`);

    if (chatUserName && messageInput && sendButton && userStatusSpan) {
        chatUserName.textContent = currentChatUser.username;
        // Tutaj ustawiamy początkowy status dla nowo otwartego czatu
        // Status zależy od tego, czy użytkownik jest aktywny na serwerze WebSocket
        // Backend powinien wysłać aktualne statusy aktywnych użytkowników
        userStatusSpan.textContent = user.is_online ? 'Online' : 'Offline'; // Użyj statusu z obiektu 'user'
        userStatusSpan.classList.toggle('online', user.is_online);
        userStatusSpan.classList.toggle('offline', !user.is_online);
        console.log(`Initial status for active chat user ${currentChatUser.username}: ${user.is_online ? 'Online' : 'Offline'}`);

        messageInput.disabled = false;
        sendButton.disabled = false;
        messageInput.focus();
    }

    if (logoScreen) {
        logoScreen.classList.add('hidden');
    }
    if (chatArea) {
        chatArea.classList.add('active');
    }

    // Obsługa responsywnego przycisku "Wróć"
    if (backButton) {
        const mq = window.matchMedia('(max-width: 768px)');
        if (mq.matches) {
            backButton.classList.add('show-on-mobile');
            if (sidebarWrapper) {
                sidebarWrapper.classList.remove('visible');
            }
        } else {
            backButton.classList.remove('show-on-mobile');
        }
    }


    const unreadCount = clickedConvoItemElement.querySelector('.unread-count');
    if (unreadCount) {
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
    if (!messageInput || !sendButton || !messageContainer) {
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

    sendButton.onclick = () => {
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
            sendButton.click();
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

    // Znajdź element konwersacji po room ID, aby zaktualizować last-message i timestamp
    const convoItemToUpdate = contactsListEl.querySelector(`.contact[data-room-id="${msg.room}"]`);
    if (convoItemToUpdate) {
        const previewEl = convoItemToUpdate.querySelector('.last-message');
        const timeEl = convoItemToUpdate.querySelector('.message-time');

        if (previewEl && timeEl) {
            const senderName = String(msg.username) === String(currentUser.id) ? "Ja" : (getUserLabelById(msg.username) || msg.username);
            previewEl.textContent = `${senderName}: ${msg.text}`;

            const lastMessageTime = new Date(msg.inserted_at || Date.now());
            timeEl.textContent = lastMessageTime.toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" });
        }

        // Przenieś element na początek listy, jeśli to nowa wiadomość lub z innego pokoju
        if (msg.room !== currentRoom) {
            contactsListEl.prepend(convoItemToUpdate);

            const unreadCountEl = convoItemToUpdate.querySelector('.unread-count');
            if (unreadCountEl) {
                let currentUnread = parseInt(unreadCountEl.textContent, 10);
                if (isNaN(currentUnread)) currentUnread = 0;
                unreadCountEl.textContent = currentUnread + 1;
                unreadCountEl.classList.remove('hidden');
            }
        }
    }

    // Wyświetl wiadomość w aktywnym czacie
    if (msg.room !== currentRoom) {
        console.log("Wiadomość nie jest dla aktywnego pokoju, nie dodaję do widoku czatu.");
        return;
    }

    const div = document.createElement('div');
    div.classList.add('message', String(msg.username) === String(currentUser.id) ? 'sent' : 'received');

    const timestamp = new Date(msg.inserted_at || Date.now());
    const timeString = timestamp.toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" });

    div.innerHTML = `
        <p>${msg.text}</p>
        <span class="timestamp">${timeString}</span>
    `;
    if (messageContainer) {
        messageContainer.appendChild(div);
        messageContainer.scrollTop = messageContainer.scrollHeight;
    } else {
        console.error("messageContainer is null when trying to add message.");
    }
}

function updateUserStatusIndicator(userId, isOnline) {
    // Aktualizacja statusu w nagłówku aktywnego czatu
    if (currentChatUser && String(currentChatUser.id) === String(userId) && userStatusSpan) {
        userStatusSpan.textContent = isOnline ? 'Online' : 'Offline';
        userStatusSpan.classList.toggle('online', isOnline);
        userStatusSpan.classList.toggle('offline', !isOnline);
        console.log(`Status for ${getUserLabelById(userId)} changed to: ${isOnline ? 'Online' : 'Offline'}`);
    }

    // Aktualizacja statusu w liście aktywnych użytkowników (prawy sidebar)
    if (activeUsersListEl) {
        // Usuń użytkownika z listy, jeśli jest już offline i ma element
        if (!isOnline && String(userId) !== String(currentUser.id)) { // Upewnij się, że nie usuwasz siebie
            const userListItem = activeUsersListEl.querySelector(`li[data-user-id="${userId}"]`);
            if (userListItem) {
                userListItem.remove();
                console.log(`Removed offline user ${getUserLabelById(userId)} from active list.`);
            }
            return; // Zakończ, jeśli użytkownik jest offline
        }

        const userListItem = activeUsersListEl.querySelector(`li[data-user-id="${userId}"]`);
        if (userListItem) {
            const statusIndicator = userListItem.querySelector('.status-indicator');
            if (statusIndicator) {
                statusIndicator.classList.toggle('online', isOnline);
                statusIndicator.classList.toggle('offline', !isOnline);
            }
        } else {
             // Jeśli użytkownika nie ma jeszcze na liście aktywnych, dodaj go
            if (isOnline) {
                // Dodaj tylko jeśli nie jest to bieżący użytkownik
                if (String(userId) === String(currentUser.id)) {
                    console.log(`Filtering out current user ${getUserLabelById(userId)} from active users list.`);
                    return;
                }
                const li = document.createElement('li');
                li.classList.add('active-user-item');
                li.dataset.userId = userId;

                const avatarSrc = `https://i.pravatar.cc/150?img=${userId.charCodeAt(0) % 70 + 1}`; // Tymczasowy losowy avatar

                li.innerHTML = `
                    <img src="${avatarSrc}" alt="Avatar" class="avatar-small">
                    <span class="user-name">${getUserLabelById(userId)}</span>
                    <span class="status-indicator online"></span>
                `;
                activeUsersListEl.appendChild(li);
                console.log(`Added new online user to active list: ${getUserLabelById(userId)}`);
            }
        }
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
    // Upewnij się, że zmienna środowiskowa VITE_CHAT_WS_URL jest dostępna
    // W przeciwnym razie użyj domyślnego URL
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
            console.log(`Sent join message to WebSocket for room: ${currentRoom}`);
        } else {
            console.warn("WebSocket opened but currentRoom or currentUser is not set. Cannot join room yet.");
        }
        // Wysyłamy sygnał "online" po nawiązaniu połączenia
        if (currentUser) {
            socket.send(JSON.stringify({
                type: 'status',
                user: currentUser.id,
                online: true
            }));
            console.log(`Sent 'online' status for user ${currentUser.id}`);
        }
        // WAŻNE: To wywołanie powinno być tylko tutaj w onopen,
        // aby poprawnie zażądać listy od backendu po udanym połączeniu.
        // Dalsze aktualizacje będą pochodzić z wiadomości 'active_users'.
        loadActiveUsers(); 
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
                if (messageContainer) {
                    messageContainer.innerHTML = '';
                    data.messages.forEach((msg) => addMessageToChat(msg));
                }
                break;
            case 'status':
                console.log(`Received status update for user ${data.user}: ${data.online ? 'online' : 'offline'}`);
                updateUserStatusIndicator(data.user, data.online);
                break;
            case 'active_users':
                console.log('Received initial active users list:', data.users);
                displayActiveUsers(data.users);
                break;
            default:
                console.warn("Unknown WS message type:", data.type, data);
        }
    };

    socket.onclose = (event) => {
        console.log('WebSocket disconnected. Code:', event.code, 'Reason:', event.reason);
        // Wysyłamy sygnał "offline" przy rozłączeniu
        if (currentUser) {
            updateUserStatusIndicator(currentUser.id, false);
        }
        if (event.code !== 1000) { // 1000 to normalne zamknięcie
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

// NOWA FUNKCJA: Ładowanie aktywnych użytkowników
async function loadActiveUsers() {
    console.log("Loading active users for right sidebar...");
    if (!activeUsersListEl || !noActiveUsersText) { // Dodaj noActiveUsersText do walidacji
        console.error("activeUsersListEl or noActiveUsersText not found, cannot load active users.");
        return;
    }

    // Wysyłamy zapytanie do serwera WebSocket o listę aktywnych użytkowników
    if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: 'get_active_users' }));
        console.log("Requested active users list from WebSocket server.");
    } else {
        console.warn("WebSocket not open, cannot request active users.");
    }
}

// NOWA FUNKCJA: Wyświetlanie aktywnych użytkowników
function displayActiveUsers(activeUsersData) {
    if (!activeUsersListEl || !noActiveUsersText) return; // Upewnij się, że elementy istnieją

    activeUsersListEl.innerHTML = ''; // Wyczyść poprzednie elementy listy użytkowników

    const filteredUsers = activeUsersData.filter(user => String(user.id) !== String(currentUser.id));

    if (filteredUsers.length === 0) {
        // Brak innych aktywnych użytkowników, pokazujemy komunikat "Brak aktywnych użytkowników"
        noActiveUsersText.classList.remove('hidden-element'); 
    } else {
        // Są inni aktywni użytkownicy, ukrywamy komunikat "Brak aktywnych użytkowników"
        noActiveUsersText.classList.add('hidden-element'); 
        
        filteredUsers.forEach(user => {
            const li = document.createElement('li');
            li.classList.add('active-user-item');
            li.dataset.userId = user.id;

            const avatarSrc = `https://i.pravatar.cc/150?img=${user.id.charCodeAt(0) % 70 + 1}`; // Tymczasowy losowy avatar

            li.innerHTML = `
                <img src="${avatarSrc}" alt="Avatar" class="avatar-small">
                <span class="user-name">${getUserLabelById(user.id) || user.username}</span>
                <span class="status-indicator ${user.online ? 'online' : 'offline'}"></span>
            `;
            activeUsersListEl.appendChild(li);
        });
    }
}


// Obsługa dropdownu ustawień czatu
function setupChatSettingsDropdown() {
    if (!chatSettingsButton || !chatSettingsDropdown) return;

    chatSettingsButton.addEventListener('click', (event) => {
        event.stopPropagation();
        chatSettingsDropdown.classList.toggle('hidden');
    });

    document.addEventListener('click', (event) => {
        if (!chatSettingsDropdown.classList.contains('hidden') && !chatSettingsButton.contains(event.target)) {
            chatSettingsDropdown.classList.add('hidden');
        }
    });

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
        setNicknameButton.addEventListener('click', async () => {
            const newNickname = nicknameInput.value.trim();
            if (newNickname && currentUser) {
                try {
                    const { data, error } = await supabase
                        .from('profiles')
                        .update({ username: newNickname })
                        .eq('id', currentUser.id);

                    if (error) {
                        throw error;
                    }

                    console.log('Ustawiono nowy nick:', newNickname, 'dla użytkownika:', currentUser.id);
                    alert(`Nick '${newNickname}' został ustawiony pomyślnie.`);
                    await loadAllProfiles();
                    if (chatUserName && currentChatUser && String(currentUser.id) === String(currentChatUser.id)) {
                        chatUserName.textContent = newNickname;
                    }
                    await loadContacts();

                } catch (error) {
                    console.error('Błąd podczas aktualizacji nicku:', error.message);
                    alert(`Błąd podczas ustawiania nicku: ${error.message}`);
                }
            } else if (!currentUser) {
                alert("Błąd: Nie jesteś zalogowany, aby ustawić nick.");
            }
        });
    }

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

    // 1. Pobieranie referencji do wszystkich elementów DOM
    mainHeader = document.querySelector('.main-header');
    menuButton = document.getElementById('menuButton');
    dropdownMenu = document.getElementById('dropdownMenu');
    themeToggle = document.getElementById('themeToggle');
    logoutButton = document.getElementById('logoutButton');

    container = document.querySelector('.container');
    sidebarWrapper = document.querySelector('.sidebar-wrapper');
    mainNavIcons = document.querySelector('.main-nav-icons');
    navIcons = document.querySelectorAll('.nav-icon');

    sidebarEl = document.getElementById('sidebar');
    searchInput = sidebarEl.querySelector('.search-bar input');
    contactsListEl = document.getElementById('contactsList');

    logoScreen = document.getElementById('logoScreen');
    chatArea = document.getElementById('chatArea');

    chatHeader = chatArea.querySelector('.chat-header');
    backButton = chatHeader.querySelector('#backButton');
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

    rightSidebar = document.getElementById('rightSidebar');
    activeUsersListEl = document.getElementById('activeUsersList');
    noActiveUsersText = document.getElementById('noActiveUsersText'); // NOWA REFERENCJA

    // 2. Walidacja, czy kluczowe elementy UI zostały znalezione
    if (!mainHeader || !menuButton || !dropdownMenu || !themeToggle || !logoutButton ||
        !container || !sidebarWrapper || !mainNavIcons || !navIcons.length ||
        !sidebarEl || !searchInput || !contactsListEl ||
        !logoScreen || !chatArea ||
        !chatHeader || !backButton || !chatUserName || !userStatusSpan || !chatHeaderActions || !chatSettingsButton || !chatSettingsDropdown || !typingStatusDiv ||
        !messageContainer || !typingIndicatorDiv ||
        !chatFooter || !attachButton || !messageInput || !emojiButton || !sendButton ||
        !rightSidebar || !activeUsersListEl || !noActiveUsersText) { // Dodaj walidację dla nowego elementu
        console.error('Error: One or more critical UI elements not found. Please check your HTML selectors. Missing elements:', {
            mainHeader, menuButton, dropdownMenu, themeToggle, logoutButton,
            container, sidebarWrapper, mainNavIcons, navIcons: navIcons.length > 0,
            sidebarEl, searchInput, contactsListEl,
            logoScreen, chatArea,
            chatHeader, backButton, chatUserName, userStatusSpan, chatHeaderActions, chatSettingsButton, chatSettingsDropdown, typingStatusDiv,
            messageContainer, typingIndicatorDiv,
            chatFooter, attachButton, messageInput, emojiButton, sendButton,
            rightSidebar, activeUsersListEl, noActiveUsersText
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

    // Dodatkowa obsługa statusu offline przy zamykaniu zakładki/przeglądarki
    window.addEventListener('beforeunload', () => {
        if (socket && socket.readyState === WebSocket.OPEN && currentUser) {
            console.log(`Sending 'leave' signal for user ${currentUser.id} before unload.`);
            socket.send(JSON.stringify({
                type: 'leave',
                name: currentUser.id,
                room: currentRoom || 'global'
            }));
        }
    });

    // 4. Ładowanie profili i kontaktów
    await loadAllProfiles();
    await loadContacts();
    
    // 5. Inicjalizacja WebSocket
    initWebSocket();

    // 6. WAŻNE: `loadActiveUsers()` jest już wywoływane w `socket.onopen`,
    // co zapewnia, że lista jest pobierana, gdy połączenie jest gotowe.
    // Ponowne wywołanie tutaj nie jest konieczne i mogłoby być problematyczne,
    // jeśli socket jeszcze się nie otworzył.

    // 7. Ustawienie obsługi wysyłania wiadomości
    setupSendMessage();

    // 8. Ustawienie domyślnego stanu UI po załadowaniu
    logoScreen.classList.remove('hidden');
    chatArea.classList.remove('active');

    messageInput.disabled = true;
    sendButton.disabled = true;

    // 9. Dodatkowe event listenery dla całej aplikacji
    backButton.addEventListener('click', () => {
        console.log('Back button clicked (UI)');
        resetChatView();
        if (socket && socket.readyState === WebSocket.OPEN && currentRoom) {
            socket.send(JSON.stringify({
                type: 'leave',
                name: currentUser.id,
                room: currentRoom
            }));
            console.log(`Sent leave message for room: ${currentRoom}`);
        }

        if (chatArea) {
            chatArea.classList.remove('active');
            logoScreen.classList.remove('hidden');
        }
        if (sidebarWrapper) {
            sidebarWrapper.classList.add('visible');
        }
        backButton.classList.remove('show-on-mobile');
    });

    menuButton.addEventListener('click', (event) => {
        event.stopPropagation();
        dropdownMenu.classList.toggle('hidden');
        const mq = window.matchMedia('(max-width: 768px)');
        if (mq.matches) {
            sidebarWrapper.classList.toggle('visible');
            if (sidebarWrapper.classList.contains('visible')) {
                chatArea.classList.remove('active');
                logoScreen.classList.remove('hidden');
            }
        }
    });

    document.addEventListener('click', (event) => {
        if (!dropdownMenu.classList.contains('hidden') && !menuButton.contains(event.target)) {
            dropdownMenu.classList.add('hidden');
        }
    });

    themeToggle.addEventListener('click', () => {
        document.body.classList.toggle('dark-mode');
        if (document.body.classList.contains('dark-mode')) {
            localStorage.setItem('theme', 'dark');
            themeToggle.innerHTML = '<i class="fas fa-sun"></i> Tryb jasny';
        } else {
            localStorage.setItem('theme', 'light');
            themeToggle.innerHTML = '<i class="fas fa-moon"></i> Tryb ciemny';
        }
    });

    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark') {
        document.body.classList.add('dark-mode');
        themeToggle.innerHTML = '<i class="fas fa-sun"></i> Tryb jasny';
    } else {
        document.body.classList.remove('dark-mode');
        themeToggle.innerHTML = '<i class="fas fa-moon"></i> Tryb ciemny';
    }

    logoutButton.addEventListener('click', async () => {
        const { error } = await supabase.auth.signOut();
        if (error) {
            console.error('Błąd wylogowania:', error.message);
        } else {
            console.log('Wylogowano pomyślnie. Przekierowanie do login.html');
            window.location.href = 'login.html';
        }
    });

    navIcons.forEach(icon => {
        icon.addEventListener('click', () => {
            navIcons.forEach(i => i.classList.remove('active'));
            icon.classList.add('active');
            console.log('Nav icon clicked:', icon.title);
        });
    });

    setupChatSettingsDropdown();

    const tooltip = document.createElement('div');
    tooltip.classList.add('tooltip');
    document.body.appendChild(tooltip);

    document.querySelectorAll('[title]').forEach(element => {
        element.addEventListener('mouseenter', (e) => {
            if (e.target.closest('.dropdown') || e.target.closest('.main-header')) {
                return;
            }

            const text = e.target.getAttribute('title');
            if (text) {
                tooltip.textContent = text;
                tooltip.style.opacity = '1';
                tooltip.style.pointerEvents = 'auto';

                const rect = e.target.getBoundingClientRect();
                tooltip.style.left = `${rect.left + (rect.width / 2)}px`;
                tooltip.style.top = `${rect.top - tooltip.offsetHeight - 5}px`;

                if (rect.left < tooltip.offsetWidth / 2) {
                    tooltip.style.left = `${tooltip.offsetWidth / 2}px`;
                }
                if (rect.right + tooltip.offsetWidth / 2 > window.innerWidth) {
                    tooltip.style.left = `${window.innerWidth - tooltip.offsetWidth / 2}px`;
                }

                const tooltipX = rect.left + (rect.width / 2) - (tooltip.offsetWidth / 2);
                tooltip.style.left = `${Math.max(0, tooltipX)}px`;
            }
        });

        element.addEventListener('mouseleave', () => {
            tooltip.style.opacity = '0';
            tooltip.style.pointerEvents = 'none';
        });
    });

    function handleMediaQueryChange(mq) {
        if (mq.matches) {
            console.log("Mobile view activated. Hiding chat area, showing sidebar wrapper.");
            chatArea.classList.remove('active');
            logoScreen.classList.remove('hidden');
            sidebarWrapper.classList.add('visible');

            if (rightSidebar) {
                rightSidebar.classList.add('hidden');
            }

            backButton.classList.remove('show-on-mobile');
            container.classList.remove('three-column-grid');

        } else {
            console.log("Desktop/Tablet view activated. Adjusting layout.");
            sidebarWrapper.classList.add('visible');
            chatArea.classList.remove('active');
            logoScreen.classList.remove('hidden');

            if (rightSidebar) {
                rightSidebar.classList.remove('hidden');
            }
            backButton.classList.remove('show-on-mobile');
            container.classList.add('three-column-grid');
        }
    }

    const mq = window.matchMedia('(max-width: 768px)');
    mq.addListener(handleMediaQueryChange);
    handleMediaQueryChange(mq);

    console.log("Komunikator application initialized successfully.");
}

// Uruchomienie aplikacji po załadowaniu DOM
document.addEventListener('DOMContentLoaded', initializeApp);
