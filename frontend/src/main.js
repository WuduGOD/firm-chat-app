import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_KEY
const supabase = createClient(supabaseUrl, supabaseKey)

let ws;

const authDiv     = document.getElementById('auth')
const userInfoDiv = document.getElementById('userInfo')
const chatDiv     = document.getElementById('chat')
const emailInput  = document.getElementById('email')
const passInput   = document.getElementById('password')
const signupBtn   = document.getElementById('signupBtn')
const loginBtn    = document.getElementById('loginBtn')
const logoutBtn   = document.getElementById('logoutBtn')
const userEmail   = document.getElementById('userEmail')
const joinBtn     = document.getElementById('joinBtn')
const roomInput   = document.getElementById('room')
const messagesDiv = document.getElementById('messages')
const inputMsg    = document.getElementById('inputMsg')
const sendBtn     = document.getElementById('sendBtn')

// Rejestracja
signupBtn.onclick = async () => {
  const { error } = await supabase.auth.signUp({
    email: emailInput.value,
    password: passInput.value
  })
  if (error) return alert('Błąd rejestracji: ' + error.message)
  alert('Zarejestrowano. Sprawdź email.')
}

// Logowanie
loginBtn.onclick = async () => {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: emailInput.value,
    password: passInput.value
  })
  if (error) return alert('Błąd logowania: ' + error.message)
  showUser(data.user)
}

// Wylogowanie
logoutBtn.onclick = async () => {
  await supabase.auth.signOut()
  authDiv.style.display = 'block'
  userInfoDiv.style.display = 'none'
  chatDiv.style.display = 'none'
  messagesDiv.innerHTML = ''
}

// Pokaż UI po zalogowaniu
function showUser(user) {
  userEmail.textContent       = user.email
  authDiv.style.display       = 'none'
  userInfoDiv.style.display   = 'block'
  chatDiv.style.display       = 'block'
  messagesDiv.textContent     = ''
}

// Przy starcie sprawdź sesję
;(async () => {
  const { data: { session } } = await supabase.auth.getSession()
  if (session?.user) showUser(session.user)
})()

// Dołącz do czatu
joinBtn.onclick = async () => {
  const room = roomInput.value.trim()
  if (!room) return alert('Podaj pokój')
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return alert('Zaloguj się')

  ws = new WebSocket(import.meta.env.VITE_CHAT_WS_URL)
  ws.onopen = () => {
    ws.send(JSON.stringify({ type: 'join', name: user.email, room }))
    inputMsg.disabled = false
    sendBtn.disabled = false
  }
  ws.onmessage = e => {
    const div = document.createElement('div')
    div.textContent = e.data
    messagesDiv.appendChild(div)
    messagesDiv.scrollTop = messagesDiv.scrollHeight
  }
  ws.onclose = () => alert('Rozłączono')
}

// Wyślij wiadomość
sendBtn.onclick = () => {
  const text = inputMsg.value.trim()
  if (text && ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'message', text }))
    inputMsg.value = ''
  }
}
