// src/chat.js
import { supabase } from './supabaseClient.js';
import { loadAllProfiles, getUserLabelById } from './profiles.js';

// Dodaliśmy nowe zmienne dla elementów ekranu powitalnego, panelu czatu i przycisku "Wróć"
let currentUser       = null;
let currentChatUser   = null;
let contactsList;
let messagesDiv;
let inputMsg;
let sendBtn;

let logoScreen;   // referencja do ekranu powitalnego
let chatArea;     // referencja do panelu czatu
let backButton;   // referencja do przycisku "Wróć"

export async function initChatApp() {
  // 1) Pobieramy elementy DOM
  contactsList = document.getElementById('contactsList');
  messagesDiv  = document.getElementById('messageContainer');
  inputMsg     = document.getElementById('messageInput');
  sendBtn      = document.getElementById('sendButton');

  logoScreen   = document.getElementById('logoScreen');    // nowa linia
  chatArea     = document.getElementById('chatArea');      // nowa linia
  backButton   = document.getElementById('backButton');    // nowa linia

  // 2) Sprawdź sesję Supabase
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) {
    window.location.href = 'login.html';
    return;
  }
  currentUser = session.user;

  // 3) Załaduj wszystkie profile do cache’u
  await loadAllProfiles();

  // 4) Narysuj listę kontaktów
  loadContacts();

  // 5) Ustaw obsługę przycisku „Wyślij”
  setupSendMessage();

  // 6) Subskrybuj realtime
  subscribeToMessages(currentUser);

  // 7) Odświeżaj cache profili co 10 minut
  setInterval(loadAllProfiles, 10 * 60 * 1000);

  // 8) Na start: ekran powitalny widoczny, panel czatu ukryty, przycisk "Wróć" ukryty
  logoScreen.classList.remove('hidden');   // usuwamy klasę hidden (wcześniej nie było)
  chatArea.classList.remove('active');     // usuwamy klasę active (panel czatu niewidoczny)
  backButton.classList.remove('show');     // usuwamy klasę show (przycisk "Wróć" ukryty)

  // 9) Zablokuj na początek input i przycisk
  inputMsg.disabled = true;
  sendBtn.disabled  = true;

  // 10) Obsługa przycisku "Wróć"
  backButton.addEventListener('click', () => {
    chatArea.classList.remove('active');     // ukrywamy panel czatu
    logoScreen.classList.remove('hidden');   // pokazujemy ekran powitalny
    backButton.classList.remove('show');     // chowamy przycisk "Wróć"
    messagesDiv.innerHTML = '';              // czyścimy historię wiadomości
    inputMsg.disabled = true;                // blokujemy input
    sendBtn.disabled  = true;                // blokujemy przycisk Wyślij
  });
}

async function loadContacts() {
  const { data: users, error } = await supabase
    .rpc('get_other_users', { current_email: currentUser.email });
  if (error) {
    return alert('Błąd ładowania kontaktów');
  }

  contactsList.innerHTML = '';
  users.forEach(user => {
    const li = document.createElement('li');
    li.classList.add('contact');                // dodajemy klasę .contact (żeby działał efekt hover i cursor:pointer)
    li.dataset.id = user.id;
    li.textContent = getUserLabelById(user.id);
    li.onclick = () => startChatWith(user);
    contactsList.appendChild(li);
  });
}

async function startChatWith(user) {
  // A) Przełączamy widok: ukrywamy logoScreen, pokazujemy chatArea, pokazujemy przycisk "Wróć"
  logoScreen.classList.add('hidden');
  chatArea.classList.add('active');
  backButton.classList.add('show');

  currentChatUser = { id: user.id, username: getUserLabelById(user.id) };
  messagesDiv.innerHTML = '';

  const { data: sent, error: err1 } = await supabase
    .from('messages')
    .select('*')
    .eq('sender',   currentUser.id)
    .eq('receiver', user.id);

  const { data: received, error: err2 } = await supabase
    .from('messages')
    .select('*')
    .eq('sender',   user.id)
    .eq('receiver', currentUser.id);

  if (err1 || err2) {
    console.error('Błąd ładowania wiadomości:', err1 || err2);
    return alert('Błąd ładowania wiadomości');
  }

  const allMessages = [...sent, ...received]
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

  for (const msg of allMessages) {
    await addMessageToChat(msg);
  }

  messagesDiv.scrollTop = messagesDiv.scrollHeight;

  // Ustawiamy nagłówek czatu, odblokowujemy input i przycisk Wyślij
  document.getElementById('chatUserName').textContent = currentChatUser.username;
  inputMsg.disabled = false;
  sendBtn.disabled = false;
  inputMsg.focus();
}

function setupSendMessage() {
  sendBtn.onclick = async () => {
    const text = inputMsg.value.trim();
    if (!text || !currentChatUser) return;

    const { error } = await supabase
      .from('messages')
      .insert({
        sender:   currentUser.id,
        receiver: currentChatUser.id,
        text
      });

    if (error) return alert('Błąd wysyłania');

    inputMsg.value = '';
    inputMsg.focus();
  };
}

async function addMessageToChat(msg) {
  const label = (msg.sender === currentUser.id)
    ? 'Ty'
    : getUserLabelById(msg.sender);

  const div = document.createElement('div');
  // Nadajemy odpowiednie klasy .message i .sent/.received, aby zadziałał styl bąbelków
  if (msg.sender === currentUser.id) {
    div.classList.add('message', 'sent');
  } else {
    div.classList.add('message', 'received');
  }
  div.textContent = `${label}: ${msg.text}`;

  messagesDiv.appendChild(div);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

let channel = null;
function subscribeToMessages(user) {
  if (channel) {
    channel.unsubscribe();
  }

  channel = supabase.channel(`messages_channel_${user.id}`);

  channel
    .on('postgres_changes', {
      event:  'INSERT',
      schema: 'public',
      table:  'messages',
      filter: `receiver=eq.${user.id}`
    }, async (payload) => {
      const msg = payload.new;
      if (
        currentChatUser &&
        ((msg.sender === currentChatUser.id && msg.receiver === currentUser.id) ||
         (msg.sender === currentUser.id       && msg.receiver === currentChatUser.id))
      ) {
        await addMessageToChat(msg);
      }
    })
    .on('postgres_changes', {
      event:  'INSERT',
      schema: 'public',
      table:  'messages',
      filter: `sender=eq.${user.id}`
    }, async (payload) => {
      const msg = payload.new;
      if (
        currentChatUser &&
        ((msg.sender === currentUser.id && msg.receiver === currentChatUser.id) ||
         (msg.sender === currentChatUser.id && msg.receiver === currentUser.id))
      ) {
        await addMessageToChat(msg);
      }
    })
    .subscribe();
}

export { startChatWith };
