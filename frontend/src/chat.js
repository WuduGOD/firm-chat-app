import { loadAllProfiles, getUserLabelById } from './profiles.js';
import { supabase } from './supabaseClient.js';
// Importujemy funkcje do zarządzania UI, które są w ui.js
import { openChatPanel, closeChatPanel, resetUI } from './ui.js';

let currentUser = null;
let currentChatUser = null;
let currentRoom = null;

// ZMIENIONE SELEKTORY HTML ZGODNE Z NOWYM DESIGNEM
let conversationList; // Poprzednio: contactsList
let messagesDiv; // Poprzednio: messageContainer, teraz: .chat-content-view
let messageInput; // Poprzednio: messageInput, teraz: .message-input
let sendMessageBtn; // Poprzednio: sendButton, teraz: .send-message-btn

// ZMIENIONE SELEKTORY DLA POKAZYWANIA/UKRYWANIA WIDOKÓW
// Nie potrzebujemy już logoScreen, chatArea, backButton bezpośrednio w chat.js,
// bo ich widoczność jest zarządzana przez ui.js przy użyciu klas na app-container/content-area/active-chat-panel.
// Będziemy korzystać z funkcji openChatPanel/closeChatPanel z ui.js.

let socket = null;
let reconnectAttempts = 0;

// ZMIENNE DLA NOWYCH ELEMENTÓW UI (POZOSATAWIAM TYLKO TE, KTÓRE SĄ UŻYWANE W TEJ LOGICE CZATU)
// Pozostałe, które obsługują menu, dropdowny itp. są teraz w ui.js
let chatHeaderName; // Element do wyświetlania nazwy użytkownika czatu (chat-header-name)
let chatHeaderAvatar; // Element do wyświetlania avatara użytkownika czatu (chat-header-avatar)
let chatStatusSpan; // Element do wyświetlania statusu online/offline (chat-status)
let typingIndicatorDiv; // Nowy element dla animacji pisania (typing-indicator) - musi być w HTML


// --- FUNKCJE OBSŁUGI ZDARZEŃ DLA NOWYCH ELEMENTÓW ---
// UWAGA: Funkcje takie jak setupNewUIListeners, initDarkMode, i zmienne z nimi związane
// zostały usunięte z chat.js, ponieważ są teraz w ui.js.
// Pozostawiłem tylko te, które są integralnie związane z logiką czatu (np. chatUserNameSpan, userStatusSpan).

export async function initChatApp() {
    // PRZYPISANIE NOWYCH SELEKTORÓW DO ZMIENNYCH
    conversationList = document.querySelector('.conversation-list'); // Lista konwersacji
    messagesDiv = document.querySelector('.chat-content-view'); // Obszar wiadomości
    messageInput = document.querySelector('.message-input'); // Pole wprowadzania wiadomości
    sendMessageBtn = document.querySelector('.send-message-btn'); // Przycisk wysyłania

    chatHeaderName = document.querySelector('.chat-header-name'); // Nazwa w nagłówku czatu
    chatHeaderAvatar = document.querySelector('.chat-header-avatar'); // Avatar w nagłówku czatu
    chatStatusSpan = document.querySelector('.chat-status'); // Status w nagłówku czatu

    // Elementy do obsługi statusu pisania
    // UWAGA: Upewnij się, że w HTML masz element z klasą 'typing-indicator'
    // np. <div class="typing-indicator hidden">...</div>
    typingIndicatorDiv = document.querySelector('.typing-indicator'); // Animacja pisania

    // Sprawdzenie, czy wszystkie kluczowe elementy zostały znalezione
    if (!conversationList || !messagesDiv || !messageInput || !sendMessageBtn || !chatHeaderName || !chatHeaderAvatar || !chatStatusSpan) {
        console.error('Błąd: Nie wszystkie elementy UI zostały znalezione. Sprawdź selektory w chat.js i plik index.html.');
        // Możesz dodać alert lub inną obsługę błędu
        return;
    }

    // Pobierz aktualnego usera (Supabase auth)
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
        window.location.href = 'login.html'; // Przekieruj na stronę logowania, jeśli brak sesji
        return;
    }
    currentUser = session.user;

    await loadAllProfiles(); // Ładuje profile użytkowników (np. do funkcji getUserLabelById)
    await loadContacts(); // Ładuje listę konwersacji

    setupSendMessage(); // Ustawia event listenery dla wysyłania wiadomości
    initWebSocket(); // Inicjuje połączenie WebSocket

    // Odświeżanie profili co 10 minut
    setInterval(loadAllProfiles, 10 * 60 * 1000);

    // Domyślny stan po załadowaniu: początkowo ukryj aktywny panel czatu
    // ui.js już zajmuje się domyślną widocznością.
    // Tutaj możesz dodatkowo upewnić się, że panel czatu nie jest aktywny na starcie
    const activeChatPanel = document.querySelector('.active-chat-panel');
    if (activeChatPanel) {
        activeChatPanel.classList.remove('active');
    }

    // Dodatkowe ustawienia początkowe inputa i przycisku wysyłania
    messageInput.disabled = true;
    sendMessageBtn.disabled = true;

    // UWAGA: Obsługa przycisku "Wróć" (back-to-list-btn) jest teraz w ui.js.
    // Funkcja closeChatPanel importowana z ui.js.
    // Potrzebujesz jedynie wywołać ją, jeśli w logiczny sposób chcesz cofnąć widok
    // np. po kliknięciu na istniejący przycisk 'Wróć' (back-to-list-btn), który jest obsługiwany w ui.js
    // jeśli to potrzebne, możesz z nim powiązać też logikę czyszczenia stanu chat.js
    document.querySelector('.back-to-list-btn')?.addEventListener('click', () => {
        // Dodatkowa logika czyszczenia stanu czatu po powrocie do listy
        messagesDiv.innerHTML = '';
        messageInput.disabled = true;
        sendMessageBtn.disabled = true;
        currentChatUser = null;
        currentRoom = null;
        // Funkcja closeChatPanel z ui.js obsługuje widoczność paneli
    });
}

async function loadContacts() {
    const { data: users, error } = await supabase.rpc('get_other_users', { current_email: currentUser.email });
    if (error) {
        console.error('Błąd ładowania kontaktów:', error);
        return;
    }

    conversationList.innerHTML = ''; // Wyczyść listę konwersacji
    users.forEach(user => {
        // Nowa struktura dla `.convo-item`
        const convoItem = document.createElement('div');
        convoItem.classList.add('convo-item');
        convoItem.dataset.convoId = user.id; // Używamy data-convo-id zamiast data-id
        convoItem.dataset.email = user.email; // Dodaj email do dataset

        // UWAGA: Avatary są domyślnie puste, musisz je dynamicznie ładować (np. z Supabase Storage)
        // Poniżej używam tymczasowego, losowego avatara, który nie będzie ładowany, jeśli nie masz logiki do tego.
        // Będziesz musiał dostosować `img src` do swojej logiki ładowania avatarów.
        const avatarSrc = `https://i.pravatar.cc/150?img=${Math.floor(Math.random() * 70) + 1}`; // Tymczasowy losowy avatar

        convoItem.innerHTML = `
            <img src="${avatarSrc}" alt="Avatar" class="convo-avatar">
            <div class="convo-info">
                <div class="convo-name">${getUserLabelById(user.id) || user.email}</div>
                <div class="convo-preview">Brak wiadomości</div> </div>
            <span class="convo-time"></span> <span class="unread-count hidden">0</span> `;

        // Obsługa kliknięcia na konwersację
        convoItem.addEventListener('click', () => {
            // Usuń klasę 'active' ze wszystkich innych konwersacji
            document.querySelectorAll('.convo-item').forEach(item => item.classList.remove('active'));
            // Dodaj klasę 'active' do klikniętej konwersacji
            convoItem.classList.add('active');

            startChatWith(user); // Uruchom czat z wybranym użytkownikiem
        });

        conversationList.appendChild(convoItem);
    });
}

function getRoomName(user1, user2) {
    // Używamy ID użytkowników, bo email może się zmienić, a ID jest stałe.
    // Upewnij się, że currentUser.id jest dostępne.
    return [user1, user2].sort().join('_');
}

async function startChatWith(user) {
    // Otwórz panel czatu, używając funkcji z ui.js
    openChatPanel();

    currentChatUser = {
        id: user.id,
        username: getUserLabelById(user.id) || user.email,
        email: user.email,
    };

    messagesDiv.innerHTML = ''; // Wyczyść wiadomości przed załadowaniem nowych
    // currentRoom = getRoomName(currentUser.email, currentChatUser.email); // Zmieniono na ID
    currentRoom = getRoomName(currentUser.id, currentChatUser.id);


    if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({
            type: 'join',
            // name: currentUser.email, // Zmieniono na ID
            name: currentUser.id,
            room: currentRoom,
        }));
    }

    // Aktualizacja nagłówka czatu
    chatHeaderName.textContent = currentChatUser.username;
    // Aktualizacja avatara w nagłówku czatu
    // Będziesz musiał załadować prawdziwy avatar dla currentChatUser.id
    chatHeaderAvatar.src = `https://i.pravatar.cc/150?img=${user.id % 70 + 1}`; // Tymczasowy avatar

    // Aktualizacja statusu użytkownika (jeśli masz to w bazie lub z WebSocket)
    // chatStatusSpan.textContent = user.is_online ? 'Online' : 'Offline'; // Jeśli `user` ma pole `is_online`
    // chatStatusSpan.classList.toggle('online', user.is_online);
    // chatStatusSpan.classList.toggle('offline', !user.is_online);

    messageInput.disabled = false;
    sendMessageBtn.disabled = false;
    messageInput.focus();
}

function setupSendMessage() {
    sendMessageBtn.onclick = () => {
        const text = messageInput.value.trim();
        if (!text || !currentChatUser || !socket || socket.readyState !== WebSocket.OPEN) return;

        const msgData = {
            type: 'message',
            username: currentUser.id, // Wysyłaj ID użytkownika, a nie email
            text,
            room: currentRoom,
        };

        console.log("Wysyłanie wiadomości:", msgData);
        socket.send(JSON.stringify(msgData));
        messageInput.value = '';
        messageInput.focus();
    };

    messageInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            sendMessageBtn.click();
        }
        // Logika wysyłania statusu pisania (nadal wymaga backendu)
        // if (socket && socket.readyState === WebSocket.OPEN && currentRoom) {
        //     socket.send(JSON.stringify({
        //         type: 'typing',
        //         username: currentUser.id,
        //         room: currentRoom
        //     }));
        // }
    });
}

function addMessageToChat(msg) {
    console.log("Dodawanie wiadomości do interfejsu:", msg);

    // Sprawdź, czy wiadomość jest przeznaczona dla aktywnego pokoju
    if (msg.room !== currentRoom) {
        console.log("Wiadomość nie jest dla aktywnego pokoju, ignoruję.");
        return;
    }

    const div = document.createElement('div');
    // Używamy 'sent' lub 'received' dla dymków wiadomości
    div.classList.add('message-wave', msg.username === currentUser.id ? 'sent' : 'received', 'animate-in'); // Dodaj animate-in dla animacji

    const timestamp = new Date(msg.inserted_at || Date.now()); // Użyj Date.now() dla wiadomości wysłanych teraz
    const timeString = timestamp.toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" });

    // Nowa struktura HTML dla wiadomości
    div.innerHTML = `
        <p>${msg.text}</p>
        <span class="message-time">${timeString}</span>
    `;
    messagesDiv.appendChild(div);
    messagesDiv.scrollTop = messagesDiv.scrollHeight; // Przewiń na dół
}

function updateUserStatusIndicator(userId, isOnline) {
    // Aktualizacja statusu w liście konwersacji (jeśli masz tam element statusu)
    const convoItem = document.querySelector(`.convo-item[data-convo-id="${userId}"]`);
    if (convoItem) {
        // Jeśli masz element na status w convo-item, np. <span class="convo-status"></span>
        // const convoStatusSpan = convoItem.querySelector('.convo-status');
        // if (convoStatusSpan) {
        //     convoStatusSpan.textContent = isOnline ? 'Online' : 'Offline';
        //     convoStatusSpan.classList.toggle('online', isOnline);
        //     convoStatusSpan.classList.toggle('offline', !isOnline);
        // }
    }

    // Zaktualizuj status w nagłówku aktywnego czatu, jeśli to ten użytkownik
    if (currentChatUser && currentChatUser.id === userId) {
        if (chatStatusSpan) {
            chatStatusSpan.textContent = isOnline ? 'Online' : 'Offline';
            // Jeśli masz style dla 'online'/'offline' na samym elemencie statusu
            chatStatusSpan.classList.toggle('online', isOnline);
            chatStatusSpan.classList.toggle('offline', !isOnline);
        }
    }
}

// NOWA FUNKCJA DO POKAZYWANIA/UKRYWANIA TYPING INDICATOR
// (Będzie wymagać sygnału z serwera WebSocket)
let typingTimeout;
function showTypingIndicator(usernameId) {
    // Pokaż tylko jeśli to użytkownik, z którym aktualnie czatujemy
    if (currentChatUser && usernameId === currentChatUser.id) {
        if (typingIndicatorDiv) {
            // Możesz chcieć wyświetlić nazwę użytkownika, który pisze
            // const label = getUserLabelById(usernameId) || usernameId;
            // typingIndicatorDiv.textContent = `${label} pisze...`; // Jeśli to tekst
            typingIndicatorDiv.classList.remove('hidden'); // Pokaż animację
            clearTimeout(typingTimeout);
            typingTimeout = setTimeout(() => {
                typingIndicatorDiv.classList.add('hidden');
                // typingIndicatorDiv.textContent = ''; // Wyczyść tekst, jeśli był
            }, 3000); // Ukryj po 3 sekundach braku aktywności
        }
    }
}

function initWebSocket() {
    // UWAGA: Upewnij się, że zmienna środowiskowa VITE_CHAT_WS_URL jest poprawnie ustawiona
    // i wskazuje na Twój serwer WebSocket (np. ws://localhost:3000 lub wss://twoj-serwer.com/ws)
    const wsUrl = import.meta.env.VITE_CHAT_WS_URL;
    socket = new WebSocket(wsUrl);

    socket.onopen = () => {
        console.log('WebSocket połączony');
        reconnectAttempts = 0;

        // Jeśli użytkownik był już w pokoju, dołącz ponownie
        if (currentRoom && currentUser) {
            socket.send(JSON.stringify({
                type: 'join',
                name: currentUser.id, // Używaj ID użytkownika
                room: currentRoom,
            }));
        }
    };

    socket.onmessage = (event) => {
        const data = JSON.parse(event.data);
        console.log('Odebrano przez WS:', data);

        if (data.type === 'message') {
            addMessageToChat({
                username: data.username, // To jest ID użytkownika, który wysłał wiadomość
                text: data.text,
                inserted_at: data.inserted_at,
                room: data.room, // Dodajemy 'room' do danych wiadomości
            });
        }
        // OBSŁUGA NOWEGO TYPU WIADOMOŚCI 'TYPING'
        if (data.type === 'typing') {
            showTypingIndicator(data.username);
        }

        if (data.type === 'history' && Array.isArray(data.messages)) {
            console.log("Ładowanie historii wiadomości:", data.messages);
            // Upewnij się, że ładowana historia dotyczy aktywnego pokoju
            messagesDiv.innerHTML = ''; // Wyczyść przed załadowaniem historii
            data.messages.forEach((msg) => addMessageToChat(msg));
        }

        if (data.type === 'status') {
            updateUserStatusIndicator(data.user, data.online);
        }
    };

    socket.onclose = () => {
        console.log('WebSocket rozłączony. Próba ponownego połączenia...');
        setTimeout(initWebSocket, Math.min(1000 * ++reconnectAttempts, 10000));
    };

    socket.onerror = (error) => {
        console.error('Błąd WebSocket:', error);
    };
}

export { startChatWith };

// WAŻNE: Wywołaj initChatApp po załadowaniu DOM
// Możesz to zrobić tutaj lub w osobnym pliku entrypoint.js
// document.addEventListener('DOMContentLoaded', initChatApp);
// LUB: Jeśli używasz `defer` w tagu script, możesz wywołać to bezpośrednio
initChatApp(); // Wywołaj inicjalizację aplikacji po załadowaniu skryptu