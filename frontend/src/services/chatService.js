// Plik: chatService.js

import { supabase } from '../supabaseClient.js';
import * as elements from '../ui/elements.js';
import { getUserLabelById } from '../profiles.js';
import { formatTimeAgo, showCustomMessage, playNotificationSound, updateDocumentTitle } from '../ui/helpers.js';
import { loadContacts, updateConversationPreview, renderActiveUsersList } from './friendsService.js';
import { onlineUsers, currentChatUser, allFriends, currentUser, unreadConversationsInfo, currentActiveConvoItem, setCurrentActiveConvoItem, setCurrentChatUser, setCurrentRoom, socket, currentRoom, notificationPermissionGranted, typingTimeout } from '../chat.js';

/**
 * Resets the chat view to its initial state.
 */
export function resetChatView() {
    if (elements.messageContainer) {
        elements.messageContainer.innerHTML = "";
        elements.messageContainer.className = 'messages';
    }
    if (elements.messageInput) {
        elements.messageInput.disabled = true;
        elements.messageInput.value = "";
    }
    if (elements.sendButton) {
        elements.sendButton.disabled = true;
    }
    if (elements.chatUserName) {
        elements.chatUserName.textContent = "";
    }
    if (elements.userStatusSpan) {
        elements.userStatusSpan.textContent = "";
        elements.userStatusSpan.className = 'status';
    }
    if (elements.typingStatusHeader) {
        elements.typingStatusHeader.classList.add('hidden');
        elements.typingStatusHeader.textContent = '';
    }
    if (elements.typingIndicatorMessages) {
        elements.typingIndicatorMessages.classList.add('hidden');
    }

    setCurrentChatUser(null);
    setCurrentRoom(null);

    if (currentActiveConvoItem) {
        currentActiveConvoItem.classList.remove('active');
        setCurrentActiveConvoItem(null);
    }
    if (elements.chatSettingsDropdown) {
        elements.chatSettingsDropdown.classList.add('hidden');
    }
}

export function getRoomName(user1Id, user2Id) {
    return [String(user1Id), String(user2Id)].sort().join('_');
}

export async function fetchMessageHistory(roomId) {
    try {
        const { data, error } = await supabase
            .from('messages')
            .select('content, sender_id, created_at, room_id')
            .eq('room_id', roomId)
            .order('created_at', { ascending: true })
            .limit(50);
        if (error) throw error;
        return data.map(msg => ({
            text: msg.content,
            username: msg.sender_id,
            inserted_at: msg.created_at,
            room: msg.room_id
        }));
    } catch (e) {
        console.error("Błąd w fetchMessageHistory:", e);
        return [];
    }
}

export function sortConversations(conversations) {
    return [...conversations].sort((a, b) => {
        const timeA = a.lastMessage ? new Date(a.lastMessage.inserted_at) : new Date(0);
        const timeB = b.lastMessage ? new Date(b.lastMessage.inserted_at) : new Date(0);
        return timeB - timeA;
    });
}

export async function handleConversationClick(convoData, clickedConvoItemElement, convoType = 'private') {
    try {
        if (currentActiveConvoItem) {
            currentActiveConvoItem.classList.remove('active');
        }
        clickedConvoItemElement.classList.add('active');
        setCurrentActiveConvoItem(clickedConvoItemElement);

        if (socket && socket.readyState === WebSocket.OPEN && currentRoom && currentRoom !== 'global') {
            socket.send(JSON.stringify({ type: 'leave', room: currentRoom }));
        }

        if (window.matchMedia('(max-width: 768px)').matches) {
            if (elements.sidebarWrapper) elements.sidebarWrapper.classList.add('hidden-on-mobile');
            if (elements.chatAreaWrapper) elements.chatAreaWrapper.classList.add('active-on-mobile');
        }

        if (elements.logoScreen) elements.logoScreen.classList.add('hidden');
        if (elements.chatArea) elements.chatArea.classList.add('active');

        resetChatView();

        let newRoom = '';
        let chatName = '';

        if (convoType === 'private') {
            const user = convoData;
            newRoom = getRoomName(String(currentUser.id), String(user.id));
            chatName = getUserLabelById(user.id) || user.email;
            setCurrentChatUser({ id: user.id, username: chatName, email: user.email });
        } else {
            const group = convoData;
            newRoom = group.id;
            chatName = group.name;
            setCurrentChatUser({ id: group.id, username: chatName, isGroup: true });
        }

        setCurrentRoom(newRoom);

        if (elements.chatUserName) elements.chatUserName.textContent = chatName;

        if (convoType === 'private' && elements.userStatusSpan) {
            const userStatus = onlineUsers.get(String(convoData.id));
            const isUserOnline = !!(userStatus && userStatus.isOnline);
            elements.userStatusSpan.classList.toggle('online', isUserOnline);
            elements.userStatusSpan.classList.toggle('offline', !isUserOnline);
            elements.userStatusSpan.textContent = isUserOnline ? 'Online' : 'Offline';
        } else if (elements.userStatusSpan) {
            elements.userStatusSpan.textContent = '';
            elements.userStatusSpan.className = 'status';
        }

        if (elements.messageInput) elements.messageInput.disabled = false;
        if (elements.sendButton) elements.sendButton.disabled = false;

        if (socket && socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ type: 'join', name: currentUser.id, room: newRoom }));
        }

        const history = await fetchMessageHistory(currentRoom);
        if (elements.messageContainer) {
            elements.messageContainer.innerHTML = '';
            history.forEach(msg => {
                const div = document.createElement('div');
                div.classList.add('message', String(msg.username) === String(currentUser.id) ? 'sent' : 'received');
                const timeString = new Date(msg.inserted_at).toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" });
                div.innerHTML = `<p>${msg.text}</p><span class="timestamp">${timeString}</span>`;
                elements.messageContainer.appendChild(div);
            });
            elements.messageContainer.scrollTop = elements.messageContainer.scrollHeight;
        }

    } catch (e) {
        console.error("Błąd w handleConversationClick:", e);
        showCustomMessage("Wystąpił błąd podczas ładowania konwersacji.", "error");
    }
}

export async function addMessageToChat(msg) {
    try {
        updateConversationPreview(msg.room, msg);
        if (msg.room === currentRoom) {
            const div = document.createElement('div');
            div.classList.add('message', String(msg.username) === String(currentUser.id) ? 'sent' : 'received');
            const timeString = new Date(msg.inserted_at).toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" });
            div.innerHTML = `<p>${msg.text}</p><span class="timestamp">${timeString}</span>`;
            if (elements.messageContainer) {
                elements.messageContainer.appendChild(div);
                elements.messageContainer.scrollTop = elements.messageContainer.scrollHeight;
            }
        }
    } catch (e) {
        console.error("Błąd w addMessageToChat:", e);
    }
}

export function updateUserStatusIndicator(userId, isOnline, lastSeenTimestamp = null) {
    try {
        onlineUsers.set(String(userId), { isOnline, lastSeen: isOnline ? null : lastSeenTimestamp || new Date().toISOString() });
        if (currentChatUser && String(currentChatUser.id) === String(userId) && elements.userStatusSpan) {
            elements.userStatusSpan.classList.toggle('online', isOnline);
            elements.userStatusSpan.classList.toggle('offline', !isOnline);
            elements.userStatusSpan.textContent = isOnline ? 'Online' : `Offline (ostatnio: ${formatTimeAgo(new Date(lastSeenTimestamp))})`;
        }
        renderActiveUsersList();
        const contactItem = elements.contactsListEl.querySelector(`.contact[data-convo-id="${userId}"]`);
        if (contactItem) {
            const statusDot = contactItem.querySelector('.status-dot');
            if (statusDot) {
                statusDot.classList.toggle('online', isOnline);
                statusDot.classList.toggle('offline', !isOnline);
            }
        }
    } catch (e) {
        console.error("Błąd w updateUserStatusIndicator:", e);
    }
}

export function showTypingIndicator(usernameId) {
    try {
        if (currentChatUser && String(usernameId) === String(currentChatUser.id)) {
            const userName = getUserLabelById(usernameId);
            if (elements.typingStatusHeader) {
                elements.typingStatusHeader.classList.remove('hidden');
                elements.typingStatusHeader.textContent = `${userName} pisze...`;
            }
            if (elements.typingIndicatorMessages) {
                elements.typingIndicatorMessages.classList.remove('hidden');
            }
            clearTimeout(typingTimeout);
            typingTimeout = setTimeout(() => {
                if (elements.typingStatusHeader) elements.typingStatusHeader.classList.add('hidden');
                if (elements.typingIndicatorMessages) elements.typingIndicatorMessages.classList.add('hidden');
            }, 3000);
        }
    } catch (e) {
        console.error("Błąd w showTypingIndicator:", e);
    }
}

export async function updateUnreadMessageCountInSupabase(roomId, senderId) {
    if (!supabase || !currentUser) return;
    try {
        const { error } = await supabase.from('unread_messages').upsert({
            user_id: currentUser.id,
            room_id: roomId,
            count: (unreadConversationsInfo.get(roomId)?.unreadCount || 0) + 1,
            last_sender_id: senderId,
            updated_at: new Date().toISOString()
        }, { onConflict: 'user_id, room_id' });
        if (error) throw error;
        await loadUnreadMessagesFromSupabase();
    } catch (e) {
        console.error("Błąd w updateUnreadMessageCountInSupabase:", e);
    }
}

export async function clearUnreadMessageCountInSupabase(roomId) {
    if (!supabase || !currentUser) return;
    try {
        const { error } = await supabase.from('unread_messages').update({
            count: 0,
            last_sender_id: null,
            updated_at: new Date().toISOString()
        }).eq('user_id', currentUser.id).eq('room_id', roomId);
        if (error) throw error;
        await loadUnreadMessagesFromSupabase();
    } catch (e) {
        console.error("Błąd w clearUnreadMessageCountInSupabase:", e);
    }
}

export async function loadUnreadMessagesFromSupabase() {
    if (!supabase || !currentUser) return;
    try {
        const { data, error } = await supabase.from('unread_messages').select('room_id, count, last_sender_id').eq('user_id', currentUser.id);
        if (error) throw error;
        unreadConversationsInfo.clear();
        data.forEach(record => {
            if (record.count > 0) {
                unreadConversationsInfo.set(record.room_id, {
                    unreadCount: record.count,
                    lastSenderId: record.last_sender_id
                });
            }
            const convoItem = elements.contactsListEl.querySelector(`.contact[data-room-id="${record.room_id}"]`);
            if (convoItem) {
                const unreadCountEl = convoItem.querySelector('.unread-count');
                if (unreadCountEl) {
                    unreadCountEl.textContent = record.count > 0 ? record.count : '';
                    unreadCountEl.classList.toggle('hidden', record.count === 0);
                }
            }
        });
        updateDocumentTitle();
    } catch (e) {
        console.error("Błąd w loadUnreadMessagesFromSupabase:", e);
    }
}
