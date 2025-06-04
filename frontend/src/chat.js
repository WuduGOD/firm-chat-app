import { supabase } from './supabaseClient.js'
import { loadAllProfiles, getUserLabelById } from './profiles.js'

let currentUser = null
let currentChatUser = null

const contactsList = document.getElementById('contactsList')
const messagesDiv = document.getElementById('messages')
const inputMsg = document.getElementById('inputMsg')
const sendBtn = document.getElementById('sendBtn')

export async function initChatApp() {
  // Pobierz sesję
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.user) {
    window.location.href = 'login.html'
    return
  }
  currentUser = session.user

  await loadAllProfiles()
  loadContacts()
  setupSendMessage()

  subscribeToMessages(currentUser)

  // Odświeżanie profili
  setInterval(loadAllProfiles, 10 * 60 * 1000)
}

async function loadContacts() {
  const { data: users, error } = await supabase.rpc('get_other_users', { current_email: currentUser.email })
  if (error) return alert('Błąd ładowania kontaktów')

  contactsList.innerHTML = ''
  users.forEach(user => {
    const li = document.createElement('li')
    li.dataset.id = user.id
    li.textContent = getUserLabelById(user.id)
    li.onclick = () => startChatWith(user)
    contactsList.appendChild(li)
  })
}

async function startChatWith(user) {
  currentChatUser = { id: user.id, username: getUserLabelById(user.id) }
  messagesDiv.innerHTML = ''

  const { data: sent, error: err1 } = await supabase
    .from('messages')
    .select('*')
    .eq('sender', currentUser.id)
    .eq('receiver', user.id)

  const { data: received, error: err2 } = await supabase
    .from('messages')
    .select('*')
    .eq('sender', user.id)
    .eq('receiver', currentUser.id)

  if (err1 || err2) {
    console.error('Błąd ładowania wiadomości:', err1 || err2)
    return alert('Błąd ładowania wiadomości')
  }

  const allMessages = [...sent, ...received].sort((a, b) => new Date(a.created_at) - new Date(b.created_at))

  for (const msg of allMessages) {
    await addMessageToChat(msg)
  }

  messagesDiv.scrollTop = messagesDiv.scrollHeight
}

function setupSendMessage() {
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
}

async function addMessageToChat(msg) {
  const label = msg.sender === currentUser.id ? 'Ty' : getUserLabelById(msg.sender)
  const div = document.createElement('div')
  div.textContent = `${label}: ${msg.text}`
  messagesDiv.appendChild(div)
  messagesDiv.scrollTop = messagesDiv.scrollHeight
}

let channel = null

function subscribeToMessages(user) {
  if (channel) {
    channel.unsubscribe()
  }

  channel = supabase.channel(`messages_channel_${user.id}`)

  channel
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'messages',
      filter: `receiver=eq.${user.id}`
    }, async (payload) => {
      const msg = payload.new
      if (
        currentChatUser &&
        ((msg.sender === currentChatUser.id && msg.receiver === currentUser.id) ||
          (msg.sender === currentUser.id && msg.receiver === currentChatUser.id))
      ) {
        await addMessageToChat(msg)
      }
    })
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'messages',
      filter: `sender=eq.${user.id}`
    }, async (payload) => {
      const msg = payload.new
      if (
        currentChatUser &&
        ((msg.sender === currentUser.id && msg.receiver === currentChatUser.id) ||
          (msg.sender === currentChatUser.id && msg.receiver === currentUser.id))
      ) {
        await addMessageToChat(msg)
      }
    })
    .subscribe()
}

export { startChatWith }
