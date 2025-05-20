import { createClient } from '@supabase/supabase-js'

// Zmienna środowiskowa Vite
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_KEY
const supabase = createClient(supabaseUrl, supabaseKey)

let ws

// Elementy HTML
const loginForm      = document.getElementById('loginForm')
const signupForm     = document.getElementById('signupForm')
const showSignupBtn  = document.getElementById('showSignup')
const showLoginBtn   = document.getElementById('showLogin')
const authDiv        = document.getElementById('auth')
const userInfoDiv    = document.getElementById('userInfo')
const userEmail      = document.getElementById('userEmail')
const chatDiv        = document.getElementById('chat')
const messagesDiv    = document.getElementById('messages')
const inputMsg       = document.getElementById('inputMsg')
const sendBtn        = document.getElementById('sendBtn')

// Rejestracja
const signupEmail    = document.getElementById('signupEmail')
const signupPassword = document.getElementById('signupPassword')
const signupBtn      = document.getElementById('signupBtn')

signupBtn.onclick = async () => {
  const email = signupEmail.value.trim()
  const password = signupPassword.value.trim()
  if (!email || !password) return alert('Wprowadź email i hasło.')

  const { error } = await supabase.auth.signUp({ email, password })
  if (error) return alert('Błąd rejestracji: ' + error.message)
  alert('Zarejestrowano. Sprawdź email i kliknij link aktywacyjny.')
}

// Logowanie
const emailInput  = document.getElementById('email')
const passInput   = document.getElementById('password')
const loginBtn    = document.getElementById('loginBtn')

loginBtn.onclick = async () => {
  const email = emailInput.value.trim()
  const password = passInput.value.trim()
  if (!email || !password) return alert('Wprowadź email i hasło.')

  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) return alert('Błąd logowania: ' + error.message)

  showUser(data.user)
  connectWebSocket(data.user.email)
}

// Wylogowanie
const logoutBtn = document.getElementById('logoutBtn')
logoutBtn.onclick = async () => {
  await supabase.auth.signOut()
  userInfoDiv.style.display = 'none'
  chatDiv.style.display = 'none'
  authDiv.style.display = 'block'
  messagesDiv.innerHTML = ''
  if (ws) ws.close()
}

// Przełączanie formularzy
showSignupBtn.onclick = () => {
  loginForm.style.display = 'none'
  signupForm.style.display = 'block'
}
showLoginBtn.onclick = () => {
  signupForm.style.display = 'none'
  loginForm.style.display = 'block'
}

// Pokazanie UI po zalogowaniu
function showUser(user) {
  userEmail.textContent = user.email
  authDiv.style.display = 'none'
  userInfoDiv.style.display = 'block'
  chatDiv.style.display = 'block'
}

// Połączenie z WebSocket
function connectWebSocket(email) {
  ws = new WebSocket(import.meta.env.VITE_CHAT_WS_URL)

  ws.onopen = () => {
    ws.send(JSON.stringify({ type: 'join', name: email }))
    inputMsg.disabled = false
    sendBtn.disabled = false
  }

  ws.onmessage = e => {
    try {
      const msg = JSON.parse(e.data)
      const div = document.createElement('div')
      div.textContent = `[${msg.username}] ${msg.text}`
      messagesDiv.appendChild(div)
      messagesDiv.scrollTop = messagesDiv.scrollHeight
    } catch {
      // fallback dla zwykłego tekstu
      const div = document.createElement('div')
      div.textContent = e.data
      messagesDiv.appendChild(div)
    }
  }

  ws.onclose = () => {
    alert('Połączenie z czatem zostało zamknięte.')
    inputMsg.disabled = true
    sendBtn.disabled = true
  }
}

// Wysyłanie wiadomości
sendBtn.onclick = () => {
  const text = inputMsg.value.trim()
  if (text && ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'message', text }))
    inputMsg.value = ''
  }
}

// Sprawdzenie sesji przy starcie
;(async () => {
  const { data: { session } } = await supabase.auth.getSession()
  if (session?.user) {
    showUser(session.user)
    connectWebSocket(session.user.email)
  }
})()
