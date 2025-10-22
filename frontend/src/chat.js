// Plik: chat.js 

// Importy zależności (na razie zostawiamy, później je przeniesiemy tam, gdzie będą potrzebne)
// Importy z folderów podrzędnych
import * as elements from './ui/elements.js';
import * as helpers from './ui/helpers.js';
import * as chatService from './services/chatService.js';
import * as friendsService from './services/friendsService.js';

// Importy z tego samego folderu
import * as websocket from './websocket.js';
import { supabase, profilesCache } from './supabaseClient.js';
import { loadAllProfiles, getUserLabelById, getAvatarUrl } from './profiles.js';

// --- Zmienne stanu aplikacji i czatu ---
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

// Mapa przechowująca status online użytkowników
// Klucz: userID, Wartość: { isOnline: boolean, lastSeen: string | null }
export let onlineUsers = new Map();

// --- Zmienne stanu powiadomień i dźwięków ---
export let audioContext = null;
export let audioContextInitiated = false;

// --- Zmienne dla tytułu strony ---
export let baseDocumentTitle = "Komunikator";
// Mapa przechowująca informacje o nieprzeczytanych wiadomościach
// Klucz: roomId, Wartość: { unreadCount: number, lastSenderId: string }
export let unreadConversationsInfo = new Map();

//
// Tutaj w przyszłości znajdą się główne funkcje inicjujące aplikację
// i łączące logikę z innych plików.
//

export function setNotificationPermission(isGranted) {
  notificationPermissionGranted = isGranted;
}

export function setAudioContextInitiated(isInitiated) {
  audioContextInitiated = isInitiated;
}

export function setSocket(newSocket) {
  socket = newSocket;
}

export function setReconnectAttempts(attempts) {
  reconnectAttempts = attempts;
}

export function setAllFriends(friends) {
  allFriends = friends;
}

export function setCurrentActiveConvoItem(item) {
  currentActiveConvoItem = item;
}

export function setCurrentChatUser(user) {
  currentChatUser = user;
}

export function setCurrentRoom(room) {
  currentRoom = room;
}

export function setAudioContext(context) {
  audioContext = context;
}

function setupEmojiPicker() {
    // SZPIEG 1: Sprawdzamy, czy funkcja w ogóle startuje i czy widzi kluczowe elementy.
    console.log('[Init] Uruchamianie setupEmojiPicker.');
    console.log('Znaleziony emojiButton:', elements.emojiButton);
    console.log('Znaleziony chatFooter:', elements.chatFooter);

    if (!elements.emojiButton || !elements.chatFooter) {
        console.error('BŁĄD KRYTYCZNY: Brakuje przycisku emoji lub stopki czatu. Panel emotikon nie będzie działać.');
        return; // Zatrzymaj, jeśli brakuje kluczowych elementów
    }

    const emojiList = ['😀', '😂', '😍', '🤔', '😎', '😢', '👍', '❤️', '🔥', '🎉', '👋', '😊'];
    let emojiPicker = null;

    function createPicker() {
        // SZPIEG 3: Sprawdzamy, czy panel jest tworzony.
        console.log('%c--- Tworzenie panelu emotikon (createPicker) ---', 'color: blue;');

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

        // SZPIEG 4: Sprawdzamy, czy panel jest dodawany do stopki.
        console.log('%c--- Dodawanie panelu do chatFooter ---', 'color: blue;');
        elements.chatFooter.appendChild(picker);
        return picker;
    }

    elements.emojiButton.addEventListener('click', (event) => {
        // SZPIEG 2: Sprawdzamy, czy kliknięcie jest rejestrowane.
        console.log('%c--- Kliknięto emojiButton! ---', 'color: green; font-weight: bold;');
        event.stopPropagation();

        if (!emojiPicker) {
            emojiPicker = createPicker();
        }

        // SZPIEG 5: Sprawdzamy, czy przełączamy klasę 'hidden' na panelu.
        console.log('%c--- Przełączanie klasy "hidden" na panelu ---', 'color: green;');
        emojiPicker.classList.toggle('hidden');
    });
}


// --- Funkcje Inicjalizacyjne i Główna Logika Aplikacji ---

/**
 * Sets up event listeners for sending messages
 */
export function setupSendMessage() {
    console.log("[setupSendMessage] Setting up message send event listeners.");
    if (!messageInput || !sendButton || !messageContainer) {
        console.error("[setupSendMessage] Message input, send button or messageContainer not found. Cannot attach listeners.");
        return;
    }

    try {
        // Wysyłanie statusu "pisze..."
        messageInput.addEventListener('input', () => {
            if (currentRoom && socket && socket.readyState === WebSocket.OPEN) {
                socket.send(JSON.stringify({
                    type: 'typing',
                    username: currentUser.id,
                    room: currentRoom,
                }));
            }
        });

        // Logika wysyłania wiadomości
        const sendMessage = () => {
            const text = messageInput.value.trim();
            if (!text || !currentChatUser || !socket || socket.readyState !== WebSocket.OPEN || !currentRoom) {
                console.warn("Cannot send message: conditions not met.");
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
			
			// Natychmiast wyświetl wysłaną wiadomość, nie czekając na serwer
			chatService.addMessageToChat(msgData);

            // Przenieś konwersację na górę listy
            const convoItemToMove = elements.contactsListEl.querySelector(`.contact[data-room-id="${currentRoom}"]`);
            if (convoItemToMove && elements.contactsListEl.firstChild !== convoItemToMove) {
                elements.contactsListEl.prepend(convoItemToMove);
            }

            messageInput.value = '';
            messageInput.focus();
        };

        // Podpięcie logiki pod przycisk i klawisz Enter
        sendButton.onclick = sendMessage;
        messageInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                sendMessage();
            }
        });

        console.log("[setupSendMessage] Message send event listeners attached.");
    } catch (e) {
        console.error("Caught error in setupSendMessage:", e);
    }
}

function setupCreateGroupModal() {
    if (!elements.addNewButton || !elements.createGroupModal) {
        console.error("Brakuje przycisku 'addNewButton' lub modalu grupy.");
        return;
    }

    elements.addNewButton.addEventListener('click', (event) => {
        event.stopPropagation();
        if (elements.friendsListContainer) {
            elements.friendsListContainer.innerHTML = '';
            allFriends.forEach(friend => {
                const friendId = `friend-checkbox-${friend.id}`;
                const li = document.createElement('li');
				const avatarSrc = getAvatarUrl(friend.id);
                li.innerHTML = `
                    <img src="${avatarSrc}" class="avatar">
                    <span>${getUserLabelById(friend.id) || friend.email}</span>
                    <input type="checkbox" id="${friendId}" value="${friend.id}">
                `;
				li.addEventListener('click', (event) => {
					// Zapobiegamy podwójnemu kliknięciu, jeśli klikniemy bezpośrednio na checkbox
					if (event.target.tagName !== 'INPUT') {
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

    elements.createGroupButton.addEventListener('click', () => {
        const groupName = elements.groupNameInput.value.trim();
        const selectedFriends = Array.from(elements.friendsListContainer.querySelectorAll('input:checked')).map(input => input.value);
        if (!groupName) { alert('Proszę podać nazwę grupy.'); return; }
        if (selectedFriends.length === 0) { alert('Proszę wybrać przynajmniej jednego znajomego.'); return; }
        console.log('Tworzenie grupy:', { name: groupName, members: selectedFriends });
        elements.createGroupModal.classList.add('hidden');
    });

	elements.createGroupButton.addEventListener('click', async () => {
        const groupName = elements.groupNameInput.value.trim();
        const selectedFriendsIds = Array.from(elements.friendsListContainer.querySelectorAll('input:checked')).map(input => input.value);

        if (!groupName) {
            helpers.showCustomMessage('Proszę podać nazwę grupy.', 'error');
            return;
        }
        if (selectedFriendsIds.length === 0) {
            helpers.showCustomMessage('Proszę wybrać przynajmniej jednego znajomego.', 'error');
            return;
        }

        try {
            // Krok 1: Stwórz nową grupę w tabeli 'groups'
            const { data: groupData, error: groupError } = await supabase
                .from('groups')
                .insert({ name: groupName, created_by: currentUser.id })
                .select()
                .single();

            if (groupError) throw groupError;

            const newGroupId = groupData.id;

            // Krok 2: Przygotuj listę członków (wybrani znajomi + twórca grupy)
            const membersToInsert = [
                ...selectedFriendsIds.map(friendId => ({ group_id: newGroupId, user_id: friendId })),
                { group_id: newGroupId, user_id: currentUser.id } // Dodaj siebie do grupy
            ];

            // Krok 3: Dodaj wszystkich członków do tabeli 'group_members'
            const { error: membersError } = await supabase
                .from('group_members')
                .insert(membersToInsert);

            if (membersError) throw membersError;

            // Krok 4: Poinformuj użytkownika i odśwież interfejs
            helpers.showCustomMessage(`Grupa "${groupName}" została utworzona!`, 'success');
            elements.createGroupModal.classList.remove('visible');
            elements.groupNameInput.value = ''; // Wyczyść pole nazwy
            
            // Odśwież listę konwersacji, aby pokazać nową grupę
            await friendsService.loadContacts(); 

        } catch (error) {
            console.error('Błąd podczas tworzenia grupy:', error);
            helpers.showCustomMessage(`Błąd: ${error.message}`, 'error');
        }
    });
}

/**
 * Sets up the functionality for the chat settings dropdown menu and global click handlers.
 */
export function setupChatSettingsDropdown() {
    console.log("[setup] Konfiguracja menu ustawień czatu.");
    if (!chatSettingsButton || !chatSettingsDropdown) return;

    try {
        // Otwieranie/zamykanie menu ustawień
        chatSettingsButton.addEventListener('click', (event) => {
            event.stopPropagation();
            chatSettingsDropdown.classList.toggle('hidden');
        });

        // Globalny listener do zamykania okienek po kliknięciu na zewnątrz
        document.addEventListener('click', (event) => {
            // Zamknij menu ustawień czatu
            if (!chatSettingsDropdown.classList.contains('hidden') && !chatSettingsButton.contains(event.target)) {
                chatSettingsDropdown.classList.add('hidden');
            }
            // Zamknij główne menu
            if (!dropdownMenu.classList.contains('hidden') && !menuButton.contains(event.target)) {
                dropdownMenu.classList.add('hidden');
            }
            // Zamknij modal zaproszeń do znajomych
            if (friendRequestModal && friendRequestModal.classList.contains('visible') && !friendRequestModal.contains(event.target)) {
                friendRequestModal.classList.remove('visible');
            }
			
			if (elements.createGroupModal && !elements.createGroupModal.classList.contains('hidden') && !elements.createGroupModal.contains(event.target)) {
            elements.createGroupModal.classList.remove('visible');
			}
        });

        // Obsługa zmiany motywu kolorystycznego wiadomości
        const colorOptions = chatSettingsDropdown.querySelectorAll('.color-box');
        colorOptions.forEach(option => {
            option.addEventListener('click', () => {
                const colorTheme = option.dataset.color;
                if (messageContainer) {
                    messageContainer.className = messageContainer.className.replace(/(\S+)-color/g, '').trim();
                    if (colorTheme !== 'default') {
                        messageContainer.classList.add(`${colorTheme}-color`);
                    }
                }
            });
        });

        // Obsługa zmiany tła czatu
        const backgroundOptions = chatSettingsDropdown.querySelectorAll('.bg-box');
        backgroundOptions.forEach(option => {
            option.addEventListener('click', () => {
                const bgTheme = option.dataset.bg;
                if (messageContainer) {
                    messageContainer.classList.remove('dark-bg', 'pattern-bg');
                    if (bgTheme !== 'default') {
                        messageContainer.classList.add(bgTheme);
                    }
                }
            });
        });
        
        // ... (reszta logiki dla zmiany nicku i wyszukiwania - jest specyficzna i zostaje) ...

    } catch (e) {
        console.error("Błąd w setupChatSettingsDropdown:", e);
    }
}

export function openLightbox(imageUrl) {
    if (elements.imageLightbox && elements.lightboxImage) {
        elements.lightboxImage.src = imageUrl;
        elements.imageLightbox.classList.remove('hidden');
    } else {
         console.error("Nie znaleziono elementów lightboxa w openLightbox (chat.js)");
    }
}

export function closeLightbox() {
    if (elements.imageLightbox) {
        elements.imageLightbox.classList.add('hidden');
         // if (elements.lightboxImage) elements.lightboxImage.src = ""; // Opcjonalnie
    } else {
         console.error("Nie znaleziono elementu imageLightbox w closeLightbox (chat.js)");
    }
}

/**
 * Podpina główne event listenery interfejsu.
 */
function setupEventListeners() {
	console.log('%c--- Uruchomiono setupEventListeners ---', 'color: orange; font-weight: bold;');
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

    // --- UZUPEŁNIONA LOGIKA PRZYCISKU "WSTECZ" ---
	elements.backButton.addEventListener('click', () => {
        // Zawsze resetujemy widok czatu (czyści zawartość)
        chatService.resetChatView();

        // Logika specyficzna dla widoku mobilnego
        if (window.matchMedia('(max-width: 768px)').matches) {
            if (elements.sidebarWrapper) {
                elements.sidebarWrapper.classList.remove('hidden-on-mobile');
            }
            if (elements.chatAreaWrapper) {
                elements.chatAreaWrapper.classList.remove('active-on-mobile');
            }
            // Ukryj przycisk wstecz po powrocie do listy na mobile
             if (elements.backButton) {
                 elements.backButton.style.display = 'none';
             }
        } else {
            // --- NOWA LOGIKA DLA DESKTOPU ---
            // Ukryj obszar czatu i pokaż ekran powitalny
            if (elements.chatArea) {
                elements.chatArea.classList.remove('active'); // Ukryj czat
            }
            if (elements.logoScreen) {
                elements.logoScreen.classList.remove('hidden'); // Pokaż logo
            }
            // --- KONIEC NOWEJ LOGIKI ---
        }
    });
    // --- KONIEC UZUPEŁNIONEJ LOGIKI ---
	
	console.log('%c--- Podpinanie listenera do addFriendButton... ---', 'color: blue;', elements.addFriendButton);
    
    // Listenery dla modalu znajomych
    elements.addFriendButton.addEventListener('click', (event) => {
        event.stopPropagation(); // ZATRZYMAJ KLIKNIĘCIE
        friendsService.openFriendRequestModal(true, false);
    });
    elements.notificationButton.addEventListener('click', (event) => {
        event.stopPropagation(); // ZATRZYMAJ KLIKNIĘCIE
        friendsService.openFriendRequestModal(false, true);
    });
    elements.closeFriendRequestModal.addEventListener('click', () => {
        elements.friendRequestModal.classList.remove('visible');
    });
    elements.sendFriendRequestButton.addEventListener('click', friendsService.sendFriendRequest);
    
    // Globalny listener do zamykania okienek
    document.addEventListener('click', (event) => {
        if (!elements.chatSettingsDropdown.classList.contains('hidden') && !elements.chatSettingsButton.contains(event.target)) {
            elements.chatSettingsDropdown.classList.add('hidden');
        }
        if (!elements.dropdownMenu.classList.contains('hidden') && !elements.menuButton.contains(event.target)) {
            elements.dropdownMenu.classList.add('hidden');
        }
        if (elements.friendRequestModal.classList.contains('visible') && !elements.friendRequestModal.contains(event.target)) {
            elements.friendRequestModal.classList.remove('visible');
        }
    });
	
	if (elements.lightboxCloseButton) {
    elements.lightboxCloseButton.addEventListener('click', closeLightbox);
	}
	if (elements.imageLightbox) {
		// Zamknij lightbox po kliknięciu na tło (overlay)
		elements.imageLightbox.addEventListener('click', (event) => {
			// Zamknij tylko jeśli kliknięto bezpośrednio na tło, a nie na obrazek
			if (event.target === elements.imageLightbox) {
				closeLightbox();
			}
		});
	}

    console.log('[Init] Główne event listenery UI zostały podpięte.');
}

/**
 * Główna funkcja, która uruchamia całą aplikację.
 */
async function initializeApp() {
    console.log("Start inicjalizacji Komunikatora...");
    
    // 1. Inicjalizuj elementy DOM
    elements.initializeDOMElements();
	window.elements = elements; 
	window.friendsService = friendsService;

    // 2. Sprawdź sesję użytkownika
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
        window.location.href = 'login.html';
        return;
    }
    currentUser = session.user;
    console.log(`[Init] Zalogowany użytkownik: ${currentUser.email}`);

    // 3. Podepnij podstawowe event listenery
    setupEventListeners();
    setupSendMessage(); // Używamy teraz nazwy modułu
    setupChatSettingsDropdown(); // Używamy teraz nazwy modułu
	setupEmojiPicker();
	setupCreateGroupModal();

    // 4. Załaduj profile i poproś o uprawnienia
    await loadAllProfiles();
    await helpers.requestNotificationPermission();
    helpers.checkAudioAutoplay();
    helpers.updateDocumentTitle();

    // 5. Nawiąż połączenie WebSocket i poczekaj na nie
    try {
        await websocket.initWebSocket();
        console.log("[Init] Połączenie WebSocket nawiązane.");
    } catch (wsError) {
        console.error("[Init] Krytyczny błąd WebSocket:", wsError);
        helpers.showCustomMessage("Błąd połączenia z serwerem czatu.", "error");
        return;
    }

    // 6. Po udanym połączeniu, załaduj dane aplikacji
    await friendsService.loadFriendsAndRequests(); 
    console.log("[Init] Dane znajomych i czatu załadowane.");

    // --- NOWY KOD: Nasłuchiwanie na zmiany statusów w czasie rzeczywistym ---
    const profilesChannel = supabase
        .channel('profiles-changes')
        .on(
            'postgres_changes',
            {
                event: 'UPDATE', // Słuchaj tylko aktualizacji
                schema: 'public',
                table: 'profiles',
            },
            (payload) => {
                console.log('Otrzymano aktualizację profilu:', payload.new);
                // Wywołaj funkcję, która już istnieje i potrafi zaktualizować UI
                chatService.updateUserStatusIndicator(
                    payload.new.id,
                    payload.new.is_online,
                    payload.new.last_seen_at
                );
            }
        )
        .subscribe();
		
	const changeAvatarButton = document.getElementById('changeAvatarButton');
    const avatarUploadInput = document.getElementById('avatarUploadInput');

    if (changeAvatarButton && avatarUploadInput) {
        changeAvatarButton.addEventListener('click', () => {
            avatarUploadInput.click(); // Aktywuj ukryty input pliku
        });

        avatarUploadInput.addEventListener('change', async (event) => {
            const file = event.target.files[0];
            if (!file || !currentUser) return;

            // Sprawdź rozmiar pliku (np. max 2MB)
            const maxSize = 2 * 1024 * 1024; // 2MB
            if (file.size > maxSize) {
                helpers.showCustomMessage('Plik jest za duży. Maksymalny rozmiar to 2MB.', 'error');
                avatarUploadInput.value = ''; // Wyczyść input
                return;
            }

            // Sprawdź typ pliku
            if (!['image/png', 'image/jpeg'].includes(file.type)) {
                 helpers.showCustomMessage('Nieprawidłowy format pliku. Dozwolone są tylko PNG i JPG.', 'error');
                 avatarUploadInput.value = ''; // Wyczyść input
                 return;
            }

            const fileExt = file.name.split('.').pop();
            const filePath = `avatars/${currentUser.id}.${fileExt}`; // np. avatars/user_id_123.png

            helpers.showCustomMessage('Przesyłanie awatara...', 'info');

            try {
                // Wyślij (lub zaktualizuj) plik do Supabase Storage
                // Używamy upsert: true, aby nadpisać istniejący awatar
                const { data, error } = await supabase.storage
                    .from('avatars') // Nazwa Twojego bucketu na awatary
                    .upload(filePath, file, {
                        cacheControl: '3600', // Cache przez 1 godzinę
                        upsert: true, // Nadpisz, jeśli istnieje
                        contentType: file.type
                    });

				if (error) {
                    throw error; // Rzuć błąd, jeśli wgranie się nie powiodło
                }

                // --- POCZĄTEK NOWEGO KODU ---
                // Pobierz publiczny URL właśnie wgranego pliku
				const { data: publicUrlData } = supabase.storage
                    .from('avatars')
                    .getPublicUrl(filePath);

                if (!publicUrlData || !publicUrlData.publicUrl) {
                     throw new Error('Nie udało się uzyskać publicznego URL dla awatara.');
                }
                const publicUrl = publicUrlData.publicUrl;

                // 1. Zapisz URL w metadanych Auth (dobra praktyka)
                const { error: authUpdateError } = await supabase.auth.updateUser({
                    data: { avatar_url: publicUrl }
                });
                if (authUpdateError) console.warn("Nie udało się zapisać avatar_url w Auth metadata:", authUpdateError); // Tylko ostrzeżenie

                // 2. ZAPISZ URL W TABELI PROFILES (KLUCZOWE)
                const { error: profileUpdateError } = await supabase
                    .from('profiles')
                    .update({ avatar_url: publicUrl })
                    .eq('id', currentUser.id); // Zaktualizuj tylko swój profil

                if (profileUpdateError) {
                    // Jeśli zapis do profili się nie powiedzie, to jest poważniejszy błąd
                    throw profileUpdateError;
                }

                // Zaktualizuj również lokalny cache profili
				const cachedProfile = profilesCache.get(currentUser.id);
                if (cachedProfile) {
                    cachedProfile.avatar_url = publicUrl;
                    profilesCache.set(currentUser.id, cachedProfile);
                    console.log(`Zaktualizowano avatar_url w cache dla ${currentUser.id}`);
                } else {
                     await loadAllProfiles();
                 }

                helpers.showCustomMessage('Awatar został zaktualizowany!', 'success');
                avatarUploadInput.value = ''; // Wyczyść input po sukcesie

			const newAvatarUrl = getAvatarUrl(currentUser.id); // Pobierz nowy URL z timestampem

                // Funkcja pomocnicza do aktualizacji konkretnego awatara
                const updateAvatarImage = (imgElement, userId) => {
                    if (imgElement && String(userId) === String(currentUser.id)) {
                       // Sprawdź czy URL się faktycznie zmienił (dzięki timestampowi powinien)
                       if (imgElement.src !== newAvatarUrl) {
                           imgElement.src = newAvatarUrl;
                           console.log('Zaktualizowano awatar dla:', imgElement);
                       }
                    }
                };

                // Zaktualizuj awatary na liście konwersacji
                document.querySelectorAll('#contactsList .contact .avatar').forEach(img => {
                    const convoId = img.closest('.contact')?.dataset.convoId;
                    if (convoId) updateAvatarImage(img, convoId);
                });

                // Zaktualizuj awatary w aktywnym czacie (wiadomości)
                document.querySelectorAll('#messageContainer .message-wrapper .message-avatar').forEach(img => {
                    // Tutaj potrzebujemy ID użytkownika z wiadomości - musisz je zapisać w atrybucie data-* podczas renderowania
                    // Załóżmy, że dodasz data-user-id do .message-wrapper
                    const wrapper = img.closest('.message-wrapper');
                    const senderId = wrapper?.dataset.userId; // MUSISZ DODAĆ TEN ATRYBUT W addMessageToChat i handleConversationClick
                     if (senderId) updateAvatarImage(img, senderId);
                });

                 // Zaktualizuj awatary na liście aktywnych użytkowników (desktop)
                document.querySelectorAll('#activeUsersList .active-user-item .avatar').forEach(img => {
                    const userId = img.closest('.active-user-item')?.dataset.userId;
                    if (userId) updateAvatarImage(img, userId);
                });

                // Zaktualizuj awatary na liście aktywnych użytkowników (mobile)
                document.querySelectorAll('#onlineUsersMobile .online-user-item-mobile .avatar').forEach(img => {
                    const userId = img.closest('.online-user-item-mobile')?.dataset.userId;
                    if (userId) updateAvatarImage(img, userId);
                });

            } catch (error) {
                console.error('Błąd podczas przesyłania awatara:', error);
                helpers.showCustomMessage(`Błąd przesyłania: ${error.message}`, 'error');
                avatarUploadInput.value = ''; // Wyczyść input w razie błędu
            }
        });
    } else {
        console.warn('Nie znaleziono przycisków do zmiany awatara.');
    }
	
	const attachButton = document.querySelector('.attach-button'); // Znajdź przycisk spinacza
    const fileUploadInput = document.getElementById('fileUploadInput');

    if (attachButton && fileUploadInput) {
        attachButton.addEventListener('click', () => {
            if (!currentRoom) {
                helpers.showCustomMessage('Wybierz rozmowę, aby wysłać plik.', 'info');
                return;
            }
            fileUploadInput.click(); // Otwórz okno wyboru pliku
        });

        fileUploadInput.addEventListener('change', async (event) => {
            const file = event.target.files[0];
            if (!file || !currentUser || !currentRoom) {
                fileUploadInput.value = ''; // Wyczyść na wszelki wypadek
                return;
            }

            const maxSize = 10 * 1024 * 1024; // Maksymalny rozmiar pliku: 10MB (możesz zmienić)
            if (file.size > maxSize) {
                helpers.showCustomMessage(`Plik jest za duży. Maksymalny rozmiar to ${maxSize / 1024 / 1024}MB.`, 'error');
                fileUploadInput.value = '';
                return;
            }

            const isImage = file.type.startsWith('image/');
            const bucketName = isImage ? 'chat_images' : 'chat_attachments';
            const fileExt = file.name.split('.').pop();
            // Tworzymy unikalną ścieżkę pliku
            const filePath = `${currentRoom}/${currentUser.id}_${Date.now()}.${fileExt}`;

            helpers.showCustomMessage('Przesyłanie pliku...', 'info');
            attachButton.disabled = true; // Zablokuj przycisk na czas wysyłania

            try {
                // Wyślij plik do Supabase Storage
                const { data: uploadData, error: uploadError } = await supabase.storage
                    .from(bucketName)
                    .upload(filePath, file, {
                        cacheControl: '3600', // Cache przez 1 godzinę
                        upsert: false, // Nie nadpisuj, jeśli jakimś cudem istnieje
                        contentType: file.type
                    });

                if (uploadError) throw uploadError;

                // Pobierz publiczny URL wgranego pliku
                const { data: publicUrlData } = supabase.storage
                    .from(bucketName)
                    .getPublicUrl(filePath);

                if (!publicUrlData || !publicUrlData.publicUrl) {
                    throw new Error('Nie udało się uzyskać publicznego URL dla pliku.');
                }
                const publicUrl = publicUrlData.publicUrl;

                // Przygotuj wiadomość WebSocket
                const messagePayload = {
                    type: 'file', // Nowy typ wiadomości
                    url: publicUrl,
                    fileName: file.name,
                    fileType: file.type,
                    isImage: isImage,
                    // Dodajmy też 'text' jako pusty string dla spójności z backendem
                    text: ''
                };

                // Wyślij wiadomość przez WebSocket
                 const msgData = {
                    type: 'message', // Nadal używamy typu 'message' dla WebSocket
                    username: currentUser.id,
                    text: JSON.stringify(messagePayload), // Zakoduj dane pliku w polu tekstowym
                    room: currentRoom,
                    inserted_at: new Date().toISOString()
                 };
                 socket.send(JSON.stringify(msgData));

                // Natychmiast wyświetl wiadomość z plikiem (używając zakodowanych danych)
                chatService.addMessageToChat(msgData);

                helpers.showCustomMessage('Plik wysłany!', 'success');

            } catch (error) {
                console.error('Błąd podczas przesyłania pliku:', error);
                helpers.showCustomMessage(`Błąd przesyłania: ${error.message}`, 'error');
            } finally {
                fileUploadInput.value = ''; // Zawsze czyść input
                attachButton.disabled = false; // Odblokuj przycisk
            }
        });
    } else {
        console.warn('Nie znaleziono przycisku do załączników lub inputu pliku.');
    }

    console.log("✅ Aplikacja Komunikator została pomyślnie zainicjalizowana!");
}

// --- Krok 4: Uruchomienie Aplikacji ---
document.addEventListener('DOMContentLoaded', initializeApp);