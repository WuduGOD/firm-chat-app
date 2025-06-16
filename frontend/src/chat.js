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

let onlineUsersMobile; // NOWA ZMIENNA: Kontener dla aktywnych użytkowników na mobile

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
let currentRoom = null; // Nazwa pokoju czatu, w którym klient aktualnie "słucha"
let socket = null; // Instancja WebSocket
let reconnectAttempts = 0; // Licznik prób ponownego połączenia
let typingTimeout; // Timeout dla wskaźnika pisania (dla obu wskaźników)
let currentActiveConvoItem = null; // Aktualnie wybrany element konwersacji na liście

// Mapa do przechowywania aktualnych statusów online (userID -> boolean)
let onlineUsers = new Map();


/**
 * Resets the chat view to its initial state.
 */
function resetChatView() {
    console.log("[resetChatView] Resetting chat view...");
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
    console.log("[resetChatView] currentChatUser and currentRoom reset to null.");

    // logoScreen is completely hidden on mobile, so no need to show it back on mobile
    if (window.matchMedia('(min-width: 769px)').matches) { // Only show logo screen on desktop
        if (logoScreen) {
            logoScreen.classList.remove('hidden'); // Show logo screen
        }
    } else { // On mobile, ensure it stays hidden
        if (logoScreen) {
            logoScreen.classList.add('hidden');
        }
    }

    if (chatArea) {
        chatArea.classList.remove('active'); // Deactivate chat area
    }
    if (chatAreaWrapper) { // Ensure chatAreaWrapper is also hidden on mobile reset
        if (window.matchMedia('(max-width: 768px)').matches) {
            chatAreaWrapper.classList.remove('active-on-mobile'); // Hide wrapper on mobile
        } else {
            chatAreaWrapper.style.display = 'flex'; // Ensure it's visible to contain logo screen
            chatAreaWrapper.classList.remove('active-on-mobile'); // Remove mobile-specific class
        }
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
        contactsListEl.innerHTML = ''; // Clear existing contacts
    } else {
        console.error("[loadContacts] contactsListEl element not found!");
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
    console.log("[loadContacts] Contacts loaded and rendered with last messages (and sorted).");
}

/**
 * Handles a click event on a conversation item.
 * Sets up the chat view for the selected user and joins the chat room.
 * @param {Object} user - The user object of the selected contact.
 * @param {HTMLElement} clickedConvoItemElement - The clicked list item element.
 */
async function handleConversationClick(user, clickedConvoItemElement) {
    console.log('[handleConversationClick] Conversation item clicked for user:', user.email);

    // Deactivate previously active conversation item
    if (currentActiveConvoItem) {
        currentActiveConvoItem.classList.remove('active');
    }
    clickedConvoItemElement.classList.add('active'); // Activate clicked item
    currentActiveConvoItem = clickedConvoItemElement;

    // KROK 1: Wyślij wiadomość 'leave' dla poprzedniego pokoju, jeśli istnieje i jest różny od nowego
    if (socket && socket.readyState === WebSocket.OPEN && currentRoom && currentRoom !== 'global') {
        socket.send(JSON.stringify({
            type: 'leave',
            name: currentUser.id,
            room: currentRoom // Opuszczamy poprzedni pokój
        }));
        console.log(`[handleConversationClick] Sent LEAVE message for room: ${currentRoom}`);
    }

    resetChatView(); // Reset the chat display before loading new conversation

    currentChatUser = {
        id: user.id,
        username: getUserLabelById(user.id) || user.email,
        email: user.email,
    };
    const newRoom = getRoomName(String(currentUser.id), String(currentChatUser.id));
    currentRoom = newRoom; // Ustaw globalną zmienną currentRoom
    console.log(`[handleConversationClick] New chat session initiated. User: ${currentChatUser.username}, Setting currentRoom to: ${currentRoom}`);

    if (chatUserName && messageInput && sendButton && userStatusSpan) {
        chatUserName.textContent = currentChatUser.username;
        
        const isUserOnline = onlineUsers.get(String(user.id)) === true; 
        userStatusSpan.textContent = isUserOnline ? 'Online' : 'Offline';
        userStatusSpan.classList.toggle('online', isUserOnline); 
        userStatusSpan.classList.toggle('offline', !isUserOnline); 
        console.log(`[handleConversationClick] Initial status for active chat user ${currentChatUser.username} (from onlineUsers map): ${isUserOnline ? 'Online' : 'Offline'}`);

        messageInput.disabled = false;
        sendButton.disabled = false;
        console.log(`[handleConversationClick] messageInput.disabled set to ${messageInput.disabled}, sendButton.disabled set to ${sendButton.disabled}`);

        messageInput.focus();
    } else {
        console.error("[handleConversationClick] Missing critical UI elements for chat area. Cannot enable input/button.");
    }

    // NEW LOGIC FOR MOBILE/DESKTOP VIEW SWITCHING
    if (window.matchMedia('(max-width: 768px)').matches) {
        // Mobile view: Hide sidebar, show chat area (full screen)
        if (sidebarWrapper) {
            sidebarWrapper.classList.add('hidden-on-mobile'); // Ukryj sidebar
        }
        if (chatAreaWrapper) {
            chatAreaWrapper.classList.add('active-on-mobile'); // Pokaż wrapper czatu
        }
        if (chatArea) {
            chatArea.classList.add('active'); // Aktywuj sam obszar czatu
        }
        if (backButton) {
            backButton.style.display = 'block'; // Pokaż przycisk Wstecz
        }
        if (logoScreen) {
            logoScreen.classList.add('hidden'); // Ensure logo screen is hidden on mobile
        }
    } else {
        // Desktop view: Sidebar remains visible, chat area shows normally
        if (sidebarWrapper) {
            sidebarWrapper.classList.remove('hidden-on-mobile'); // Upewnij się, że sidebar jest widoczny
        }
        if (chatAreaWrapper) {
            chatAreaWrapper.classList.remove('active-on-mobile'); // Usuń klasę mobilną
            chatAreaWrapper.style.display = 'flex'; // Upewnij się, że jest flex dla desktopu
        }
        if (chatArea) {
            chatArea.classList.add('active'); // Aktywuj obszar czatu
        }
        if (logoScreen) {
            logoScreen.classList.add('hidden'); // Ukryj logo screen, bo czat jest aktywny
        }
        if (backButton) {
            backButton.style.display = 'none'; // Ukryj przycisk Wstecz
        }
    }

    // Reset unread count for the selected conversation
    const unreadCount = clickedConvoItemElement.querySelector('.unread-count');
    if (unreadCount) {
        unreadCount.textContent = '0';
        unreadCount.classList.add('hidden');
    }

    // KROK 2: Dołącz do nowego pokoju na serwerze WebSocket
    if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({
            type: 'join',
            name: currentUser.id,
            room: currentRoom, // Teraz wysyłamy konkretny pokój czatu
        }));
        console.log(`[handleConversationClick] Sent JOIN message to WebSocket for room: ${currentRoom}`);
    } else {
        console.warn("[handleConversationClick] WebSocket not open. Attempting to re-initialize. JOIN message will be sent on 'open' event.");
        initWebSocket(); // Re-initialize WebSocket if not open, join on 'open' event
    }
}

/**
 * Sets up event listeners for sending messages.
 */
function setupSendMessage() {
    console.log("[setupSendMessage] Setting up message send event listeners.");
    if (!messageInput || !sendButton || !messageContainer) {
        console.error("[setupSendMessage] Message input or send button or messageContainer not found for setup. Cannot attach listeners.");
        return;
    }

    // Send typing indicator on input
    messageInput.addEventListener('input', () => {
        console.log("[setupSendMessage] Message input 'input' event detected.");
        if (currentRoom && socket && socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({
                type: 'typing',
                username: currentUser.id,
                room: currentRoom, // Wysyłamy do konkretnego pokoju
            }));
            console.log(`[setupSendMessage] Sent typing message for room: ${currentRoom}`);
        } else {
            console.warn(`[setupSendMessage] Cannot send typing status: currentRoom=${currentRoom}, socket status=${socket ? socket.readyState : 'N/A'}`);
        }
    });

    // Send message on button click
    sendButton.onclick = () => {
        console.log("[DEBUG: SEND BUTTON] Send button clicked or Enter pressed."); // Ten log musi się pojawić!
        
        const text = messageInput.value.trim();
        console.log(`[DEBUG: SEND BUTTON] Message text length: ${text.length}`);
        
        if (!text || !currentChatUser || !socket || socket.readyState !== WebSocket.OPEN) {
            console.warn("Cannot send message: check conditions below.");
            
            // Dodatkowe logi do zdiagnozowania warunku
            console.log(`Debug conditions: text=${!!text}, currentChatUser=${!!currentChatUser ? currentChatUser.id : 'null'}, socket=${!!socket}, socket.readyState=${socket ? socket.readyState : 'N/A'}`);

            if (!text) console.log("Reason: Message text is empty.");
            if (!currentChatUser) console.log("Reason: currentChatUser is not set (no chat selected).");
            if (!socket) console.log("Reason: WebSocket is null.");
            if (socket && socket.readyState !== WebSocket.OPEN) console.log(`Reason: WebSocket is not OPEN (current state: ${socket.readyState}).`);

            return;
        }
        if (!currentRoom) {
            console.error("Cannot send message: currentRoom is not set. Please select a contact first.");
            return;
        }

        const msgData = {
            type: 'message',
            username: currentUser.id,
            text,
            room: currentRoom, 
            inserted_at: new Date().toISOString()
        };

        console.log("[setupSendMessage] Sending message via WS:", msgData);
        socket.send(JSON.stringify(msgData)); 
        
        // Przenieś konwersację na górę dla wysłanych wiadomości
        const convoItemToMove = contactsListEl.querySelector(`.contact[data-room-id="${currentRoom}"]`);
        if (convoItemToMove && contactsListEl.firstChild !== convoItemToMove) {
            contactsListEl.prepend(convoItemToMove);
            console.log(`[Reorder] Moved conversation for room ${currentRoom} to top due to sent message.`);
        }

        messageInput.value = ''; 
        messageInput.focus(); 
    };

    // Send message on Enter key press
    messageInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault(); 
            console.log("[DEBUG: SEND BUTTON] Enter key pressed."); // Ten log też musi się pojawić!
            sendButton.click(); 
        }
    });
    console.log("[setupSendMessage] Message send event listeners attached.");
}

/**
 * Adds a message to the chat view and updates the conversation preview in the list.
 * This function will NO LONGER reorder the list automatically.
 * @param {Object} msg - The message object.
 */
async function addMessageToChat(msg) { 
    console.log(`[addMessageToChat] Processing message: sender=${msg.username}, room=${msg.room}. Global currentRoom (active chat): ${currentRoom}`);

    let convoItemToUpdate = contactsListEl.querySelector(`.contact[data-room-id="${msg.room}"]`);
    console.log("[addMessageToChat] convoItemToUpdate found:", !!convoItemToUpdate ? "Yes" : "No", `for room ${msg.room}`);

    if (!convoItemToUpdate) {
        console.warn(`[addMessageToChat] Conversation item for room ${msg.room} not found initially. Reloading contacts to sync list.`);
        await loadContacts(); 
        convoItemToUpdate = contactsListEl.querySelector(`.contact[data-room-id="${msg.room}"]`);
        console.log("[addMessageToChat] convoItemToUpdate found AFTER loadContacts:", !!convoItemToUpdate ? "Yes" : "No", `for room ${msg.room}`);
        if (!convoItemToUpdate) { 
            console.error(`[addMessageToChat] Conversation item for room ${msg.room} still NOT found after reloading contacts. Cannot update UI.`);
            return; 
        }
    }

    const previewEl = convoItemToUpdate.querySelector('.last-message');
    const timeEl = convoItemToUpdate.querySelector('.message-time');
    const unreadCountEl = convoItemToUpdate.querySelector('.unread-count'); 

    let previewText = "Brak wiadomości"; 

    if (previewEl && timeEl) {
        const senderId = String(msg.username);
        const senderName = senderId === String(currentUser.id) ? "Ja" : (getUserLabelById(senderId) || senderId);
        previewText = `${senderName}: ${msg.text}`; 
        const lastMessageTime = new Date(msg.inserted_at);
        timeText = lastMessageTime.toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" });
        console.log(`[addMessageToChat] Updated preview and time for room ${msg.room}. Preview: "${previewText}"`); 
        previewEl.textContent = previewText; 
    } else {
        console.warn(`[addMessageToChat] Could not find previewEl or timeEl for room ${msg.room}. Preview/time not updated.`);
    }

    // Increment unread count ONLY if the message is for a DIFFERENT room AND it's not from the current user (sent by self)
    if (msg.room !== currentRoom && String(msg.username) !== String(currentUser.id)) {
        if (unreadCountEl) {
            let currentUnread = parseInt(unreadCountEl.textContent, 10);
            if (isNaN(currentUnread)) currentUnread = 0;
            unreadCountEl.textContent = currentUnread + 1;
            unreadCountEl.classList.remove('hidden'); 
            console.log(`[addMessageToChat] Unread count for room ${msg.room} incremented to: ${unreadCountEl.textContent}`);
        } else {
            console.warn(`[addMessageToChat] Could not find unreadCountEl for room ${msg.room}. Unread count not updated.`);
        }
    } else if (String(msg.username) === String(currentUser.id) || msg.room === currentRoom) {
        console.log(`[addMessageToChat] Message is from current user (${String(msg.username) === String(currentUser.id)}) OR for the active room (${msg.room === currentRoom}). Ensuring unread count is hidden.`);
        if (unreadCountEl) {
            unreadCountEl.textContent = '0';
            unreadCountEl.classList.add('hidden');
        }
    } else {
        console.log("[addMessageToChat] Unhandled unread count scenario. room:", msg.room, "currentRoom:", currentRoom, "msg.username:", msg.username, "currentUser.id:", currentUser.id);
    }

    // Display message in the active chat only if it belongs to the current room
    console.log(`[addMessageToChat Display Check] Comparing msg.room (${msg.room}) with currentRoom (${currentRoom}). Match: ${msg.room === currentRoom}`);
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
            console.log(`[addMessageToChat] Message displayed in active chat for room: ${msg.room}`);
        } else {
            console.error("[addMessageToChat] messageContainer is null when trying to add message to active chat.");
        }
    } else {
        console.log(`[addMessageToChat] Message is NOT for the active room (${currentRoom}), not adding to chat view. (Sidebar updated for room: ${msg.room})`);
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
            console.log("[Status Update Debug] userId " + userId + " does not match currentChatUser.id " + currentChatUser.id + ". Header not updated.");
        }
    } else {
        console.log("[Status Update Debug] currentChatUser or userStatusSpan is null/undefined. Cannot update header.");
    }

    // Update status in the active users list (right sidebar - desktop)
    if (activeUsersListEl && noActiveUsersText) {
        const userListItem = activeUsersListEl.querySelector(`li[data-user-id="${userId}"]`);

        if (!isOnline && String(userId) !== String(currentUser.id)) {
            // If user goes offline and is not the current user, remove from list
            if (userListItem) {
                userListItem.remove();
                console.log(`Removed offline user ${getUserLabelById(userId)} from desktop active list.`);
            }
            // Check if the list is empty after removal and show "no active users" message
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
                console.log(`Added new online user to desktop active list: ${getUserLabelById(userId)}`);
            }
            noActiveUsersText.style.display = 'none';
            activeUsersListEl.style.display = 'block';
        }
    } else {
        console.error("activeUsersListEl or noActiveUsersText not found during status update.");
    }

    // Update status in the mobile online users list
    if (onlineUsersMobile) {
        const mobileUserItem = onlineUsersMobile.querySelector(`div[data-user-id="${userId}"]`);

        if (!isOnline && String(userId) !== String(currentUser.id)) {
            if (mobileUserItem) {
                mobileUserItem.remove();
                console.log(`Removed offline user ${getUserLabelById(userId)} from mobile active list.`);
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
                
                // Add click listener for mobile item
                div.addEventListener('click', async () => {
                    const userProfile = (await loadAllProfiles()).find(p => String(p.id) === String(userId));
                    if (userProfile) {
                        // Stwórz mockowy element clickedConvoItemElement
                        const mockConvoItem = document.createElement('li');
                        mockConvoItem.dataset.convoId = userProfile.id; // Corrected: use userProfile.id
                        mockConvoItem.dataset.email = userProfile.email;
                        mockConvoItem.dataset.roomId = getRoomName(String(currentUser.id), String(userProfile.id)); // Corrected: use userProfile.id
                        handleConversationClick(userProfile, mockConvoItem);
                    }
                });
                onlineUsersMobile.appendChild(div);
                console.log(`Added new online user to mobile active list: ${getUserLabelById(userId)}`);
            }
        }
    } else {
        console.error("onlineUsersMobile not found during status update.");
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
            typingStatusHeader.classList.remove('hidden'); 
            console.log(`[showTypingIndicator] Typing status header shown for ${getUserLabelById(usernameId)}`);
        }
        // Pokaż animowane kropki w obszarze wiadomości
        if (typingIndicatorMessages) {
            typingIndicatorMessages.classList.remove('hidden'); 
            console.log(`[showTypingIndicator] Typing indicator messages shown for ${getUserLabelById(usernameId)}`);
        }

        clearTimeout(typingTimeout); 
        typingTimeout = setTimeout(() => {
            if (typingStatusHeader) {
                typingStatusHeader.classList.add('hidden');
                console.log(`[showTypingIndicator] Typing status header hidden for ${getUserLabelById(usernameId)}`);
            }
            if (typingIndicatorMessages) {
                typingIndicatorMessages.classList.add('hidden');
                console.log(`[showTypingIndicator] Typing indicator messages hidden for ${getUserLabelById(usernameId)}`);
            }
        }, 3000); 
        console.log(`${getUserLabelById(usernameId)} is typing...`);
    } else {
        console.log(`[showTypingIndicator] Typing update for ${getUserLabelById(usernameId)}, but not current chat user. Ignoring.`);
    }
}

/**
 * Initializes the WebSocket connection for real-time communication.
 */
function initWebSocket() {
    const wsUrl = import.meta.env.VITE_CHAT_WS_URL || "wss://firm-chat-app-backend.onrender.com";

    if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
        console.log("[initWebSocket] WebSocket connection already open or connecting. Skipping new connection attempt.");
        return;
    }

    socket = new WebSocket(wsUrl);
    console.log(`[initWebSocket] Attempting to connect to WebSocket at: ${wsUrl}`);

    socket.onopen = () => {
        console.log('[initWebSocket] WebSocket connected successfully.');
        reconnectAttempts = 0; 
        if (currentUser) { 
            // ZAWSZE dołączamy do "global" pokoju po otwarciu WS
            socket.send(JSON.stringify({
                type: 'join',
                name: currentUser.id,
                room: 'global', // Dołącz do globalnego pokoju dla statusów i ogólnego bycia "online"
            }));
            console.log(`[initWebSocket] Sent global JOIN message for user: ${currentUser.id}`);

            // Wyślij status "online" po podłączeniu
            socket.send(JSON.stringify({
                type: 'status',
                user: currentUser.id,
                online: true
            }));
            console.log(`[initWebSocket] Sent 'online' status for user ${currentUser.id}`);

            // Jeśli użytkownik był w trakcie czatu i WebSocket się rozłączył/ponownie połączył, dołącz ponownie do ostatniego pokoju
            if (currentRoom && currentRoom !== 'global') {
                socket.send(JSON.stringify({
                    type: 'join',
                    name: currentUser.id,
                    room: currentRoom
                }));
                console.log(`[initWebSocket] Re-joining previous room (${currentRoom}) after reconnection.`);
            }
        } else {
            console.warn("[initWebSocket] WebSocket opened but currentUser is not set. Cannot join room yet.");
        }
        // Request active users list after successful connection
        loadActiveUsers();
    };

    socket.onmessage = (event) => {
        const data = JSON.parse(event.data);
        console.log(`[WS MESSAGE] Incoming message: type=${data.type}, room=${data.room}. Current client room (currentRoom global var): ${currentRoom}`);

        switch (data.type) {
            case 'message':
                addMessageToChat({
                    username: data.username,
                    text: data.text,
                    inserted_at: data.inserted_at,
                    room: data.room, 
                });
                // Przenieś konwersację na górę tylko dla nowo otrzymanych wiadomości
                if (String(data.username) !== String(currentUser.id)) { // Tylko jeśli wiadomość nie jest od nas samych
                    const convoItemToMove = contactsListEl.querySelector(`.contact[data-room-id="${data.room}"]`);
                    if (convoItemToMove && contactsListEl.firstChild !== convoItemToMove) {
                        contactsListEl.prepend(convoItemToMove);
                        console.log(`[Reorder] Moved conversation for room ${data.room} to top due to new received message.`);
                    }
                }
                break;
            case 'typing':
                console.log(`[WS MESSAGE] Received typing from ${data.username} in room ${data.room}.`);
                showTypingIndicator(data.username);
                break;
            case 'history':
                console.log(`[WS MESSAGE] Loading message history for room: ${data.room}. Global currentRoom: ${currentRoom}`);
                if (messageContainer) {
                    messageContainer.innerHTML = ''; // Clear current messages
                    data.messages.forEach((msg) => addMessageToChat(msg)); // Add historical messages
                    messageContainer.scrollTop = messageContainer.scrollHeight; // Scroll to bottom after history loads
                }
                break;
            case 'status':
                console.log(`[WS MESSAGE] Received status update for user ${data.user}: ${data.online ? 'online' : 'offline'}`);
                updateUserStatusIndicator(data.user, data.online);
                break;
            case 'active_users':
                console.log('[WS MESSAGE] Received initial active users list:', data.users);
                displayActiveUsers(data.users); 
                break;
            default:
                console.warn("[WS MESSAGE] Unknown WS message type:", data.type, data);
        }
    };

    socket.onclose = (event) => {
        console.log(`[initWebSocket] WebSocket disconnected. Code: ${event.code}, Reason: ${event.reason}`);
        if (event.code !== 1000) { 
            console.log('[initWebSocket] Attempting to reconnect...');
            setTimeout(initWebSocket, Math.min(1000 * ++reconnectAttempts, 10000)); 
        }
    };

    socket.onerror = (error) => {
        console.error('[initWebSocket] WebSocket Error:', error);
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
    if (!activeUsersListEl || !noActiveUsersText || !onlineUsersMobile) {
        console.error("[displayActiveUsers] Missing UI elements for displaying active users.");
        return;
    }

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
                const userProfile = (await loadAllProfiles()).find(p => String(p.id) === String(userId));
                if (userProfile) {
                    const mockConvoItem = document.createElement('li');
                    mockConvoItem.dataset.convoId = userProfile.id; 
                    mockConvoItem.dataset.email = userProfile.email;
                    mockConvoItem.dataset.roomId = getRoomName(String(currentUser.id), String(userProfile.id)); 
                    handleConversationClick(userProfile, mockConvoItem);
                }
            });
            onlineUsersMobile.appendChild(divMobile);

            onlineUsers.set(String(user.id), true); 
        });
    }
    console.log("[Status Update Debug] onlineUsers map after displayActiveUsers:", onlineUsers);
}

/**
 * Sets up the functionality for the chat settings dropdown menu.
 */
function setupChatSettingsDropdown() {
    console.log("[setupChatSettingsDropdown] Setting up chat settings dropdown.");
    if (!chatSettingsButton || !chatSettingsDropdown) {
        console.warn("[setupChatSettingsDropdown] Chat settings button or dropdown not found.");
        return;
    }

    chatSettingsButton.addEventListener('click', (event) => {
        event.stopPropagation(); 
        chatSettingsDropdown.classList.toggle('hidden');
        console.log(`[setupChatSettingsDropdown] Chat settings dropdown toggled. Hidden: ${chatSettingsDropdown.classList.contains('hidden')}`);
    });

    document.addEventListener('click', (event) => {
        if (!chatSettingsDropdown.classList.contains('hidden') && !chatSettingsButton.contains(event.target)) {
            chatSettingsDropdown.classList.add('hidden');
            console.log("[setupChatSettingsDropdown] Chat settings dropdown hidden due to outside click.");
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
            console.log('[setupChatSettingsDropdown] Message theme changed to:', colorTheme);
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
            console.log('[setupChatSettingsDropdown] Chat background changed to:', bgTheme);
        });
    });

    const nicknameInput = document.getElementById('nicknameInput');
    const setNicknameButton = document.getElementById('setNicknameButton');
    if (nicknameInput && setNicknameButton) {
        setNicknameButton.addEventListener('click', async () => {
            console.log("[setupChatSettingsDropdown] Set nickname button clicked.");
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
                    // Zamiast alert(), można dodać wizualny komunikat w UI
                    // alert(`Nickname '${newNickname}' has been set successfully.`); 
                    await loadAllProfiles(); 
                    if (chatUserName && currentChatUser && String(currentUser.id) === String(currentChatUser.id)) {
                        chatUserName.textContent = newNickname;
                    }
                    await loadContacts(); 

                } catch (error) {
                    console.error('Error updating nickname:', error.message);
                    // Zamiast alert(), można dodać wizualny komunikat w UI
                    // alert(`Error setting nickname: ${error.message}`);
                }
            } else if (!currentUser) {
                console.warn("[setupChatSettingsDropdown] Cannot set nickname: currentUser not logged in.");
                // alert("Error: You are not logged in to set a nickname.");
            } else {
                console.warn("[setupChatSettingsDropdown] Nickname input is empty.");
            }
        });
    }

    const messageSearchInput = document.getElementById('messageSearchInput');
    const searchMessagesButton = document.getElementById('searchMessagesButton');
    if (messageSearchInput && searchMessagesButton) {
        searchMessagesButton.addEventListener('click', () => {
            console.log("[setupChatSettingsDropdown] Search messages button clicked.");
            const searchTerm = messageSearchInput.value.trim();
            console.log('Searching messages for:', searchTerm, '(functionality to be implemented)');
            // alert(`Searching messages for '${searchTerm}' (functionality to be implemented).`);
        });
    }
}

/**
 * Main function to initialize the entire application.
 * Fetches DOM elements, checks user session, loads data, and sets up event listeners.
 */
async function initializeApp() {
    console.log("Initializing Komunikator application...");

    // Logowanie statusu elementów UI
    mainHeader = document.querySelector('.main-header'); console.log(`UI Element: mainHeader found: ${!!mainHeader}`);
    menuButton = document.getElementById('menuButton'); console.log(`UI Element: menuButton found: ${!!menuButton}`);
    dropdownMenu = document.getElementById('dropdownMenu'); console.log(`UI Element: dropdownMenu found: ${!!dropdownMenu}`);
    themeToggle = document.getElementById('themeToggle'); console.log(`UI Element: themeToggle found: ${!!themeToggle}`);
    logoutButton = document.getElementById('logoutButton'); console.log(`UI Element: logoutButton found: ${!!logoutButton}`);

    container = document.querySelector('.container'); console.log(`UI Element: container found: ${!!container}`);
    sidebarWrapper = document.querySelector('.sidebar-wrapper'); console.log(`UI Element: sidebarWrapper found: ${!!sidebarWrapper}`);
    mainNavIcons = document.querySelector('.main-nav-icons'); console.log(`UI Element: mainNavIcons found: ${!!mainNavIcons}`);
    navIcons = document.querySelectorAll('.nav-icon'); console.log(`UI Element: navIcons found: ${navIcons.length > 0}`);

    onlineUsersMobile = document.getElementById('onlineUsersMobile'); console.log(`UI Element: onlineUsersMobile found: ${!!onlineUsersMobile}`);

    sidebarEl = document.getElementById('sidebar'); console.log(`UI Element: sidebarEl found: ${!!sidebarEl}`);
    searchInput = sidebarEl ? sidebarEl.querySelector('.search-bar input[type="text"]') : null; console.log(`UI Element: searchInput found: ${!!searchInput}`);
    contactsListEl = document.getElementById('contactsList'); console.log(`UI Element: contactsListEl found: ${!!contactsListEl}`);

    chatAreaWrapper = document.querySelector('.chat-area-wrapper'); console.log(`UI Element: chatAreaWrapper found: ${!!chatAreaWrapper}`);
    logoScreen = document.getElementById('logoScreen'); console.log(`UI Element: logoScreen found: ${!!logoScreen}`);
    chatArea = document.getElementById('chatArea'); console.log(`UI Element: chatArea found: ${!!chatArea}`);

    chatHeader = document.querySelector('.chat-header'); console.log(`UI Element: chatHeader found: ${!!chatHeader}`);
    backButton = document.getElementById('backButton'); console.log(`UI Element: backButton found: ${!!backButton}`);
    chatUserName = document.getElementById('chatUserName'); console.log(`UI Element: chatUserName found: ${!!chatUserName}`);
    userStatusSpan = document.getElementById('userStatus'); console.log(`UI Element: userStatusSpan found: ${!!userStatusSpan}`);
    chatHeaderActions = chatHeader ? chatHeader.querySelector('.chat-header-actions') : null; console.log(`UI Element: chatHeaderActions found: ${!!chatHeaderActions}`);
    chatSettingsButton = document.getElementById('chatSettingsButton'); console.log(`UI Element: chatSettingsButton found: ${!!chatSettingsButton}`);
    chatSettingsDropdown = document.getElementById('chatSettingsDropdown'); console.log(`UI Element: chatSettingsDropdown found: ${!!chatSettingsDropdown}`);
    typingStatusHeader = document.getElementById('typingStatus'); console.log(`UI Element: typingStatusHeader found: ${!!typingStatusHeader}`);
    typingIndicatorMessages = document.getElementById('typingIndicator'); console.log(`UI Element: typingIndicatorMessages found: ${!!typingIndicatorMessages}`);

    messageContainer = document.getElementById('messageContainer'); console.log(`UI Element: messageContainer found: ${!!messageContainer}`);

    chatFooter = document.querySelector('.chat-footer'); console.log(`UI Element: chatFooter found: ${!!chatFooter}`);
    attachButton = chatFooter ? chatFooter.querySelector('.attach-button') : null; console.log(`UI Element: attachButton found: ${!!attachButton}`);
    messageInput = document.getElementById('messageInput'); console.log(`UI Element: messageInput found: ${!!messageInput}`);
    emojiButton = chatFooter ? chatFooter.querySelector('.emoji-button') : null; console.log(`UI Element: emojiButton found: ${!!emojiButton}`);
    sendButton = document.getElementById('sendButton'); console.log(`UI Element: sendButton found: ${!!sendButton}`);

    rightSidebarWrapper = document.querySelector('.right-sidebar-wrapper'); console.log(`UI Element: rightSidebarWrapper found: ${!!rightSidebarWrapper}`);
    rightSidebar = document.getElementById('rightSidebar'); console.log(`UI Element: rightSidebar found: ${!!rightSidebar}`);
    activeUsersListEl = document.getElementById('activeUsersList'); console.log(`UI Element: activeUsersListEl found: ${!!activeUsersListEl}`);
    noActiveUsersText = document.getElementById('noActiveUsersText'); console.log(`UI Element: noActiveUsersText found: ${!!noActiveUsersText}`);

    const missingElements = {
        mainHeader: mainHeader,
        menuButton: menuButton,
        dropdownMenu: dropdownMenu,
        themeToggle: themeToggle,
        logoutButton: logoutButton,
        container: container,
        sidebarWrapper: sidebarWrapper,
        mainNavIcons: mainNavIcons,
        navIconsLength: navIcons.length, 
        onlineUsersMobile: onlineUsersMobile, 
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
        return; 
    } else {
        console.log('All critical UI elements found. Proceeding with app initialization.');
    }


    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
        console.log('No active Supabase session found. Redirecting to login.html');
        window.location.href = 'login.html';
        return;
    }
    currentUser = session.user;
    console.log('Current authenticated user:', currentUser.id);

    window.addEventListener('beforeunload', () => {
        if (socket && socket.readyState === WebSocket.OPEN && currentUser) {
            console.log(`[App] Sending 'leave' signal for user ${currentUser.id} before unload.`);
            socket.send(JSON.stringify({
                type: 'leave',
                name: currentUser.id,
                room: currentRoom || 'global' 
            }));
        }
    });

    await loadAllProfiles();
    await loadContacts();

    initWebSocket();

    setupSendMessage(); // Ta funkcja jest wywoływana tutaj

    chatArea.classList.remove('active'); 
    messageInput.disabled = true;
    sendButton.disabled = true;
    console.log(`[initializeApp] Initially, messageInput.disabled=${messageInput.disabled}, sendButton.disabled=${sendButton.disabled}`);


    backButton.addEventListener('click', () => {
        console.log('[Back Button] Back button clicked (UI)');
        
        // Wysyłamy wiadomość 'leave' do serwera, informując go, że opuszczamy obecny pokój czatu
        if (socket && socket.readyState === WebSocket.OPEN && currentRoom && currentRoom !== 'global') {
            socket.send(JSON.stringify({
                type: 'leave',
                name: currentUser.id,
                room: currentRoom // Wyślij nazwę opuszczanego pokoju
            }));
            console.log(`[Back Button] Sent LEAVE message to WebSocket for room: ${currentRoom}`);
        }
        
        resetChatView(); 

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
        console.log(`[initializeApp] Menu dropdown toggled. Hidden: ${dropdownMenu.classList.contains('hidden')}`);
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
            console.log("[initializeApp] Switched to dark mode.");
        } else {
            localStorage.setItem('theme', 'light');
            themeToggle.innerHTML = '<i class="fas fa-moon"></i> Tryb ciemny';
            console.log("[initializeApp] Switched to light mode.");
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
            console.error('Logout error:', error.message);
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
            console.log("[MediaQuery] Mobile view activated. Adjusting initial visibility for mobile.");
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
            console.log("[MediaQuery] Desktop/Tablet view activated. Adjusting initial visibility for desktop.");
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

    console.log("Komunikator application initialized successfully.");
}

document.addEventListener('DOMContentLoaded', initializeApp);
