// Plik: helpers.js

import { audioContext, setNotificationPermission, setAudioContext, setAudioContextInitiated, audioContextInitiated, notificationPermissionGranted, unreadConversationsInfo, baseDocumentTitle } from '../chat.js';
import { enableSoundButton } from './elements.js';
import { getUserLabelById } from '../profiles.js';

/**
 * Formats a given date into a "time ago" string (e.g., "5 minut temu", "wczoraj o 10:30").
 * @param {Date} date The date object to format.
 * @returns {string} The formatted time ago string
 */
export function formatTimeAgo(date) {
    const now = new Date();
    const seconds = Math.floor((now - date) / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (seconds < 60) {
        return `teraz`;
    } else if (minutes < 60) {
        return `${minutes} ${minutes === 1 ? 'minutę' : (minutes >= 2 && minutes <= 4 ? 'minuty' : 'minut')} temu`;
    } else if (hours < 24) {
        return `${hours} ${hours === 1 ? 'godzinę' : (hours >= 2 && hours <= 4 ? 'godziny' : 'godzin')} temu`;
    } else if (days === 1) {
        return `wczoraj o ${date.toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" })}`;
    } else if (days < 7) {
        return `${days} ${days === 1 ? 'dzień' : 'dni'} temu`;
    } else {
        return `${date.toLocaleDateString("pl-PL")} o ${date.toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" })}`;
    }
}

/**
 * Wyświetla niestandardowy komunikat w aplikacji.
 * Zastępuje alert().
 * @param {string} message - Treść komunikatu.
 * @param {'success'|'error'|'info'} type - Typ komunikatu (np. 'success', 'error', 'info').
 */
export function showCustomMessage(message, type = 'info') {
    let messageBox = document.getElementById('customMessageBox');
    if (!messageBox) {
        messageBox = document.createElement('div');
        messageBox.id = 'customMessageBox';
        messageBox.className = 'custom-message-box hidden'; // Domyślnie ukryty
        document.body.appendChild(messageBox);
    }

    messageBox.textContent = message;
    messageBox.className = `custom-message-box ${type}`; // Ustaw klasę typu
    messageBox.classList.remove('hidden'); // Pokaż komunikat
    messageBox.style.opacity = '1'; // Ensure it's fully visible
    messageBox.style.display = 'block'; // Ensure it's displayed

    // Ukryj komunikat po 3 sekundach
    setTimeout(() => {
        messageBox.style.opacity = '0'; // Start fade out
        setTimeout(() => {
            messageBox.classList.add('hidden'); // Fully hide after fade
            messageBox.style.display = 'none'; // Hide completely
        }, 500); // Match CSS transition duration
    }, 3000);
}

/**
 * Zapewnia, że AudioContext jest aktywny. Jeśli nie, tworzy go
 * i wznawia (co wymaga gestu użytkownika).
 */
export function ensureAudioContext() {
    
	if (!audioContext) {
		console.log("[AudioContext] Creating new AudioContext due to user gesture.");
		const newAudioContext = new (window.AudioContext || window.webkitAudioContext)();
		setAudioContext(newAudioContext);
	}

    // Sprawdź stan AudioContext. Jeśli jest zawieszony, spróbuj go wznowić.
    if (audioContext.state === 'suspended') {
        audioContext.resume().then(() => {
            console.log('[AudioContext] AudioContext resumed successfully.');
            setAudioContextInitiated(true);
            localStorage.setItem('autoplayUnlocked', 'true'); // Zapisz, że autoplay jest odblokowany
            if (enableSoundButton) {
                enableSoundButton.classList.add('hidden'); // Ukryj przycisk
            }
        }).catch(e => {
            console.error('[AudioContext] Failed to resume AudioContext:', e);
            if (e.name === 'NotAllowedError' && enableSoundButton) {
                enableSoundButton.classList.remove('hidden'); // Jeśli nadal blokowany, pokaż przycisk
            }
        });
    } else if (audioContext.state === 'running') {
        console.log('[AudioContext] AudioContext is already running.');
        setAudioContextInitiated(true);
        localStorage.setItem('autoplayUnlocked', 'true');
        if (enableSoundButton) {
            enableSoundButton.classList.add('hidden');
        }
    } else {
        console.log(`[AudioContext] AudioContext state: ${audioContext ? audioContext.state : 'null'}`);
    }
}

/**
 * Odtwarza prosty, krótki dźwięk powiadomienia (beep).
 * Korzysta z Web Audio API (AudioContext) do generowania dźwięku.
 */
export function playNotificationSound() {
    console.log("[Notifications] Attempting to play notification sound...");

    try {
        ensureAudioContext(); // Zawsze upewnij się, że AudioContext jest aktywny

        if (!audioContext || audioContext.state !== 'running') {
            console.warn("[Notifications] AudioContext is not running. Cannot play sound yet.");
            if (enableSoundButton) {
                enableSoundButton.classList.remove('hidden');
                showCustomMessage("Przeglądarka zablokowała dźwięki. Kliknij 'Włącz dźwięki' u góry, aby je aktywować.", "info");
            }
            return;
        }

        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);

        oscillator.type = 'sine'; // Fale sinusoidalne są czyste i przyjemne
        oscillator.frequency.setValueAtTime(440, audioContext.currentTime); // A4 note

        gainNode.gain.setValueAtTime(0.3, audioContext.currentTime); // Volume for notification (0.3 is moderate)
        gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.5); // Fade out quickly

        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.5); // Play for 0.5 seconds

        console.log("[Notifications] Notification sound started playing.");

    } catch (e) {
        console.error("Error playing notification sound:", e);
        if (e.name === 'NotAllowedError' && enableSoundButton) {
            enableSoundButton.classList.remove('hidden');
            showCustomMessage("Przeglądarka zablokowała dźwięki. Kliknij 'Włącz dźwięki' u góry, aby je aktywować.", "info");
        }
    }
}

/**
 * Próbuje odtworzyć cichy dźwięk, aby sprawdzić i ewentualnie odblokować politykę Autoplay.
 * Jeśli się nie powiedzie, pokaże przycisk `enableSoundButton`.
 */
export function checkAudioAutoplay() {
    console.log("[Autoplay Check] Attempting to check autoplay policy...");

    // Jeśli autoplay został już odblokowany w poprzedniej sesji, ukryj przycisk
    if (localStorage.getItem('autoplayUnlocked') === 'true') {
        console.log("[Autoplay Check] Autoplay already unlocked according to localStorage. Hiding button.");
        if (enableSoundButton) {
            enableSoundButton.classList.add('hidden');
            setAudioContextInitiated(true); // Ustaw flagę na true, bo przeglądarka pamięta odblokowanie
        }
        // Spróbuj wznowić AudioContext prewencyjnie, ale nie twórz go tutaj
        if (audioContext && audioContext.state === 'suspended') {
            audioContext.resume().then(() => {
                console.log('[Autoplay Check] AudioContext resumed successfully from localStorage check.');
            }).catch(e => {
                console.error('[Autoplay Check] Failed to resume AudioContext from localStorage check:', e);
            });
        }
        return;
    }

    // Jeśli AudioContext jeszcze nie istnieje lub jest zawieszony, pokaż przycisk
    if (!audioContext || audioContext.state === 'suspended') {
        console.warn("[Autoplay Check] AudioContext is not initialized or is suspended. Showing 'Enable Sound' button.");
        if (enableSoundButton) {
            enableSoundButton.classList.remove('hidden');
            showCustomMessage("Przeglądarka zablokowała dźwięki. Kliknij 'Włącz dźwięki' u góry, aby je aktywować.", "info");
        }
    } else if (audioContext.state === 'running') {
        console.log('[Autoplay Check] AudioContext is already running. Autoplay is likely allowed.');
        setAudioContextInitiated(true);
        localStorage.setItem('autoplayUnlocked', 'true');
        if (enableSoundButton) {
            enableSoundButton.classList.add('hidden');
        }
    } else {
        console.log(`[Autoplay Check] AudioContext state: ${audioContext ? audioContext.state : 'null'}. No immediate action.`);
    }
}

/**
 * Prosi użytkownika o uprawnienia do wyświetlania powiadomień przeglądarkowych.
 * Aktualizuje zmienną globalną `notificationPermissionGranted`.
 */
export async function requestNotificationPermission() {
    console.log("[Notifications] Checking Notification API support...");
    if (!("Notification" in window)) {
        console.warn("[Notifications] This browser does not support desktop notification.");
        return;
    }

    // Sprawdź obecny status uprawnień
    if (Notification.permission === "granted") {
        setNotificationPermission(true);
        console.log("[Notifications] Notification permission already granted.");
        return;
    } else if (Notification.permission === "denied") {
        setNotificationPermission(false);
        console.warn("[Notifications] Notification permission previously denied.");
        showCustomMessage("Powiadomienia zostały zablokowane. Aby je włączyć, zmień ustawienia przeglądarki.", "info");
        return;
    }

    console.log("[Notifications] Requesting permission from user...");
    try {
        const permission = await Notification.requestPermission();
        if (permission === "granted") {
            setNotificationPermission(true);
            console.log("[Notifications] Notification permission granted by user.");
            showCustomMessage("Powiadomienia włączone!", "success");
        } else if (permission === "denied") {
            setNotificationPermission(false);
            console.warn("[Notifications] Notification permission denied by user.");
            showCustomMessage("Powiadomienia zostały zablokowane. Nie będziesz otrzymywać alertów o nowych wiadomościach.", "error");
        } else { // 'default'
            setNotificationPermission(false);
            showCustomMessage("Powiadomienia nie zostały włączone.", "info");
        }
    } catch (error) {
        console.error("[Notifications] Error requesting notification permission:", error);
        setNotificationPermission(false);
        showCustomMessage("Wystąpił błąd podczas próby włączenia powiadomień.", "error");
    }
}

/**
 * Updates the browser tab title based on the unread message status.
 */
export function updateDocumentTitle() {
    let totalUnreadConvos = 0;
    let singleUnreadSenderId = null;

    // Zlicz nieprzeczytane konwersacje
    unreadConversationsInfo.forEach((info) => {
        if (info.unreadCount > 0) {
            totalUnreadConvos++;
            singleUnreadSenderId = (totalUnreadConvos === 1) ? info.lastSenderId : null;
        }
    });

    let newTitle = baseDocumentTitle;
    if (totalUnreadConvos > 0) {
        if (totalUnreadConvos === 1 && singleUnreadSenderId) {
            const senderLabel = getUserLabelById(singleUnreadSenderId) || 'Ktoś';
            newTitle = `(1) ${senderLabel} - ${baseDocumentTitle}`;
        } else {
            newTitle = `(${totalUnreadConvos}) ${baseDocumentTitle}`;
        }
    }
    
    document.title = newTitle;
}