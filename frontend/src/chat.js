// Importy zależności
import { loadAllProfiles, getUserLabelById } from './profiles.js';
import { supabase } from './supabaseClient.js'; // Używamy istniejącego obiektu supabase

// Globalne zmienne UI i czatu
let mainHeader;
let menuButton;
let dropdownMenu;
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
let typingStatusHeader; // ID: typingStatus, Klasa: typing-status (status w nagłówku czatu)
let typingIndicatorMessages; // ID: typingIndicator (animowane kropki w obszarze wiadomości)

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
let currentRoom = null; // Nazwa pokoju czatu, w którym klient aktualnie "słucha"
let socket = null;
let reconnectAttempts = 0;
let typingTimeout;
let currentActiveConvoItem = null;

// ZMIANA: onlineUsers będzie teraz przechowywać obiekt z isOnline i lastSeen
let onlineUsers = new Map(); // userID -> { isOnline: boolean, lastSeen: string | null }

// Stan uprawnień do powiadomień
let notificationPermissionGranted = false;

// NOWE ZMIENNE DLA DŹWIEKU (Web Audio API)
let audioContext = null;
let audioContextInitiated = false; // Flaga do śledzenia, czy AudioContext został zainicjowany przez interakcję użytkownika

// NOWE ZMIENNE DLA TYTUŁU ZAKŁADKI PRZEGLĄDARKOWEJ
let baseDocumentTitle = "Komunikator";
// Mapa przechowująca nieprzeczytane wiadomości dla każdej konwersacji
// Klucz: roomId, Wartość: { unreadCount: number, lastSenderId: string }
let unreadConversationsInfo = new Map(); 

// --- Funkcje pomocnicze ---

/**
 * Formats a given date into a "time ago" string (e.g., "5 minut temu", "wczoraj o 10:30").
 * @param {Date} date - The date object to format.
 * @returns {string} The formatted time ago string.
 */
function formatTimeAgo(date) {
    const now = new Date();
    const seconds = Math.floor((now - date) / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (seconds < 60) {
        return `teraz`;
    } else if (minutes < 60) {
        return `${minutes} ${minutes === 1 ? 'minutę' : (minutes >= 2 && minutes <= 4 ? 'minuty' : 'minut')} temu`;
    } else if (hours < 24) {
        return `${hours} ${hours === 1 ? 'godzinę' : (hours >= 2 && hours <= 4 ? 'godziny' : 'godzin')} temu`;
    } else if (days === 1) {
        return `wczoraj o ${date.toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" })}`;
    } else if (days < 7) {
        return `${days} ${days === 1 ? 'dzień' : 'dni'} temu`;
    } else {
        return `${date.toLocaleDateString("pl-PL")} o ${date.toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" })}`;
    }
}


/**
 * Wyświetla niestandardowy komunikat w aplikacji.
 * Zastępuje alert().
 * @param {string} message - Treść komunikatu.
 * @param {'success'|'error'|'info'} type - Typ komunikatu (np. 'success', 'error', 'info').
 */
function showCustomMessage(message, type = 'info') {
    let messageBox = document.getElementById('customMessageBox');
    if (!messageBox) {
        messageBox = document.createElement('div');
        messageBox.id = 'customMessageBox';
        messageBox.className = 'custom-message-box hidden'; // Domyślnie ukryty
        document.body.appendChild(messageBox);
    }

    messageBox.textContent = message;
    messageBox.className = `custom-message-box ${type}`; // Ustaw klasę typu
    messageBox.classList.remove('hidden'); // Pokaż komunikat
    messageBox.style.opacity = '1'; // Ensure it's fully visible

    // Ukryj komunikat po 3 sekundach
    setTimeout(() => {
        messageBox.style.opacity = '0'; // Start fade out
        setTimeout(() => {
            messageBox.classList.add('hidden'); // Fully hide after fade
        }, 500); // Match CSS transition duration
    }, 3000);
}

/**
 * Zapewnia, że AudioContext jest aktywny. Jeśli nie, tworzy go
 * i wznawia (co może wymagać gestu użytkownika).
 */
function ensureAudioContext() {
    if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        console.log("[AudioContext] New AudioContext created.");
    }

    // Spróbuj wznowić AudioContext, jeśli jest zawieszony.
    // Jeśli to się nie uda (np. z powodu polityki autoplay), dźwięk po prostu nie zostanie odtworzony.
    if (audioContext.state === 'suspended') {
        audioContext.resume().then(() => {
            console.log('[AudioContext] AudioContext resumed successfully.');
            audioContextInitiated = true;
        }).catch(e => {
            console.error('[AudioContext] Failed to resume AudioContext:', e);
        });
    } else if (audioContext.state === 'running') {
        console.log('[AudioContext] AudioContext is already running.');
        audioContextInitiated = true;
    } else {
        console.log(`[AudioContext] AudioContext state: ${audioContext ? audioContext.state : 'null'}`);
    }
}


/**
 * Odtwarza prosty, krótki dźwięk powiadomienia (beep).
 * Korzysta z Web Audio API (AudioContext) do generowania dźwięku.
 */
function playNotificationSound() {
    console.log("[Notifications] Attempting to play notification sound...");
    
    try {
        ensureAudioContext(); // Zawsze upewnij się, że AudioContext jest aktywny

        if (!audioContext || audioContext.state !== 'running') {
            console.warn("[Notifications] AudioContext is not running. Cannot play sound yet.");
            return;
        }

        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);

        oscillator.type = 'sine'; // Fale sinusoidalne są czyste i przyjemne
        oscillator.frequency.setValueAtTime(440, audioContext.currentTime); // A4 note

        gainNode.gain.setValueAtTime(0.3, audioContext.currentTime); // Volume for notification (0.3 is moderate)
        gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.5); // Fade out quickly

        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.5); // Play for 0.5 seconds

        console.log("[Notifications] Notification sound started playing.");

    } catch (e) {
        console.error("Error playing notification sound:", e);
    }
}


/**
 * Próbuje odtworzyć cichy dźwięk, aby sprawdzić i ewentualnie odblokować politykę Autoplay.
 */
function checkAudioAutoplay() {
    console.log("[Autoplay Check] Attempting to check autoplay policy...");

    try {
        ensureAudioContext(); // Upewnij się, że AudioContext istnieje i jest w stanie suspended/running
    } catch (e) {
        console.error("Error during autoplay check:", e);
    }
}


/**
 * Fetches the user's profile based on their ID.
 * @param {string} userId - The ID of the user.
 * @returns {Promise<Object|null>} The user's profile object or null if not found.
 */
async function getUserProfile(userId) {
    if (!userId) {
        console.warn("Attempted to get user profile with null userId.");
        return null;
    }
    try {
        const { data, error } = await supabase
            .from('profiles')
            .select('username, avatar_url, status, last_seen')
            .eq('id', userId)
            .single();

        if (error) {
            if (error.code === 'PGRST116') { // No rows found
                return null;
            }
            throw error;
        }
        return data;
    } catch (error) {
        console.error('Error fetching user profile:', error.message);
        return null;
    }
}

/**
 * Displays an image preview when a file is attached.
 * @param {File} file - The file to preview.
 */
function displayImagePreview(file) {
    // Implementacja podglądu obrazu - nie zmieniono
}


/**
 * Request notification permission from the user.
 * This should be called as a result of a user gesture (e.g., button click)
 * for better compatibility, but can be attempted on load.
 */
async function requestNotificationPermission() {
    if (!("Notification" in window)) {
        console.warn("This browser does not support desktop notification");
        return;
    }

    if (Notification.permission === "granted") {
        notificationPermissionGranted = true;
        console.log("Notification permission already granted.");
        return;
    }

    if (Notification.permission === "denied") {
        console.warn("Notification permission denied by user.");
        notificationPermissionGranted = false;
        return;
    }

    try {
        const permission = await Notification.requestPermission();
        if (permission === "granted") {
            notificationPermissionGranted = true;
            console.log("Notification permission granted.");
        } else {
            notificationPermissionGranted = false;
            console.warn("Notification permission denied.");
        }
    } catch (error) {
        console.error("Error requesting notification permission:", error);
        notificationPermissionGranted = false;
    }
}

/**
 * Displays a desktop notification for a new message.
 * @param {string} senderName - The name of the sender.
 * @param {string} messageContent - The content of the message.
 * @param {string} roomId - The ID of the room the message belongs to.
 */
function showDesktopNotification(senderName, messageContent, roomId) {
    if (notificationPermissionGranted) {
        const options = {
            body: messageContent,
            icon: '/path/to/icon.png' // Consider adding a proper icon path
        };
        const notification = new Notification(`Nowa wiadomość od ${senderName}`, options);

        notification.onclick = function() {
            window.focus();
            // Optionally navigate to the chat room if needed
            // This would require more complex routing/state management
            console.log(`Notification clicked for room: ${roomId}`);
        };
    } else {
        console.log("Notification permission not granted. Cannot show desktop notification.");
    }
}

/**
 * Updates the document title to show unread message count.
 */
function updateDocumentTitle() {
    let totalUnreadConvos = 0;
    let singleUnreadSenderId = null; 

    // Iteruj po mapie, aby zliczyć nieprzeczytane konwersacje i znaleźć pojedynczego nadawcę
    unreadConversationsInfo.forEach((info, roomId) => {
        if (info.unreadCount > 0) {
            totalUnreadConvos++;
            if (totalUnreadConvos === 1) { // Pierwsza znaleziona nieprzeczytana konwersacja
                singleUnreadSenderId = info.lastSenderId;
            } else { // Znaleziono więcej niż jedną, więc nie ma pojedynczego nadawcy
                singleUnreadSenderId = null; 
            }
        }
    });

    let newTitle = baseDocumentTitle;
    if (totalUnreadConvos > 0) {
        if (totalUnreadConvos === 1 && singleUnreadSenderId) {
            const senderLabel = getUserLabelById(singleUnreadSenderId) || singleUnreadSenderId;
            newTitle = `(${totalUnreadConvos}) ${senderLabel} - ${baseDocumentTitle}`;
        } else {
            newTitle = `(${totalUnreadConvos}) ${baseDocumentTitle}`;
        }
    }
    document.title = newTitle;
    console.log(`[Document Title] Updated to: "${newTitle}"`);
}

/**
 * Marks a conversation as read.
 * @param {string} roomId - The ID of the room to mark as read.
 */
function markConversationAsRead(roomId) {
    if (unreadConversationsInfo.has(roomId)) {
        unreadConversationsInfo.delete(roomId);
        updateDocumentTitle();
        console.log(`Conversation ${roomId} marked as read.`);
    }
}

/**
 * Increases the unread count for a specific conversation and updates the title.
 * @param {string} roomId - The ID of the conversation room.
 * @param {string} lastSenderId - The ID of the last sender.
 */
function incrementUnreadCount(roomId, lastSenderId) {
    const currentInfo = unreadConversationsInfo.get(roomId) || { unreadCount: 0, lastSenderId: '' };
    currentInfo.unreadCount++;
    currentInfo.lastSenderId = lastSenderId;
    unreadConversationsInfo.set(roomId, currentInfo);
    updateDocumentTitle();
}


// --- Funkcje UI/Renderowania ---

/**
 * Renders a message in the chat area.
 * @param {Object} message - The message object.
 * @param {boolean} prepend - If true, prepends the message to the container.
 */
async function renderMessage(message, prepend = false) {
    const messageElement = document.createElement('div');
    messageElement.classList.add('message');

    // Sprawdź, czy wiadomość pochodzi od bieżącego użytkownika
    const isCurrentUserMessage = message.sender_id === currentUser.id;
    if (isCurrentUserMessage) {
        messageElement.classList.add('own-message');
    } else {
        messageElement.classList.add('other-message');
    }

    const usernameLabel = await getUserLabelById(message.sender_id);
    const time = new Date(message.created_at).toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" });

    messageElement.innerHTML = `
        <div class="message-bubble">
            <div class="message-header">
                <span class="username">${usernameLabel}</span>
                <span class="timestamp">${time}</span>
            </div>
            <div class="message-content">${message.content}</div>
        </div>
    `;

    if (prepend) {
        messageContainer.prepend(messageElement);
    } else {
        messageContainer.appendChild(messageElement);
    }
    
    if (!prepend) { // Scroll to bottom only for new messages, not for loaded history
        scrollToBottom();
    }
}

/**
 * Displays typing indicator.
 * @param {string} username - The username who is typing.
 */
function showTypingIndicator(username) {
    if (typingStatusHeader) {
        typingStatusHeader.textContent = `${username} pisze...`;
        typingStatusHeader.classList.remove('hidden');
    }
    if (typingIndicatorMessages) {
        typingIndicatorMessages.classList.remove('hidden');
        scrollToBottom();
    }
}

/**
 * Hides typing indicator.
 */
function hideTypingIndicator() {
    if (typingStatusHeader) {
        typingStatusHeader.textContent = '';
        typingStatusHeader.classList.add('hidden');
    }
    if (typingIndicatorMessages) {
        typingIndicatorMessages.classList.add('hidden');
    }
}

/**
 * Toggles the visibility of the dropdown menu.
 */
function toggleDropdownMenu() {
    dropdownMenu.classList.toggle('hidden');
    menuButton.setAttribute('aria-expanded', dropdownMenu.classList.contains('hidden') ? 'false' : 'true');
}

/**
 * Toggles the theme between light and dark.
 */
function toggleTheme() {
    document.body.classList.toggle('dark-theme');
    const isDark = document.body.classList.contains('dark-theme');
    themeToggle.innerHTML = isDark ? '<i class="fas fa-sun"></i> Tryb jasny' : '<i class="fas fa-moon"></i> Tryb ciemny';
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
}

/**
 * Applies the saved theme preference.
 */
function applySavedTheme() {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark') {
        document.body.classList.add('dark-theme');
        themeToggle.innerHTML = '<i class="fas fa-sun"></i> Tryb jasny';
    } else {
        document.body.classList.remove('dark-theme');
        themeToggle.innerHTML = '<i class="fas fa-moon"></i> Tryb ciemny';
    }
}

/**
 * Hides both sidebars for mobile view.
 */
function hideSidebarsMobile() {
    if (sidebarWrapper) {
        sidebarWrapper.classList.add('hidden-mobile');
        console.log("[hideSidebarsMobile] Sidebar wrapper hidden.");
    } else {
        console.warn("[hideSidebarsMobile] Sidebar wrapper not found.");
    }
    if (rightSidebarWrapper) {
        rightSidebarWrapper.classList.add('hidden-mobile');
        console.log("[hideSidebarsMobile] Right sidebar wrapper hidden.");
    } else {
        console.warn("[hideSidebarsMobile] Right sidebar wrapper not found.");
    }
}

/**
 * Shows the left sidebar for mobile view.
 */
function showLeftSidebarMobile() {
    if (sidebarWrapper) {
        sidebarWrapper.classList.remove('hidden-mobile');
        console.log("[showLeftSidebarMobile] Left sidebar wrapper shown.");
    } else {
        console.warn("[showLeftSidebarMobile] Left sidebar wrapper not found.");
    }
    if (chatAreaWrapper) {
        chatAreaWrapper.classList.add('hidden-mobile');
        console.log("[showLeftSidebarMobile] Chat area wrapper hidden.");
    } else {
        console.warn("[showLeftSidebarMobile] Chat area wrapper not found.");
    }
}

/**
 * Shows the chat area for mobile view.
 */
function showChatAreaMobile() {
    if (chatAreaWrapper) {
        chatAreaWrapper.classList.remove('hidden-mobile');
        console.log("[showChatAreaMobile] Chat area wrapper shown.");
    } else {
        console.warn("[showChatAreaMobile] Chat area wrapper not found.");
    }
    hideSidebarsMobile(); // Hide all sidebars when chat area is shown
}

/**
 * Handles media query changes to adjust layout for mobile/desktop.
 * @param {MediaQueryListEvent} mq - The media query list event.
 */
function handleMediaQueryChange(mq) {
    console.log(`[handleMediaQueryChange] Media query matched: ${mq.matches ? 'mobile' : 'desktop'}`);

    if (chatAreaWrapper && sidebarWrapper && rightSidebarWrapper && backButton) {
        if (mq.matches) { // Mobile view (max-width: 768px)
            if (!currentChatUser) {
                // Jeśli nie ma aktywnego czatu, pokaż lewy sidebar i ukryj obszar czatu
                showLeftSidebarMobile();
                chatAreaWrapper.classList.add('hidden-mobile');
                console.log("[handleMediaQueryChange] Mobile: No current chat user, showing left sidebar.");
            } else {
                // Jeśli jest aktywny czat, pokaż obszar czatu i ukryj sidebary
                showChatAreaMobile();
                sidebarWrapper.classList.add('hidden-mobile');
                rightSidebarWrapper.classList.add('hidden-mobile');
                console.log("[handleMediaQueryChange] Mobile: Current chat user, showing chat area.");
            }
            backButton.style.display = 'block'; // Pokaż przycisk Wstecz na mobile
        } else { // Desktop view
            sidebarWrapper.classList.remove('hidden-mobile');
            chatAreaWrapper.classList.remove('hidden-mobile');
            rightSidebarWrapper.classList.remove('hidden-mobile'); // Show right sidebar on desktop
            backButton.style.display = 'none'; // Ukryj przycisk Wstecz na desktopie
            console.log("[handleMediaQueryChange] Desktop: All sections visible, backButton hidden.");
        }
    } else {
        console.warn("[handleMediaQueryChange] One or more essential UI elements not found.");
    }
}


// --- Obsługa Supabase i WebSocket ---

/**
 * Initializes the WebSocket connection.
 */
async function initializeWebSocket() {
    const userId = currentUser.id;
    const WS_URL = `ws://localhost:3000?userId=${userId}`; // Upewnij się, że port jest poprawny

    if (socket) {
        console.log("Closing existing WebSocket connection.");
        socket.close();
    }

    socket = new WebSocket(WS_URL);

    socket.onopen = () => {
        console.log('WebSocket connected.');
        reconnectAttempts = 0;
        // Połącz się z domyślnym pokojem 'global' lub innym początkowym
        // sendMessage(JSON.stringify({ type: 'joinRoom', roomId: 'global' }));
        // Zaktualizuj status online po połączeniu
        updateUserStatus(currentUser.id, true);
    };

    socket.onmessage = async (event) => {
        const message = JSON.parse(event.data);
        console.log('Message from server:', message);

        switch (message.type) {
            case 'pastMessages':
                messageContainer.innerHTML = ''; // Clear previous messages
                // Render messages in correct order (oldest first)
                for (const msg of message.messages) {
                    await renderMessage(msg);
                }
                scrollToBottom(false); // Scroll without smooth animation for history
                break;
            case 'message':
                await renderMessage(message);
                // Play sound and show notification only if not current user's message
                // and if the message is NOT from the currently active room
                if (message.sender_id !== currentUser.id) {
                    playNotificationSound();
                    const senderProfile = await getUserProfile(message.sender_id);
                    const senderName = senderProfile ? senderProfile.username : 'Nieznany';

                    // Sprawdź, czy wiadomość jest z aktywnego pokoju
                    const isActiveRoomMessage = currentRoom === message.room_id;
                    const isChatAreaVisible = !chatAreaWrapper.classList.contains('hidden-mobile');
                    
                    if (!isActiveRoomMessage || !isChatAreaVisible) {
                        showDesktopNotification(senderName, message.content, message.room_id);
                        incrementUnreadCount(message.room_id, message.sender_id);
                    }
                }
                // Jeśli to wiadomość od kogoś innego w obecnym pokoju, ukryj wskaźnik pisania
                if (message.sender_id !== currentUser.id && message.room_id === currentRoom) {
                    hideTypingIndicator();
                }
                scrollToBottom();
                break;
            case 'typing':
                if (message.userId !== currentUser.id && message.roomId === currentRoom) {
                    const typingUserLabel = await getUserLabelById(message.userId);
                    showTypingIndicator(typingUserLabel);
                    clearTimeout(typingTimeout);
                    typingTimeout = setTimeout(hideTypingIndicator, 3000); // Hide after 3 seconds of no activity
                }
                break;
            case 'userStatus':
                if (message.userId) {
                    onlineUsers.set(message.userId, { isOnline: message.isOnline, lastSeen: message.lastSeen });
                    updateActiveUsersList();
                    updateContactStatuses(); // Aktualizuj statusy na liście kontaktów
                    if (currentChatUser && message.userId === currentChatUser.id) {
                        updateChatHeaderStatus(message.isOnline, message.lastSeen);
                    }
                }
                break;
            case 'friendRequest':
                // Przychodzące zaproszenie do znajomych
                showCustomMessage(`Otrzymano nowe zaproszenie od: ${message.fromEmail}`, "info");
                // Odśwież listę oczekujących zaproszeń
                loadPendingFriendRequests();
                // Zwiększ licznik powiadomień
                updateNotificationCount();
                break;
            case 'friendRequestAccepted':
                // Zaproszenie zaakceptowane
                showCustomMessage(`Użytkownik ${message.acceptedByEmail} zaakceptował Twoje zaproszenie!`, "success");
                // Odśwież listy konwersacji i znajomych
                await loadAllConversations();
                updateNotificationCount();
                break;
            case 'friendRequestRejected':
                // Zaproszenie odrzucone
                showCustomMessage(`Użytkownik ${message.rejectedByEmail} odrzucił Twoje zaproszenie.`, "info");
                // Odśwież listę oczekujących zaproszeń, jeśli ma to sens (może po prostu usunąć z listy wysłanych)
                loadPendingFriendRequests();
                updateNotificationCount();
                break;
            case 'newConversation':
                // Nowa konwersacja została utworzona, np. po zaakceptowaniu zaproszenia
                // Ponownie załaduj wszystkie konwersacje, aby uwzględnić nową
                await loadAllConversations();
                break;
            default:
                console.log('Unknown message type:', message.type);
        }
    };

    socket.onclose = (event) => {
        console.warn('WebSocket disconnected:', event.code, event.reason);
        updateUserStatus(currentUser.id, false); // Ustaw status na offline po rozłączeniu
        // Spróbuj ponownie połączyć po krótkim opóźnieniu
        if (reconnectAttempts < 5) { // Ogranicz liczbę prób ponownego łączenia
            setTimeout(initializeWebSocket, 1000 + (reconnectAttempts * 500)); // Stopniowo dłuższe opóźnienie
            reconnectAttempts++;
        } else {
            showCustomMessage("Utracono połączenie z serwerem. Spróbuj odświeżyć stronę.", "error");
        }
    };

    socket.onerror = (error) => {
        console.error('WebSocket error:', error);
        // showCustomMessage("Wystąpił błąd połączenia z serwerem. Sprawdź swoje połączenie internetowe.", "error");
    };
}


/**
 * Sends a message over the WebSocket connection.
 * @param {string} message - The message string to send.
 */
function sendMessage(message) {
    if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(message);
    } else {
        console.error('WebSocket is not connected. Message not sent.');
        showCustomMessage("Nie można wysłać wiadomości: brak połączenia z serwerem.", "error");
    }
}

/**
 * Handles sending a chat message.
 */
async function handleSendMessage() {
    const content = messageInput.value.trim();
    if (content && currentUser && currentRoom) {
        const messagePayload = {
            type: 'message',
            roomId: currentRoom,
            senderId: currentUser.id,
            content: content
        };
        sendMessage(JSON.stringify(messagePayload));
        messageInput.value = ''; // Clear input
        hideTypingIndicator(); // Hide typing indicator after sending message
    }
}

/**
 * Sends a typing indicator message.
 */
function sendTypingIndicator() {
    if (currentUser && currentRoom) {
        const typingPayload = {
            type: 'typing',
            roomId: currentRoom,
            userId: currentUser.id
        };
        sendMessage(JSON.stringify(typingPayload));
    }
}

/**
 * Updates the user's online/offline status in the database.
 * @param {string} userId - The ID of the user.
 * @param {boolean} isOnline - True if online, false if offline.
 */
async function updateUserStatus(userId, isOnline) {
    const updateData = { is_online: isOnline };
    if (!isOnline) {
        updateData.last_seen = new Date().toISOString();
    }
    try {
        const { error } = await supabase
            .from('profiles')
            .update(updateData)
            .eq('id', userId);

        if (error) {
            console.error('Error updating user status:', error.message);
        } else {
            console.log(`User ${userId} status updated to ${isOnline ? 'online' : 'offline'}.`);
            // Update the local map and UI for the current user's status
            onlineUsers.set(userId, { isOnline: isOnline, lastSeen: isOnline ? null : updateData.last_seen });
            updateActiveUsersList();
            updateContactStatuses(); // Refresh statuses on contact list
            if (currentChatUser && userId === currentChatUser.id) {
                updateChatHeaderStatus(isOnline, updateData.last_seen);
            }
        }
    } catch (e) {
        console.error("Caught error in updateUserStatus:", e);
    }
}

// --- Obsługa konwersacji i kontaktów ---

/**
 * Loads all conversations for the current user.
 */
async function loadAllConversations() {
    if (!currentUser) {
        console.warn("Cannot load conversations: currentUser is null.");
        return;
    }
    try {
        // Fetch direct messages
        const { data: dm_memberships, error: dm_error } = await supabase
            .from('room_participants')
            .select('room_id, rooms!inner(type, last_message_at)')
            .eq('user_id', currentUser.id)
            .eq('rooms.type', 'dm');

        if (dm_error) throw dm_error;

        const dm_room_ids = dm_memberships.map(m => m.room_id);

        const { data: dm_participants, error: dm_participants_error } = await supabase
            .from('room_participants')
            .select('room_id, user_id')
            .in('room_id', dm_room_ids)
            .neq('user_id', currentUser.id); // Exclude current user


        if (dm_participants_error) throw dm_participants_error;

        const dm_conversations = await Promise.all(dm_memberships.map(async (membership) => {
            const other_participant = dm_participants.find(p => p.room_id === membership.room_id);
            if (other_participant) {
                const profile = await getUserProfile(other_participant.user_id);
                // Fetch last message for the DM room
                const { data: last_message, error: last_message_error } = await supabase
                    .from('messages')
                    .select('content, created_at')
                    .eq('room_id', membership.room_id)
                    .order('created_at', { ascending: false })
                    .limit(1)
                    .single();

                if (last_message_error && last_message_error.code !== 'PGRST116') { // Ignore "no rows found"
                    console.error('Error fetching last message for DM:', last_message_error);
                }

                return {
                    id: membership.room_id,
                    type: 'dm',
                    name: profile ? profile.username : 'Nieznany użytkownik',
                    // name: (await getUserProfile(other_participant.user_id)).username, // This is inefficient, fetch once
                    lastMessage: last_message ? last_message.content : 'Brak wiadomości',
                    lastMessageAt: last_message ? new Date(last_message.created_at) : (membership.rooms ? new Date(membership.rooms.last_message_at) : null),
                    otherUserId: other_participant.user_id,
                    profile: profile // Store the full profile for easier access
                };
            }
            return null;
        }));

        // Filter out nulls if some participants were not found
        allConversations = dm_conversations.filter(c => c !== null);

        // Sort conversations by last message time
        allConversations.sort((a, b) => {
            const dateA = a.lastMessageAt ? a.lastMessageAt.getTime() : 0;
            const dateB = b.lastMessageAt ? b.lastMessageAt.getTime() : 0;
            return dateB - dateA; // Newest first
        });

        renderConversationsList();
        console.log("All conversations loaded:", allConversations);

    } catch (error) {
        console.error('Error loading conversations:', error.message);
        showCustomMessage("Nie udało się załadować konwersacji.", "error");
    }
}


/**
 * Renders the list of conversations in the sidebar.
 */
async function renderConversationsList() {
    contactsListEl.innerHTML = ''; // Clear current list

    if (allConversations.length === 0) {
        contactsListEl.innerHTML = '<li class="no-conversations">Brak konwersacji. Dodaj znajomego!</li>';
        return;
    }

    // Sort conversations by last message time (newest first)
    // This assumes allConversations is already populated and sorted by loadAllConversations
    const sortedConversations = [...allConversations].sort((a, b) => {
        const dateA = a.lastMessageAt ? a.lastMessageAt.getTime() : 0;
        const dateB = b.lastMessageAt ? b.lastMessageAt.getTime() : 0;
        return dateB - dateA;
    });


    for (const convo of sortedConversations) {
        const convoItem = document.createElement('li');
        convoItem.classList.add('conversation-item');
        convoItem.dataset.roomId = convo.id;
        convoItem.dataset.otherUserId = convo.otherUserId; // Store other user ID for DMs

        // Check online status
        const onlineInfo = onlineUsers.get(convo.otherUserId);
        const isOnline = onlineInfo ? onlineInfo.isOnline : false;
        const lastSeen = onlineInfo ? onlineInfo.lastSeen : null;

        let statusText = '';
        let statusClass = 'status-indicator';
        if (isOnline) {
            statusText = 'Online';
            statusClass += ' online';
        } else {
            statusText = lastSeen ? `Widziano: ${formatTimeAgo(new Date(lastSeen))}` : 'Offline';
            statusClass += ' offline';
        }
        
        // Unread messages indicator
        const unreadInfo = unreadConversationsInfo.get(convo.id);
        const unreadCount = unreadInfo ? unreadInfo.unreadCount : 0;
        const unreadClass = unreadCount > 0 ? 'has-unread' : '';
        const unreadBubble = unreadCount > 0 ? `<span class="unread-bubble">${unreadCount}</span>` : '';

        convoItem.innerHTML = `
            <div class="convo-info">
                <span class="convo-name ${unreadClass}">${convo.name}</span>
                <span class="convo-last-message">${convo.lastMessage}</span>
            </div>
            <div class="convo-meta">
                <span class="${statusClass}"></span>
                ${unreadBubble}
                <span class="convo-time">${convo.lastMessageAt ? formatTimeAgo(convo.lastMessageAt) : ''}</span>
            </div>
        `;
        contactsListEl.appendChild(convoItem);

        convoItem.addEventListener('click', async () => {
            // Remove 'active' class from previously active item
            if (currentActiveConvoItem) {
                currentActiveConvoItem.classList.remove('active');
            }
            convoItem.classList.add('active'); // Add 'active' class to clicked item
            currentActiveConvoItem = convoItem; // Update currently active item

            await selectConversation(convo.id, convo.otherUserId, convo.name, convo.profile);
            markConversationAsRead(convo.id); // Mark as read when opened
            if (window.matchMedia('(max-width: 768px)').matches) {
                showChatAreaMobile(); // For mobile, show chat area
            }
        });

        // Highlight if it's the currently active chat
        if (currentRoom === convo.id) {
            convoItem.classList.add('active');
            currentActiveConvoItem = convoItem;
        }
    }
}

/**
 * Updates the online/offline statuses shown in the contacts list.
 */
async function updateContactStatuses() {
    document.querySelectorAll('.conversation-item').forEach(async convoItem => {
        const otherUserId = convoItem.dataset.otherUserId;
        if (otherUserId) {
            const onlineInfo = onlineUsers.get(otherUserId);
            const isOnline = onlineInfo ? onlineInfo.isOnline : false;
            const lastSeen = onlineInfo ? onlineInfo.lastSeen : null;

            const statusIndicator = convoItem.querySelector('.status-indicator');
            if (statusIndicator) {
                statusIndicator.classList.toggle('online', isOnline);
                statusIndicator.classList.toggle('offline', !isOnline);
            }
            
            // Update last seen text if offline
            const convoTimeSpan = convoItem.querySelector('.convo-time');
            if (convoTimeSpan) {
                 if (isOnline) {
                    convoTimeSpan.textContent = 'Online'; // Or clear it if preferred
                } else {
                    convoTimeSpan.textContent = lastSeen ? `Widziano: ${formatTimeAgo(new Date(lastSeen))}` : 'Offline';
                }
            }

        }
    });
}


/**
 * Selects a conversation to display in the chat area.
 * @param {string} roomId - The ID of the chat room.
 * @param {string} otherUserId - The ID of the other user in DM.
 * @param {string} chatName - The name of the chat (e.g., username or group name).
 * @param {Object} otherUserProfile - The profile object of the other user.
 */
async function selectConversation(roomId, otherUserId, chatName, otherUserProfile) {
    if (!currentUser) {
        showCustomMessage("Musisz być zalogowany, aby wybrać konwersację.", "error");
        return;
    }

    currentRoom = roomId;
    currentChatUser = { id: otherUserId, username: chatName, profile: otherUserProfile }; // Store the full profile

    logoScreen.classList.add('hidden');
    chatArea.classList.remove('hidden');
    messageInput.disabled = false;
    sendButton.disabled = false;

    chatUserName.textContent = chatName;
    updateChatHeaderStatus(onlineUsers.get(otherUserId)?.isOnline || false, onlineUsers.get(otherUserId)?.lastSeen || null);

    messageContainer.innerHTML = ''; // Clear existing messages
    
    // Request past messages for this room
    sendMessage(JSON.stringify({ type: 'getPastMessages', roomId: currentRoom }));

    // Scroll to bottom after messages are loaded (handled by onmessage 'pastMessages')

    // Subscribe to real-time changes for this room
    // Note: Supabase Realtime for messages is handled via WebSocket server for now.
    // This client only subscribes to presence and profiles.
}

/**
 * Updates the user status displayed in the chat header.
 * @param {boolean} isOnline - Whether the user is online.
 * @param {string|null} lastSeen - Last seen timestamp if offline.
 */
function updateChatHeaderStatus(isOnline, lastSeen) {
    if (isOnline) {
        userStatusSpan.textContent = 'Online';
        userStatusSpan.className = 'status online';
    } else {
        userStatusSpan.textContent = lastSeen ? `Ostatnio: ${formatTimeAgo(new Date(lastSeen))}` : 'Offline';
        userStatusSpan.className = 'status offline';
    }
}

/**
 * Populates and updates the list of currently active users in the right sidebar.
 */
async function updateActiveUsersList() {
    activeUsersListEl.innerHTML = ''; // Clear previous list

    let hasActiveUsers = false;

    // Filter only currently online users
    const onlineUserIds = Array.from(onlineUsers.entries())
        .filter(([, info]) => info.isOnline)
        .map(([userId]) => userId)
        .filter(userId => userId !== currentUser.id); // Exclude current user

    if (onlineUserIds.length > 0) {
        hasActiveUsers = true;
        for (const userId of onlineUserIds) {
            const profile = await getUserProfile(userId);
            if (profile) {
                const listItem = document.createElement('li');
                listItem.classList.add('active-user-item');
                listItem.dataset.userId = userId;

                let avatarSrc = `https://i.pravatar.cc/150?img=${userId.charCodeAt(0) % 70 + 1}`;

                listItem.innerHTML = `
                    <img src="${avatarSrc}" alt="Avatar" class="avatar">
                    <span class="username">${profile.username}</span>
                    <span class="status-dot online"></span>
                `;
                activeUsersListEl.appendChild(listItem);

                listItem.addEventListener('click', async () => {
                    // Try to find an existing DM conversation
                    const existingConvo = allConversations.find(convo =>
                        convo.type === 'dm' && convo.otherUserId === userId
                    );

                    if (existingConvo) {
                        // Select existing conversation
                        await selectConversation(existingConvo.id, existingConvo.otherUserId, existingConvo.name, existingConvo.profile);
                        markConversationAsRead(existingConvo.id);
                    } else {
                        // Create a new DM room if it doesn't exist
                        const { data: newRoom, error: roomError } = await supabase
                            .from('rooms')
                            .insert({ type: 'dm' })
                            .select()
                            .single();

                        if (roomError) {
                            console.error('Error creating new room:', roomError);
                            showCustomMessage("Nie udało się utworzyć nowej konwersacji.", "error");
                            return;
                        }

                        // Add current user to room_participants
                        const { error: participant1Error } = await supabase
                            .from('room_participants')
                            .insert({ room_id: newRoom.id, user_id: currentUser.id });

                        if (participant1Error) {
                            console.error('Error adding current user to room participants:', participant1Error);
                            showCustomMessage("Wystąpił błąd podczas dołączania do konwersacji.", "error");
                            return;
                        }

                        // Add other user to room_participants
                        const { error: participant2Error } = await supabase
                            .from('room_participants')
                            .insert({ room_id: newRoom.id, user_id: userId });

                        if (participant2Error) {
                            console.error('Error adding other user to room participants:', participant2Error);
                            showCustomMessage("Wystąpił błąd podczas dołączania drugiego użytkownika do konwersacji.", "error");
                            return;
                        }

                        // Reload all conversations to include the new one
                        await loadAllConversations();
                        // Select the newly created conversation
                        await selectConversation(newRoom.id, userId, profile.username, profile);
                        showCustomMessage(`Rozpoczęto nową konwersację z ${profile.username}`, "success");
                    }
                     // For mobile, show chat area after selecting a user from active users
                     if (window.matchMedia('(max-width: 768px)').matches) {
                        showChatAreaMobile();
                    }
                });
            }
        }
    }

    if (!hasActiveUsers) {
        noActiveUsersText.style.display = 'block';
    } else {
        noActiveUsersText.style.display = 'none';
    }
}

// --- Obsługa znajomych i zaproszeń ---

/**
 * Loads pending friend requests for the current user.
 */
async function loadPendingFriendRequests() {
    if (!currentUser) return;

    try {
        const { data, error } = await supabase
            .from('friend_requests')
            .select('id, from_user_id, profiles!from_user_id(email)') // Select email from profiles table
            .eq('to_user_id', currentUser.id)
            .eq('status', 'pending');

        if (error) throw error;

        const pendingRequestsList = document.getElementById('pendingFriendRequestsList');
        const noPendingRequestsText = document.getElementById('noPendingRequestsText');
        pendingRequestsList.innerHTML = ''; // Clear previous list

        if (data.length === 0) {
            noPendingRequestsText.classList.remove('hidden');
        } else {
            noPendingRequestsText.classList.add('hidden');
            data.forEach(request => {
                const listItem = document.createElement('li');
                listItem.innerHTML = `
                    <span>Zaproszenie od: ${request.profiles.email}</span>
                    <div class="request-actions">
                        <button class="accept-request" data-request-id="${request.id}" data-from-user-id="${request.from_user_id}">Akceptuj</button>
                        <button class="reject-request" data-request-id="${request.id}">Odrzuć</button>
                    </div>
                `;
                pendingRequestsList.appendChild(listItem);
            });

            // Add event listeners for accept/reject buttons
            pendingRequestsList.querySelectorAll('.accept-request').forEach(button => {
                button.addEventListener('click', async (event) => {
                    const requestId = event.target.dataset.requestId;
                    const fromUserId = event.target.dataset.fromUserId;
                    await handleFriendRequestResponse(requestId, fromUserId, 'accepted');
                });
            });

            pendingRequestsList.querySelectorAll('.reject-request').forEach(button => {
                button.addEventListener('click', async (event) => {
                    const requestId = event.target.dataset.requestId;
                    await handleFriendRequestResponse(requestId, null, 'rejected');
                });
            });
        }
    } catch (error) {
        console.error('Error loading pending friend requests:', error.message);
        showCustomMessage("Nie udało się załadować zaproszeń do znajomych.", "error");
    }
}

/**
 * Handles accepting or rejecting a friend request.
 * @param {string} requestId - The ID of the friend request.
 * @param {string} fromUserId - The ID of the user who sent the request (only for accept).
 * @param {string} status - 'accepted' or 'rejected'.
 */
async function handleFriendRequestResponse(requestId, fromUserId, status) {
    try {
        const { error } = await supabase
            .from('friend_requests')
            .update({ status: status })
            .eq('id', requestId);

        if (error) throw error;

        showCustomMessage(`Zaproszenie ${status === 'accepted' ? 'zaakceptowane' : 'odrzucone'}.`, "success");

        if (status === 'accepted' && fromUserId) {
            // Create a new DM room for the accepted friendship
            const { data: newRoom, error: roomError } = await supabase
                .from('rooms')
                .insert({ type: 'dm' })
                .select()
                .single();

            if (roomError) {
                console.error('Error creating new room on friend accept:', roomError);
                showCustomMessage("Nie udało się utworzyć pokoju czatu dla nowego znajomego.", "error");
                return;
            }

            // Add both users to room_participants
            const { error: participant1Error } = await supabase
                .from('room_participants')
                .insert({ room_id: newRoom.id, user_id: currentUser.id });
            const { error: participant2Error } = await supabase
                .from('room_participants')
                .insert({ room_id: newRoom.id, user_id: fromUserId });

            if (participant1Error || participant2Error) {
                console.error('Error adding participants to new room:', participant1Error || participant2Error);
                showCustomMessage("Wystąpił błąd podczas dodawania uczestników do pokoju czatu.", "error");
                return;
            }

            // Notify sender via WebSocket that request was accepted and new conversation created
            sendMessage(JSON.stringify({
                type: 'friendRequestAccepted',
                fromUserId: currentUser.id,
                acceptedByEmail: currentUser.email, // Or username
                newRoomId: newRoom.id,
                otherUserId: fromUserId
            }));
            // Also notify that a new conversation has been created
            sendMessage(JSON.stringify({
                type: 'newConversation',
                userId: fromUserId // Notify the other user to reload conversations
            }));
        } else if (status === 'rejected') {
             sendMessage(JSON.stringify({
                type: 'friendRequestRejected',
                fromUserId: currentUser.id, // The current user rejected
                rejectedByEmail: currentUser.email,
                toUserId: fromUserId // The user who sent the request (fromUserId is null for reject, but this is the intent)
            }));
        }

        loadPendingFriendRequests(); // Refresh the list
        await loadAllConversations(); // Reload conversations to show the new one
        updateNotificationCount(); // Update notification bell
    } catch (error) {
        console.error('Error responding to friend request:', error.message);
        showCustomMessage("Nie udało się zaktualizować statusu zaproszenia.", "error");
    }
}

/**
 * Handles sending a new friend request.
 */
async function handleSendFriendRequest() {
    const friendEmailInput = document.getElementById('friendEmailInput');
    const friendEmail = friendEmailInput.value.trim();
    const sendRequestStatus = document.getElementById('sendRequestStatus');

    if (!friendEmail) {
        sendRequestStatus.textContent = "Adres e-mail nie może być pusty.";
        sendRequestStatus.style.color = 'red';
        return;
    }
    if (currentUser.email === friendEmail) {
        sendRequestStatus.textContent = "Nie możesz wysłać zaproszenia do samego siebie.";
        sendRequestStatus.style.color = 'orange';
        return;
    }

    try {
        // 1. Find the target user's ID by email
        const { data: targetUser, error: targetError } = await supabase
            .from('profiles')
            .select('id')
            .eq('email', friendEmail)
            .single();

        if (targetError) {
            if (targetError.code === 'PGRST116') { // No rows found
                sendRequestStatus.textContent = "Użytkownik o podanym adresie e-mail nie istnieje.";
                sendRequestStatus.style.color = 'red';
                return;
            }
            throw targetError;
        }

        const toUserId = targetUser.id;

        // 2. Check if a request already exists (pending, accepted, or rejected)
        const { data: existingRequests, error: existingError } = await supabase
            .from('friend_requests')
            .select('*')
            .or(`(from_user_id.eq.${currentUser.id},to_user_id.eq.${toUserId}),(from_user_id.eq.${toUserId},to_user_id.eq.${currentUser.id})`);

        if (existingError) throw existingError;

        if (existingRequests && existingRequests.length > 0) {
            const alreadyFriends = existingRequests.some(req => 
                (req.from_user_id === currentUser.id && req.to_user_id === toUserId && req.status === 'accepted') ||
                (req.from_user_id === toUserId && req.to_user_id === currentUser.id && req.status === 'accepted')
            );
            const pendingRequestSentByMe = existingRequests.some(req => 
                req.from_user_id === currentUser.id && req.to_user_id === toUserId && req.status === 'pending'
            );
             const pendingRequestSentToMe = existingRequests.some(req => 
                req.from_user_id === toUserId && req.to_user_id === currentUser.id && req.status === 'pending'
            );

            if (alreadyFriends) {
                sendRequestStatus.textContent = `Jesteś już znajomym z ${friendEmail}.`;
                sendRequestStatus.style.color = 'orange';
                return;
            }
            if (pendingRequestSentByMe) {
                sendRequestStatus.textContent = `Zaproszenie do ${friendEmail} zostało już wysłane i oczekuje na akceptację.`;
                sendRequestStatus.style.color = 'orange';
                return;
            }
            if (pendingRequestSentToMe) {
                sendRequestStatus.textContent = `Masz oczekujące zaproszenie od ${friendEmail}. Akceptuj je w zakładce 'Powiadomienia'.`;
                sendRequestStatus.style.color = 'orange';
                return;
            }
        }
        
        // 3. Insert the new friend request
        const { error: insertError } = await supabase
            .from('friend_requests')
            .insert({
                from_user_id: currentUser.id,
                to_user_id: toUserId,
                status: 'pending'
            });

        if (insertError) throw insertError;

        sendRequestStatus.textContent = `Zaproszenie do ${friendEmail} zostało wysłane pomyślnie!`;
        sendRequestStatus.style.color = 'green';
        friendEmailInput.value = ''; // Clear input

        // Send WebSocket notification to the target user
        sendMessage(JSON.stringify({
            type: 'friendRequest',
            toUserId: toUserId,
            fromEmail: currentUser.email,
            fromUserId: currentUser.id
        }));

    } catch (error) {
        console.error('Error sending friend request:', error.message);
        sendRequestStatus.textContent = `Wystąpił błąd: ${error.message}`;
        sendRequestStatus.style.color = 'red';
    }
}

/**
 * Updates the notification count displayed on the bell icon.
 */
async function updateNotificationCount() {
    if (!currentUser) return;

    try {
        const { count, error } = await supabase
            .from('friend_requests')
            .select('*', { count: 'exact', head: true })
            .eq('to_user_id', currentUser.id)
            .eq('status', 'pending');

        if (error) throw error;

        const notificationCountSpan = document.getElementById('notificationCount');
        if (count > 0) {
            notificationCountSpan.textContent = count;
            notificationCountSpan.classList.remove('hidden');
        } else {
            notificationCountSpan.classList.add('hidden');
        }
    } catch (error) {
        console.error('Error fetching notification count:', error.message);
    }
}


// --- Inicjalizacja Aplikacji ---

/**
 * Initializes all UI elements and event listeners after DOM content is loaded.
 */
function initializeUIElements() {
    mainHeader = document.getElementById('mainHeader');
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
    searchInput = sidebarEl ? sidebarEl.querySelector('.search-bar input[type="text"]') : null;
    contactsListEl = document.getElementById('contactsList');

    chatAreaWrapper = document.querySelector('.chat-area-wrapper');
    logoScreen = document.getElementById('logoScreen');
    chatArea = document.getElementById('chatArea');

    chatHeader = document.querySelector('.chat-header');
    backButton = document.getElementById('backButton');
    chatUserName = document.getElementById('chatUserName');
    userStatusSpan = document.getElementById('userStatus');
    chatHeaderActions = chatHeader ? chatHeader.querySelector('.chat-header-actions') : null;
    chatSettingsButton = document.getElementById('chatSettingsButton');
    chatSettingsDropdown = document.getElementById('chatSettingsDropdown');
    typingStatusHeader = document.getElementById('typingStatus');
    typingIndicatorMessages = document.getElementById('typingIndicator');

    messageContainer = document.getElementById('messageContainer');

    chatFooter = document.querySelector('.chat-footer');
    attachButton = chatFooter ? chatFooter.querySelector('.attach-button') : null;
    messageInput = document.getElementById('messageInput');
    emojiButton = chatFooter ? chatFooter.querySelector('.emoji-button') : null;
    sendButton = document.getElementById('sendButton');

    rightSidebarWrapper = document.querySelector('.right-sidebar-wrapper');
    rightSidebar = document.getElementById('rightSidebar');
    activeUsersListEl = document.getElementById('activeUsersList');
    noActiveUsersText = document.getElementById('noActiveUsersText');

    // NEW: Friend Request elements
    const addFriendButton = document.getElementById('addFriendButton');
    const notificationButton = document.getElementById('notificationButton');
    const friendRequestModal = document.getElementById('friendRequestModal');
    const closeFriendRequestModal = document.getElementById('closeFriendRequestModal');
    const sendFriendRequestButton = document.getElementById('sendFriendRequestButton');

    // Event Listeners
    if (menuButton) menuButton.addEventListener('click', toggleDropdownMenu);
    if (themeToggle) themeToggle.addEventListener('click', toggleTheme);
    if (logoutButton) logoutButton.addEventListener('click', handleLogout);
    
    if (sendButton) sendButton.addEventListener('click', handleSendMessage);
    if (messageInput) {
        messageInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                handleSendMessage();
            } else {
                sendTypingIndicator(); // Send typing indicator on keypress
            }
        });
    }

    if (backButton) {
        backButton.addEventListener('click', () => {
            if (window.matchMedia('(max-width: 768px)').matches) {
                showLeftSidebarMobile(); // On mobile, go back to contacts list
            }
        });
    }

    if (chatSettingsButton) {
        chatSettingsButton.addEventListener('click', (event) => {
            chatSettingsDropdown.classList.toggle('hidden');
            event.stopPropagation(); // Prevent click from propagating to document
        });
    }

    // Close chat settings dropdown if clicked outside
    document.addEventListener('click', (event) => {
        if (chatSettingsDropdown && !chatSettingsDropdown.contains(event.target) && !chatSettingsButton.contains(event.target)) {
            chatSettingsDropdown.classList.add('hidden');
        }
    });

    // Chat color options
    document.querySelectorAll('.color-box').forEach(box => {
        box.addEventListener('click', (event) => {
            const color = event.target.dataset.color;
            messageContainer.style.setProperty('--chat-bubble-color', `var(--message-bubble-${color})`);
            document.querySelectorAll('.color-box').forEach(b => b.classList.remove('active'));
            event.target.classList.add('active');
        });
    });

    // Chat background options
    document.querySelectorAll('.bg-box').forEach(box => {
        box.addEventListener('click', (event) => {
            const bgClass = event.target.dataset.bg;
            messageContainer.className = `messages ${bgClass}`; // Reset and apply new class
            document.querySelectorAll('.bg-box').forEach(b => b.classList.remove('active'));
            event.target.classList.add('active');
        });
    });

    // Sidebar search functionality
    if (searchInput) {
        searchInput.addEventListener('input', () => {
            const filter = searchInput.value.toLowerCase();
            document.querySelectorAll('#contactsList .conversation-item').forEach(item => {
                const name = item.querySelector('.convo-name').textContent.toLowerCase();
                if (name.includes(filter)) {
                    item.style.display = '';
                } else {
                    item.style.display = 'none';
                }
            });
        });
    }

    // NEW: Add Friend Button
    if (addFriendButton) {
        addFriendButton.addEventListener('click', () => {
            if (friendRequestModal) {
                friendRequestModal.classList.remove('hidden');
                document.getElementById('sendFriendRequestSection').classList.remove('hidden'); // Show send section
                document.getElementById('pendingRequestsSection').classList.add('hidden'); // Hide pending section initially
                document.getElementById('sendRequestStatus').textContent = ''; // Clear status message
            }
        });
    }

    // NEW: Notification Button (to view pending requests)
    if (notificationButton) {
        notificationButton.addEventListener('click', async () => {
            if (friendRequestModal) {
                friendRequestModal.classList.remove('hidden');
                document.getElementById('sendFriendRequestSection').classList.add('hidden'); // Hide send section
                document.getElementById('pendingRequestsSection').classList.remove('hidden'); // Show pending section
                await loadPendingFriendRequests(); // Load requests when modal opens
            }
        });
    }

    // NEW: Close Friend Request Modal
    if (closeFriendRequestModal) {
        closeFriendRequestModal.addEventListener('click', () => {
            if (friendRequestModal) {
                friendRequestModal.classList.add('hidden');
            }
        });
        // Close modal when clicking outside
        window.addEventListener('click', (event) => {
            if (event.target === friendRequestModal) {
                friendRequestModal.classList.add('hidden');
            }
        });
    }

    // NEW: Send Friend Request Button inside modal
    if (sendFriendRequestButton) {
        sendFriendRequestButton.addEventListener('click', handleSendFriendRequest);
    }
}

/**
 * Handles user logout.
 */
async function handleLogout() {
    try {
        await updateUserStatus(currentUser.id, false); // Set user offline
        const { error } = await supabase.auth.signOut();
        if (error) throw error;
        window.location.href = '/'; // Redirect to login page
    } catch (error) {
        console.error('Error logging out:', error.message);
        showCustomMessage("Nie udało się wylogować. Spróbuj ponownie.", "error");
    }
}

/**
 * Main initialization function.
 */
async function initializeApp() {
    console.log("Initializing Komunikator application...");

    try {
        // 1. Get DOM element references
        mainHeader = document.querySelector('.main-header'); console.log(`UI Element: mainHeader found: ${!!mainHeader}`);
        menuButton = document.getElementById('menuButton'); console.log(`UI Element: menuButton found: ${!!menuButton}`);
        dropdownMenu = document.getElementById('dropdownMenu'); console.log(`UI Element: dropdownMenu found: ${!!dropdownMenu}`);
        themeToggle = document.getElementById('themeToggle'); console.log(`UI Element: themeToggle found: ${!!themeToggle}`);
        logoutButton = document.getElementById('logoutButton'); console.log(`UI Element: logoutButton found: ${!!logoutButton}`);

        // ZMIANA: Usunięto inicjalizację enableSoundButton
        // enableSoundButton = document.getElementById('enableSoundButton'); console.log(`UI Element: enableSoundButton found: ${!!enableSoundButton}`);

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

        messageContainer = document.getElementById('messageContainer'); 
        console.log(`UI Element: messageContainer found: ${!!messageContainer}`); 

        chatFooter = document.querySelector('.chat-footer'); console.log(`UI Element: chatFooter found: ${!!chatFooter}`);
        attachButton = chatFooter ? chatFooter.querySelector('.attach-button') : null; console.log(`UI Element: attachButton found: ${!!attachButton}`);
        messageInput = document.getElementById('messageInput'); console.log(`UI Element: messageInput found: ${!!messageInput}`);
        emojiButton = chatFooter ? chatFooter.querySelector('.emoji-button') : null; console.log(`UI Element: emojiButton found: ${!!emojiButton}`);
        sendButton = document.getElementById('sendButton'); console.log(`UI Element: sendButton found: ${!!sendButton}`);

        rightSidebarWrapper = document.querySelector('.right-sidebar-wrapper'); console.log(`UI Element: rightSidebarWrapper found: ${!!rightSidebarWrapper}`);
        rightSidebar = document.getElementById('rightSidebar'); console.log(`UI Element: rightSidebar found: ${!!rightSidebar}`);
        activeUsersListEl = document.getElementById('activeUsersList'); console.log(`UI Element: activeUsersListEl found: ${!!activeUsersListEl}`);
        noActiveUsersText = document.getElementById('noActiveUsersText'); console.log(`UI Element: noActiveUsersText found: ${!!noActiveUsersText}`);

        const criticalElementsCheck = {
            mainHeader, menuButton, dropdownMenu, themeToggle, logoutButton, 
            // ZMIANA: Usunięto enableSoundButton z listy krytycznych elementów
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
        for (const key in criticalElementsCheck) {
            if (criticalElementsCheck[key] === null || criticalElementsCheck[key] === undefined || (criticalElementsCheck[key] instanceof NodeList && criticalElementsCheck[key].length === 0)) {
                console.error(`[initializeApp] ERROR: Critical UI element '${key}' not found or is empty. Please check your HTML. Current value:`, criticalElementsCheck[key]);
                allElementsFound = false;
            }
        }
        
        if (!allElementsFound) {
            console.error('[initializeApp] Initialization failed due to missing critical UI elements. Aborting.');
            showCustomMessage('Wystąpił krytyczny błąd inicjalizacji. Brakuje elementów interfejsu. Sprawdź konsolę przeglądarki.', 'error');
            return; 
        } else {
            console.log('[initializeApp] All critical UI elements found. Proceeding with app initialization.');
        }

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

        window.addEventListener('beforeunload', () => {
            if (socket && socket.readyState === WebSocket.OPEN && currentUser) {
                console.log(`[beforeunload] Sending 'leave' signal for user ${currentUser.id}.`);
                try {
                    socket.send(JSON.stringify({
                        type: 'leave',
                        name: currentUser.id,
                        room: currentRoom || 'global'
                    }));
                    socket.send(JSON.stringify({
                        type: 'status',
                        user: currentUser.id,
                        online: false,
                        last_seen: new Date().toISOString()
                    }));
                } catch (sendError) {
                    console.warn(`[beforeunload] Failed to send offline status: ${sendError.message}`);
                }
            }
        });
        console.log("[initializeApp] 'beforeunload' listener attached for WebSocket leave signal.");

        console.log("[initializeApp] Loading user profiles (before WS init)...");
        await loadAllProfiles(); 
        console.log("[initializeApp] User profiles loaded.");

        console.log("[initializeApp] Initializing WebSocket connection...");
        initializeWebSocket(); // Zmieniono na initializeWebSocket()

        console.log("[initializeApp] Setting up message sending functionality...");
        setupSendMessage();

        console.log("[initializeApp] Setting default UI state...");
        if (window.matchMedia('(min-width: 769px)').matches) {
            if (chatArea) chatArea.classList.remove('active'); 
            if (logoScreen) logoScreen.classList.remove('hidden'); 
            console.log("[initializeApp] Desktop initial state: chatArea inactive, logoScreen visible.");
        } else {
            if (chatArea) chatArea.classList.remove('active');
            if (logoScreen) logoScreen.classList.add('hidden'); 
            console.log("[initializeApp] Mobile initial state: chatArea inactive, logoScreen hidden.");
        }
        
        if (messageInput) messageInput.disabled = true;
        if (sendButton) sendButton.disabled = true;

        console.log("[initializeApp] Attaching general UI event listeners...");
        backButton.addEventListener('click', () => {
            console.log('[backButton] Back button clicked (UI)');
            
            if (socket && socket.readyState === WebSocket.OPEN && currentRoom && currentRoom !== 'global') {
                socket.send(JSON.stringify({
                    type: 'leave',
                    name: currentUser.id,
                    room: currentRoom 
                }));
                console.log(`[backButton] Sent leave message to WebSocket for room: ${currentRoom}`);
            }
            
            // Zmieniono resetChatView() na showLeftSidebarMobile() dla mobilnych i logoScreen dla desktopu
            if (window.matchMedia('(max-width: 768px)').matches) {
                showLeftSidebarMobile();
            } else {
                if (logoScreen) {
                    logoScreen.classList.remove('hidden');
                }
                if (chatArea) {
                    chatArea.classList.remove('active');
                }
            }
            resetChatView(); // Pozostawiamy resetChatView, aby wyczyścić zawartość czatu
        });

        menuButton.addEventListener('click', (event) => {
            event.stopPropagation(); 
            dropdownMenu.classList.toggle('hidden'); 
            console.log(`[initializeApp] Menu dropdown toggled. Hidden: ${dropdownMenu.classList.contains('hidden')}`);
        });

        document.addEventListener('click', (event) => {
            if (chatSettingsDropdown && !chatSettingsDropdown.classList.contains('hidden') && chatSettingsButton && !chatSettingsButton.contains(event.target)) {
                chatSettingsDropdown.classList.add('hidden');
                console.log("[initializeApp] Chat settings dropdown hidden due to outside click.");
            }
            if (dropdownMenu && !dropdownMenu.classList.contains('hidden') && menuButton && !menuButton.contains(event.target)) {
                dropdownMenu.classList.add('hidden');
                console.log("[initializeApp] Main dropdown hidden due to outside click.");
            }
        });

        themeToggle.addEventListener('click', () => {
            document.body.classList.toggle('dark-theme'); // Zmieniono 'dark-mode' na 'dark-theme'
            if (document.body.classList.contains('dark-theme')) {
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
            document.body.classList.add('dark-theme'); // Zmieniono 'dark-mode' na 'dark-theme'
            themeToggle.innerHTML = '<i class="fas fa-sun"></i> Tryb jasny';
        } else {
            document.body.classList.remove('dark-theme'); // Zmieniono 'dark-mode' na 'dark-theme'
            themeToggle.innerHTML = '<i class="fas fa-moon"></i> Tryb ciemny';
        }

        logoutButton.addEventListener('click', async () => {
            if (socket && socket.readyState === WebSocket.OPEN && currentUser) {
                try {
                    socket.send(JSON.stringify({
                        type: 'status',
                        user: currentUser.id,
                        online: false,
                        last_seen: new Date().toISOString() 
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

        // Zmieniono nazwę funkcji na initializeChatSettingsDropdown()
        initializeChatSettingsDropdown();

        // ZMIANA: Usunięto listener dla enableSoundButton
        // if (enableSoundButton) {
        //     enableSoundButton.addEventListener('click', () => {
        //         console.log("[Autoplay Check] 'Enable Sound' button clicked.");
        //         ensureAudioContext();
        //         playNotificationSound();
        //         localStorage.setItem('autoplayUnlocked', 'true');
        //         enableSoundButton.classList.add('hidden');
        //     });
        // }


        function handleMediaQueryChange(mq) {
            console.log(`[handleMediaQueryChange] Media query listener triggered. mq.matches: ${mq.matches} (max-width: 768px)`);
            if (mq.matches) {
                console.log("[handleMediaQueryChange] Mobile view activated. Adjusting initial visibility for mobile.");
                if (sidebarWrapper) {
                    sidebarWrapper.classList.remove('hidden-mobile'); 
                    console.log("[handleMediaQueryChange] Mobile: sidebarWrapper ensured visible (no hidden-on-mobile).");
                } else { console.warn("[handleMediaQueryChange] Mobile: sidebarWrapper not found in mq change."); }

                if (chatAreaWrapper) {
                    chatAreaWrapper.classList.remove('active-on-mobile'); 
                    chatAreaWrapper.style.display = 'none'; 
                    console.log("[handleMediaQueryChange] Mobile: chatAreaWrapper hidden.");
                } else { console.warn("[handleMediaQueryChange] Mobile: chatAreaWrapper not found in mq change."); }

                if (chatArea) {
                    chatArea.classList.remove('active'); 
                    console.log("[handleMediaQueryChange] Mobile: chatArea deactivated.");
                } else { console.warn("[handleMediaQueryChange] Mobile: chatArea not found in mq change."); }
                
                if (logoScreen) {
                    logoScreen.classList.add('hidden'); 
                    console.log("[handleMediaQueryChange] Mobile: logoScreen hidden.");
                } else { console.warn("[handleMediaQueryChange] Mobile: logoScreen not found in mq change."); }
                
                if (backButton) {
                    backButton.style.display = 'none'; 
                    console.log("[handleMediaQueryChange] Mobile: backButton hidden.");
                } else { console.warn("[handleMediaQueryChange] Mobile: backButton not found in mq change."); }
                
                if (rightSidebarWrapper) {
                    rightSidebarWrapper.style.display = 'none';
                    console.log("[handleMediaQueryChange] Mobile: rightSidebarWrapper hidden.");
                } else { console.warn("[handleMediaQueryChange] Mobile: rightSidebarWrapper not found in mq change."); }
            } else { 
                console.log("[handleMediaQueryChange] Desktop/Tablet view activated. Adjusting initial visibility for desktop.");
                if (sidebarWrapper) {
                    sidebarWrapper.classList.remove('hidden-on-mobile'); 
                    console.log("[handleMediaQueryChange] Desktop: sidebarWrapper visible.");
                } else { console.warn("[handleMediaQueryChange] Desktop: sidebarWrapper not found in mq change."); }
                
                if (chatAreaWrapper) {
                    chatAreaWrapper.classList.remove('active-on-mobile'); 
                    chatAreaWrapper.style.display = 'flex'; 
                    console.log("[handleMediaQueryChange] Desktop: chatAreaWrapper set to flex.");
                } else { console.warn("[handleMediaQueryChange] Desktop: chatAreaWrapper not found in mq change."); }
                
                if (logoScreen) {
                    if (!currentChatUser) { 
                        logoScreen.classList.remove('hidden'); 
                        console.log("[handleMediaQueryChange] Desktop: logoScreen visible (no current chat user).");
                    } else { 
                        logoScreen.classList.add('hidden');
                        console.log("[handleMediaQueryChange] Desktop: logoScreen hidden (chat active).");
                    }
                } else { console.warn("[handleMediaQueryChange] Desktop: logoScreen not found in mq change."); }
                
                if (chatArea) {
                    if (currentChatUser) { 
                        chatArea.classList.add('active'); 
                        console.log("[handleMediaQueryChange] Desktop: chatArea activated (current chat user).");
                    } else { 
                        chatArea.classList.remove('active'); 
                        console.log("[handleMediaQueryChange] Desktop: chatArea deactivated (no current chat user).");
                    }
                } else { console.warn("[handleMediaQueryChange] Desktop: chatArea not found in mq change."); }
                
                if (rightSidebarWrapper) {
                    rightSidebarWrapper.style.display = 'flex'; 
                    console.log("[handleMediaQueryChange] Desktop: rightSidebarWrapper visible.");
                } else { console.warn("[handleMediaQueryChange] Desktop: rightSidebarWrapper not found in mq change."); }
                
                if (backButton) {
                    backButton.style.display = 'none'; 
                    console.log("[handleMediaQueryChange] Desktop: backButton hidden.");
                } else { console.warn("[handleMediaQueryChange] Desktop: backButton not found in mq change."); }
            }
        }

        const mq = window.matchMedia('(max-width: 768px)');
        mq.addListener(handleMediaQueryChange);
        handleMediaQueryChange(mq); 

        await requestNotificationPermission();
        
        // ZMIANA: checkAudioAutoplay() nadal będzie wywoływane, ale bez logiki pokazywania przycisku
        checkAudioAutoplay();

        updateDocumentTitle(); 

        console.log("[initializeApp] Komunikator application initialized successfully.");
    } catch (e) {
        console.error("[initializeApp] Caught a critical error during initialization:", e);
        showCustomMessage("Wystąpił nieoczekiwany błąd podczas uruchamiania aplikacji. Spróbuj odświeżyć stronę.", "error");
    }
}

// Run the application after the DOM is fully loaded
document.addEventListener('DOMContentLoaded', initializeApp);
