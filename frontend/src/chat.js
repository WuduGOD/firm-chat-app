// Importy z Twojego oryginalnego chat.js
// WAŻNE: Upewnij się, że te pliki są dostępne w Twoim projekcie w odpowiednich ścieżkach
import { loadAllProfiles, getUserLabelById } from './profiles.js';
import { supabase } from './supabaseClient.js';

// Globalne zmienne UI i czatu - zadeklarowane na początku, aby były dostępne wszędzie
let appContainer;
let conversationListEl; // Zmieniona nazwa, aby uniknąć kolizji z lokalną zmienną `conversationList` w `initChatApp`
let messagesDiv;
let messageInput;
let sendMessageBtn;
let chatHeaderName;
let chatHeaderAvatar;
let chatStatusSpan;
let typingIndicatorDiv;
let backToListBtn;
let accountIcon;
let accountPanel;
let closeAccountBtn;
let flowBar;
let contextCapsule;
let closeCapsuleBtn;
let whisperModeBtn;
let chatContentView;
let chatInputArea;
let navIcons;
let searchInput;
let filterBtn;

let currentUser = null;
let currentChatUser = null;
let currentRoom = null;
let socket = null;
let reconnectAttempts = 0;
let typingTimeout; // Dla wskaźnika pisania
let currentActiveConvoItem = null; // Aby śledzić aktywny element listy konwersacji do usuwania klasy 'active'
let whisperModeActive = false;


// Funkcja resetująca widok czatu (odpowiednik U() w Twoim zminifikowanym kodzie)
function resetChatView() {
    console.log("Resetting chat view...");
    if (messagesDiv) {
        messagesDiv.innerHTML = ""; // Clear chat content
    }
    if (messageInput) {
        messageInput.disabled = true;
        messageInput.value = "";
    }
    if (sendMessageBtn) {
        sendMessageBtn.disabled = true;
    }
    if (chatHeaderName) {
        chatHeaderName.textContent = "";
    }
    if (chatHeaderAvatar) {
        chatHeaderAvatar.src = "";
    }
    if (chatStatusSpan) {
        chatStatusSpan.textContent = "";
    }
    if (typingIndicatorDiv) {
        typingIndicatorDiv.classList.add('hidden'); // Ukryj wskaźnik pisania
    }

    currentChatUser = null;
    currentRoom = null;

    // Upewnij się, że panel czatu jest ukryty, jeśli nie ma wybranej konwersacji
    if (appContainer && appContainer.classList.contains('chat-open')) {
        appContainer.classList.remove('chat-open');
    }

    if (currentActiveConvoItem) {
        currentActiveConvoItem.classList.remove('active');
        currentActiveConvoItem = null;
    }

    // Wyłącz tryb szeptu po powrocie do listy
    if (whisperModeActive && chatContentView && chatInputArea && whisperModeBtn) {
        chatContentView.classList.remove('blurred-focus');
        chatInputArea.classList.remove('blurred-focus-input');
        whisperModeBtn.classList.remove('active');
        whisperModeActive = false;
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
    return [user1Id, user2Id].sort().join('_');
}

/**
 * Asynchronicznie pobiera ostatnią wiadomość dla danego pokoju czatu z Supabase.
 * @param {string} roomId - ID pokoju czatu.
 * @returns {Promise<Object|null>} Obiekt ostatniej wiadomości lub null, jeśli brak wiadomości.
 */
async function getLastMessageForRoom(roomId) {
    // Zakładamy, że twoja tabela z wiadomościami nazywa się 'messages'
    const { data, error } = await supabase
        .from('messages')
        .select('text, username, inserted_at') // Pobieramy tekst, ID nadawcy i czas
        .eq('room', roomId)
        .order('inserted_at', { ascending: false }) // Sortujemy od najnowszej
        .limit(1); // Ograniczamy do jednej (najnowszej) wiadomości

    if (error) {
        console.error('Błąd podczas pobierania ostatniej wiadomości:', error);
        return null;
    }
    // Zwróć pierwszą (najnowszą) wiadomość, lub null, jeśli nie ma wiadomości
    return data && data.length > 0 ? data[0] : null;
}

// *** NOWA FUNKCJA: Sortowanie konwersacji ***
function sortConversations(conversations) {
    return [...conversations].sort((a, b) => {
        const timeA = a.lastMessage ? new Date(a.lastMessage.inserted_at) : new Date(0); // Starsze wiadomości na dole
        const timeB = b.lastMessage ? new Date(b.lastMessage.inserted_at) : new Date(0);
        return timeB.getTime() - timeA.getTime(); // Sortuj od najnowszej
    });
}


async function loadContacts() {
    console.log("Loading contacts...");
    const { data: users, error } = await supabase.rpc('get_other_users', { current_email: currentUser.email });
    if (error) {
        console.error('Błąd ładowania kontaktów:', error);
        return;
    }

    if (conversationListEl) {
        conversationListEl.innerHTML = ''; // Wyczyść listę konwersacji
    } else {
        console.error("conversationListEl element not found!");
        return;
    }

    // Używamy Promise.all, aby jednocześnie pobrać ostatnie wiadomości dla wszystkich kontaktów
    const contactsWithLastMessage = await Promise.all(users.map(async user => {
        // Upewnij się, że currentUser.id jest stringiem, bo sort() może inaczej działać z różnymi typami
        const roomId = getRoomName(String(currentUser.id), String(user.id));
        const lastMessage = await getLastMessageForRoom(roomId);
        return { user, lastMessage, roomId };
    }));

    // *** SORTOWANIE KONWERSACJI ***
    const sortedContacts = sortConversations(contactsWithLastMessage);

    sortedContacts.forEach(({ user, lastMessage, roomId }) => {
        const convoItem = document.createElement('div');
        convoItem.classList.add('convo-item');
        convoItem.dataset.convoId = user.id;
        convoItem.dataset.email = user.email;
        convoItem.dataset.roomId = roomId; // Przechowuj roomId na elemencie dla łatwej aktualizacji

        const avatarSrc = `https://i.pravatar.cc/150?img=${user.id % 70 + 1}`; // Tymczasowy losowy avatar

        let previewText = "Brak wiadomości";
        let timeText = "";

        if (lastMessage) {
            // Sprawdzamy, czy nadawcą jestem ja, czy inny użytkownik
            const senderName = String(lastMessage.username) === String(currentUser.id) ? "Ja" : (getUserLabelById(lastMessage.username) || lastMessage.username);
            previewText = `${senderName}: ${lastMessage.text}`;

            const lastMessageTime = new Date(lastMessage.inserted_at);
            timeText = lastMessageTime.toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" });
        }

        convoItem.innerHTML = `
            <img src="${avatarSrc}" alt="Avatar" class="convo-avatar">
            <div class="convo-info">
                <div class="convo-name">${getUserLabelById(user.id) || user.email}</div>
                <div class="convo-preview">${previewText}</div>
            </div>
            <span class="convo-time">${timeText}</span>
            <span class="unread-count hidden">0</span>
        `;

        convoItem.addEventListener('click', () => {
            handleConversationClick(user, convoItem);
        });

        conversationListEl.appendChild(convoItem);
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
    // Upewnij się, że currentUser.id jest dostępne (ustawiane w initializeApp)
    currentRoom = getRoomName(String(currentUser.id), String(currentChatUser.id)); // Upewnij się, że ID są stringami
    console.log(`Starting chat with ${currentChatUser.username}, room ID: ${currentRoom}`);

    if (chatHeaderName && chatHeaderAvatar && messageInput && sendMessageBtn) {
        chatHeaderName.textContent = currentChatUser.username;
        chatHeaderAvatar.src = `https://i.pravatar.cc/150?img=${user.id % 70 + 1}`;
        messageInput.disabled = false; // Aktywuj pole wiadomości
        sendMessageBtn.disabled = false; // Aktywuj przycisk wysyłania
        messageInput.focus();
    }

    if (appContainer) {
        appContainer.classList.add('chat-open');
        console.log('Added "chat-open" class to app-container.');
    } else {
        console.error('appContainer not found to add chat-open class.');
    }

    // Usunięcie animacji (lub nieprzeczytanych) po kliknięciu
    const unreadCount = clickedConvoItemElement.querySelector('.unread-count');
    if (unreadCount) {
        unreadCount.classList.add('animate-activity'); // To była animacja, nie reset
        setTimeout(() => {
            unreadCount.classList.remove('animate-activity');
            unreadCount.textContent = '0'; // Resetuj licznik nieprzeczytanych
            unreadCount.classList.add('hidden'); // Ukryj, jeśli 0
        }, 500);
    }

    // WAŻNE: Wyślij wiadomość 'join' do WebSocket
    if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({
            type: 'join',
            name: currentUser.id, // Upewnij się, że to jest ID użytkownika
            room: currentRoom,
        }));
        console.log(`Sent join message to WebSocket for room: ${currentRoom}`);
    } else {
        // Jeśli WebSocket nie jest otwarty, spróbuj go zainicjować
        // i wiadomość 'join' zostanie wysłana po otwarciu w socket.onopen
        console.warn("WebSocket not open, attempting to re-initialize and join on open.");
        initWebSocket();
    }
}

function setupSendMessage() {
    if (!messageInput || !sendMessageBtn || !messagesDiv) {
        console.error("Message input or send button or messagesDiv not found for setup.");
        return;
    }

    messageInput.addEventListener('input', () => {
        // Wysyłaj sygnał pisania tylko jeśli jest aktywny pokój czatu
        if (currentRoom && socket && socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({
                type: 'typing',
                username: currentUser.id, // Kto pisze
                room: currentRoom, // W którym pokoju pisze
            }));
            // console.log(`Sent typing signal for room: ${currentRoom}`); // Możesz odkomentować dla debugowania
        }
    });

    sendMessageBtn.onclick = () => {
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
            inserted_at: new Date().toISOString() // Dodaj znacznik czasu dla wiadomości wysyłanej
        };

        console.log("Sending message via WS:", msgData);
        socket.send(JSON.stringify(msgData));
        messageInput.value = '';
        messageInput.focus();
    };

    messageInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            sendMessageBtn.click();
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

    // 1. Aktualizacja podglądu konwersacji na liście (convo-item)
    // Znajdź odpowiedni element convo-item używając data-room-id
    const convoItemToUpdate = conversationListEl.querySelector(`.convo-item[data-room-id="${msg.room}"]`);

    if (convoItemToUpdate) {
        const previewEl = convoItemToUpdate.querySelector('.convo-preview');
        const timeEl = convoItemToUpdate.querySelector('.convo-time');

        if (previewEl && timeEl) {
            // Sprawdzamy, czy nadawcą jestem ja, czy inny użytkownik
            const senderName = String(msg.username) === String(currentUser.id) ? "Ja" : (getUserLabelById(msg.username) || msg.username);
            previewEl.textContent = `${senderName}: ${msg.text}`;

            const timestamp = new Date(msg.inserted_at || Date.now());
            timeEl.textContent = timestamp.toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" });
        }

        // Jeśli wiadomość nie jest dla aktywnie otwartego pokoju, przenieś ją na górę i zwiększ licznik nieprzeczytanych
        if (msg.room !== currentRoom) {
            conversationListEl.prepend(convoItemToUpdate); // Przenieś element na początek listy

            const unreadCountEl = convoItemToUpdate.querySelector('.unread-count');
            if (unreadCountEl) {
                let currentUnread = parseInt(unreadCountEl.textContent, 10);
                if (isNaN(currentUnread)) currentUnread = 0; // Upewnij się, że to liczba
                unreadCountEl.textContent = currentUnread + 1;
                unreadCountEl.classList.remove('hidden'); // Pokaż licznik
                unreadCountEl.classList.add('animate-activity'); // Dodaj animację
                setTimeout(() => unreadCountEl.classList.remove('animate-activity'), 500); // Usuń animację po chwili
            }
        }
    }


    // 2. Dodanie wiadomości do aktywnego widoku czatu (tylko jeśli wiadomość jest dla aktywnego pokoju)
    if (msg.room !== currentRoom) {
        console.log("Wiadomość nie jest dla aktywnego pokoju, nie dodaję do widoku czatu.");
        return;
    }

    const div = document.createElement('div');
    // Klasa 'sent' jeśli wysłana przez bieżącego użytkownika, 'received' w przeciwnym razie
    div.classList.add('message-wave', String(msg.username) === String(currentUser.id) ? 'sent' : 'received', 'animate-in');

    const timestamp = new Date(msg.inserted_at || Date.now());
    const timeString = timestamp.toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" });

    div.innerHTML = `
        <p>${msg.text}</p>
        <span class="message-time">${timeString}</span>
    `;
    if (messagesDiv) {
        messagesDiv.appendChild(div);
        // Przewiń do najnowszej wiadomości
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
    } else {
        console.error("messagesDiv is null when trying to add message.");
    }
}

function updateUserStatusIndicator(userId, isOnline) {
    if (currentChatUser && String(currentChatUser.id) === String(userId) && chatStatusSpan) {
        chatStatusSpan.textContent = isOnline ? 'Online' : 'Offline';
        chatStatusSpan.classList.toggle('online', isOnline);
        chatStatusSpan.classList.toggle('offline', !isOnline);
        console.log(`Status for ${getUserLabelById(userId)} changed to: ${isOnline ? 'Online' : 'Offline'}`);
    }
}

function showTypingIndicator(usernameId) {
    if (currentChatUser && String(usernameId) === String(currentChatUser.id) && typingIndicatorDiv) {
        typingIndicatorDiv.classList.remove('hidden');
        clearTimeout(typingTimeout);
        typingTimeout = setTimeout(() => {
            typingIndicatorDiv.classList.add('hidden');
        }, 3000); // Ukryj po 3 sekundach braku aktywności
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
                if (messagesDiv) {
                    messagesDiv.innerHTML = ''; // Wyczyść istniejące wiadomości przed załadowaniem historii
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
        if (event.code !== 1000) { // Sprawdź, czy zamknięcie nie jest normalne
            console.log('Attempting to reconnect...');
            // Stopniowo zwiększaj opóźnienie ponownego łączenia, do max 10 sekund
            setTimeout(initWebSocket, Math.min(1000 * ++reconnectAttempts, 10000));
        }
    };

    socket.onerror = (error) => {
        console.error('Błąd WebSocket:', error);
        // Jeśli wystąpi błąd, zamknij połączenie, aby onclose mogło spróbować ponownie
        if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
            socket.close();
        }
    };
}


// GŁÓWNA FUNKCJA INICJALIZUJĄCA CAŁĄ APLIKACJĘ
async function initializeApp() { // Usunięto 'export'
    console.log("Initializing Flow chat application...");

    // 1. Pobieranie referencji do wszystkich elementów DOM
    appContainer = document.querySelector('.app-container');
    conversationListEl = document.querySelector('.conversation-list');
    messagesDiv = document.querySelector('.chat-content-view');
    messageInput = document.querySelector('.message-input');
    sendMessageBtn = document.querySelector('.send-message-btn');
    backToListBtn = document.querySelector('.back-to-list-btn');
    accountIcon = document.querySelector('.account-icon');
    accountPanel = document.querySelector('.account-panel');
    closeAccountBtn = document.querySelector('.close-account-btn');
    flowBar = document.querySelector('.flow-bar');
    contextCapsule = document.querySelector('.context-capsule');
    closeCapsuleBtn = document.querySelector('.close-capsule-btn');
    whisperModeBtn = document.querySelector('.whisper-mode-btn');
    chatContentView = document.querySelector('.chat-content-view');
    chatInputArea = document.querySelector('.chat-input-area');
    navIcons = document.querySelectorAll('.nav-icon');
    searchInput = document.querySelector('.search-input');
    filterBtn = document.querySelector('.filter-btn');

    chatHeaderName = document.querySelector('.chat-header-name');
    chatHeaderAvatar = document.querySelector('.chat-header-avatar');
    chatStatusSpan = document.querySelector('.chat-status');
    typingIndicatorDiv = document.querySelector('.typing-indicator');

    // 2. Walidacja, czy kluczowe elementy UI zostały znalezione
    if (!appContainer || !conversationListEl || !messagesDiv || !messageInput || !sendMessageBtn || !chatHeaderName || !chatHeaderAvatar || !chatStatusSpan) {
        console.error('Error: One or more critical UI elements not found. Please check your HTML selectors.');
        return;
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
    await loadAllProfiles(); // Zakładamy, że to ładuje dane potrzebne getUserLabelById
    await loadContacts();

    // 5. Inicjalizacja WebSocket
    // WebSocket zostanie zainicjowany, ale do pokoju dołączy dopiero po kliknięciu konwersacji
    initWebSocket();

    // 6. Ustawienie obsługi wysyłania wiadomości
    setupSendMessage();

    // 7. Ustawienie domyślnego stanu UI po załadowaniu
    appContainer.classList.remove('chat-open');
    messageInput.disabled = true;
    sendMessageBtn.disabled = true;

    // 8. Dodatkowe event listenery dla całej aplikacji
    if (backToListBtn) {
        backToListBtn.addEventListener('click', () => {
            console.log('Back to list button clicked (UI)');
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
        });
    }

    if (accountIcon && accountPanel && closeAccountBtn) {
        accountIcon.addEventListener('click', () => {
            console.log('Account icon clicked (UI)');
            accountPanel.style.visibility = 'visible'; // Upewnij się, że ten styl jest ustawiany
            accountPanel.classList.remove('hidden');
            accountPanel.classList.add('active');
        });
        closeAccountBtn.addEventListener('click', () => {
            console.log('Close account button clicked (UI)');
            accountPanel.classList.remove('active');
            setTimeout(() => {
                accountPanel.style.visibility = 'hidden';
                accountPanel.classList.add('hidden');
            }, 300);
        });
    }

    if (flowBar && contextCapsule && closeCapsuleBtn) {
        flowBar.addEventListener('click', () => {
            console.log('Flow bar clicked (UI)');
            contextCapsule.classList.remove('hidden');
            setTimeout(() => { contextCapsule.classList.add('active'); }, 10);
        });
        closeCapsuleBtn.addEventListener('click', () => {
            console.log('Close context capsule button clicked (UI)');
            contextCapsule.classList.remove('active');
            setTimeout(() => { contextCapsule.classList.add('hidden'); }, 300);
        });
    }

    if (whisperModeBtn && chatContentView && chatInputArea) {
        whisperModeBtn.addEventListener('click', () => {
            console.log('Whisper mode button clicked (UI)');
            whisperModeActive = !whisperModeActive;
            chatContentView.classList.toggle('blurred-focus', whisperModeActive);
            chatInputArea.classList.toggle('blurred-focus-input', whisperModeActive);
            whisperModeBtn.classList.toggle('active', whisperModeActive);
        });
    }

    if (navIcons.length > 0) {
        navIcons.forEach(icon => {
            icon.addEventListener('click', () => {
                console.log('Nav icon clicked:', icon.getAttribute('data-tooltip'));
                navIcons.forEach(i => i.classList.remove('active'));
                icon.classList.add('active');
            });
        });
        const defaultActiveIcon = document.querySelector('.nav-icon[data-tooltip="Czat"]'); // Upewnij się, że jest to właściwy tooltip dla czatu
        if (defaultActiveIcon) {
            defaultActiveIcon.classList.add('active');
        }
    }

    const tooltip = document.createElement('div');
    tooltip.classList.add('tooltip');
    document.body.appendChild(tooltip);

    document.querySelectorAll('[data-tooltip]').forEach(element => {
        element.addEventListener('mouseenter', (e) => {
            const text = e.target.getAttribute('data-tooltip');
            if (text) {
                tooltip.textContent = text;
                tooltip.style.opacity = '1';
                tooltip.style.pointerEvents = 'auto';

                const rect = e.target.getBoundingClientRect();
                const isSidebarElement = e.target.closest('.sidebar');
                if (isSidebarElement) {
                    tooltip.style.left = `${rect.right + 10}px`;
                    tooltip.style.top = `${rect.top + rect.height / 2 - tooltip.offsetHeight / 2}px`;
                    tooltip.style.transform = 'none';
                } else {
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

    if (searchInput && filterBtn) {
        searchInput.addEventListener('focus', () => {
            console.log('Search input focused.');
            searchInput.style.width = '180px';
            filterBtn.style.opacity = '1';
            filterBtn.classList.remove('hidden'); // Upewnij się, że przycisk się pojawia
        });

        searchInput.addEventListener('blur', () => {
            if (searchInput.value === '') {
                console.log('Search input blurred and empty.');
                searchInput.style.width = '120px';
                filterBtn.style.opacity = '0';
                setTimeout(() => { filterBtn.classList.add('hidden'); }, 300); // Ukryj po animacji
            }
        });
    }

    console.log("Flow chat application initialization complete. Ready!");
} // <-- Upewnij się, że ten nawias jest, zamyka initializeApp


// WAŻNE: Dodaj tę linię na samym końcu pliku,
// aby initializeApp uruchomiła się automatycznie po załadowaniu DOM.
document.addEventListener("DOMContentLoaded", initializeApp);