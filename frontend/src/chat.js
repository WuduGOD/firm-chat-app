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
let allConversations = [];
let currentUser = null;
let currentChatUser = null;
let currentRoom = null;
let socket = null;
let reconnectAttempts = 0;
let typingTimeout;
let currentActiveConvoItem = null;

let onlineUsers = new Map();

// --- Funkcje pomocnicze ---

/**
 * Resets the chat view to its initial state.
 */
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
    if (typingStatusHeader) {
        typingStatusHeader.classList.add('hidden');
    }
    if (typingIndicatorMessages) {
        typingIndicatorMessages.classList.add('hidden');
    }

    currentChatUser = null;
    currentRoom = null;

    if (window.matchMedia('(min-width: 769px)').matches) {
        if (logoScreen) {
            logoScreen.classList.remove('hidden');
        }
    } else {
        if (logoScreen) {
            logoScreen.classList.add('hidden');
        }
    }

    if (chatArea) {
        chatArea.classList.remove('active');
    }
    if (chatAreaWrapper) {
        if (window.matchMedia('(max-width: 768px)').matches) {
            chatAreaWrapper.classList.remove('active-on-mobile');
        } else {
            chatAreaWrapper.style.display = 'flex';
            chatAreaWrapper.classList.remove('active-on-mobile');
        }
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
 * Uses database column names: content, sender_id, created_at, room_id.
 * Maps them to: text, username, inserted_at, room for frontend consistency.
 * @param {string} roomId - ID of the chat room.
 * @returns {Promise<Object|null>} The last message object (mapped) or null if no messages.
 */
async function getLastMessageForRoom(roomId) {
    const { data, error } = await supabase
        .from('messages')
        .select('content, sender_id, created_at, room_id')
        .eq('room_id', roomId)
        .order('created_at', { ascending: false })
        .limit(1);

    if (error) {
        console.error('Error fetching last message:', error);
        return null;
    }
    
    if (data && data.length > 0) {
        const msg = data[0];
        return {
            text: msg.content,
            username: msg.sender_id,
            inserted_at: msg.created_at,
            room: msg.room_id
        };
    }
    return null;
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
    console.log("[loadContacts] Loading contacts...");
    if (!currentUser || !currentUser.email) {
        console.error("[loadContacts] Current user is not defined, cannot load contacts.");
        return;
    }

    const { data: users, error } = await supabase.rpc('get_other_users', { current_email: currentUser.email });
    if (error) {
        console.error('[loadContacts] Error loading contacts:', error);
        return;
    }

    if (contactsListEl) {
        contactsListEl.innerHTML = '';
    } else {
        console.error("[loadContacts] contactsListEl element not found!");
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

        const avatarSrc = `https://i.pravatar.cc/150?img=${user.id.charCodeAt(0) % 70 + 1}`;

        let previewText = "Brak wiadomości";
        let timeText = "";

        if (lastMessage) {
            const senderName = String(lastMessage.username) === String(currentUser.id) ? "Ja" : (getUserLabelById(lastMessage.username) || lastMessage.username);
            previewText = `${senderName}: ${lastMessage.text}`;

            const lastMessageTime = new Date(lastMessage.inserted_at);
            if (isNaN(lastMessageTime.getTime())) {
                console.warn(`[loadContacts] Invalid Date for room ${roomId}. Raw inserted_at: ${lastMessage.inserted_at}`);
                timeText = "Invalid Date"; 
            } else {
                timeText = lastMessageTime.toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" });
            }
        }

        convoItem.innerHTML = `
            <img src="${avatarSrc}" alt="Avatar" class="avatar">
            <div class="contact-info">
                <span class="contact-name">${getUserLabelById(user.id) || user.email || 'Nieznany'}</span>
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
    console.log("[loadContacts] Contacts loaded and rendered.");
}

/**
 * Handles a click event on a conversation item.
 * Sets up the chat view for the selected user and joins the chat room.
 * @param {Object} user - The user object of the selected contact.
 * @param {HTMLElement} clickedConvoItemElement - The clicked list item element.
 */
async function handleConversationClick(user, clickedConvoItemElement) {
    console.log('[handleConversationClick] Conversation item clicked, user:', user);

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
    console.log(`[handleConversationClick] Starting chat with ${currentChatUser.username}, room ID: ${currentRoom}`);

    if (chatUserName && messageInput && sendButton && userStatusSpan) {
        chatUserName.textContent = currentChatUser.username;
        
        const isUserOnline = onlineUsers.get(String(user.id)) === true; 
        userStatusSpan.textContent = isUserOnline ? 'Online' : 'Offline';
        userStatusSpan.classList.toggle('online', isUserOnline); 
        userStatusSpan.classList.toggle('offline', !isUserOnline); 
        console.log(`[handleConversationClick] Initial status for active chat user ${currentChatUser.username}: ${isUserOnline ? 'Online' : 'Offline'}`);

        messageInput.disabled = false;
        sendButton.disabled = false;
        messageInput.focus();
    }

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
        console.log(`[handleConversationClick] Sent join message to WebSocket for room: ${currentRoom}`);
    } else {
        console.warn("[handleConversationClick] WebSocket not open, attempting to re-initialize and join on open.");
        initWebSocket();
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
        if (!currentRoom) {
            console.error("Cannot send message: currentRoom is not set.");
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
        
        const convoItemToMove = contactsListEl.querySelector(`.contact[data-room-id="${currentRoom}"]`);
        if (convoItemToMove && contactsListEl.firstChild !== convoItemToMove) {
            contactsListEl.prepend(convoItemToMove);
            console.log(`[Reorder] Moved conversation for room ${currentRoom} to top due to sent message.`);
        }

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
 * Adds a message to the chat view and updates the conversation preview in the list.
 * @param {Object} msg - The message object.
 */
async function addMessageToChat(msg) {
    console.log("[addMessageToChat] called for msg:", msg);

    let convoItemToUpdate = contactsListEl.querySelector(`.contact[data-room-id="${msg.room}"]`);
    
    if (!convoItemToUpdate) {
        console.warn(`[addMessageToChat] Conversation item for room ${msg.room} not found initially. Reloading contacts...`);
        await loadContacts();
        convoItemToUpdate = contactsListEl.querySelector(`.contact[data-room-id="${msg.room}"]`);
        if (!convoItemToUpdate) {
            console.error(`[addMessageToChat] Conversation item for room ${msg.room} still NOT found after reloading contacts. Cannot update UI.`);
            return;
        }
    }

    const previewEl = convoItemToUpdate.querySelector('.last-message');
    const timeEl = convoItemToUpdate.querySelector('.message-time');
    const unreadCountEl = convoItemToUpdate.querySelector('.unread-count');

    if (previewEl && timeEl) {
        const senderId = String(msg.username);
        const senderName = senderId === String(currentUser.id) ? "Ja" : (getUserLabelById(senderId) || senderId);
        const previewText = `${senderName}: ${msg.text}`; 
        const lastMessageTime = new Date(msg.inserted_at);
        if (isNaN(lastMessageTime.getTime())) {
            console.warn(`[addMessageToChat] Invalid Date found. Raw inserted_at: ${msg.inserted_at}`);
            timeEl.textContent = "Invalid Date";
        } else {
            timeEl.textContent = lastMessageTime.toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" });
        }
        previewEl.textContent = previewText; 
    }

    if (msg.room !== currentRoom && String(msg.username) !== String(currentUser.id)) {
        if (unreadCountEl) {
            let currentUnread = parseInt(unreadCountEl.textContent, 10);
            if (isNaN(currentUnread)) currentUnread = 0;
            unreadCountEl.textContent = currentUnread + 1;
            unreadCountEl.classList.remove('hidden');
        }
    } else if (String(msg.username) === String(currentUser.id) || msg.room === currentRoom) {
        if (unreadCountEl) {
            unreadCountEl.textContent = '0';
            unreadCountEl.classList.add('hidden');
        }
    }

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
        } else {
            console.error("messageContainer is null when trying to add message to active chat.");
        }
    }
}

/**
 * Updates the online/offline status indicator for a specific user.
 * @param {string} userId - The ID of the user whose status is being updated.
 * @param {boolean} isOnline - True if the user is online, false otherwise.
 */
function updateUserStatusIndicator(userId, isOnline) {
    onlineUsers.set(String(userId), isOnline);

    if (currentChatUser && userStatusSpan && String(currentChatUser.id) === String(userId)) {
        userStatusSpan.textContent = isOnline ? 'Online' : 'Offline';
        userStatusSpan.classList.toggle('online', isOnline);
        userStatusSpan.classList.toggle('offline', !isOnline);
    }

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
                        mockConvoItem.dataset.convoId = user.id;
                        mockConvoItem.dataset.email = userProfile.email;
                        mockConvoItem.dataset.roomId = getRoomName(String(currentUser.id), String(user.id));
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
        console.log(`${getUserLabelById(usernameId)} is typing...`);
    }
}

/**
 * Initializes the WebSocket connection for real-time communication.
 */
function initWebSocket() {
    // WebSocket URL from environment variable or default. For production, ensure VITE_CHAT_WS_URL is set.
    // In a Vite project, environment variables are exposed via `import.meta.env`.
    const wsUrl = import.meta.env.VITE_CHAT_WS_URL || "wss://firm-chat-app-backend.onrender.com";

    if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
        console.log("WebSocket connection already open or connecting. Skipping re-initialization.");
        return;
    }

    console.log(`Attempting to connect WebSocket to: ${wsUrl}`);
    socket = new WebSocket(wsUrl);

    socket.onopen = () => {
        console.log('WebSocket connected successfully.');
        reconnectAttempts = 0;
        if (currentUser) {
            socket.send(JSON.stringify({
                type: 'join',
                name: currentUser.id,
                room: 'global',
            }));
            console.log(`Sent global join message for user: ${currentUser.id}`);

            socket.send(JSON.stringify({
                type: 'status',
                user: currentUser.id,
                online: true
            }));
            console.log(`Sent 'online' status for user ${currentUser.id}`);
        } else {
            console.warn("WebSocket opened but currentUser is not set. Cannot join room or send status yet.");
        }
        loadActiveUsers();
    };

    socket.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            console.log('Received via WS:', data);

            switch (data.type) {
                case 'message':
                    addMessageToChat({
                        username: data.username,
                        text: data.text,
                        inserted_at: data.inserted_at,
                        room: data.room,
                    });
                    const convoItemToMove = contactsListEl.querySelector(`.contact[data-room-id="${data.room}"]`);
                    if (convoItemToMove && contactsListEl.firstChild !== convoItemToMove) {
                        contactsListEl.prepend(convoItemToMove);
                    }
                    break;
                case 'typing':
                    showTypingIndicator(data.username);
                    break;
                case 'history':
                    console.log("Loading message history for room:", data.room);
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
        } catch (e) {
            console.error("Error parsing or handling WebSocket message:", e, "Raw data:", event.data);
        }
    };

    socket.onclose = (event) => {
        console.log('WebSocket disconnected. Code:', event.code, 'Reason:', event.reason);
        if (event.code !== 1000) { // 1000 is normal closure
            console.log('WebSocket: Attempting to reconnect...');
            setTimeout(initWebSocket, Math.min(1000 * ++reconnectAttempts, 10000));
        }
    };

    socket.onerror = (error) => {
        console.error('WebSocket Error:', error);
        if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
            socket.close();
        }
    };
}

/**
 * Loads and displays the list of active users in the right sidebar.
 */
async function loadActiveUsers() {
    console.log("[loadActiveUsers] Loading active users for right sidebar and mobile...");
    if (!activeUsersListEl || !noActiveUsersText || !onlineUsersMobile) {
        console.error("[loadActiveUsers] Critical active user list elements not found, cannot load active users.");
        return;
    }

    if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: 'get_active_users' }));
        console.log("[loadActiveUsers] Requested active users list from WebSocket server.");
    } else {
        console.warn("[loadActiveUsers] WebSocket not open, cannot request active users.");
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
                    <span class="username">${getUserLabelById(user.id) || user.username || user.email || 'Nieznany'}</span>
                    <span class="status-dot online"></span>
                `;
            activeUsersListEl.appendChild(li);

            const divMobile = document.createElement('div');
            divMobile.classList.add('online-user-item-mobile');
            divMobile.dataset.userId = user.id;

            divMobile.innerHTML = `
                    <img src="${avatarSrc}" alt="Avatar" class="avatar">
                    <span class="username">${getUserLabelById(user.id)}</span>
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
        if (!dropdownMenu.classList.contains('hidden') && !menuButton.contains(event.target)) { // Also close main dropdown
            dropdownMenu.classList.add('hidden');
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
            console.log('Message theme changed to:', colorTheme);
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
                    messageContainer.classList.add(`${bgTheme}`);
                }
            }
            console.log('Chat background changed to:', bgTheme);
        });
    });

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

                    console.log('New nickname set:', newNickname, 'for user:', currentUser.id);
                    // Use a custom modal instead of alert
                    showCustomMessage(`Nickname '${newNickname}' has been set successfully.`, 'success');
                    await loadAllProfiles();
                    if (chatUserName && currentChatUser && String(currentUser.id) === String(currentChatUser.id)) {
                        chatUserName.textContent = newNickname;
                    }
                    await loadContacts();

                } catch (error) {
                    console.error('Error updating nickname:', error.message);
                    showCustomMessage(`Error setting nickname: ${error.message}`, 'error');
                }
            } else if (!currentUser) {
                showCustomMessage("Error: You are not logged in to set a nickname.", 'error');
            }
        });
    }

    const messageSearchInput = document.getElementById('messageSearchInput');
    const searchMessagesButton = document.getElementById('searchMessagesButton');
    if (messageSearchInput && searchMessagesButton) {
        searchMessagesButton.addEventListener('click', () => {
            const searchTerm = messageSearchInput.value.trim();
            console.log('Searching messages for:', searchTerm, '(functionality to be implemented)');
            showCustomMessage(`Searching messages for '${searchTerm}' (functionality to be implemented).`, 'info');
        });
    }
}

/**
 * Displays a custom message box instead of alert.
 * @param {string} message - The message to display.
 * @param {string} type - 'success', 'error', 'info'.
 */
function showCustomMessage(message, type = 'info') {
    const messageBox = document.createElement('div');
    messageBox.classList.add('custom-message-box', type);
    messageBox.textContent = message;
    document.body.appendChild(messageBox);

    // Fade out and remove after 3 seconds
    setTimeout(() => {
        messageBox.style.opacity = '0';
        setTimeout(() => {
            messageBox.remove();
        }, 500); // Wait for fade out transition
    }, 3000);
}


// --- Główna inicjalizacja aplikacji ---
/**
 * Main function to initialize the entire application.
 * Fetches DOM elements, checks user session, loads data, and sets up event listeners.
 */
async function initializeApp() {
    console.log("Initializing Komunikator application...");

    // 1. Get DOM element references
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

    // 2. Validate if all critical UI elements are found
    const criticalElements = {
        mainHeader, menuButton, dropdownMenu, themeToggle, logoutButton,
        container, sidebarWrapper, mainNavIcons, onlineUsersMobile,
        sidebarEl, searchInput, contactsListEl,
        chatAreaWrapper, logoScreen, chatArea,
        chatHeader, backButton, chatUserName, userStatusSpan,
        chatHeaderActions, chatSettingsButton, chatSettingsDropdown,
        typingStatusHeader, typingIndicatorMessages, messageContainer,
        chatFooter, attachButton, messageInput, emojiButton, sendButton,
        rightSidebarWrapper, rightSidebar, activeUsersListEl, noActiveUsersText
    };

    let allElementsFound = true;
    for (const key in criticalElements) {
        if (criticalElements[key] === null || criticalElements[key] === undefined) {
            console.error(`[initializeApp] ERROR: Critical UI element '${key}' not found. Please check your HTML.`, criticalElements[key]);
            allElementsFound = false;
        }
    }
    // Special check for NodeList `navIcons`
    if (!navIcons || navIcons.length === 0) {
        console.error(`[initializeApp] ERROR: 'navIcons' (NodeList) is empty or not found.`);
        allElementsFound = false;
    }

    if (!allElementsFound) {
        console.error('[initializeApp] Initialization failed due to missing critical UI elements. Aborting.');
        return;
    } else {
        console.log('[initializeApp] All critical UI elements found.');
    }

    // --- Global Error Handling ---
    window.addEventListener('error', (event) => {
        console.error("[Global Error] Uncaught error:", event.error || event.message, "at", event.filename, ":", event.lineno, ":", event.colno);
        // Optionally, display a user-friendly message, but avoid relentless popups
        // showCustomMessage(`Wystąpił błąd: ${event.message}`, 'error');
        // Prevent further default error handling if desired, but for debugging, let it continue.
        // event.preventDefault();
    });
    console.log("[initializeApp] Global error listener attached.");

    // 3. Check Supabase user session
    try {
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        
        if (sessionError) {
            console.error('[initializeApp] Error getting Supabase session:', sessionError.message);
            showCustomMessage(`Błąd uwierzytelniania: ${sessionError.message}. Przekierowuję do logowania.`, 'error');
            window.location.href = 'login.html';
            return;
        }

        if (!session?.user) {
            console.log('[initializeApp] No active Supabase session found. Redirecting to login.html');
            window.location.href = 'login.html';
            return;
        }
        
        currentUser = session.user;
        console.log('[initializeApp] Current authenticated user ID:', currentUser.id, 'Email:', currentUser.email);

    } catch (e) {
        console.error('[initializeApp] CRITICAL ERROR during Supabase session check:', e.message);
        showCustomMessage(`Krytyczny błąd podczas sprawdzania sesji: ${e.message}. Przekierowuję do logowania.`, 'error');
        window.location.href = 'login.html';
        return;
    }

    // Handle offline status before page unload
    window.addEventListener('beforeunload', () => {
        if (socket && socket.readyState === WebSocket.OPEN && currentUser) {
            console.log(`[beforeunload] Sending 'leave' signal for user ${currentUser.id}.`);
            // WebSocket messages are asynchronous. There's no guarantee this will send before page unloads.
            // A more robust solution might involve a synchronous beacon API or server-side session management with timeouts.
            try {
                socket.send(JSON.stringify({
                    type: 'leave',
                    name: currentUser.id,
                    room: currentRoom || 'global'
                }));
            } catch (sendError) {
                console.warn(`[beforeunload] Failed to send leave message via WebSocket: ${sendError.message}`);
            }
        }
    });
    console.log("[initializeApp] 'beforeunload' listener attached for WebSocket leave signal.");

    // 4. Load profiles and contacts
    console.log("[initializeApp] Loading user profiles and contacts...");
    await loadAllProfiles();
    await loadContacts();
    console.log("[initializeApp] User profiles and contacts loaded.");

    // 5. Initialize WebSocket connection
    console.log("[initializeApp] Initializing WebSocket connection...");
    initWebSocket();

    // 6. Set up message sending functionality
    console.log("[initializeApp] Setting up message sending functionality...");
    setupSendMessage();

    // 7. Set default UI state on load
    console.log("[initializeApp] Setting default UI state...");
    chatArea.classList.remove('active');
    messageInput.disabled = true;
    sendButton.disabled = true;

    // 8. Add general event listeners for the application UI
    console.log("[initializeApp] Attaching general UI event listeners...");
    backButton.addEventListener('click', () => {
        console.log('[backButton] Back button clicked (UI)');
        resetChatView();

        if (socket && socket.readyState === WebSocket.OPEN && currentRoom) {
            socket.send(JSON.stringify({
                type: 'leave',
                name: currentUser.id,
                room: currentRoom
            }));
            console.log(`[backButton] Sent leave message for room: ${currentRoom}`);
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
        // Send offline status before logging out
        if (socket && socket.readyState === WebSocket.OPEN && currentUser) {
            try {
                socket.send(JSON.stringify({
                    type: 'status',
                    user: currentUser.id,
                    online: false
                }));
                console.log(`[logoutButton] Sent 'offline' status for user ${currentUser.id} before logging out.`);
            } catch (sendError) {
                console.warn(`[logoutButton] Failed to send offline status: ${sendError.message}`);
            }
        }

        const { error } = await supabase.auth.signOut();
        if (error) {
            console.error('Logout error:', error.message);
            showCustomMessage(`Błąd wylogowania: ${error.message}`, 'error');
        } else {
            console.log('Logged out successfully. Redirecting to login.html');
            window.location.href = 'login.html';
        }
    });

    if (navIcons) {
        navIcons.forEach(icon => {
            icon.addEventListener('click', () => {
                navIcons.forEach(i => i.classList.remove('active'));
                icon.classList.add('active');
                console.log('Nav icon clicked:', icon.title || icon.dataset.tooltip);
            });
        });
    }

    setupChatSettingsDropdown();

    function handleMediaQueryChange(mq) {
        if (mq.matches) {
            console.log("[handleMediaQueryChange] Mobile view activated.");
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
            console.log("[handleMediaQueryChange] Desktop/Tablet view activated.");
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

    console.log("[initializeApp] Komunikator application initialized successfully.");
}

// Run the application after the DOM is fully loaded
document.addEventListener('DOMContentLoaded', initializeApp);

// --- CSS dla niestandardowego komunikatu ---
// Dodaj to do swojego pliku style.css lub do sekcji <style> w HTML
/*
.custom-message-box {
    position: fixed;
    top: 20px;
    left: 50%;
    transform: translateX(-50%);
    background-color: #333;
    color: white;
    padding: 10px 20px;
    border-radius: 8px;
    z-index: 1000;
    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
    opacity: 1;
    transition: opacity 0.5s ease-out;
    font-family: 'Inter', sans-serif;
}
.custom-message-box.success {
    background-color: #4CAF50;
}
.custom-message-box.error {
    background-color: #f44336;
}
.custom-message-box.info {
    background-color: #2196F3;
}
*/
