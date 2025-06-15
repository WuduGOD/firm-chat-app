// Importy zależności - dopasowane do ścieżek z Twojego działającego HTML
// Zakładając, że wszystkie pliki JS są w /src/
import { loadAllProfiles, getUserLabelById } from './profiles.js';
import { supabase } from './supabaseClient.js';

// Globalne zmienne UI i czatu - zadeklarowane na początku, aby były dostępne wszędzie
let mainHeader;
let menuButton;
let dropdownMenu; // ID: dropdownMenu, Klasa: dropdown
let themeToggle;
let logoutButton;

let container;
let sidebarWrapper; // Kontener dla main-nav-icons i sidebar
let mainNavIcons;
let navIcons;

let sidebarEl; // ID: sidebar, Klasa: conversations-list
let searchInput;
let contactsListEl; // ID: contactsList

let chatAreaWrapper; // Kontener dla logo-screen i chat-area
let logoScreen; // ID: logoScreen
let chatArea; // ID: chatArea

let chatHeader; // Klasa: chat-header
let backButton;
let chatUserName; // ID: chatUserName
let userStatusSpan; // ID: userStatus, Klasa: status
let chatHeaderActions;
let chatSettingsButton;
let chatSettingsDropdown; // ID: chatSettingsDropdown, Klasa: dropdown chat-settings-dropdown
let typingStatusHeader; // ID: typingStatus, Klasa: typing-status (status w nagłówku)
let typingIndicatorMessages; // ID: typingIndicator, Klasa: typing-indicator (animowane kropki w wiadomościach)

let messageContainer; // ID: messageContainer, Klasa: messages

let chatFooter; // Klasa: chat-footer
let attachButton;
let messageInput;
let emojiButton;
let sendButton;

// Zmienne dla prawego sidebara (Aktywni Użytkownicy)
let rightSidebarWrapper; // Klasa: right-sidebar-wrapper
let rightSidebar; // ID: rightSidebar
let activeUsersListEl; // ID: activeUsersList
let noActiveUsersText; // ID: noActiveUsersText, bez klasy .no-active-users-message w HTML

// Zmienne stanu czatu
let allConversations = [];
let currentUser = null; // Obiekt bieżącego użytkownika z Supabase
let currentChatUser = null; // Obiekt użytkownika, z którym aktualnie czatujemy
let currentRoom = null; // Nazwa pokoju czatu
let socket = null; // Instancja WebSocket
let reconnectAttempts = 0; // Licznik prób ponownego połączenia
let typingTimeout; // Timeout dla wskaźnika pisania (dla obu wskaźników)
let currentActiveConvoItem = null; // Aktualnie wybrany element konwersacji na liście

// NOWA ZMIENNA: Mapa do przechowywania aktualnych statusów online (userID -> boolean)
let onlineUsers = new Map();


/**
 * Resets the chat view to its initial state.
 */
function resetChatView() {
    console.log("Resetting chat view...");
    if (messageContainer) {
        messageContainer.innerHTML = ""; // Clear messages
        // Remove all theme classes for messages container
        messageContainer.classList.remove('blue-theme', 'green-theme', 'red-theme', 'dark-bg', 'pattern-bg');
    }
    if (messageInput) {
        messageInput.disabled = true; // Disable input
        messageInput.value = ""; // Clear input value
    }
    if (sendButton) {
        sendButton.disabled = true; // Disable send button
    }
    if (chatUserName) {
        chatUserName.textContent = ""; // Clear chat user name
    }
    if (userStatusSpan) {
        userStatusSpan.textContent = ""; // Clear user status
        userStatusSpan.classList.remove('online', 'offline'); // Remove status classes
    }
    if (typingStatusHeader) { // Status w nagłówku
        typingStatusHeader.classList.add('hidden'); // Hide typing indicator
    }
    if (typingIndicatorMessages) { // Animowane kropki w wiadomościach
        typingIndicatorMessages.classList.add('hidden'); // Hide typing indicator
    }

    currentChatUser = null; // Reset current chat user
    currentRoom = null; // Reset current room

    if (logoScreen) {
        logoScreen.classList.remove('hidden'); // Show logo screen
    }
    if (chatArea) {
        chatArea.classList.remove('active'); // Deactivate chat area
    }

    if (currentActiveConvoItem) {
        currentActiveConvoItem.classList.remove('active'); // Deactivate active conversation item
        currentActiveConvoItem = null;
    }

    if (chatSettingsDropdown) {
        chatSettingsDropdown.classList.add('hidden'); // Hide chat settings dropdown
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
        console.error('Error fetching last message:', error);
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
    console.log("Loading contacts...");
    if (!currentUser || !currentUser.email) {
        console.error("Current user is not defined, cannot load contacts.");
        return;
    }

    const { data: users, error } = await supabase.rpc('get_other_users', { current_email: currentUser.email });
    if (error) {
        console.error('Error loading contacts:', error);
        return;
    }

    if (contactsListEl) {
        contactsListEl.innerHTML = ''; // Clear existing contacts
    } else {
        console.error("contactsListEl element not found!");
        return;
    }

    // Fetch last message for each contact to sort them
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

        const avatarSrc = `https://i.pravatar.cc/150?img=${user.id.charCodeAt(0) % 70 + 1}`; // Random avatar based on user ID

        let previewText = "Brak wiadomości"; // Default text if no messages
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

/**
 * Handles a click event on a conversation item.
 * Sets up the chat view for the selected user and joins the chat room.
 * @param {Object} user - The user object of the selected contact.
 * @param {HTMLElement} clickedConvoItemElement - The clicked list item element.
 */
async function handleConversationClick(user, clickedConvoItemElement) {
    console.log('Conversation item clicked, user:', user);

    // Deactivate previously active conversation item
    if (currentActiveConvoItem) {
        currentActiveConvoItem.classList.remove('active');
    }
    clickedConvoItemElement.classList.add('active'); // Activate clicked item
    currentActiveConvoItem = clickedConvoItemElement;

    resetChatView(); // Reset the chat display before loading new conversation

    currentChatUser = {
        id: user.id,
        username: getUserLabelById(user.id) || user.email,
        email: user.email,
    };
    currentRoom = getRoomName(String(currentUser.id), String(currentChatUser.id));
    console.log(`Starting chat with ${currentChatUser.username}, room ID: ${currentRoom}`);

    if (chatUserName && messageInput && sendButton && userStatusSpan) {
        chatUserName.textContent = currentChatUser.username;
        
        // KLUCZOWA ZMIANA: Sprawdzamy aktualny status z mapy onlineUsers
        // Jeśli użytkownik jest w mapie i jest online, to jest online. W przeciwnym razie offline.
        const isUserOnline = onlineUsers.get(String(user.id)) === true; 
        userStatusSpan.textContent = isUserOnline ? 'Online' : 'Offline';
        userStatusSpan.classList.toggle('online', isUserOnline);
        userStatusSpan.classList.toggle('offline', !isUserOnline);
        console.log(`Initial status for active chat user ${currentChatUser.username} (from onlineUsers map): ${isUserOnline ? 'Online' : 'Offline'}`);

        messageInput.disabled = false;
        sendButton.disabled = false;
        messageInput.focus();
    }

    if (logoScreen) {
        logoScreen.classList.add('hidden'); // Hide logo screen
    }
    if (chatArea) {
        chatArea.classList.add('active'); // Show chat area
    }

    // Handle responsive back button and sidebar visibility on mobile
    if (window.matchMedia('(max-width: 768px)').matches) {
        if (backButton) {
            backButton.classList.add('show-on-mobile'); // Show back button on mobile
        }
        if (sidebarWrapper) {
            sidebarWrapper.classList.add('hide-on-mobile'); // Hide sidebar on mobile
        }
    } else {
        if (backButton) {
            backButton.classList.remove('show-on-mobile'); // Hide back button on desktop
        }
        if (sidebarWrapper) {
            sidebarWrapper.classList.remove('hide-on-mobile'); // Ensure sidebar is visible on desktop
        }
    }

    // Reset unread count for the selected conversation
    const unreadCount = clickedConvoItemElement.querySelector('.unread-count');
    if (unreadCount) {
        unreadCount.textContent = '0';
        unreadCount.classList.add('hidden');
    }

    // Join the WebSocket room if connection is open, otherwise re-initialize
    if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({
            type: 'join',
            name: currentUser.id,
            room: currentRoom,
        }));
        console.log(`Sent join message to WebSocket for room: ${currentRoom}`);
    } else {
        console.warn("WebSocket not open, attempting to re-initialize and join on open.");
        initWebSocket(); // Re-initialize WebSocket if not open
    }
}

/**
 * Sets up event listeners for sending messages.
 */
function setupSendMessage() {
    if (!messageInput || !sendButton || !messageContainer) {
        console.error("Message input or send button or messageContainer not found for setup.");
        return;
    }

    // Send typing indicator on input
    messageInput.addEventListener('input', () => {
        if (currentRoom && socket && socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({
                type: 'typing',
                username: currentUser.id,
                room: currentRoom,
            }));
        }
    });

    // Send message on button click
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
            inserted_at: new Date().toISOString() // Add timestamp
        };

        console.log("Sending message via WS:", msgData);
        socket.send(JSON.stringify(msgData)); // Send message via WebSocket
        messageInput.value = ''; // Clear input
        messageInput.focus(); // Keep focus on input
    };

    // Send message on Enter key press
    messageInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault(); // Prevent default Enter behavior (e.g., new line)
            sendButton.click(); // Trigger send button click
        }
    });
}

/**
 * Adds a message to the chat view and updates the conversation preview in the list.
 * @param {Object} msg - The message object.
 */
function addMessageToChat(msg) {
    console.log("Adding message to UI:", msg);
    console.log("Room comparison: msg.room =", msg.room, ", currentRoom =", currentRoom);

    // Find the conversation item by room ID to update last-message and timestamp
    const convoItemToUpdate = contactsListEl.querySelector(`.contact[data-room-id="${msg.room}"]`);
    if (convoItemToUpdate) {
        const previewEl = convoItemToUpdate.querySelector('.last-message');
        const timeEl = convoItemToUpdate.querySelector('.message-time'); // Użyj .message-time zgodnie z HTML

        if (previewEl && timeEl) {
            const senderName = String(msg.username) === String(currentUser.id) ? "Ja" : (getUserLabelById(msg.username) || msg.username);
            // KLUCZOWA ZMIANA: Bezpośrednia aktualizacja textContent na elemencie DOM
            previewEl.textContent = `${senderName}: ${msg.text}`; // Użyj textContent, nie innerHTML dla bezpieczeństwa

            const lastMessageTime = new Date(msg.inserted_at);
            timeEl.textContent = lastMessageTime.toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" });
        }

        // Move the item to the top if it's a new message or from a different room
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

    // Display message in the active chat only if it belongs to the current room
    if (msg.room !== currentRoom) {
        console.log("Message is not for the active room, not adding to chat view.");
        return;
    }

    const div = document.createElement('div');
    // Ensure messages are correctly styled with .message class on div itself
    div.classList.add('message', String(msg.username) === String(currentUser.id) ? 'sent' : 'received');

    const timestamp = new Date(msg.inserted_at || Date.now());
    const timeString = timestamp.toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" });

    div.innerHTML = `
        <p>${msg.text}</p>
        <span class="timestamp">${timeString}</span>
    `;
    if (messageContainer) {
        messageContainer.appendChild(div);
        messageContainer.scrollTop = messageContainer.scrollHeight; // Scroll to bottom
    } else {
        console.error("messageContainer is null when trying to add message.");
    }
}

/**
 * Updates the online/offline status indicator for a specific user.
 * @param {string} userId - The ID of the user whose status is being updated.
 * @param {boolean} isOnline - True if the user is online, false otherwise.
 */
function updateUserStatusIndicator(userId, isOnline) {
    console.log(`[Status Update Debug] Function called for userId: ${userId}, isOnline: ${isOnline}`);
    onlineUsers.set(String(userId), isOnline); // ZAWSZE AKTUALIZUJ MAPĘ onlineUsers

    // Update status in the active chat header
    if (currentChatUser && userStatusSpan) {
        console.log(`[Status Update Debug] currentChatUser.id: ${currentChatUser.id}, userId from WS: ${userId}`);
        if (String(currentChatUser.id) === String(userId)) {
            userStatusSpan.textContent = isOnline ? 'Online' : 'Offline';
            userStatusSpan.classList.toggle('online', isOnline);
            userStatusSpan.classList.toggle('offline', !isOnline);
            console.log(`[Status Update Debug] Chat header status updated for ${getUserLabelById(userId)} to: ${isOnline ? 'Online' : 'Offline'}`);
        } else {
            console.log(`[Status Update Debug] userId ${userId} does not match currentChatUser.id ${currentChatUser.id}. Header not updated.`);
        }
    } else {
        console.log("[Status Update Debug] currentChatUser or userStatusSpan is null/undefined. Cannot update header.");
    }

    // Update status in the active users list (right sidebar)
    if (activeUsersListEl && noActiveUsersText) {
        const userListItem = activeUsersListEl.querySelector(`li[data-user-id="${userId}"]`);

        if (!isOnline && String(userId) !== String(currentUser.id)) {
            // If user goes offline and is not the current user, remove from list
            if (userListItem) {
                userListItem.remove();
                console.log(`Removed offline user ${getUserLabelById(userId)} from active list.`);
            }
            // Check if the list is empty after removal and show "no active users" message
            if (activeUsersListEl.children.length === 0) {
                noActiveUsersText.style.display = 'block';
                activeUsersListEl.style.display = 'none';
            }
            return; // Exit after handling offline status
        }

        // Handle online status: update existing or add new
        if (isOnline) {
            // Do not add the current user to the active users list
            if (String(userId) === String(currentUser.id)) {
                console.log(`Filtering out current user ${userId} from active users list.`);
                return;
            }

            if (userListItem) {
                // If user exists, update their status indicator
                const statusIndicator = userListItem.querySelector('.status-dot'); // Użyj .status-dot
                if (statusIndicator) {
                    statusIndicator.classList.toggle('online', isOnline);
                    statusIndicator.classList.toggle('offline', !isOnline);
                }
            } else {
                 // If user is online and not already in the list, add them
                const li = document.createElement('li');
                li.classList.add('active-user-item'); // Dodaj klasę do LI, jeśli potrzebne do stylowania ogólnego
                li.dataset.userId = userId;

                const avatarSrc = `https://i.pravatar.cc/150?img=${userId.charCodeAt(0) % 70 + 1}`; // Temporary random avatar

                li.innerHTML = `
                    <img src="${avatarSrc}" alt="Avatar" class="avatar">
                    <span class="username">${getUserLabelById(userId)}</span>
                    <span class="status-dot online"></span>
                `;
                activeUsersListEl.appendChild(li);
            }
            // If there are active users, ensure the list is visible and message is hidden
            noActiveUsersText.style.display = 'none';
            activeUsersListEl.style.display = 'block';
        }
    } else {
        console.error("activeUsersListEl or noActiveUsersText not found during status update.");
    }
}

/**
 * Displays the typing indicator for a specific user.
 * Hides it after a short delay.
 * @param {string} usernameId - The ID of the user who is typing.
 */
function showTypingIndicator(usernameId) {
    // Check if the typing indicator is for the currently active chat
    if (currentChatUser && String(usernameId) === String(currentChatUser.id)) {
        // Pokaż wskaźnik pisania w nagłówku
        if (typingStatusHeader) {
            typingStatusHeader.classList.remove('hidden'); // Pokazuje, jeśli był ukryty
        }
        // Pokaż animowane kropki w obszarze wiadomości
        if (typingIndicatorMessages) {
            typingIndicatorMessages.classList.remove('hidden'); // Pokazuje animowane kropki
        }

        clearTimeout(typingTimeout); // Clear previous timeout
        typingTimeout = setTimeout(() => {
            if (typingStatusHeader) {
                typingStatusHeader.classList.add('hidden');
            }
            if (typingIndicatorMessages) {
                typingIndicatorMessages.classList.add('hidden');
            }
        }, 3000); // 3 seconds
        console.log(`${getUserLabelById(usernameId)} is typing...`);
    }
}

/**
 * Initializes the WebSocket connection for real-time communication.
 */
function initWebSocket() {
    // Get WebSocket URL from environment variable or use a default
    const wsUrl = import.meta.env.VITE_CHAT_WS_URL || "wss://firm-chat-app-backend.onrender.com";

    // Prevent multiple WebSocket connections
    if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
        console.log("WebSocket connection already open or connecting.");
        return;
    }

    socket = new WebSocket(wsUrl);

    socket.onopen = () => {
        console.log('WebSocket connected');
        reconnectAttempts = 0; // Reset reconnect attempts
        if (currentUser) { // Only attempt to join if currentUser is defined
            // KLUCZOWA ZMIANA: Zawsze dołączamy do "global" pokoju po otwarciu WS,
            // aby otrzymywać ogólne statusy. Specyficzne pokoje będą dołączane w handleConversationClick.
            socket.send(JSON.stringify({
                type: 'join',
                name: currentUser.id,
                room: 'global', // Dołącz do globalnego pokoju dla statusów
            }));
            console.log(`Sent global join message to WebSocket for user: ${currentUser.id}`);

            // Send "online" status for the current user
            socket.send(JSON.stringify({
                type: 'status',
                user: currentUser.id,
                online: true
            }));
            console.log(`Sent 'online' status for user ${currentUser.id}`);
        } else {
            console.warn("WebSocket opened but currentUser is not set. Cannot join room yet.");
        }
        // Request active users list after successful connection
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
                    messageContainer.innerHTML = ''; // Clear current messages
                    data.messages.forEach((msg) => addMessageToChat(msg)); // Add historical messages
                }
                break;
            case 'status':
                console.log(`Received status update for user ${data.user}: ${data.online ? 'online' : 'offline'}`);
                updateUserStatusIndicator(data.user, data.online);
                break;
            case 'active_users':
                console.log('Received initial active users list:', data.users);
                displayActiveUsers(data.users); // Display initial active users
                break;
            default:
                console.warn("Unknown WS message type:", data.type, data);
        }
    };

    socket.onclose = (event) => {
        console.log('WebSocket disconnected. Code:', event.code, 'Reason:', event.reason);
        // Send "offline" status when disconnected (this is handled by server on disconnect)
        // Optionally, update UI here for current user or all users to offline
        if (event.code !== 1000) { // 1000 is normal closure
            console.log('Attempting to reconnect...');
            setTimeout(initWebSocket, Math.min(1000 * ++reconnectAttempts, 10000)); // Exponential backoff reconnect
        }
    };

    socket.onerror = (error) => {
        console.error('WebSocket Error:', error);
        if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
            socket.close(); // Close connection on error to trigger onclose and reconnect
        }
    };
}

/**
 * Loads and displays the list of active users in the right sidebar.
 */
async function loadActiveUsers() {
    console.log("Loading active users for right sidebar...");
    // Sprawdź, czy elementy istnieją, zanim spróbujesz ich użyć
    if (!activeUsersListEl || !noActiveUsersText) {
        console.error("activeUsersListEl or noActiveUsersText not found, cannot load active users.");
        return;
    }

    // Request active users list from WebSocket server
    if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: 'get_active_users' }));
        console.log("Requested active users list from WebSocket server.");
    } else {
        console.warn("WebSocket not open, cannot request active users.");
    }
}

/**
 * Displays a list of active users in the right sidebar.
 * @param {Array<Object>} activeUsersData - An array of active user objects.
 */
function displayActiveUsers(activeUsersData) {
    if (!activeUsersListEl || !noActiveUsersText) return;

    activeUsersListEl.innerHTML = ''; // Clear previous list items
    onlineUsers.clear(); // KLUCZOWA ZMIANA: Czyścimy mapę przed uzupełnieniem z active_users

    // Filter out the current user from the active users list
    const filteredUsers = activeUsersData.filter(user => String(user.id) !== String(currentUser.id));

    if (filteredUsers.length === 0) {
        // No other active users: hide the list, show "no active users" message
        activeUsersListEl.style.display = 'none';
        noActiveUsersText.style.display = 'block';
    } else {
        // Other active users exist: show the list, hide the message
        activeUsersListEl.style.display = 'block';
        noActiveUsersText.style.display = 'none';

        filteredUsers.forEach(user => {
            const li = document.createElement('li');
            li.classList.add('active-user-item'); // Dodaj klasę do LI, jeśli potrzebne do stylowania ogólnego
            li.dataset.userId = user.id;

            const avatarSrc = `https://i.pravatar.cc/150?img=${user.id.charCodeAt(0) % 70 + 1}`; // Temporary random avatar

            li.innerHTML = `
                <img src="${avatarSrc}" alt="Avatar" class="avatar">
                <span class="username">${getUserLabelById(user.id) || user.username}</span>
                <span class="status-dot online"></span>
            `;
            activeUsersListEl.appendChild(li);
            onlineUsers.set(String(user.id), true); // KLUCZOWA ZMIANA: Aktualizujemy mapę onlineUsers
        });
    }
    console.log("[Status Update Debug] onlineUsers map after displayActiveUsers:", onlineUsers);
}

/**
 * Sets up the functionality for the chat settings dropdown menu.
 */
function setupChatSettingsDropdown() {
    if (!chatSettingsButton || !chatSettingsDropdown) return;

    // Toggle dropdown visibility on button click
    chatSettingsButton.addEventListener('click', (event) => {
        event.stopPropagation(); // Prevent document click from closing it immediately
        chatSettingsDropdown.classList.toggle('hidden');
    });

    // Close dropdown when clicking outside
    document.addEventListener('click', (event) => {
        if (!chatSettingsDropdown.classList.contains('hidden') && !chatSettingsButton.contains(event.target)) {
            chatSettingsDropdown.classList.add('hidden');
        }
    });

    // Handle message color options
    const colorOptions = chatSettingsDropdown.querySelectorAll('.color-box');
    colorOptions.forEach(option => {
        option.addEventListener('click', () => {
            colorOptions.forEach(box => box.classList.remove('active')); // Deactivate others
            option.classList.add('active'); // Activate clicked one
            const colorTheme = option.dataset.color;
            if (messageContainer) {
                // Remove existing color themes
                messageContainer.classList.remove('default-theme', 'blue-theme', 'green-theme', 'red-theme');
                if (colorTheme !== 'default') {
                    messageContainer.classList.add(`${colorTheme}-theme`); // Add new theme
                }
            }
            console.log('Message theme changed to:', colorTheme);
        });
    });

    // Handle chat background options
    const backgroundOptions = chatSettingsDropdown.querySelectorAll('.bg-box'); // Select .bg-box elements
    backgroundOptions.forEach(option => {
        option.addEventListener('click', () => {
            backgroundOptions.forEach(box => box.classList.remove('active')); // Deactivate others
            option.classList.add('active'); // Activate clicked one
            const bgTheme = option.dataset.bg;
            if (messageContainer) {
                // Remove existing background themes
                messageContainer.classList.remove('default-bg', 'dark-bg', 'pattern-bg');
                if (bgTheme !== 'default') {
                    messageContainer.classList.add(`${bgTheme}-bg`); // Add new background
                }
            }
            console.log('Chat background changed to:', bgTheme);
        });
    });

    // Handle nickname setting
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
                        .eq('id', currentUser.id); // Update current user's profile

                    if (error) {
                        throw error;
                    }

                    console.log('New nickname set:', newNickname, 'for user:', currentUser.id);
                    // Użyj alertu jako prostego powiadomienia, zgodnie z Twoim wcześniejszym kodem
                    // Zastąp alert modalem w prawdziwej aplikacji
                    alert(`Nickname '${newNickname}' has been set successfully.`);
                    await loadAllProfiles(); // Reload profiles to update cache
                    // Update chat header if it's the current user's chat
                    if (chatUserName && currentChatUser && String(currentUser.id) === String(currentChatUser.id)) {
                        chatUserName.textContent = newNickname;
                    }
                    await loadContacts(); // Reload contacts to update names in sidebar

                } catch (error) {
                    console.error('Error updating nickname:', error.message);
                    alert(`Error setting nickname: ${error.message}`);
                }
            } else if (!currentUser) {
                alert("Error: You are not logged in to set a nickname.");
            }
        });
    }

    // Handle message search (placeholder functionality)
    const messageSearchInput = document.getElementById('messageSearchInput');
    const searchMessagesButton = document.getElementById('searchMessagesButton');
    if (messageSearchInput && searchMessagesButton) {
        searchMessagesButton.addEventListener('click', () => {
            const searchTerm = messageSearchInput.value.trim();
            console.log('Searching messages for:', searchTerm, '(functionality to be implemented)');
            alert(`Searching messages for '${searchTerm}' (functionality to be implemented).`);
        });
    }
}

/**
 * Main function to initialize the entire application.
 * Fetches DOM elements, checks user session, loads data, and sets up event listeners.
 */
async function initializeApp() {
    console.log("Initializing Komunikator application...");

    // 1. Get DOM element references (zaktualizowane do Twojego oryginalnego HTML)
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
    // searchInput jest bezpośrednio w div.search-bar, nie ma ID, więc querySelector to wybiera.
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
    typingStatusHeader = document.getElementById('typingStatus'); // Status w nagłówku (pusty div w HTML)
    typingIndicatorMessages = document.getElementById('typingIndicator'); // Animowane kropki w wiadomościach

    messageContainer = document.getElementById('messageContainer');

    chatFooter = document.querySelector('.chat-footer');
    attachButton = chatFooter.querySelector('.attach-button');
    messageInput = document.getElementById('messageInput');
    emojiButton = chatFooter.querySelector('.emoji-button');
    sendButton = document.getElementById('sendButton');

    rightSidebarWrapper = document.querySelector('.right-sidebar-wrapper');
    rightSidebar = document.getElementById('rightSidebar');
    activeUsersListEl = document.getElementById('activeUsersList');
    // KLUCZOWA ZMIANA: Wybieranie elementu po ID, nie po klasie, zgodnie z HTML
    noActiveUsersText = document.getElementById('noActiveUsersText');


    // 2. Validate if all critical UI elements are found
    // Log null/undefined values directly for easier debugging
    const missingElements = {
        mainHeader: mainHeader,
        menuButton: menuButton,
        dropdownMenu: dropdownMenu,
        themeToggle: themeToggle,
        logoutButton: logoutButton,
        container: container,
        sidebarWrapper: sidebarWrapper,
        mainNavIcons: mainNavIcons,
        navIconsLength: navIcons.length, // Sprawdzamy długość NodeList
        sidebarEl: sidebarEl,
        searchInput: searchInput,
        contactsListEl: contactsListEl,
        chatAreaWrapper: chatAreaWrapper,
        logoScreen: logoScreen,
        chatArea: chatArea,
        chatHeader: chatHeader,
        backButton: backButton,
        chatUserName: chatUserName,
        userStatusSpan: userStatusSpan,
        chatHeaderActions: chatHeaderActions,
        chatSettingsButton: chatSettingsButton,
        chatSettingsDropdown: chatSettingsDropdown,
        typingStatusHeader: typingStatusHeader,
        typingIndicatorMessages: typingIndicatorMessages,
        messageContainer: messageContainer,
        chatFooter: chatFooter,
        attachButton: attachButton,
        messageInput: messageInput,
        emojiButton: emojiButton,
        sendButton: sendButton,
        rightSidebarWrapper: rightSidebarWrapper,
        rightSidebar: rightSidebar,
        activeUsersListEl: activeUsersListEl,
        noActiveUsersText: noActiveUsersText
    };

    let allElementsFound = true;
    for (const key in missingElements) {
        // Specjalne sprawdzenie dla NodeList (navIcons)
        if (key === 'navIconsLength') {
            if (missingElements[key] === 0) {
                console.error(`Error: Element '${key}' (NodeList) is empty.`);
                allElementsFound = false;
            }
        } else if (missingElements[key] === null || missingElements[key] === undefined) {
            console.error(`Error: Critical UI element '${key}' not found.`);
            allElementsFound = false;
        }
    }

    if (!allElementsFound) {
        console.error('Initialization failed due to missing UI elements. Please check your HTML selectors. Details:', missingElements);
        // Możesz dodać alert dla użytkownika tutaj, ale w Canvas lepiej unikać alertów
        // alert('Błąd inicjalizacji aplikacji: Brakujące elementy UI. Sprawdź konsolę.');
        return; // Zakończ inicjalizację, jeśli brakuje elementów
    } else {
        console.log('All critical UI elements found.');
    }


    // 3. Check Supabase user session
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
        console.log('No active Supabase session found. Redirecting to login.html');
        window.location.href = 'login.html';
        return;
    }
    currentUser = session.user;
    console.log('Current authenticated user:', currentUser.id);

    // Handle offline status before page unload
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

    // 4. Load profiles and contacts
    await loadAllProfiles();
    await loadContacts();

    // 5. Initialize WebSocket connection
    initWebSocket();

    // 6. Set up message sending functionality
    setupSendMessage();

    // 7. Set default UI state on load
    logoScreen.classList.remove('hidden');
    chatArea.classList.remove('active'); // Chat area should be hidden by default
    messageInput.disabled = true;
    sendButton.disabled = true;

    // 8. Add general event listeners for the application UI
    backButton.addEventListener('click', () => {
        console.log('Back button clicked (UI)');
        resetChatView(); // Reset chat view
        // Send leave message to WebSocket if in a room
        if (socket && socket.readyState === WebSocket.OPEN && currentRoom) {
            socket.send(JSON.stringify({
                type: 'leave',
                name: currentUser.id,
                room: currentRoom
            }));
            console.log(`Sent leave message for room: ${currentRoom}`);
        }

        // Adjust UI visibility
        if (chatArea) {
            chatArea.classList.remove('active');
            logoScreen.classList.remove('hidden');
        }
        // Ensure sidebar is visible when back button is clicked on mobile
        if (window.matchMedia('(max-width: 768px)').matches) {
            if (sidebarWrapper) {
                sidebarWrapper.classList.remove('hide-on-mobile'); // Show sidebar on mobile
            }
            if (backButton) {
                backButton.classList.remove('show-on-mobile'); // Hide back button
            }
        }
    });

    // Main menu button (top right)
    menuButton.addEventListener('click', (event) => {
        event.stopPropagation(); // Prevent event bubbling
        dropdownMenu.classList.toggle('hidden'); // Toggle main dropdown

        // On mobile, also toggle sidebar visibility (if it's not the chat view)
        if (window.matchMedia('(max-width: 768px)').matches) {
            if (!chatArea.classList.contains('active')) { // Only toggle if not in chat view
                if (sidebarWrapper) {
                    sidebarWrapper.classList.toggle('hide-on-mobile');
                }
            }
        }
    });

    // Close dropdowns when clicking outside
    document.addEventListener('click', (event) => {
        if (!chatSettingsDropdown.classList.contains('hidden') && !chatSettingsButton.contains(event.target)) {
            chatSettingsDropdown.classList.add('hidden');
        }
        if (!dropdownMenu.classList.contains('hidden') && !menuButton.contains(event.target)) {
            dropdownMenu.classList.add('hidden');
        }
    });

    // Theme toggle functionality
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

    // Load saved theme on startup
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark') {
        document.body.classList.add('dark-mode');
        themeToggle.innerHTML = '<i class="fas fa-sun"></i> Tryb jasny';
    } else {
        document.body.classList.remove('dark-mode');
        themeToggle.innerHTML = '<i class="fas fa-moon"></i> Tryb ciemny';
    }

    // Logout functionality
    logoutButton.addEventListener('click', async () => {
        const { error } = await supabase.auth.signOut();
        if (error) {
            console.error('Logout error:', error.message);
        } else {
            console.log('Logged out successfully. Redirecting to login.html');
            window.location.href = 'login.html';
        }
    });

    // Navigation icons active state
    if (navIcons) {
        navIcons.forEach(icon => {
            icon.addEventListener('click', () => {
                navIcons.forEach(i => i.classList.remove('active')); // Deactivate all
                icon.classList.add('active'); // Activate clicked one
                console.log('Nav icon clicked:', icon.title || icon.dataset.tooltip);
            });
        });
    }

    // Setup chat specific settings dropdown
    setupChatSettingsDropdown();

    // TOOLTIP FUNCTIONALITY REMOVED: The CSS ::after pseudo-element already handles tooltips.
    // The JavaScript implementation was redundant and causing the unwanted tooltip at the bottom.
    // document.querySelectorAll('.main-nav-icons .nav-icon[data-tooltip]').forEach(element => {
    //     let tooltipEl;

    //     const showTooltip = (e) => {
    //         const text = e.target.dataset.tooltip;
    //         if (text) {
    //             if (!tooltipEl) {
    //                 tooltipEl = document.createElement('div');
    //                 tooltipEl.classList.add('simple-tooltip');
    //                 document.body.appendChild(tooltipEl);
    //             }
    //             tooltipEl.textContent = text;
    //             tooltipEl.style.display = 'block';

    //             const rect = e.target.getBoundingClientRect();
    //             tooltipEl.style.left = `${rect.right + 10}px`;
    //             tooltipEl.style.top = `${rect.top + (rect.height / 2) - (tooltipEl.offsetHeight / 2)}px`;
    //         }
    //     };

    //     const hideTooltip = () => {
    //         if (tooltipEl) {
    //             tooltipEl.style.display = 'none';
    //         }
    //     };

    //     element.addEventListener('mouseenter', showTooltip);
    //     element.addEventListener('mouseleave', hideTooltip);
    // });


    // Handle media query changes for responsive layout
    function handleMediaQueryChange(mq) {
        if (mq.matches) { // Mobile view (max-width: 768px)
            console.log("Mobile view activated. Adjusting initial visibility for mobile.");
            // Na mobile, domyślnie ukrywamy chatArea i pokazujemy logoScreen
            chatArea.classList.remove('active');
            logoScreen.classList.remove('hidden');

            // Prawy sidebar zawsze ukryty na mobile
            if (rightSidebarWrapper) {
                rightSidebarWrapper.style.display = 'none'; // Możemy zostawić to w JS dla pewności, lub przenieść do CSS
            }
            // Back button jest pokazywany dynamicznie w handleConversationClick, więc domyślnie ukryty
            if (backButton) {
                backButton.classList.remove('show-on-mobile');
            }
            // SidebarWrapper domyślnie pokazany na starcie mobile (ukryje się po kliknięciu konwersacji)
            if (sidebarWrapper) {
                sidebarWrapper.classList.remove('hide-on-mobile'); // Upewnij się, że nie jest ukryty na starcie
            }

        } else { // Desktop/Tablet view (min-width: 769px)
            console.log("Desktop/Tablet view activated. Adjusting initial visibility for desktop.");
            // Na desktopie zawsze pokazujemy sidebar i prawy sidebar, ukrywamy logoScreen
            if (sidebarWrapper) {
                sidebarWrapper.classList.remove('hide-on-mobile'); // Upewnij się, że jest widoczny na desktopie
            }
            if (rightSidebarWrapper) {
                rightSidebarWrapper.style.display = 'flex'; // Zapewnij widoczność prawego sidebara na desktopie
            }
            // Zostawiamy chatArea i logoScreen w ich domyślnych stanach (logoScreen widoczne, chatArea ukryte),
            // aż użytkownik wybierze konwersację.
            chatArea.classList.remove('active');
            logoScreen.classList.remove('hidden');

            if (backButton) {
                backButton.classList.remove('show-on-mobile'); // Back button niepotrzebny na desktopie
            }
        }
    }

    // Attach media query listener and call handler initially
    const mq = window.matchMedia('(max-width: 768px)');
    mq.addListener(handleMediaQueryChange);
    handleMediaQueryChange(mq); // Initial call to set correct layout

    console.log("Komunikator application initialized successfully.");
}

// Run the application after the DOM is fully loaded
document.addEventListener('DOMContentLoaded', initializeApp);
