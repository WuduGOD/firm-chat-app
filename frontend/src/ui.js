document.addEventListener('DOMContentLoaded', () => {
    // === Obsługa przełączania paneli (chat, kontekst, konto) ===
    const activeChatPanel = document.querySelector('.active-chat-panel');
    const contentArea = document.querySelector('.content-area'); // Lista konwersacji
    const backToListBtn = document.querySelector('.back-to-list-btn');
    const flowBar = document.querySelector('.flow-bar');
    const contextCapsule = document.querySelector('.context-capsule');
    const closeCapsuleBtn = document.querySelector('.close-capsule-btn');
    const accountIcon = document.querySelector('.sidebar-account .account-icon');
    const accountPanel = document.querySelector('.account-panel');
    const closeAccountBtn = document.querySelector('.account-panel .close-account-btn');

    // Funkcja otwierająca panel czatu i ukrywająca listę konwersacji
    const openChatPanel = () => {
        if (activeChatPanel && contentArea) {
            activeChatPanel.classList.add('active');
            contentArea.classList.add('hidden-on-mobile'); // Ukryj listę konwersacji na małych ekranach
            // Upewnij się, że kapsuła kontekstu i panel konta są zamknięte
            contextCapsule?.classList.remove('open');
            accountPanel?.classList.remove('open');
        }
    };

    // Funkcja powrotu do listy konwersacji
    const closeChatPanel = () => {
        if (activeChatPanel && contentArea) {
            activeChatPanel.classList.remove('active');
            contentArea.classList.remove('hidden-on-mobile'); // Pokaż listę konwersacji
        }
    };

    // Obsługa kliknięcia w dowolną konwersację (będzie zintegrowane z dynamicznym ładowaniem w chat.js)
    // Na razie symulujemy kliknięcie, które otwiera panel czatu
    document.querySelectorAll('.convo-item').forEach(item => {
        item.addEventListener('click', () => {
            openChatPanel();
        });
    });

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
    const searchInput = document.querySelector('.search-input');
    const filterBtn = document.querySelector('.filter-btn');

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
    const navIcons = document.querySelectorAll('.sidebar .nav-icon, .sidebar-account .account-icon');
    const tooltip = document.querySelector('.tooltip');

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

    // Dodatkowa funkcja do resetowania UI, przydatna przy wylogowaniu/zmianie użytkownika
    window.resetUI = () => {
        closeChatPanel();
        contextCapsule?.classList.remove('open');
        accountPanel?.classList.remove('open');
        if (searchInput) searchInput.value = '';
        filterBtn?.classList.add('hidden');
        // Możesz dodać tutaj czyszczenie listy konwersacji jeśli nie jest ona zarządzana bezpośrednio przez chat.js
        // document.querySelector('.conversation-list').innerHTML = '';
        // document.querySelector('.chat-content-view').innerHTML = '';
    };
});