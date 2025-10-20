// Plik: friendsService.js

import { supabase } from '../supabaseClient.js';
import { setAllFriends, onlineUsers, currentUser, allFriends, socket } from '../chat.js';
import { notificationBadge, contactsListEl, friendEmailInput, sendRequestStatus, pendingFriendRequestsList, noPendingRequestsText, pendingRequestsSection, activeUsersListEl, noActiveUsersText, onlineUsersMobile, friendRequestModal } from '../ui/elements.js';
import { showCustomMessage } from '../ui/helpers.js';
import { loadUnreadMessagesFromSupabase, getRoomName, sortConversations, handleConversationClick } from './chatService.js';
import { loadAllProfiles, getUserLabelById } from '../profiles.js';

/**
 * Loads and renders the list of contacts (friends).
 * Fetches friends from Supabase, retrieves their last message, and displays them
 */
export async function loadContacts() {
    if (!currentUser) return;
    try {
        const { data: friendsData, error: friendsError } = await supabase
            .from('friends')
            .select('user_id, friend_id')
            .or(`user_id.eq.${currentUser.id},friend_id.eq.${currentUser.id}`)
            .eq('status', 'accepted');
        if (friendsError) throw friendsError;

        const friendIds = new Set(friendsData.map(f => (String(f.user_id) === String(currentUser.id) ? f.friend_id : f.user_id)));
        const allProfilesData = (await loadAllProfiles()) || [];
        const friends = allProfilesData.filter(profile => friendIds.has(profile.id));
        setAllFriends(friends);

        if (elements.contactsListEl) {
            elements.contactsListEl.innerHTML = '';
        } else {
            return;
        }

        let lastMessagesMap = {};
        if (socket && socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ type: 'get_last_messages_for_user_rooms', userId: currentUser.id }));
            lastMessagesMap = await new Promise(resolve => {
                const tempHandler = (event) => {
                    const data = JSON.parse(event.data);
                    if (data.type === 'last_messages_for_user_rooms') {
                        socket.removeEventListener('message', tempHandler);
                        clearTimeout(timeoutId);
                        resolve(data.messages);
                    }
                };
                const timeoutId = setTimeout(() => {
                    socket.removeEventListener('message', tempHandler);
                    resolve({});
                }, 5000);
                socket.addEventListener('message', tempHandler);
            });
        }

        const contactsWithLastMessage = allFriends.map(user => {
            const roomId = getRoomName(String(currentUser.id), String(user.id));
            return { user, lastMessage: lastMessagesMap[roomId] || null, roomId };
        });
        const sortedContacts = sortConversations(contactsWithLastMessage);

        sortedContacts.forEach(({ user, lastMessage, roomId }) => {
            const convoItem = document.createElement('li');
            convoItem.className = 'contact';
            convoItem.dataset.roomId = roomId;
            convoItem.dataset.convoId = user.id;
            const avatarSrc = `https://i.pravatar.cc/150?img=${user.id.charCodeAt(0) % 70 + 1}`;
            const senderName = lastMessage ? (String(lastMessage.username) === String(currentUser.id) ? "Ja" : (getUserLabelById(lastMessage.username) || '...')) : "";
            const previewText = lastMessage ? `${senderName}: ${lastMessage.text}` : "Brak wiadomości";
            const timeText = lastMessage ? new Date(lastMessage.inserted_at).toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" }) : "";
            convoItem.innerHTML = `<img src="${avatarSrc}" alt="Avatar" class="avatar"><div class="contact-info"><span class="contact-name">${getUserLabelById(user.id) || user.email}</span><span class="status-dot offline"></span><span class="last-message">${previewText}</span></div><div class="contact-meta"><span class="message-time">${timeText}</span><span class="unread-count hidden"></span></div>`;
            convoItem.addEventListener('click', () => handleConversationClick(user, convoItem));
            elements.contactsListEl.appendChild(convoItem);
        });

        await loadUnreadMessagesFromSupabase();
        renderActiveUsersList();
    } catch (e) {
        console.error("Błąd w loadContacts:", e);
        showCustomMessage("Wystąpił błąd podczas ładowania kontaktów.", "error");
    }
}

/**
 * Loads and displays the list of active users by requesting it from the server.
 */
export async function loadActiveUsers() {
    console.log("[loadActiveUsers] Wczytywanie aktywnych użytkowników...");
    if (!activeUsersListEl || !noActiveUsersText || !onlineUsersMobile) {
        console.error("[loadActiveUsers] Nie znaleziono kluczowych elementów UI dla listy aktywnych użytkowników.");
        return;
    }

    try {
        if (socket && socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ type: 'get_active_users' }));
            console.log("[loadActiveUsers] Wysłano prośbę o listę aktywnych użytkowników.");
        } else {
            console.warn("[loadActiveUsers] WebSocket nie jest otwarty, nie można pobrać listy.");
        }
    } catch (e) {
        console.error("Błąd w loadActiveUsers:", e);
    }
}

export function renderActiveUsersList() {
    if (!elements.activeUsersListEl || !elements.noActiveUsersText || !elements.onlineUsersMobile) return;

    elements.activeUsersListEl.innerHTML = '';
    elements.onlineUsersMobile.innerHTML = '';

    const onlineFriends = allFriends.filter(friend => {
        const status = onlineUsers.get(String(friend.id));
        return status && status.isOnline && String(friend.id) !== String(currentUser.id);
    });

    if (onlineFriends.length === 0) {
        elements.activeUsersListEl.style.display = 'none';
        elements.noActiveUsersText.style.display = 'block';
    } else {
        elements.activeUsersListEl.style.display = 'block';
        elements.noActiveUsersText.style.display = 'none';
        
        onlineFriends.forEach(user => {
            const userId = user.id;
            const userName = getUserLabelById(userId) || 'Nieznany';
            const avatarSrc = `https://i.pravatar.cc/150?img=${userId.charCodeAt(0) % 70 + 1}`;

            const createItem = (isDesktop) => {
                const item = document.createElement(isDesktop ? 'li' : 'div');
                item.className = isDesktop ? 'active-user-item' : 'online-user-item-mobile';
                item.dataset.userId = userId;
                item.innerHTML = isDesktop ? `
                    <img src="${avatarSrc}" alt="Avatar" class="avatar">
                    <span class="username">${userName}</span>
                    <span class="status-dot online"></span>` : `
                    <img src="${avatarSrc}" alt="Avatar" class="avatar">
                    <span class="username">${userName}</span>`;
                item.addEventListener('click', () => {
                    const userProfile = allFriends.find(p => String(p.id) === String(userId));
                    if (userProfile) {
                        const mockConvoItem = document.createElement('li');
                        mockConvoItem.dataset.roomId = getRoomName(String(currentUser.id), String(userProfile.id));
                        handleConversationClick(userProfile, mockConvoItem);
                    }
                });
                return item;
            };
            elements.activeUsersListEl.appendChild(createItem(true));
            elements.onlineUsersMobile.appendChild(createItem(false));
        });
    }
}

/**
 * Displays a list of active users (friends) in the UI.
 * @param {Array<Object>} activeUsersData - An array of active user objects from the server.
 */
export function displayActiveUsers(activeUsersData) {
    onlineUsers.clear();
    activeUsersData.forEach(user => {
        onlineUsers.set(String(user.id), { isOnline: user.online, lastSeen: user.last_seen });
    });
    renderActiveUsersList();
}

/**
 * Loads the user's friends list and pending friend requests.
 * Refreshes the contact list and the notification badge.
 */
export async function loadFriendsAndRequests() {
    if (!supabase || !currentUser) {
        console.warn("[Friends] Brak klienta Supabase lub użytkownika.");
        return;
    }

    console.log("[Friends] Wczytywanie znajomych i zaproszeń...");
    try {
        // Krok 1: Odśwież główną listę kontaktów (która jest listą znajomych)
        await loadContacts();

        // Krok 2: Pobierz zaproszenia oczekujące na Twoją akceptację
        const { data: pendingRequests, error } = await supabase
            .from('friends')
            .select('id, user_id, friend_id, status')
            .eq('friend_id', currentUser.id) // Jesteś odbiorcą
            .eq('status', 'pending');

        if (error) {
            console.error("[Friends] Błąd podczas pobierania zaproszeń:", error.message);
        } else {
            // Krok 3: Wyrenderuj te zaproszenia w oknie powiadomień
            renderPendingFriendRequests(pendingRequests);

            // Krok 4: Zaktualizuj liczbę na ikonce powiadomień
            updateNotificationBadge(pendingRequests.length);
        }
    } catch (e) {
        console.error("[Friends] Błąd krytyczny w loadFriendsAndRequests:", e);
        showCustomMessage("Wystąpił błąd podczas ładowania znajomych.", "error");
    }
}

/**
 * Sends a friend request based on the provided email address.
 */
export async function sendFriendRequest() {
    if (!friendEmailInput || !sendRequestStatus || !currentUser) return;

    const friendEmail = friendEmailInput.value.trim();
    sendRequestStatus.textContent = '';

    // Krok 1: Walidacja danych wejściowych
    if (!friendEmail) {
        sendRequestStatus.textContent = 'Wprowadź adres e-mail.';
        return;
    }
    if (friendEmail === currentUser.email) {
        sendRequestStatus.textContent = 'Nie możesz zaprosić samego siebie.';
        return;
    }
    if (allFriends.some(friend => friend.email === friendEmail)) {
        sendRequestStatus.textContent = 'Ten użytkownik jest już Twoim znajomym.';
        return;
    }

    try {
        // Krok 2: Znajdź odbiorcę w bazie danych
        const { data: recipient, error: recipientError } = await supabase
            .from('profiles')
            .select('id')
            .eq('email', friendEmail)
            .single();

        if (recipientError || !recipient) {
            sendRequestStatus.textContent = 'Nie znaleziono użytkownika o tym e-mailu.';
            return;
        }

        const recipientId = recipient.id;

        // Krok 3: Sprawdź, czy relacja już istnieje
        const { data: existingRelation, error: relationError } = await supabase
            .from('friends')
            .select('status')
            .or(`and(user_id.eq.${currentUser.id},friend_id.eq.${recipientId}),and(user_id.eq.${recipientId},friend_id.eq.${currentUser.id})`)
            .single();

        if (existingRelation) {
            sendRequestStatus.textContent = 'Zaproszenie do tego użytkownika już istnieje.';
            return;
        }

        // Krok 4: Wyślij zaproszenie (dodaj wpis do bazy)
        const { error } = await supabase
            .from('friends')
            .insert([{ user_id: currentUser.id, friend_id: recipientId, status: 'pending' }]);

        if (error) {
            throw error;
        }

        sendRequestStatus.textContent = 'Zaproszenie wysłane!';
        friendEmailInput.value = '';
        await loadFriendsAndRequests(); // Odśwież UI

    } catch (error) {
        console.error("[Friends] Błąd podczas wysyłania zaproszenia:", error.message);
        sendRequestStatus.textContent = `Błąd: ${error.message}`;
    }
}

/**
 * Renders the list of pending friend requests in the modal.
 * @param {Array<Object>} requests - An array of friend request objects.
 */
async function renderPendingFriendRequests(requests) {
    if (!pendingFriendRequestsList || !noPendingRequestsText) return;

    pendingFriendRequestsList.innerHTML = ''; // Wyczyść listę

    if (requests.length === 0) {
        noPendingRequestsText.classList.remove('hidden');
        pendingRequestsSection.classList.add('empty');
    } else {
        noPendingRequestsText.classList.add('hidden');
        pendingRequestsSection.classList.remove('empty');

        // Pobierz profile nadawców, aby wyświetlić ich nazwy
        const senderIds = requests.map(req => req.user_id);
        const senderProfiles = (await loadAllProfiles()).filter(p => senderIds.includes(p.id));
        const senderProfileMap = new Map(senderProfiles.map(p => [p.id, p]));

        requests.forEach(request => {
            const senderProfile = senderProfileMap.get(request.user_id);
            const senderName = senderProfile ? (senderProfile.username || senderProfile.email) : 'Nieznany';

            const listItem = document.createElement('li');
            listItem.className = 'friend-request-item';
            listItem.innerHTML = `
                <div class="request-info">
                    Zaproszenie od: <span class="sender-name">${senderName}</span>
                </div>
                <div class="request-actions">
                    <button class="accept-button">Akceptuj</button>
                    <button class="reject-button">Odrzuć</button>
                </div>
            `;
            
            // Podepnij akcje do przycisków
            listItem.querySelector('.accept-button').addEventListener('click', () => acceptFriendRequest(request.id, request.user_id));
            listItem.querySelector('.reject-button').addEventListener('click', () => declineFriendRequest(request.id));
            
            pendingFriendRequestsList.appendChild(listItem);
        });
    }
}

/**
 * Accepts a friend request.
 * @param {string} requestId - The ID of the request record in the 'friends' table.
 * @param {string} senderId - The ID of the user who sent the request.
 */
export async function acceptFriendRequest(requestId, senderId) {
    if (!supabase || !currentUser) {
        showCustomMessage("Błąd: Brak danych do akceptacji zaproszenia.", "error");
        return;
    }
    
    try {
        // Zmień status relacji na 'accepted'
        const { error } = await supabase
            .from('friends')
            .update({ status: 'accepted', updated_at: new Date().toISOString() })
            .eq('id', requestId);

        if (error) {
            throw error;
        }

        showCustomMessage('Zaproszenie zaakceptowane!', 'success');

        // Odśwież UI, aby nowy znajomy pojawił się na liście, a zaproszenie zniknęło
        await loadFriendsAndRequests();
        
        // Zamknij okno powiadomień
        if (friendRequestModal) {
            friendRequestModal.classList.remove('visible');
        }

    } catch (error) {
        console.error("[Friends] Błąd podczas akceptacji zaproszenia:", error.message);
        showCustomMessage(`Błąd: ${error.message}`, "error");
    }
}

/**
 * Declines a friend request.
 * @param {string} requestId - The ID of the request record in the 'friends' table.
 */
export async function declineFriendRequest(requestId) {
    if (!supabase || !currentUser) {
        showCustomMessage("Błąd: Brak danych do odrzucenia zaproszenia.", "error");
        return;
    }

    try {
        // Zmień status relacji na 'declined'
        const { error } = await supabase
            .from('friends')
            .update({ status: 'declined', updated_at: new Date().toISOString() })
            .eq('id', requestId);

        if (error) {
            throw error;
        }

        showCustomMessage('Zaproszenie odrzucone.', 'info');

        // Odśwież UI, aby zaproszenie zniknęło
        await loadFriendsAndRequests();
        
        // Zamknij okno powiadomień
        if (friendRequestModal) {
            friendRequestModal.classList.remove('visible');
        }
        
    } catch (error) {
        console.error("[Friends] Błąd podczas odrzucania zaproszenia:", error.message);
        showCustomMessage(`Błąd: ${error.message}`, "error");
    }
}

/**
 * Updates the notification badge with the number of pending requests.
 * @param {number} count - The number of pending friend requests.
 */
function updateNotificationBadge(count) {
    if (notificationBadge) {
        if (count > 0) {
            notificationBadge.textContent = count;
            notificationBadge.classList.remove('hidden');
        } else {
            notificationBadge.textContent = '0';
            notificationBadge.classList.add('hidden');
        }
    }
}

/**
 * Handles the browser notification for a new friend request.
 * @param {string} senderId - The ID of the user who sent the request.
 */
export async function handleNewFriendRequestNotification(senderId) {
    if (!notificationPermissionGranted) return;

    const senderLabel = getUserLabelById(senderId) || 'Ktoś';
    const notification = new Notification(`Nowe zaproszenie od ${senderLabel}`, {
        body: `Kliknij, aby zobaczyć.`,
        icon: 'https://placehold.co/48x48/6a5acd/FFFFFF?text=🤝',
        silent: true
    });

    notification.onclick = () => {
        window.focus();
        // Otwórz modal z zaproszeniami
        openFriendRequestModal(false, true); 
    };

    playNotificationSound();
    // Odśwież dane, aby zaktualizować ikonkę powiadomień
    await loadFriendsAndRequests();
}

/**
 * Opens the friend request modal and controls the visibility of its sections.
 * @param {boolean} showSendSection - If true, shows the 'send friend request' section.
 * @param {boolean} showPendingSection - If true, shows the 'pending requests' section.
 */
export function openFriendRequestModal(showSendSection, showPendingSection) {
    if (!elements.friendRequestModal || !elements.sendFriendRequestSection || !elements.pendingRequestsSection) {
        console.error("[Friends] Missing modal elements.");
        return;
    }

    elements.friendRequestModal.classList.add('visible'); // Show modal

    if (showSendSection) {
        elements.sendFriendRequestSection.style.display = 'block';
    } else {
        elements.sendFriendRequestSection.style.display = 'none';
    }

    if (showPendingSection) {
        elements.pendingRequestsSection.style.display = 'block';
        loadFriendsAndRequests(); // Load fresh data for the pending requests list
    } else {
        elements.pendingRequestsSection.style.display = 'none';
    }
}

export function updateConversationPreview(roomId, message) {

    if (!contactsListEl) return;

    const convoItem = contactsListEl.querySelector(`[data-room-id="${roomId}"]`);
    if (convoItem) {
        const lastMessageSpan = convoItem.querySelector('.last-message');
        const messageTimeSpan = convoItem.querySelector('.message-time');

        if (lastMessageSpan) {
            const senderName = String(message.username) === String(currentUser.id) ? "Ja" : (getUserLabelById(message.username) || 'Ktoś');
            lastMessageSpan.textContent = `${senderName}: ${message.text}`;
        }

        if (messageTimeSpan) {
            const messageTime = new Date(message.inserted_at);
            if (!isNaN(messageTime.getTime())) {
                messageTimeSpan.textContent = messageTime.toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" });
            }
        }

        // Przenieś zaktualizowaną konwersację na górę listy
        if (contactsListEl.firstChild !== convoItem) {
            contactsListEl.prepend(convoItem);
        }
    }
}