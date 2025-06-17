// Importy zależności
import { loadAllProfiles, getUserLabelById } from './profiles.js';
import { supabase } from './supabaseClient.js';

// Globalne zmienne UI i czatu
let mainHeader;
let menuButton;
let dropdownMenu;
let themeToggle;
let logoutButton;

let container;
let sidebarWrapper;
let mainNavIcons;
let navIcons;

let onlineUsersMobile;

let sidebarEl;
let searchInput;
let contactsListEl;

let chatAreaWrapper;
let logoScreen;
let chatArea;

let chatHeader;
let backButton;
let chatUserName;
let userStatusSpan;
let chatHeaderActions;
let chatSettingsButton;
let chatSettingsDropdown;
let typingStatusHeader;
let typingIndicatorMessages;

let messageContainer;

let chatFooter;
let attachButton;
let messageInput;
let emojiButton;
let sendButton;

let rightSidebarWrapper;
let rightSidebar;
let activeUsersListEl;
let noActiveUsersText;

// Zmienne stanu czatu
let currentUser = null;
let currentChatUser = null;
let currentRoom = null;
let socket = null;
let reconnectAttempts = 0;
let typingTimeout;
let currentActiveConvoItem = null;
let onlineUsers = new Map(); // userID -> boolean


/**
 * Resets the chat view to its initial state.
 */
function resetChatView() {
    console.log("[resetChatView] Resetowanie widoku czatu...");
    if (messageContainer) {
        messageContainer.innerHTML = ""; // Wyczyść wiadomości
        messageContainer.classList.remove('blue-theme', 'green-theme', 'red-theme', 'dark-bg', 'pattern-bg');
    }
    if (messageInput) {
        messageInput.disabled = true; // Wyłącz pole wpisywania
        messageInput.value = ""; // Wyczyść wartość pola
    }
    if (sendButton) {
        sendButton.disabled = true; // Wyłącz przycisk wysyłania
    }
    if (chatUserName) {
        chatUserName.textContent = ""; // Wyczyść nazwę użytkownika czatu
    }
    if (userStatusSpan) {
        userStatusSpan.textContent = ""; // Wyczyść status użytkownika
        userStatusSpan.classList.remove('online', 'offline');
    }
    if (typingStatusHeader) {
        typingStatusHeader.classList.add('hidden'); // Ukryj wskaźnik pisania w nagłówku
    }
    if (typingIndicatorMessages) {
        typingIndicatorMessages.classList.add('hidden'); // Ukryj animowane kropki
    }

    currentChatUser = null; // Zresetuj aktualnego użytkownika czatu
    currentRoom = null; // Zresetuj aktualny pokój czatu

    // Pokaż ekran powitalny tylko na desktopie
    if (window.matchMedia('(min-width: 769px)').matches) {
        if (logoScreen) {
            logoScreen.classList.remove('hidden'); // Pokaż ekran powitalny
        }
    } else {
        if (logoScreen) {
            logoScreen.classList.add('hidden'); // Na mobile zawsze ukryj
        }
    }

    if (chatArea) {
        chatArea.classList.remove('active'); // Dezaktywuj obszar czatu
    }
    if (chatAreaWrapper) {
        if (window.matchMedia('(max-width: 768px)').matches) {
            chatAreaWrapper.classList.remove('active-on-mobile'); // Ukryj wrapper na mobile
        } else {
            chatAreaWrapper.style.display = 'flex'; // Upewnij się, że jest flex na desktopie
            chatAreaWrapper.classList.remove('active-on-mobile');
        }
    }

    if (currentActiveConvoItem) {
        currentActiveConvoItem.classList.remove('active'); // Dezaktywuj aktywny element konwersacji
        currentActiveConvoItem = null;
    }

    if (chatSettingsDropdown) {
        chatSettingsDropdown.classList.add('hidden'); // Ukryj ustawienia czatu
    }
}

/**
 * Generates a unique chat room name based on two user IDs, sorted alphabetically.
 * @param {string} user1Id - ID of the first user.
 * @param {string} user2Id - ID of the second user.
 * @returns {string} The chat room name.
 */
function getRoomName(user1Id, user2Id) {
    return [String(user1Id), String(user2Id)].sort().join('_');
}

/**
 * Asynchronously fetches the last message for a given chat room from Supabase.
 * @param {string} roomId - ID of the chat room.
 * @returns {Promise<Object|null>} The last message object or null if no messages.
 */
async function getLastMessageForRoom(roomId) {
    const { data, error } = await supabase
        .from('messages')
        .select('text, username, inserted_at')
        .eq('room', roomId)
        .order('inserted_at', { ascending: false })
        .limit(1);

    if (error) {
        console.error('Błąd pobierania ostatniej wiadomości:', error);
        return null;
    }
    return data && data.length > 0 ? data[0] : null;
}

/**
 * Sorts conversations by the timestamp of their last message (most recent first).
 * @param {Array<Object>} conversations - Array of conversation objects.
 * @returns {Array<Object>} Sorted array of conversations.
 */
function sortConversations(conversations) {
    return [...conversations].sort((a, b) => {
        const timeA = a.lastMessage ? new Date(a.lastMessage.inserted_at) : new Date(0);
        const timeB = b.lastMessage ? new Date(b.lastMessage.inserted_at) : new Date(0);
        return timeB.getTime() - timeA.getTime();
    });
}

/**
 * Loads and renders the list of contacts.
 * Fetches other users from Supabase, retrieves their last message, and displays them.
 */
async function loadContacts() {
    console.log("[loadContacts] Ładowanie kontaktów...");
    if (!currentUser || !currentUser.email) {
        console.error("[loadContacts] Bieżący użytkownik nie jest zdefiniowany, nie można załadować kontaktów.");
        return;
    }

    const { data: users, error } = await supabase.rpc('get_other_users', { current_email: currentUser.email });
    if (error) {
        console.error('[loadContacts] Błąd ładowania kontaktów:', error);
        return;
    }

    if (contactsListEl) {
        contactsListEl.innerHTML = ''; // Wyczyść istniejące kontakty
    } else {
        console.error("[loadContacts] Element contactsListEl nie znaleziony!");
        return;
    }

    // Pobierz ostatnią wiadomość dla każdego kontaktu, aby je posortować
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

        const avatarSrc = `https://i.pravatar.cc/150?img=${user.id.charCodeAt(0) % 70 + 1}`;

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
    console.log("[loadContacts] Kontakty załadowane i wyrenderowane z ostatnimi wiadomościami (i posortowane).");
}

/**
 * Handles a click event on a conversation item.
 * Sets up the chat view for the selected user and joins the chat room.
 * @param {Object} user - The user object of the selected contact.
 * @param {HTMLElement} clickedConvoItemElement - The clicked list item element.
 */
async function handleConversationClick(user, clickedConvoItemElement) {
    console.log('[handleConversationClick] Kliknięto element konwersacji, użytkownik:', user);

    // Dezaktywuj poprzednio aktywny element konwersacji
    if (currentActiveConvoItem) {
        currentActiveConvoItem.classList.remove('active');
    }
    clickedConvoItemElement.classList.add('active'); // Aktywuj kliknięty element
    currentActiveConvoItem = clickedConvoItemElement;

    resetChatView(); // Zresetuj widok czatu przed załadowaniem nowej konwersacji

    currentChatUser = {
        id: user.id,
        username: getUserLabelById(user.id) || user.email,
        email: user.email,
    };
    currentRoom = getRoomName(String(currentUser.id), String(currentChatUser.id));
    console.log(`[handleConversationClick] Rozpoczynanie czatu z ${currentChatUser.username}, ID pokoju: ${currentRoom}`);

    if (chatUserName && messageInput && sendButton && userStatusSpan) {
        chatUserName.textContent = currentChatUser.username;
        
        const isUserOnline = onlineUsers.get(String(user.id)) === true; 
        userStatusSpan.textContent = isUserOnline ? 'Online' : 'Offline';
        userStatusSpan.classList.toggle('online', isUserOnline); 
        userStatusSpan.classList.toggle('offline', !isUserOnline); 
    }

    // Logika przełączania widoku mobilnego/desktopowego
    if (window.matchMedia('(max-width: 768px)').matches) {
        if (sidebarWrapper) {
            sidebarWrapper.classList.add('hidden-on-mobile');
        }
        if (chatAreaWrapper) {
            chatAreaWrapper.classList.add('active-on-mobile');
        }
        if (chatArea) {
            chatArea.classList.add('active');
        }
        if (backButton) {
            backButton.style.display = 'block';
        }
        if (logoScreen) {
            logoScreen.classList.add('hidden');
        }
    } else {
        if (sidebarWrapper) {
            sidebarWrapper.classList.remove('hidden-on-mobile');
        }
        if (chatAreaWrapper) {
            chatAreaWrapper.classList.remove('active-on-mobile');
            chatAreaWrapper.style.display = 'flex';
        }
        if (chatArea) {
            chatArea.classList.add('active');
        }
        if (logoScreen) {
            logoScreen.classList.add('hidden');
        }
        if (backButton) {
            backButton.style.display = 'none';
        }
    }

    // Zresetuj licznik nieprzeczytanych wiadomości dla wybranej konwersacji
    const unreadCount = clickedConvoItemElement.querySelector('.unread-count');
    if (unreadCount) {
        unreadCount.textContent = '0';
        unreadCount.classList.add('hidden');
    }

    // Dołącz do pokoju WebSocket, jeśli połączenie jest otwarte
    if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({
            type: 'join',
            name: currentUser.id,
            room: currentRoom,
        }));
        console.log(`[handleConversationClick] Wysłano wiadomość dołączenia do WebSocket dla pokoju: ${currentRoom}`);
    } else {
        console.warn("[handleConversationClick] WebSocket nie jest otwarty, próba ponownej inicjalizacji i dołączenia po otwarciu.");
        initWebSocket(); // Ponownie zainicjuj WebSocket
    }
}

/**
 * Sets up event listeners for sending messages.
 */
function setupSendMessage() {
    if (!messageInput || !sendButton || !messageContainer) {
        console.error("[setupSendMessage] Elementy do wysyłania wiadomości nie znalezione.");
        return;
    }

    // Wysyłaj wskaźnik pisania podczas wpisywania
    messageInput.addEventListener('input', () => {
        if (currentRoom && socket && socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({
                type: 'typing',
                username: currentUser.id,
                room: currentRoom,
            }));
        }
    });

    // Wyślij wiadomość po kliknięciu przycisku
    sendButton.onclick = () => {
        console.log("[setupSendMessage] Kliknięto przycisk Wyślij lub naciśnięto Enter.");
        const text = messageInput.value.trim();
        if (!text || !currentChatUser || !socket || socket.readyState !== WebSocket.OPEN) {
            console.warn("[setupSendMessage] Nie można wysłać wiadomości: pusta, brak odbiorcy lub WebSocket nie jest otwarty.");
            return;
        }
        if (!currentRoom) {
            console.error("[setupSendMessage] Nie można wysłać wiadomości: currentRoom nie jest ustawiony.");
            return;
        }

        const msgData = {
            type: 'message',
            username: currentUser.id,
            text,
            room: currentRoom,
            inserted_at: new Date().toISOString()
        };

        console.log("[setupSendMessage] Wysyłanie wiadomości przez WS:", msgData);
        socket.send(JSON.stringify(msgData));
        
        messageInput.value = ''; // Wyczyść pole
        messageInput.focus(); // Zachowaj fokus
    };

    // Wyślij wiadomość po naciśnięciu Enter
    messageInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            sendButton.click();
        }
    });
}

/**
 * Adds a message to the chat view and updates the conversation preview in the list.
 * @param {Object} msg - The message object.
 */
async function addMessageToChat(msg) {
    console.log("[addMessageToChat] START - Odebrano obiekt wiadomości:", msg);

    if (!msg.room) {
        console.error("[addMessageToChat] BŁĄD: msg.room jest niezdefiniowane. Nie można zaktualizować UI. Wiadomość:", msg);
        return;
    }

    let convoItemToUpdate = contactsListEl.querySelector(`.contact[data-room-id="${msg.room}"]`);

    const senderId = String(msg.username);
    const senderName = senderId === String(currentUser.id) ? "Ja" : (getUserLabelById(senderId) || senderId);
    const previewText = `${senderName}: ${msg.text}`;
    const lastMessageTime = new Date(msg.inserted_at);
    const timeText = lastMessageTime.toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" });

    if (!convoItemToUpdate) {
        // Jeśli element konwersacji nie istnieje, utwórz go (nowa konwersacja)
        console.log(`[addMessageToChat] Tworzenie nowego elementu konwersacji dla pokoju ${msg.room}.`);
        const userProfile = (await loadAllProfiles()).find(p => getRoomName(String(currentUser.id), String(p.id)) === msg.room);
        if (!userProfile) {
            console.error(`[addMessageToChat] Nie można znaleźć profilu użytkownika dla nowego pokoju konwersacji ${msg.room}. Nie można utworzyć elementu konwersacji.`);
            return;
        }

        convoItemToUpdate = document.createElement('li');
        convoItemToUpdate.classList.add('contact');
        convoItemToUpdate.dataset.convoId = userProfile.id;
        convoItemToUpdate.dataset.email = userProfile.email;
        convoItemToUpdate.dataset.roomId = msg.room;

        const avatarSrc = `https://i.pravatar.cc/150?img=${userProfile.id.charCodeAt(0) % 70 + 1}`;

        convoItemToUpdate.innerHTML = `
            <img src="${avatarSrc}" alt="Avatar" class="avatar">
            <div class="contact-info">
                <span class="contact-name">${getUserLabelById(userProfile.id) || userProfile.email}</span>
                <span class="last-message">${previewText}</span>
            </div>
            <div class="contact-meta">
                <span class="message-time">${timeText}</span>
                <span class="unread-count hidden">0</span>
            </div>
        `;
        convoItemToUpdate.addEventListener('click', () => {
            handleConversationClick(userProfile, convoItemToUpdate);
        });
    } else {
        // Jeśli element konwersacji istnieje, zaktualizuj jego zawartość
        const previewEl = convoItemToUpdate.querySelector('.last-message');
        const timeEl = convoItemToUpdate.querySelector('.message-time');
        if (previewEl && timeEl) {
            previewEl.textContent = previewText;
            timeEl.textContent = timeText;
            console.log(`[addMessageToChat] Zaktualizowano istniejący element konwersacji (pokój: ${msg.room}).`);
        }
    }

    // Obsłuż licznik nieprzeczytanych wiadomości
    const unreadCountEl = convoItemToUpdate.querySelector('.unread-count');
    if (String(msg.username) !== String(currentUser.id) && msg.room !== currentRoom) {
        if (unreadCountEl) {
            let currentUnread = parseInt(unreadCountEl.textContent, 10);
            if (isNaN(currentUnread)) currentUnread = 0;
            unreadCountEl.textContent = currentUnread + 1;
            unreadCountEl.classList.remove('hidden');
            console.log(`[addMessageToChat] Licznik nieprzeczytanych wiadomości dla pokoju ${msg.room} zwiększony do: ${unreadCountEl.textContent}.`);
        }
    } else {
        if (unreadCountEl) {
            unreadCountEl.textContent = '0';
            unreadCountEl.classList.add('hidden');
        }
    }

    // Zawsze przenieś konwersację na początek listy
    if (contactsListEl.firstChild !== convoItemToUpdate) {
        contactsListEl.prepend(convoItemToUpdate);
        console.log(`[addMessageToChat][Reorder] Przeniesiono konwersację dla pokoju ${msg.room} na początek.`);
    } else {
        console.log(`[addMessageToChat][Reorder] Konwersacja dla pokoju ${msg.room} jest już na początku.`);
    }

    // Wyświetl wiadomość w aktywnym czacie tylko, jeśli należy do bieżącego pokoju
    if (msg.room === currentRoom) {
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
            console.log(`[addMessageToChat] Wiadomość wyświetlona w aktywnym czacie dla pokoju: ${msg.room}`);
        } else {
            console.error("[addMessageToChat] messageContainer jest nullem podczas próby dodania wiadomości do aktywnego czatu.");
        }
    } else {
        console.log(`[addMessageToChat] Wiadomość nie jest dla aktywnego pokoju, nie dodawana do widoku czatu. Pokój: ${msg.room}, Obecnie aktywny pokój: ${currentRoom}`);
    }
    console.log("[addMessageToChat] KONIEC - Zakończono przetwarzanie wiadomości.");
}

/**
 * Updates the online/offline status indicator for a specific user.
 * @param {string} userId - The ID of the user whose status is being updated.
 * @param {boolean} isOnline - True if the user is online, false otherwise.
 */
function updateUserStatusIndicator(userId, isOnline) {
    console.log(`[Status Update] Funkcja wywołana dla userId: ${userId}, isOnline: ${isOnline}`);
    onlineUsers.set(String(userId), isOnline);

    // Aktualizuj status w nagłówku aktywnego czatu
    if (currentChatUser && userStatusSpan) {
        if (String(currentChatUser.id) === String(userId)) {
            userStatusSpan.textContent = isOnline ? 'Online' : 'Offline';
            userStatusSpan.classList.toggle('online', isOnline);
            userStatusSpan.classList.toggle('offline', !isOnline);
        }
    }

    // Aktualizuj status na liście aktywnych użytkowników (prawy sidebar - desktop)
    if (activeUsersListEl && noActiveUsersText) {
        const userListItem = activeUsersListEl.querySelector(`li[data-user-id="${userId}"]`);

        if (!isOnline && String(userId) !== String(currentUser.id)) {
            if (userListItem) {
                userListItem.remove();
            }
            if (activeUsersListEl.children.length === 0) {
                noActiveUsersText.style.display = 'block';
                activeUsersListEl.style.display = 'none';
            }
        } else if (isOnline && String(userId) !== String(currentUser.id)) {
            if (userListItem) {
                const statusIndicator = userListItem.querySelector('.status-dot');
                if (statusIndicator) {
                    statusIndicator.classList.toggle('online', isOnline);
                    statusIndicator.classList.toggle('offline', !isOnline);
                }
            } else {
                const li = document.createElement('li');
                li.classList.add('active-user-item');
                li.dataset.userId = userId;

                const avatarSrc = `https://i.pravatar.cc/150?img=${userId.charCodeAt(0) % 70 + 1}`;

                li.innerHTML = `
                    <img src="${avatarSrc}" alt="Avatar" class="avatar">
                    <span class="username">${getUserLabelById(userId)}</span>
                    <span class="status-dot online"></span>
                `;
                activeUsersListEl.appendChild(li);
            }
            noActiveUsersText.style.display = 'none';
            activeUsersListEl.style.display = 'block';
        }
    }

    // Aktualizuj status na liście użytkowników online na mobile
    if (onlineUsersMobile) {
        const mobileUserItem = onlineUsersMobile.querySelector(`div[data-user-id="${userId}"]`);

        if (!isOnline && String(userId) !== String(currentUser.id)) {
            if (mobileUserItem) {
                mobileUserItem.remove();
            }
        } else if (isOnline && String(userId) !== String(currentUser.id)) {
            if (!mobileUserItem) {
                const div = document.createElement('div');
                div.classList.add('online-user-item-mobile');
                div.dataset.userId = userId;

                const avatarSrc = `https://i.pravatar.cc/150?img=${userId.charCodeAt(0) % 70 + 1}`;

                div.innerHTML = `
                    <img src="${avatarSrc}" alt="Avatar" class="avatar">
                    <span class="username">${getUserLabelById(userId)}</span>
                `;
                
                div.addEventListener('click', async () => {
                    const userProfile = (await loadAllProfiles()).find(p => String(p.id) === String(userId));
                    if (userProfile) {
                        const mockConvoItem = document.createElement('li');
                        mockConvoItem.dataset.convoId = userId;
                        mockConvoItem.dataset.email = userProfile.email;
                        mockConvoItem.dataset.roomId = getRoomName(String(currentUser.id), String(userId));
                        handleConversationClick(userProfile, mockConvoItem);
                    }
                });
                onlineUsersMobile.appendChild(div);
            }
        }
    }
}


/**
 * Displays the typing indicator for a specific user.
 * Hides it after a short delay.
 * @param {string} usernameId - The ID of the user who is typing.
 */
function showTypingIndicator(usernameId) {
    if (currentChatUser && String(usernameId) === String(currentChatUser.id)) {
        if (typingStatusHeader) {
            typingStatusHeader.classList.remove('hidden');
        }
        if (typingIndicatorMessages) {
            typingIndicatorMessages.classList.remove('hidden');
        }

        clearTimeout(typingTimeout);
        typingTimeout = setTimeout(() => {
            if (typingStatusHeader) {
                typingStatusHeader.classList.add('hidden');
            }
            if (typingIndicatorMessages) {
                typingIndicatorMessages.classList.add('hidden');
            }
        }, 3000);
    }
}

/**
 * Initializes the WebSocket connection for real-time communication.
 */
function initWebSocket() {
    const wsUrl = import.meta.env.VITE_CHAT_WS_URL || "wss://firm-chat-app-backend.onrender.com";

    if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
        console.log("[initWebSocket] Połączenie WebSocket jest już otwarte lub w trakcie łączenia.");
        return;
    }

    socket = new WebSocket(wsUrl);

    socket.onopen = () => {
        console.log('[initWebSocket] WebSocket połączony');
        reconnectAttempts = 0;
        if (currentUser) {
            socket.send(JSON.stringify({
                type: 'join',
                name: currentUser.id,
                room: 'global',
            }));
            console.log(`[initWebSocket] Wysłano globalną wiadomość dołączenia do WebSocket dla użytkownika: ${currentUser.id}`);

            socket.send(JSON.stringify({
                type: 'status',
                user: currentUser.id,
                online: true
            }));
            console.log(`[initWebSocket] Wysłano status 'online' dla użytkownika ${currentUser.id}`);
        }
        loadActiveUsers();
    };

    socket.onmessage = (event) => {
        const data = JSON.parse(event.data);
        console.log('[WS MESSAGE] Odebrano dane WS:', data); // Zostaw ten log dla wglądu

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
                if (messageContainer) {
                    messageContainer.innerHTML = '';
                    data.messages.forEach((msg) => addMessageToChat(msg));
                }
                break;
            case 'status':
                updateUserStatusIndicator(data.user, data.online);
                break;
            case 'active_users':
                displayActiveUsers(data.users);
                break;
            default:
                console.warn("[WS MESSAGE] Nieznany typ wiadomości WS:", data.type, data);
        }
    };

    socket.onclose = (event) => {
        console.log('[initWebSocket] WebSocket rozłączony. Kod:', event.code, 'Powód:', event.reason);
        if (event.code !== 1000) {
            console.log('[initWebSocket] Próba ponownego połączenia...');
            setTimeout(initWebSocket, Math.min(1000 * ++reconnectAttempts, 10000));
        }
    };

    socket.onerror = (error) => {
        console.error('[initWebSocket] Błąd WebSocket:', error);
        if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
            socket.close();
        }
    };
}

/**
 * Loads and displays the list of active users in the right sidebar.
 */
async function loadActiveUsers() {
    console.log("[loadActiveUsers] Ładowanie aktywnych użytkowników...");
    if (!activeUsersListEl || !noActiveUsersText || !onlineUsersMobile) {
        console.error("[loadActiveUsers] Krytyczne elementy listy aktywnych użytkowników nie znalezione.");
        return;
    }

    if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: 'get_active_users' }));
    } else {
        console.warn("[loadActiveUsers] WebSocket nie jest otwarty, nie można zażądać aktywnych użytkowników.");
    }
}

/**
 * Displays a list of active users in the right sidebar (desktop) and mobile online users section.
 * @param {Array<Object>} activeUsersData - An array of active user objects.
 */
function displayActiveUsers(activeUsersData) {
    if (!activeUsersListEl || !noActiveUsersText || !onlineUsersMobile) return;

    activeUsersListEl.innerHTML = '';
    onlineUsersMobile.innerHTML = '';
    onlineUsers.clear();

    const filteredUsers = activeUsersData.filter(user => String(user.id) !== String(currentUser.id));

    if (filteredUsers.length === 0) {
        activeUsersListEl.style.display = 'none';
        noActiveUsersText.style.display = 'block';
    } else {
        activeUsersListEl.style.display = 'block';
        noActiveUsersText.style.display = 'none';

        filteredUsers.forEach(user => {
            const li = document.createElement('li');
            li.classList.add('active-user-item');
            li.dataset.userId = user.id;

            let avatarSrc = `https://i.pravatar.cc/150?img=${user.id.charCodeAt(0) % 70 + 1}`;

            li.innerHTML = `
                <img src="${avatarSrc}" alt="Avatar" class="avatar">
                <span class="username">${getUserLabelById(user.id) || user.username}</span>
                <span class="status-dot online"></span>
            `;
            activeUsersListEl.appendChild(li);

            const divMobile = document.createElement('div');
            divMobile.classList.add('online-user-item-mobile');
            divMobile.dataset.userId = user.id;

            divMobile.innerHTML = `
                <img src="${avatarSrc}" alt="Avatar" class="avatar">
                <span class="username">${getUserLabelById(user.id) || user.username}</span>
            `;
            
            divMobile.addEventListener('click', async () => {
                const userProfile = (await loadAllProfiles()).find(p => String(p.id) === String(user.id));
                if (userProfile) {
                    const mockConvoItem = document.createElement('li');
                    mockConvoItem.dataset.convoId = user.id;
                    mockConvoItem.dataset.email = userProfile.email;
                    mockConvoItem.dataset.roomId = getRoomName(String(currentUser.id), String(user.id));
                    handleConversationClick(userProfile, mockConvoItem);
                }
            });
            onlineUsersMobile.appendChild(divMobile);

            onlineUsers.set(String(user.id), true);
        });
    }
}

/**
 * Sets up the functionality for the chat settings dropdown menu.
 */
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
        });
    });

    const nicknameInput = document.getElementById('nicknameInput');
    const setNicknameButton = document.getElementById('setNicknameButton');
    if (nicknameInput && setNicknameButton) {
        setNicknameButton.addEventListener('click', async () => {
            const newNickname = nicknameInput.value.trim();
            if (newNickname && currentUser) {
                try {
                    const { error } = await supabase
                        .from('profiles')
                        .update({ username: newNickname })
                        .eq('id', currentUser.id);

                    if (error) {
                        throw error;
                    }

                    alert(`Nick '${newNickname}' został pomyślnie ustawiony.`);
                    await loadAllProfiles();
                    if (chatUserName && currentChatUser && String(currentUser.id) === String(currentChatUser.id)) {
                        chatUserName.textContent = newNickname;
                    }
                    await loadContacts();

                } catch (error) {
                    console.error('Błąd ustawiania nicku:', error.message);
                    alert(`Błąd ustawiania nicku: ${error.message}`);
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
            alert(`Wyszukiwanie wiadomości dla '${searchTerm}' (funkcjonalność do zaimplementowania).`);
        });
    }
}

/**
 * Main function to initialize the entire application.
 */
async function initializeApp() {
    console.log("[initializeApp] Inicjowanie aplikacji Komunikator...");

    // Pobieranie referencji do elementów DOM
    mainHeader = document.querySelector('.main-header');
    menuButton = document.getElementById('menuButton');
    dropdownMenu = document.getElementById('dropdownMenu');
    themeToggle = document.getElementById('themeToggle');
    logoutButton = document.getElementById('logoutButton');

    container = document.querySelector('.container');
    sidebarWrapper = document.querySelector('.sidebar-wrapper');
    mainNavIcons = document.querySelector('.main-nav-icons');
    navIcons = document.querySelectorAll('.nav-icon');

    onlineUsersMobile = document.getElementById('onlineUsersMobile');

    sidebarEl = document.getElementById('sidebar');
    searchInput = sidebarEl.querySelector('.search-bar input[type="text"]');
    contactsListEl = document.getElementById('contactsList');

    chatAreaWrapper = document.querySelector('.chat-area-wrapper');
    logoScreen = document.getElementById('logoScreen');
    chatArea = document.getElementById('chatArea');

    chatHeader = document.querySelector('.chat-header');
    backButton = document.getElementById('backButton');
    chatUserName = document.getElementById('chatUserName');
    userStatusSpan = document.getElementById('userStatus');
    chatHeaderActions = chatHeader.querySelector('.chat-header-actions');
    chatSettingsButton = document.getElementById('chatSettingsButton');
    chatSettingsDropdown = document.getElementById('chatSettingsDropdown');
    typingStatusHeader = document.getElementById('typingStatus');
    typingIndicatorMessages = document.getElementById('typingIndicator');

    messageContainer = document.getElementById('messageContainer');

    chatFooter = document.querySelector('.chat-footer');
    attachButton = chatFooter.querySelector('.attach-button');
    messageInput = document.getElementById('messageInput');
    emojiButton = chatFooter.querySelector('.emoji-button');
    sendButton = document.getElementById('sendButton');

    rightSidebarWrapper = document.querySelector('.right-sidebar-wrapper');
    rightSidebar = document.getElementById('rightSidebar');
    activeUsersListEl = document.getElementById('activeUsersList');
    noActiveUsersText = document.getElementById('noActiveUsersText');

    // Walidacja czy wszystkie kluczowe elementy UI zostały znalezione
    const criticalElements = {
        mainHeader, menuButton, dropdownMenu, themeToggle, logoutButton, container,
        sidebarWrapper, mainNavIcons, onlineUsersMobile, sidebarEl, searchInput,
        contactsListEl, chatAreaWrapper, logoScreen, chatArea, chatHeader,
        backButton, chatUserName, userStatusSpan, chatHeaderActions,
        chatSettingsButton, chatSettingsDropdown, typingStatusHeader, typingIndicatorMessages,
        messageContainer, chatFooter, attachButton, messageInput, emojiButton,
        sendButton, rightSidebarWrapper, rightSidebar, activeUsersListEl, noActiveUsersText
    };

    let allElementsFound = true;
    for (const key in criticalElements) {
        if (criticalElements[key] === null || criticalElements[key] === undefined || (key === 'navIcons' && criticalElements[key].length === 0)) {
            console.error(`[initializeApp] Błąd: Krytyczny element UI '${key}' nie znaleziony.`);
            allElementsFound = false;
        }
    }
    if (!allElementsFound) {
        console.error('[initializeApp] Inicjalizacja nie powiodła się z powodu brakujących elementów UI. Sprawdź selektory HTML.');
        return;
    } else {
        console.log('[initializeApp] Wszystkie krytyczne elementy UI znalezione.');
    }

    // Sprawdź sesję użytkownika Supabase
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
        console.log('[initializeApp] Nie znaleziono aktywnej sesji Supabase. Przekierowanie do login.html');
        window.location.href = 'login.html';
        return;
    }
    currentUser = session.user;
    console.log('[initializeApp] Bieżący uwierzytelniony użytkownik:', currentUser.id);

    // Obsłuż status offline przed wyładowaniem strony
    window.addEventListener('beforeunload', () => {
        if (socket && socket.readyState === WebSocket.OPEN && currentUser) {
            console.log(`[initializeApp] Wysyłanie sygnału 'leave' dla użytkownika ${currentUser.id} przed wyładowaniem.`);
            socket.send(JSON.stringify({
                type: 'leave',
                name: currentUser.id,
                room: currentRoom || 'global'
            }));
        }
    });

    // Załaduj profile i kontakty
    await loadAllProfiles();
    await loadContacts();

    // Zainicjuj połączenie WebSocket
    initWebSocket();

    // Skonfiguruj funkcjonalność wysyłania wiadomości
    setupSendMessage();

    // Ustaw domyślny stan UI po załadowaniu
    chatArea.classList.remove('active');
    messageInput.disabled = true;
    sendButton.disabled = true;

    // Dodaj ogólne nasłuchiwanie zdarzeń dla UI aplikacji
    backButton.addEventListener('click', () => {
        console.log('[backButton] Kliknięto przycisk Wstecz (UI)');
        resetChatView();

        if (socket && socket.readyState === WebSocket.OPEN && currentRoom) {
            socket.send(JSON.stringify({
                type: 'leave',
                name: currentUser.id,
                room: currentRoom
            }));
        }

        if (window.matchMedia('(max-width: 768px)').matches) {
            if (sidebarWrapper) {
                sidebarWrapper.classList.remove('hidden-on-mobile');
            }
            if (chatAreaWrapper) {
                chatAreaWrapper.classList.remove('active-on-mobile');
            }
            if (chatArea) {
                chatArea.classList.remove('active');
            }
            if (logoScreen) {
                logoScreen.classList.add('hidden');
            }
            if (backButton) {
                backButton.style.display = 'none';
            }
        } else {
            if (logoScreen) {
                logoScreen.classList.remove('hidden');
            }
            if (chatArea) {
                chatArea.classList.remove('active');
            }
            if (chatAreaWrapper) {
                chatAreaWrapper.classList.remove('active-on-mobile');
                chatAreaWrapper.style.display = 'flex';
            }
        }
    });

    menuButton.addEventListener('click', (event) => {
        event.stopPropagation();
        dropdownMenu.classList.toggle('hidden');
    });

    document.addEventListener('click', (event) => {
        if (!chatSettingsDropdown.classList.contains('hidden') && !chatSettingsButton.contains(event.target)) {
            chatSettingsDropdown.classList.add('hidden');
        }
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
            console.error('[logoutButton] Błąd wylogowania:', error.message);
        } else {
            console.log('[logoutButton] Pomyślnie wylogowano. Przekierowanie do login.html');
            window.location.href = 'login.html';
        }
    });

    if (navIcons) {
        navIcons.forEach(icon => {
            icon.addEventListener('click', () => {
                navIcons.forEach(i => i.classList.remove('active'));
                icon.classList.add('active');
            });
        });
    }

    setupChatSettingsDropdown();

    function handleMediaQueryChange(mq) {
        if (mq.matches) { // Mobile view
            if (sidebarWrapper) {
                sidebarWrapper.classList.remove('hidden-on-mobile');
            }
            if (chatAreaWrapper) {
                chatAreaWrapper.classList.remove('active-on-mobile');
            }
            if (chatArea) {
                chatArea.classList.remove('active');
            }
            if (logoScreen) {
                logoScreen.classList.add('hidden');
            }
            if (backButton) {
                backButton.style.display = 'none';
            }
        } else { // Desktop/Tablet view
            if (sidebarWrapper) {
                sidebarWrapper.classList.remove('hidden-on-mobile');
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

    const mq = window.matchMedia('(max-width: 768px)');
    mq.addListener(handleMediaQueryChange);
    handleMediaQueryChange(mq);

    console.log("[initializeApp] Aplikacja Komunikator zainicjowana pomyślnie.");
}

document.addEventListener('DOMContentLoaded', initializeApp);
