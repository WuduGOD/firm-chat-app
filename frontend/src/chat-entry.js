import './style.css';
import { supabase } from './supabaseClient.js';
import { initChatApp } from './chat.js';

// Sprawdź od razu, czy ktoś ma aktywną sesję
(async () => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) {
    // Jeśli brak sesji → nie zalogowany, wracamy na stronę logowania
    window.location.href = '/';
    return;
  }

  // Jeśli jest sesja, uruchom właściwy kod czatu
  initChatApp();
})();