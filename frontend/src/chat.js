import { loadAllProfiles, getUserLabelById } from './profiles.js';
import { supabase } from './supabaseClient.js';

let currentUser = null;
let currentChatUser = null;
let currentRoom = null;

let contactsList;
let messagesDiv;
let inputMsg;
let sendBtn;

let logoScreen;
let chatArea;
let backButton;

let socket = null;
let reconnectAttempts = 0;

let themeToggle;
const body = document.body;

// NOWE ZMIENNE DLA NOWYCH ELEMENTÓW UI
let menuButton;
let dropdownMenu;
let logoutButton; // Przeniesiony do menu
let chatSettingsButton;
let chatSettingsDropdown;
let chatUserNameSpan; // Element do wyświetlania nazwy użytkownika czatu
let userStatusSpan; // Element do wyświetlania statusu online/offline
let typingStatusDiv; // Element do wyświetlania statusu pisania
let typingIndicatorDiv; // Nowy element dla animacji pisania

// ZMIENNE DLA NOWYCH OPCJI CZATU (W SETTINGS DROPDOWN)
let nicknameInput;
let setNicknameButton;
let messageSearchInput;
let searchMessagesButton;
let colorBoxes;
let bgBoxes;


// --- FUNKCJE OBSŁUGI ZDARZEŃ DLA NOWYCH ELEMENTÓW ---

function setupNewUIListeners() {
    // Obsługa głównego menu
    menuButton = document.getElementById('menuButton');
    dropdownMenu = document.getElementById('dropdownMenu');
    logoutButton = document.getElementById('logoutButton'); // Teraz pobieramy go z dropdownu
    
    if (menuButton) {
        menuButton.addEventListener('click', () => {
            dropdownMenu.classList.toggle('hidden');
            // Accessibility: aktualizuj aria-expanded
            const isHidden = dropdownMenu.classList.contains('hidden');
            menuButton.setAttribute('aria-expanded', !isHidden);
        });
    }

    if (logoutButton) {
        logoutButton.addEventListener('click', async () => {
            const { error } = await supabase.auth.signOut();
            if (error) {
                console.error('Błąd wylogowania:', error.message);
                alert('Błąd wylogowania!');
            } else {
                window.location.href = '/login.html'; // Przekieruj na stronę logowania po wylogowaniu
            }
        });
    }

    // Obsługa ustawień czatu
    chatSettingsButton = document.getElementById('chatSettingsButton');
    chatSettingsDropdown = document.getElementById('chatSettingsDropdown');
    
    if (chatSettingsButton) {
        chatSettingsButton.addEventListener('click', () => {
            chatSettingsDropdown.classList.toggle('hidden');
        });
    }

    // Obsługa zmiany motywu wiadomości (kolory dymków)
    colorBoxes = document.querySelectorAll('.color-box');
    colorBoxes.forEach(box => {
        box.addEventListener('click', () => {
            const colorTheme = box.dataset.color;
            messagesDiv.className = 'messages'; // Resetuj wszystkie klasy tematyczne
            messagesDiv.classList.add(`${colorTheme}-theme`); // Dodaj nową klasę tematyczną
            
            // Opcjonalnie: zapisz wybór do localStorage
            localStorage.setItem('chatMessageTheme', colorTheme);

            // Aktywuj wybrany box
            colorBoxes.forEach(cb => cb.classList.remove('active'));
            box.classList.add('active');
        });
    });
    // Wczytaj zapisany motyw po załadowaniu
    const savedMessageTheme = localStorage.getItem('chatMessageTheme') || 'default';
    if (savedMessageTheme !== 'default') {
        messagesDiv.classList.add(`${savedMessageTheme}-theme`);
    }
    // Ustaw aktywny box na podstawie zapisanego motywu
    const activeColorBox = document.querySelector(`.color-box[data-color="${savedMessageTheme}"]`);
    if (activeColorBox) activeColorBox.classList.add('active');


    // Obsługa zmiany tła czatu
    bgBoxes = document.querySelectorAll('.bg-box');
    bgBoxes.forEach(box => {
        box.addEventListener('click', () => {
            const bgTheme = box.dataset.bg;
            messagesDiv.classList.remove('dark-bg', 'pattern-bg'); // Usuń poprzednie klasy tła
            if (bgTheme !== 'default') {
                messagesDiv.classList.add(`${bgTheme}-bg`); // Dodaj nową klasę tła
            }
            
            // Opcjonalnie: zapisz wybór do localStorage
            localStorage.setItem('chatBackgroundTheme', bgTheme);

            // Aktywuj wybrany box
            bgBoxes.forEach(bb => bb.classList.remove('active'));
            box.classList.add('active');
        });
    });
    // Wczytaj zapisane tło po załadowaniu
    const savedBackgroundTheme = localStorage.getItem('chatBackgroundTheme') || 'default';
    if (savedBackgroundTheme !== 'default') {
        messagesDiv.classList.add(`${savedBackgroundTheme}-bg`);
    }
    // Ustaw aktywny box na podstawie zapisanego tła
    const activeBgBox = document.querySelector(`.bg-box[data-bg="${savedBackgroundTheme}"]`);
    if (activeBgBox) activeBgBox.classList.add('active');


    // Obsługa ustawiania nicku
    nicknameInput = document.getElementById('nicknameInput');
    setNicknameButton = document.getElementById('setNicknameButton');
    if (setNicknameButton) {
        setNicknameButton.addEventListener('click', async () => {
            const newNickname = nicknameInput.value.trim();
            if (newNickname) {
                // TUTAJ: Implementacja zapisywania nicku do profilu użytkownika w Supabase
                // Prawdopodobnie będziesz musiał zmodyfikować funkcję `updateProfile` lub podobną
                // w `profiles.js` lub bezpośrednio tutaj, jeśli nie masz takiej funkcji.
                // Przykład (jeśli `profiles.js` ma funkcję `updateCurrentUserProfile`):
                // const { error } = await updateCurrentUserProfile({ nickname: newNickname });
                // if (!error) {
                //     alert('Nick zmieniony!');
                //     // Odśwież kontakty, aby nick się zaktualizował wszędzie
                //     await loadAllProfiles(); 
                //     await loadContacts();
                //     if (currentChatUser) {
                //         document.getElementById('chatUserName').textContent = getUserLabelById(currentChatUser.id) || currentChatUser.email;
                //     }
                // } else {
                //     console.error("Błąd zapisu nicku:", error.message);
                //     alert("Nie udało się zapisać nicku.");
                // }
                alert('Funkcja zmiany nicku niezaimplementowana.'); // Usuń po implementacji
            }
        });
    }

    // Obsługa wyszukiwania wiadomości
    messageSearchInput = document.getElementById('messageSearchInput');
    searchMessagesButton = document.getElementById('searchMessagesButton');
    if (searchMessagesButton) {
        searchMessagesButton.addEventListener('click', () => {
            const searchText = messageSearchInput.value.trim().toLowerCase();
            if (searchText) {
                // TUTAJ: Implementacja wyszukiwania wiadomości w aktualnym czacie
                // To wymagałoby przechowywania wiadomości w pamięci lub ponownego ich pobierania
                // i filtrowania.
                // Przykład (bardzo uproszczony, tylko dla już załadowanych wiadomości):
                const allMessages = messagesDiv.querySelectorAll('.message');
                allMessages.forEach(msgDiv => {
                    const msgText = msgDiv.textContent.toLowerCase();
                    if (msgText.includes(searchText)) {
                        msgDiv.style.backgroundColor = 'yellow'; // Podświetl
                        msgDiv.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    } else {
                        msgDiv.style.backgroundColor = ''; // Usuń podświetlenie
                    }
                });
                alert('Funkcja wyszukiwania wiadomości niezaimplementowana.'); // Usuń po implementacji
            }
        });
    }

    // Obsługa przycisków załącznika i emoji (obecnie tylko alert)
    const attachButton = document.querySelector('.attach-button');
    const emojiButton = document.querySelector('.emoji-button');

    if (attachButton) {
        attachButton.addEventListener('click', () => {
            alert('Funkcja załączania plików niezaimplementowana!');
        });
    }

    if (emojiButton) {
        emojiButton.addEventListener('click', () => {
            alert('Funkcja wyboru emoji niezaimplementowana!');
        });
    }

    // Zamknięcie dropdownów po kliknięciu poza nimi
    document.addEventListener('click', (event) => {
        if (dropdownMenu && !dropdownMenu.contains(event.target) && !menuButton.contains(event.target)) {
            dropdownMenu.classList.add('hidden');
            menuButton.setAttribute('aria-expanded', false);
        }
        if (chatSettingsDropdown && !chatSettingsDropdown.contains(event.target) && !chatSettingsButton.contains(event.target)) {
            chatSettingsDropdown.classList.add('hidden');
        }
    });
}


function initDarkMode() {
    themeToggle = document.getElementById('themeToggle'); // Ten element jest teraz w dropdownie
    // Tutaj nie pobieramy już bezpośrednio themeToggle, bo jest w dropdownie
    // Powinien być obsługiwany przez setupNewUIListeners
    
    // Jeśli nie przeniosłeś themeToggle do dropdownu, ale jest w main-header, to ten kod poniżej zadziała
    // w zależności od Twojego finalnego HTML.
    
    // Zostawiam ten blok, ale pamiętaj, że przycisk themeToggle jest teraz w dropdownMenu
    // i jego event listener powinien być dodany w setupNewUIListeners, aby dropdownMenu działało poprawnie.
    // Zmieniam to tak, aby pobierał go z dropdownu.
    
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark') {
        body.classList.add('dark-mode');
    }

    // Usunięcie tego event listenera stąd, zostanie przeniesiony do setupNewUIListeners
    // if (themeToggle) {
    //     themeToggle.addEventListener('click', () => {
    //         body.classList.toggle('dark-mode');
    //         if (body.classList.contains('dark-mode')) {
    //             localStorage.setItem('theme', 'dark');
    //         } else {
    //             localStorage.setItem('theme', 'light');
    //         }
    //     });
    // }
}


export async function initChatApp() {
    contactsList = document.getElementById('contactsList');
    messagesDiv = document.getElementById('messageContainer');
    inputMsg = document.getElementById('messageInput');
    sendBtn = document.getElementById('sendButton');

    logoScreen = document.getElementById('logoScreen');
    chatArea = document.getElementById('chatArea');
    backButton = document.getElementById('backButton');
    
    // NOWE POBIERANIE ELEMENTÓW
    chatUserNameSpan = document.getElementById('chatUserName');
    userStatusSpan = document.getElementById('userStatus');
    typingStatusDiv = document.getElementById('typingStatus'); // Stary element "typing-status"
    typingIndicatorDiv = document.getElementById('typingIndicator'); // Nowy element animacji
    
    initDarkMode(); // Uruchomienie trybu ciemnego (sprawdza tylko localStorage)
    setupNewUIListeners(); // Uruchomienie listenerów dla nowych elementów UI, w tym themeToggle

    // Pobierz aktualnego usera (Supabase auth)
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
        window.location.href = 'login.html';
        return;
    }
    currentUser = session.user;

    await loadAllProfiles();
    await loadContacts();
    setupSendMessage();
    initWebSocket();

    // Odświeżanie profili co 10 minut
    setInterval(loadAllProfiles, 10 * 60 * 1000);

    // Domyślny stan po załadowaniu
    logoScreen.classList.remove('hidden');
    chatArea.classList.remove('active');
    // backButton.classList.remove('show'); // Ta klasa powinna być dodana tylko na mobilnym

    inputMsg.disabled = true;
    sendBtn.disabled = true;

    // Obsługa przycisku "Wróć" (na mobilnym)
    backButton.addEventListener('click', () => {
        chatArea.classList.remove('active');
        logoScreen.classList.remove('hidden');
        backButton.classList.remove('show-on-mobile'); // Zmiana klasy na "show-on-mobile"
        messagesDiv.innerHTML = '';
        inputMsg.disabled = true;
        sendBtn.disabled = true;

        // Opcjonalnie: ukryj menu boczne, jeśli jest otwarte (dla responsywności)
        const sidebarWrapper = document.querySelector('.sidebar-wrapper');
        if (sidebarWrapper) {
            sidebarWrapper.classList.remove('visible');
        }
    });

    // --- NOWA LOGIKA DLA PRZEŁĄCZANIA WIDOKÓW NA MOBILE ---
    // (Ten kod powinien być dodany np. w initChatApp lub w osobnym module responsywności)
    // To jest przykładowa logika, jak można obsłużyć widoczność sidebara na mobile.
    // Będzie to wymagało dostosowania w zależności od implementacji responsywności.
    if (window.innerWidth <= 768) { // Jeśli to jest urządzenie mobilne
        const sidebarWrapper = document.querySelector('.sidebar-wrapper');
        if (sidebarWrapper) {
            sidebarWrapper.classList.add('visible'); // Pokaż sidebar domyślnie na mobile
        }
        // Upewnij się, że chatArea jest ukryta, dopóki kontakt nie zostanie wybrany
        chatArea.classList.remove('active');
        logoScreen.classList.remove('hidden');
    } else {
        // Na desktopie zawsze ukrywaj sidebar po załadowaniu czatu, jeśli chatArea jest widoczna
        const sidebarWrapper = document.querySelector('.sidebar-wrapper');
        if (sidebarWrapper) {
            sidebarWrapper.classList.remove('visible');
        }
    }
    // Event listener dla zmiany rozmiaru okna (do dynamicznego przełączania)
    window.addEventListener('resize', () => {
        if (window.innerWidth <= 768) {
            // Na mobile, jeśli chatArea jest aktywna, ukryj sidebar
            if (chatArea.classList.contains('active')) {
                document.querySelector('.sidebar-wrapper')?.classList.remove('visible');
            } else {
                document.querySelector('.sidebar-wrapper')?.classList.add('visible');
            }
        } else {
            // Na desktopie zawsze widoczny sidebar
            document.querySelector('.sidebar-wrapper')?.classList.remove('visible');
        }
    });

}

async function loadContacts() {
    const { data: users, error } = await supabase.rpc('get_other_users', { current_email: currentUser.email });
    if (error) {
        alert('Błąd ładowania kontaktów');
        console.error('Błąd ładowania kontaktów:', error);
        return;
    }

    contactsList.innerHTML = '';
    users.forEach(user => {
        const li = document.createElement('li');
        li.classList.add('contact');
        li.dataset.id = user.id;
        li.dataset.email = user.email; // Dodaj email do dataset, może być przydatne
        
        // NOWE ELEMENTY W KONTAKTCIE
        li.innerHTML = `
            <img src="https://via.placeholder.com/45" alt="Avatar" class="avatar">
            <div class="contact-info">
                <span class="contact-name">${getUserLabelById(user.id) || user.email}</span>
                <span class="last-message">Brak wiadomości</span>
            </div>
            <div class="contact-meta">
                <span class="last-message-time"></span>
                <span class="unread-count hidden">0</span>
            </div>
        `;
        // Możesz dynamicznie ustawiać status online/offline na podstawie user.status
        // <span class="status ${user.is_online ? 'online' : 'offline'}"></span> (jeśli baza ma pole is_online)
        // W tym HTML status jest tekstem, więc trzeba go aktualizować w JS.
        // Jeśli chcesz kolorową kropkę, musisz zmodyfikować HTML lub CSS.
        
        li.onclick = () => startChatWith(user);
        contactsList.appendChild(li);
    });
}

function getRoomName(user1, user2) {
    return [user1, user2].sort().join('_');
}

async function startChatWith(user) {
    logoScreen.classList.add('hidden');
    chatArea.classList.add('active');
    
    // Pokaż przycisk Wróć na mobile, ukryj sidebar
    if (window.innerWidth <= 768) {
        backButton.classList.add('show-on-mobile');
        document.querySelector('.sidebar-wrapper')?.classList.remove('visible');
    } else {
        backButton.classList.remove('show-on-mobile'); // Na desktopie ten przycisk jest domyślnie ukryty w CSS
    }

    currentChatUser = {
        id: user.id,
        username: getUserLabelById(user.id) || user.email,
        email: user.email,
    };

    messagesDiv.innerHTML = '';
    currentRoom = getRoomName(currentUser.email, currentChatUser.email);

    if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({
            type: 'join',
            name: currentUser.email,
            room: currentRoom,
        }));
    }

    chatUserNameSpan.textContent = currentChatUser.username; // Użyj nowej zmiennej
    // userStatusSpan.textContent = user.is_online ? 'online' : 'offline'; // Zakładając, że `user` ma pole `is_online`
    // userStatusSpan.classList.toggle('online', user.is_online); // Jeśli chcesz kolorową kropkę

    inputMsg.disabled = false;
    sendBtn.disabled = false;
    inputMsg.focus();
}

function setupSendMessage() {
    sendBtn.onclick = () => {
        const text = inputMsg.value.trim();
        if (!text || !currentChatUser || !socket || socket.readyState !== WebSocket.OPEN) return;

        const msgData = {
            type: 'message',
            username: currentUser.email,
            text,
            room: currentRoom,
        };

        console.log("Wysyłanie wiadomości:", msgData);
        socket.send(JSON.stringify(msgData));
        inputMsg.value = '';
        inputMsg.focus();
    };

    inputMsg.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            sendBtn.click();
        }
        // DODANIE LOGIKI TYPING INDICATOR
        // Musisz wysłać event 'typing' do serwera WebSocket
        // I obsłużyć odebrane eventy 'typing' w onmessage
        // To wymaga zmian po stronie serwera WebSocket!
        // Przykład (bardzo uproszczony):
        // if (socket && socket.readyState === WebSocket.OPEN && currentRoom) {
        //     socket.send(JSON.stringify({
        //         type: 'typing',
        //         username: currentUser.email,
        //         room: currentRoom
        //     }));
        // }
    });
}

function addMessageToChat(msg) {
    console.log("Dodawanie wiadomości do interfejsu:", msg);

    const label = (msg.username === currentUser.email)
        ? 'Ty' // Możesz użyć 'Ty' lub nazwy użytkownika, np. currentUser.username
        : getUserLabelById(msg.username) || msg.username;

    const div = document.createElement('div');
    div.classList.add('message', msg.username === currentUser.email ? 'sent' : 'received');

    let timePart = '';
    let timestamp = new Date(msg.inserted_at || Date.now()); // Użyj Date.now() dla wiadomości wysłanych teraz
    timePart = `<span class="timestamp">${timestamp.toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" })}</span>`;
    
    // Nowa struktura HTML dla wiadomości (bez username w dymku)
    div.innerHTML = `${msg.text}${timePart}`;
    messagesDiv.appendChild(div);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

function updateUserStatusIndicator(userId, isOnline) {
    const contactEl = document.querySelector(`.contact[data-id="${userId}"]`);
    if (contactEl) {
        // Jeśli status ma być wizualizowany jako kropka (w CSS to masz):
        const statusSpan = contactEl.querySelector('.status'); // Zakładam, że w HTML kontaktu jest <span class="status">
        if (statusSpan) {
            statusSpan.classList.toggle('online', isOnline);
            statusSpan.classList.toggle('offline', !isOnline);
        }
    }
    
    // Zaktualizuj status w nagłówku czatu
    if (currentChatUser && currentChatUser.id === userId) {
        if (userStatusSpan) {
            userStatusSpan.textContent = isOnline ? 'online' : 'offline';
            userStatusSpan.classList.toggle('online', isOnline);
            userStatusSpan.classList.toggle('offline', !isOnline);
        }
    }
}

// NOWA FUNKCJA DO POKAZYWANIA/UKRYWANIA TYPING INDICATOR
// (Będzie wymagać sygnału z serwera WebSocket)
let typingTimeout;
function showTypingIndicator(username) {
    if (typingIndicatorDiv) {
        const label = getUserLabelById(username) || username;
        typingStatusDiv.textContent = `${label} pisze...`; // Stary element 'typing-status'
        typingIndicatorDiv.classList.remove('hidden'); // Nowy element animacji
        clearTimeout(typingTimeout);
        typingTimeout = setTimeout(() => {
            typingIndicatorDiv.classList.add('hidden');
            typingStatusDiv.textContent = '';
        }, 3000); // Ukryj po 3 sekundach braku aktywności
    }
}

function initWebSocket() {
    const wsUrl = import.meta.env.VITE_CHAT_WS_URL;
    socket = new WebSocket(wsUrl);

    socket.onopen = () => {
        console.log('WebSocket połączony');
        reconnectAttempts = 0;

        if (currentRoom && currentUser) {
            socket.send(JSON.stringify({
                type: 'join',
                name: currentUser.email,
                room: currentRoom,
            }));
        }
    };

    socket.onmessage = (event) => {
        const data = JSON.parse(event.data);
        console.log('Odebrano przez WS:', data);

        if (data.type === 'message') {
            addMessageToChat({
                username: data.username,
                text: data.text,
                inserted_at: data.inserted_at,
            });
        }
        // OBSŁUGA NOWEGO TYPU WIADOMOŚCI 'TYPING'
        if (data.type === 'typing') {
            // Upewnij się, że pokazujesz status pisania tylko dla aktualnego czatu
            if (currentChatUser && data.username === currentChatUser.email) {
                showTypingIndicator(data.username);
            }
        }

        if (data.type === 'history' && Array.isArray(data.messages)) {
            console.log("Ładowanie historii wiadomości:", data.messages);
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