// --- DEKLARACJE ZMIENNYCH ---
// Dzięki 'export' inne pliki mogą z nich korzystać.
export let mainHeader, menuButton, dropdownMenu, themeToggle, logoutButton;
export let addFriendButton, notificationButton, notificationBadge, friendRequestModal, closeFriendRequestModal;
export let sendFriendRequestSection, friendEmailInput, sendFriendRequestButton, sendRequestStatus;
export let pendingRequestsSection, pendingFriendRequestsList, noPendingRequestsText;
export let container, sidebarWrapper, mainNavIcons, navIcons, addNewButton, onlineUsersMobile;
export let sidebarEl, sidebarSearchInput, contactsListEl;
export let chatAreaWrapper, logoScreen, chatArea;
export let chatHeader, backButton, chatUserName, userStatusSpan, chatHeaderActions, chatSettingsButton, chatSettingsDropdown;
export let typingStatusHeader, typingIndicatorMessages;
export let messageContainer;
export let chatFooter, attachButton, messageInput, emojiButton, sendButton;
export let rightSidebarWrapper, rightSidebar, activeUsersListEl, noActiveUsersText;
export let enableSoundButton;
export let createGroupModal, closeCreateGroupModal, groupNameInput, searchFriendsInput, friendsListContainer, createGroupButton;
export let groupFriendSearchInput;
export let imageLightbox, lightboxImage, lightboxCloseButton;

/**
 * Pobiera wszystkie elementy DOM i przypisuje je do wyeksportowanych zmiennych.
 * Ta funkcja powinna być wywołana raz, na początku działania aplikacji
 */
export function initializeDOMElements() {
    // Główne UI
    mainHeader = document.getElementById('mainHeader');
    menuButton = document.getElementById('menuButton');
    dropdownMenu = document.getElementById('dropdownMenu');
    themeToggle = document.getElementById('themeToggle');
    logoutButton = document.getElementById('logoutButton');
    enableSoundButton = document.getElementById('enableSoundButton');

    // UI Znajomych
    addFriendButton = document.getElementById('addFriendButton');
    notificationButton = document.getElementById('notificationButton');
    notificationBadge = document.getElementById('notificationCount');
    friendRequestModal = document.getElementById('friendRequestModal');
    closeFriendRequestModal = document.getElementById('closeFriendRequestModal');
    sendFriendRequestSection = document.getElementById('sendFriendRequestSection');
    friendEmailInput = document.getElementById('friendEmailInput');
    sendFriendRequestButton = document.getElementById('sendFriendRequestButton');
    sendRequestStatus = document.getElementById('sendRequestStatus');
    pendingRequestsSection = document.getElementById('pendingRequestsSection');
    pendingFriendRequestsList = document.getElementById('pendingFriendRequestsList');
    noPendingRequestsText = document.getElementById('noPendingRequestsText');

    // Główne kontenery i nawigacja
    container = document.querySelector('.container');
    sidebarWrapper = document.querySelector('.sidebar-wrapper');
    navIcons = document.querySelectorAll('.nav-icon');
    mainNavIcons = document.querySelector('.main-nav-icons');
    addNewButton = document.querySelector('.nav-icon.add-new-button');
    onlineUsersMobile = document.getElementById('onlineUsersMobile');

    // Lewy panel
    sidebarEl = document.getElementById('sidebar');
    sidebarSearchInput = document.getElementById('sidebarSearchInput');
    contactsListEl = document.getElementById('contactsList');

    // Obszar czatu
    chatAreaWrapper = document.querySelector('.chat-area-wrapper');
    logoScreen = document.getElementById('logoScreen');
    chatArea = document.getElementById('chatArea');

    // Nagłówek czatu
    chatHeader = document.querySelector('.chat-header');
    backButton = document.getElementById('backButton');
    chatUserName = document.getElementById('chatUserName');
    userStatusSpan = document.getElementById('userStatus');
    chatHeaderActions = document.querySelector('.chat-header-actions');
    chatSettingsButton = document.getElementById('chatSettingsButton');
    chatSettingsDropdown = document.getElementById('chatSettingsDropdown');
    typingStatusHeader = document.getElementById('typingStatus');
    typingIndicatorMessages = document.getElementById('typingIndicator');

    // Wiadomości
    messageContainer = document.getElementById('messageContainer');

    // Stopka czatu
    chatFooter = document.querySelector('.chat-footer');
    attachButton = document.querySelector('.attach-button');
    messageInput = document.getElementById('messageInput');
    emojiButton = document.querySelector('.emoji-button');
    sendButton = document.getElementById('sendButton');

    // Prawy panel
    rightSidebarWrapper = document.querySelector('.right-sidebar-wrapper');
    rightSidebar = document.getElementById('rightSidebar');
    activeUsersListEl = document.getElementById('activeUsersList');
    noActiveUsersText = document.getElementById('noActiveUsersText');
	
	// NOWE PRZYPISANIA DLA MODALU GRUPY
    createGroupModal = document.getElementById('createGroupModal');
    closeCreateGroupModal = document.getElementById('closeCreateGroupModal');
    createGroupButton = document.getElementById('createGroupButton');
    groupNameInput = document.getElementById('groupNameInput');
    groupFriendSearchInput = document.getElementById('groupFriendSearchInput');
    friendsListContainer = document.getElementById('friendsListContainer');
	
	imageLightbox = document.getElementById('imageLightbox');
	lightboxImage = document.getElementById('lightboxImage');
	lightboxCloseButton = document.querySelector('.lightbox-close-button');

    console.log('[Init] Inicjalizacja elementów DOM zakończona.');
}