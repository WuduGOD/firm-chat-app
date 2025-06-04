// vite.config.js
import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        login: 'login.html',
        register: 'register.html',
        chat: 'chat.html'
      }
    }
  }
})

