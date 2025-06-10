// Deklarujemy i eksportujemy funkcje na najwyższym poziomie,
// aby były dostępne dla importu w innych modułach.
// Ich implementacje zostaną przypisane w `DOMContentLoaded`.
export let openChatPanel;
export let closeChatPanel;
export let resetUI;

document.addEventListener('DOMContentLoaded', () => {
    // === Selektory DOM ===
    const appContainer = document.querySelector('.app-container');
    const contentArea = document.querySelector('.content-area'); // Lista konwersacji
    const activeChatPanel = document.querySelector('.active-chat-panel');
    const backToListBtn = document.querySelector('.back-to-list-btn');

    const searchInput = document.querySelector('.search-input');
    const filterBtn = document.querySelector('.filter-btn');

    const flowBar = document.querySelector('.flow-bar');
    const contextCapsule = document.querySelector('.context-capsule');
    const closeCapsuleBtn = document.querySelector('.close-capsule-btn');

    const accountIcon = document.querySelector('.sidebar-account .account-icon');
    const accountPanel = document.querySelector('.account-panel');
    const closeAccountBtn = document.querySelector('.account-panel .close-account-btn');

    const whisperModeBtn = document.querySelector('.whisper-mode-btn');
    const chatContentView = document.querySelector('.chat-content-view');
    const chatInputArea = document.querySelector('.chat-input-area');

    const navIconsAndTooltips = document.querySelectorAll('.nav-icon, .account-icon, .flow-bar, .whisper-mode-btn');

    // === Obsługa otwierania/zamykania panelu czatu ===
    // Przypisujemy implementację do eksportowanych funkcji
    openChatPanel = (convoItem = null) => {
        if (appContainer && activeChatPanel) {
            // Jeśli wywołujemy z convoItem (kliknięcie na konwersację), aktualizuj nagłówek czatu
            if (convoItem) {
                const chatHeaderAvatar = activeChatPanel.querySelector('.chat-header-avatar');
                const chatHeaderName = activeChatPanel.querySelector('.chat-header-name');
                const convoAvatarSrc = convoItem.querySelector('.convo-avatar')?.src;
                const convoName = convoItem.querySelector('.convo-name')?.textContent;

                if (chatHeaderAvatar) chatHeaderAvatar.src = convoAvatarSrc || '';
                if (chatHeaderName) chatHeaderName.textContent = convoName || '';
            }

            // Dodaj klasę, która steruje szerokością paneli
            appContainer.classList.add('chat-open');

            // Upewnij się, że kapsuła kontekstu i panel konta są zamknięte
            if (contextCapsule) {
                contextCapsule.classList.add('hidden');
                contextCapsule.classList.remove('active');
            }
            if (accountPanel) {
                accountPanel.classList.add('hidden');
                accountPanel.classList.remove('active');
            }
        }
    };

    closeChatPanel = () => {
        if (appContainer) {
            appContainer.classList.remove('chat-open'); // Usuwamy klasę, która steruje szerokością paneli
        }
    };

    // Obsługa kliknięcia na element konwersacji (delegacja)
    document.querySelectorAll('.convo-item').forEach(item => {
        item.addEventListener('click', () => openChatPanel(item));
    });

    // Obsługa przycisku "Wróć do listy" w panelu czatu
    if (backToListBtn) {
        backToListBtn.addEventListener('click', closeChatPanel);
    }

    // === Obsługa otwierania/zamykania Kapsuły Kontekstu ===
    if (flowBar && contextCapsule && closeCapsuleBtn) {
        flowBar.addEventListener('click', () => {
            contextCapsule.classList.toggle('hidden');
            if (!contextCapsule.classList.contains('hidden')) {
                contextCapsule.classList.add('active'); // Dla animacji
            } else {
                contextCapsule.classList.remove('active');
            }
            // Zamknij panel konta, jeśli otwarty
            if (accountPanel && accountPanel.classList.contains('active')) {
                accountPanel.classList.add('hidden');
                accountPanel.classList.remove('active');
            }
        });

        closeCapsuleBtn.addEventListener('click', () => {
            contextCapsule.classList.add('hidden');
            contextCapsule.classList.remove('active');
        });
    }

    // === Obsługa otwierania/zamykania Panelu Konta ===
    if (accountIcon && accountPanel && closeAccountBtn) {
        accountIcon.addEventListener('click', () => {
            accountPanel.classList.toggle('hidden');
            if (!accountPanel.classList.contains('hidden')) {
                accountPanel.classList.add('active');
            } else {
                accountPanel.classList.remove('active');
            }
            // Zamknij kapsułę kontekstu, jeśli otwarta
            if (contextCapsule && contextCapsule.classList.contains('active')) {
                contextCapsule.classList.add('hidden');
                contextCapsule.classList.remove('active');
            }
        });

        closeAccountBtn.addEventListener('click', () => {
            accountPanel.classList.add('hidden');
            accountPanel.classList.remove('active');
        });
    }

    // === Obsługa animacji wyszukiwania ===
    if (searchInput && filterBtn) {
        searchInput.addEventListener('focus', () => {
            searchInput.style.width = '200px'; // Rozszerz pole
            filterBtn.classList.remove('hidden'); // Pokaż przycisk filtru (usunie display:none)
            filterBtn.style.opacity = '1';
        });

        searchInput.addEventListener('blur', () => {
            if (!searchInput.value) { // Zwiń tylko jeśli puste
                searchInput.style.width = '120px';
                filterBtn.style.opacity = '0';
                // Poczekaj na zakończenie animacji opacity, zanim ukryjesz element
                setTimeout(() => {
                    filterBtn.classList.add('hidden'); // Ukryj przycisk filtru (ustawi display:none)
                }, 300); // Czas musi być dopasowany do transition: opacity 0.3s ease; w CSS
            }
        });

        // Obsługa stanu początkowego (jeśli po załadowaniu strony input ma wartość)
        if (searchInput.value.trim() !== '') {
            filterBtn.classList.remove('hidden');
            filterBtn.style.opacity = '1';
            searchInput.style.width = '200px'; // Upewnij się, że jest rozszerzone
        }
    }

    // === Cichy Tryb Skupienia ===
    if (whisperModeBtn && chatContentView && chatInputArea) {
        whisperModeBtn.addEventListener('click', () => {
            chatContentView.classList.toggle('blurred-focus');
            chatInputArea.classList.toggle('blurred-focus-input');
        });
    }

    // === Tooltipy (podpowiedzi) dla ikon nawigacji ===
    navIconsAndTooltips.forEach(element => {
        element.addEventListener('mouseenter', function() {
            const tooltipText = this.dataset.tooltip;
            if (tooltipText) {
                let tooltip = document.querySelector('.tooltip');
                if (!tooltip) { // Jeśli tooltip nie istnieje, utwórz go
                    tooltip = document.createElement('div');
                    tooltip.className = 'tooltip';
                    document.body.appendChild(tooltip);
                }
                tooltip.textContent = tooltipText;

                const rect = this.getBoundingClientRect();
                // Pozycjonowanie tooltipa obok elementu (po prawej stronie)
                tooltip.style.left = `${rect.right + 10}px`;
                tooltip.style.top = `${rect.top + rect.height / 2 - tooltip.offsetHeight / 2}px`;
                tooltip.style.opacity = '1';
            }
        });

        element.addEventListener('mouseleave', () => {
            const tooltip = document.querySelector('.tooltip');
            if (tooltip) {
                tooltip.style.opacity = '0';
                // Usuń tooltip po zakończeniu animacji zanikania
                setTimeout(() => tooltip.remove(), 200); // 200ms to czas transition: opacity w CSS
            }
        });
    });

    // === Drag & Drop dla "Fal Konwersacji" (przykładowa implementacja) ===
    document.querySelectorAll('.message-wave').forEach(wave => {
        wave.addEventListener('dragstart', (e) => {
            e.dataTransfer.setData('text/plain', e.target.textContent); // Przekazujemy tekst
            e.dataTransfer.effectAllowed = 'copy';
            console.log('Dragging wave:', e.target.textContent);
        });
    });


    // === Globalna funkcja do resetowania UI ===
    // Przypisujemy implementację do eksportowanej funkcji
    resetUI = () => {
        closeChatPanel(); // Zamyka panel czatu i przywraca widok listy konwersacji

        // Zamknij kapsułę kontekstu
        if (contextCapsule) {
            contextCapsule.classList.add('hidden');
            contextCapsule.classList.remove('active');
        }
        // Zamknij panel konta
        if (accountPanel) {
            accountPanel.classList.add('hidden');
            accountPanel.classList.remove('active');
        }

        // Reset pola wyszukiwania
        if (searchInput) {
            searchInput.value = '';
            searchInput.style.width = '120px'; // Przywróć domyślną szerokość
        }
        if (filterBtn) {
            filterBtn.style.opacity = '0';
            setTimeout(() => { // Ukryj po animacji
                filterBtn.classList.add('hidden');
            }, 300);
        }

        // Usuń klasy trybu skupienia
        chatContentView?.classList.remove('blurred-focus');
        chatInputArea?.classList.remove('blurred-focus-input');

        // Reset nagłówka czatu
        const chatHeaderName = document.querySelector('.chat-header-name');
        const chatHeaderAvatar = document.querySelector('.chat-header-avatar');
        const chatStatusSpan = document.querySelector('.chat-status');
        if (chatHeaderName) chatHeaderName.textContent = 'Wybierz konwersację'; // Ustaw domyślny tekst
        if (chatHeaderAvatar) chatHeaderAvatar.src = ''; // Ustaw pusty src lub domyślny avatar
        if (chatStatusSpan) {
            chatStatusSpan.textContent = '';
            chatStatusSpan.classList.remove('online', 'offline');
        }

        conversationList.innerHTML = ''; // Jeśli konwersacje są dynamiczne
    };
});