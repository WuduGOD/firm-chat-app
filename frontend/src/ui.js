// Deklarujemy i eksportujemy funkcje na najwyższym poziomie
export let openChatPanel;
export let closeChatPanel;
export let resetUI;

document.addEventListener('DOMContentLoaded', () => {
    // === Selektory DOM ===
    const appContainer = document.querySelector('.app-container');
    const conversationList = document.querySelector('.conversation-list');
    const backToListBtn = document.querySelector('.back-to-list-btn'); // Przycisk "Wróć do listy"

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

    // Selektory dla elementów nagłówka czatu, które będą dynamicznie aktualizowane
    const activeChatPanel = document.querySelector('.active-chat-panel');
    const chatHeaderAvatar = activeChatPanel?.querySelector('.chat-header-avatar');
    const chatHeaderName = activeChatPanel?.querySelector('.chat-header-name');
    const chatStatus = activeChatPanel?.querySelector('.chat-status');

    // Selektor dla aktywnej ikony nawigacji (np. "Czat")
    const chatNavIcon = document.querySelector('.nav-icon[data-tooltip="Czat"]');
    const navIcons = document.querySelectorAll('.main-nav .nav-icon');

    // Wszystkie ikony nawigacyjne i inne elementy z tooltipami
    const navIconsAndTooltips = document.querySelectorAll('.nav-icon, .account-icon, .flow-bar, .whisper-mode-btn');


    // === Funkcje sterujące stanami widoku ===

    /**
     * Otwiera panel czatu w widoku podzielonym (lista konwersacji + czat).
     * @param {HTMLElement} [convoItem=null] - Element konwersacji, który został kliknięty (opcjonalnie).
     */
    openChatPanel = (convoItem = null) => {
        if (appContainer) {
            // KLUCZOWA ZMIANA: Używamy klasy 'chat-open' z Twojego CSS
            appContainer.classList.add('chat-open');

            // Aktualizuj nagłówek czatu, jeśli convoItem jest podany
            if (convoItem) {
                const convoAvatarSrc = convoItem.querySelector('.convo-avatar')?.src;
                const convoName = convoItem.querySelector('.convo-name')?.textContent;
                const convoStatus = convoItem.dataset.status || 'offline'; // Przykład: status z data-status

                if (chatHeaderAvatar) chatHeaderAvatar.src = convoAvatarSrc || 'https://via.placeholder.com/48'; // Domyślny avatar
                if (chatHeaderName) chatHeaderName.textContent = convoName || 'Nieznany użytkownik';
                if (chatStatus) {
                    chatStatus.textContent = convoStatus === 'online' ? 'Online' : 'Offline';
                    chatStatus.classList.remove('online', 'offline');
                    chatStatus.classList.add(convoStatus);
                }

                // Ustawia aktywną konwersację na liście
                document.querySelectorAll('.convo-item').forEach(item => item.classList.remove('active'));
                convoItem.classList.add('active');
            }

            // Upewnij się, że inne panele (konto, kapsuła) są zamknięte
            if (contextCapsule) contextCapsule.classList.remove('active');
            if (accountPanel) accountPanel.classList.remove('active');
        }
    };

    /**
     * Zamyka panel czatu i powraca do stanu początkowego (pełnej listy konwersacji).
     */
    closeChatPanel = () => {
        if (appContainer) {
            // KLUCZOWA ZMIANA: Używamy klasy 'chat-open' z Twojego CSS
            appContainer.classList.remove('chat-open');

            // Usuń aktywną konwersację z listy
            document.querySelectorAll('.convo-item').forEach(item => item.classList.remove('active'));

            // Reset nagłówka czatu
            if (chatHeaderName) chatHeaderName.textContent = 'Wybierz konwersację';
            if (chatHeaderAvatar) chatHeaderAvatar.src = ''; // Ustaw pusty lub domyślny avatar
            if (chatStatus) {
                chatStatus.textContent = '';
                chatStatus.classList.remove('online', 'offline');
            }
        }
    };

    // === Event Listenery ===

    // 1. Kliknięcie na element konwersacji (przełącza na WIDOK PODZIELONY)
    // Użyj delegacji zdarzeń, jeśli konwersacje są dodawane dynamicznie
    if (conversationList) {
        conversationList.addEventListener('click', (event) => {
            const convoItem = event.target.closest('.convo-item');
            if (convoItem) {
                openChatPanel(convoItem);
            }
        });
    }

    // 2. Kliknięcie na przycisk "Wróć do listy" (teraz działa!)
    if (backToListBtn) {
        backToListBtn.addEventListener('click', closeChatPanel);
    }

    // 3. Aktywacja ikony "Czat" w sidebarze (upewnij się, że ten sam widok listy jest aktywny)
    if (chatNavIcon) {
        chatNavIcon.addEventListener('click', () => {
            navIcons.forEach(icon => icon.classList.remove('active'));
            chatNavIcon.classList.add('active');
            closeChatPanel(); // Upewnij się, że jest widoczna pełna lista konwersacji
        });
    }

    // === Obsługa otwierania/zamykania Kapsuły Kontekstu ===
    if (flowBar && contextCapsule && closeCapsuleBtn) {
        flowBar.addEventListener('click', () => {
            contextCapsule.classList.toggle('active');
            if (accountPanel) accountPanel.classList.remove('active');
            // Jeśli otwieramy kapsułę, zamykamy czat (wracamy do listy)
            // KLUCZOWA ZMIANA: Używamy klasy 'chat-open'
            if (appContainer.classList.contains('chat-open')) {
                closeChatPanel();
            }
        });
        closeCapsuleBtn.addEventListener('click', () => {
            contextCapsule.classList.remove('active');
        });
    }

    // === Obsługa otwierania/zamykania Panelu Konta ===
    if (accountIcon && accountPanel && closeAccountBtn) {
        accountIcon.addEventListener('click', () => {
            accountPanel.classList.toggle('active');
            if (contextCapsule) contextCapsule.classList.remove('active');
            // Jeśli otwieramy panel konta, zamykamy czat (wracamy do listy)
            // KLUCZOWA ZMIANA: Używamy klasy 'chat-open'
            if (appContainer.classList.contains('chat-open')) {
                closeChatPanel();
            }
        });
        closeAccountBtn.addEventListener('click', () => {
            accountPanel.classList.remove('active');
        });
    }

    // === Obsługa animacji wyszukiwania ===
    if (searchInput && filterBtn) {
        searchInput.addEventListener('focus', () => {
            searchInput.style.width = '200px';
            filterBtn.classList.add('active');
            filterBtn.classList.remove('hidden');
        });

        searchInput.addEventListener('blur', () => {
            if (!searchInput.value) {
                searchInput.style.width = '120px';
                filterBtn.classList.remove('active');
                setTimeout(() => {
                    filterBtn.classList.add('hidden');
                }, 300);
            }
        });
        // Utrzymaj stan po przeładowaniu, jeśli pole ma wartość
        if (searchInput.value.trim() !== '') {
            filterBtn.classList.add('active');
            filterBtn.classList.remove('hidden');
            searchInput.style.width = '200px';
        } else {
            filterBtn.classList.add('hidden');
        }
    }

    // === Cichy Tryb Skupienia (Blurring) ===
    if (whisperModeBtn && chatContentView && chatInputArea) {
        whisperModeBtn.addEventListener('click', () => {
            chatContentView.classList.toggle('blurred-focus');
            chatInputArea.classList.toggle('blurred-focus-input');
        });
    }

    // === Tooltipy ===
    navIconsAndTooltips.forEach(element => {
        element.addEventListener('mouseenter', function() {
            const tooltipText = this.dataset.tooltip;
            if (tooltipText) {
                let tooltip = document.querySelector('.tooltip');
                if (!tooltip) { tooltip = document.createElement('div'); tooltip.className = 'tooltip'; document.body.appendChild(tooltip); }
                tooltip.textContent = tooltipText;
                const rect = this.getBoundingClientRect();
                tooltip.style.left = `${rect.right + 10}px`;
                tooltip.style.top = `${rect.top + rect.height / 2 - tooltip.offsetHeight / 2}px`;
                tooltip.style.opacity = '1';
            }
        });
        element.addEventListener('mouseleave', () => {
            const tooltip = document.querySelector('.tooltip');
            if (tooltip) { tooltip.style.opacity = '0'; setTimeout(() => tooltip.remove(), 200); }
        });
    });

    // === Globalna funkcja do resetowania UI ===
    resetUI = () => {
        closeChatPanel(); // Zamyka panel czatu i przywraca widok listy konwersacji

        if (contextCapsule) contextCapsule.classList.remove('active');
        if (accountPanel) accountPanel.classList.remove('active');

        if (searchInput) {
            searchInput.value = '';
            searchInput.style.width = '120px';
        }
        if (filterBtn) {
            filterBtn.classList.remove('active');
            filterBtn.classList.add('hidden');
        }

        chatContentView?.classList.remove('blurred-focus');
        chatInputArea?.classList.remove('blurred-focus-input');

        document.querySelectorAll('.convo-item').forEach(item => item.classList.remove('active'));

        // Reset aktywnej ikony nawigacji na "Czat"
        navIcons.forEach(icon => icon.classList.remove('active'));
        if (chatNavIcon) {
            chatNavIcon.classList.add('active');
        }
    };

    // === Początkowa inicjalizacja (po załadowaniu strony) ===
    // Upewnij się, że przycisk "Czat" jest aktywny domyślnie
    if (chatNavIcon) {
        chatNavIcon.classList.add('active');
    }
    // Upewnij się, że panel czatu jest początkowo ukryty (usuń klasę chat-open, jeśli jest)
    appContainer.classList.remove('chat-open');
});