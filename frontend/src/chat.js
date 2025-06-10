    // Importy z Twojego oryginalnego chat.js
    import { loadAllProfiles, getUserLabelById } from './profiles.js';
    import { supabase } from './supabaseClient.js';

    // Globalne zmienne UI i czatu - zadeklarowane na początku, aby były dostępne wszędzie
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


    // --- Funkcje z chat.js zaadaptowane do nowej struktury ---

    async function loadContacts() {
        console.log("Loading contacts...");
        const { data: users, error } = await supabase.rpc('get_other_users', { current_email: currentUser.email });
        if (error) {
            console.error('Błąd ładowania kontaktów:', error);
            return;
        }

        if (conversationListEl) {
            conversationListEl.innerHTML = '';
        } else {
            console.error("conversationListEl element not found!");
            return;
        }

        users.forEach(user => {
            const convoItem = document.createElement('div');
            convoItem.classList.add('convo-item');
            convoItem.dataset.convoId = user.id;
            convoItem.dataset.email = user.email;

            const avatarSrc = `https://i.pravatar.cc/150?img=${user.id % 70 + 1}`;

            convoItem.innerHTML = `
                <img src="${avatarSrc}" alt="Avatar" class="convo-avatar">
                <div class="convo-info">
                    <div class="convo-name">${getUserLabelById(user.id) || user.email}</div>
                    <div class="convo-preview">Brak wiadomości</div>
                </div>
                <span class="convo-time"></span>
                <span class="unread-count hidden">0</span>
            `;

            convoItem.addEventListener('click', () => {
                handleConversationClick(user, convoItem);
            });

            conversationListEl.appendChild(convoItem);
        });
        console.log("Contacts loaded and rendered.");
    }

    function getRoomName(user1Id, user2Id) {
        return [user1Id, user2Id].sort().join('_');
    }

    async function handleConversationClick(user, clickedConvoItemElement) {
        console.log('Conversation item clicked, user:', user);

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
        currentRoom = getRoomName(currentUser.id, currentChatUser.id);
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

        const unreadCount = clickedConvoItemElement.querySelector('.unread-count');
        if (unreadCount) {
            unreadCount.classList.add('animate-activity');
            setTimeout(() => {
                unreadCount.classList.remove('animate-activity');
            }, 500);
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
            console.error("Message input or send button not found for setup.");
            return;
        }

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
            };

            console.log("Sending message via WS:", msgData);
            socket.send(JSON.stringify(msgData));
            messageInput.value = '';
            messageInput.focus();
        };

        messageInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                sendMessageBtn.click();
            }
        });
    }

    function addMessageToChat(msg) {
        console.log("Adding message to UI:", msg);

        if (msg.room !== currentRoom) {
            console.log("Message not for active room, ignoring.");
            return;
        }

        const div = document.createElement('div');
        div.classList.add('message-wave', msg.username === currentUser.id ? 'sent' : 'received', 'animate-in');

        const timestamp = new Date(msg.inserted_at || Date.now());
        const timeString = timestamp.toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" });

        div.innerHTML = `
            <p>${msg.text}</p>
            <span class="message-time">${timeString}</span>
        `;
        messagesDiv.appendChild(div);
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
    }

    function updateUserStatusIndicator(userId, isOnline) {
        if (currentChatUser && currentChatUser.id === userId && chatStatusSpan) {
            chatStatusSpan.textContent = isOnline ? 'Online' : 'Offline';
            chatStatusSpan.classList.toggle('online', isOnline);
            chatStatusSpan.classList.toggle('offline', !isOnline);
            console.log(`Status for ${getUserLabelById(userId)} changed to: ${isOnline ? 'Online' : 'Offline'}`);
        }
    }

    function showTypingIndicator(usernameId) {
        if (currentChatUser && usernameId === currentChatUser.id && typingIndicatorDiv) {
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
            }
        };

        socket.onmessage = (event) => {
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
                    break;
                case 'typing':
                    showTypingIndicator(data.username);
                    break;
                case 'history':
                    console.log("Loading message history:", data.messages);
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

        socket.onclose = () => {
            console.log('WebSocket disconnected. Attempting to reconnect...');
            setTimeout(initWebSocket, Math.min(1000 * ++reconnectAttempts, 10000));
        };

        socket.onerror = (error) => {
            console.error('Błąd WebSocket:', error);
            if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
                socket.close();
            }
        };
    }


    // GŁÓWNA FUNKCJA INICJALIZUJĄCA CAŁĄ APLIKACJĘ
    // WAŻNA ZMIANA: Dodano "export"
    export async function initializeApp() {
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
        await loadAllProfiles();
        await loadContacts();

        // 5. Inicjalizacja WebSocket
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
            });
        }

        if (accountIcon && accountPanel && closeAccountBtn) {
            accountIcon.addEventListener('click', () => {
                console.log('Account icon clicked (UI)');
                accountPanel.classList.remove('hidden');
                setTimeout(() => { accountPanel.classList.add('active'); }, 10);
            });
            closeAccountBtn.addEventListener('click', () => {
                console.log('Close account button clicked (UI)');
                accountPanel.classList.remove('active');
                setTimeout(() => { accountPanel.classList.add('hidden'); }, 300);
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
            const defaultActiveIcon = document.querySelector('.nav-icon[data-tooltip="Główne"]');
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
            });

            searchInput.addEventListener('blur', () => {
                if (searchInput.value === '') {
                    console.log('Search input blurred and empty.');
                    searchInput.style.width = '120px';
                    filterBtn.style.opacity = '0';
                }
            });
        }

        console.log("Flow chat application initialization complete. Ready!");
    }

    // WAŻNA ZMIANA: Usunięto linię `document.addEventListener("DOMContentLoaded", initializeApp);`
    // ponieważ `chat-entry.js` będzie odpowiedzialny za wywołanie `initializeApp`.
    