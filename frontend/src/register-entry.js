import './style.css';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_KEY
);

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('registerForm');
  const emailInput = document.getElementById('email');
  const nicknameInput = document.getElementById('nickname');
  const passwordInput = document.getElementById('password');

  if (!form) {
    console.error('❌ Nie znaleziono <form id="registerForm"> w register.html');
    return;
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const email = emailInput.value.trim();
    const nickname = nicknameInput.value.trim();
    const password = passwordInput.value.trim();

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { username: nickname }
      }
    });

    if (error) {
      alert('Błąd rejestracji: ' + error.message);
    } else {
      window.location.href = '/';
    }
  });
});
