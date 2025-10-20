// Jeśli UŻYWASZ bundlera (np. Webpack, Parcel), zostaw ten import.
// Jeśli NIE UŻYWASZ bundlera, usuń tę linię i podłącz style.css w HTML.
import './style.css';
import { supabase } from './supabaseClient.js';

console.log('► register-entry.js załadowany'); // Dodaj to, aby upewnić się, że plik JS się wczytuje

document.addEventListener('DOMContentLoaded', () => {
    // Pobierz elementy formularza rejestracji
    const form = document.getElementById('registerForm');
    const emailInput = document.getElementById('email');
    const nicknameInput = document.getElementById('nickname');
    const passwordInput = document.getElementById('password');
    const eyeIcon = document.querySelector('.password-wrapper .eye i'); // Pobierz element ikony oka

    if (!form) {
        console.error('❌ Nie znaleziono <form id="registerForm"> w register.html');
        return;
    }

    // Dodaj obsługę kliknięcia dla ikony oka
    if (eyeIcon && passwordInput) {
        eyeIcon.addEventListener('click', () => {
            if (passwordInput.type === 'password') {
                passwordInput.type = 'text';
                eyeIcon.classList.remove('fa-eye');
                eyeIcon.classList.add('fa-eye-slash'); // Zmień ikonę na przekreślone oko
            } else {
                passwordInput.type = 'password';
                eyeIcon.classList.remove('fa-eye-slash');
                eyeIcon.classList.add('fa-eye'); // Zmień ikonę na zwykłe oko
            }
        });
    } else {
        console.warn('⚠️ Nie znaleziono ikony oka lub pola hasła. Sprawdź HTML.');
    }

    // Obsługa wysyłania formularza rejestracji
    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const email = emailInput.value.trim();
        const nickname = nicknameInput.value.trim();
        const password = passwordInput.value.trim();

        if (!email || !nickname || !password) {
            alert('Proszę wypełnić wszystkie pola.');
            return;
        }

        // Walidacja hasła (przykładowa, możesz rozbudować)
        if (password.length < 6) {
            alert('Hasło musi mieć co najmniej 6 znaków.');
            return;
        }

        const { data, error } = await supabase.auth.signUp({
            email,
            password,
            options: {
                data: { username: nickname } // Przekazywanie nicku jako metadata do Supabase
            }
        });

        if (error) {
            console.error('Błąd rejestracji Supabase:', error);
            alert('Błąd rejestracji: ' + error.message);
        } else {
            console.log('Zarejestrowano pomyślnie!', data);
            alert('Rejestracja udana! Sprawdź swoją skrzynkę pocztową, aby potwierdzić konto.');
            // Przekierowanie po udanej rejestracji (może być do strony logowania lub potwierdzenia)
            window.location.href = '/login.html'; // Przekierowanie na stronę logowania po rejestracji
        }
    });
});