import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_KEY
const supabase = createClient(supabaseUrl, supabaseKey)

let currentUser
let currentChatUser

// Elementy interfejsu
const authDiv = document.getElementById('auth')
const userInfoDiv = document.getElementById('userInfo')
const chatDiv = document.getElementById('chat')
const contactsDiv = document.getElementById('contacts')
const emailInput = document.getElementById('email')
const passwordInput = document.getElementById('password')
const signupBtn = document.getElementById('signupBtn')
const loginBtn = document.getElementById('loginBtn')
const logoutBtn = document.getElementById('logoutBtn')
const userEmail = document.getElementById('userEmail')

const contactsList = document.getElementById('contactsList')
const messagesDiv = document.getElementById('messages')
const inputMsg = document.getElementById('inputMsg')
const sendBtn = document.getElementById('sendBtn')

// Rejestracja
signupBtn.onclick = async () => {
  const email = emailInput.value.trim()
  const password = passwordInput.value.trim()

  if (!email || !password) {
    alert('Wpisz email i hasło')
    return
  }

  const { data, error } = await supabase.auth.signUp({ email, password })

  if (error) {
    alert('Błąd rejestracji: ' + error.message)
  } else {
    // ⬇️ Dodaj do tabeli `profiles`
    const userId = data.user?.id
    if (userId) {
      await supabase.from('profiles').insert([
        { id: userId, email }
      ])
    }
    alert('Zarejestrowano! Sprawdź email i kliknij link aktywacyjny.')
  }
}

// Logowanie
loginBtn.onclick = async () => {
  const email = emailInput.value.trim()
  const password = passwordInput.value.trim()

  if (!email || !password) {
    alert('Wpisz email i hasło')
    return
  }

  const { data, error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    alert('Błąd logowania: ' + error.message)
    return
  }

  const user = data.user

  // Spróbuj pobrać profil
  const { data: existingProfile, error: profileError } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle()

  // Jeśli brak profilu – dodaj
  if (!existingProfile) {
    const { error: insertError } = await supabase.from('profiles').insert({
      id: user.id,
      email: user.email
    })
    if (insertError) {
      console.error('Błąd dodawania profilu:', insertError.message)
    }
  }

  showUser(user)
}

// Wylogowanie
logoutBtn.onclick = async () => {
  await supabase.auth.signOut()
  currentUser = null
  currentChatUser = null
  authDiv.style.display = 'block'
  userInfoDiv.style.display = 'none'
  contactsDiv.style.display = 'none'
  chatDiv.style.display = 'none'
  messagesDiv.innerHTML = ''
}

// Pokazuje zalogowanego użytkownika
function showUser(user) {
  currentUser = user
  userEmail.textContent = user.email
  authDiv.style.display = 'none'
  userInfoDiv.style.display = 'block'
  contactsDiv.style.display = 'block'
  chatDiv.style.display = 'block';
  loadContacts()
}

// Załaduj innych użytkowników
async function loadContacts() {
  const { data: users, error } = await supabase.rpc('get_other_users', { current_email: currentUser.email })
  // Fallback jeśli nie masz funkcji RPC:
  // const { data: users, error } = await supabase.from('profiles').select('email')

  if (error) return alert('Błąd ładowania kontaktów')

  contactsList.innerHTML = ''
  users.forEach(user => {
    const li = document.createElement('li')
	li.dataset.id = user.id
    li.textContent = user.email
    li.onclick = () => startChatWith(user)
    contactsList.appendChild(li)
  })
}

// Rozpocznij rozmowę
async function startChatWith(user) {
  currentChatUser = { id: user.id, email: user.email };
  messagesDiv.innerHTML = '';
  chatDiv.style.display = 'block';

  const { data: sent, error: err1 } = await supabase
    .from('messages')
    .select('*')
    .eq('sender', currentUser.id)
    .eq('receiver', user.id);
	
  function getUserNameById(id) {
    if (id === currentUser.id) return 'Ty'
    if (currentChatUser && id === currentChatUser.id) return currentChatUser.email
    return id  // fallback, gdy nieznany
}


  const { data: received, error: err2 } = await supabase
    .from('messages')
    .select('*')
    .eq('sender', user.id)
    .eq('receiver', currentUser.id);

  if (err1 || err2) {
    console.error('Błąd ładowania wiadomości:', err1 || err2);
    return alert('Błąd ładowania wiadomości');
  }

  const allMessages = [...sent, ...received].sort((a, b) =>
    new Date(a.created_at) - new Date(b.created_at)
  );

  allMessages.forEach(msg => {
    const div = document.createElement('div');
    div.textContent = `${getUserNameById(msg.sender)}: ${msg.text}`;
    messagesDiv.appendChild(div);
  });

  messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

// Wysyłanie wiadomości
sendBtn.onclick = async () => {
  const text = inputMsg.value.trim()
  if (!text || !currentChatUser) return

  const { error } = await supabase.from('messages').insert({
    sender: currentUser.id,
    receiver: currentChatUser.id,
    text
  })

  if (error) return alert('Błąd wysyłania')

  inputMsg.value = ''
}

function addMessageToChat(text) {
  const div = document.createElement('div')
  let label = 'Ty'

  if (msg.sender !== currentUser.id) {
    // Pobierz email nadawcy
    const { data: profile } = await supabase
      .from('profiles')
      .select('email')
      .eq('id', msg.sender)
      .maybeSingle()

    label = profile?.email || msg.sender
}

  const div = document.createElement('div')
  div.textContent = `${label}: ${msg.text}`
  messagesDiv.appendChild(div)
  messagesDiv.scrollTop = messagesDiv.scrollHeight

  messagesDiv.scrollTop = messagesDiv.scrollHeight
}

function subscribeToMessages(user) {
  const channel = supabase.channel(`messages_channel_${user.id}`)

  channel
    // Wiadomości, które TY otrzymujesz
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'messages',
      filter: `receiver=eq.${user.id}`
    }, async (payload) => {
      const msg = payload.new

      // Czy rozmowa dotyczy aktualnie otwartego chatu
      if (msg.sender === currentChatUser?.id) {
        const { data: senderProfile } = await supabase
          .from('profiles')
          .select('email')
          .eq('id', msg.sender)
          .single()

        const senderEmail = senderProfile?.email || msg.sender
        addMessageToChat(`${senderEmail}: ${msg.text}`)
      }
    })

    // Wiadomości, które TY wysyłasz (żeby pojawiały się u Ciebie od razu)
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'messages',
      filter: `sender=eq.${user.id}`
    }, (payload) => {
      const msg = payload.new
      if (msg.receiver === currentChatUser?.id) {
        addMessageToChat(`Ty: ${msg.text}`)
      }
    })

    .subscribe()
}

// Sprawdź sesję przy starcie
;(async () => {
  const { data: { session } } = await supabase.auth.getSession()
  if (session?.user) {
    showUser(session.user)
	subscribeToMessages(session.user)
  }
})()
