import './style.css';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_KEY
);

console.log('► login-entry.js załadowany');

document.addEventListener('DOMContentLoaded', () => {
  // Pobierz elementy formularza logowania
  const form = document.getElementById('loginForm');
  const emailInput = document.getElementById('email');
  const passwordInput = document.getElementById('password');

  if (!form) {
    console.error('❌ Nie znaleziono <form id="loginForm"> w login.html');
    return;
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const email = emailInput.value.trim();
    const password = passwordInput.value.trim();

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      alert('Błąd logowania: ' + error.message);
    } else {
      window.location.href = '/chat.html';
    }
  });
});
