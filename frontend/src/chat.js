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

export async function initChatApp() {
  contactsList = document.getElementById('contactsList');
  messagesDiv = document.getElementById('messageContainer');
  inputMsg = document.getElementById('messageInput');
  sendBtn = document.getElementById('sendButton');

  logoScreen = document.getElementById('logoScreen');
  chatArea = document.getElementById('chatArea');
  backButton = document.getElementById('backButton');

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

  logoScreen.classList.remove('hidden');
  chatArea.classList.remove('active');
  backButton.classList.remove('show');

  inputMsg.disabled = true;
  sendBtn.disabled = true;

  backButton.addEventListener('click', () => {
    chatArea.classList.remove('active');
    logoScreen.classList.remove('hidden');
    backButton.classList.remove('show');
    messagesDiv.innerHTML = '';
    inputMsg.disabled = true;
    sendBtn.disabled = true;
  });
}

async function loadContacts() {
  // Pobierz kontakty — zakładam, że masz supabase rpc get_other_users
  const { data: users, error } = await supabase.rpc('get_other_users', { current_email: currentUser.email });
  if (error) {
    alert('Błąd ładowania kontaktów');
    return;
  }

  contactsList.innerHTML = '';
  users.forEach(user => {
    const li = document.createElement('li');
    li.classList.add('contact');
    li.dataset.id = user.id;
    li.textContent = getUserLabelById(user.id);
    li.onclick = () => startChatWith(user);
    contactsList.appendChild(li);
  });
}

function getRoomName(user1, user2) {
  // Nazwa pokoju to alfabetyczne połączenie dwóch adresów email
  return [user1, user2].sort().join('_');
}

async function startChatWith(user) {
  logoScreen.classList.add('hidden');
  chatArea.classList.add('active');
  backButton.classList.add('show');

  currentChatUser = {
    id: user.id,
    username: getUserLabelById(user.id),
    email: user.email,
  };

  messagesDiv.innerHTML = '';
  currentRoom = getRoomName(currentUser.email, currentChatUser.email);

  // Jeżeli WebSocket jest już połączony, wysyłamy event join
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({
      type: 'join',
      name: currentUser.email,
      room: currentRoom,
    }));
  }

  document.getElementById('chatUserName').textContent = currentChatUser.username;
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
      text,
      room: currentRoom,
    };

    socket.send(JSON.stringify(msgData));
    inputMsg.value = '';
    inputMsg.focus();
  };

  // Obsługa wysyłania wiadomości po naciśnięciu Enter
  inputMsg.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      sendBtn.click();
    }
  });
}

/**
 * Renderuje pojedynczą wiadomość. Jeśli obiekt wiadomości zawiera pole inserted_at,
 * formatujemy czas (HH:MM). Rozdziela wiadomości wysłane przez bieżącego użytkownika i te odebrane.
 */
function addMessageToChat(msg) {
  const label = (msg.sender === currentUser.email)
    ? 'Ty'
    : getUserLabelById(msg.sender) || msg.sender;

  const div = document.createElement('div');
  div.classList.add('message', msg.sender === currentUser.email ? 'sent' : 'received');

  // Jeśli mamy pole inserted_at, formatujemy datę/godzinę
  let timePart = '';
  if (msg.inserted_at) {
    const dateObj = new Date(msg.inserted_at);
    timePart = ` <span class="time">${dateObj.toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" })}</span>`;
  }

  div.innerHTML = `<strong>${label}</strong>: ${msg.text}${timePart}`;
  messagesDiv.appendChild(div);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

function updateUserStatusIndicator(userId, isOnline) {
  const contactEl = document.querySelector(`.contact[data-id="${userId}"]`);
  if (!contactEl) return;

  contactEl.classList.toggle('online', isOnline);
}

/**
 * Inicjalizuje połączenie WebSocket z mechanizmem auto-reconnect.
 * Używa zmiennej wsUrl z środowiska (Vite).
 */
function initWebSocket() {
  const wsUrl = import.meta.env.VITE_CHAT_WS_URL;
  socket = new WebSocket(wsUrl);

  socket.onopen = () => {
    console.log('WebSocket połączony');
    reconnectAttempts = 0;

    // Jeśli aktualnie prowadzisz rozmowę, dołącz do pokoju
    if (currentRoom && currentUser) {
      socket.send(JSON.stringify({
        type: 'join',
        name: currentUser.email,
        room: currentRoom
      }));
    }
  };

  socket.onmessage = (event) => {
    const data = JSON.parse(event.data);
    console.log('Odebrano przez WS:', data);

    if (data.type === 'message') {
      addMessageToChat({
        sender: data.username || data.sender,
        text: data.text,
        inserted_at: data.inserted_at,
      });
    }

    if (data.type === 'history' && Array.isArray(data.messages)) {
      // Wczytaj historię wiadomości – każde z nich powinno zawierać inserted_at
      data.messages.forEach((msg) => addMessageToChat(msg));
    }

    if (data.type === 'status') {
      // Aktualizujemy status użytkowników, przekazując identyfikator lub email
      updateUserStatusIndicator(data.user, data.online);
    }
  };

  socket.onclose = () => {
    console.log('WebSocket rozłączony. Próba ponownego połączenia...');
    // Auto reconnect z progresywnym timeoutem (maks 10 sekund)
    setTimeout(initWebSocket, Math.min(1000 * ++reconnectAttempts, 10000));
  };

  socket.onerror = (error) => {
    console.error('Błąd WebSocket:', error);
  };
}

export { startChatWith };