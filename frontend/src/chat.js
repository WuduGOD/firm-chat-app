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
let chatUserAvatar; // NOWA ZMIENNA: Avatar użytkownika czatu (był wcześniej w kodzie)
let chatUserName; // ID: chatUserName
let userStatusSpan; // ID: userStatus, Klasa: status
let chatHeaderActions;
let chatSettingsButton;
let chatSettingsDropdown; // ID: chatSettingsDropdown, Klasa: dropdown chat-settings-dropdown
let typingStatusHeader; // ID: typingStatus (status w nagłówku)
let typingIndicatorMessages; // ID: typingIndicator (animowane kropki)

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

// NOWA FUNKCJA: Do generowania unikalnego ID pokoju dla czatów 1-na-1
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
    // Użyto querySelector, ponieważ te elementy mogą nie mieć unikalnych ID, a są wewnątrz chatArea
    chatHeader = getElement('.chat-header', true);
    backButton = getElement('backButton');
    chatUserAvatar = getElement('chatUserAvatar');
    chatUserName = getElement('chatUserName');
    userStatusSpan = getElement('userStatus');
    chatHeaderActions = getElement('.chat-header-actions', true);
    chatSettingsButton = getElement('chatSettingsButton');
    chatSettingsDropdown = getElement('chatSettingsDropdown');
    typingStatusHeader = getElement('typingStatus');
    typingIndicatorMessages = getElement('typingIndicator');

    chatMessages = getElement('chatMessages');
    messageInput = getElement('messageInput');
    sendButton = getElement('sendButton');
    emojiButton = getElement('.emoji-button', true);
    attachButton = getElement('.attach-button', true);

    rightSidebarWrapper = getElement('.right-sidebar-wrapper', true);
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

        // Zmieniono: Generuj room_id dla aktywnego czatu 1-na-1
        const roomId = generateRoomId(userId, recipientId);

        console.log(`Ładowanie historii dla pokoju: ${roomId}`);

        const { data: messages, error } = await supabase
            .from('messages')
            .select('sender_id, content, created_at') // Zmieniono: wybieraj content i created_at
            .eq('room_id', roomId) // Zmieniono: filtruj po room_id
            .order('created_at', { ascending: true }); // Sortuj po created_at

        if (error) {
            console.error('Błąd ładowania historii czatu:', error);
            return;
        }

        messages.forEach(msg => {
            appendMessageToChat(msg.content, msg.sender_id === userId, msg.created_at); // Użyj msg.content
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
        // Zmieniono: Generuj room_id dla tej konwersacji 1-na-1
        const roomId = generateRoomId(userId, activeChatRecipientId);

        const message = {
            type: 'chatMessage', // Zmieniono: typ wiadomości na 'chatMessage'
            senderId: userId,
            recipientId: activeChatRecipientId, // Nadal potrzebne serwerowi do rozgłaszania
            content: messageContent, // Zmieniono: nazwa pola na 'content'
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
            // Wyślij status "nie pisze" po wysłaniu wiadomości
            sendTypingStatus(false);
        } else {
            console.error('Błąd: Połączenie WebSocket nie jest otwarte.');
            alert('Nie można wysłać wiadomości: Brak połączenia z serwerem czatu.');
        }
    }
}

// Funkcja do wysyłania statusu pisania
let typingTimeout = null;
function sendTypingStatus(isTyping) {
    if (activeChatRecipientId) {
        const statusMessage = {
            type: isTyping ? 'typing' : 'notTyping',
            senderId: userId,
            recipientId: activeChatRecipientId
        };
        if (socket && socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify(statusMessage));
        }
    }
}

// Obsługa inputu wiadomości dla statusu pisania
function setupMessageInputHandler() {
    if (messageInput) {
        messageInput.addEventListener('input', () => {
            if (typingTimeout) {
                clearTimeout(typingTimeout);
            } else {
                sendTypingStatus(true); // Wyślij 'typing' tylko raz, gdy zacznie pisać
            }
            typingTimeout = setTimeout(() => {
                sendTypingStatus(false); // Wyślij 'notTyping' po pauzie
                typingTimeout = null;
            }, 1000); // 1 sekunda pauzy po ostatnim naciśnięciu klawisza
        });
    }
}

// Obsługa kliknięcia przycisku Wyślij
function setupSendButtonHandler() {
    if (sendButton) {
        sendButton.addEventListener('click', sendMessage);
    }
    if (messageInput) {
        messageInput.addEventListener('keypress', (event) => {
            if (event.key === 'Enter') {
                event.preventDefault(); // Zapobiegaj nowej linii w input
                sendMessage();
            }
        });
    }
}

// Funkcja obsługująca przełączanie motywu
function toggleTheme() {
    document.body.classList.toggle('dark-theme');
    const isDark = document.body.classList.contains('dark-theme');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
    // Zaktualizuj ikonę przycisku
    if (themeToggle) {
        themeToggle.querySelector('i').className = isDark ? 'fas fa-sun' : 'fas fa-moon';
        themeToggle.querySelector('i').nextSibling.nodeValue = isDark ? ' Tryb jasny' : ' Tryb ciemny';
    }
}

// Ustawia motyw na podstawie preferencji użytkownika (localStorage)
function applySavedTheme() {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark') {
        document.body.classList.add('dark-theme');
        if (themeToggle) {
            themeToggle.querySelector('i').className = 'fas fa-sun';
            themeToggle.querySelector('i').nextSibling.nodeValue = ' Tryb jasny';
        }
    } else {
        // Domyślnie użyj jasnego motywu
        document.body.classList.remove('dark-theme');
        if (themeToggle) {
            themeToggle.querySelector('i').className = 'fas fa-moon';
            themeToggle.querySelector('i').nextSibling.nodeValue = ' Tryb ciemny';
        }
    }
}

// Funkcja wylogowania
async function handleLogout() {
    const { error } = await supabase.auth.signOut();
    if (error) {
        console.error('Błąd wylogowania:', error.message);
        alert('Wystąpił błąd podczas wylogowania. Spróbuj ponownie.');
    } else {
        console.log('Użytkownik wylogowany.');
        window.location.href = 'index.html'; // Przekieruj do strony logowania
    }
}

// Funkcja obsługująca zmiany rozmiaru ekranu (media queries)
function handleMediaQueryChange(mq) {
    if (mq.matches) {
        // Tryb mobilny (szerokość <= 768px)
        console.log("Media Query: Tryb mobilny aktywowany.");
        if (chatAreaWrapper) chatAreaWrapper.classList.remove('active-on-mobile');
        if (sidebarWrapper) sidebarWrapper.classList.remove('hidden-on-mobile');
        if (backButton) backButton.style.display = 'none'; // Ukryj przycisk wstecz na liście konwersacji
        if (rightSidebarWrapper) rightSidebarWrapper.style.display = 'none'; // Ukryj prawy sidebar na mobile

        // Jeśli jest otwarty czat, pokaż chatArea, ukryj sidebar
        if (activeChatRecipientId) {
            if (sidebarWrapper) sidebarWrapper.classList.add('hidden-on-mobile');
            if (chatAreaWrapper) chatAreaWrapper.classList.add('active-on-mobile');
            if (backButton) backButton.style.display = 'block'; // Pokaż przycisk wstecz w czacie
            if (rightSidebarWrapper) rightSidebarWrapper.style.display = 'none';
        } else {
            // Jeśli nie ma aktywnego czatu, pokaż sidebar, ukryj chatArea
            if (sidebarWrapper) sidebarWrapper.classList.remove('hidden-on-mobile');
            if (chatAreaWrapper) chatAreaWrapper.classList.remove('active-on-mobile');
            if (chatArea) chatArea.classList.remove('active');
            if (logoScreen) logoScreen.classList.remove('hidden'); // Pokaż ekran logo
            if (backButton) backButton.style.display = 'none';
        }

    } else {
        // Tryb desktopowy (szerokość > 768px)
        console.log("Media Query: Tryb desktopowy aktywowany. Dostosowywanie początkowej widoczności.");
        // Na desktopie, pokaż sidebar, ekran logo początkowo, obszar czatu ukryty.
        if (sidebarWrapper) {
            sidebarWrapper.classList.remove('hidden-on-mobile'); // Upewnij się, że jest widoczny
        }
        if (chatAreaWrapper) {
            chatAreaWrapper.classList.remove('active-on-mobile'); // Usuń klasę mobilną
            chatAreaWrapper.style.display = 'flex'; // Upewnij się, że jest widoczny, aby zawierał ekran logo
        }
        if (logoScreen) {
            logoScreen.classList.remove('hidden'); // Pokaż ekran logo
        }
        if (chatArea) {
            chatArea.classList.remove('active'); // Obszar czatu ukryty
        }
        if (rightSidebarWrapper) {
            rightSidebarWrapper.style.display = 'flex'; // Upewnij się, że prawy sidebar jest widoczny
        }
        if (backButton) {
            backButton.style.display = 'none'; // Przycisk wstecz niepotrzebny na desktopie
        }
    }
}

/**
 * Ładuje ostatnie wiadomości dla każdej konwersacji użytkownika i tworzy listę konwersacji.
 */
async function loadConversations() {
    if (!userId) {
        console.error('Błąd: userId nie jest zdefiniowane. Nie można załadować konwersacji.');
        return;
    }

    if (!sidebarEl) {
        console.error('Element sidebarEl nie znaleziony.');
        return;
    }
    sidebarEl.innerHTML = ''; // Wyczyść listę przed załadowaniem

    try {
        // Zmieniono: Pobierz wszystkie unikalne room_id, w których uczestniczył użytkownik
        // Filtrowanie po room_id.ilike.%_${userId} jest kluczowe dla znalezienia wszystkich czatów 1-na-1
        // gdzie użytkownik jest drugim ID w room_id.
        const { data: roomsData, error: roomsError } = await supabase
            .from('messages')
            .select('room_id, created_at') // Wybieramy room_id i created_at dla sortowania
            .or(`sender_id.eq.${userId},room_id.ilike.%_${userId}`) // Filtruj po sender_id lub jeśli userId jest w room_id
            .order('created_at', { ascending: false });

        if (roomsError) {
            console.error('Błąd ładowania room_id:', roomsError);
            return;
        }

        const uniqueRoomIds = [...new Set(roomsData.map(row => row.room_id))];
        const conversations = [];

        for (const roomId of uniqueRoomIds) {
            // Pobierz ostatnią wiadomość dla każdego room_id
            const { data: latestMessageData, error: latestMessageError } = await supabase
                .from('messages')
                .select('sender_id, content, created_at') // Zmieniono: wybieramy content
                .eq('room_id', roomId)
                .order('created_at', { ascending: false })
                .limit(1);

            if (latestMessageError) {
                console.error(`Błąd ładowania ostatniej wiadomości dla pokoju ${roomId}:`, latestMessageError);
                continue;
            }

            if (latestMessageData && latestMessageData.length > 0) {
                const latestMsg = latestMessageData[0];

                // Wyodrębnij ID drugiego uczestnika z room_id
                const participants = roomId.split('_');
                const otherParticipantId = participants.find(id => id !== userId);

                if (otherParticipantId) {
                    conversations.push({
                        userId: otherParticipantId,
                        lastMessage: latestMsg.content, // Użyj content jako ostatnią wiadomość
                        timestamp: latestMsg.created_at,
                        roomId: roomId
                    });
                }
            }
        }

        // Posortuj konwersacje od najnowszej
        conversations.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        // Wyświetl konwersacje
        for (const convo of conversations) {
            const conversationItem = document.createElement('li');
            conversationItem.classList.add('conversation-item');
            conversationItem.dataset.userId = convo.userId; // Użyj ID drugiego uczestnika jako data-user-id

            const userLabel = await getUserLabelById(convo.userId); // Pobierz etykietę dla drugiego uczestnika
            if (!userLabel) {
                console.warn(`Nie znaleziono etykiety dla użytkownika ID: ${convo.userId} podczas ładowania konwersacji.`);
                continue;
            }

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

// Funkcja inicjalizująca aplikację
async function initializeApp() {
    initializeDOMElements(); // Inicjalizacja wszystkich zmiennych DOM

    // Sprawdź stan autentykacji Supabase
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        console.log('Użytkownik nie zalogowany. Przekierowanie do index.html');
        window.location.href = 'index.html'; // Przekieruj, jeśli użytkownik nie jest zalogowany
        return;
    }

    userId = user.id; // Ustaw ID zalogowanego użytkownika
    console.log(`Zalogowano jako użytkownik ID: ${userId}`);

    // Połącz się z serwerem WebSocket
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    // WAŻNE: Jeśli backend jest na osobnym adresie (np. Render.com), odkomentuj i użyj tego adresu:
    const wsUrl = 'wss://firm-chat-app-backend.onrender.com'; // Przykładowy adres Render.com

    socket = new WebSocket(wsUrl);

    socket.onopen = () => {
        console.log('Połączono z serwerem WebSocket.');
        // Wyślij wiadomość o podłączeniu użytkownika
        socket.send(JSON.stringify({ type: 'userConnected', userId: userId }));
    };

    socket.onmessage = async (event) => {
        const data = JSON.parse(event.data);
        const { type } = data;

        if (type === 'message') {
            const { senderId, content, timestamp, roomId } = data; // Zmieniono: destrukturyzacja content, roomId
            console.log(`Odebrano wiadomość z pokoju ${roomId}: od ${senderId}, treść: ${content}`);
            // Dodaj wiadomość do aktywnego czatu, jeśli pasuje do currentRecipient
            const participants = roomId.split('_');
            const otherParticipantId = participants.find(id => id !== userId); // Znajdź drugiego uczestnika czatu

            if (activeChatRecipientId && otherParticipantId === activeChatRecipientId) {
                // Jeśli wiadomość jest przeznaczona dla aktywnego czatu
                appendMessageToChat(content, senderId === userId, timestamp); // Użyj content
            } else if (senderId === userId && otherParticipantId !== activeChatRecipientId) {
                // Jeśli to wiadomość wysłana przez samego siebie, ale do innego aktywnego odbiorcy
                // Opcjonalnie: nie rób nic lub odśwież podgląd
            }

            // Zawsze aktualizuj podgląd konwersacji w sidebarze dla odpowiedniego użytkownika
            if (otherParticipantId) {
                await updateConversationPreview(otherParticipantId, content, timestamp); // Użyj content
            }
        } else if (type === 'userStatusUpdate') {
            const { userId: updatedUserId, isOnline } = data;
            console.log(`Status użytkownika ${updatedUserId} zaktualizowany na: ${isOnline ? 'online' : 'offline'}`);
            // Zaktualizuj status w liście konwersacji
            const conversationItem = document.querySelector(`.conversation-item[data-user-id="${updatedUserId}"]`);
            if (conversationItem) {
                const statusEl = conversationItem.querySelector('.status');
                if (statusEl) {
                    statusEl.classList.toggle('online', isOnline);
                    statusEl.classList.toggle('offline', !isOnline);
                }
            }

            // Zaktualizuj status w nagłówku aktywnego czatu
            if (activeChatRecipientId === updatedUserId && userStatusSpan) {
                userStatusSpan.textContent = isOnline ? 'Online' : 'Offline';
                userStatusSpan.className = isOnline ? 'status online' : 'status offline';
            }

            // Zaktualizuj listę aktywnych użytkowników (prawy sidebar)
            const activeUserListItem = activeUsersList.querySelector(`li[data-user-id="${updatedUserId}"]`);
            const userLabel = await getUserLabelById(updatedUserId);
            if (isOnline) {
                if (!activeUserListItem && userLabel) {
                    const li = document.createElement('li');
                    li.dataset.userId = updatedUserId;
                    li.innerHTML = `<span>${userLabel}</span> <span class="status online"></span>`;
                    li.addEventListener('click', () => displayChatArea(updatedUserId, userLabel, true)); // Możliwość otwarcia czatu
                    activeUsersList.appendChild(li);
                }
            } else {
                if (activeUserListItem) {
                    activeUserListItem.remove();
                }
            }
            // Pokaż/ukryj "Brak aktywnych użytkowników"
            if (noActiveUsersText) {
                noActiveUsersText.style.display = activeUsersList.children.length > 0 ? 'none' : 'block';
            }

        } else if (type === 'initialOnlineUsers') {
            const { users } = data;
            console.log('Otrzymano początkową listę aktywnych użytkowników:', users);
            activeUsersList.innerHTML = ''; // Wyczyść obecną listę
            if (noActiveUsersText) noActiveUsersText.style.display = 'block';

            for (const onlineUserId of users) {
                if (onlineUserId === userId) continue; // Nie dodawaj samego siebie do listy online
                const userLabel = await getUserLabelById(onlineUserId);
                if (userLabel) {
                    const li = document.createElement('li');
                    li.dataset.userId = onlineUserId;
                    li.innerHTML = `<span>${userLabel}</span> <span class="status online"></span>`;
                    li.addEventListener('click', () => displayChatArea(onlineUserId, userLabel, true));
                    activeUsersList.appendChild(li);
                }
            }
            if (noActiveUsersText) {
                noActiveUsersText.style.display = activeUsersList.children.length > 0 ? 'none' : 'block';
            }

            // Zaktualizuj statusy online/offline w liście konwersacji
            document.querySelectorAll('.conversation-item').forEach(item => {
                const conversationUserId = item.dataset.userId;
                const statusEl = item.querySelector('.status');
                if (statusEl) {
                    const isOnline = users.includes(conversationUserId);
                    statusEl.classList.toggle('online', isOnline);
                    statusEl.classList.toggle('offline', !isOnline);
                }
            });

        } else if (type === 'typing') {
            const { senderId } = data;
            if (senderId === activeChatRecipientId && typingStatusHeader) {
                typingStatusHeader.textContent = `${activeChatRecipientName} pisze...`;
                if (typingIndicatorMessages) typingIndicatorMessages.classList.remove('hidden');
            }
        } else if (type === 'notTyping') {
            const { senderId } = data;
            if (senderId === activeChatRecipientId && typingStatusHeader) {
                typingStatusHeader.textContent = ''; // Usuń status pisania
                if (typingIndicatorMessages) typingIndicatorMessages.classList.add('hidden');
            }
        }
    };

    socket.onclose = (event) => {
        console.log('Rozłączono z serwerem WebSocket. Kod:', event.code, 'Powód:', event.reason);
        // Połączenie utracone - możesz tutaj dodać logikę ponownego łączenia
        if (messageInput) messageInput.disabled = true;
        if (sendButton) sendButton.disabled = true;
        alert('Utracono połączenie z serwerem czatu. Spróbuj odświeżyć stronę.');
    };

    socket.onerror = (error) => {
        console.error('Błąd WebSocket:', error);
        if (messageInput) messageInput.disabled = true;
        if (sendButton) sendButton.disabled = true;
        alert('Wystąpił błąd połączenia z serwerem czatu.');
    };

    // Obsługa zdarzeń UI
    if (menuButton) menuButton.addEventListener('click', () => dropdownMenu.classList.toggle('hidden'));
    if (themeToggle) themeToggle.addEventListener('click', toggleTheme);
    if (logoutButton) logoutButton.addEventListener('click', handleLogout);
    if (backButton) {
        backButton.addEventListener('click', () => {
            activeChatRecipientId = null; // Resetuj aktywnego odbiorcę
            if (sidebarWrapper) sidebarWrapper.classList.remove('hidden-on-mobile');
            if (chatAreaWrapper) chatAreaWrapper.classList.remove('active-on-mobile');
            if (chatArea) chatArea.classList.remove('active');
            if (logoScreen) logoScreen.classList.remove('hidden');
            if (backButton) backButton.style.display = 'none'; // Ukryj przycisk wstecz

            // Upewnij się, że prawy sidebar jest widoczny na desktopie po powrocie
            if (window.matchMedia('(min-width: 769px)').matches && rightSidebarWrapper) {
                rightSidebarWrapper.style.display = 'flex';
            }
        });
    }

    setupConversationClickHandlers();
    setupSendButtonHandler();
    setupMessageInputHandler(); // Konfiguracja dla wskaźnika pisania

    // Dołącz nasłuchiwanie zapytania mediów i wywołaj obsługę początkowo
    const mq = window.matchMedia('(max-width: 768px)');
    mq.addListener(handleMediaQueryChange);
    handleMediaQueryChange(mq); // Początkowe wywołanie w celu ustawienia poprawnego układu

    // Wczytaj początkowe konwersacje po załadowaniu użytkownika
    await loadConversations();
    // Załaduj wszystkie profile użytkowników raz, aby móc szybko pobierać etykiety
    await loadAllProfiles();

    console.log("Komunikator application initialized successfully.");
}

// Uruchomienie aplikacji po załadowaniu DOM
document.addEventListener('DOMContentLoaded', () => {
    // Inicjalizacja elementu sidebarEl (lista konwersacji) po załadowaniu DOM
    sidebarEl = getElement('sidebar'); // sidebarEl jest również używany w loadConversations
    if (!sidebarEl) {
        console.error("Element z ID 'sidebar' (kontener listy konwersacji) nie znaleziony. Sprawdź chat.html.");
        return; // Zatrzymaj inicjalizację, jeśli kluczowy element nie istnieje
    }

    // Dodatkowa inicjalizacja elementu activeUsersList (dla prawego sidebara), jeśli potrzebna jest wcześniejsza dostępność
    activeUsersList = getElement('activeUsersList');
    noActiveUsersText = getElement('noActiveUsersText');

    applySavedTheme(); // Zastosuj zapisany motyw przed inicjalizacją app
    initializeApp();
});