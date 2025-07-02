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

// Przycisk do włączania dźwięków (obsługa Autoplay Policy)
let enableSoundButton;

// NOWE ZMIENNE DLA DŹWIWKU (Web Audio API)
let audioContext = null;
let audioContextInitiated = false; // Flaga do śledzenia, czy AudioContext został zainicjowany przez interakcję użytkownika

// NOWE ZMIENNE DLA TYTUŁU ZAKŁADKI PRZEGLĄDARKI
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
 * i wznawia (co wymaga gestu użytkownika).
 */
function ensureAudioContext() {
    if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        console.log("[AudioContext] New AudioContext created.");
    }

    // Sprawdź stan AudioContext. Jeśli jest zawieszony, spróbuj go wznowić.
    // Wznowienie może wymagać gestu użytkownika.
    if (audioContext.state === 'suspended') {
        audioContext.resume().then(() => {
            console.log('[AudioContext] AudioContext resumed successfully.');
            audioContextInitiated = true;
            localStorage.setItem('autoplayUnlocked', 'true'); // Zapisz, że autoplay jest odblokowany
            if (enableSoundButton) {
                enableSoundButton.classList.add('hidden'); // Ukryj przycisk
            }
        }).catch(e => {
            console.error('[AudioContext] Failed to resume AudioContext:', e);
            if (e.name === 'NotAllowedError' && enableSoundButton) {
                enableSoundButton.classList.remove('hidden'); // Jeśli nadal blokowany, pokaż przycisk
            }
        });
    } else if (audioContext.state === 'running') {
        console.log('[AudioContext] AudioContext is already running.');
        audioContextInitiated = true;
        localStorage.setItem('autoplayUnlocked', 'true');
        if (enableSoundButton) {
            enableSoundButton.classList.add('hidden');
        }
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
            if (enableSoundButton) {
                enableSoundButton.classList.remove('hidden');
                showCustomMessage("Przeglądarka zablokowała dźwięki. Kliknij 'Włącz dźwięki' u góry, aby je aktywować.", "info");
            }
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
        if (e.name === 'NotAllowedError' && enableSoundButton) {
            enableSoundButton.classList.remove('hidden');
            showCustomMessage("Przeglądarka zablokowała dźwięki. Kliknij 'Włącz dźwięki' u góry, aby je aktywować.", "info");
        }
    }
}


/**
 * Próbuje odtworzyć cichy dźwięk, aby sprawdzić i ewentualnie odblokować politykę Autoplay.
 * Jeśli się nie powiedzie, pokaże przycisk `enableSoundButton`.
 */
function checkAudioAutoplay() {
    console.log("[Autoplay Check] Attempting to check autoplay policy...");

    // Jeśli autoplay został już odblokowany w poprzedniej sesji, ukryj przycisk
    if (localStorage.getItem('autoplayUnlocked') === 'true') {
        console.log("[Autoplay Check] Autoplay already unlocked according to localStorage. Hiding button.");
        if (enableSoundButton) {
            enableSoundButton.classList.add('hidden');
            audioContextInitiated = true; // Ustaw flagę na true, bo przeglądarka pamięta odblokowanie
        }
        ensureAudioContext(); // Spróbuj wznowić AudioContext prewencyjnie
        return;
    }

    try {
        ensureAudioContext(); // Upewnij się, że AudioContext istnieje i jest w stanie suspended/running

        if (audioContext && audioContext.state === 'suspended') {
            // Jeśli AudioContext jest zawieszony, oznacza to, że potrzebny jest gest użytkownika.
            // Pokaż przycisk do włączenia dźwięków.
            console.warn("[Autoplay Check] AudioContext is suspended. Showing 'Enable Sound' button.");
            if (enableSoundButton) {
                enableSoundButton.classList.remove('hidden');
                showCustomMessage("Przeglądarka zablokowała dźwięki. Kliknij 'Włącz dźwięki' u góry, aby je aktywować.", "info");
            }
        } else if (audioContext && audioContext.state === 'running') {
            console.log('[Autoplay Check] AudioContext is already running. Autoplay is likely allowed.');
            audioContextInitiated = true;
            localStorage.setItem('autoplayUnlocked', 'true');
            if (enableSoundButton) {
                enableSoundButton.classList.add('hidden');
            }
        } else {
            console.log(`[Autoplay Check] AudioContext state: ${audioContext ? audioContext.state : 'null'}. No immediate action.`);
        }
    } catch (e) {
        console.error("Error during autoplay check:", e);
        if (enableSoundButton) {
            enableSoundButton.classList.remove('hidden');
        }
    }
}


/**
 * Prosi użytkownika o uprawnienia do wyświetlania powiadomień przeglądarkowych.
 * Aktualizuje zmienną globalną `notificationPermissionGranted`.
 */
async function requestNotificationPermission() {
    console.log("[Notifications] Checking Notification API support...");
    if (!("Notification" in window)) {
        console.warn("[Notifications] This browser does not support desktop notification.");
        return;
    }

    // Sprawdź obecny status uprawnień
    if (Notification.permission === "granted") {
        notificationPermissionGranted = true;
        console.log("[Notifications] Notification permission already granted.");
        return;
    } else if (Notification.permission === "denied") {
        notificationPermissionGranted = false;
        console.warn("[Notifications] Notification permission previously denied.");
        showCustomMessage("Powiadomienia zostały zablokowane. Aby je włączyć, zmień ustawienia przeglądarki.", "info");
        return;
    }

    console.log("[Notifications] Requesting permission from user...");
    try {
        const permission = await Notification.requestPermission();
        if (permission === "granted") {
            notificationPermissionGranted = true;
            console.log("[Notifications] Notification permission granted by user.");
            showCustomMessage("Powiadomienia włączone!", "success");
        } else if (permission === "denied") {
            notificationPermissionGranted = false;
            console.warn("[Notifications] Notification permission denied by user.");
            showCustomMessage("Powiadomienia zostały zablokowane. Nie będziesz otrzymywać alertów o nowych wiadomościach.", "error");
        } else { // 'default'
            notificationPermissionGranted = false;
            showCustomMessage("Powiadomienia nie zostały włączone.", "info");
        }
    } catch (error) {
        console.error("[Notifications] Error requesting notification permission:", error);
        notificationPermissionGranted = false;
        showCustomMessage("Wystąpił błąd podczas próby włączenia powiadomień.", "error");
    }
}


/**
 * Resets the chat view to its initial state (clears messages, disables input).
 * Does NOT control visibility of logoScreen or chatArea. Those are handled by calling functions.
 */
function resetChatView() {
    console.log("[resetChatView] Resetting chat view (clearing content, not visibility)...");
    if (messageContainer) {
        messageContainer.innerHTML = ""; // Clear messages
        // Remove all theme classes for messages container
        messageContainer.classList.remove('blue-theme', 'green-theme', 'red-theme', 'dark-bg', 'pattern-bg');
    } else {
        console.warn("[resetChatView] messageContainer not found during reset.");
    }

    if (messageInput) {
        messageInput.disabled = true; // Disable input
        messageInput.value = ""; // Clear input value
    } else {
        console.warn("[resetChatView] messageInput not found during reset.");
    }
    if (sendButton) {
        sendButton.disabled = true; // Disable send button
    } else {
        console.warn("[resetChatView] sendButton not found during reset.");
    }
    if (chatUserName) {
        chatUserName.textContent = ""; // Clear chat user name
    } else {
        console.warn("[resetChatView] chatUserName not found during reset.");
    }
    if (userStatusSpan) {
        userStatusSpan.textContent = ""; // Clear user status
        userStatusSpan.classList.remove('online', 'offline'); // Remove status classes
    } else {
        console.warn("[resetChatView] userStatusSpan not found during reset.");
    }
    if (typingStatusHeader) { // Status w nagłówku
        typingStatusHeader.classList.add('hidden'); // Hide typing indicator
        typingStatusHeader.textContent = ''; // Clear text
    } else {
        console.warn("[resetChatView] typingStatusHeader not found during reset.");
    }
    if (typingIndicatorMessages) { // Animowane kropki w wiadomościach
        typingIndicatorMessages.classList.add('hidden'); // Hide typing indicator
    } else {
        console.warn("[resetChatView] typingIndicatorMessages not found during reset.");
    }

    currentChatUser = null; // Reset current chat user
    currentRoom = null; // Reset current room
    console.log("[resetChatView] currentChatUser and currentRoom reset to null.");
    
    // Remove active state from conversation item if any
    if (currentActiveConvoItem) {
        currentActiveConvoItem.classList.remove('active'); // Deactivate active conversation item
        currentActiveConvoItem = null;
        console.log("[resetChatView] currentActiveConvoItem deactivated.");
    }

    if (chatSettingsDropdown) {
        chatSettingsDropdown.classList.add('hidden'); // Hide chat settings dropdown
        console.log("[resetChatView] chatSettingsDropdown hidden.");
    } else {
        console.warn("[resetChatView] chatSettingsDropdown not found during reset.");
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
// USUNIĘTO: Ta funkcja nie jest już używana bezpośrednio w loadContacts()
/*
async function getLastMessageForRoom(roomId) {
    try {
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
    } catch (e) {
        console.error("Caught error in getLastMessageForRoom:", e);
        return null;
    }
}
*/

/**
 * Fetches the entire message history for a given room.
 * @param {string} roomId - The ID of the room.
 * @returns {Promise<Array<Object>>} An array of message objects, sorted oldest to newest.
 */
async function fetchMessageHistory(roomId) {
    console.log(`[fetchMessageHistory] Fetching history for room: ${roomId}`);
    try {
        // Assume a maximum limit for history to prevent excessive data transfer
        const limit = 50; 
        const { data, error } = await supabase
            .from('messages')
            .select('content, sender_id, created_at, room_id')
            .eq('room_id', roomId)
            .order('created_at', { ascending: true }) // Ascending for history display
            .limit(limit);

        if (error) {
            console.error('[fetchMessageHistory] Error fetching message history:', error);
            return [];
        }

        if (data) {
            console.log(`[fetchMessageHistory] Fetched ${data.length} messages for room ${roomId}.`);
            // Map database columns to frontend expected properties
            return data.map(msg => ({
                text: msg.content,
                username: msg.sender_id,
                inserted_at: msg.created_at,
                room: msg.room_id
            }));
        }
        return [];
    } catch (e) {
        console.error("Caught error in fetchMessageHistory:", e);
        return [];
    }
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
 * ZMIANA: Teraz pobiera ostatnie wiadomości dla wszystkich pokoi w jednym zapytaniu przez WebSocket.
 */
async function loadContacts() {
    console.log("[loadContacts] Loading contacts...");
    if (!currentUser || !currentUser.id || !currentUser.email) {
        console.error("[loadContacts] Current user is not defined, cannot load contacts.");
        return;
    }

    try {
        const { data: users, error } = await supabase.rpc('get_other_users', { current_email: currentUser.email });
        if (error) {
            console.error('[loadContacts] Error loading contacts:', error);
            return;
        }

        if (contactsListEl) {
            contactsListEl.innerHTML = ''; // Clear existing contacts
        } else {
            console.error("[loadContacts] contactsListEl element not found! Cannot load contacts list.");
            return;
        }

        // KROK 1: Wyślij żądanie do serwera WebSocket o ostatnie wiadomości dla wszystkich pokoi użytkownika
        let lastMessagesMap = {};
        if (socket && socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({
                type: 'get_last_messages_for_user_rooms',
                userId: currentUser.id
            }));
            console.log(`[loadContacts] Sent 'get_last_messages_for_user_rooms' request for user ${currentUser.id}.`);

            // Czekaj na odpowiedź z serwera (obsługiwana w socket.onmessage)
            // Możemy użyć Promise, aby poczekać na odpowiedź, ale dla prostoty na razie polegamy na tym,
            // że dane zostaną zaktualizowane asynchronicznie i loadContacts zostanie wywołane ponownie
            // lub UI zostanie odświeżone przez handler WS.
            // Dla tej optymalizacji, musimy poczekać na odpowiedź, zanim posortujemy kontakty.
            lastMessagesMap = await new Promise(resolve => {
                const tempHandler = (event) => {
                    const data = JSON.parse(event.data);
                    if (data.type === 'last_messages_for_user_rooms') {
                        console.log("[loadContacts] Received 'last_messages_for_user_rooms' response.");
                        socket.removeEventListener('message', tempHandler); // Usuń tymczasowy handler
                        resolve(data.messages);
                    }
                };
                socket.addEventListener('message', tempHandler);
            });
        } else {
            console.warn("[loadContacts] WebSocket not open, cannot request last messages for user rooms. Falling back to no last messages.");
        }


        // KROK 2: Połącz dane o użytkownikach z ich ostatnimi wiadomościami
        const contactsWithLastMessage = users.map(user => {
            const roomId = getRoomName(String(currentUser.id), String(user.id));
            const lastMessage = lastMessagesMap[roomId] || null; // Pobierz z mapy
            return { user, lastMessage, roomId };
        });

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
                    <span class="unread-count hidden"></span> <!-- ZMIANA: Usunięto domyślne '0' -->
                    <span class="status-dot ${onlineUsers.get(String(user.id))?.isOnline ? 'online' : ''}"></span> <!-- Added status dot -->
                </div>
            `;

            convoItem.addEventListener('click', () => {
                handleConversationClick(user, convoItem);
            });

            contactsListEl.appendChild(convoItem);
        });
        console.log("[loadContacts] Contacts loaded and rendered.");
        await loadUnreadMessagesFromSupabase(); // Load unread counts after contacts are rendered
    } catch (e) {
        console.error("Caught error in loadContacts:", e);
    }
}

/**
 * Handles a click event on a conversation item.
 * Sets up the chat view for the selected user and joins the chat room.
 * @param {Object} user - The user object of the selected contact.
 * @param {HTMLElement} clickedConvoItemElement - The clicked list item element.
 */
async function handleConversationClick(user, clickedConvoItemElement) {
    console.log('[handleConversationClick] Conversation item clicked, user:', user);

    try {
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

        // NEW: Immediately hide logo screen and show chat area to prevent flicker
        if (logoScreen) {
            logoScreen.classList.add('hidden');
            console.log("[handleConversationClick] logoScreen immediately hidden.");
        }
        if (chatArea) {
            chatArea.classList.add('active');
            console.log("[handleConversationClick] chatArea immediately active.");
        }
        if (chatAreaWrapper) {
            chatAreaWrapper.style.display = 'flex'; // Ensure it's visible to contain chat
            if (window.matchMedia('(max-width: 768px)').matches) {
                chatAreaWrapper.classList.add('active-on-mobile');
                console.log("[handleConversationClick] Mobile: chatAreaWrapper set to active-on-mobile and display flex.");
            } else {
                chatAreaWrapper.classList.remove('active-on-mobile');
                console.log("[handleConversationClick] Desktop: chatAreaWrapper set to display flex.");
            }
        }
        if (backButton) { // Ensure back button is correctly set for mobile
            if (window.matchMedia('(max-width: 768px)').matches) {
                backButton.style.display = 'block';
                console.log("[handleConversationClick] Mobile: backButton shown.");
            } else {
                backButton.style.display = 'none';
                console.log("[handleConversationClick] Desktop: backButton hidden.");
            }
        }
        // Ensure right sidebar is always hidden on mobile when chat is active
        if (window.matchMedia('(max-width: 768px)').matches && rightSidebarWrapper) {
            rightSidebarWrapper.style.display = 'none';
            console.log("[handleConversationClick] Mobile: rightSidebarWrapper hidden.");
        }


        resetChatView(); // Reset the chat display (content clearing) before loading new conversation

        currentChatUser = {
            id: user.id,
            username: getUserLabelById(user.id) || user.email,
            email: user.email,
        };
        const newRoom = getRoomName(String(currentUser.id), String(currentChatUser.id));
        currentRoom = newRoom; // Ustaw globalną zmienną currentRoom
        console.log(`[handleConversationClick] New chat session initiated. User: ${currentChatUser.username}, Setting currentRoom to: ${currentRoom}`);

        // Clear unread count in Supabase for this conversation
        if (supabase && currentUser && currentUser.id) {
            await clearUnreadMessageCountInSupabase(newRoom);
            console.log(`[Supabase] Requested unread count clear for room ${newRoom} in Supabase.`);
        } else {
            console.warn("[Supabase] Supabase client not ready or currentUser not set. Cannot clear unread count in Supabase.");
        }


        if (chatUserName && messageInput && sendButton && userStatusSpan) {
            chatUserName.textContent = currentChatUser.username;
            
            // ZMIANA: Pobierz status z mapy onlineUsers, która teraz przechowuje obiekty
            const userStatus = onlineUsers.get(String(user.id));
            const isUserOnline = userStatus ? userStatus.isOnline : false;
            userStatusSpan.classList.toggle('online', isUserOnline); 
            userStatusSpan.classList.toggle('offline', !isUserOnline); 

            if (isUserOnline) {
                userStatusSpan.textContent = 'Online';
            } else {
                let lastSeenText = 'Offline';
                if (userStatus && userStatus.lastSeen) {
                    const date = new Date(userStatus.lastSeen);
                    if (!isNaN(date.getTime())) {
                         lastSeenText = `Offline (ostatnio widziany ${formatTimeAgo(date)})`;
                    }
                }
                userStatusSpan.textContent = lastSeenText;
            }
            console.log(`[handleConversationClick] Initial status for active chat user ${currentChatUser.username} (from onlineUsers map): ${userStatusSpan.textContent}`);

            messageInput.disabled = false;
            sendButton.disabled = false;
            messageInput.focus();
        } else {
            console.warn("[handleConversationClick] One or more chat UI elements (chatUserName, messageInput, sendButton, userStatusSpan) not found.");
        }

        // Reset unread count for the selected conversation (UI only, Supabase handles global)
        const unreadCount = clickedConvoItemElement.querySelector('.unread-count');
        if (unreadCount) {
            unreadCount.textContent = ''; // Upewnij się, że tekst jest wyczyszczony
            unreadCount.classList.add('hidden');
            console.log(`[handleConversationClick] Unread count reset for room ${newRoom} (UI only).`);
        } else {
            console.warn("[handleConversationClick] Unread count element not found for selected conversation.");
        }
        // updateDocumentTitle will be called after Supabase update.


        // KROK 2: Dołącz do nowego pokoju na serwerze WebSocket
        if (socket && socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({
                type: 'join',
                name: currentUser.id,
                room: currentRoom, // Teraz wysyłamy konkretny pokój czatu
            }));
            console.log(`[handleConversationClick] Sent JOIN message to WebSocket for room: ${currentRoom}`);
        } else {
            console.warn("[handleConversationClick] WebSocket not open. Attempting to re-initialize and join on open.");
            initWebSocket(); // Re-initialize WebSocket if not open, join on 'open' event
        }

        // KROK 3: Ładowanie historii wiadomości po ustawieniu pokoju
        try {
            const history = await fetchMessageHistory(currentRoom);
            console.log(`[handleConversationClick] Fetched history for ${currentRoom}:`, history);
            if (messageContainer) {
                messageContainer.innerHTML = ''; // Clear existing messages before adding history
                history.forEach(msg => {
                    // Dodaj wiadomość do widoku, ale NIE wywołuj logiki powiadomień dla historii
                    const div = document.createElement('div');
                    div.classList.add('message', String(msg.username) === String(currentUser.id) ? 'sent' : 'received');

                    const timestamp = new Date(msg.inserted_at || Date.now());
                    const timeString = timestamp.toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" });

                    div.innerHTML = `
                        <p>${msg.text}</p>
                        <span class="timestamp">${timeString}</span>
                    `;
                    messageContainer.appendChild(div);
                });
                messageContainer.scrollTop = messageContainer.scrollHeight; // Scroll to bottom
                console.log(`[handleConversationClick] Displayed ${history.length} historical messages.`);
            } else {
                console.error("[handleConversationClick] messageContainer is null when trying to load history.");
            }
        } catch (e) {
            console.error("[handleConversationClick] Error loading message history:", e);
            showCustomMessage("Nie udało się załadować historii wiadomości.", "error");
        }
    } catch (e) {
        console.error("Caught error in handleConversationClick:", e);
        showCustomMessage("Wystąpił błąd podczas ładowania konwersacji.", "error");
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

    try {
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
            console.log("[DEBUG: SEND BUTTON] Send button clicked or Enter pressed."); 
            
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
                showCustomMessage("Wybierz kontakt, aby wysłać wiadomość.", "info");
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
                console.log("[DEBUG: SEND BUTTON] Enter key pressed."); 
                sendButton.click(); 
            }
        });
        console.log("[setupSendMessage] Message send event listeners attached.");
    } catch (e) {
        console.error("Caught error in setupSendMessage:", e);
    }
}

/**
 * Adds a message to the chat view and updates the conversation preview in the list.
 * Includes logic for displaying browser notifications.
 * @param {Object} msg - The message object.
 */
async function addMessageToChat(msg) { 
    console.log(`[addMessageToChat] Processing message: sender=${msg.username}, room=${msg.room}. Global currentRoom (active chat): ${currentRoom}`);

    try {
        let convoItemToUpdate = contactsListEl.querySelector(`.contact[data-room-id="${msg.room}"]`);
        console.log("[addMessageToChat] convoItemToUpdate found:", !!convoItemToUpdate ? "Yes" : "No", `for room ${msg.room}`);

        if (!convoItemToUpdate) {
            console.warn(`[addMessageToChat] Conversation item for room ${msg.room} not found initially. Reloading contacts to sync list.`);
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

        let previewText = "Brak wiadomości"; // Default text if no messages

        if (previewEl && timeEl) {
            const senderId = String(msg.username);
            const senderName = senderId === String(currentUser.id) ? "Ja" : (getUserLabelById(senderId) || senderId);
            previewText = `${senderName}: ${msg.text}`; 
            const lastMessageTime = new Date(msg.inserted_at || Date.now()); // Fallback to current time if inserted_at is missing
            const timeString = lastMessageTime.toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" }); 
            timeEl.textContent = timeString; 
            console.log(`[addMessageToChat] Updated preview and time for room ${msg.room}. Preview: "${previewText}"`); 
            previewEl.textContent = previewText; 
        } else {
            console.warn(`[addMessageToChat] Could not find previewEl or timeEl for room ${msg.room}. Preview/time not updated.`);
        }

        // Increment unread count ONLY if the message is for a DIFFERENT room AND it's not from the current user (sent by self)
        const isMessageFromOtherUser = String(msg.username) !== String(currentUser.id);
        const isDifferentRoom = msg.room !== currentRoom;

        if (isMessageFromOtherUser && isDifferentRoom) {
            // Update Supabase unread count
            if (supabase && currentUser && currentUser.id) {
                await updateUnreadMessageCountInSupabase(msg.room, msg.username);
                console.log(`[Supabase] Requested unread count increment for room ${msg.room} in Supabase.`);
            } else {
                console.warn("[Supabase] Supabase client not ready or currentUser not set. Cannot update unread count in Supabase.");
            }

            // Logic for browser notifications and sound
            // Show notification if tab is hidden OR if user is in a different chat
            const shouldNotify = notificationPermissionGranted && (document.hidden || isDifferentRoom);
            if (shouldNotify) {
                console.log("[addMessageToChat] Conditions met for showing browser notification and playing sound.");
                const senderLabel = getUserLabelById(msg.username) || msg.username;
                const notificationTitle = `Nowa wiadomość od ${senderLabel}`;
                const notificationBody = msg.text;
                
                const notification = new Notification(notificationTitle, {
                    body: notificationBody,
                    icon: 'https://placehold.co/48x48/000000/FFFFFF?text=💬', // Prosta ikona powiadomienia
                    silent: true // Dźwięk obsługujemy osobną funkcją, aby ominąć blokady autoplay
                });

                notification.onclick = function() {
                    window.focus(); // Przełącz na okno przeglądarki
                    // Możesz dodać logikę do automatycznego przełączenia na odpowiedni czat,
                    // np. wywołując handleConversationClick z odpowiednimi danymi użytkownika.
                    console.log("[Notifications] Notification clicked. Focusing window.");
                };

                playNotificationSound(); // Odtwórz dźwięk osobno
            }
        } else if (String(msg.username) === String(currentUser.id) || msg.room === currentRoom) {
            // If message is from current user or for the active room, ensure unread count is zeroed and hidden
            console.log(`[addMessageToChat] Message is from current user (${String(msg.username) === String(currentUser.id)}) OR for the active room (${msg.room === currentRoom}). Ensuring unread count is hidden.`);
            if (unreadCountEl) {
                unreadCountEl.textContent = ''; // ZMIANA: Wyczyszczono tekst
                unreadCountEl.classList.add('hidden');
            }
            // Clear this conversation from the global unread tracker in Supabase if it was previously unread
            if (supabase && currentUser && currentUser.id && unreadConversationsInfo.has(msg.room)) {
                await clearUnreadMessageCountInSupabase(msg.room);
                console.log(`[Supabase] Requested unread count clear for active/sent room ${msg.room} in Supabase.`);
            }
        } else {
            console.log("[addMessageToChat] Unhandled unread count scenario. room:", msg.room, "currentRoom:", currentRoom, "msg.username:", msg.username, "currentUser.id:", currentUser.id);
        }
        // updateDocumentTitle will be called after Supabase data is loaded or updated.

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
    } catch (e) {
        console.error("Caught error in addMessageToChat:", e);
    }
}

/**
 * Updates the online/offline status indicator for a specific user.
 * @param {string} userId - The ID of the user whose status is being updated.
 * @param {boolean} isOnline - True if the user is online, false otherwise.
 * @param {string | null} lastSeenTimestamp - Optional: The timestamp when the user was last seen.
 */
function updateUserStatusIndicator(userId, isOnline, lastSeenTimestamp = null) {
    console.log(`[Status Update Debug] Function called for userId: ${userId}, isOnline: ${isOnline}, lastSeenTimestamp: ${lastSeenTimestamp}`);
    try {
        // ZMIANA: Aktualizuj mapę onlineUsers o obiekt z isOnline i lastSeen
        if (isOnline) {
            onlineUsers.set(String(userId), { isOnline: true, lastSeen: null });
        } else {
            // Użyj dostarczonego timestampu lub bieżącego czasu, jeśli przechodzi w tryb offline
            onlineUsers.set(String(userId), { isOnline: false, lastSeen: lastSeenTimestamp || new Date().toISOString() });
        }

        // Update status in the active chat header
        if (currentChatUser && userStatusSpan) {
            console.log(`[Status Update Debug] currentChatUser.id: ${currentChatUser.id}, userId from WS: ${userId}`);
            if (String(currentChatUser.id) === String(userId)) {
                userStatusSpan.classList.toggle('online', isOnline); 
                userStatusSpan.classList.toggle('offline', !isOnline); 

                if (isOnline) {
                    userStatusSpan.textContent = 'Online';
                } else {
                    const lastSeenInfo = onlineUsers.get(String(userId));
                    let lastSeenText = 'Offline';
                    if (lastSeenInfo && lastSeenInfo.lastSeen) {
                        const date = new Date(lastSeenInfo.lastSeen);
                        if (!isNaN(date.getTime())) {
                            lastSeenText = `Offline (ostatnio widziany ${formatTimeAgo(date)})`;
                        } else {
                            lastSeenText = `Offline`; // Fallback if date is invalid
                        }
                    }
                    userStatusSpan.textContent = lastSeenText;
                }
                console.log(`[Status Update Debug] Chat header status updated for ${getUserLabelById(userId)} to: ${userStatusSpan.textContent}`);
            } else {
                console.log("[Status Update Debug] userId " + userId + " does not match currentChatUser.id " + currentChatUser.id + ". Header not updated.");
            }
        } else {
            console.log("[Status Update Debug] currentChatUser or userStatusSpan is null/undefined. Cannot update header.");
        }

        // Update status in the active users list (right sidebar - desktop)
        if (activeUsersListEl && noActiveUsersText && String(userId) !== String(currentUser.id)) { // Exclude current user from active list
            const userListItem = activeUsersListEl.querySelector(`li[data-user-id="${userId}"]`);

            if (!isOnline) {
                // If user goes offline, remove from list
                if (userListItem) {
                    userListItem.remove();
                    console.log(`Removed offline user ${getUserLabelById(userId)} from desktop active list.`);
                }
            } else { // User is online
                if (!userListItem) {
                    // If user is online and not in list, add them
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

                    li.addEventListener('click', async () => {
                        const userProfile = (await loadAllProfiles()).find(p => String(p.id) === String(userId));
                        if (userProfile) {
                            const mockConvoItem = document.createElement('li');
                            mockConvoItem.dataset.convoId = userProfile.id; 
                            mockConvoItem.dataset.email = userProfile.email;
                            mockConvoItem.dataset.roomId = getRoomName(String(currentUser.id), String(userProfile.id)); 
                            handleConversationClick(userProfile, mockConvoItem);
                        }
                    });

                } else {
                    // If user is online and already in list, ensure status dot is correct
                    const statusIndicator = userListItem.querySelector('.status-dot');
                    if (statusIndicator) {
                        statusIndicator.classList.add('online');
                        statusIndicator.classList.remove('offline');
                    }
                }
            }
            // After any change, check if the list is empty and update noActiveUsersText
            if (activeUsersListEl.children.length === 0) {
                noActiveUsersText.style.display = 'block';
                activeUsersListEl.style.display = 'none';
            } else {
                noActiveUsersText.style.display = 'none';
                activeUsersListEl.style.display = 'block';
            }
        } else {
             if (String(userId) !== String(currentUser.id)) { // Only warn if it's not the current user as current user is not in this list
                 console.error("activeUsersListEl or noActiveUsersText not found during status update.");
             }
        }

        // Update status in the mobile online users list
        if (onlineUsersMobile && String(userId) !== String(currentUser.id)) { // Exclude current user
            const mobileUserItem = onlineUsersMobile.querySelector(`div[data-user-id="${userId}"]`);

            if (!isOnline) {
                if (mobileUserItem) {
                    mobileUserItem.remove();
                    console.log(`Removed offline user ${getUserLabelById(userId)} from mobile active list.`);
                }
            } else { // User is online
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
                        const userProfile = (await loadAllProfiles()).find(p => String(p.id) === String(user.id));
                        if (userProfile) {
                            const mockConvoItem = document.createElement('li');
                            mockConvoItem.dataset.convoId = user.id;
                            mockConvoItem.dataset.email = userProfile.email;
                            mockConvoItem.dataset.roomId = getRoomName(String(currentUser.id), String(user.id));
                            handleConversationClick(userProfile, mockConvoItem);
                        }
                    });
                    onlineUsersMobile.appendChild(div);
                    console.log(`Added new online user to mobile active list: ${getUserLabelById(userId)}`);
                }
            }
        } else {
             if (String(userId) !== String(currentUser.id)) { // Only warn if it's not the current user
                console.error("onlineUsersMobile not found during status update.");
            }
        }
        
        // Update status dots in the main contacts list (unchanged - only dot, no timestamp)
        const contactConvoItem = contactsListEl.querySelector(`.contact[data-convo-id="${userId}"]`);
        if (contactConvoItem) {
            const statusDot = contactConvoItem.querySelector('.status-dot');
            if (statusDot) {
                if (isOnline) {
                    statusDot.classList.add('online');
                } else {
                    statusDot.classList.remove('online');
                }
            }
        }

    } catch (e) {
        console.error("Caught error in updateUserStatusIndicator:", e);
    }
}


/**
 * Displays the typing indicator for a specific user.
 * Hides it after a short delay.
 * @param {string} usernameId - The ID of the user who is typing.
 */
function showTypingIndicator(usernameId) {
    try {
        // Check if the typing indicator is for the currently active chat
        if (currentChatUser && String(usernameId) === String(currentChatUser.id)) {
            // Pokaż wskaźnik pisania w nagłówku
            if (typingStatusHeader) {
                typingStatusHeader.classList.remove('hidden'); 
                typingStatusHeader.textContent = `${getUserLabelById(usernameId)} pisze...`; // Set text
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
                    typingStatusHeader.textContent = ''; // Clear text
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
    } catch (e) {
        console.error("Caught error in showTypingIndicator:", e);
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
                online: true,
                last_seen: null // Online, więc last_seen jest null
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
        try {
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
                    console.log(`[WS MESSAGE] Received message history for room: ${data.room}. Global currentRoom: ${currentRoom}`);
                    // Historia jest ładowana bezpośrednio przez handleConversationClick
                    // Ta sekcja jest głównie do celów debugowania lub jeśli historia byłaby ładowana w inny sposób
                    break;
                case 'status':
                    console.log(`[WS MESSAGE] Received status update for user ${data.user}: ${data.online ? 'online' : 'offline'}. Last seen: ${data.last_seen || 'N/A'}`);
                    // ZMIANA: Przekaż last_seen timestamp do funkcji
                    updateUserStatusIndicator(data.user, data.online, data.last_seen || null);
                    break;
                case 'active_users':
                    console.log('[WS MESSAGE] Received initial active users list:', data.users);
                    displayActiveUsers(data.users); 
                    break;
                // NOWY CASE: Obsługa ostatnich wiadomości dla pokoi użytkownika
                case 'last_messages_for_user_rooms':
                    console.log('[WS MESSAGE] Received last messages for user rooms:', data.messages);
                    // Ta wiadomość jest obsługiwana w loadContacts() poprzez Promise,
                    // więc nie potrzebujemy tu dodatkowej logiki, chyba że chcemy odświeżyć UI
                    // w inny sposób po otrzymaniu tych danych.
                    break;
                default:
                    console.warn("[WS MESSAGE] Unknown WS message type:", data.type, data);
            }
        } catch (e) {
            console.error("Error parsing or handling WebSocket message:", e, "Raw data:", event.data);
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

    try {
        if (socket && socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ type: 'get_active_users' }));
            console.log("[loadActiveUsers] Requested active users list from WebSocket server.");
        } else {
            console.warn("[loadActiveUsers] WebSocket not open, cannot request active users.");
        }
    } catch (e) {
        console.error("Caught error in loadActiveUsers:", e);
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

    try {
        activeUsersListEl.innerHTML = ''; 
        onlineUsersMobile.innerHTML = ''; 
        onlineUsers.clear(); // Clear existing local data

        // ZMIANA: Usunięto filtrowanie, aby przetwarzać wszystkich użytkowników i ich statusy z DB
        // const filteredUsers = activeUsersData.filter(user => String(user.id) !== String(currentUser.id)); // Usunięto tę linię

        const onlineUsersForDisplay = activeUsersData.filter(user => String(user.id) !== String(currentUser.id) && user.online);

        if (onlineUsersForDisplay.length === 0) {
            activeUsersListEl.style.display = 'none';
            noActiveUsersText.style.display = 'block';
            console.log("[displayActiveUsers] No active users, hiding desktop list, showing text.");
        } else {
            activeUsersListEl.style.display = 'block';
            noActiveUsersText.style.display = 'none';
            console.log("[displayActiveUsers] Active users found, showing desktop list, hiding text.");

            onlineUsersForDisplay.forEach(user => { // Iterujemy tylko po użytkownikach online do wyświetlenia w sidebarze
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

                // ZMIANA: Tworzenie mobilnej listy online - tylko dla faktycznie online
                const divMobile = document.createElement('div');
                divMobile.classList.add('online-user-item-mobile');
                divMobile.dataset.userId = user.id;

                divMobile.innerHTML = `
                        <img src="${avatarSrc}" alt="Avatar" class="avatar">
                        <span class="username">${getUserLabelById(user.id) || user.username || 'Nieznany'}</span>
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
            });
        }
        
        // ZMIANA: Prawidłowe wypełnienie mapy onlineUsers dla WSZYSTKICH użytkowników otrzymanych z serwera
        activeUsersData.forEach(user => {
            onlineUsers.set(String(user.id), { isOnline: user.online, lastSeen: user.last_seen });
        });

        console.log("[Status Update Debug] onlineUsers map after displayActiveUsers:", onlineUsers);
    } finally {
        console.log("Wykonano operacje czyszczące w bloku finally.");
    }
}

/**
 * Sets up the functionality for the chat settings dropdown menu.
 */
function setupChatSettingsDropdown() {
    console.log("[setupChatSettingsDropdown] Setting up chat settings dropdown.");
    if (!chatSettingsButton || !chatSettingsDropdown) {
        console.warn("[setupChatSettingsDropdown] Chat settings button or dropdown not found. Skipping setup.");
        return;
    }

    try {
        chatSettingsButton.addEventListener('click', (event) => {
            event.stopPropagation(); 
            chatSettingsDropdown.classList.toggle('hidden');
            console.log(`[setupChatSettingsDropdown] Chat settings dropdown toggled. Hidden: ${chatSettingsDropdown.classList.contains('hidden')}`);
        });

        document.addEventListener('click', (event) => {
            if (!chatSettingsDropdown.classList.contains('hidden') && chatSettingsButton && !chatSettingsButton.contains(event.target)) {
                chatSettingsDropdown.classList.add('hidden');
                console.log("[initializeApp] Chat settings dropdown hidden due to outside click.");
            }
            if (!dropdownMenu.classList.contains('hidden') && menuButton && !menuButton.contains(event.target)) {
                dropdownMenu.classList.add('hidden');
                console.log("[initializeApp] Main dropdown hidden due to outside click.");
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
                    // Ensure correct classes are removed/added. Your HTML uses classes like 'dark-bg' and 'pattern-bg' directly.
                    messageContainer.classList.remove('default-bg', 'dark-bg', 'pattern-bg');
                    if (bgTheme !== 'default') {
                        messageContainer.classList.add(`${bgTheme}`); // Add the class as it is (e.g., 'dark-bg', 'pattern-bg')
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
                    console.warn("[setupChatSettingsDropdown] Cannot set nickname: currentUser not logged in.");
                    showCustomMessage("Error: You are not logged in to set a nickname.", 'error');
                } else {
                    console.warn("[setupChatSettingsDropdown] Nickname input is empty.");
                }
            });
        } else {
            console.warn("[setupChatSettingsDropdown] Nickname input or set nickname button not found.");
        }

        const messageSearchInput = document.getElementById('messageSearchInput');
        const searchMessagesButton = document.getElementById('searchMessagesButton');
        if (messageSearchInput && searchMessagesButton) {
            searchMessagesButton.addEventListener('click', () => {
                console.log("[setupChatSettingsDropdown] Search messages button clicked.");
                const searchTerm = messageSearchInput.value.trim();
                console.log('Searching messages for:', searchTerm, '(functionality to be implemented)');
                showCustomMessage(`Searching messages for '${searchTerm}' (functionality to be implemented).`, "info");
            });
        } else {
            console.warn("[setupChatSettingsDropdown] Message search input or button not found.");
        }
    } catch (e) {
        console.error("Caught error in setupChatSettingsDropdown:", e);
    }
}

/**
 * Aktualizuje tytuł zakładki przeglądarki na podstawie statusu nieprzeczytanych wiadomości.
 * - Jeśli brak nieprzeczytanych: "Komunikator"
 * - Jeśli 1 nieprzeczytana konwersacja: "(1) [Nazwa_Nadawcy] - Komunikator"
 * - Jeśli >1 nieprzeczytanych konwersacji: "([Liczba_Konwersacji]) Komunikator"
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
 * Aktualizuje licznik nieprzeczytanych wiadomości dla danego pokoju w Supabase.
 * Jeśli rekord nie istnieje, zostanie utworzony.
 * @param {string} roomId - ID pokoju czatu.
 * @param {string} senderId - ID użytkownika, który wysłał wiadomość.
 */
async function updateUnreadMessageCountInSupabase(roomId, senderId) {
    if (!supabase || !currentUser || !currentUser.id) {
        console.warn("[Supabase] Supabase client or currentUser not set. Cannot update unread message count.");
        return;
    }
    try {
        const { data, error } = await supabase
            .from('unread_messages')
            .upsert({
                user_id: currentUser.id,
                room_id: roomId,
                count: 1, // Zawsze dodaj 1, a `onConflict` obsłuży inkrementację
                last_sender_id: senderId,
                updated_at: new Date().toISOString()
            }, {
                onConflict: 'user_id, room_id', // Jeśli konflikt, zaktualizuj
                ignoreDuplicates: false // Ważne: to musi być false, aby konflikt był wykryty
            });

        if (error) {
            // Jeśli wystąpił konflikt (rekord już istnieje), spróbuj go zaktualizować poprzez inkrementację
            if (error.code === '23505' || error.message.includes('duplicate key')) { // PostgreSQL unique violation code
                console.log(`[Supabase] Record for room ${roomId} already exists, attempting to increment.`);
                const { data: updateData, error: updateError } = await supabase
                    .from('unread_messages')
                    .update({
                        count: (unreadConversationsInfo.get(roomId)?.unreadCount || 0) + 1, // Pobierz obecny licznik z mapy i inkrementuj
                        last_sender_id: senderId,
                        updated_at: new Date().toISOString()
                    })
                    .eq('user_id', currentUser.id)
                    .eq('room_id', roomId);

                if (updateError) {
                    console.error("[Supabase] Error incrementing unread message count:", updateError);
                } else {
                    console.log(`[Supabase] Unread count for room ${roomId} incremented for user ${currentUser.id}.`);
                }
            } else {
                console.error("[Supabase] Error inserting/upserting unread message count:", error);
            }
        } else {
            console.log(`[Supabase] Unread count for room ${roomId} updated (upsert) for user ${currentUser.id}.`);
        }
        // Po udanej operacji w bazie, załaduj ponownie dane i zaktualizuj UI
        await loadUnreadMessagesFromSupabase();

    } catch (e) {
        console.error("[Supabase] Caught error updating unread message count:", e);
    }
}


/**
 * Zeruje licznik nieprzeczytanych wiadomości dla danego pokoju w Supabase.
 * @param {string} roomId - ID pokoju czatu do wyzerowania.
 */
async function clearUnreadMessageCountInSupabase(roomId) {
    if (!supabase || !currentUser || !currentUser.id) {
        console.warn("[Supabase] Supabase client or currentUser not set. Cannot clear unread message count.");
        return;
    }
    try {
        const { data, error } = await supabase
            .from('unread_messages')
            .update({
                count: 0,
                last_sender_id: null,
                updated_at: new Date().toISOString()
            })
            .eq('user_id', currentUser.id)
            .eq('room_id', roomId);

        if (error) {
            console.error("[Supabase] Error clearing unread message count:", error);
        } else {
            console.log(`[Supabase] Unread count for room ${roomId} cleared for user ${currentUser.id}.`);
        }
        // Po udanej operacji w bazie, załaduj ponownie dane i zaktualizuj UI
        await loadUnreadMessagesFromSupabase();
    } catch (e) {
        console.error("[Supabase] Caught error clearing unread message count:", e);
    }
}

/**
 * Ładuje wszystkie nieprzeczytane wiadomości dla bieżącego użytkownika z Supabase
 * i aktualizuje lokalną mapę `unreadConversationsInfo` oraz UI.
 */
async function loadUnreadMessagesFromSupabase() {
    if (!supabase || !currentUser || !currentUser.id) {
        console.warn("[Supabase Loader] Supabase client or currentUser not set. Cannot load unread messages.");
        return;
    }
    try {
        const { data, error } = await supabase
            .from('unread_messages')
            .select('room_id, count, last_sender_id')
            .eq('user_id', currentUser.id);

        if (error) {
            console.error("[Supabase Loader] Error fetching unread messages:", error);
            return;
        }

        unreadConversationsInfo.clear(); // Clear existing local data
        data.forEach(record => {
            if (record.count > 0) {
                unreadConversationsInfo.set(record.room_id, {
                    unreadCount: record.count,
                    lastSenderId: record.last_sender_id
                });
            }
            // Update UI for each conversation item
            const convoItem = contactsListEl.querySelector(`.contact[data-room-id="${record.room_id}"]`);
            if (convoItem) {
                const unreadCountEl = convoItem.querySelector('.unread-count');
                if (unreadCountEl) {
                    if (record.count > 0) {
                        unreadCountEl.textContent = record.count;
                        unreadCountEl.classList.remove('hidden');
                    } else {
                        unreadCountEl.textContent = ''; // ZMIANA: Wyczyszczono tekst
                        unreadCountEl.classList.add('hidden');
                    }
                }
            }
        });
        console.log("[Supabase Loader] unreadConversationsInfo updated from Supabase:", unreadConversationsInfo);
        updateDocumentTitle(); // Update browser tab title based on new data
    } catch (e) {
        console.error("[Supabase Loader] Caught error loading unread messages from Supabase:", e);
    }
}


// --- Główna inicjalizacja aplikacji ---
/**
 * Main function to initialize the entire application.
 * Fetches DOM elements, checks user session, loads data, and sets up event listeners.
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

        // NOWY ELEMENT: Przycisk do włączania dźwięków
        enableSoundButton = document.getElementById('enableSoundButton'); console.log(`UI Element: enableSoundButton found: ${!!enableSoundButton}`);


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

        // Aktualizacja tej linii
        messageContainer = document.getElementById('messageContainer'); 
        console.log(`UI Element: messageContainer found: ${!!messageContainer}`); // Dostosowane logowanie

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
            mainHeader, menuButton, dropdownMenu, themeToggle, logoutButton, enableSoundButton, 
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
            // Check for null or undefined. For NodeLists, also check if length is 0 (like navIcons)
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
        
        currentUser = session.user; // Ensure currentUser is set from Supabase
        console.log('[initializeApp] Current authenticated user ID:', currentUser.id, 'Email:', currentUser.email);

        // Handle offline status before page unload
        window.addEventListener('beforeunload', () => {
            if (socket && socket.readyState === WebSocket.OPEN && currentUser) {
                console.log(`[beforeunload] Sending 'leave' signal for user ${currentUser.id}.`);
                try {
                    socket.send(JSON.stringify({
                        type: 'leave',
                        name: currentUser.id,
                        room: currentRoom || 'global'
                    }));
                    // ZMIANA: Wyślij status "offline" z timestampem przy zamykaniu strony
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

        // 4. Load profiles and contacts
        console.log("[initializeApp] Loading user profiles and contacts...");
        await loadAllProfiles();
        await loadContacts(); // This now calls loadUnreadMessagesFromSupabase internally
        console.log("[initializeApp] User profiles and contacts loaded.");

        // 5. Initialize WebSocket connection
        console.log("[initializeApp] Initializing WebSocket connection...");
        initWebSocket();

        // 6. Set up message sending functionality
        console.log("[initializeApp] Setting up message sending functionality...");
        setupSendMessage();

        // 7. Set default UI state on load
        console.log("[initializeApp] Setting default UI state...");
        // This is important: initially hide chatArea and show logoScreen on desktop
        // On mobile, chatArea will be active only when a conversation is clicked.
        if (window.matchMedia('(min-width: 769px)').matches) {
            if (chatArea) chatArea.classList.remove('active'); // Ensure chatArea is not active by default
            if (logoScreen) logoScreen.classList.remove('hidden'); // Show logo screen on desktop init
            console.log("[initializeApp] Desktop initial state: chatArea inactive, logoScreen visible.");
        } else {
            // On mobile, chatArea is initially hidden, logoScreen is also hidden by CSS
            if (chatArea) chatArea.classList.remove('active');
            if (logoScreen) logoScreen.classList.add('hidden'); // Ensure hidden on mobile init
            console.log("[initializeApp] Mobile initial state: chatArea inactive, logoScreen hidden.");
        }
        
        if (messageInput) messageInput.disabled = true;
        if (sendButton) sendButton.disabled = true;

        // 8. Add general event listeners for the application UI
        console.log("[initializeApp] Attaching general UI event listeners...");
        backButton.addEventListener('click', () => {
            console.log('[backButton] Back button clicked (UI)');
            
            // Wysyłamy wiadomość 'leave' do serwera, informując go, że opuszczamy obecny pokój czatu
            if (socket && socket.readyState === WebSocket.OPEN && currentRoom && currentRoom !== 'global') {
                socket.send(JSON.stringify({
                    type: 'leave',
                    name: currentUser.id,
                    room: currentRoom 
                }));
                console.log(`[backButton] Sent leave message to WebSocket for room: ${currentRoom}`);
            }
            
            resetChatView(); 

            if (window.matchMedia('(max-width: 768px)').matches) {
                console.log("[backButton] Mobile view logic triggered. Showing sidebar.");
                if (sidebarWrapper) {
                    sidebarWrapper.classList.remove('hidden-on-mobile'); 
                    console.log("[backButton] Mobile: sidebarWrapper visible.");
                } else { console.warn("[backButton] Mobile: sidebarWrapper not found."); }
                
                if (chatAreaWrapper) {
                    chatAreaWrapper.classList.remove('active-on-mobile'); 
                    chatAreaWrapper.style.display = 'none'; 
                    console.log("[backButton] Mobile: chatAreaWrapper deactivated and hidden.");
                } else { console.warn("[backButton] Mobile: chatAreaWrapper not found."); }
                
                if (chatArea) {
                    chatArea.classList.remove('active'); 
                    console.log("[backButton] Mobile: chatArea deactivated.");
                } else { console.warn("[backButton] Mobile: chatArea not found."); }
                
                if (logoScreen) {
                    logoScreen.classList.add('hidden'); 
                    console.log("[backButton] Mobile: logoScreen hidden.");
                } else { console.warn("[backButton] Mobile: logoScreen not found."); }
                
                if (backButton) {
                    backButton.style.display = 'none'; 
                    console.log("[backButton] Mobile: backButton hidden.");
                } else { console.warn("[backButton] Mobile: backButton not found."); }
                
                if (rightSidebarWrapper) {
                    rightSidebarWrapper.style.display = 'none';
                    console.log("[backButton] Mobile: rightSidebarWrapper hidden.");
                } else { console.warn("[backButton] Mobile: rightSidebarWrapper not found."); }


            } else {
                console.log("[backButton] Desktop view logic triggered. Showing logo screen.");
                if (logoScreen) {
                    logoScreen.classList.remove('hidden'); 
                    console.log("[backButton] Desktop: logoScreen visible.");
                } else { console.warn("[backButton] Desktop: logoScreen not found."); }
                
                if (chatArea) {
                    chatArea.classList.remove('active'); 
                    console.log("[backButton] Desktop: chatArea deactivated.");
                } else { console.warn("[backButton] Desktop: chatArea not found."); }
                
                if (chatAreaWrapper) {
                    chatAreaWrapper.classList.remove('active-on-mobile'); 
                    chatAreaWrapper.style.display = 'flex'; 
                    console.log("[backButton] Desktop: chatAreaWrapper set to flex.");
                } else { console.warn("[backButton] Desktop: chatAreaWrapper not found."); }
            }
        });

        menuButton.addEventListener('click', (event) => {
            event.stopPropagation(); 
            dropdownMenu.classList.toggle('hidden'); 
            console.log(`[initializeApp] Menu dropdown toggled. Hidden: ${dropdownMenu.classList.contains('hidden')}`);
        });

        document.addEventListener('click', (event) => {
            if (!chatSettingsDropdown.classList.contains('hidden') && chatSettingsButton && !chatSettingsButton.contains(event.target)) {
                chatSettingsDropdown.classList.add('hidden');
                console.log("[initializeApp] Chat settings dropdown hidden due to outside click.");
            }
            if (!dropdownMenu.classList.contains('hidden') && menuButton && !menuButton.contains(event.target)) {
                dropdownMenu.classList.add('hidden');
                console.log("[initializeApp] Main dropdown hidden due to outside click.");
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
            // Send offline status before logging out
            if (socket && socket.readyState === WebSocket.OPEN && currentUser) {
                try {
                    socket.send(JSON.stringify({
                        type: 'status',
                        user: currentUser.id,
                        online: false,
                        last_seen: new Date().toISOString() // ZMIANA: Wyslij timestamp last_seen przy wylogowaniu
                    }));
                    console.log(`[logoutButton] Sent 'offline' status for user ${currentUser.id} before logging out.`);
                } catch (sendError) {
                    console.warn(`[logoutButton] Failed to send offline status: ${sendError.message}`);
                }
            }

            // No Firestore listener to detach here, as we are using Supabase for unread messages.
            // unreadConversationsInfo.clear(); // Clear local unread info (handled by loadUnreadMessagesFromSupabase on next login)
            // updateDocumentTitle(); // Reset title (handled by loadUnreadMessagesFromSupabase on next login)

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

        // Listener dla nowego przycisku włączającego dźwięki
        if (enableSoundButton) {
            enableSoundButton.addEventListener('click', () => {
                console.log("[Autoplay Check] 'Enable Sound' button clicked.");
                ensureAudioContext(); // Wywołaj ensureAudioContext, aby wznowić kontekst
                playNotificationSound(); // Odtwórz dźwięk natychmiast po kliknięciu
                localStorage.setItem('autoplayUnlocked', 'true'); // Zapisz, że użytkownik odblokował autoplay
                enableSoundButton.classList.add('hidden'); // Ukryj przycisk po kliknięciu
            });
        }


        function handleMediaQueryChange(mq) {
            console.log(`[handleMediaQueryChange] Media query listener triggered. mq.matches: ${mq.matches} (max-width: 768px)`);
            if (mq.matches) {
                console.log("[handleMediaQueryChange] Mobile view activated. Adjusting initial visibility for mobile.");
                if (sidebarWrapper) {
                    sidebarWrapper.classList.remove('hidden-on-mobile'); 
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
            } else { // Widok desktopowy/tabletowy (min-width: 769px)
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
                
                // On desktop, logoScreen should be visible by default, chatArea should be hidden unless a chat is active
                if (logoScreen) {
                    // Only show logoScreen if no chat is currently selected
                    if (!currentChatUser) { // If no current chat user, show logo screen
                        logoScreen.classList.remove('hidden'); 
                        console.log("[handleMediaQueryChange] Desktop: logoScreen visible (no current chat user).");
                    } else { // If a chat is active, ensure logo screen is hidden
                        logoScreen.classList.add('hidden');
                        console.log("[handleMediaQueryChange] Desktop: logoScreen hidden (chat active).");
                    }
                } else { console.warn("[handleMediaQueryChange] Desktop: logoScreen not found in mq change."); }
                
                if (chatArea) {
                    // Only activate chatArea if a chat is currently selected
                    if (currentChatUser) { // If current chat user, ensure chatArea is active
                        chatArea.classList.add('active'); 
                        console.log("[handleMediaQueryChange] Desktop: chatArea activated (current chat user).");
                    } else { // If no chat active, ensure chatArea is not active
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

        // Attach media query listener and call handler initially
        const mq = window.matchMedia('(max-width: 768px)');
        mq.addListener(handleMediaQueryChange);
        handleMediaQueryChange(mq); // Initial call to set correct layout

        // Now that the app is initialized, request notification permission
        await requestNotificationPermission();
        
        // Sprawdź politykę Autoplay po inicjalizacji
        checkAudioAutoplay();

        // Tytuł zakładki będzie aktualizowany po załadowaniu nieprzeczytanych wiadomości z Supabase
        updateDocumentTitle(); // Ustawienie początkowego tytułu na "Komunikator"

        console.log("[initializeApp] Komunikator application initialized successfully.");
    } catch (e) {
        console.error("[initializeApp] Caught a critical error during initialization:", e);
        showCustomMessage("Wystąpił nieoczekiwany błąd podczas uruchamiania aplikacji. Spróbuj odświeżyć stronę.", "error");
    }
}

// Run the application after the DOM is fully loaded
document.addEventListener('DOMContentLoaded', initializeApp);
