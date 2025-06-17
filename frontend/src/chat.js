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

let sidebarEl; // Używane również jako conversationsListEl
let searchInput;
let contactsListEl; // Zakładamy, że to jest również sidebarEl lub element w jego obrębie

let chatAreaWrapper;
let logoScreen;
let chatArea;

let chatHeader;
let backButton;
let chatUserAvatar;
let chatUserName;
let userStatusSpan;
let chatHeaderActions;
let chatSettingsButton;
let chatSettingsDropdown;
let typingStatusHeader;
let typingIndicatorMessages;

let chatMessages; // Kontener na wiadomości w aktywnym czacie
let messageInput;
let sendButton;
let emojiButton;
let attachButton;
let rightSidebarWrapper;
let rightSidebar;
let activeUsersList;
let noActiveUsersText;

let userId; // ID zalogowanego użytkownika
let activeChatRecipientId = null; // ID użytkownika, z którym obecnie czatujemy (dla czatów 1-na-1)
let activeChatRecipientName = ''; // Nazwa użytkownika, z którym obecnie czatujemy

let socket; // Zmienna do przechowywania połączenia WebSocket

// Funkcja do generowania unikalnego ID pokoju dla czatów 1-na-1
// Zapewnia, że room_id jest zawsze taki sam dla danej pary użytkowników, niezależnie od kolejności ID
function generateRoomId(userId1, userId2) {
    const sortedIds = [userId1, userId2].sort();
    return `${sortedIds[0]}_${sortedIds[1]}`;
}

// Funkcja pomocnicza do pobierania elementów DOM
function getElement(id, isQuerySelector = false) {
    const element = isQuerySelector ? document.querySelector(id) : document.getElementById(id);
    if (!element) {
        console.warn(`Element with ${isQuerySelector ? 'selector' : 'ID'} "${id}" not found.`);
    }
    return element;
}

// Inicjalizacja elementów DOM
function initializeDOMElements() {
    mainHeader = getElement('mainHeader', true);
    menuButton = getElement('menuButton');
    dropdownMenu = getElement('dropdownMenu');
    themeToggle = getElement('themeToggle');
    logoutButton = getElement('logoutButton');

    container = getElement('container', true);
    sidebarWrapper = getElement('sidebarWrapper', true);
    mainNavIcons = getElement('mainNavIcons', true);
    navIcons = document.querySelectorAll('.nav-icon');

    onlineUsersMobile = getElement('onlineUsersMobile', true);

    sidebarEl = getElement('sidebar'); // Zakładamy, że to jest główny kontener listy konwersacji
    searchInput = getElement('sidebarSearchInput');
    contactsListEl = getElement('contactsList'); // Może być tym samym co sidebarEl, jeśli lista jest bezpośrednio w nim

    chatAreaWrapper = getElement('chatAreaWrapper', true);
    logoScreen = getElement('logoScreen');
    chatArea = getElement('chatArea');

    // Elementy wewnątrz chatArea, które są dynamicznie aktualizowane
    chatHeader = getElement('chatArea', true).querySelector('.chat-header');
    backButton = getElement('backButton');
    chatUserAvatar = getElement('chatUserAvatar');
    chatUserName = getElement('chatUserName');
    userStatusSpan = getElement('userStatus');
    chatHeaderActions = getElement('chatHeaderActions', true);
    chatSettingsButton = getElement('chatSettingsButton');
    chatSettingsDropdown = getElement('chatSettingsDropdown');
    typingStatusHeader = getElement('typingStatus');
    typingIndicatorMessages = getElement('typingIndicator');

    chatMessages = getElement('chatMessages');
    messageInput = getElement('messageInput');
    sendButton = getElement('sendButton');
    emojiButton = getElement('emojiButton', true);
    attachButton = getElement('attach-button', true);

    rightSidebarWrapper = getElement('rightSidebarWrapper', true);
    rightSidebar = getElement('rightSidebar');
    activeUsersList = getElement('activeUsersList');
    noActiveUsersText = getElement('noActiveUsersText');
}

/**
 * Dodaje wiadomość do obszaru czatu.
 * @param {string} messageContent Treść wiadomości.
 * @param {boolean} isOwnMessage Czy wiadomość została wysłana przez bieżącego użytkownika.
 * @param {string} timestamp Znacznik czasu wiadomości (ISO string).
 */
function appendMessageToChat(messageContent, isOwnMessage, timestamp) {
    const messageElement = document.createElement('div');
    messageElement.classList.add('message');
    if (isOwnMessage) {
        messageElement.classList.add('own');
    } else {
        messageElement.classList.add('other');
    }

    const messageText = document.createElement('div');
    messageText.classList.add('message-content');
    messageText.textContent = messageContent;

    const messageTime = document.createElement('span');
    messageTime.classList.add('message-time');
    const date = new Date(timestamp);
    messageTime.textContent = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    messageElement.appendChild(messageText);
    messageElement.appendChild(messageTime);

    if (chatMessages) {
        chatMessages.appendChild(messageElement);
        chatMessages.scrollTop = chatMessages.scrollHeight; // Przewiń na dół
    } else {
        console.warn("Element 'chatMessages' nie znaleziony. Wiadomość nie została dodana do DOM.");
    }
}

/**
 * Ładuje historię czatu dla danego odbiorcy (1-na-1 chat).
 * @param {string} recipientId ID użytkownika, z którym czatujemy.
 */
async function loadChatHistory(recipientId) {
    if (!chatMessages) {
        console.error("Element 'chatMessages' nie znaleziony. Nie można załadować historii czatu.");
        return;
    }

    chatMessages.innerHTML = ''; // Wyczyść poprzednie wiadomości

    try {
        if (!userId) {
            console.error('Błąd: userId nie jest zdefiniowane. Nie można załadować historii czatu.');
            return;
        }

        // Generuj room_id dla aktywnego czatu 1-na-1
        const roomId = generateRoomId(userId, recipientId);

        console.log(`Ładowanie historii dla pokoju: ${roomId}`);

        const { data: messages, error } = await supabase
            .from('messages')
            .select('sender_id, content, created_at') // Wybieramy potrzebne kolumny
            .eq('room_id', roomId) // Filtruj po room_id
            .order('created_at', { ascending: true }); // Sortuj po created_at

        if (error) {
            console.error('Błąd ładowania historii czatu:', error);
            return;
        }

        messages.forEach(msg => {
            appendMessageToChat(msg.content, msg.sender_id === userId, msg.created_at); // Użyj content i created_at
        });
        chatMessages.scrollTop = chatMessages.scrollHeight; // Przewiń na dół
        console.log(`Załadowano historię czatu z ${messages.length} wiadomościami dla pokoju ${roomId}.`);
    } catch (err) {
        console.error('Wyjątek podczas ładowania historii czatu:', err);
    }
}

/**
 * Aktualizuje podgląd ostatniej wiadomości w liście konwersacji w sidebarze.
 * Tworzy nowy element konwersacji, jeśli nie istnieje.
 * @param {string} participantId ID uczestnika konwersacji (ID użytkownika, z którym konwersacja).
 * @param {string} lastMessage Treść ostatniej wiadomości.
 * @param {string} timestamp Znacznik czasu ostatniej wiadomości.
 */
async function updateConversationPreview(participantId, lastMessage, timestamp) {
    let conversationItem = document.querySelector(`.conversation-item[data-user-id="${participantId}"]`);

    if (participantId === userId) {
        // Nie aktualizuj podglądu konwersacji, jeśli to wiadomość wysłana do samego siebie (chyba że to test)
        // W czatach 1-na-1 zawsze jest drugi uczestnik.
        return;
    }

    const userLabel = await getUserLabelById(participantId);
    if (!userLabel) {
        console.warn(`Nie znaleziono etykiety dla użytkownika ID: ${participantId} podczas aktualizacji podglądu konwersacji.`);
        return;
    }

    const timeString = new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const isOnline = activeUsersList.querySelector(`li[data-user-id="${participantId}"]`) ? true : false;

    if (!conversationItem) {
        // Jeśli element konwersacji nie istnieje, stwórz go
        conversationItem = document.createElement('li');
        conversationItem.classList.add('conversation-item');
        conversationItem.dataset.userId = participantId;
        conversationItem.innerHTML = `
            <div class="user-avatar"></div>
            <div class="conversation-info">
                <span class="conversation-name">${userLabel}</span>
                <span class="last-message">${lastMessage}</span>
            </div>
            <div class="conversation-meta">
                <span class="last-message-time">${timeString}</span>
                <span class="status ${isOnline ? 'online' : 'offline'}"></span>
            </div>
        `;
        if (sidebarEl) {
            sidebarEl.prepend(conversationItem); // Dodaj na początek listy
        }
    } else {
        const lastMessageEl = conversationItem.querySelector('.last-message');
        const lastMessageTimeEl = conversationItem.querySelector('.last-message-time');
        const statusEl = conversationItem.querySelector('.status');

        if (lastMessageEl) lastMessageEl.textContent = lastMessage;
        if (lastMessageTimeEl) lastMessageTimeEl.textContent = timeString;
        if (statusEl) { // Zaktualizuj status online/offline
            statusEl.classList.toggle('online', isOnline);
            statusEl.classList.toggle('offline', !isOnline);
        }
        // Przenieś konwersację na górę listy, jeśli to nowa wiadomość
        if (sidebarEl && conversationItem.parentNode === sidebarEl && sidebarEl.firstChild !== conversationItem) {
            sidebarEl.prepend(conversationItem);
        }
    }
}


/**
 * Obsługuje wyświetlanie obszaru czatu po kliknięciu na konwersację.
 * @param {string} recipientId ID użytkownika, z którym ma być otwarty czat.
 * @param {string} recipientName Nazwa użytkownika, z którym ma być otwarty czat.
 * @param {boolean} isOnline Czy użytkownik jest online.
 */
async function displayChatArea(recipientId, recipientName, isOnline) {
    activeChatRecipientId = recipientId;
    activeChatRecipientName = recipientName;

    if (logoScreen) logoScreen.classList.add('hidden');
    if (chatArea) chatArea.classList.add('active');

    if (chatUserName) chatUserName.textContent = recipientName;
    if (userStatusSpan) {
        userStatusSpan.textContent = isOnline ? 'Online' : 'Offline';
        userStatusSpan.className = isOnline ? 'status online' : 'status offline';
    }
    if (messageInput) {
        messageInput.disabled = false;
        messageInput.focus();
    }
    if (sendButton) sendButton.disabled = false;
    if (emojiButton) emojiButton.disabled = false;
    if (attachButton) attachButton.disabled = false;

    // Ładuj historię czatu dla nowego odbiorcy
    await loadChatHistory(recipientId);

    // Obsługa dla widoku mobilnego
    if (window.matchMedia('(max-width: 768px)').matches) {
        if (sidebarWrapper) sidebarWrapper.classList.add('hidden-on-mobile');
        if (chatAreaWrapper) chatAreaWrapper.classList.add('active-on-mobile');
        if (backButton) backButton.style.display = 'block';
        if (rightSidebarWrapper) rightSidebarWrapper.style.display = 'none';
    }
    console.log(`Aktywny czat z użytkownikiem: ${recipientName} (ID: ${recipientId})`);
}

// Obsługa kliknięć na konwersacje w lewym sidebarze
function setupConversationClickHandlers() {
    if (sidebarEl) { // SidebarEl to kontener dla conversation-item
        sidebarEl.addEventListener('click', async (event) => {
            const conversationItem = event.target.closest('.conversation-item');
            if (conversationItem) {
                const recipientId = conversationItem.dataset.userId;
                const recipientName = conversationItem.querySelector('.conversation-name').textContent;
                // Sprawdź status online na podstawie klasy statusu w elemencie
                const isOnline = conversationItem.querySelector('.status').classList.contains('online');
                await displayChatArea(recipientId, recipientName, isOnline);
            }
        });
    }
}

// Funkcja wysyłania wiadomości
function sendMessage() {
    const messageContent = messageInput.value.trim();
    if (messageContent && activeChatRecipientId) {
        // Generuj room_id dla tej konwersacji 1-na-1
        const roomId = generateRoomId(userId, activeChatRecipientId);

        const message = {
            type: 'chatMessage',
            senderId: userId,
            recipientId: activeChatRecipientId, // Nadal potrzebne serwerowi do rozgłaszania
            content: messageContent, // Zmieniono na content
            timestamp: new Date().toISOString()
        };
        if (socket && socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify(message));
            messageInput.value = '';
            // Natychmiast dodaj wysłaną wiadomość do widoku czatu
            appendMessageToChat(messageContent, true, message.timestamp);
            chatMessages.scrollTop = chatMessages.scrollHeight;
            // Aktualizuj podgląd konwersacji w sidebarze
            updateConversationPreview(activeChatRecipientId, messageContent, message.timestamp);
            sendTypingStatus(false); // Zatrzymaj wskaźnik pisania po wysłaniu
        } else {
            console.error('Połączenie WebSocket nie jest otwarte lub activeChatRecipientId nie jest ustawione.');
        }
    }
}

// --- Funkcje WebSocket ---

function connectWebSocket() {
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    // Upewnij się, że port jest taki sam jak na serwerze (domyślnie 8080)
    // Jeśli używasz zmiennych środowiskowych w frontendzie (np. z Webpacka), użyj process.env.WS_PORT
    // W przeciwnym razie, wpisz tutaj stały port, np. `wsUrl = `${wsProtocol}//${window.location.hostname}:8080`;`
    const wsUrl = import.meta.env.VITE_CHAT_WS_URL 

    socket = new WebSocket(wsUrl);

    socket.onopen = () => {
        console.log('Połączono z serwerem WebSocket.');
        if (userId) {
            socket.send(JSON.stringify({ type: 'userConnected', userId: userId }));
        } else {
            console.error('userId nie jest dostępne podczas łączenia WebSocket. Proszę się zalogować.');
            // Opcjonalnie: Przekieruj do strony logowania
            // window.location.href = 'index.html';
        }
    };

    socket.onmessage = async (event) => {
        const data = JSON.parse(event.data);
        // console.log("Odebrano wiadomość z serwera:", data); // Odkomentuj do debugowania

        switch (data.type) {
            case 'message':
                const receivedRoomId = data.roomId; // Pobierz room_id z wiadomości
                const messageSenderId = data.senderId;
                const messageContent = data.content; // Zmieniono z data.message
                const messageTimestamp = data.timestamp;

                // Generuj room_id dla aktywnego czatu w przeglądarce
                const currentChatRoomId = activeChatRecipientId ? generateRoomId(userId, activeChatRecipientId) : null;

                // Sprawdź, czy wiadomość dotyczy aktywnego czatu
                if (currentChatRoomId && receivedRoomId === currentChatRoomId) {
                    appendMessageToChat(messageContent, messageSenderId === userId, messageTimestamp);
                    chatMessages.scrollTop = chatMessages.scrollHeight;
                    showTypingIndicator(false); // Ukryj wskaźnik pisania, jeśli przyszła wiadomość
                }

                // Zawsze aktualizuj podgląd konwersacji w sidebarze
                // Musimy określić, którego użytkownika dotyczy ta konwersacja po stronie klienta
                // Jeśli wiadomość pochodzi od nas, to uczestnikiem jest odbiorca (activeChatRecipientId, którego wysłaliśmy)
                // Jeśli wiadomość pochodzi od kogoś innego, to uczestnikiem jest nadawca wiadomości (messageSenderId)
                const participantIdForPreview = (messageSenderId === userId) ? activeChatRecipientId : messageSenderId;
                await updateConversationPreview(participantIdForPreview, messageContent, messageTimestamp);
                break;

            case 'userStatusUpdate':
                const targetUserId = data.userId;
                const isOnline = data.isOnline;
                console.log(`Użytkownik ${targetUserId} jest ${isOnline ? 'online' : 'offline'}.`);
                updateUserStatusInUI(targetUserId, isOnline);
                break;

            case 'initialOnlineUsers':
                console.log('Początkowa lista aktywnych użytkowników:', data.users);
                data.users.forEach(uId => updateUserStatusInUI(uId, true));
                break;

            case 'typing':
                if (data.senderId === activeChatRecipientId) {
                    showTypingIndicator(true);
                }
                break;
            case 'notTyping':
                if (data.senderId === activeChatRecipientId) {
                    showTypingIndicator(false);
                }
                break;
            default:
                console.warn('Nieznany typ wiadomości z serwera:', data.type, data);
        }
    };

    socket.onclose = (event) => {
        console.log('Rozłączono z serwerem WebSocket. Próba ponownego połączenia za 3s...', event.code, event.reason);
        setTimeout(connectWebSocket, 3000); // Próba ponownego połączenia po 3 sekundach
    };

    socket.onerror = (error) => {
        console.error('Błąd WebSocket:', error);
        socket.close(); // Zamknij połączenie, aby wyzwolić onclose i ponowne połączenie
    };
}

// Funkcja aktualizująca status użytkownika w UI (lista konwersacji, lista aktywnych użytkowników, nagłówek czatu)
async function updateUserStatusInUI(id, isOnline) {
    const userLabel = await getUserLabelById(id); // Pobierz nazwę użytkownika dla wyświetlenia

    // Aktualizacja statusu w liście konwersacji (sidebarEl)
    const conversationItem = document.querySelector(`.conversation-item[data-user-id="${id}"]`);
    if (conversationItem) {
        const statusSpan = conversationItem.querySelector('.status');
        if (statusSpan) {
            statusSpan.classList.toggle('online', isOnline);
            statusSpan.classList.toggle('offline', !isOnline);
        }
    }

    // Aktualizacja listy aktywnych użytkowników (rightSidebar)
    let activeUserItem = activeUsersList.querySelector(`li[data-user-id="${id}"]`);
    if (isOnline) {
        if (!activeUserItem) {
            // Jeśli użytkownik staje się online i nie ma go na liście, dodaj go
            activeUserItem = document.createElement('li');
            activeUserItem.dataset.userId = id;
            activeUserItem.textContent = userLabel;
            activeUserItem.classList.add('online');
            activeUsersList.appendChild(activeUserItem);
        } else {
            // Jeśli już jest na liście, upewnij się, że ma klasę 'online'
            activeUserItem.classList.add('online');
        }
    } else {
        // Jeśli użytkownik jest offline, usuń go z listy aktywnych
        if (activeUserItem) {
            activeUserItem.remove();
        }
    }

    // Aktualizuj komunikat "Brak aktywnych użytkowników"
    if (noActiveUsersText) {
        noActiveUsersText.style.display = activeUsersList.children.length > 0 ? 'none' : 'block';
    }

    // Aktualizuj status w nagłówku aktywnego czatu
    if (activeChatRecipientId === id && userStatusSpan) {
        userStatusSpan.textContent = isOnline ? 'Online' : 'Offline';
        userStatusSpan.className = isOnline ? 'status online' : 'status offline';
    }
}

let typingTimeout;
let isTyping = false;

// Wysyła status pisania do serwera
function sendTypingStatus(status) {
    if (socket && socket.readyState === WebSocket.OPEN && activeChatRecipientId) {
        socket.send(JSON.stringify({
            type: status ? 'typing' : 'notTyping',
            senderId: userId,
            recipientId: activeChatRecipientId
        }));
    }
}

// Obsługa wpisywania w polu wiadomości (do wskaźnika pisania)
function handleTyping() {
    if (!isTyping) {
        isTyping = true;
        sendTypingStatus(true); // Wyślij status "pisze"
    }
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
        isTyping = false;
        sendTypingStatus(false); // Wyślij status "nie pisze" po 1.5s bez wpisywania
    }, 1500);
}

// Pokazuje/ukrywa wskaźnik pisania w nagłówku czatu i na dole
function showTypingIndicator(show) {
    if (typingIndicatorMessages) {
        typingIndicatorMessages.classList.toggle('hidden', !show);
    }
    if (typingStatusHeader) {
        typingStatusHeader.classList.toggle('hidden-text', !show);
        typingStatusHeader.textContent = show ? 'pisze...' : '';
    }
}

// Główna funkcja inicjalizująca aplikację
async function initializeApp() {
    initializeDOMElements(); // Inicjalizuj wszystkie elementy DOM

    const { data: { user } } = await supabase.auth.getUser();

    if (user) {
        userId = user.id;
        console.log("Użytkownik zalogowany:", userId);
        connectWebSocket(); // Połącz z serwerem WebSocket

        await loadAllProfiles(); // Załaduj wszystkie profile użytkowników
        console.log("[initializeApp] Profile użytkowników załadowane.");

        await loadConversations(); // Załaduj listę konwersacji użytkownika
        console.log("[initializeApp] Konwersacje załadowane.");

        setupConversationClickHandlers(); // Ustaw nasłuchiwanie kliknięć na konwersacje

        // Ustawienie event listenerów dla UI
        if (sendButton) sendButton.addEventListener('click', sendMessage);
        if (messageInput) {
            messageInput.addEventListener('keypress', (event) => {
                if (event.key === 'Enter') {
                    event.preventDefault(); // Zapobiegaj nowej linii po naciśnięciu Enter
                    sendMessage();
                }
            });
            messageInput.addEventListener('input', handleTyping); // Obsługa wpisywania
        }

        if (logoutButton) {
            logoutButton.addEventListener('click', async () => {
                const { error } = await supabase.auth.signOut();
                if (error) {
                    console.error('Błąd wylogowania:', error.message);
                } else {
                    console.log('Wylogowano pomyślnie.');
                    window.location.href = 'index.html'; // Przekieruj na stronę logowania
                }
            });
        }

        if (themeToggle) {
            themeToggle.addEventListener('click', () => {
                document.body.classList.toggle('dark-mode');
                const isDarkMode = document.body.classList.contains('dark-mode');
                localStorage.setItem('theme', isDarkMode ? 'dark' : 'light'); // Zapisz preferencje motywu
                if (themeToggle.querySelector('i')) {
                    themeToggle.querySelector('i').className = isDarkMode ? 'fas fa-sun' : 'fas fa-moon';
                }
                // Aktualizuj tekst przycisku
                themeToggle.childNodes[1].nodeValue = isDarkMode ? ' Tryb jasny' : ' Tryb ciemny';
            });
            // Ustaw motyw na podstawie localStorage przy ładowaniu strony
            const savedTheme = localStorage.getItem('theme') || 'light';
            if (savedTheme === 'dark') {
                document.body.classList.add('dark-mode');
                if (themeToggle.querySelector('i')) {
                    themeToggle.querySelector('i').className = 'fas fa-sun';
                }
                themeToggle.childNodes[1].nodeValue = ' Tryb jasny';
            }
        }

        // Obsługa przycisku "Wstecz" dla widoku mobilnego
        if (backButton) {
            backButton.addEventListener('click', () => {
                if (sidebarWrapper) sidebarWrapper.classList.remove('hidden-on-mobile');
                if (chatAreaWrapper) chatAreaWrapper.classList.remove('active-on-mobile');
                if (backButton) backButton.style.display = 'none';
                if (logoScreen) logoScreen.classList.remove('hidden');
                if (chatArea) chatArea.classList.remove('active');
                if (rightSidebarWrapper) rightSidebarWrapper.style.display = 'flex'; // Pokaż prawy sidebar na desktopie
                activeChatRecipientId = null; // Zresetuj aktywnego odbiorcę
            });
        }

        // Obsługa rozwijanego menu głównego
        if (menuButton) {
            menuButton.addEventListener('click', (event) => {
                event.stopPropagation(); // Zapobiegaj zamknięciu przez click poza menu
                if (dropdownMenu) dropdownMenu.classList.toggle('hidden');
            });
        }
        // Zamykanie rozwijanych menu po kliknięciu poza nimi
        document.addEventListener('click', (event) => {
            if (dropdownMenu && !menuButton.contains(event.target) && !dropdownMenu.contains(event.target)) {
                dropdownMenu.classList.add('hidden');
            }
            if (chatSettingsDropdown && chatSettingsButton && !chatSettingsButton.contains(event.target) && !chatSettingsDropdown.contains(event.target)) {
                chatSettingsDropdown.classList.add('hidden');
            }
        });
        // Obsługa rozwijanego menu ustawień czatu
        if (chatSettingsButton) {
            chatSettingsButton.addEventListener('click', (event) => {
                event.stopPropagation(); // Zapobiegaj zamknięciu przez click poza menu
                if (chatSettingsDropdown) chatSettingsDropdown.classList.toggle('hidden');
            });
        }

        // Obsługa zmian w zapytaniu mediów (dla responsywności mobilnej)
        const handleMediaQueryChange = (mq) => {
            if (mq.matches) { // Tryb mobilny
                if (activeChatRecipientId) { // Jeśli jest aktywny czat, pokaż tylko go
                    if (sidebarWrapper) sidebarWrapper.classList.add('hidden-on-mobile');
                    if (chatAreaWrapper) chatAreaWrapper.classList.add('active-on-mobile');
                    if (backButton) backButton.style.display = 'block';
                    if (logoScreen) logoScreen.classList.add('hidden');
                    if (chatArea) chatArea.classList.add('active');
                    if (rightSidebarWrapper) rightSidebarWrapper.style.display = 'none'; // Ukryj prawy sidebar na mobile
                } else { // Jeśli nie ma aktywnego czatu, pokaż listę konwersacji
                    if (sidebarWrapper) sidebarWrapper.classList.remove('hidden-on-mobile');
                    if (chatAreaWrapper) chatAreaWrapper.classList.remove('active-on-mobile');
                    if (backButton) backButton.style.display = 'none';
                    if (logoScreen) logoScreen.classList.remove('hidden'); // Domyślnie na mobile będzie widoczny ekran logo
                    if (chatArea) chatArea.classList.remove('active');
                    if (rightSidebarWrapper) rightSidebarWrapper.style.display = 'none'; // Ukryj prawy sidebar na mobile
                }
            } else { // Tryb desktopowy
                if (sidebarWrapper) sidebarWrapper.classList.remove('hidden-on-mobile');
                if (chatAreaWrapper) chatAreaWrapper.classList.remove('active-on-mobile');
                if (chatAreaWrapper) chatAreaWrapper.style.display = 'flex'; // Upewnij się, że jest widoczny
                if (logoScreen) logoScreen.classList.remove('hidden'); // Pokaż ekran logo
                if (chatArea) chatArea.classList.remove('active'); // Obszar czatu ukryty na początku
                if (rightSidebarWrapper) rightSidebarWrapper.style.display = 'flex'; // Pokaż prawy sidebar
                if (backButton) backButton.style.display = 'none'; // Przycisk wstecz niepotrzebny
            }
        };

        const mq = window.matchMedia('(max-width: 768px)');
        mq.addListener(handleMediaQueryChange); // Dodaj listenera
        handleMediaQueryChange(mq); // Wywołaj na starcie, aby ustawić początkowy układ

    } else {
        console.log("Użytkownik niezalogowany, przekierowanie do index.html");
        window.location.href = 'index.html'; // Przekieruj niezalogowanych użytkowników
    }
    console.log("[initializeApp] Aplikacja Komunikator zainicjowana.");
}

// Funkcja ładująca listę konwersacji użytkownika
async function loadConversations() {
    if (!sidebarEl) {
        console.error("Element 'sidebar' (conversationsListEl) nie znaleziony. Sprawdź ID w chat.html.");
        return;
    }
    if (!userId) {
        console.warn("Brak userId. Nie można załadować konwersacji.");
        return;
    }

    try {
        // Pobieramy ostatnie wiadomości, w których bieżący użytkownik jest nadawcą lub uczestnikiem room_id
        // To zapytanie jest bardziej złożone, aby znaleźć unikalne konwersacje.
        // Najlepszym sposobem jest pobranie wszystkich wiadomości, a następnie grupowanie ich w aplikacji.
        const { data: messages, error } = await supabase
            .from('messages')
            .select('room_id, sender_id, content, created_at')
            .order('created_at', { ascending: false }); // Pobieramy najnowsze na górze

        if (error) {
            console.error('Błąd ładowania wiadomości dla konwersacji:', error);
            return;
        }

        const conversationsMap = new Map(); // Mapa do przechowywania unikalnych konwersacji

        messages.forEach(msg => {
            // Dla czatów 1-na-1, room_id zawiera oba UUID: 'UUID1_UUID2'
            // Musimy znaleźć ID drugiego uczestnika konwersacji, który nie jest bieżącym użytkownikiem
            const participantIds = msg.room_id.split('_');
            let otherParticipantId = null;

            if (participantIds.length === 2) {
                // To jest czat 1-na-1
                otherParticipantId = participantIds[0] === userId ? participantIds[1] : participantIds[0];
            }
            // W przyszłości, dla czatów grupowych, logika byłaby inna:
            // Musiałbyś mieć tabelę `room_members` i sprawdzić, czy userId jest członkiem `msg.room_id`

            if (otherParticipantId && otherParticipantId !== userId) { // Upewnij się, że nie dodajesz konwersacji z samym sobą
                // Jeśli tej konwersacji (z tym innym użytkownikiem) jeszcze nie ma w mapie,
                // LUB jeśli obecna wiadomość jest nowsza niż ostatnia zapisana wiadomość dla tej konwersacji
                if (!conversationsMap.has(otherParticipantId) || new Date(msg.created_at) > new Date(conversationsMap.get(otherParticipantId).timestamp)) {
                    conversationsMap.set(otherParticipantId, {
                        userId: otherParticipantId,
                        lastMessage: msg.content,
                        timestamp: msg.created_at,
                        roomId: msg.room_id
                    });
                }
            }
        });

        sidebarEl.innerHTML = ''; // Wyczyść listę przed dodaniem nowych elementów

        // Sortuj konwersacje od najnowszej do najstarszej
        const sortedConversations = Array.from(conversationsMap.values()).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        for (const convo of sortedConversations) {
            const userLabel = await getUserLabelById(convo.userId);
            if (!userLabel) {
                console.warn(`Nie znaleziono etykiety dla użytkownika ID: ${convo.userId}, pomijam konwersację.`);
                continue;
            }

            const conversationItem = document.createElement('li');
            conversationItem.classList.add('conversation-item');
            conversationItem.dataset.userId = convo.userId; // Użyj dataset.userId dla łatwego dostępu

            const date = new Date(convo.timestamp);
            const timeString = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

            // Sprawdź, czy użytkownik jest online na podstawie listy aktywnych użytkowników
            const isOnline = activeUsersList.querySelector(`li[data-user-id="${convo.userId}"]`) ? true : false;

            conversationItem.innerHTML = `
                <div class="user-avatar"></div>
                <div class="conversation-info">
                    <span class="conversation-name">${userLabel}</span>
                    <span class="last-message">${convo.lastMessage}</span>
                </div>
                <div class="conversation-meta">
                    <span class="last-message-time">${timeString}</span>
                    <span class="status ${isOnline ? 'online' : 'offline'}"></span>
                </div>
            `;
            sidebarEl.appendChild(conversationItem);
        }
    } catch (err) {
        console.error('Błąd podczas ładowania konwersacji:', err);
    }
}

// Uruchomienie aplikacji po załadowaniu DOM
document.addEventListener('DOMContentLoaded', () => {
    // Inicjalizacja elementu sidebarEl (lista konwersacji) po załadowaniu DOM
    sidebarEl = getElement('sidebar');
    if (!sidebarEl) {
        console.error("Element z ID 'sidebar' (kontener listy konwersacji) nie znaleziony. Sprawdź chat.html.");
    }
    initializeApp();
});