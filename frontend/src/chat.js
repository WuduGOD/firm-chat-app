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
        console.log(`[handleConversationClick] Ustawiam status dla ${currentChatUser.username}: ${isUserOnline ? 'Online' : 'Offline'}`);

        // WAŻNE: Upewnij się, że input i przycisk są włączone
        messageInput.disabled = false;
        sendButton.disabled = false;
        messageInput.focus();
        console.log("[handleConversationClick] Pole wiadomości i przycisk WYŚLIJ włączone.");
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
        console.error("[setupSendMessage] Elementy do wysyłania wiadomości nie znalezione. Sprawdź selektory DOM.");
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
        console.log("[setupSendMessage] --- Próba wysłania wiadomości ---");
        const text = messageInput.value.trim();

        // Wzmocnione logowanie warunków blokujących wysyłkę
        if (!text) {
            console.warn("[setupSendMessage] Wysyłka zablokowana: Brak tekstu wiadomości.");
            return;
        }
        if (!currentChatUser) {
            console.warn("[setupSendMessage] Wysyłka zablokowana: Brak wybranego odbiorcy (currentChatUser jest null).");
            return;
        }
        if (!socket) {
            console.warn("[setupSendMessage] Wysyłka zablokowana: Obiekt WebSocket jest null.");
            return;
        }
        if (socket.readyState !== WebSocket.OPEN) {
            console.warn(`[setupSendMessage] Wysyłka zablokowana: WebSocket nie jest otwarty. Stan: ${socket.readyState}.`);
            return;
        }
        if (!currentRoom) {
            console.warn("[setupSendMessage] Wysyłka zablokowana: currentRoom nie jest ustawiony.");
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
        
        // Przenieś konwersację na górę dla wysłanych wiadomości
        // Używamy addMessageToChat, aby ono załadowało i posortowało całą listę
        // Wywołujemy ją tylko dla efektu wizualnego na liście, bez dodawania do samego czatu
        addMessageToChat(msgData);

        messageInput.value = ''; // Wyczyść pole
        messageInput.focus(); // Zachowaj fokus
        console.log("[setupSendMessage] Wiadomość wysłana, pole wyczyszczone.");
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
 * This function will reorder the list by calling loadContacts if necessary.
 * @param {Object} msg - The message object.
 */
async function addMessageToChat(msg) {
    console.log("[addMessageToChat] START - Odebrano obiekt wiadomości:", msg);

    if (!msg.room) {
        console.error("[addMessageToChat] BŁĄD: msg.room jest niezdefiniowane. Nie można zaktualizować UI. Wiadomość:", msg);
        return;
    }

    let convoItemToUpdate = contactsListEl.querySelector(`.contact[data-room-id="${msg.room}"]`);

    // Jeśli element konwersacji nie istnieje, załaduj ponownie kontakty
    // To obsłuży zarówno nowe konwersacje, jak i zdesynchronizowaną listę
    if (!convoItemToUpdate) {
        console.warn(`[addMessageToChat] Element konwersacji dla pokoju ${msg.room} nie znaleziony. Przeładowuję kontakty...`);
        await loadContacts(); // Przeładuj kontakty, co powinno dodać nowy element i posortować listę
        convoItemToUpdate = contactsListEl.querySelector(`.contact[data-room-id="${msg.room}"]`); // Spróbuj znaleźć ponownie
        if (!convoItemToUpdate) {
            console.error(`[addMessageToChat] BŁĄD: Element konwersacji dla pokoju ${msg.room} nadal nie znaleziony po przeładowaniu. Nie można zaktualizować UI.`);
            return;
        }
        console.log(`[addMessageToChat] Element konwersacji dla pokoju ${msg.room} znaleziony po przeładowaniu kontaktów.`);
    }

    const senderId = String(msg.username);
    const senderName = senderId === String(currentUser.id) ? "Ja" : (getUserLabelById(senderId) || senderId);
    const previewText = `${senderName}: ${msg.text}`;
    const lastMessageTime = new Date(msg.inserted_at);
    const timeText = lastMessageTime.toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" });

    // Aktualizuj zawartość elementu konwersacji
    const previewEl = convoItemToUpdate.querySelector('.last-message');
    const timeEl = convoItemToUpdate.querySelector('.message-time');
    if (previewEl && timeEl) {
        previewEl.textContent = previewText;
        timeEl.textContent = timeText;
        console.log(`[addMessageToChat] Zaktualizowano podgląd i czas dla pokoju ${msg.room}. Podgląd: "${previewText}", Czas: "${timeText}"`);
    }

    // Obsłuż licznik nieprzeczytanych wiadomości
    const unreadCountEl = convoItemToUpdate.querySelector('.unread-count');
    // Inkrementuj licznik tylko jeśli wiadomość NIE jest od obecnego użytkownika i NIE jest dla aktywnego czatu
    if (String(msg.username) !== String(currentUser.id) && msg.room !== currentRoom) {
        if (unreadCountEl) {
            let currentUnread = parseInt(unreadCountEl.textContent, 10);
            if (isNaN(currentUnread)) currentUnread = 0;
            unreadCountEl.textContent = currentUnread + 1;
            unreadCountEl.classList.remove('hidden');
            console.log(`[addMessageToChat] Licznik nieprzeczytanych dla pokoju ${msg.room} inkrementowany do: ${unreadCountEl.textContent}`);
        }
    } else {
        // Jeśli wiadomość jest od obecnego użytkownika LUB dla aktywnego czatu, upewnij się, że licznik jest ukryty
        if (unreadCountEl) {
            unreadCountEl.textContent = '0';
            unreadCountEl.classList.add('hidden');
            console.log(`[addMessageToChat] Wiadomość od bieżącego użytkownika lub dla aktywnego czatu. Ukrywam licznik nieprzeczytanych.`);
        }
    }

    // Przenieś konwersację na początek listy, jeśli jeszcze tam nie jest
    // To jest dodatkowa optymalizacja, ale `loadContacts` już sortuje całą listę.
    // Zachowujemy to dla natychmiastowego efektu wizualnego.
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
        console.log(`[addMessageToChat] Wiadomość nie jest dla aktywnego pokoju (${msg.room} != ${currentRoom}), nie dodaję do widoku czatu.`);
    }
    console.log("[addMessageToChat] KONIEC - Zakończono przetwarzanie wiadomości.");
}

/**
 * Updates the online/offline status indicator for a specific user.
 * @param {string} userId - The ID of the user whose status is being updated.
 * @param {boolean} isOnline - True if the user is online, false otherwise.
 */
function updateUserStatusIndicator(userId, isOnline) {
    console.log(`[updateUserStatusIndicator] Funkcja wywołana dla userId: ${userId}, isOnline: ${isOnline}`);
    onlineUsers.set(String(userId), isOnline); // ZAWSZE AKTUALIZUJ MAPĘ onlineUsers

    // Aktualizuj status w nagłówku aktywnego czatu
    if (currentChatUser && userStatusSpan) {
        if (String(currentChatUser.id) === String(userId)) {
            userStatusSpan.textContent = isOnline ? 'Online' : 'Offline';
            userStatusSpan.classList.toggle('online', isOnline);
            userStatusSpan.classList.toggle('offline', !isOnline);
            console.log(`[updateUserStatusIndicator] Status nagłówka czatu zaktualizowany dla ${getUserLabelById(userId)} na: ${isOnline ? 'Online' : 'Offline'}`);
        } else {
            console.log(`[updateUserStatusIndicator] userId ${userId} nie pasuje do currentChatUser.id ${currentChatUser.id}. Nagłówek nie zaktualizowany.`);
        }
    } else {
        console.log("[updateUserStatusIndicator] currentChatUser lub userStatusSpan jest null/undefined. Nie można zaktualizować nagłówka.");
    }

    // Aktualizuj status na liście aktywnych użytkowników (prawy sidebar - desktop)
    if (activeUsersListEl && noActiveUsersText) {
        const userListItem = activeUsersListEl.querySelector(`li[data-user-id="${userId}"]`);

        if (!isOnline && String(userId) !== String(currentUser.id)) {
            // Jeśli użytkownik przechodzi w tryb offline i nie jest bieżącym użytkownikiem, usuń z listy
            if (userListItem) {
                userListItem.remove();
                console.log(`[updateUserStatusIndicator] Usunięto użytkownika offline ${getUserLabelById(userId)} z listy aktywnych na desktopie.`);
            }
            // Sprawdź, czy lista jest pusta po usunięciu i pokaż komunikat "brak aktywnych użytkowników"
            if (activeUsersListEl.children.length === 0) {
                noActiveUsersText.style.display = 'block';
                activeUsersListEl.style.display = 'none';
            }
        } else if (isOnline && String(userId) !== String(currentUser.id)) {
            // Jeśli użytkownik jest online i nie jest bieżącym użytkownikiem, dodaj lub zaktualizuj na liście
            if (userListItem) {
                const statusIndicator = userListItem.querySelector('.status-dot');
                if (statusIndicator) {
                    statusIndicator.classList.toggle('online', isOnline);
                    statusIndicator.classList.toggle('offline', !isOnline);
                }
                console.log(`[updateUserStatusIndicator] Zaktualizowano status użytkownika ${getUserLabelById(userId)} na desktopie.`);
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
                console.log(`[updateUserStatusIndicator] Dodano nowego użytkownika online do listy aktywnych na desktopie: ${getUserLabelById(userId)}`);
            }
            noActiveUsersText.style.display = 'none';
            activeUsersListEl.style.display = 'block';
        }
    } else {
        console.error("[updateUserStatusIndicator] activeUsersListEl lub noActiveUsersText nie znaleziono podczas aktualizacji statusu.");
    }

    // Aktualizuj status na liście użytkowników online na mobile
    if (onlineUsersMobile) {
        const mobileUserItem = onlineUsersMobile.querySelector(`div[data-user-id="${userId}"]`);

        if (!isOnline && String(userId) !== String(currentUser.id)) {
            if (mobileUserItem) {
                mobileUserItem.remove();
                console.log(`[updateUserStatusIndicator] Usunięto użytkownika offline ${getUserLabelById(userId)} z listy aktywnej na mobile.`);
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
                console.log(`[updateUserStatusIndicator] Dodano nowego użytkownika online do listy aktywnej na mobile: ${getUserLabelById(userId)}`);
            }
        }
    } else {
        console.error("[updateUserStatusIndicator] onlineUsersMobile nie znaleziono podczas aktualizacji statusu.");
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
        console.log(`[showTypingIndicator] ${getUserLabelById(usernameId)} pisze...`);
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
            // Zawsze dołączaj do globalnego pokoju, aby otrzymywać statusy
            socket.send(JSON.stringify({
                type: 'join',
                name: currentUser.id,
                room: 'global',
            }));
            console.log(`[initWebSocket] Wysłano globalną wiadomość dołączenia do WebSocket dla użytkownika: ${currentUser.id}`);

            // Wyślij status "online" dla bieżącego użytkownika
            socket.send(JSON.stringify({
                type: 'status',
                user: currentUser.id,
                online: true
            }));
            console.log(`[initWebSocket] Wysłano status 'online' dla użytkownika ${currentUser.id}`);
        } else {
            console.warn("[initWebSocket] WebSocket otwarty, ale currentUser nie jest ustawiony. Nie można jeszcze dołączyć do pokoju.");
        }
        loadActiveUsers(); // Załaduj aktywnych użytkowników po pomyślnym połączeniu
    };

    socket.onmessage = (event) => {
        const data = JSON.parse(event.data);
        console.log('[WS MESSAGE] Odebrano dane WS:', data);

        switch (data.type) {
            case 'message':
                addMessageToChat({
                    username: data.username,
                    text: data.text,
                    inserted_at: data.inserted_at,
                    room: data.room, // Ważne: używamy data.room
                });
                break;
            case 'typing':
                showTypingIndicator(data.username);
                break;
            case 'history':
                console.log("[WS MESSAGE] Ładowanie historii wiadomości. Pokój historii:", data.room, "Obecny pokój:", currentRoom);
                if (messageContainer && data.room === currentRoom) { // Tylko jeśli historia jest dla aktywnego pokoju
                    messageContainer.innerHTML = ''; // Wyczyść bieżące wiadomości
                    data.messages.forEach((msg) => addMessageToChat(msg)); // Dodaj wiadomości historyczne
                    messageContainer.scrollTop = messageContainer.scrollHeight; // Przewiń do dołu po załadowaniu historii
                    console.log(`[WS MESSAGE] Historia załadowana dla pokoju: ${data.room}`);
                } else if (data.room !== currentRoom) {
                    console.warn(`[WS MESSAGE] Odebrano historię dla pokoju ${data.room}, ale aktywny pokój to ${currentRoom}. Historia zignorowana.`);
                }
                break;
            case 'status':
                console.log(`[WS MESSAGE] Odebrano aktualizację statusu dla użytkownika ${data.user}: ${data.online ? 'online' : 'offline'}`);
                updateUserStatusIndicator(data.user, data.online);
                break;
            case 'active_users':
                console.log('[WS MESSAGE] Odebrano początkową listę aktywnych użytkowników:', data.users);
                displayActiveUsers(data.users); // Wyświetl początkową listę aktywnych użytkowników
                break;
            default:
                console.warn("[WS MESSAGE] Nieznany typ wiadomości WS:", data.type, data);
        }
    };

    socket.onclose = (event) => {
        console.log('[initWebSocket] WebSocket rozłączony. Kod:', event.code, 'Powód:', event.reason);
        if (event.code !== 1000) { // 1000 to normalne zamknięcie
            console.log('[initWebSocket] Próba ponownego połączenia...');
            setTimeout(initWebSocket, Math.min(1000 * ++reconnectAttempts, 10000)); // Ponowne połączenie z wykładniczym wycofaniem
        }
    };

    socket.onerror = (error) => {
        console.error('[initWebSocket] Błąd WebSocket:', error);
        if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
            socket.close(); // Zamknij połączenie w przypadku błędu, aby wywołać onclose i ponowne połączenie
        }
    };
}

/**
 * Loads and displays the list of active users in the right sidebar.
 */
async function loadActiveUsers() {
    console.log("[loadActiveUsers] Ładowanie aktywnych użytkowników dla prawego sidebara i mobile...");
    // Sprawdź, czy elementy istnieją, zanim spróbujesz ich użyć
    if (!activeUsersListEl || !noActiveUsersText || !onlineUsersMobile) {
        console.error("[loadActiveUsers] Krytyczne elementy listy aktywnych użytkowników nie znaleziono, nie można załadować aktywnych użytkowników.");
        return;
    }

    // Poproś o listę aktywnych użytkowników od serwera WebSocket
    if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: 'get_active_users' }));
        console.log("[loadActiveUsers] Wysłano prośbę o listę aktywnych użytkowników do serwera WebSocket.");
    } else {
        console.warn("[loadActiveUsers] WebSocket nie jest otwarty, nie można poprosić o aktywnych użytkowników.");
    }
}

/**
 * Displays a list of active users in the right sidebar (desktop) and mobile online users section.
 * @param {Array<Object>} activeUsersData - An array of active user objects.
 */
function displayActiveUsers(activeUsersData) {
    if (!activeUsersListEl || !noActiveUsersText || !onlineUsersMobile) return;

    activeUsersListEl.innerHTML = ''; // Wyczyść poprzednie elementy listy desktopowej
    onlineUsersMobile.innerHTML = ''; // Wyczyść poprzednie elementy listy mobilnej
    onlineUsers.clear(); // Czyścimy mapę przed uzupełnieniem z active_users

    // Odfiltruj bieżącego użytkownika z listy aktywnych użytkowników
    const filteredUsers = activeUsersData.filter(user => String(user.id) !== String(currentUser.id));

    if (filteredUsers.length === 0) {
        // Brak innych aktywnych użytkowników: ukryj listę desktopową, pokaż komunikat "brak aktywnych użytkowników"
        activeUsersListEl.style.display = 'none';
        noActiveUsersText.style.display = 'block';
    } else {
        // Istnieją inni aktywni użytkownicy: pokaż listę desktopową, ukryj komunikat
        activeUsersListEl.style.display = 'block';
        noActiveUsersText.style.display = 'none';

        filteredUsers.forEach(user => {
            // Dodaj do listy na desktopie (prawy sidebar)
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

            // Dodaj do listy na mobile (górny poziomy pasek)
            const divMobile = document.createElement('div');
            divMobile.classList.add('online-user-item-mobile');
            divMobile.dataset.userId = user.id;

            divMobile.innerHTML = `
                    <img src="${avatarSrc}" alt="Avatar" class="avatar">
                    <span class="username">${getUserLabelById(user.id) || user.username}</span>
                `;
            
            // Dodaj nasłuchiwanie kliknięcia dla elementu mobilnego
            divMobile.addEventListener('click', async () => {
                const userProfile = (await loadAllProfiles()).find(p => String(p.id) === String(user.id));
                if (userProfile) {
                    // Stwórz mockowy element clickedConvoItemElement
                    const mockConvoItem = document.createElement('li');
                    mockConvoItem.dataset.convoId = user.id; // Corrected to user.id
                    mockConvoItem.dataset.email = userProfile.email;
                    mockConvoItem.dataset.roomId = getRoomName(String(currentUser.id), String(user.id)); // Corrected to user.id
                    handleConversationClick(userProfile, mockConvoItem);
                }
            });
            onlineUsersMobile.appendChild(divMobile);

            onlineUsers.set(String(user.id), true); // Aktualizujemy mapę onlineUsers
        });
    }
    console.log("[displayActiveUsers] Mapa onlineUsers po displayActiveUsers:", onlineUsers);
}

/**
 * Sets up the functionality for the chat settings dropdown menu.
 */
function setupChatSettingsDropdown() {
    if (!chatSettingsButton || !chatSettingsDropdown) return;

    // Przełącz widoczność rozwijanej listy po kliknięciu przycisku
    chatSettingsButton.addEventListener('click', (event) => {
        event.stopPropagation(); // Zapobiegaj natychmiastowemu zamknięciu przez kliknięcie w dokumencie
        chatSettingsDropdown.classList.toggle('hidden');
    });

    // Zamknij rozwijaną listę po kliknięciu poza nią
    document.addEventListener('click', (event) => {
        if (!chatSettingsDropdown.classList.contains('hidden') && !chatSettingsButton.contains(event.target)) {
            chatSettingsDropdown.classList.add('hidden');
        }
    });

    // Obsługa opcji koloru wiadomości
    const colorOptions = chatSettingsDropdown.querySelectorAll('.color-box');
    colorOptions.forEach(option => {
        option.addEventListener('click', () => {
            colorOptions.forEach(box => box.classList.remove('active')); // Dezaktywuj inne
            option.classList.add('active'); // Aktywuj kliknięty
            const colorTheme = option.dataset.color;
            if (messageContainer) {
                // Usuń istniejące motywy kolorystyczne
                messageContainer.classList.remove('default-theme', 'blue-theme', 'green-theme', 'red-theme');
                if (colorTheme !== 'default') {
                    messageContainer.classList.add(`${colorTheme}-theme`); // Dodaj nowy motyw
                }
            }
            console.log('Motyw wiadomości zmieniony na:', colorTheme);
        });
    });

    // Obsługa opcji tła czatu
    const backgroundOptions = chatSettingsDropdown.querySelectorAll('.bg-box');
    backgroundOptions.forEach(option => {
        option.addEventListener('click', () => {
            backgroundOptions.forEach(box => box.classList.remove('active')); // Dezaktywuj inne
            option.classList.add('active'); // Aktywuj kliknięty
            const bgTheme = option.dataset.bg;
            if (messageContainer) {
                // Usuń istniejące motywy tła
                messageContainer.classList.remove('default-bg', 'dark-bg', 'pattern-bg');
                if (bgTheme !== 'default') {
                    messageContainer.classList.add(`${bgTheme}-bg`); // Dodaj nowe tło
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
                        .eq('id', currentUser.id); // Zaktualizuj profil bieżącego użytkownika

                    if (error) {
                        throw error;
                    }

                    console.log('Ustawiono nowy nick:', newNickname, 'dla użytkownika:', currentUser.id);
                    // Zastąp alert modalem w prawdziwej aplikacji
                    // alert(`Nick '${newNickname}' został pomyślnie ustawiony.`);
                    // Lepsze byłoby wyświetlenie komunikatu w UI, np. w divie na krótki czas.
                    showTemporaryMessage(`Nick '${newNickname}' został pomyślnie ustawiony.`);
                    await loadAllProfiles(); // Przeładuj profile, aby zaktualizować pamięć podręczną
                    // Zaktualizuj nagłówek czatu, jeśli jest to czat bieżącego użytkownika
                    if (chatUserName && currentChatUser && String(currentUser.id) === String(currentChatUser.id)) {
                        chatUserName.textContent = newNickname;
                    }
                    await loadContacts(); // Przeładuj kontakty, aby zaktualizować nazwy w sidebarze

                } catch (error) {
                    console.error('Błąd aktualizacji nicku:', error.message);
                    // alert(`Błąd ustawiania nicku: ${error.message}`);
                    showTemporaryMessage(`Błąd ustawiania nicku: ${error.message}`, true);
                }
            } else if (!currentUser) {
                // alert("Błąd: Nie jesteś zalogowany, aby ustawić nick.");
                showTemporaryMessage("Błąd: Nie jesteś zalogowany, aby ustawić nick.", true);
            }
        });
    }

    // Funkcjonalność wyszukiwania wiadomości (placeholder)
    const messageSearchInput = document.getElementById('messageSearchInput');
    const searchMessagesButton = document.getElementById('searchMessagesButton');
    if (messageSearchInput && searchMessagesButton) {
        searchMessagesButton.addEventListener('click', () => {
            const searchTerm = messageSearchInput.value.trim();
            console.log('Wyszukiwanie wiadomości dla:', searchTerm, '(funkcjonalność do zaimplementowania)');
            // alert(`Wyszukiwanie wiadomości dla '${searchTerm}' (funkcjonalność do zaimplementowania).`);
            showTemporaryMessage(`Wyszukiwanie wiadomości dla '${searchTerm}' (funkcjonalność do zaimplementowania).`);
        });
    }
}

/**
 * Displays a temporary message in the UI (replaces alert).
 * @param {string} message - The message to display.
 * @param {boolean} isError - True if it's an error message (for styling).
 */
function showTemporaryMessage(message, isError = false) {
    let messageBox = document.getElementById('tempMessageBox');
    if (!messageBox) {
        messageBox = document.createElement('div');
        messageBox.id = 'tempMessageBox';
        messageBox.style.cssText = `
            position: fixed;
            bottom: 20px;
            left: 50%;
            transform: translateX(-50%);
            background-color: #333;
            color: white;
            padding: 10px 20px;
            border-radius: 8px;
            z-index: 1000;
            opacity: 0;
            transition: opacity 0.5s ease-in-out;
            box-shadow: 0 4px 8px rgba(0,0,0,0.2);
            font-family: 'Inter', sans-serif;
            text-align: center;
        `;
        document.body.appendChild(messageBox);
    }

    messageBox.textContent = message;
    messageBox.style.backgroundColor = isError ? '#dc3545' : '#333'; // Red for error, dark gray for info
    messageBox.style.opacity = '1';

    setTimeout(() => {
        messageBox.style.opacity = '0';
        setTimeout(() => {
            messageBox.remove(); // Remove from DOM after fading out
        }, 500); // Wait for transition to complete
    }, 3000); // Display for 3 seconds
}

/**
 * Main function to initialize the entire application.
 * Fetches DOM elements, checks user session, loads data, and sets up event listeners.
 */
async function initializeApp() {
    console.log("[initializeApp] Inicjowanie aplikacji Komunikator...");

    // 1. Pobieranie referencji do elementów DOM
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

    // 2. Walidacja czy wszystkie kluczowe elementy UI zostały znalezione
    const missingElements = {
        mainHeader: mainHeader, menuButton: menuButton, dropdownMenu: dropdownMenu, themeToggle: themeToggle, logoutButton: logoutButton,
        container: container, sidebarWrapper: sidebarWrapper, mainNavIcons: mainNavIcons, navIconsLength: navIcons.length, onlineUsersMobile: onlineUsersMobile,
        sidebarEl: sidebarEl, searchInput: searchInput, contactsListEl: contactsListEl,
        chatAreaWrapper: chatAreaWrapper, logoScreen: logoScreen, chatArea: chatArea,
        chatHeader: chatHeader, backButton: backButton, chatUserName: chatUserName, userStatusSpan: userStatusSpan, chatHeaderActions: chatHeaderActions,
        chatSettingsButton: chatSettingsButton, chatSettingsDropdown: chatSettingsDropdown, typingStatusHeader: typingStatusHeader, typingIndicatorMessages: typingIndicatorMessages,
        messageContainer: messageContainer, chatFooter: chatFooter, attachButton: attachButton, messageInput: messageInput, emojiButton: emojiButton, sendButton: sendButton,
        rightSidebarWrapper: rightSidebarWrapper, rightSidebar: rightSidebar, activeUsersListEl: activeUsersListEl, noActiveUsersText: noActiveUsersText
    };

    let allElementsFound = true;
    for (const key in missingElements) {
        if (key === 'navIconsLength') {
            if (missingElements[key] === 0) {
                console.error(`[initializeApp] Błąd: Element '${key}' (NodeList) jest pusty.`);
                allElementsFound = false;
            }
        } else if (missingElements[key] === null || missingElements[key] === undefined) {
            console.error(`[initializeApp] Błąd: Krytyczny element UI '${key}' nie znaleziony. Wartość:`, missingElements[key]);
            allElementsFound = false;
        }
    }
    if (!allElementsFound) {
        console.error('[initializeApp] Inicjalizacja nie powiodła się z powodu brakujących elementów UI. Sprawdź selektory HTML.');
        return;
    } else {
        console.log('[initializeApp] Wszystkie krytyczne elementy UI znalezione.');
    }

    // 3. Sprawdź sesję użytkownika Supabase
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

    // 4. Załaduj profile i kontakty
    await loadAllProfiles();
    await loadContacts();

    // 5. Zainicjuj połączenie WebSocket
    initWebSocket();

    // 6. Skonfiguruj funkcjonalność wysyłania wiadomości
    setupSendMessage();

    // 7. Ustaw domyślny stan UI po załadowaniu
    chatArea.classList.remove('active');
    messageInput.disabled = true;
    sendButton.disabled = true;

    // 8. Dodaj ogólne nasłuchiwanie zdarzeń dla UI aplikacji
    backButton.addEventListener('click', () => {
        console.log('[backButton] Kliknięto przycisk Wstecz (UI)');
        resetChatView();

        if (socket && socket.readyState === WebSocket.OPEN && currentRoom) {
            socket.send(JSON.stringify({
                type: 'leave',
                name: currentUser.id,
                room: currentRoom
            }));
            console.log(`[backButton] Wysłano wiadomość opuszczenia pokoju: ${currentRoom}`);
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
            showTemporaryMessage(`Błąd wylogowania: ${error.message}`, true);
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
                console.log('[navIcons] Kliknięto ikonę nawigacji:', icon.title || icon.dataset.tooltip);
            });
        });
    }

    setupChatSettingsDropdown();

    function handleMediaQueryChange(mq) {
        if (mq.matches) { // Widok mobilny
            console.log("[handleMediaQueryChange] Aktywowano widok mobilny. Dostosowywanie początkowej widoczności.");
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
        } else { // Widok desktopowy/tabletowy
            console.log("[handleMediaQueryChange] Aktywowano widok desktopowy/tabletowy. Dostosowywanie początkowej widoczności.");
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

    console.log("[initializeApp] Aplikacja Komunikator zainicjalizowana pomyślnie.");
}

document.addEventListener('DOMContentLoaded', initializeApp);
