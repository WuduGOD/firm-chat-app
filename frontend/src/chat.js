// Importy zależności
import { loadAllProfiles, getUserLabelById } from './profiles.js';
import { supabase } from './supabaseClient.js'; // Używamy istniejącego obiektu supabase

// Globalne zmienne UI i czatu
let mainHeader;
let menuButton;
let dropdownMenu;
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
let chatUserName; // ID: chatUserName
let userStatusSpan; // ID: userStatus, Klasa: status
let chatHeaderActions;
let chatSettingsButton;
let chatSettingsDropdown; // ID: chatSettingsDropdown, Klasa: dropdown chat-settings-dropdown
let typingStatusHeader; // ID: typingStatus, Klasa: typing-status (status w nagłówku czatu)
let typingIndicatorMessages; // ID: typingIndicator (animowane kropki w obszarze wiadomości)

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
let allConversations = [];
let currentUser = null;
let currentChatUser = null;
let currentRoom = null; // Nazwa pokoju czatu, w którym klient aktualnie "słucha"
let socket = null;
let reconnectAttempts = 0;
let typingTimeout;
let currentActiveConvoItem = null;

// Mapa przechowująca statusy użytkowników: userId -> { isOnline: boolean, lastSeen: Date }
const userStatuses = new Map(); // userID -> { isOnline: boolean, lastSeen: string (ISO timestamp) }

// Stan uprawnień do powiadomień
let notificationPermissionGranted = false;

// Przycisk do włączania dźwięków (obsługa Autoplay Policy)
let enableSoundButton;

// NOWE ZMIENNE DLA DŹWIĘKU (Web Audio API)
let audioContext = null;
let audioContextInitiated = false; // Flaga do śledzenia, czy AudioContext został zainicjowany przez interakcję użytkownika

// NOWE ZMIENNE DLA TYTUŁU ZAKŁADKI PRZEGLĄDARKOWEJ
let baseDocumentTitle = "Komunikator";
// Mapa przechowująca nieprzeczytane wiadomości dla każdej konwersacji
// Klucz: roomId, Wartość: { unreadCount: number, lastSenderId: string }
let unreadConversationsInfo = new Map();

// --- Funkcje pomocnicze UI ---

/**
 * Wyświetla niestandardowy komunikat na górze ekranu.
 * Zastępuje alert().
 * @param {string} message - Treść komunikatu.
 * @param {'success'|'error'|'info'} type - Typ komunikatu ('success', 'error', 'info').
 */
function showCustomMessage(message, type = 'info') {
    let msgBox = document.querySelector('.custom-message-box');
    if (!msgBox) {
        msgBox = document.createElement('div');
        msgBox.id = 'customMessageBox';
        msgBox.className = 'custom-message-box hidden'; // Domyślnie ukryty
        document.body.appendChild(msgBox);
    }

    msgBox.textContent = message;
    msgBox.className = 'custom-message-box'; // Resetuj klasy
    msgBox.classList.add(type); // Dodaj typ (success, error, info)
    msgBox.style.opacity = '1'; // Ensure it's fully visible

    // Ukryj komunikat po 3 sekundach
    setTimeout(() => {
        msgBox.style.opacity = '0'; // Start fade out
        setTimeout(() => {
            msgBox.classList.add('hidden'); // Fully hide after fade
        }, 500); // Match CSS transition duration
    }, 3000);
}

/**
 * Upewnia się, że AudioContext jest aktywny. Jeśli nie, tworzy go
 * i wznawia (co wymaga gestu użytkownika).
 */
function ensureAudioContext() {
    if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        console.log("[AudioContext] Nowy AudioContext został utworzony.");
    }

    // Sprawdź stan AudioContext. Jeśli jest zawieszony, spróbuj go wznowić.
    // Wznowienie może wymagać gestu użytkownika.
    if (audioContext.state === 'suspended') {
        audioContext.resume().then(() => {
            console.log('[AudioContext] AudioContext pomyślnie wznowiony.');
            audioContextInitiated = true;
            localStorage.setItem('autoplayUnlocked', 'true'); // Zapisz, że autoplay jest odblokowany
            if (enableSoundButton) {
                enableSoundButton.classList.add('hidden'); // Ukryj przycisk
            }
        }).catch(e => {
            console.error('[AudioContext] Nie udało się wznowić AudioContext:', e);
            if (e.name === 'NotAllowedError' && enableSoundButton) {
                enableSoundButton.classList.remove('hidden'); // Jeśli nadal blokowany, pokaż przycisk
            }
        });
    } else if (audioContext.state === 'running') {
        console.log('[AudioContext] AudioContext już działa.');
        audioContextInitiated = true;
        localStorage.setItem('autoplayUnlocked', 'true');
        if (enableSoundButton) {
            enableSoundButton.classList.add('hidden');
        }
    } else {
        console.log(`[AudioContext] Stan AudioContext: ${audioContext ? audioContext.state : 'null'}`);
    }
}


/**
 * Odtwarza prosty, krótki dźwięk powiadomienia (beep).
 * Korzysta z Web Audio API (AudioContext) do generowania dźwięku.
 */
function playNotificationSound() {
    console.log("[Powiadomienia] Próba odtworzenia dźwięku powiadomienia...");

    try {
        ensureAudioContext(); // Zawsze upewnij się, że AudioContext jest aktywny

        if (!audioContext || audioContext.state !== 'running') {
            console.warn("[Powiadomienia] AudioContext nie działa. Nie można jeszcze odtworzyć dźwięku.");
            if (enableSoundButton) {
                enableSoundButton.classList.remove('hidden');
                showCustomMessage("Przeglądarka zablokowała dźwięki. Kliknij 'Włącz dźwięki' u góry, aby je aktywować.", "info");
            }
            return;
        }

        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);

        oscillator.type = 'sine'; // Fale sinusoidalne są czyste i przyjemne
        oscillator.frequency.setValueAtTime(440, audioContext.currentTime); // Nuta A4

        gainNode.gain.setValueAtTime(0.3, audioContext.currentTime); // Głośność powiadomienia (0.3 jest umiarkowane)
        gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.5); // Szybkie wyciszenie

        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.5); // Odtwarzaj przez 0.5 sekundy

        console.log("[Powiadomienia] Dźwięk powiadomienia został odtworzony.");

    } catch (e) {
        console.error("Błąd podczas odtwarzania dźwięku powiadomienia:", e);
        if (e.name === 'NotAllowedError' && enableSoundButton) {
            enableSoundButton.classList.remove('hidden');
            showCustomMessage("Przeglądarka zablokowała dźwięki. Kliknij 'Włącz dźwięki' u góry, aby je aktywować.", "info");
        }
    }
}


/**
 * Próbuje odtworzyć cichy dźwięk, aby sprawdzić i ewentualnie odblokować politykę Autoplay.
 * Jeśli się nie powiedzie, pokaże przycisk `enableSoundButton`.
 */
function checkAudioAutoplay() {
    console.log("[Sprawdzanie Autoplay] Próba sprawdzenia polityki autoplay...");

    // Jeśli autoplay został już odblokowany w poprzedniej sesji, ukryj przycisk
    if (localStorage.getItem('autoplayUnlocked') === 'true') {
        console.log("[Sprawdzanie Autoplay] Autoplay już odblokowany zgodnie z localStorage. Ukrywam przycisk.");
        if (enableSoundButton) {
            enableSoundButton.classList.add('hidden');
            audioContextInitiated = true; // Ustaw flagę na true, bo przeglądarka pamięta odblokowanie
        }
        ensureAudioContext(); // Spróbuj wznowić AudioContext prewencyjnie
        return;
    }

    try {
        ensureAudioContext(); // Upewnij się, że AudioContext istnieje i jest w stanie suspended/running

        if (audioContext && audioContext.state === 'suspended') {
            // Jeśli AudioContext jest zawieszony, oznacza to, że potrzebny jest gest użytkownika.
            // Pokaż przycisk do włączenia dźwięków.
            console.warn("[Sprawdzanie Autoplay] AudioContext jest zawieszony. Pokazuję przycisk 'Włącz dźwięki'.");
            if (enableSoundButton) {
                enableSoundButton.classList.remove('hidden');
                showCustomMessage("Przeglądarka zablokowała dźwięki. Kliknij 'Włącz dźwięki' u góry, aby je aktywować.", "info");
            }
        } else if (audioContext && audioContext.state === 'running') {
            console.log("[Sprawdzanie Autoplay] AudioContext już działa. Autoplay prawdopodobnie dozwolony.");
            audioContextInitiated = true;
            localStorage.setItem('autoplayUnlocked', 'true');
            if (enableSoundButton) {
                enableSoundButton.classList.add('hidden');
            }
        } else {
            console.log(`[Sprawdzanie Autoplay] Stan AudioContext: ${audioContext ? audioContext.state : 'null'}. Brak natychmiastowej akcji.`);
        }
    } catch (e) {
        console.error("Błąd podczas sprawdzania autoplay:", e);
        if (enableSoundButton) {
            enableSoundButton.classList.remove('hidden');
        }
    }
}


/**
 * Prosi użytkownika o uprawnienia do wyświetlania powiadomień przeglądarkowych.
 * Aktualizuje zmienną globalną `notificationPermissionGranted`.
 */
async function requestNotificationPermission() {
    console.log("[Powiadomienia] Sprawdzanie obsługi API powiadomień...");
    if (!("Notification" in window)) {
        console.warn("[Powiadomienia] Ta przeglądarka nie obsługuje powiadomień na pulpicie.");
        return;
    }

    // Sprawdź obecny status uprawnień
    if (Notification.permission === "granted") {
        notificationPermissionGranted = true;
        console.log("[Powiadomienia] Uprawnienia do powiadomień już udzielone.");
        return;
    } else if (Notification.permission === "denied") {
        notificationPermissionGranted = false;
        console.warn("[Powiadomienia] Uprawnienia do powiadomień wcześniej odrzucone.");
        showCustomMessage("Powiadomienia zostały zablokowane. Aby je włączyć, zmień ustawienia przeglądarki.", "info");
        return;
    }

    console.log("[Powiadomienia] Prośba o uprawnienia od użytkownika...");
    try {
        const permission = await Notification.requestPermission();
        if (permission === "granted") {
            notificationPermissionGranted = true;
            console.log("[Powiadomienia] Uprawnienia do powiadomień udzielone przez użytkownika.");
            showCustomMessage("Powiadomienia włączone!", "success");
        } else if (permission === "denied") {
            notificationPermissionGranted = false;
            console.warn("[Powiadomienia] Uprawnienia do powiadomień odrzucone przez użytkownika.");
            showCustomMessage("Powiadomienia zostały zablokowane. Nie będziesz otrzymywać alertów o nowych wiadomościach.", "error");
        } else { // 'default'
            notificationPermissionGranted = false;
            console.info("[Powiadomienia] Uprawnienia do powiadomień odrzucone lub domyślne.");
            showCustomMessage("Powiadomienia nie zostały włączone.", "info");
        }
    } catch (error) {
        console.error("[Powiadomienia] Błąd podczas prośby o uprawnienia do powiadomień:", error);
        notificationPermissionGranted = false;
        showCustomMessage("Wystąpił błąd podczas próby włączenia powiadomień.", "error");
    }
}


/**
 * Resetuje widok czatu do stanu początkowego (czyści wiadomości, wyłącza pole wprowadzania).
 * NIE kontroluje widoczności logoScreen ani chatArea. Są one obsługiwane przez wywołujące funkcje.
 */
function resetChatView() {
    console.log("[resetChatView] Resetowanie widoku czatu (czyszczenie zawartości, a nie widoczności)...");
    if (messageContainer) {
        messageContainer.innerHTML = ""; // Czyści wiadomości
        // Usuń wszystkie klasy motywu z kontenera wiadomości
        messageContainer.classList.remove('blue-theme', 'green-theme', 'red-theme', 'dark-bg', 'pattern-bg');
    } else {
        console.warn("[resetChatView] messageContainer nie został znaleziony podczas resetowania.");
    }

    if (messageInput) {
        messageInput.disabled = true; // Wyłącz pole wprowadzania
        messageInput.value = ""; // Wyczyść wartość pola wprowadzania
    } else {
        console.warn("[resetChatView] messageInput nie został znaleziony podczas resetowania.");
    }
    if (sendButton) {
        sendButton.disabled = true; // Wyłącz przycisk wysyłania
    } else {
        console.warn("[resetChatView] sendButton nie został znaleziony podczas resetowania.");
    }
    if (chatUserName) {
        chatUserName.textContent = ""; // Wyczyść nazwę użytkownika czatu
    } else {
        console.warn("[resetChatView] chatUserName nie został znaleziony podczas resetowania.");
    }
    if (userStatusSpan) {
        userStatusSpan.textContent = ""; // Wyczyść status użytkownika
        userStatusSpan.classList.remove('online', 'offline'); // Usuń klasy statusu
    } else {
        console.warn("[resetChatView] userStatusSpan nie został znaleziony podczas resetowania.");
    }
    if (typingStatusHeader) { // Status w nagłówku
        typingStatusHeader.classList.add('hidden'); // Ukryj wskaźnik pisania
        typingStatusHeader.textContent = ''; // Wyczyść tekst
    } else {
        console.warn("[resetChatView] typingStatusHeader nie został znaleziony podczas resetowania.");
    }
    if (typingIndicatorMessages) { // Animowane kropki w wiadomościach
        typingIndicatorMessages.classList.add('hidden'); // Ukryj wskaźnik pisania
    } else {
        console.warn("[resetChatView] typingIndicatorMessages nie został znaleziony podczas resetowania.");
    }

    currentChatUser = null; // Resetuj aktualnego użytkownika czatu
    currentRoom = null; // Resetuj aktualny pokój
    console.log("[resetChatView] currentChatUser i currentRoom zresetowane do null.");

    // Usuń aktywny stan z elementu konwersacji, jeśli istnieje
    if (currentActiveConvoItem) {
        currentActiveConvoItem.classList.remove('active'); // Dezaktywuj aktywny element konwersacji
        currentActiveConvoItem = null;
        console.log("[resetChatView] currentActiveConvoItem dezaktywowany.");
    }

    if (chatSettingsDropdown) {
        chatSettingsDropdown.classList.add('hidden'); // Ukryj rozwijane menu ustawień czatu
        console.log("[resetChatView] chatSettingsDropdown ukryty.");
    } else {
        console.warn("[resetChatView] chatSettingsDropdown nie został znaleziony podczas resetowania.");
    }
}

/**
 * Generuje unikalną nazwę pokoju czatu na podstawie dwóch ID użytkowników, posortowanych alfabetycznie.
 * @param {string} user1Id - ID pierwszego użytkownika.
 * @param {string} user2Id - ID drugiego użytkownika.
 * @returns {string} Nazwa pokoju czatu.
 */
function getRoomName(user1Id, user2Id) {
    return [String(user1Id), String(user2Id)].sort().join('_');
}

/**
 * Asynchronicznie pobiera ostatnią wiadomość dla danego pokoju czatu z Supabase.
 * Używa nazw kolumn bazy danych: content, sender_id, created_at, room_id.
 * Mapuje je do: text, username, inserted_at, room dla spójności frontendu.
 * @param {string} roomId - ID pokoju czatu.
 * @returns {Promise<Object|null>} Obiekt ostatniej wiadomości (zmapowany) lub null, jeśli brak wiadomości.
 */
async function getLastMessageForRoom(roomId) {
    try {
        const { data, error } = await supabase
            .from('messages')
            .select('content, sender_id, created_at, room_id')
            .eq('room_id', roomId)
            .order('created_at', { ascending: false })
            .limit(1);

        if (error) {
            console.error('Błąd podczas pobierania ostatniej wiadomości:', error);
            return null;
        }

        if (data && data.length > 0) {
            const msg = data[0];
            return {
                text: msg.content,
                username: msg.sender_id,
                inserted_at: msg.created_at,
                room: msg.room_id
            };
        }
        return null;
    } catch (e) {
        console.error("Złapano błąd w getLastMessageForRoom:", e);
        return null;
    }
}

/**
 * Pobiera całą historię wiadomości dla danego pokoju.
 * @param {string} roomId - ID pokoju.
 * @returns {Promise<Array<Object>>} Tablica obiektów wiadomości, posortowana od najstarszych do najnowszych.
 */
async function fetchMessageHistory(roomId) {
    console.log(`[fetchMessageHistory] Pobieranie historii dla pokoju: ${roomId}`);
    try {
        // Przyjmij maksymalny limit historii, aby zapobiec nadmiernemu transferowi danych
        const limit = 50;
        const { data, error } = await supabase
            .from('messages')
            .select('content, sender_id, created_at, room_id')
            .eq('room_id', roomId)
            .order('created_at', { ascending: true }) // Rosnąco dla wyświetlania historii
            .limit(limit);

        if (error) {
            console.error('[fetchMessageHistory] Błąd podczas pobierania historii wiadomości:', error);
            return [];
        }

        if (data) {
            console.log(`[fetchMessageHistory] Pobrano ${data.length} wiadomości dla pokoju ${roomId}.`);
            // Mapowanie kolumn bazy danych na oczekiwane właściwości frontendu
            return data.map(msg => ({
                text: msg.content,
                username: msg.sender_id,
                inserted_at: msg.created_at,
                room: msg.room_id
            }));
        }
        return [];
    } catch (e) {
        console.error("Złapano błąd w fetchMessageHistory:", e);
        return [];
    }
}


/**
 * Sortuje konwersacje według znacznika czasu ostatniej wiadomości (najnowsze na początku).
 * @param {Array<Object>} conversations - Tablica obiektów konwersacji.
 * @returns {Array<Object>} Posortowana tablica konwersacji.
 */
function sortConversations(conversations) {
    return [...conversations].sort((a, b) => {
        const timeA = a.lastMessage ? new Date(a.lastMessage.inserted_at) : new Date(0);
        const timeB = b.lastMessage ? new Date(b.lastMessage.inserted_at) : new Date(0);
        return timeB.getTime() - timeA.getTime();
    });
}

/**
 * Ładuje i renderuje listę kontaktów.
 * Pobiera innych użytkowników z Supabase, pobiera ich ostatnią wiadomość i wyświetla.
 */
async function loadContacts() {
    console.log("[loadContacts] Ładowanie kontaktów...");
    if (!currentUser || !currentUser.email) {
        console.error("[loadContacts] Bieżący użytkownik nie jest zdefiniowany, nie można załadować kontaktów.");
        return;
    }

    try {
        const { data: users, error } = await supabase.rpc('get_other_users', { current_email: currentUser.email });
        if (error) {
            console.error('[loadContacts] Błąd ładowania kontaktów:', error);
            return;
        }

        if (contactsListEl) {
            contactsListEl.innerHTML = ''; // Wyczyść istniejące kontakty
        } else {
            console.error("[loadContacts] Element contactsListEl nie został znaleziony! Nie można załadować listy kontaktów.");
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

            const avatarSrc = `https://i.pravatar.cc/150?img=${user.id.charCodeAt(0) % 70 + 1}`; // Losowy awatar na podstawie ID użytkownika

            let previewText = "Brak wiadomości"; // Domyślny tekst, jeśli brak wiadomości
            let timeText = "";

            if (lastMessage) {
                const senderName = String(lastMessage.username) === String(currentUser.id) ? "Ja" : (getUserLabelById(lastMessage.username) || lastMessage.username);
                previewText = `${senderName}: ${lastMessage.text}`;

                const lastMessageTime = new Date(lastMessage.inserted_at);
                if (isNaN(lastMessageTime.getTime())) {
                    console.warn(`[loadContacts] Nieprawidłowa data dla pokoju ${roomId}. Surowa inserted_at: ${lastMessage.inserted_at}`);
                    timeText = "Nieprawidłowa data";
                } else {
                    timeText = lastMessageTime.toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" });
                }
            }

            // NIE wyświetlaj statusu online/offline w tym miejscu. Zamiast tego, tylko kropka statusu.
            const userStatusData = userStatuses.get(String(user.id));
            const isOnline = userStatusData ? userStatusData.isOnline : false; // Zmieniono na isOnline
            const statusDotClass = isOnline ? 'online' : 'offline';

            convoItem.innerHTML = `
                <img src="${avatarSrc}" alt="Awatar" class="avatar">
                <div class="contact-info">
                    <span class="contact-name">${getUserLabelById(user.id) || user.email || 'Nieznany'}</span>
                    <span class="last-message">${previewText}</span>
                </div>
                <div class="contact-meta">
                    <span class="message-time">${timeText}</span>
                    <span class="unread-count hidden">0</span>
                    <span class="status-dot ${statusDotClass}"></span> <!-- Tylko kropka statusu -->
                    <!-- Tekst statusu offline/online usunięty stąd -->
                </div>
            `;

            convoItem.addEventListener('click', () => {
                handleConversationClick(user, convoItem);
            });

            contactsListEl.appendChild(convoItem);
        });
        console.log("[loadContacts] Kontakty załadowane i wyrenderowane.");
        await loadUnreadMessagesFromSupabase(); // Załaduj liczniki nieprzeczytanych wiadomości po wyrenderowaniu kontaktów
    } catch (e) {
        console.error("Złapano błąd w loadContacts:", e);
    }
}


/**
 * Obsługuje zdarzenie kliknięcia na element konwersacji.
 * Konfiguruje widok czatu dla wybranego użytkownika i dołącza do pokoju czatu.
 * @param {Object} user - Obiekt użytkownika wybranego kontaktu.
 * @param {HTMLElement} clickedConvoItemElement - Kliknięty element listy.
 */
async function handleConversationClick(user, clickedConvoItemElement) {
    console.log('[handleConversationClick] Kliknięto element konwersacji, użytkownik:', user);

    try {
        // Dezaktywuj poprzednio aktywny element konwersacji
        if (currentActiveConvoItem) {
            currentActiveConvoItem.classList.remove('active');
        }
        clickedConvoItemElement.classList.add('active'); // Aktywuj kliknięty element
        currentActiveConvoItem = clickedConvoItemElement;

        // KROK 1: Wyślij wiadomość 'leave' dla poprzedniego pokoju, jeśli istnieje i jest różny od nowego
        if (socket && socket.readyState === WebSocket.OPEN && currentRoom && currentRoom !== 'global') {
            socket.send(JSON.stringify({
                type: 'leave',
                name: currentUser.id,
                room: currentRoom // Opuszczamy poprzedni pokój
            }));
            console.log(`[handleConversationClick] Wysłano wiadomość LEAVE dla pokoju: ${currentRoom}`);
        }

        // NOWOŚĆ: Natychmiast ukryj ekran logo i pokaż obszar czatu, aby zapobiec migotaniu
        if (logoScreen) {
            logoScreen.classList.add('hidden');
            console.log("[handleConversationClick] logoScreen natychmiast ukryty.");
        }
        if (chatArea) {
            chatArea.classList.add('active');
            console.log("[handleConversationClick] chatArea natychmiast aktywny.");
        }
        if (chatAreaWrapper) {
            chatAreaWrapper.style.display = 'flex'; // Upewnij się, że jest widoczny, aby zawierał czat
            if (window.matchMedia('(max-width: 768px)').matches) {
                chatAreaWrapper.classList.add('active-on-mobile');
                console.log("[handleConversationClick] Mobile: chatAreaWrapper ustawiony na active-on-mobile i display flex.");
            } else {
                chatAreaWrapper.classList.remove('active-on-mobile');
                console.log("[handleConversationClick] Desktop: chatAreaWrapper ustawiony na display flex.");
            }
        }
        if (backButton) { // Upewnij się, że przycisk wstecz jest poprawnie ustawiony dla urządzeń mobilnych
            if (window.matchMedia('(max-width: 768px)').matches) {
                backButton.style.display = 'block';
                console.log("[handleConversationClick] Mobile: przycisk wstecz pokazany.");
            } else {
                backButton.style.display = 'none';
                console.log("[handleConversationClick] Desktop: przycisk wstecz ukryty.");
            }
        }
        // Upewnij się, że prawy pasek boczny jest zawsze ukryty na urządzeniach mobilnych, gdy czat jest aktywny
        if (window.matchMedia('(max-width: 768px)').matches && rightSidebarWrapper) {
            rightSidebarWrapper.style.display = 'none';
            console.log("[handleConversationClick] Mobile: rightSidebarWrapper ukryty.");
        }


        resetChatView(); // Resetuj widok czatu (czyszczenie zawartości) przed załadowaniem nowej konwersacji

        currentChatUser = {
            id: user.id,
            username: await getUserLabelById(user.id) || user.email,
            email: user.email,
        };
        const newRoom = getRoomName(String(currentUser.id), String(currentChatUser.id));
        currentRoom = newRoom; // Ustaw globalną zmienną currentRoom
        console.log(`[handleConversationClick] Rozpoczęto nową sesję czatu. Użytkownik: ${currentChatUser.username}, Ustawianie currentRoom na: ${currentRoom}`);

        // Wyczyść licznik nieprzeczytanych wiadomości w Supabase dla tej konwersacji
        if (supabase && currentUser && currentUser.id) {
            await clearUnreadMessageCountInSupabase(newRoom);
            console.log(`[Supabase] Wysłano żądanie wyczyszczenia liczby nieprzeczytanych wiadomości dla pokoju ${newRoom} w Supabase.`);
        } else {
            console.warn("[Supabase] Klient Supabase niegotowy lub currentUser nie ustawiony. Nie można wyczyścić liczby nieprzeczytanych wiadomości w Supabase.");
        }


        if (chatUserName && messageInput && sendButton && userStatusSpan) {
            chatUserName.textContent = currentChatUser.username;

            // Logika: Zaktualizuj status w nagłówku czatu (tutaj POKAZUJEMY lastSeen)
            const userStatusData = userStatuses.get(String(user.id));
            if (userStatusData) {
                userStatusSpan.textContent = userStatusData.isOnline ? 'Online' : formatLastSeen(userStatusData.lastSeen);
                userStatusSpan.classList.toggle('online', userStatusData.isOnline);
            } else {
                userStatusSpan.textContent = 'Ładowanie statusu...'; // Domyślny status
                userStatusSpan.classList.remove('online');
            }
            console.log(`[handleConversationClick] Początkowy status dla aktywnego użytkownika czatu ${currentChatUser.username}: ${userStatusSpan.textContent}`);

            messageInput.disabled = false;
            sendButton.disabled = false;
            messageInput.focus();
        } else {
            console.warn("[handleConversationClick] Jeden lub więcej elementów UI czatu (chatUserName, messageInput, sendButton, userStatusSpan) nie został znaleziony.");
        }

        // Resetuj licznik nieprzeczytanych wiadomości dla wybranej konwersacji (tylko UI, Supabase obsługuje globalnie)
        const unreadCount = clickedConvoItemElement.querySelector('.unread-count');
        if (unreadCount) {
            unreadCount.textContent = '0';
            unreadCount.classList.add('hidden');
            console.log(`[handleConversationClick] Liczba nieprzeczytanych wiadomości zresetowana dla pokoju ${newRoom} (tylko UI).`);
        } else {
            console.warn("[handleConversationClick] Element licznika nieprzeczytanych wiadomości nie został znaleziony dla wybranej konwersacji.");
        }
        // updateDocumentTitle zostanie wywołane po aktualizacji Supabase.


        // KROK 2: Dołącz do nowego pokoju na serwerze WebSocket
        if (socket && socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({
                type: 'join',
                name: currentUser.id,
                room: currentRoom, // Teraz wysyłamy konkretny pokój czatu
            }));
            console.log(`[handleConversationClick] Wysłano wiadomość JOIN do WebSocket dla pokoju: ${currentRoom}`);
        } else {
            console.warn("[handleConversationClick] WebSocket nie jest otwarty. Próba ponownej inicjalizacji i dołączenia po otwarciu.");
            initializeWebSocket(currentUser.id); // Ponowna inicjalizacja WebSocket, dołączenie po zdarzeniu 'open'
        }

        // KROK 3: Ładowanie historii wiadomości po ustawieniu pokoju
        try {
            const history = await fetchMessageHistory(currentRoom);
            console.log(`[handleConversationClick] Pobrano historię dla ${currentRoom}:`, history);
            if (messageContainer) {
                messageContainer.innerHTML = ''; // Wyczyść istniejące wiadomości przed dodaniem historii
                history.forEach(msg => {
                    // Dodaj wiadomość do widoku, ale NIE wywołuj logiki powiadomień dla historii
                    const div = document.createElement('div');
                    div.classList.add('message', String(msg.username) === String(currentUser.id) ? 'sent' : 'received');

                    const timestamp = new Date(msg.inserted_at || Date.now());
                    const timeString = timestamp.toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" });

                    div.innerHTML = `
                        <p>${msg.text}</p>
                        <span class="timestamp">${timeString}</span>
                    `;
                    messageContainer.appendChild(div);
                });
                messageContainer.scrollTop = messageContainer.scrollHeight; // Przewiń na dół
                console.log(`[handleConversationClick] Wyświetlono ${history.length} wiadomości historycznych.`);
            } else {
                console.error("[handleConversationClick] messageContainer jest nullem podczas próby załadowania historii.");
            }
        } catch (e) {
            console.error("[handleConversationClick] Błąd ładowania historii wiadomości:", e);
            showCustomMessage("Nie udało się załadować historii wiadomości.", "error");
        }
    } catch (e) {
        console.error("Złapano błąd w handleConversationClick:", e);
        showCustomMessage("Wystąpił błąd podczas ładowania konwersacji.", "error");
    }
}

/**
 * Konfiguruje nasłuchiwacze zdarzeń dla wysyłania wiadomości.
 */
function setupSendMessage() {
    console.log("[setupSendMessage] Konfigurowanie nasłuchiwaczy zdarzeń wysyłania wiadomości.");
    if (!messageInput || !sendButton || !messageContainer) {
        console.error("[setupSendMessage] Pole wprowadzania wiadomości, przycisk wysyłania lub messageContainer nie zostały znalezione do konfiguracji. Nie można dołączyć nasłuchiwaczy.");
        return;
    }

    try {
        // Wysyłanie wskaźnika pisania po wpisaniu
        messageInput.addEventListener('input', () => {
            console.log("[setupSendMessage] Wykryto zdarzenie 'input' w polu wiadomości.");
            if (currentRoom && socket && socket.readyState === WebSocket.OPEN) {
                socket.send(JSON.stringify({
                    type: 'typing',
                    username: currentUser.id,
                    room: currentRoom, // Wysyłamy do konkretnego pokoju
                }));
                console.log(`[setupSendMessage] Wysłano wiadomość o pisaniu dla pokoju: ${currentRoom}`);
            } else {
                console.warn(`[setupSendMessage] Nie można wysłać statusu pisania: currentRoom=${currentRoom}, status gniazda=${socket ? socket.readyState : 'N/A'}`);
            }
        });

        // Wysyłanie wiadomości po kliknięciu przycisku
        sendButton.onclick = () => {
            console.log("[DEBUG: SEND BUTTON] Przycisk wysyłania kliknięty lub naciśnięto Enter.");

            const text = messageInput.value.trim();
            console.log(`[DEBUG: SEND BUTTON] Długość tekstu wiadomości: ${text.length}`);

            if (!text || !currentChatUser || !socket || socket.readyState !== WebSocket.OPEN) {
                console.warn("Nie można wysłać wiadomości: sprawdź poniższe warunki.");

                // Dodatkowe logi do zdiagnozowania warunku
                console.log(`Warunki debugowania: text=${!!text}, currentChatUser=${!!currentChatUser ? currentChatUser.id : 'null'}, socket=${!!socket}, socket.readyState=${socket ? socket.readyState : 'N/A'}`);

                if (!text) console.log("Powód: Tekst wiadomości jest pusty.");
                if (!currentChatUser) console.log("Powód: currentChatUser nie jest ustawiony (nie wybrano czatu).");
                if (!socket) console.log("Powód: WebSocket jest nullem.");
                if (socket && socket.readyState !== WebSocket.OPEN) console.log(`Powód: WebSocket nie jest OTWARTY (aktualny stan: ${socket.readyState}).`);

                return;
            }
            if (!currentRoom) {
                console.error("Nie można wysłać wiadomości: currentRoom nie jest ustawiony. Najpierw wybierz kontakt.");
                showCustomMessage("Wybierz kontakt, aby wysłać wiadomość.", "info");
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
            const convoItemToMove = contactsListEl.querySelector(`.contact[data-room-id="${currentRoom}"]`);
            if (convoItemToMove && contactsListEl.firstChild !== convoItemToMove) {
                contactsListEl.prepend(convoItemToMove);
                console.log(`[Zmiana kolejności] Konwersacja dla pokoju ${currentRoom} przeniesiona na górę z powodu wysłanej wiadomości.`);
            }

            messageInput.value = '';
            messageInput.focus();
        };

        // Wysyłanie wiadomości po naciśnięciu Enter
        messageInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                console.log("[DEBUG: SEND BUTTON] Naciśnięto klawisz Enter.");
                sendButton.click();
            }
        });
        console.log("[setupSendMessage] Nasłuchiwacze zdarzeń wysyłania wiadomości dołączone.");
    } catch (e) {
        console.error("Złapano błąd w setupSendMessage:", e);
    }
}

/**
 * Dodaje wiadomość do widoku czatu i aktualizuje podgląd konwersacji na liście.
 * Zawiera logikę wyświetlania powiadomień przeglądarkowych.
 * @param {Object} msg - Obiekt wiadomości.
 */
async function addMessageToChat(msg) {
    console.log(`[addMessageToChat] Przetwarzanie wiadomości: nadawca=${msg.username}, pokój=${msg.room}. Globalny currentRoom (aktywny czat): ${currentRoom}`);

    try {
        let convoItemToUpdate = contactsListEl.querySelector(`.contact[data-room-id="${msg.room}"]`);
        console.log("[addMessageToChat] Znaleziono convoItemToUpdate:", !!convoItemToUpdate ? "Tak" : "Nie", `dla pokoju ${msg.room}`);

        if (!convoItemToUpdate) {
            console.warn(`[addMessageToChat] Element konwersacji dla pokoju ${msg.room} nie został początkowo znaleziony. Przeładowuję kontakty, aby zsynchronizować listę.`);
            await loadContacts();
            convoItemToUpdate = contactsListEl.querySelector(`.contact[data-room-id="${msg.room}"]`);
            if (!convoItemToUpdate) {
                console.error(`[addMessageToChat] Element konwersacji dla pokoju ${msg.room} nadal NIE został znaleziony po przeładowaniu kontaktów. Nie można zaktualizować UI.`);
                return;
            }
        }

        const previewEl = convoItemToUpdate.querySelector('.last-message');
        const timeEl = convoItemToUpdate.querySelector('.message-time');
        const unreadCountEl = convoItemToUpdate.querySelector('.unread-count');

        let previewText = "Brak wiadomości"; // Domyślny tekst, jeśli brak wiadomości

        if (previewEl && timeEl) {
            const senderId = String(msg.username);
            const senderName = senderId === String(currentUser.id) ? "Ja" : (getUserLabelById(senderId) || senderId);
            previewText = `${senderName}: ${msg.text}`;
            const lastMessageTime = new Date(msg.inserted_at || Date.now()); // Powrót do aktualnego czasu, jeśli brak inserted_at
            const timeString = lastMessageTime.toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" });
            timeEl.textContent = timeString;
            console.log(`[addMessageToChat] Zaktualizowano podgląd i czas dla pokoju ${msg.room}. Podgląd: "${previewText}"`);
            previewEl.textContent = previewText;
        } else {
            console.warn(`[addMessageToChat] Nie można znaleźć previewEl lub timeEl dla pokoju ${msg.room}. Podgląd/czas nie zaktualizowany.`);
        }

        // Zwiększ licznik nieprzeczytanych TYLKO jeśli wiadomość jest dla INNEGO pokoju I nie jest od bieżącego użytkownika (wysłana przez siebie)
        const isMessageFromOtherUser = String(msg.username) !== String(currentUser.id);
        const isDifferentRoom = msg.room !== currentRoom;

        if (isMessageFromOtherUser && isDifferentRoom) {
            // Aktualizuj licznik nieprzeczytanych w Supabase
            if (supabase && currentUser && currentUser.id) {
                await updateUnreadMessageCountInSupabase(msg.room, msg.username);
                console.log(`[Supabase] Wysłano żądanie zwiększenia licznika nieprzeczytanych wiadomości dla pokoju ${msg.room} w Supabase.`);
            } else {
                console.warn("[Supabase] Klient Supabase niegotowy lub currentUser nie ustawiony. Nie można zaktualizować licznika nieprzeczytanych wiadomości w Supabase.");
            }

            // Logika powiadomień przeglądarkowych i dźwięku
            // Pokaż powiadomienie, jeśli zakładka jest ukryta LUB jeśli użytkownik jest w innym czacie
            const shouldNotify = notificationPermissionGranted && (document.hidden || isDifferentRoom);
            if (shouldNotify) {
                console.log("[addMessageToChat] Spełnione warunki do pokazania powiadomienia przeglądarkowego i odtworzenia dźwięku.");
                const senderLabel = getUserLabelById(msg.username) || msg.username;
                const notificationTitle = `Nowa wiadomość od ${senderLabel}`;
                const notificationBody = msg.text;

                const notification = new Notification(notificationTitle, {
                    body: notificationBody,
                    icon: 'https://placehold.co/48x48/000000/FFFFFF?text=💬', // Prosta ikona powiadomienia
                    silent: true // Dźwięk obsługujemy osobną funkcją, aby ominąć blokady autoplay
                });

                notification.onclick = function() {
                    window.focus(); // Przełącz na okno przeglądarki
                    // Możesz dodać logikę do automatycznego przełączenia na odpowiedni czat,
                    // np. wywołując handleConversationClick z odpowiednimi danymi użytkownika.
                    console.log("[Powiadomienia] Powiadomienie kliknięte. Skupiam okno.");
                };

                playNotificationSound(); // Odtwórz dźwięk osobno
            }
        } else if (String(msg.username) === String(currentUser.id) || msg.room === currentRoom) {
            // Jeśli wiadomość pochodzi od bieżącego użytkownika lub dla aktywnego pokoju, upewnij się, że licznik nieprzeczytanych jest wyzerowany i ukryty
            console.log(`[addMessageToChat] Wiadomość pochodzi od bieżącego użytkownika (${String(msg.username) === String(currentUser.id)}) LUB jest dla aktywnego pokoju (${msg.room === currentRoom}). Upewniam się, że licznik nieprzeczytanych jest ukryty.`);
            if (unreadCountEl) {
                unreadCountEl.textContent = '0';
                unreadCountEl.classList.add('hidden');
            }
            // Wyczyść tę konwersację z globalnego śledzenia nieprzeczytanych w Supabase, jeśli była wcześniej nieprzeczytana
            if (supabase && currentUser && currentUser.id && unreadConversationsInfo.has(msg.room)) {
                await clearUnreadMessageCountInSupabase(msg.room);
                console.log(`[Supabase] Wysłano żądanie wyczyszczenia licznika nieprzeczytanych wiadomości dla aktywnego/wysłanego pokoju ${msg.room} w Supabase.`);
            }
        } else {
            console.log("[addMessageToChat] Nieobsługiwany scenariusz licznika nieprzeczytanych. pokój:", msg.room, "currentRoom:", currentRoom, "msg.username:", msg.username, "currentUser.id:", currentUser.id);
        }
        // updateDocumentTitle zostanie wywołane po załadowaniu lub zaktualizowaniu danych Supabase.

        // Wyświetl wiadomość w aktywnym czacie tylko jeśli należy do bieżącego pokoju
        console.log(`[addMessageToChat Sprawdzenie wyświetlania] Porównywanie msg.room (${msg.room}) z currentRoom (${currentRoom}). Dopasowanie: ${msg.room === currentRoom}`);
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
            console.log(`[addMessageToChat] Wiadomość NIE jest dla aktywnego pokoju (${currentRoom}), nie dodaję do widoku czatu. (Pasek boczny zaktualizowany dla pokoju: ${msg.room})`);
        }
    } catch (e) {
        console.error("Złapano błąd w addMessageToChat:", e);
    }
}

/**
 * Aktualizuje wskaźnik statusu online/offline dla konkretnego użytkownika.
 * @param {string} userId - ID użytkownika, którego status jest aktualizowany.
 * @param {boolean} isOnline - True, jeśli użytkownik jest online, w przeciwnym razie false.
 * @param {string} lastSeen - Ciąg znaków timestamp ISO ostatniej aktywności.
 */
function updateUserStatusIndicator(userId, isOnline, lastSeen) {
    console.log(`[Debug aktualizacji statusu] Wywołano funkcję dla userId: ${userId}, isOnline: ${isOnline}, lastSeen: ${lastSeen}`);
    try {
        // ZAWSZE AKTUALIZUJ MAPĘ userStatuses z nową strukturą
        userStatuses.set(String(userId), { isOnline: isOnline, lastSeen: lastSeen });

        // Wywołaj centralną funkcję do aktualizacji UI statusu
        updateUserUIStatus(String(userId));

    } catch (e) {
        console.error("Złapano błąd w updateUserStatusIndicator:", e);
    }
}


/**
 * Wyświetla wskaźnik pisania dla konkretnego użytkownika.
 * Ukrywa go po krótkim opóźnieniu.
 * @param {string} usernameId - ID użytkownika, który pisze.
 */
function showTypingIndicator(usernameId) {
    try {
        // Sprawdź, czy wskaźnik pisania dotyczy aktualnie aktywnego czatu
        if (currentChatUser && String(usernameId) === String(currentChatUser.id)) {
            // Pokaż wskaźnik pisania w nagłówku
            if (typingStatusHeader) {
                typingStatusHeader.classList.remove('hidden');
                typingStatusHeader.textContent = `${getUserLabelById(usernameId)} pisze...`; // Ustaw tekst
                console.log(`[showTypingIndicator] Nagłówek statusu pisania pokazany dla ${getUserLabelById(usernameId)}`);
            }
            // Pokaż animowane kropki w obszarze wiadomości
            if (typingIndicatorMessages) {
                typingIndicatorMessages.classList.remove('hidden');
                console.log(`[showTypingIndicator] Wskaźnik pisania wiadomości pokazany dla ${getUserLabelById(usernameId)}`);
            }

            clearTimeout(typingTimeout);
            typingTimeout = setTimeout(() => {
                if (typingStatusHeader) {
                    typingStatusHeader.classList.add('hidden');
                    typingStatusHeader.textContent = ''; // Wyczyść tekst
                    console.log(`[showTypingIndicator] Nagłówek statusu pisania ukryty dla ${getUserLabelById(usernameId)}`);
                }
                if (typingIndicatorMessages) {
                    typingIndicatorMessages.classList.add('hidden');
                    console.log(`[showTypingIndicator] Wskaźnik pisania wiadomości ukryty dla ${getUserLabelById(usernameId)}`);
                }
            }, 3000);
            console.log(`${getUserLabelById(usernameId)} pisze...`);
        } else {
            console.log(`[showTypingIndicator] Aktualizacja pisania dla ${getUserLabelById(usernameId)}, ale nie dla bieżącego użytkownika czatu. Ignoruję.`);
        }
    } catch (e) {
        console.error("Złapano błąd w showTypingIndicator:", e);
    }
}

/**
 * Inicjalizuje połączenie WebSocket do komunikacji w czasie rzeczywistym.
 */
function initWebSocket() {
    const wsUrl = import.meta.env.VITE_CHAT_WS_URL || "wss://firm-chat-app-backend.onrender.com";

    if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
        console.log("[initWebSocket] Połączenie WebSocket jest już otwarte lub nawiązywane. Pomijanie próby nowego połączenia.");
        return;
    }

    socket = new WebSocket(wsUrl);
    console.log(`[initWebSocket] Próba połączenia z WebSocket pod adresem: ${wsUrl}`);

    socket.onopen = async () => {
        console.log('[initWebSocket] Połączono z WebSocket pomyślnie.');
        reconnectAttempts = 0;
        if (currentUser) {
            // ZAWSZE dołączamy do "global" pokoju po otwarciu WS
            socket.send(JSON.stringify({
                type: 'join',
                name: currentUser.id,
                room: 'global', // Dołącz do globalnego pokoju dla statusów i ogólnego bycia "online"
            }));
            console.log(`[initWebSocket] Wysłano globalną wiadomość JOIN dla użytkownika: ${currentUser.id}`);

            // Wyślij status "online" po podłączeniu
            socket.send(JSON.stringify({
                type: 'status',
                user: currentUser.id,
                online: true,
                lastSeen: new Date().toISOString() // Wysyłaj aktualny timestamp
            }));
            console.log(`[initWebSocket] Wysłano status 'online' dla użytkownika ${currentUser.id}`);

            // Jeśli użytkownik był w trakcie czatu i WebSocket się rozłączył/ponownie połączył, dołącz ponownie do ostatniego pokoju
            if (currentRoom && currentRoom !== 'global') {
                socket.send(JSON.stringify({
                    type: 'join',
                    name: currentUser.id,
                    room: currentRoom
                }));
                console.log(`[initWebSocket] Ponowne dołączanie do poprzedniego pokoju (${currentRoom}) po ponownym połączeniu.`);
            }
        } else {
            console.warn("[initWebSocket] WebSocket otwarty, ale currentUser nie jest ustawiony. Nie można jeszcze dołączyć do pokoju.");
        }
        // Żądanie listy aktywnych użytkowników po pomyślnym połączeniu
        loadActiveUsers();
    };

    socket.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            console.log(`[WS MESSAGE] Wiadomość przychodząca: typ=${data.type}, pokój=${data.room}. Aktualny pokój klienta (globalna zmienna currentRoom): ${currentRoom}`);

            switch (data.type) {
                case 'message':
                    addMessageToChat({
                        username: data.username,
                        text: data.text,
                        inserted_at: data.inserted_at,
                        room: data.room,
                    });
                    // Przenieś konwersację na górę tylko dla nowo otrzymanych wiadomości
                    if (String(data.username) !== String(currentUser.id)) { // Tylko jeśli wiadomość nie jest od nas samych
                        const convoItemToMove = contactsListEl.querySelector(`.contact[data-room-id="${data.room}"]`);
                        if (convoItemToMove && contactsListEl.firstChild !== convoItemToMove) {
                            contactsListEl.prepend(convoItemToMove);
                            console.log(`[Zmiana kolejności] Konwersacja dla pokoju ${data.room} przeniesiona na górę z powodu nowej odebranej wiadomości.`);
                        }
                    }
                    break;
                case 'typing':
                    console.log(`[WS MESSAGE] Otrzymano informację o pisaniu od ${data.username} w pokoju ${data.room}.`);
                    showTypingIndicator(data.username);
                    break;
                case 'history':
                    console.log(`[WS MESSAGE] Otrzymano historię wiadomości dla pokoju: ${data.room}. Globalny currentRoom: ${currentRoom}`);
                    // Historia jest ładowana bezpośrednio przez handleConversationClick
                    // Ta sekcja jest głównie do celów debugowania lub jeśli historia byłaby ładowana w inny sposób
                    break;
                case 'status': // To jest OLD "status" message type, now superseded by USER_STATUS_UPDATE
                    console.warn(`[WS MESSAGE] Otrzymano stary typ wiadomości 'status'. Użyj USER_STATUS_UPDATE.`);
                    // Fallback dla kompatybilności, jeśli serwer nadal wysyła stary typ
                    updateUserStatusIndicator(data.user, data.online, new Date().toISOString());
                    break;
                case 'USER_STATUS_UPDATE':
                    // NOWA LOGIKA: Zaktualizuj status z timestampem lastSeen
                    console.log(`[WS MESSAGE] Otrzymano aktualizację statusu dla użytkownika ${data.userId}: online=${data.isOnline}, lastSeen: ${data.lastSeen}`);
                    updateUserStatusIndicator(data.userId, data.isOnline, data.lastSeen);
                    break;
                case 'ALL_USER_STATUSES':
                    // NOWA LOGIKA: Odbierz pełne obiekty użytkowników z lastSeen
                    console.log('[WS MESSAGE] Otrzymano początkową listę wszystkich statusów użytkowników:', data.statuses);
                    data.statuses.forEach(status => {
                        userStatuses.set(status.user_id, { isOnline: status.is_online, lastSeen: status.last_seen });
                    });
                    // Po załadowaniu wszystkich statusów, odśwież listy
                    await loadContacts(); // Odśwież kontakty, aby pokazać statusy kropek
                    await displayActiveUsers(); // Odśwież aktywnych użytkowników
                    break;
                case 'LOAD_MESSAGES':
                    console.log(`[WS MESSAGE] Otrzymano wiadomości dla pokoju: ${data.room}.`);
                    displayMessages(data.messages);
                    break;
                default:
                    console.warn("[WS MESSAGE] Nieznany typ wiadomości WS:", data.type, data);
            }
        } catch (e) {
            console.error("Błąd podczas parsowania lub obsługi wiadomości WebSocket:", e, "Surowe dane:", event.data);
        }
    };

    socket.onclose = (event) => {
        console.log(`[initWebSocket] WebSocket rozłączony. Kod: ${event.code}, Powód: ${event.reason}`);
        if (event.code !== 1000) {
            console.log('[initWebSocket] Próba ponownego połączenia...');
            setTimeout(initWebSocket, Math.min(1000 * ++reconnectAttempts, 10000));
        }
    };

    socket.onerror = (error) => {
        console.error('[initWebSocket] Błąd WebSocket:', error);
        if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
            socket.close();
        }
    };
}

/**
 * Ładuje i wyświetla listę aktywnych użytkowników w prawym pasku bocznym.
 */
async function loadActiveUsers() {
    console.log("[loadActiveUsers] Ładowanie aktywnych użytkowników dla prawego paska bocznego i urządzeń mobilnych...");
    if (!activeUsersListEl || !noActiveUsersText || !onlineUsersMobile) {
        console.error("[loadActiveUsers] Brak krytycznych elementów listy aktywnych użytkowników, nie można załadować aktywnych użytkowników.");
        return;
    }

    try {
        // Nie wysyłaj już żądania 'get_active_users' tutaj,
        // ponieważ statusy są aktualizowane przez ALL_USER_STATUSES i USER_STATUS_UPDATE
        // Wystarczy zaktualizować wyświetlanie na podstawie userStatuses.
        await displayActiveUsers(); // Bezpośrednie wywołanie funkcji wyświetlającej
    } catch (e) {
        console.error("Złapano błąd w loadActiveUsers:", e);
    }
}

/**
 * Wyświetla listę aktywnych użytkowników w prawym pasku bocznym (desktop) i sekcji użytkowników online na urządzeniach mobilnych.
 * @param {Array<Object>} [activeUsersData] - Opcjonalna tablica obiektów aktywnych użytkowników, każdy zawiera { id, online, lastSeen }.
 * Jeśli brak, używa userStatuses.
 */
async function displayActiveUsers(activeUsersData) {
    if (!activeUsersListEl || !noActiveUsersText || !onlineUsersMobile) {
        console.error("[displayActiveUsers] Brak elementów UI do wyświetlania aktywnych użytkowników.");
        return;
    }

    try {
        activeUsersListEl.innerHTML = '';
        onlineUsersMobile.innerHTML = '';
        // Nie czyść userStatuses.clear() tutaj, to jest globalna mapa aktualizowana przez WS.

        // Użyj userStatuses do filtrowania i wyświetlania
        const onlineUsersArray = Array.from(userStatuses.entries())
            .filter(([userId, status]) => status.isOnline && String(userId) !== String(currentUser.id))
            .map(([userId, status]) => ({ id: userId, online: status.isOnline, lastSeen: status.lastSeen }));


        if (onlineUsersArray.length === 0) {
            activeUsersListEl.style.display = 'none';
            noActiveUsersText.style.display = 'block';
            console.log("[displayActiveUsers] Brak aktywnych użytkowników, ukrywam listę desktopową, pokazuję tekst.");
        } else {
            activeUsersListEl.style.display = 'block';
            noActiveUsersText.style.display = 'none';
            console.log("[displayActiveUsers] Znaleziono aktywnych użytkowników, pokazuję listę desktopową, ukrywam tekst.");

            for (const user of onlineUsersArray) {
                const userLabel = await getUserLabelById(user.id);
                if (!userLabel) continue;

                const li = document.createElement('li');
                li.classList.add('active-user-item');
                li.dataset.userId = user.id;

                let avatarSrc = `https://i.pravatar.cc/150?img=${user.id.charCodeAt(0) % 70 + 1}`;

                li.innerHTML = `
                        <img src="${avatarSrc}" alt="Awatar" class="avatar">
                        <span class="username">${userLabel}</span>
                        <span class="status-dot online"></span>
                    `;
                activeUsersListEl.appendChild(li);

                // Element dla mobilnej listy aktywnych użytkowników
                const divMobile = document.createElement('div');
                divMobile.classList.add('online-user-item-mobile');
                divMobile.dataset.userId = user.id;

                divMobile.innerHTML = `
                        <img src="${avatarSrc}" alt="Awatar" class="avatar">
                        <span class="username">${userLabel}</span>
                    `;

                divMobile.addEventListener('click', async () => {
                    const userProfile = (await loadAllProfiles()).find(p => String(p.id) === String(user.id));
                    if (userProfile) {
                        const mockConvoItem = document.createElement('li'); // Użyj dummy elementu dla handleConversationClick
                        mockConvoItem.dataset.userId = user.id; // Przekazujemy userId
                        handleConversationClick(userProfile, mockConvoItem);
                    }
                });
                onlineUsersMobile.appendChild(divMobile);
            }
        }
        // W displayActiveUsers nie musimy wywoływać loadContacts(),
        // bo contactsListEl jest aktualizowany przez updateUserUIStatus.
    } catch (e) {
        console.error("Złapano błąd w displayActiveUsers:", e);
    }
}


/**
 * Konfiguruje funkcjonalność rozwijanego menu ustawień czatu.
 */
function setupChatSettingsDropdown() {
    console.log("[setupChatSettingsDropdown] Konfigurowanie rozwijanego menu ustawień czatu.");
    if (!chatSettingsButton || !chatSettingsDropdown) {
        console.warn("[setupChatSettingsDropdown] Przycisk lub rozwijane menu ustawień czatu nie zostały znalezione. Pomijanie konfiguracji.");
        return;
    }

    try {
        chatSettingsButton.addEventListener('click', (event) => {
            event.stopPropagation();
            chatSettingsDropdown.classList.toggle('hidden');
            console.log(`[setupChatSettingsDropdown] Rozwijane menu ustawień czatu przełączone. Ukryte: ${chatSettingsDropdown.classList.contains('hidden')}`);
        });

        document.addEventListener('click', (event) => {
            if (!chatSettingsDropdown.classList.contains('hidden') && chatSettingsButton && !chatSettingsButton.contains(event.target)) {
                chatSettingsDropdown.classList.add('hidden');
                console.log("[setupChatSettingsDropdown] Rozwijane menu ustawień czatu ukryte z powodu kliknięcia poza nim.");
            }
            if (!dropdownMenu.classList.contains('hidden') && menuButton && !menuButton.contains(event.target)) { // Zamknij również główne rozwijane menu
                dropdownMenu.classList.add('hidden');
            }
        });

        const colorOptions = chatSettingsDropdown.querySelectorAll('.color-box');
        colorOptions.forEach(option => {
            option.addEventListener('click', () => {
                colorOptions.forEach(box => box.classList.remove('active'));
                option.classList.add('active');
                const colorTheme = option.dataset.color;
                if (messageContainer) {
                    messageContainer.classList.remove('default-theme', 'blue-theme', 'green-theme', 'red-theme');
                    if (colorTheme !== 'default') {
                        messageContainer.classList.add(`${colorTheme}-theme`);
                    }
                }
                console.log('[setupChatSettingsDropdown] Motyw wiadomości zmieniony na:', colorTheme);
            });
        });

        const backgroundOptions = chatSettingsDropdown.querySelectorAll('.bg-box');
        backgroundOptions.forEach(option => {
            option.addEventListener('click', () => {
                backgroundOptions.forEach(box => box.classList.remove('active'));
                option.classList.add('active');
                const bgTheme = option.dataset.bg;
                if (messageContainer) {
                    // Upewnij się, że poprawne klasy są usuwane/dodawane. Twój HTML używa klas takich jak 'dark-bg' i 'pattern-bg' bezpośrednio.
                    messageContainer.classList.remove('default-bg', 'dark-bg', 'pattern-bg');
                    if (bgTheme !== 'default') {
                        messageContainer.classList.add(`${bgTheme}`); // Dodaj klasę taką, jaka jest (np. 'dark-bg', 'pattern-bg')
                    }
                }
                console.log('[setupChatSettingsDropdown] Tło czatu zmienione na:', bgTheme);
            });
        });

        const nicknameInput = document.getElementById('nicknameInput');
        const setNicknameButton = document.getElementById('setNicknameButton');
        if (nicknameInput && setNicknameButton) {
            setNicknameButton.addEventListener('click', async () => {
                console.log("[setupChatSettingsDropdown] Kliknięto przycisk ustawienia nicku.");
                const newNickname = nicknameInput.value.trim();
                if (newNickname && currentUser) {
                    try {
                        const { data, error } = await supabase
                            .from('profiles')
                            .update({ username: newNickname })
                            .eq('id', currentUser.id);

                        if (error) {
                            throw error;
                        }

                        console.log('Ustawiono nowy nick:', newNickname, 'dla użytkownika:', currentUser.id);
                        showCustomMessage(`Nick '${newNickname}' został pomyślnie ustawiony.`, 'success');
                        await loadAllProfiles();
                        if (chatUserName && currentChatUser && String(currentUser.id) === String(currentChatUser.id)) {
                            chatUserName.textContent = newNickname;
                        }
                        await loadContacts();

                    } catch (error) {
                        console.error('Błąd aktualizacji nicku:', error.message);
                        showCustomMessage(`Błąd ustawiania nicku: ${error.message}`, 'error');
                    }
                } else if (!currentUser) {
                    console.warn("[setupChatSettingsDropdown] Nie można ustawić nicku: currentUser niezalogowany.");
                    showCustomMessage("Błąd: Nie jesteś zalogowany, aby ustawić nick.", 'error');
                } else {
                    console.warn("[setupChatSettingsDropdown] Pole wprowadzania nicku jest puste.");
                }
            });
        } else {
            console.warn("[setupChatSettingsDropdown] Pole wprowadzania nicku lub przycisk ustawiania nicku nie zostały znalezione.");
        }

        const messageSearchInput = document.getElementById('messageSearchInput');
        const searchMessagesButton = document.getElementById('searchMessagesButton');
        if (messageSearchInput && searchMessagesButton) {
            searchMessagesButton.addEventListener('click', () => {
                console.log("[setupChatSettingsDropdown] Kliknięto przycisk wyszukiwania wiadomości.");
                const searchTerm = messageSearchInput.value.trim();
                console.log('Wyszukiwanie wiadomości dla:', searchTerm, '(funkcjonalność do zaimplementowania)');
                showCustomMessage(`Wyszukiwanie wiadomości dla '${searchTerm}' (funkcjonalność do zaimplementowania).`, 'info');
            });
        } else {
            console.warn("[setupChatSettingsDropdown] Pole wyszukiwania wiadomości lub przycisk nie zostały znalezione.");
        }
    } catch (e) {
        console.error("Złapano błąd w setupChatSettingsDropdown:", e);
    }
}

/**
 * Aktualizuje tytuł zakładki przeglądarki na podstawie statusu nieprzeczytanych wiadomości.
 * - Jeśli brak nieprzeczytanych: "Komunikator"
 * - Jeśli 1 nieprzeczytana konwersacja: "(1) [Nazwa_Nadawcy] - Komunikator"
 * - Jeśli >1 nieprzeczytanych konwersacji: "([Liczba_Konwersacji]) Komunikator"
 */
function updateDocumentTitle() {
    let totalUnreadConvos = 0;
    let singleUnreadSenderId = null;

    // Iteruj po mapie, aby zliczyć nieprzeczytane konwersacje i znaleźć pojedynczego nadawcę
    unreadConversationsInfo.forEach((info, roomId) => {
        if (info.unreadCount > 0) {
            totalUnreadConvos++;
            if (totalUnreadConvos === 1) { // Pierwsza znaleziona nieprzeczytana konwersacja
                singleUnreadSenderId = info.lastSenderId;
            } else { // Znaleziono więcej niż jedną, więc nie ma pojedynczego nadawcy
                singleUnreadSenderId = null;
            }
        }
    });

    let newTitle = baseDocumentTitle;
    if (totalUnreadConvos > 0) {
        if (totalUnreadConvos === 1 && singleUnreadSenderId) {
            const senderLabel = getUserLabelById(singleUnreadSenderId) || singleUnreadSenderId;
            newTitle = `(${totalUnreadConvos}) ${senderLabel} - ${baseDocumentTitle}`;
        } else {
            newTitle = `(${totalUnreadConvos}) ${baseDocumentTitle}`;
        }
    }
    document.title = newTitle;
    console.log(`[Tytuł Dokumentu] Zaktualizowano na: "${newTitle}"`);
}

/**
 * Aktualizuje licznik nieprzeczytanych wiadomości dla danego pokoju w Supabase.
 * Jeśli rekord nie istnieje, zostanie utworzony.
 * @param {string} roomId - ID pokoju czatu.
 * @param {string} senderId - ID użytkownika, który wysłał wiadomość.
 */
async function updateUnreadMessageCountInSupabase(roomId, senderId) {
    if (!supabase || !currentUser || !currentUser.id) {
        console.warn("[Supabase] Klient Supabase lub currentUser nie ustawiony. Nie można zaktualizować licznika nieprzeczytanych wiadomości.");
        return;
    }
    try {
        const { data, error } = await supabase
            .from('unread_messages')
            .upsert({
                user_id: currentUser.id,
                room_id: roomId,
                count: 1, // Zawsze dodaj 1, a `onConflict` obsłuży inkrementację
                last_sender_id: senderId,
                updated_at: new Date().toISOString()
            }, {
                onConflict: 'user_id, room_id', // Jeśli konflikt, zaktualizuj
                ignoreDuplicates: false // Ważne: to musi być false, aby konflikt był wykryty
            });

        if (error) {
            // Jeśli wystąpił konflikt (rekord już istnieje), spróbuj go zaktualizować poprzez inkrementację
            if (error.code === '23505' || error.message.includes('duplicate key')) { // Kod naruszenia unikalności PostgreSQL
                console.log(`[Supabase] Rekord dla pokoju ${roomId} już istnieje, próba inkrementacji.`);
                const { data: updateData, error: updateError } = await supabase
                    .from('unread_messages')
                    .update({
                        count: (unreadConversationsInfo.get(roomId)?.unreadCount || 0) + 1, // Pobierz obecny licznik z mapy i inkrementuj
                        last_sender_id: senderId,
                        updated_at: new Date().toISOString()
                    })
                    .eq('user_id', currentUser.id)
                    .eq('room_id', roomId);

                if (updateError) {
                    console.error("[Supabase] Błąd inkrementacji licznika nieprzeczytanych wiadomości:", updateError);
                } else {
                    console.log(`[Supabase] Licznik nieprzeczytanych wiadomości dla pokoju ${roomId} inkrementowany dla użytkownika ${currentUser.id}.`);
                }
            } else {
                console.error("[Supabase] Błąd wstawiania/aktualizacji licznika nieprzeczytanych wiadomości:", error);
            }
        } else {
            console.log(`[Supabase] Licznik nieprzeczytanych wiadomości dla pokoju ${roomId} zaktualizowany (upsert) dla użytkownika ${currentUser.id}.`);
        }
        // Po udanej operacji w bazie, załaduj ponownie dane i zaktualizuj UI
        await loadUnreadMessagesFromSupabase();

    } catch (e) {
        console.error("[Supabase] Złapano błąd podczas aktualizacji licznika nieprzeczytanych wiadomości:", e);
    }
}


/**
 * Zeruje licznik nieprzeczytanych wiadomości dla danego pokoju w Supabase.
 * @param {string} roomId - ID pokoju czatu do wyzerowania.
 */
async function clearUnreadMessageCountInSupabase(roomId) {
    if (!supabase || !currentUser || !currentUser.id) {
        console.warn("[Supabase] Klient Supabase lub currentUser nie ustawiony. Nie można wyczyścić licznika nieprzeczytanych wiadomości.");
        return;
    }
    try {
        const { data, error } = await supabase
            .from('unread_messages')
            .update({
                count: 0,
                last_sender_id: null,
                updated_at: new Date().toISOString()
            })
            .eq('user_id', currentUser.id)
            .eq('room_id', roomId);

        if (error) {
            console.error("[Supabase] Błąd podczas czyszczenia licznika nieprzeczytanych wiadomości:", error);
        } else {
            console.log(`[Supabase] Licznik nieprzeczytanych wiadomości dla pokoju ${roomId} wyczyszczony dla użytkownika ${currentUser.id}.`);
        }
        // Po udanej operacji w bazie, załaduj ponownie dane i zaktualizuj UI
        await loadUnreadMessagesFromSupabase();
    } catch (e) {
        console.error("[Supabase] Złapano błąd podczas czyszczenia licznika nieprzeczytanych wiadomości:", e);
    }
}

/**
 * Ładuje wszystkie nieprzeczytane wiadomości dla bieżącego użytkownika z Supabase
 * i aktualizuje lokalną mapę `unreadConversationsInfo` oraz UI.
 */
async function loadUnreadMessagesFromSupabase() {
    if (!supabase || !currentUser || !currentUser.id) {
        console.warn("[Supabase Loader] Klient Supabase lub currentUser nie ustawiony. Nie można załadować nieprzeczytanych wiadomości.");
        return;
    }
    try {
        const { data, error } = await supabase
            .from('unread_messages')
            .select('room_id, count, last_sender_id')
            .eq('user_id', currentUser.id);

        if (error) {
            console.error("[Supabase Loader] Błąd podczas pobierania nieprzeczytanych wiadomości:", error);
            return;
        }

        unreadConversationsInfo.clear(); // Wyczyść istniejące dane lokalne
        data.forEach(record => {
            if (record.count > 0) {
                unreadConversationsInfo.set(record.room_id, {
                    unreadCount: record.count,
                    lastSenderId: record.last_sender_id
                });
            }
            // Update UI for each conversation item
            const convoItem = contactsListEl.querySelector(`.contact[data-room-id="${record.room_id}"]`);
            if (convoItem) {
                const unreadCountEl = convoItem.querySelector('.unread-count');
                if (unreadCountEl) {
                    if (record.count > 0) {
                        unreadCountEl.textContent = record.count;
                        unreadCountEl.classList.remove('hidden');
                    } else {
                        unreadCountEl.textContent = '0';
                        unreadCountEl.classList.add('hidden');
                    }
                }
            }
        });
        console.log("[Supabase Loader] unreadConversationsInfo zaktualizowane z Supabase:", unreadConversationsInfo);
        updateDocumentTitle(); // Zaktualizuj tytuł zakładki przeglądarki na podstawie nowych danych
    } catch (e) {
        console.error("[Supabase Loader] Złapano błąd podczas ładowania nieprzeczytanych wiadomości z Supabase:", e);
    }
}


// --- Główna inicjalizacja aplikacji ---
/**
 * Główna funkcja do inicjalizacji całej aplikacji.
 * Pobiera elementy DOM, sprawdza sesję użytkownika, ładuje dane i konfiguruje nasłuchiwacze zdarzeń.
 */
async function initializeApp() {
    console.log("Inicjalizowanie aplikacji Komunikator...");

    try {
        // 1. Pobierz referencje do elementów DOM
        mainHeader = document.querySelector('.main-header'); console.log(`Element UI: mainHeader znaleziono: ${!!mainHeader}`);
        menuButton = document.getElementById('menuButton'); console.log(`Element UI: menuButton znaleziono: ${!!menuButton}`);
        dropdownMenu = document.getElementById('dropdownMenu'); console.log(`Element UI: dropdownMenu znaleziono: ${!!dropdownMenu}`);
        themeToggle = document.getElementById('themeToggle'); console.log(`Element UI: themeToggle znaleziono: ${!!themeToggle}`);
        logoutButton = document.getElementById('logoutButton'); console.log(`Element UI: logoutButton znaleziono: ${!!logoutButton}`);

        // NOWY ELEMENT: Przycisk do włączania dźwięków
        enableSoundButton = document.getElementById('enableSoundButton'); console.log(`Element UI: enableSoundButton znaleziono: ${!!enableSoundButton}`);


        container = document.querySelector('.container'); console.log(`Element UI: container znaleziono: ${!!container}`);
        sidebarWrapper = document.querySelector('.sidebar-wrapper'); console.log(`Element UI: sidebarWrapper znaleziono: ${!!sidebarWrapper}`);
        mainNavIcons = document.querySelector('.main-nav-icons'); console.log(`Element UI: mainNavIcons znaleziono: ${!!mainNavIcons}`);
        navIcons = document.querySelectorAll('.nav-icon'); console.log(`Element UI: navIcons znaleziono: ${navIcons.length > 0}`);

        onlineUsersMobile = document.getElementById('onlineUsersMobile'); console.log(`Element UI: onlineUsersMobile znaleziono: ${!!onlineUsersMobile}`);

        sidebarEl = document.getElementById('sidebar'); console.log(`Element UI: sidebarEl znaleziono: ${!!sidebarEl}`);
        searchInput = sidebarEl ? sidebarEl.querySelector('.search-bar input[type="text"]') : null; console.log(`Element UI: searchInput znaleziono: ${!!searchInput}`);
        contactsListEl = document.getElementById('contactsList'); console.log(`Element UI: contactsListEl znaleziono: ${!!contactsListEl}`);

        chatAreaWrapper = document.querySelector('.chat-area-wrapper'); console.log(`Element UI: chatAreaWrapper znaleziono: ${!!chatAreaWrapper}`);
        logoScreen = document.getElementById('logoScreen'); console.log(`Element UI: logoScreen znaleziono: ${!!logoScreen}`);
        chatArea = document.getElementById('chatArea'); console.log(`Element UI: chatArea znaleziono: ${!!chatArea}`);

        chatHeader = document.querySelector('.chat-header'); console.log(`Element UI: chatHeader znaleziono: ${!!chatHeader}`);
        backButton = document.getElementById('backButton'); console.log(`Element UI: backButton znaleziono: ${!!backButton}`);
        chatUserName = document.getElementById('chatUserName'); console.log(`Element UI: chatUserName znaleziono: ${!!chatUserName}`);
        userStatusSpan = document.getElementById('userStatus'); console.log(`Element UI: userStatusSpan znaleziono: ${!!userStatusSpan}`);
        chatHeaderActions = chatHeader ? chatHeader.querySelector('.chat-header-actions') : null; console.log(`Element UI: chatHeaderActions znaleziono: ${!!chatHeaderActions}`);
        chatSettingsButton = document.getElementById('chatSettingsButton'); console.log(`Element UI: chatSettingsButton znaleziono: ${!!chatSettingsButton}`);
        chatSettingsDropdown = document.getElementById('chatSettingsDropdown'); console.log(`Element UI: chatSettingsDropdown znaleziono: ${!!chatSettingsDropdown}`);
        typingStatusHeader = document.getElementById('typingStatus'); console.log(`Element UI: typingStatusHeader znaleziono: ${!!typingStatusHeader}`);
        typingIndicatorMessages = document.getElementById('typingIndicator'); console.log(`Element UI: typingIndicatorMessages znaleziono: ${!!typingIndicatorMessages}`);

        // Aktualizacja tej linii
        messageContainer = document.getElementById('messageContainer');
        console.log(`Element UI: messageContainer znaleziono: ${!!messageContainer}`); // Dostosowane logowanie

        chatFooter = document.querySelector('.chat-footer'); console.log(`Element UI: chatFooter znaleziono: ${!!chatFooter}`);
        attachButton = chatFooter ? chatFooter.querySelector('.attach-button') : null; console.log(`Element UI: attachButton znaleziono: ${!!attachButton}`);
        messageInput = document.getElementById('messageInput'); console.log(`Element UI: messageInput znaleziono: ${!!messageInput}`);
        emojiButton = chatFooter ? chatFooter.querySelector('.emoji-button') : null; console.log(`Element UI: emojiButton znaleziono: ${!!emojiButton}`);
        sendButton = document.getElementById('sendButton'); console.log(`Element UI: sendButton znaleziono: ${!!sendButton}`);

        rightSidebarWrapper = document.querySelector('.right-sidebar-wrapper'); console.log(`Element UI: rightSidebarWrapper znaleziono: ${!!rightSidebarWrapper}`);
        rightSidebar = document.getElementById('rightSidebar'); console.log(`Element UI: rightSidebar znaleziono: ${!!rightSidebar}`);
        activeUsersListEl = document.getElementById('activeUsersList'); console.log(`Element UI: activeUsersListEl znaleziono: ${!!activeUsersListEl}`);
        noActiveUsersText = document.getElementById('noActiveUsersText'); console.log(`Element UI: noActiveUsersText znaleziono: ${!!noActiveUsersText}`);

        const criticalElementsCheck = {
            mainHeader, menuButton, dropdownMenu, themeToggle, logoutButton, enableSoundButton,
            container, sidebarWrapper, mainNavIcons, onlineUsersMobile,
            sidebarEl, searchInput, contactsListEl,
            chatAreaWrapper, logoScreen, chatArea,
            chatHeader, backButton, chatUserName, userStatusSpan,
            chatHeaderActions, chatSettingsButton, chatSettingsDropdown,
            typingStatusHeader, typingIndicatorMessages, messageContainer,
            chatFooter, attachButton, messageInput, emojiButton, sendButton,
            rightSidebarWrapper, rightSidebar, activeUsersListEl, noActiveUsersText
        };

        let allElementsFound = true;
        for (const key in criticalElementsCheck) {
            // Sprawdź, czy null lub undefined. Dla NodeList, sprawdź również, czy długość wynosi 0 (jak navIcons)
            if (criticalElementsCheck[key] === null || criticalElementsCheck[key] === undefined || (criticalElementsCheck[key] instanceof NodeList && criticalElementsCheck[key].length === 0)) {
                console.error(`[initializeApp] BŁĄD: Krytyczny element UI '${key}' nie został znaleziony lub jest pusty. Sprawdź swój HTML. Aktualna wartość:`, criticalElementsCheck[key]);
                allElementsFound = false;
            }
        }

        if (!allElementsFound) {
            console.error('[initializeApp] Inicjalizacja nie powiodła się z powodu brakujących krytycznych elementów UI. Przerywanie.');
            showCustomMessage('Wystąpił krytyczny błąd inicjalizacji. Brakuje elementów interfejsu. Sprawdź konsolę przeglądarki.', 'error');
            return;
        } else {
            console.log('[initializeApp] Wszystkie krytyczne elementy UI znalezione. Kontynuowanie inicjalizacji aplikacji.');
        }

        const { data: { session }, error: sessionError } = await supabase.auth.getSession();

        if (sessionError) {
            console.error('[initializeApp] Błąd pobierania sesji Supabase:', sessionError.message);
            showCustomMessage(`Błąd uwierzytelniania: ${sessionError.message}. Przekierowuję do logowania.`, 'error');
            window.location.href = 'login.html';
            return;
        }

        if (!session?.user) {
            console.log('[initializeApp] Nie znaleziono aktywnej sesji Supabase. Przekierowanie do login.html');
            window.location.href = 'login.html';
            return;
        }

        currentUser = session.user; // Upewnij się, że currentUser jest ustawiony z Supabase
        console.log(`[initializeApp] Bieżący uwierzytelniony użytkownik ID: ${currentUser.id}, Email: ${currentUser.email}`);

        // Obsługa statusu offline przed opuszczeniem strony
        window.addEventListener('beforeunload', () => {
            if (socket && socket.readyState === WebSocket.OPEN && currentUser) {
                console.log(`[beforeunload] Wysyłanie sygnału 'leave' dla użytkownika ${currentUser.id}.`);
                try {
                    socket.send(JSON.stringify({
                        type: 'leave',
                        name: currentUser.id,
                        room: currentRoom || 'global'
                    }));
                     // Wyślij status offline przy opuszczeniu
                    socket.send(JSON.stringify({
                        type: 'status',
                        user: currentUser.id,
                        online: false,
                        lastSeen: new Date().toISOString() // Zaktualizuj znacznik czasu ostatniego widzenia
                    }));
                    console.log(`[beforeunload] Wysłano status 'offline' dla użytkownika ${currentUser.id}.`);

                } catch (sendError) {
                    console.warn(`[beforeunload] Nie udało się wysłać wiadomości opuszczenia przez WebSocket: ${sendError.message}`);
                }
            }
        });
        console.log("[initializeApp] Nasłuchiwacz 'beforeunload' dołączony do sygnału opuszczenia WebSocket.");

        // 4. Załaduj profile i kontakty
        console.log("[initializeApp] Ładowanie profili użytkowników i kontaktów...");
        await loadAllProfiles();
        // loadContacts() zostanie wywołane po otrzymaniu ALL_USER_STATUSES
        // await loadContacts();
        console.log("[initializeApp] Profile użytkowników i kontakty załadowane.");

        // 5. Inicjalizuj połączenie WebSocket
        console.log("[initializeApp] Inicjalizowanie połączenia WebSocket...");
        initWebSocket();

        // 6. Skonfiguruj funkcjonalność wysyłania wiadomości
        console.log("[initializeApp] Konfigurowanie funkcjonalności wysyłania wiadomości...");
        setupSendMessage();

        // 7. Ustaw domyślny stan UI przy ładowaniu
        console.log("[initializeApp] Ustawianie domyślnego stanu UI...");
        // Ważne: początkowo ukryj chatArea i pokaż logoScreen na pulpicie
        // Na urządzeniach mobilnych, chatArea będzie aktywny tylko po kliknięciu konwersacji.
        if (window.matchMedia('(min-width: 769px)').matches) {
            if (chatArea) chatArea.classList.remove('active'); // Upewnij się, że chatArea nie jest aktywny domyślnie
            if (logoScreen) logoScreen.classList.remove('hidden'); // Pokaż ekran logo przy inicjalizacji na pulpicie
            console.log("[initializeApp] Początkowy stan pulpitu: chatArea nieaktywny, logoScreen widoczny.");
        } else {
            // Na urządzeniach mobilnych, chatArea jest początkowo ukryty, logoScreen jest również ukryty przez CSS
            if (chatArea) chatArea.classList.remove('active');
            if (logoScreen) logoScreen.classList.add('hidden'); // Upewnij się, że ukryty przy inicjalizacji na urządzeniach mobilnych
            console.log("[initializeApp] Początkowy stan mobilny: chatArea nieaktywny, logoScreen ukryty.");
        }

        if (messageInput) messageInput.disabled = true;
        if (sendButton) sendButton.disabled = true;

        // 8. Dodaj ogólne nasłuchiwacze zdarzeń dla UI aplikacji
        console.log("[initializeApp] Dołączanie ogólnych nasłuchiwaczy zdarzeń UI...");
        backButton.addEventListener('click', () => {
            console.log('[backButton] Kliknięto przycisk Wstecz (UI)');

            // Wysyłamy wiadomość 'leave' do serwera, informując go, że opuszczamy obecny pokój czatu
            if (socket && socket.readyState === WebSocket.OPEN && currentRoom && currentRoom !== 'global') {
                socket.send(JSON.stringify({
                    type: 'leave',
                    name: currentUser.id,
                    room: currentRoom
                }));
                console.log(`[backButton] Wysłano wiadomość opuszczenia do WebSocket dla pokoju: ${currentRoom}`);
            }

            resetChatView();

            if (window.matchMedia('(max-width: 768px)').matches) {
                console.log("[backButton] Wyzwolono logikę widoku mobilnego. Pokazywanie paska bocznego.");
                if (sidebarWrapper) {
                    sidebarWrapper.style.display = 'flex'; // Zmieniono na flex, aby był widoczny
                    console.log("[backButton] Mobile: sidebarWrapper widoczny.");
                } else { console.warn("[backButton] Mobile: sidebarWrapper nie znaleziono w zmianie mq."); }

                if (chatAreaWrapper) {
                    chatAreaWrapper.classList.remove('active-on-mobile');
                    chatAreaWrapper.style.display = 'none'; // Upewnij się, że jest ukryty po wycofaniu
                    console.log("[backButton] Mobile: chatAreaWrapper dezaktywowany i ukryty.");
                } else { console.warn("[backButton] Mobile: chatAreaWrapper nie znaleziono w zmianie mq."); }

                if (chatArea) {
                    chatArea.classList.remove('active');
                    console.log("[backButton] Mobile: chatArea dezaktywowany.");
                } else { console.warn("[backButton] Mobile: chatArea nie znaleziono w zmianie mq."); }

                if (logoScreen) {
                    logoScreen.classList.add('hidden');
                    console.log("[backButton] Mobile: logoScreen ukryty.");
                } else { console.warn("[backButton] Mobile: logoScreen nie znaleziono w zmianie mq."); }

                if (backButton) {
                    backButton.style.display = 'none';
                    console.log("[backButton] Mobile: backButton ukryty.");
                } else { console.warn("[backButton] Mobile: backButton nie znaleziono w zmianie mq."); }

                if (rightSidebarWrapper) {
                    rightSidebarWrapper.style.display = 'none';
                    console.log("[backButton] Mobile: rightSidebarWrapper ukryty.");
                } else { console.warn("[backButton] Mobile: rightSidebarWrapper nie znaleziono w zmianie mq."); }


            } else {
                console.log("[backButton] Wyzwolono logikę widoku pulpitu. Pokazywanie ekranu logo.");
                if (logoScreen) {
                    logoScreen.classList.remove('hidden');
                    console.log("[backButton] Desktop: logoScreen widoczny.");
                } else { console.warn("[backButton] Desktop: logoScreen nie znaleziono."); }

                if (chatArea) {
                    chatArea.classList.remove('active');
                    console.log("[backButton] Desktop: chatArea dezaktywowany.");
                } else { console.warn("[backButton] Desktop: chatArea nie znaleziono."); }

                if (chatAreaWrapper) {
                    chatAreaWrapper.classList.remove('active-on-mobile');
                    chatAreaWrapper.style.display = 'flex';
                    console.log("[backButton] Desktop: chatAreaWrapper ustawiony na flex.");
                } else { console.warn("[backButton] Desktop: chatAreaWrapper nie znaleziono."); }
            }
        });

        menuButton.addEventListener('click', (event) => {
            event.stopPropagation();
            dropdownMenu.classList.toggle('hidden');
            console.log(`[initializeApp] Rozwijane menu przełączone. Ukryte: ${dropdownMenu.classList.contains('hidden')}`);
        });

        document.addEventListener('click', (event) => {
            if (!chatSettingsDropdown.classList.contains('hidden') && chatSettingsButton && !chatSettingsButton.contains(event.target)) {
                chatSettingsDropdown.classList.add('hidden');
                console.log("[initializeApp] Rozwijane menu ustawień czatu ukryte z powodu kliknięcia poza nim.");
            }
            if (!dropdownMenu.classList.contains('hidden') && menuButton && !menuButton.contains(event.target)) {
                dropdownMenu.classList.add('hidden');
                console.log("[initializeApp] Główne rozwijane menu ukryte z powodu kliknięcia poza nim.");
            }
        });

        themeToggle.addEventListener('click', () => {
            document.body.classList.toggle('dark-mode');
            if (document.body.classList.contains('dark-mode')) {
                localStorage.setItem('theme', 'dark');
                themeToggle.innerHTML = '<i class="fas fa-sun"></i> Tryb jasny';
                console.log("[initializeApp] Przełączono na tryb ciemny.");
            } else {
                localStorage.setItem('theme', 'light');
                themeToggle.innerHTML = '<i class="fas fa-moon"></i> Tryb ciemny';
                console.log("[initializeApp] Przełączono na tryb jasny.");
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
            // Wyślij status offline przed wylogowaniem
            if (socket && socket.readyState === WebSocket.OPEN && currentUser) {
                try {
                    socket.send(JSON.stringify({
                        type: 'status',
                        user: currentUser.id,
                        online: false,
                        lastSeen: new Date().toISOString() // Zaktualizuj znacznik czasu ostatniego widzenia
                    }));
                    console.log(`[logoutButton] Wysłano status 'offline' dla użytkownika ${currentUser.id} przed wylogowaniem.`);
                } catch (sendError) {
                    console.warn(`[logoutButton] Nie udało się wysłać statusu offline: ${sendError.message}`);
                }
            }

            const { error } = await supabase.auth.signOut();
            if (error) {
                console.error('Błąd wylogowania:', error.message);
                showCustomMessage(`Błąd wylogowania: ${error.message}`, 'error');
            } else {
                console.log('Wylogowano pomyślnie. Przekierowanie do login.html');
                window.location.href = 'login.html';
            }
        });

        if (navIcons) {
            navIcons.forEach(icon => {
                icon.addEventListener('click', () => {
                    navIcons.forEach(i => i.classList.remove('active'));
                    icon.classList.add('active');
                    console.log('Kliknięto ikonę nawigacji:', icon.title || icon.dataset.tooltip);
                });
            });
        }

        setupChatSettingsDropdown();

        // Nasłuchiwacz dla nowego przycisku włączającego dźwięki
        if (enableSoundButton) {
            enableSoundButton.addEventListener('click', () => {
                console.log("[Sprawdzanie Autoplay] Kliknięto przycisk 'Włącz dźwięki'.");
                ensureAudioContext(); // Wywołaj ensureAudioContext, aby wznowić kontekst
                playNotificationSound(); // Odtwórz dźwięk natychmiast po kliknięciu
                localStorage.setItem('autoplayUnlocked', 'true'); // Zapisz, że użytkownik odblokował autoplay
                enableSoundButton.classList.add('hidden'); // Ukryj przycisk po kliknięciu
            });
        }


        function handleMediaQueryChange(mq) {
            console.log(`[handleMediaQueryChange] Wyzwolono nasłuchiwacz media query. mq.matches: ${mq.matches} (max-width: 768px)`);
            if (mq.matches) {
                // Układ mobilny
                console.log("[handleMediaQueryChange] Aktywny układ mobilny. Dostosowywanie początkowej widoczności dla urządzeń mobilnych.");
                if (sidebarWrapper) {
                    sidebarWrapper.style.display = 'flex';
                    console.log("[handleMediaQueryChange] Mobile: sidebarWrapper flex.");
                } else { console.warn("[handleMediaQueryChange] Mobile: sidebarWrapper nie znaleziono w zmianie mq."); }

                if (chatAreaWrapper) {
                    chatAreaWrapper.style.display = 'none';
                    console.log("[handleMediaQueryChange] Mobile: chatAreaWrapper ukryty.");
                } else { console.warn("[handleMediaQueryChange] Mobile: chatAreaWrapper nie znaleziono w zmianie mq."); }

                if (rightSidebarWrapper) {
                    rightSidebarWrapper.style.display = 'none';
                    console.log("[handleMediaQueryChange] Mobile: rightSidebarWrapper ukryty.");
                } else { console.warn("[handleMediaQueryChange] Mobile: rightSidebarWrapper nie znaleziono w zmianie mq."); }

                if (backButton) {
                    backButton.style.display = 'none'; // Na początku ukryty, pokazywany przy otwarciu czatu
                    console.log("[handleMediaQueryChange] Mobile: backButton ukryty początkowo.");
                } else { console.warn("[handleMediaQueryChange] Mobile: backButton nie znaleziono w zmianie mq."); }

                if (onlineUsersMobile) {
                    onlineUsersMobile.style.display = 'none'; // Domyślnie ukryj, pokaż tylko po kliknięciu ikony
                }
                if (contactsListEl) {
                    contactsListEl.style.display = 'block'; // Domyślnie pokaż listę kontaktów
                }

            } else {
                // Układ pulpitu
                console.log("[handleMediaQueryChange] Aktywny układ pulpitu.");
                if (sidebarWrapper) {
                    sidebarWrapper.style.display = 'flex';
                    console.log("[handleMediaQueryChange] Desktop: sidebarWrapper flex.");
                } else { console.warn("[handleMediaQueryChange] Desktop: sidebarWrapper nie znaleziono w zmianie mq."); }

                if (chatAreaWrapper) {
                    chatAreaWrapper.style.display = 'flex';
                    console.log("[handleMediaQueryChange] Desktop: chatAreaWrapper flex.");
                } else { console.warn("[handleMediaQueryChange] Desktop: chatAreaWrapper nie znaleziono w zmianie mq."); }

                if (logoScreen) {
                    logoScreen.classList.remove('hidden');
                    console.log("[handleMediaQueryChange] Desktop: logoScreen widoczny.");
                } else { console.warn("[handleMediaQueryChange] Desktop: logoScreen nie znaleziono w zmianie mq."); }

                if (chatArea) {
                    chatArea.classList.remove('active');
                    console.log("[handleMediaQueryChange] Desktop: chatArea nieaktywny.");
                } else { console.warn("[handleMediaQueryChange] Desktop: chatArea nie znaleziono w zmianie mq."); }

                if (rightSidebarWrapper) {
                    rightSidebarWrapper.style.display = 'flex';
                    console.log("[handleMediaQueryChange] Desktop: rightSidebarWrapper flex.");
                } else { console.warn("[handleMediaQueryChange] Desktop: rightSidebarWrapper nie znaleziono w zmianie mq."); }

                if (backButton) {
                    backButton.style.display = 'none';
                    console.log("[handleMediaQueryChange] Desktop: backButton ukryty.");
                } else { console.warn("[handleMediaQueryChange] Desktop: backButton nie znaleziono w zmianie mq."); }
            }
        }

        // Dołącz nasłuchiwacz media query i wywołaj obsługę początkowo
        const mq = window.matchMedia('(max-width: 768px)');
        mq.addListener(handleMediaQueryChange);
        handleMediaQueryChange(mq); // Początkowe wywołanie w celu ustawienia poprawnego układu

        // Teraz, gdy aplikacja jest zainicjalizowana, poproś o pozwolenie na powiadomienia
        await requestNotificationPermission();

        // Sprawdź politykę Autoplay po inicjalizacji
        checkAudioAutoplay();

        // Tytuł zakładki zostanie zaktualizowany po załadowaniu nieprzeczytanych wiadomości z Supabase
        updateDocumentTitle(); // Ustawienie początkowego tytułu na "Komunikator"

        console.log("[initializeApp] Aplikacja Komunikator została pomyślnie zainicjalizowana.");
    } catch (e) {
        console.error("[initializeApp] Złapano krytyczny błąd podczas inicjalizacji:", e);
        showCustomMessage("Wystąpił nieoczekiwany błąd podczas uruchamiania aplikacji. Spróbuj odświeżyć stronę.", "error");
    }
}

// Uruchom aplikację po pełnym załadowaniu DOM
document.addEventListener('DOMContentLoaded', initializeApp);
