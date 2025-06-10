// Deklarujemy i eksportujemy funkcje na najwyższym poziomie,
// aby były dostępne dla importu w innych modułach.
// Ich implementacje zostaną przypisane w `DOMContentLoaded`.
export let openChatPanel;
export let closeChatPanel;
export let resetUI;

document.addEventListener('DOMContentLoaded', () => {
    // === Selektory DOM, które są lokalne dla tego skryptu UI ===
    const activeChatPanel = document.querySelector('.active-chat-panel');
    const contentArea = document.querySelector('.content-area'); // Lista konwersacji
    const backToListBtn = document.querySelector('.back-to-list-btn');
    const flowBar = document.querySelector('.flow-bar');
    const contextCapsule = document.querySelector('.context-capsule');
    const closeCapsuleBtn = document.querySelector('.close-capsule-btn');
    const accountIcon = document.querySelector('.sidebar-account .account-icon');
    const accountPanel = document.querySelector('.account-panel');
    const closeAccountBtn = document.querySelector('.account-panel .close-account-btn');

    const searchInput = document.querySelector('.search-input');
    const filterBtn = document.querySelector('.filter-btn');
    const navIcons = document.querySelectorAll('.sidebar .nav-icon, .sidebar-account .account-icon');
    const tooltip = document.querySelector('.tooltip');

    // === Obsługa przełączania paneli (chat, kontekst, konto) ===
    // Przypisujemy implementację do eksportowanych funkcji
    openChatPanel = () => {
        if (activeChatPanel && contentArea) {
            activeChatPanel.classList.add('active');
            contentArea.classList.add('hidden-on-mobile'); // Ukryj listę konwersacji na małych ekranach
            // Upewnij się, że kapsuła kontekstu i panel konta są zamknięte
            contextCapsule?.classList.remove('open');
            accountPanel?.classList.remove('open');
        }
    };

    closeChatPanel = () => {
        if (activeChatPanel && contentArea) {
            activeChatPanel.classList.remove('active');
            contentArea.classList.remove('hidden-on-mobile'); // Pokaż listę konwersacji
        }
    };

    // Obsługa przycisku "Wróć do listy" w panelu czatu
    if (backToListBtn) {
        backToListBtn.addEventListener('click', closeChatPanel);
    }

    // Obsługa otwierania/zamykania kapsuły kontekstu
    if (flowBar) {
        flowBar.addEventListener('click', () => {
            contextCapsule?.classList.add('open');
        });
    }
    if (closeCapsuleBtn) {
        closeCapsuleBtn.addEventListener('click', () => {
            contextCapsule?.classList.remove('open');
        });
    }

    // Obsługa otwierania/zamykania panelu konta
    if (accountIcon) {
        accountIcon.addEventListener('click', () => {
            accountPanel?.classList.add('open');
        });
    }
    if (closeAccountBtn) {
        closeAccountBtn.addEventListener('click', () => {
            accountPanel?.classList.remove('open');
        });
    }

    // === Obsługa animacji wyszukiwania ===
    if (searchInput && filterBtn) {
        searchInput.addEventListener('focus', () => {
            filterBtn.classList.remove('hidden');
        });

        searchInput.addEventListener('blur', () => {
            // Ukryj przycisk filtra tylko jeśli pole wyszukiwania jest puste
            if (searchInput.value.trim() === '') {
                filterBtn.classList.add('hidden');
            }
        });

        // Pokaż przycisk filtra, jeśli po załadowaniu strony input ma wartość
        if (searchInput.value.trim() !== '') {
            filterBtn.classList.remove('hidden');
        }
    }

    // === Obsługa tooltipów (podpowiedzi) dla ikon bocznego paska ===
    if (tooltip) {
        navIcons.forEach(icon => {
            const tooltipText = icon.getAttribute('data-tooltip');
            if (tooltipText) {
                icon.addEventListener('mouseenter', (e) => {
                    tooltip.textContent = tooltipText;
                    tooltip.style.left = `${e.clientX + 15}px`; // Lekkie przesunięcie w prawo
                    tooltip.style.top = `${e.clientY + 15}px`; // Lekkie przesunięcie w dół
                    tooltip.classList.add('visible');
                });

                icon.addEventListener('mousemove', (e) => {
                    tooltip.style.left = `${e.clientX + 15}px`;
                    tooltip.style.top = `${e.clientY + 15}px`;
                });

                icon.addEventListener('mouseleave', () => {
                    tooltip.classList.remove('visible');
                });
            }
        });
    }

    // === Globalna funkcja do resetowania UI ===
    // Przypisujemy implementację do eksportowanej funkcji
    resetUI = () => {
        closeChatPanel(); // Używamy już zdefiniowanej funkcji w tym samym skrypcie
        contextCapsule?.classList.remove('open');
        accountPanel?.classList.remove('open');

        // Musimy ponownie pobrać referencje do tych elementów, ponieważ są one lokalne
        // dla bieżącego zakresu DOMContentLoaded.
        const currentSearchInput = document.querySelector('.search-input');
        const currentFilterBtn = document.querySelector('.filter-btn');

        if (currentSearchInput) currentSearchInput.value = '';
        currentFilterBtn?.classList.add('hidden');

        // Wyczyść dynamicznie ładowane treści
        const conversationList = document.querySelector('.conversation-list');
        const chatContentView = document.querySelector('.chat-content-view');

        if (conversationList) conversationList.innerHTML = '';
        if (chatContentView) chatContentView.innerHTML = '';

        // Reset nagłówka czatu
        const chatHeaderName = document.querySelector('.chat-header-name');
        const chatHeaderAvatar = document.querySelector('.chat-header-avatar');
        const chatStatusSpan = document.querySelector('.chat-status');
        if (chatHeaderName) chatHeaderName.textContent = '';
        if (chatHeaderAvatar) chatHeaderAvatar.src = ''; // Ustaw pusty src
        if (chatStatusSpan) {
            chatStatusSpan.textContent = '';
            chatStatusSpan.classList.remove('online', 'offline');
        }
    };
});