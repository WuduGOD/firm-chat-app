// Plik: chat.js

// Importy
import * as elements from './ui/elements.js';
import * as helpers from './ui/helpers.js';
import * as chatService from './services/chatService.js';
import * as friendsService from './services/friendsService.js';
import * as websocket from './websocket.js';
import { supabase } from './supabaseClient.js';
import { loadAllProfiles, getUserLabelById } from './profiles.js';

// --- Zmienne stanu aplikacji ---
export let allFriends = [];
export let allConversations = [];
export let currentUser = null;
export let currentChatUser = null;
export let currentRoom = null;
export let socket = null;
export let reconnectAttempts = 0;
export let typingTimeout;
export let currentActiveConvoItem = null;
export let notificationPermissionGranted = false;
export let onlineUsers = new Map();
export let audioContext = null;
export let audioContextInitiated = false;
export let baseDocumentTitle = "Komunikator";
export let unreadConversationsInfo = new Map();

// --- Settery dla zmiennych stanu ---
export function setNotificationPermission(isGranted) { notificationPermissionGranted = isGranted; }
export function setAudioContextInitiated(isInitiated) { audioContextInitiated = isInitiated; }
export function setSocket(newSocket) { socket = newSocket; }
export function setReconnectAttempts(attempts) { reconnectAttempts = attempts; }
export function setAllFriends(friends) { allFriends = friends; }
export function setCurrentActiveConvoItem(item) { currentActiveConvoItem = item; }
export function setCurrentChatUser(user) { currentChatUser = user; }
export function setCurrentRoom(room) { currentRoom = room; }
export function setAudioContext(context) { audioContext = context; }


function setupEmojiPicker() {
    if (!elements.emojiButton || !elements.chatFooter) {
        console.error('Brakuje przycisku emoji lub stopki czatu.');
        return;
    }
    const emojiList = ['😀', '😂', '😍', '🤔', '😎', '😢', '👍', '❤️', '🔥', '🎉', '👋', '😊'];
    let emojiPicker = null;

    function createPicker() {
        const picker = document.createElement('div');
        picker.className = 'emoji-picker hidden';
        emojiList.forEach(emoji => {
            const button = document.createElement('button');
            button.textContent = emoji;
            button.addEventListener('click', () => {
                if (elements.messageInput) {
                    elements.messageInput.value += emoji;
                    elements.messageInput.focus();
                }
            });
            picker.appendChild(button);
        });
        elements.chatFooter.appendChild(picker);
        return picker;
    }

    elements.emojiButton.addEventListener('click', (event) => {
        event.stopPropagation();
        if (!emojiPicker) {
            emojiPicker = createPicker();
        }
        emojiPicker.classList.toggle('hidden');
    });
}

/**
 * Konfiguruje wysyłanie wiadomości.
 */
function setupSendMessage() {
    if (!elements.messageInput || !elements.sendButton) {
        return;
    }

    elements.messageInput.addEventListener('input', () => {
        if (currentRoom && socket && socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ type: 'typing', username: currentUser.id, room: currentRoom }));
        }
    });

    const sendMessage = () => {
        const text = elements.messageInput.value.trim();
        if (!text || !currentChatUser || !socket || socket.readyState !== WebSocket.OPEN || !currentRoom) {
            return;
        }

        const msgData = {
            type: 'message',
            username: currentUser.id,
            text,
            room: currentRoom,
            inserted_at: new Date().toISOString()
        };

        socket.send(JSON.stringify(msgData));
        chatService.addMessageToChat(msgData);

        const convoItemToMove = elements.contactsListEl.querySelector(`.contact[data-room-id="${currentRoom}"]`);
        if (convoItemToMove && elements.contactsListEl.firstChild !== convoItemToMove) {
            elements.contactsListEl.prepend(convoItemToMove);
        }

        elements.messageInput.value = '';
        elements.messageInput.focus();
    };

    elements.sendButton.onclick = sendMessage;
    elements.messageInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            sendMessage();
        }
    });
}

async function createGroup(groupName, memberIds) {
    if (!groupName || memberIds.length === 0) {
        helpers.showCustomMessage("Nazwa grupy i członkowie są wymagani.", "error");
        return;
    }
    try {
        const { data: groupData, error: groupError } = await supabase.from('groups').insert({ name: groupName, created_by: currentUser.id }).select().single();
        if (groupError) throw groupError;
        const groupId = groupData.id;
        const allMemberIds = [...new Set([...memberIds, currentUser.id])];
        const membersToInsert = allMemberIds.map(userId => ({ group_id: groupId, user_id: userId }));
        const { error: membersError } = await supabase.from('group_members').insert(membersToInsert);
        if (membersError) throw membersError;
        helpers.showCustomMessage(`Grupa "${groupName}" została utworzona!`, 'success');
        await friendsService.loadContacts();
    } catch (error) {
        console.error("Błąd podczas tworzenia grupy:", error);
        helpers.showCustomMessage(`Błąd: ${error.message}`, "error");
    }
}

function setupCreateGroupModal() {
    if (!elements.addNewButton || !elements.createGroupModal) return;
    elements.addNewButton.addEventListener('click', (event) => {
        event.stopPropagation();
        if (elements.friendsListContainer) {
            elements.friendsListContainer.innerHTML = '';
            allFriends.forEach(friend => {
                const friendId = `friend-checkbox-${friend.id}`;
                const li = document.createElement('li');
                li.innerHTML = `
                    <img src="https://i.pravatar.cc/150?img=${friend.id.charCodeAt(0) % 70 + 1}" class="avatar">
                    <span>${getUserLabelById(friend.id) || friend.email}</span>
                    <input type="checkbox" id="${friendId}" value="${friend.id}">
                `;
                li.addEventListener('click', (e) => {
                    if (e.target.tagName !== 'INPUT') {
                        const checkbox = li.querySelector('input[type="checkbox"]');
                        checkbox.checked = !checkbox.checked;
                    }
                });
                elements.friendsListContainer.appendChild(li);
            });
        }
        elements.createGroupModal.classList.add('visible');
    });
    elements.closeCreateGroupModal.addEventListener('click', () => {
        elements.createGroupModal.classList.remove('visible');
    });
    elements.createGroupButton.addEventListener('click', async () => {
        const groupName = elements.groupNameInput.value.trim();
        const selectedFriends = Array.from(elements.friendsListContainer.querySelectorAll('input:checked')).map(input => input.value);
        if (!groupName) { alert('Proszę podać nazwę grupy.'); return; }
        if (selectedFriends.length === 0) { alert('Proszę wybrać przynajmniej jednego znajomego.'); return; }
        await createGroup(groupName, selectedFriends);
        elements.groupNameInput.value = '';
        elements.friendsListContainer.querySelectorAll('input:checked').forEach(input => input.checked = false);
        elements.createGroupModal.classList.remove('visible');
    });
}

function setupChatSettingsDropdown() {
    if (!elements.chatSettingsButton || !elements.chatSettingsDropdown) return;
    try {
        elements.chatSettingsButton.addEventListener('click', (event) => {
            event.stopPropagation();
            elements.chatSettingsDropdown.classList.toggle('hidden');
        });
        const colorOptions = elements.chatSettingsDropdown.querySelectorAll('.color-box');
        colorOptions.forEach(option => {
            option.addEventListener('click', () => {
                const colorTheme = option.dataset.color;
                if (elements.messageContainer) {
                    elements.messageContainer.className = elements.messageContainer.className.replace(/(\S+)-theme/g, '').trim();
                    if (colorTheme !== 'default') {
                        elements.messageContainer.classList.add(`${colorTheme}-theme`);
                    }
                }
            });
        });
        const backgroundOptions = elements.chatSettingsDropdown.querySelectorAll('.bg-box');
        backgroundOptions.forEach(option => {
            option.addEventListener('click', () => {
                if (elements.messageContainer) {
                    elements.messageContainer.classList.remove('dark-bg', 'pattern-bg');
                    if (option.dataset.bg !== 'default') {
                        elements.messageContainer.classList.add(option.dataset.bg);
                    }
                }
            });
        });
    } catch (e) {
        console.error("Błąd w setupChatSettingsDropdown:", e);
    }
}

function setupEventListeners() {
    elements.menuButton.addEventListener('click', (event) => {
        event.stopPropagation();
        elements.dropdownMenu.classList.toggle('hidden');
    });
    elements.logoutButton.addEventListener('click', async () => {
        await supabase.auth.signOut();
        window.location.href = 'login.html';
    });
    elements.themeToggle.addEventListener('click', () => {
        document.body.classList.toggle('dark-mode');
    });
    elements.backButton.addEventListener('click', () => {
        chatService.resetChatView();
        if (window.matchMedia('(max-width: 768px)').matches) {
            if (elements.sidebarWrapper) elements.sidebarWrapper.classList.remove('hidden-on-mobile');
            if (elements.chatAreaWrapper) elements.chatAreaWrapper.classList.remove('active-on-mobile');
        }
    });
    elements.addFriendButton.addEventListener('click', (event) => {
        event.stopPropagation();
        friendsService.openFriendRequestModal(true, false);
    });
    elements.notificationButton.addEventListener('click', (event) => {
        event.stopPropagation();
        friendsService.openFriendRequestModal(false, true);
    });
    elements.closeFriendRequestModal.addEventListener('click', () => {
        elements.friendRequestModal.classList.remove('visible');
    });
    elements.sendFriendRequestButton.addEventListener('click', friendsService.sendFriendRequest);
    document.addEventListener('click', (event) => {
        if (!elements.chatSettingsDropdown.classList.contains('hidden') && !elements.chatSettingsButton.contains(event.target)) {
            elements.chatSettingsDropdown.classList.add('hidden');
        }
        if (!elements.dropdownMenu.classList.contains('hidden') && !elements.menuButton.contains(event.target)) {
            elements.dropdownMenu.classList.add('hidden');
        }
        if (elements.friendRequestModal && elements.friendRequestModal.classList.contains('visible') && !elements.friendRequestModal.contains(event.target)) {
            elements.friendRequestModal.classList.remove('visible');
        }
         if (elements.createGroupModal && !elements.createGroupModal.classList.contains('hidden') && !elements.createGroupModal.contains(event.target)) {
            elements.createGroupModal.classList.remove('visible');
        }
    });
}

async function initializeApp() {
    console.log("Start inicjalizacji Komunikatora...");
    elements.initializeDOMElements();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
        window.location.href = 'login.html';
        return;
    }
    currentUser = session.user;
    setupEventListeners();
    setupSendMessage();
    setupChatSettingsDropdown();
    setupEmojiPicker();
    setupCreateGroupModal();
    await loadAllProfiles();
    await helpers.requestNotificationPermission();
    helpers.checkAudioAutoplay();
    helpers.updateDocumentTitle();
    try {
        await websocket.initWebSocket();
    } catch (wsError) {
        console.error("[Init] Krytyczny błąd WebSocket:", wsError);
        helpers.showCustomMessage("Błąd połączenia z serwerem czatu.", "error");
        return;
    }
    await friendsService.loadFriendsAndRequests();
    await friendsService.loadActiveUsers();
    supabase.channel('profiles-changes').on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles' }, (payload) => {
        chatService.updateUserStatusIndicator(payload.new.id, payload.new.is_online, payload.new.last_seen_at);
    }).subscribe();
    console.log("Aplikacja Komunikator została pomyślnie zainicjalizowana!");
}

document.addEventListener('DOMContentLoaded', initializeApp);
