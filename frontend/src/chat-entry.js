import './style.css';
import { supabase } from './supabaseClient.js';
import { initializeApp } from './chat.js'; // Zmieniono z 'initChatApp' na 'initializeApp'

document.addEventListener('DOMContentLoaded', async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
        window.location.href = '/login.html'; // albo '/' jeśli tam tam masz login
        return;
    }
    await initializeApp(); // Zmieniono z 'initChatApp()' na 'initializeApp()'
});