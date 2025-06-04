import { supabase } from './supabaseClient.js'

export function setupRegister() {
  const emailInput = document.getElementById('email')
  const passwordInput = document.getElementById('password')
  const usernameInput = document.getElementById('username')
  const signupBtn = document.getElementById('signupBtn')

  signupBtn.onclick = async () => {
    const email = emailInput.value.trim()
    const password = passwordInput.value.trim()
    const username = usernameInput.value.trim()
    if (!email || !password || !username) {
      alert('Wpisz email, hasło i nick')
      return
    }
    const { data, error } = await supabase.auth.signUp({ email, password })
    if (error) {
      alert('Błąd rejestracji: ' + error.message)
    } else {
      const userId = data.user?.id
      if (userId) {
        await supabase.from('profiles').insert([{ id: userId, email, username }])
      }
      alert('Zarejestrowano! Sprawdź email i kliknij link aktywacyjny.')
      window.location.href = 'login.html'
    }
  }
}

async function setupLogin() {
  const emailInput = document.getElementById('email');
  const passwordInput = document.getElementById('password');
  const loginBtn = document.getElementById('loginBtn');

  loginBtn.onclick = async () => {
    const email = emailInput.value.trim();
    const password = passwordInput.value.trim();
    if (!email || !password) {
      alert('Wpisz email i hasło');
      return;
    }
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      alert('Błąd logowania: ' + error.message);
      return;
    }
    // Po zalogowaniu – przekieruj do chat.html
    window.location.href = '/chat.html';
  };

  // Jeśli ktoś już ma sesję (np. odświeżenie strony), od razu przejdź do czatu:
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.user) {
    window.location.href = '/chat.html';
  }
}

export { setupLogin };

export async function logout(logoutBtn, callbacks) {
  logoutBtn.onclick = async () => {
    await supabase.auth.signOut()
    callbacks.onLogout()
  }
}
