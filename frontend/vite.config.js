// vite.config.js
import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  base: './', // <-- to jest BARDZO WAŻNE dla poprawnych ścieżek!
  build: {
    rollupOptions: {
      input: {
		index: resolve(__dirname, 'index.html'),
		login: resolve(__dirname, 'login.html'),
        register: resolve(__dirname, 'register.html'),
        chat: resolve(__dirname, 'chat.html')
      }
    }
  }
});
