// src/auth.js
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_KEY
);

export function setupLogin() {
  document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('loginForm');
    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password');

    if (!form) {
      console.error('Nie znaleziono <form id="loginForm"> w login.html');
      return;
    }
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = emailInput.value.trim();
      const password = passwordInput.value.trim();
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) {
        alert('Błąd logowania: ' + error.message);
      } else {
        window.location.href = '/chat.html';
      }
    });
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        window.location.href = '/chat.html';
      }
    });
  });
}

export function setupRegister() {
  document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('registerForm');
    const emailInput = document.getElementById('email');
    const nicknameInput = document.getElementById('nickname');
    const passwordInput = document.getElementById('password');

    if (!form) {
      console.error('Nie znaleziono <form id="registerForm"> w register.html');
      return;
    }
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = emailInput.value.trim();
      const nickname = nicknameInput.value.trim();
      const password = passwordInput.value.trim();
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { username: nickname },
        },
      });
      if (error) {
        alert('Błąd rejestracji: ' + error.message);
      } else {
        window.location.href = '/';
      }
    });
  });
}
