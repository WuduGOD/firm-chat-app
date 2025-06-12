// Importy z Twojego oryginalnego chat.js
import { loadAllProfiles, getUserLabelById } from './profiles.js';
import { supabase } from './supabaseClient.js';

// Globalne zmienne UI i czatu
let appContainer;
let conversationListEl;
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
let typingTimeout;
let currentActiveConvoItem = null;
let whisperModeActive = false;

// *** NOWA ZMIENNA GLOBALNA: Do przechowywania obiektów konwersacji ***
let allConversations = [];


// Funkcja resetująca widok czatu
function resetChatView() {
    console.log("Resetting chat view...");
    if (messagesDiv) {
        messagesDiv.innerHTML = "";
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
        typingIndicatorDiv.classList.add('hidden');
    }

    currentChatUser = null;
    currentRoom = null;

    if (appContainer && appContainer.classList.contains('chat-open')) {
        appContainer.classList.remove('chat-open');
    }

    if (currentActiveConvoItem) {
        currentActiveConvoItem.classList.remove('active');
        currentActiveConvoItem = null;
    }

    if (whisperModeActive && chatContentView && chatInputArea && whisperModeBtn) {
        chatContentView.classList.remove('blurred-focus');
        chatInputArea.classList.remove('blurred-focus-input');
        whisperModeBtn.classList.remove('active');
        whisperModeActive = false;
    }
}

/**
 * Generuje unikalną nazwę pokoju czatu na podstawie dwóch ID użytkowników, posortowanych alfabetycznie.
 * @param {string} user1Id - ID pierwszego użytkownika.
 * @param {string} user2Id - ID drugiego użytkownika.
 * @returns {string} Nazwa pokoju czatu.
 */
function getRoomName(user1Id, user2Id) {
    return [String(user1Id), String(user2Id)].sort().join('_'); // Upewnij się, że są stringami przed sortowaniem
}

/**
 * Asynchronicznie pobiera ostatnią wiadomość dla danego pokoju czatu z Supabase.
 * @param {string} roomId - ID pokoju czatu.
 * @returns {Promise<Object|null>} Obiekt ostatniej wiadomości lub null, jeśli brak wiadomości.
 */
async function getLastMessageForRoom(roomId) {
    const { data, error } = await supabase
        .from('messages')
        .select('text, username, inserted_at')
        .eq('room', roomId)
        .order('inserted_at', { ascending: false })
        .limit(1);

    if (error) {
        console.error('Błąd podczas pobierania ostatniej wiadomości:', error);
        return null;
    }
    return data && data.length > 0 ? data[0] : null;
}

// *** NOWA FUNKCJA: Sortowanie konwersacji (używa obiektu convo.lastMessage) ***
function sortConversations(conversations) {
    return [...conversations].sort((a, b) => {
        // Jeśli konwersacja nie ma ostatniej wiadomości, potraktuj ją jako bardzo starą (na końcu listy)
        const timeA = a.lastMessage ? new Date(a.lastMessage.inserted_at) : new Date(0);
        const timeB = b.lastMessage ? new Date(b.lastMessage.inserted_at) : new Date(0);
        // Sortowanie malejąco: najnowsze na górze
        return timeB.getTime() - timeA.getTime();
    });
}

// *** NOWA FUNKCJA: Główna funkcja do renderowania i animowania listy konwersacji ***
function renderConversationList() {
    if (!conversationListEl) {
        console.error("conversationListEl not found for rendering.");
        return;
    }

    const sortedConversations = sortConversations(allConversations);

    // 1. First: Zapisz aktualne pozycje elementów DOM przed ich zmianą
    const oldPositions = new Map();
    Array.from(conversationListEl.children).forEach(item => {
        oldPositions.set(item.dataset.roomId, item.getBoundingClientRect());
    });

    const fragment = document.createDocumentFragment();
    const currentActiveRoomId = currentActiveConvoItem ? currentActiveConvoItem.dataset.roomId : null;

    sortedConversations.forEach(convo => {
        let convoItem = conversationListEl.querySelector(`.convo-item[data-room-id="${convo.roomId}"]`);

        if (!convoItem) {
            // Jeśli element nie istnieje (np. nowa konwersacja), utwórz go
            convoItem = document.createElement('div');
            convoItem.classList.add('convo-item');
            convoItem.dataset.convoId = convo.id; // ID kontaktu
            convoItem.dataset.email = convo.email; // Email kontaktu
            convoItem.dataset.roomId = convo.roomId; // Room ID dla łatwego dostępu
            
            // Dodaj listener tylko raz przy tworzeniu elementu
            convoItem.addEventListener('click', () => {
                // Znajdź pełny obiekt użytkownika na podstawie ID
                const userObject = allConversations.find(c => String(c.id) === String(convo.id))?.user;
                if (userObject) {
                    handleConversationClick(userObject, convoItem);
                } else {
                    console.error("Could not find full user object for clicked conversation:", convo.id);
                }
            });
        }

        // Zaktualizuj klasę 'active' i 'currentActiveConvoItem'
        if (convo.roomId === currentActiveRoomId) {
            convoItem.classList.add('active');
            currentActiveConvoItem = convoItem; // Upewnij się, że referencja jest aktualna
        } else {
            convoItem.classList.remove('active');
        }

        // Zaktualizuj zawartość elementu DOM
        const avatarSrc = `https://i.pravatar.cc/150?img=${convo.id % 70 + 1}`;
        let previewText = "Brak wiadomości";
        let timeText = "";

        if (convo.lastMessage) {
            const senderName = String(convo.lastMessage.username) === String(currentUser.id) ? "Ja" : (getUserLabelById(convo.lastMessage.username) || convo.lastMessage.username);
            previewText = `${senderName}: ${convo.lastMessage.text}`;
            const lastMessageTime = new Date(convo.lastMessage.inserted_at);
            timeText = lastMessageTime.toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" });
        }

        convoItem.innerHTML = `
            <img src="${avatarSrc}" alt="Avatar" class="convo-avatar">
            <div class="convo-info">
                <div class="convo-name">${convo.name}</div>
                <div class="convo-preview">${previewText}</div>
            </div>
            <span class="convo-time">${timeText}</span>
            <span class="unread-count ${ (convo.unreadCount || 0) > 0 ? '' : 'hidden' }">${convo.unreadCount || '0'}</span>
        `;
        
        fragment.appendChild(convoItem);
    });

    // Usuń elementy, które nie są już w sortedConversations (np. jeśli kontakty zniknęły)
    Array.from(conversationListEl.children).forEach(item => {
        if (!sortedConversations.some(convo => convo.roomId === item.dataset.roomId)) {
            item.remove();
        }
    });

    // Wyczyść listę i dodaj wszystkie elementy z fragmentu w nowej kolejności
    // Najpierw usuń istniejące, a potem dodaj z fragmentu - to jest klucz do animacji FLIP
    while(conversationListEl.firstChild) {
        conversationListEl.removeChild(conversationListEl.firstChild);
    }
    conversationListEl.appendChild(fragment);


    // 2. Last, Invert, Play: Animuj elementy do ich nowych pozycji
    Array.from(conversationListEl.children).forEach(item => {
        const newRect = item.getBoundingClientRect();
        const oldRect = oldPositions.get(item.dataset.roomId);

        if (oldRect) {
            const deltaY = oldRect.top - newRect.top;

            if (deltaY !== 0) {
                // Invert: Przesuń element do jego starej pozycji
                item.style.transform = `translateY(${deltaY}px)`;
                item.style.transition = 'transform 0s'; // Wyłącz transition na chwilę

                // Play: Wymuś reflow, a następnie włącz transition i animuj do nowej pozycji
                requestAnimationFrame(() => {
                    item.style.transition = 'transform 0.5s ease-out'; // Ustaw transition
                    item.style.transform = ''; // Zresetuj transform, aby element wrócił do naturalnej pozycji
                });
            }
        }
    });

    console.log("Conversation list rendered and animated.");
}


async function loadContacts() {
    console.log("Loading contacts...");
    const { data: users, error } = await supabase.rpc('get_other_users', { current_email: currentUser.email });
    if (error) {
        console.error('Błąd ładowania kontaktów:', error);
        return;
    }

    const contactsPromises = users.map(async user => {
        const roomId = getRoomName(String(currentUser.id), String(user.id));
        const lastMessage = await getLastMessageForRoom(roomId);
        return {
            id: user.id, // ID użytkownika (kontakt)
            user: user, // Przechowaj pełny obiekt użytkownika do handleConversationClick
            name: getUserLabelById(user.id) || user.email,
            avatar: `https://i.pravatar.cc/150?img=${user.id % 70 + 1}`,
            roomId: roomId,
            lastMessage: lastMessage, // Przechowujemy cały obiekt ostatniej wiadomości
            unreadCount: 0 // Inicjalizuj licznik nieprzeczytanych wiadomości
        };
    });

    // Poczekaj na wszystkie promise i przypisz do globalnej tablicy
    allConversations = await Promise.all(contactsPromises);

    // Initialne renderowanie posortowanej listy
    renderConversationList();
    console.log("Contacts loaded and initialized.");
}


async function handleConversationClick(user, clickedConvoItemElement) {
    console.log('Conversation item clicked, user:', user);

    // Resetuj licznik nieprzeczytanych dla tej konwersacji w danych
    const convoIndex = allConversations.findIndex(c => String(c.id) === String(user.id));
    if (convoIndex !== -1) {
        allConversations[convoIndex].unreadCount = 0;
        // Ponowne renderowanie, aby zaktualizować licznik w UI (i ewentualnie przesunąć, jeśli kliknięto starą wiadomość)
        renderConversationList();
    }

    // Aktualizuj klasę 'active' dla elementu DOM
    if (currentActiveConvoItem) {
        currentActiveConvoItem.classList.remove('active');
    }
    clickedConvoItemElement.classList.add('active');
    currentActiveConvoItem = clickedConvoItemElement; // Aktualizuj referencję do aktywnego elementu

    resetChatView(); // Resetuje widok przed załadowaniem nowej rozmowy

    currentChatUser = {
        id: user.id,
        username: getUserLabelById(user.id) || user.email,
        email: user.email,
    };
    currentRoom = getRoomName(String(currentUser.id), String(currentChatUser.id));
    console.log(`Starting chat with ${currentChatUser.username}, room ID: ${currentRoom}`);

    if (chatHeaderName && chatHeaderAvatar && messageInput && sendMessageBtn) {
        chatHeaderName.textContent = currentChatUser.username;
        chatHeaderAvatar.src = `https://i.pravatar.cc/150?img=${user.id % 70 + 1}`;
        messageInput.disabled = false;
        sendMessageBtn.disabled = false;
        messageInput.focus();
    }

    if (appContainer) {
        appContainer.classList.add('chat-open');
        console.log('Added "chat-open" class to app-container.');
    } else {
        console.error('appContainer not found to add chat-open class.');
    }

    if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({
            type: 'join',
            name: currentUser.id,
            room: currentRoom,
        }));
        console.log(`Sent join message to WebSocket for room: ${currentRoom}`);
    } else {
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
        if (currentRoom && socket && socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({
                type: 'typing',
                username: currentUser.id,
                room: currentRoom,
            }));
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
            inserted_at: new Date().toISOString()
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
 * Dodaje wiadomość do widoku czatu i aktualizuje podgląd konwersacji na liście, sortując ją.
 * @param {Object} msg - Obiekt wiadomości.
 */
function addMessageToChat(msg) {
    console.log("Adding message to UI:", msg);
    console.log("Porównanie pokoi: msg.room =", msg.room, ", currentRoom =", currentRoom);

    // 1. Zaktualizuj globalną tablicę allConversations
    const convoToUpdateIndex = allConversations.findIndex(c => c.roomId === msg.room);

    if (convoToUpdateIndex !== -1) {
        // Aktualizuj istniejący obiekt konwersacji
        allConversations[convoToUpdateIndex].lastMessage = {
            text: msg.text,
            username: msg.username,
            inserted_at: msg.inserted_at
        };

        // Zwiększ licznik nieprzeczytanych, jeśli wiadomość nie jest dla aktywnie otwartego pokoju
        // I nie jest to wiadomość wysłana przez bieżącego użytkownika (bo wtedy ją widzi)
        if (msg.room !== currentRoom && String(msg.username) !== String(currentUser.id)) {
            allConversations[convoToUpdateIndex].unreadCount = (allConversations[convoToUpdateIndex].unreadCount || 0) + 1;
        } else if (msg.room === currentRoom && String(msg.username) === String(currentUser.id)) {
             // Jeśli to moja wiadomość w aktywnym czacie, zresetuj unreadCount dla tej konwersacji
            allConversations[convoToUpdateIndex].unreadCount = 0;
        }
        
        // WAŻNE: Po aktualizacji danych, ponownie renderuj całą listę.
        // renderConversationList zajmie się sortowaniem i animacją.
        renderConversationList();

    } else {
        console.warn("Received message for unknown room, cannot update conversation list:", msg.room);
        // Możesz tu pomyśleć o ponownym załadowaniu wszystkich kontaktów,
        // jeśli to nowa konwersacja, której wcześniej nie było
        loadContacts();
    }


    // 2. Dodanie wiadomości do aktywnego widoku czatu (tylko jeśli wiadomość jest dla aktywnego pokoju)
    if (msg.room !== currentRoom) {
        console.log("Wiadomość nie jest dla aktywnego pokoju, nie dodaję do widoku czatu.");
        return;
    }

    const div = document.createElement('div');
    div.classList.add('message-wave', String(msg.username) === String(currentUser.id) ? 'sent' : 'received', 'animate-in');

    const timestamp = new Date(msg.inserted_at || Date.now());
    const timeString = timestamp.toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" });

    div.innerHTML = `
        <p>${msg.text}</p>
        <span class="message-time">${timeString}</span>
    `;
    if (messagesDiv) {
        messagesDiv.appendChild(div);
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
        }, 3000);
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
                    messagesDiv.innerHTML = '';
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
        if (event.code !== 1000) {
            console.log('Attempting to reconnect...');
            setTimeout(initWebSocket, Math.min(1000 * ++reconnectAttempts, 10000));
        }
    };

    socket.onerror = (error) => {
        console.error('Błąd WebSocket:', error);
        if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
            socket.close();
        }
    };
}


async function initializeApp() {
    console.log("Initializing Flow chat application...");

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

    if (!appContainer || !conversationListEl || !messagesDiv || !messageInput || !sendMessageBtn || !chatHeaderName || !chatHeaderAvatar || !chatStatusSpan) {
        console.error('Error: One or more critical UI elements not found. Please check your HTML selectors.');
        return;
    }

    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
        console.log('No active Supabase session found. Redirecting to login.html');
        window.location.href = 'login.html';
        return;
    }
    currentUser = session.user;
    console.log('Current authenticated user:', currentUser.id);

    await loadAllProfiles();
    await loadContacts(); // Ta funkcja teraz sortuje i renderuje

    initWebSocket();
    setupSendMessage();

    appContainer.classList.remove('chat-open');
    messageInput.disabled = true;
    sendMessageBtn.disabled = true;

    if (backToListBtn) {
        backToListBtn.addEventListener('click', () => {
            console.log('Back to list button clicked (UI)');
            resetChatView();
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
            accountPanel.style.visibility = 'visible';
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
        const defaultActiveIcon = document.querySelector('.nav-icon[data-tooltip="Czat"]');
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
            filterBtn.classList.remove('hidden');
        });

        searchInput.addEventListener('blur', () => {
            if (searchInput.value === '') {
                console.log('Search input blurred and empty.');
                searchInput.style.width = '120px';
                filterBtn.style.opacity = '0';
                setTimeout(() => { filterBtn.classList.add('hidden'); }, 300);
            }
        });
    }

    console.log("Flow chat application initialization complete. Ready!");
}

document.addEventListener("DOMContentLoaded", initializeApp);