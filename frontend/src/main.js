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
  currentChatUser = { id: userId, email: userEmail };
  messagesDiv.innerHTML = ''
  chatDiv.style.display = 'block'

  // 1. Pobierz wiadomości ode mnie do wybranego
  const { data: sent, error: err1 } = await supabase
    .from('messages')
    .select('*')
    .eq('sender', currentUser.id)
    .eq('receiver', user.id)

  // 2. Pobierz wiadomości od wybranego do mnie
  const { data: received, error: err2 } = await supabase
    .from('messages')
    .select('*')
    .eq('sender', user.id)
    .eq('receiver', currentUser.id)

  if (err1 || err2) {
    console.error('Błąd ładowania wiadomości:', err1 || err2)
    return alert('Błąd ładowania wiadomości')
  }

  // 3. Połącz obie tablice i posortuj po created_at
  const allMessages = [...sent, ...received].sort((a, b) =>
    new Date(a.created_at) - new Date(b.created_at)
  )

  // 4. Wyświetl je w oknie czatu
  allMessages.forEach(msg => {
    const div = document.createElement('div')
    div.textContent = `${msg.sender === currentUser.email ? 'Ty' : msg.sender}: ${msg.text}`
    messagesDiv.appendChild(div)
  })

  messagesDiv.scrollTop = messagesDiv.scrollHeight
}

  // 3. Połącz i posortuj wg daty
  const all = [...sent, ...received]
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))

  // 4. Wyświetl
  all.forEach(msg => {
    const div = document.createElement('div')
    div.textContent = `${msg.sender === currentUser.email ? 'Ty' : msg.sender}: ${msg.text}`
    messagesDiv.appendChild(div)
  })

  messagesDiv.scrollTop = messagesDiv.scrollHeight
}

  if (error) return alert('Błąd ładowania wiadomości')

  data.forEach(msg => {
    const div = document.createElement('div')
    div.textContent = `${msg.sender === currentUser.email ? 'Ty' : msg.sender}: ${msg.text}`
    messagesDiv.appendChild(div)
  })

  messagesDiv.scrollTop = messagesDiv.scrollHeight
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

  const div = document.createElement('div')
  div.textContent = `Ty: ${text}`
  messagesDiv.appendChild(div)
  inputMsg.value = ''
  messagesDiv.scrollTop = messagesDiv.scrollHeight
}

// Sprawdź sesję przy starcie
;(async () => {
  const { data: { session } } = await supabase.auth.getSession()
  if (session?.user) {
    showUser(session.user)
  }
})()
