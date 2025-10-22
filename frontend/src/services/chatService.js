// Plik: chatService.js

import { supabase } from '../supabaseClient.js';
import * as elements from '../ui/elements.js';
import * as chatState from '../chat.js';
import { getUserLabelById, getAvatarUrl } from '../profiles.js';
import { formatTimeAgo, showCustomMessage, playNotificationSound, updateDocumentTitle, openLightbox, closeLightbox } from '../ui/helpers.js';
import { loadContacts, updateConversationPreview, renderActiveUsersList } from './friendsService.js';
import { onlineUsers, currentChatUser, allFriends, currentUser, unreadConversationsInfo, currentActiveConvoItem, setCurrentActiveConvoItem, setCurrentChatUser, setCurrentRoom, socket, currentRoom, notificationPermissionGranted } from '../chat.js';
import { messageContainer, activeUsersListEl, contactsListEl, chatAreaWrapper, userStatusSpan, typingStatusHeader, typingIndicatorMessages } from '../ui/elements.js';

/**
 * Resets the chat view to its initial state (clears messages, disables input)
 * Does NOT control visibility of logoScreen or chatArea. Those are handled by calling functions.
 */
export function resetChatView() {
    console.log("[resetChatView] Resetting chat view (clearing content, not visibility)...");
    if (elements.messageContainer) {
        elements.messageContainer.innerHTML = ""; // Clear messages
        // Remove all theme classes for messages container 
        elements.messageContainer.classList.remove('blue-theme', 'green-theme', 'red-theme', 'dark-bg', 'pattern-bg');
    } else {
        console.warn("[resetChatView] messageContainer not found during reset.");
    }

    if (elements.messageInput) {
        elements.messageInput.disabled = true; // Disable input
        elements.messageInput.value = ""; // Clear input value
    } else {
        console.warn("[resetChatView] messageInput not found during reset.");
    }
    if (elements.sendButton) {
        elements.sendButton.disabled = true; // Disable send button
    } else {
        console.warn("[resetChatView] sendButton not found during reset.");
    }
    if (elements.chatUserName) {
        elements.chatUserName.textContent = ""; // Clear chat user name
    } else {
        console.warn("[resetChatView] chatUserName not found during reset.");
    }
    if (elements.userStatusSpan) {
        elements.userStatusSpan.textContent = ""; // Clear user status
        elements.userStatusSpan.classList.remove('online', 'offline'); // Remove status classes
    } else {
        console.warn("[resetChatView] userStatusSpan not found during reset.");
    }
    if (elements.typingStatusHeader) { // Status w nagłówku
        elements.typingStatusHeader.classList.add('hidden'); // Hide typing indicator
        elements.typingStatusHeader.textContent = ''; // Clear text
    } else {
        console.warn("[resetChatView] typingStatusHeader not found during reset.");
    }
    if (elements.typingIndicatorMessages) { // Animowane kropki w wiadomościach
        elements.typingIndicatorMessages.classList.add('hidden'); // Hide typing indicator
    } else {
        console.warn("[resetChatView] typingIndicatorMessages not found during reset.");
    }

    setCurrentChatUser(null); // Reset current chat user
    setCurrentRoom(null); // Reset current room
    console.log("[resetChatView] currentChatUser and currentRoom reset to null.");

    // Remove active state from conversation item if any
    if (currentActiveConvoItem) {
        currentActiveConvoItem.classList.remove('active'); // Deactivate active conversation item
        setCurrentActiveConvoItem(null);
        console.log("[resetChatView] currentActiveConvoItem deactivated.");
    }

    if (elements.chatSettingsDropdown) {
        elements.chatSettingsDropdown.classList.add('hidden'); // Hide chat settings dropdown
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
export function getRoomName(user1Id, user2Id) {
    return [String(user1Id), String(user2Id)].sort().join('_');
}

/**
 * Fetches the entire message history for a given room.
 * @param {string} roomId - The ID of the room.
 * @returns {Promise<Array<Object>>} An array of message objects, sorted oldest to newest.
 */
export async function fetchMessageHistory(roomId, limit = 50, offset = 0) {
    console.log(`[fetchMessageHistory] Fetching history for room: ${roomId}, Limit: ${limit}, Offset: ${offset}`);
    try {
        const { data, error } = await supabase
            .from('messages')
            .select('content, sender_id, created_at, room_id')
            .eq('room_id', roomId)
            .order('created_at', { ascending: false }) // Sortuj od najnowszych do najstarszych, aby poprawnie zastosować offset
            .range(offset, offset + limit - 1);

        if (error) {
            console.error('[fetchMessageHistory] Error fetching message history:', error.message);
            return [];
        }

        if (data) {
            console.log(`[fetchMessageHistory] Fetched ${data.length} messages.`);
            // Odwróć kolejność, aby wyświetlać od najstarszych do najnowszych na czacie
            return data.reverse().map(msg => ({
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
export function sortConversations(conversations) {
    return [...conversations].sort((a, b) => {
        const timeA = a.lastMessage ? new Date(a.lastMessage.inserted_at) : new Date(0);
        const timeB = b.lastMessage ? new Date(b.lastMessage.inserted_at) : new Date(0);
        return timeB.getTime() - timeA.getTime();
    });
}

/**
 * Handles a click event on a conversation item.
 * Sets up the chat view for the selected user and joins the chat room.
 * @param {Object} user - The user object of the selected contact.
 * @param {HTMLElement} clickedConvoItemElement - The clicked list item element.
 */
export async function handleConversationClick(user, clickedConvoItemElement) {
    console.log('[handleConversationClick] Conversation item clicked, user:', user);

    // --- Zmienne do obsługi paginacji ---
    let isLoadingOlderMessages = false;
    let currentMessageOffset = 0;
    const MESSAGES_PER_PAGE = 50;
    // ------------------------------------

    // Usuń poprzedni listener scrolla, jeśli istniał
    if (elements.messageContainer && elements.messageContainer.scrollListener) {
        elements.messageContainer.removeEventListener('scroll', elements.messageContainer.scrollListener);
        elements.messageContainer.scrollListener = null; // Usuń referencję
    }

    try {
        // --- Zarządzanie aktywnym elementem listy ---
        if (currentActiveConvoItem) {
            currentActiveConvoItem.classList.remove('active');
        }
        clickedConvoItemElement.classList.add('active');
        setCurrentActiveConvoItem(clickedConvoItemElement);

        // --- Opuszczanie poprzedniego pokoju WebSocket ---
        if (socket && socket.readyState === WebSocket.OPEN && currentRoom && currentRoom !== 'global') {
            socket.send(JSON.stringify({ type: 'leave', room: currentRoom }));
            console.log(`[handleConversationClick] Wysłano LEAVE dla pokoju: ${currentRoom}`);
        }

        // --- Przełączanie widoków (Mobile) ---
		if (window.matchMedia('(max-width: 768px)').matches) {
            if (elements.sidebarWrapper) elements.sidebarWrapper.classList.add('hidden-on-mobile');
            if (elements.chatAreaWrapper) elements.chatAreaWrapper.classList.add('active-on-mobile');
        }

        // --- Pokazywanie obszaru czatu ---
        if (elements.logoScreen) elements.logoScreen.classList.add('hidden');
        if (elements.chatArea) elements.chatArea.classList.add('active');

        // --- Pokazywanie przycisku "wstecz" (Mobile) ---
        if (elements.backButton && window.matchMedia('(max-width: 768px)').matches) {
            elements.backButton.style.display = 'block';
        }

        // --- Resetowanie widoku czatu ---
        resetChatView();

        // --- Ustawianie bieżącego rozmówcy/grupy i pokoju ---
		const isGroup = user.type === 'group';
		const chatName = isGroup ? user.name : (getUserLabelById(user.id) || user.email);

		const newChatUser = { // Zmienna newChatUser przechowuje teraz info o grupie lub użytkowniku
			id: user.id,
			username: chatName,
			email: isGroup ? null : user.email,
			type: user.type
		};
        setCurrentChatUser(newChatUser); // Ustawiamy globalnie

		const newRoom = isGroup ? user.id : getRoomName(String(currentUser.id), String(newChatUser.id));
        setCurrentRoom(newRoom);
        console.log(`[handleConversationClick] Inicjacja sesji. Rozmówca/Grupa: ${chatName}, Pokój: ${newRoom}`);

        // --- Zerowanie licznika nieprzeczytanych ---
        await clearUnreadMessageCountInSupabase(newRoom);

        // --- Aktualizacja UI nagłówka czatu ---
        if (elements.chatUserName && elements.messageInput && elements.sendButton && elements.userStatusSpan) {
            elements.chatUserName.textContent = chatName; // Użyj poprawnej nazwy

            // Pokaż/ukryj status online w zależności od typu czatu
            if (isGroup) {
                elements.userStatusSpan.style.display = 'none'; // Ukryj status dla grup
            } else {
                elements.userStatusSpan.style.display = 'block'; // Pokaż dla użytkowników
                const userStatus = onlineUsers.get(String(user.id));
                const isUserOnline = userStatus ? userStatus.isOnline : false;
                elements.userStatusSpan.classList.toggle('online', isUserOnline);
                elements.userStatusSpan.classList.toggle('offline', !isUserOnline);
                elements.userStatusSpan.textContent = isUserOnline ? 'Online' : `Offline (ostatnio widziany ${formatTimeAgo(new Date((userStatus && userStatus.lastSeen) || Date.now()))})`;
            }

            // Włącz pola do pisania wiadomości
            elements.messageInput.disabled = false;
            elements.sendButton.disabled = false;
            elements.messageInput.focus();
        }

        // --- Ukryj licznik nieprzeczytanych na liście konwersacji ---
        const unreadCount = clickedConvoItemElement.querySelector('.unread-count');
        if (unreadCount) {
            unreadCount.textContent = '';
            unreadCount.classList.add('hidden');
        }

        // --- Dołącz do pokoju WebSocket ---
		if (socket && socket.readyState === WebSocket.OPEN) {
			socket.send(JSON.stringify({ type: 'join', name: currentUser.id, room: currentRoom }));
			console.log(`[handleConversationClick] Wysłano JOIN dla pokoju: ${currentRoom}`);
		}

        // --- ŁADOWANIE HISTORII WIADOMOŚCI ---
        const messageContainer = elements.messageContainer;
        if (messageContainer) {
            messageContainer.innerHTML = ''; // Wyczyść kontener przed dodaniem historii
            const history = await fetchMessageHistory(currentRoom, MESSAGES_PER_PAGE, 0);
            currentMessageOffset = history.length; // Ustaw początkowy offset

            // Renderuj załadowaną historię
			history.forEach(msg => {
                const isSent = String(msg.username) === String(currentUser.id);
                // Upewnij się, że 'isGroup' jest dostępne w tym zakresie
                // (powinno być zdefiniowane wcześniej w funkcji)

                const messageWrapper = document.createElement('div');
                messageWrapper.classList.add('message-wrapper', isSent ? 'sent' : 'received');
                messageWrapper.dataset.userId = msg.username; // Dodaj ID użytkownika

                const avatarSrc = getAvatarUrl(msg.username); // Użyj funkcji do pobrania URL
                const timeString = new Date(msg.inserted_at).toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" });
                const senderName = isGroup ? (getUserLabelById(msg.username) || 'Nieznany') : '';

                // --- POCZĄTEK POPRAWIONEJ LOGIKI RENDEROWANIA ---
                let messageContentHtml = '';
                try {
                    // Spróbuj sparsować 'text' jako JSON - jeśli się uda, to wiadomość z plikiem
                    const fileData = JSON.parse(msg.text);
                    if (fileData && fileData.type === 'file') {
                         if (fileData.isImage) {
                             messageContentHtml = `<img src="${fileData.url}" alt="${fileData.fileName || 'Obraz'}" class="chat-image">`;
                         } else {
                             messageContentHtml = `
                                 <img src="${fileData.url}" alt="${fileData.fileName || 'Obraz'}" class="chat-image" data-lightbox-src="${fileData.url}">`;
                         }
                    } else {
                         // Jeśli parsowanie się nie uda lub typ nie jest 'file', to zwykła wiadomość tekstowa
                         messageContentHtml = `<p>${msg.text}</p>`;
                    }
                } catch (e) {
                     // Jeśli msg.text nie jest JSON-em, to jest to zwykła wiadomość tekstowa
                     messageContentHtml = `<p>${msg.text}</p>`;
                }
                // --- KONIEC POPRAWIONEJ LOGIKI RENDEROWANIA ---

                // Zbuduj HTML wiadomości
                messageWrapper.innerHTML = `
                    <img src="${avatarSrc}" alt="Avatar" class="message-avatar">
                    <div class="message-content-wrapper">
                        ${isGroup && !isSent ? `<strong class="sender-name">${senderName}</strong>` : ''}
                        <div class="message">
                            ${messageContentHtml}
                            <span class="timestamp">${timeString}</span>
                        </div>
                    </div>
                `;
                messageContainer.appendChild(messageWrapper);
				const imageElement = messageWrapper.querySelector('.chat-image');
				if (imageElement) {
					imageElement.addEventListener('click', (e) => {
						e.preventDefault();
						const imageUrl = e.target.dataset.lightboxSrc;
						if (imageUrl) {
							openLightbox(imageUrl);
						}
					});
				}
            });
            // Przewiń na dół po załadowaniu początkowej historii
            messageContainer.scrollTop = messageContainer.scrollHeight;

            // --- DODANIE SCROLL LISTENER'A DLA PAGINACJI ---
            const scrollListener = async () => {
                if (messageContainer.scrollTop === 0 && !isLoadingOlderMessages) {
                    isLoadingOlderMessages = true;
                    const oldScrollHeight = messageContainer.scrollHeight;

                    // Pobierz starsze wiadomości
                    const olderMessages = await fetchMessageHistory(currentRoom, MESSAGES_PER_PAGE, currentMessageOffset);
                    if (olderMessages.length > 0) {
                        currentMessageOffset += olderMessages.length; // Zwiększ offset
                        // Renderuj starsze wiadomości na początku listy
                        olderMessages.forEach(msg => {
                             const isSent = String(msg.username) === String(currentUser.id);

                            const messageWrapper = document.createElement('div');
                            messageWrapper.classList.add('message-wrapper', isSent ? 'sent' : 'received');
							messageWrapper.dataset.userId = msg.username;

                            const avatarSrc = getAvatarUrl(msg.username);
                            const timeString = new Date(msg.inserted_at).toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" });
                            const senderName = isGroup ? (getUserLabelById(msg.username) || 'Nieznany') : '';

                            messageWrapper.innerHTML = `
                                <img src="${avatarSrc}" alt="Avatar" class="message-avatar">
                                <div class="message-content-wrapper">
                                     ${isGroup && !isSent ? `<strong class="sender-name">${senderName}</strong>` : ''}
                                    <div class="message">
                                        <p>${msg.text}</p>
                                        <span class="timestamp">${timeString}</span>
                                    </div>
                                </div>
                            `;
                            // Dodaj na początek kontenera
                            messageContainer.prepend(messageWrapper);
                        });
                        // Zachowaj pozycję scrolla, aby widok nie "skakał"
                        messageContainer.scrollTop = messageContainer.scrollHeight - oldScrollHeight;
                    }
                    isLoadingOlderMessages = false;
                }
            };

            messageContainer.addEventListener('scroll', scrollListener);
            messageContainer.scrollListener = scrollListener; // Zapisz referencję do listenera
        } // koniec if (messageContainer)

    } catch (e) {
        console.error("Błąd w handleConversationClick:", e);
        showCustomMessage("Wystąpił błąd podczas ładowania konwersacji.", "error");
    }
}

/**
 * Adds a message to the chat view and updates the conversation preview in the list.
 * Includes logic for displaying browser notifications.
 * @param {Object} msg - The message object.
 */
export async function addMessageToChat(msg) {
    // Sprawdź, czy obecna rozmowa to grupa (robimy to na początku)
    console.log(`[addMessageToChat] Przetwarzanie wiadomości dla pokoju: ${msg.room}`);

    try {
        // --- Aktualizacja podglądu konwersacji ---
        let convoItem = elements.contactsListEl.querySelector(`.contact[data-room-id="${msg.room}"]`);
        if (!convoItem) {
            await loadContacts(); // Załaduj ponownie, jeśli elementu nie ma
            convoItem = elements.contactsListEl.querySelector(`.contact[data-room-id="${msg.room}"]`);
            if (!convoItem) {
                console.error(`Błąd krytyczny: Konwersacja dla pokoju ${msg.room} nie istnieje.`);
                return; // Zakończ, jeśli konwersacja nadal nie istnieje
            }
        }
        updateConversationPreview(msg.room, msg); // Zaktualizuj tekst i czas ostatniej wiadomości

        // --- Obsługa licznika nieprzeczytanych wiadomości ---
        const isMessageFromOtherUser = String(msg.username) !== String(currentUser.id);
        const isForInactiveChat = msg.room !== currentRoom;

        if (isMessageFromOtherUser && isForInactiveChat) {
            await updateUnreadMessageCountInSupabase(msg.room, msg.username);
        } else if (msg.room === currentRoom) {
            // Jeśli wiadomość jest dla aktywnego czatu, wyzeruj licznik (nawet jeśli to nasza wiadomość)
            await clearUnreadMessageCountInSupabase(msg.room);
        }

        // --- Obsługa powiadomień przeglądarkowych ---
        const shouldNotify = notificationPermissionGranted && isMessageFromOtherUser && (document.hidden || isForInactiveChat);
        // ... (kod diagnostyki powiadomień - bez zmian) ...
        if (shouldNotify) {
            console.log('%c--- Warunki spełnione, TWORZĘ POWIADOMIENIE ---', 'color: green;');
            const senderLabel = getUserLabelById(msg.username) || 'Ktoś';
            new Notification(`Nowa wiadomość od ${senderLabel}`, {
                body: msg.text,
                icon: 'https://placehold.co/48x48/000000/FFFFFF?text=💬', // Możesz zmienić ikonę
                silent: true // Zwykle powiadomienia czatu są ciche
            }).onclick = () => window.focus(); // Skup okno po kliknięciu
            playNotificationSound(); // Odtwórz dźwięk
        } else {
             console.log('%c--- Warunki NIESPEŁNIONE, nie pokazuję powiadomienia. ---', 'color: gray;');
        }

        // --- Renderowanie wiadomości w aktywnym czacie ---
        if (msg.room === currentRoom) {
			const isGroup = currentChatUser && currentChatUser.type === 'group';
            const messageContainer = elements.messageContainer;
            if (messageContainer) {
                const isSent = String(msg.username) === String(currentUser.id);

                // Utwórz główny wrapper dla jednej wiadomości
                const messageWrapper = document.createElement('div');
                messageWrapper.classList.add('message-wrapper', isSent ? 'sent' : 'received');
				messageWrapper.dataset.userId = msg.username;

                const avatarSrc = getAvatarUrl(msg.username);
                const timeString = new Date(msg.inserted_at).toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" });
                const senderName = isGroup ? (getUserLabelById(msg.username) || 'Nieznany') : '';

                // Zbuduj HTML wiadomości z nową strukturą
				let messageContentHtml = '';
				try {
					// Spróbuj sparsować 'text' jako JSON - jeśli się uda, to wiadomość z plikiem
					const fileData = JSON.parse(msg.text);
					if (fileData && fileData.type === 'file') {
						if (fileData.isImage) {
							// Wyświetl obrazek
							messageContentHtml = `<img src="${fileData.url}" alt="${fileData.fileName || 'Obraz'}" class="chat-image">`;
						} else {
							// Wyświetl link do załącznika
							messageContentHtml = `
								<img src="${fileData.url}" alt="${fileData.fileName || 'Obraz'}" class="chat-image" data-lightbox-src="${fileData.url}">`;
						}
					} else {
						// Jeśli parsowanie się nie uda lub typ nie jest 'file', to zwykła wiadomość tekstowa
						messageContentHtml = `<p>${msg.text}</p>`;
					}
				} catch (e) {
					// Jeśli msg.text nie jest JSON-em, to jest to zwykła wiadomość tekstowa
					messageContentHtml = `<p>${msg.text}</p>`;
				}


				// Zbuduj HTML wiadomości
				messageWrapper.innerHTML = `
					<img src="${avatarSrc}" alt="Avatar" class="message-avatar">
					<div class="message-content-wrapper">
						${isGroup && !isSent ? `<strong class="sender-name">${senderName}</strong>` : ''}
						<div class="message">
							${messageContentHtml}
							<span class="timestamp">${timeString}</span>
						</div>
					</div>
				`;
				messageWrapper.dataset.userId = msg.username; // Zachowaj ID użytkownika

				messageContainer.appendChild(messageWrapper);
				const imageElement = messageWrapper.querySelector('.chat-image');
				if (imageElement) {
					imageElement.addEventListener('click', (e) => {
						e.preventDefault(); // Zatrzymaj ewentualne domyślne zachowanie
						const imageUrl = e.target.dataset.lightboxSrc;
						if (imageUrl) {
							openLightbox(imageUrl);
						}
					});
				}
				messageContainer.scrollTop = messageContainer.scrollHeight;
            }
        }
    } catch (e) {
        console.error("Błąd w addMessageToChat:", e);
        // Opcjonalnie: Pokaż użytkownikowi komunikat o błędzie
        // showCustomMessage("Wystąpił błąd podczas dodawania wiadomości.", "error");
    }
}

/**
 * Updates the online/offline status indicator for a specific user across the UI.
 * @param {string} userId - The ID of the user whose status is being updated.
 * @param {boolean} isOnline - True if the user is online, false otherwise.
 * @param {string | null} lastSeenTimestamp - Optional: The timestamp when the user was last seen.
 */
export function updateUserStatusIndicator(userId, isOnline, lastSeenTimestamp = null) {
    try {
        // Krok 1: Zaktualizuj globalną mapę statusów
        onlineUsers.set(String(userId), { 
            isOnline, 
            lastSeen: isOnline ? null : lastSeenTimestamp || new Date().toISOString() 
        });

        // Krok 2: Zaktualizuj status w nagłówku aktywnego czatu
        if (currentChatUser && String(currentChatUser.id) === String(userId) && userStatusSpan) {
            elements.userStatusSpan.classList.toggle('online', isOnline);
            elements.userStatusSpan.classList.toggle('offline', !isOnline);
            if (isOnline) {
                userStatusSpan.textContent = 'Online';
            } else {
                const lastSeenInfo = onlineUsers.get(String(userId));
                let lastSeenText = 'Offline';
                if (lastSeenInfo && lastSeenInfo.lastSeen) {
                    lastSeenText = `Offline (ostatnio widziany ${formatTimeAgo(new Date(lastSeenInfo.lastSeen))})`;
                }
                elements.userStatusSpan.textContent = lastSeenText;
            }
        }

        // Krok 3: Zaktualizuj listy aktywnych użytkowników (desktop i mobile)
        const isFriend = allFriends.some(friend => String(friend.id) === String(userId));
        const shouldBeOnActiveList = isOnline && isFriend && String(userId) !== String(currentUser.id);

        [elements.activeUsersListEl, elements.onlineUsersMobile].forEach(list => {
            if (!list) return;
            const userItem = list.querySelector(`[data-user-id="${userId}"]`);
            if (shouldBeOnActiveList && !userItem) {
                // Dodaj użytkownika do listy aktywnych
				const item = document.createElement(list === elements.activeUsersListEl ? 'li' : 'div');
                const isDesktopList = list === elements.activeUsersListEl;
                
                item.className = isDesktopList ? 'active-user-item' : 'online-user-item-mobile';
                item.dataset.userId = userId;

                const avatarSrc = `https://i.pravatar.cc/150?img=${userId.charCodeAt(0) % 70 + 1}`;
                const userName = getUserLabelById(userId) || 'Nieznany';

                if (isDesktopList) {
                    item.innerHTML = `
                        <img src="${avatarSrc}" alt="Avatar" class="avatar">
                        <span class="username">${userName}</span>
                        <span class="status-dot online"></span>
                    `;
                } else {
                    item.innerHTML = `
                        <img src="${avatarSrc}" alt="Avatar" class="avatar">
                        <span class="username">${userName}</span>
                    `;
                }
                
                // Dodaj listener do otwierania czatu
                item.addEventListener('click', () => {
                    const userProfile = allFriends.find(p => String(p.id) === String(userId));
                    if (userProfile) {
                        const mockConvoItem = document.createElement('li'); // Symulujemy element, by przekazać go do funkcji
                        mockConvoItem.dataset.roomId = getRoomName(String(currentUser.id), String(userProfile.id));
                        handleConversationClick(userProfile, mockConvoItem);
                    }
                });

                list.appendChild(item);
            } else if (!shouldBeOnActiveList && userItem) {
                userItem.remove(); // Usuń użytkownika z listy aktywnych
            }
        });

        // Krok 4: Zaktualizuj kropkę statusu na głównej liście kontaktów
        const contactItem = elements.contactsListEl.querySelector(`.contact[data-convo-id="${userId}"]`);
        if (contactItem) {
            const statusDot = contactItem.querySelector('.status-dot');
            if (statusDot) {
                statusDot.classList.toggle('online', isOnline);
                statusDot.classList.toggle('offline', !isOnline);
            }
        }
		renderActiveUsersList();
    } catch (e) {
        console.error("Błąd w updateUserStatusIndicator:", e);
    }
}

/**
 * Displays the typing indicator for a specific user.
 * Hides it after a short delay.
 * @param {string} usernameId - The ID of the user who is typing.
 */
export function showTypingIndicator(usernameId) {
    try {
        // Pokaż wskaźnik tylko, jeśli dotyczy on aktywnej rozmowy
        if (currentChatUser && String(usernameId) === String(currentChatUser.id)) {
            const userName = getUserLabelById(usernameId);

            // Pokaż wskaźnik w nagłówku i w obszarze wiadomości
            if (elements.typingStatusHeader) {
                elements.typingStatusHeader.classList.remove('hidden');
                elements.typingStatusHeader.textContent = `${userName} pisze...`;
            }
            if (elements.typingIndicatorMessages) {
                elements.typingIndicatorMessages.classList.remove('hidden');
            }

            // Ustaw timer, który ukryje wskaźnik po 3 sekundach braku aktywności
            clearTimeout(typingTimeout);
            typingTimeout = setTimeout(() => {
                if (typingStatusHeader) typingStatusHeader.classList.add('hidden');
                if (typingIndicatorMessages) typingIndicatorMessages.classList.add('hidden');
            }, 3000);
        }
    } catch (e) {
        console.error("Błąd w showTypingIndicator:", e);
    }
}

/**
 * Updates the unread message count for a given room in Supabase.
 * @param {string} roomId - The ID of the chat room.
 * @param {string} senderId - The ID of the message sender.
 */
export async function updateUnreadMessageCountInSupabase(roomId, senderId) {
    if (!supabase || !currentUser) return;
    
    try {
        const { error } = await supabase
            .from('unread_messages')
            .upsert({
                user_id: currentUser.id,
                room_id: roomId,
                // Increment the current count from our local state map
                count: (unreadConversationsInfo.get(roomId)?.unreadCount || 0) + 1,
                last_sender_id: senderId,
                updated_at: new Date().toISOString()
            }, {
                onConflict: 'user_id, room_id'
            });

        if (error) {
            console.error("[Supabase] Błąd podczas aktualizacji licznika nieprzeczytanych:", error.message);
        } else {
            console.log(`[Supabase] Zaktualizowano licznik nieprzeczytanych dla pokoju ${roomId}.`);
        }
        
        // Refresh local state from the database after the update
        await loadUnreadMessagesFromSupabase();

    } catch (e) {
        console.error("[Supabase] Błąd krytyczny podczas aktualizacji licznika:", e);
    }
}

/**
 * Clears the unread message count for a given room in Supabase.
 * @param {string} roomId - The ID of the chat room to clear.
 */
export async function clearUnreadMessageCountInSupabase(roomId) {
    if (!supabase || !currentUser) return;
    
    try {
        const { error } = await supabase
            .from('unread_messages')
            .update({
                count: 0,
                last_sender_id: null,
                updated_at: new Date().toISOString()
            })
            .eq('user_id', currentUser.id)
            .eq('room_id', roomId);

        if (error) {
            console.error("[Supabase] Błąd podczas zerowania licznika nieprzeczytanych:", error.message);
        } else {
            console.log(`[Supabase] Wyzerowano licznik nieprzeczytanych dla pokoju ${roomId}.`);
        }
        
		if (unreadConversationsInfo.has(roomId)) {
            unreadConversationsInfo.delete(roomId);
            updateDocumentTitle();
        }

    } catch (e) {
        console.error("[Supabase] Błąd krytyczny podczas zerowania licznika:", e);
    }
}

/**
 * Loads all unread messages for the current user from Supabase
 * and updates the local state and UI.
 */
export async function loadUnreadMessagesFromSupabase() {
    if (!supabase || !currentUser) return;

    try {
        const { data, error } = await supabase
            .from('unread_messages')
            .select('room_id, count, last_sender_id')
            .eq('user_id', currentUser.id);

        if (error) {
            console.error("[Supabase] Błąd podczas ładowania nieprzeczytanych wiadomości:", error.message);
            return;
        }

        // Wyczyść lokalny stan przed aktualizacją
        unreadConversationsInfo.clear();
        
        data.forEach(record => {
            // Zaktualizuj lokalną mapę
            if (record.count > 0) {
                unreadConversationsInfo.set(record.room_id, {
                    unreadCount: record.count,
                    lastSenderId: record.last_sender_id
                });
            }

            // Zaktualizuj licznik w UI na liście kontaktów
            const convoItem = contactsListEl.querySelector(`.contact[data-room-id="${record.room_id}"]`);
            if (convoItem) {
                const unreadCountEl = convoItem.querySelector('.unread-count');
                if (unreadCountEl) {
                    if (record.count > 0) {
                        unreadCountEl.textContent = record.count;
                        unreadCountEl.classList.remove('hidden');
                    } else {
                        unreadCountEl.textContent = '';
                        unreadCountEl.classList.add('hidden');
                    }
                }
            }
        });
        
        // Zaktualizuj tytuł zakładki przeglądarki
        updateDocumentTitle();

    } catch (e) {
        console.error("[Supabase] Błąd krytyczny podczas ładowania nieprzeczytanych wiadomości:", e);
    }
}