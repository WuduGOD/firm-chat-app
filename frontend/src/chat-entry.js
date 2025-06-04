import './style.css';
import { supabase } from './supabaseClient.js';
import { initChatApp } from './chat.js';

document.addEventListener('DOMContentLoaded', async () => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) {
    window.location.href = '/login.html'; // albo '/' jeśli tam masz login
    return;
  }
  await initChatApp();
});