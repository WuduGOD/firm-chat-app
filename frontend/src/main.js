import { setupLogin } from './auth.js'
import { setupRegister } from './auth.js'
import { initChatApp } from './chat.js'
import './style.css'

const path = window.location.pathname

if (path.endsWith('login.html')) {
  setupLogin()
} else if (path.endsWith('register.html')) {
  setupRegister()
} else if (path.endsWith('chat.html')) {
  initChatApp()
}
