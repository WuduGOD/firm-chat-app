import './style.css';
import { createClient } from '@supabase/supabase-js';
import { initChatApp } from './chat.js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

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