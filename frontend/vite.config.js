import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        login: resolve(__dirname, 'login.html'),
        register: resolve(__dirname, 'register.html'),
        chat: resolve(__dirname, 'chat.html')
      }
    }
  }
});
