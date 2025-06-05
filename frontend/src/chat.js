// src/chat.js
import { loadAllProfiles, getUserLabelById } from './profiles.js';
import { supabase } from './supabaseClient.js';

let currentUser       = null;
let currentChatUser   = null;
let currentRoom       = null;

let contactsList;
let messagesDiv;
let inputMsg;
let sendBtn;

let logoScreen;
let chatArea;
let backButton;

let socket = null;

export async function initChatApp() {
  contactsList = document.getElementById('contactsList');
  messagesDiv  = document.getElementById('messageContainer');
  inputMsg     = document.getElementById('messageInput');
  sendBtn      = document.getElementById('sendButton');

  logoScreen   = document.getElementById('logoScreen');
  chatArea     = document.getElementById('chatArea');
  backButton   = document.getElementById('backButton');

  // Pobierz usera z Supabase lub innego systemu autoryzacji (tu przykład Supabase)
  // Jeśli korzystasz z innej metody, zastąp poniższą część odpowiednią logiką
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) {
    window.location.href = 'login.html';
    return;
  }
  currentUser = session.user;

  await loadAllProfiles();

  loadContacts();

  setupSendMessage();

  initWebSocket();

  setInterval(loadAllProfiles, 10 * 60 * 1000);

  logoScreen.classList.remove('hidden');
  chatArea.classList.remove('active');
  backButton.classList.remove('show');

  inputMsg.disabled = true;
  sendBtn.disabled  = true;

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
  // Wczytaj kontakty (użyj własnej metody - tutaj supabase rpc)
  const { data: users, error } = await supabase.rpc('get_other_users', { current_email: currentUser.email });
  if (error) {
    return alert('Błąd ładowania kontaktów');
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
  // Pokój to alfabetyczne połączenie dwóch identyfikatorów (email lub id)
  return [user1, user2].sort().join('_');
}

async function startChatWith(user) {
  logoScreen.classList.add('hidden');
  chatArea.classList.add('active');
  backButton.classList.add('show');

  currentChatUser = { id: user.id, username: getUserLabelById(user.id) };
  messagesDiv.innerHTML = '';

  currentRoom = getRoomName(currentUser.email, user.email);

  // Wyślij join na WebSocket z nazwą pokoju i swoim nazwiskiem
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({
      type: 'join',
      name: currentUser.email,
      room: currentRoom
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
      room: currentRoom
    };

    socket.send(JSON.stringify(msgData));
    inputMsg.value = '';
    inputMsg.focus();

  };
}

function initWebSocket() {
  const wsUrl = import.meta.env.VITE_CHAT_WS_URL;
  socket = new WebSocket(wsUrl);

  socket.onopen = () => {
    console.log('WebSocket połączony');
    // Join wysyłamy po wyborze kontaktu w startChatWith
  };

  socket.onmessage = (event) => {
    const data = JSON.parse(event.data);
    console.log('Odebrano przez WS:', data);

    if (data.type === 'message') {
      addMessageToChat({
        sender: data.sender,
        text: data.text
      });
    }

    if (data.type === 'history' && Array.isArray(data.messages)) {
      data.messages.forEach(msg => addMessageToChat(msg));
    }

    if (data.type === 'info') {
      const div = document.createElement('div');
      div.classList.add('info');
      div.textContent = data.text;
      messagesDiv.appendChild(div);
      messagesDiv.scrollTop = messagesDiv.scrollHeight;
    }
  };

  socket.onclose = () => {
    console.log('WebSocket rozłączony');
  };

  socket.onerror = (error) => {
    console.error('Błąd WebSocket:', error);
  };
}

export { startChatWith };
