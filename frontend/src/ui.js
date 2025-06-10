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
                const chatStatus = activeChatPanel.querySelector('.chat-status'); // Dodaj selektor dla statusu
                const convoAvatarSrc = convoItem.querySelector('.convo-avatar')?.src;
                const convoName = convoItem.querySelector('.convo-name')?.textContent;
                const convoStatus = convoItem.dataset.status || 'offline'; // Przykład: status z data-status

                if (chatHeaderAvatar) chatHeaderAvatar.src = convoAvatarSrc || 'path/to/default-avatar.png'; // Zapewnij domyślny avatar
                if (chatHeaderName) chatHeaderName.textContent = convoName || 'Nieznany użytkownik';
                if (chatStatus) {
                    chatStatus.textContent = convoStatus === 'online' ? 'Online' : 'Offline';
                    chatStatus.classList.remove('online', 'offline'); // Usuń poprzednie klasy
                    chatStatus.classList.add(convoStatus); // Dodaj nową klasę statusu (dla stylów CSS)
                }

                // Dodaj klasę 'active' do klikniętej konwersacji
                document.querySelectorAll('.convo-item').forEach(item => item.classList.remove('active'));
                convoItem.classList.add('active');
            }

            // Dodaj klasę 'chat-open' do appContainer, która steruje wszystkimi animacjami w CSS
            appContainer.classList.add('chat-open');

            // Upewnij się, że kapsuła kontekstu i panel konta są zamknięte
            if (contextCapsule && contextCapsule.classList.contains('active')) {
                contextCapsule.classList.remove('active');
            }
            if (accountPanel && accountPanel.classList.contains('active')) {
                accountPanel.classList.remove('active');
            }
            // Ważne: Jeśli masz ukrywanie poprzez 'hidden' z 'display:none',
            // usuń je tylko po to, by działały animacje.
            // Pamiętaj, że główna logika widoczności i animacji jest w CSS
            // kontrolowana przez klasę 'chat-open' na appContainer.
            // console.log('Czat otwarty, appContainer ma klasę chat-open');
        }
    };

    closeChatPanel = () => {
        if (appContainer) {
            appContainer.classList.remove('chat-open'); // Usuwamy klasę, która steruje szerokością paneli
            // Opcjonalnie: Usuń klasę 'active' z aktualnie wybranej konwersacji,
            // aby żaden element na liście nie był podświetlony
            document.querySelector('.convo-item.active')?.classList.remove('active');
            // console.log('Czat zamknięty, appContainer nie ma klasy chat-open');
        }
    };

    // Obsługa kliknięcia na element konwersacji (delegacja lub forEach)
    // UWAGA: Jeśli masz wiele .convo-item, forEach jest ok.
    // Jeśli elementy są dodawane dynamicznie, rozważ delegację zdarzeń na .conversation-list
    document.querySelectorAll('.convo-item').forEach(item => {
        item.addEventListener('click', () => {
            // openChatPanel już obsługuje dodawanie 'active' i aktualizację nagłówka
            openChatPanel(item);
        });
    });

    // Obsługa przycisku "Wróć do listy" w panelu czatu
    if (backToListBtn) {
        backToListBtn.addEventListener('click', closeChatPanel);
    }

    // === Obsługa otwierania/zamykania Kapsuły Kontekstu ===
    if (flowBar && contextCapsule && closeCapsuleBtn) {
        flowBar.addEventListener('click', () => {
            // Używamy tylko 'active' do kontroli widoczności/animacji
            contextCapsule.classList.toggle('active');
            // Zamknij panel konta, jeśli otwarty
            if (accountPanel && accountPanel.classList.contains('active')) {
                accountPanel.classList.remove('active');
            }
            // Ważne: Jeśli czat jest otwarty, zamknij go, jeśli chcesz
            // aby otwarcie kapsuły kontekstu zamykało czat.
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
            // Używamy tylko 'active' do kontroli widoczności/animacji
            accountPanel.classList.toggle('active');
            // Zamknij kapsułę kontekstu, jeśli otwarta
            if (contextCapsule && contextCapsule.classList.contains('active')) {
                contextCapsule.classList.remove('active');
            }
            // Ważne: Jeśli czat jest otwarty, zamknij go, jeśli chcesz
            // aby otwarcie panelu konta zamykało czat.
            if (appContainer.classList.contains('chat-open')) {
                closeChatPanel();
            }
        });

        closeAccountBtn.addEventListener('click', () => {
            accountPanel.classList.remove('active');
        });
    }

    // === Obsługa animacji wyszukiwania ===
    // W CSS masz już zdefiniowane przejścia, więc manipulowanie klasą .active
    // lub bezpośrednio stylami jest ok. Zostawiłbym to tak, jak jest.
    if (searchInput && filterBtn) {
        searchInput.addEventListener('focus', () => {
            searchInput.style.width = '200px';
            filterBtn.classList.add('active'); // Użyj klasy 'active' z CSS
            filterBtn.classList.remove('hidden'); // Upewnij się, że nie ma display:none
        });

        searchInput.addEventListener('blur', () => {
            if (!searchInput.value) {
                searchInput.style.width = '120px';
                filterBtn.classList.remove('active'); // Usuń klasę 'active'
                // Poczekaj na zakończenie animacji zanikania przed dodaniem 'hidden'
                setTimeout(() => {
                    filterBtn.classList.add('hidden'); // Jeśli 'hidden' ma display:none
                }, 300);
            }
        });

        // Obsługa stanu początkowego (jeśli po załadowaniu strony input ma wartość)
        if (searchInput.value.trim() !== '') {
            filterBtn.classList.add('active'); // Użyj klasy 'active'
            filterBtn.classList.remove('hidden'); // Upewnij się, że nie ma display:none
            searchInput.style.width = '200px';
        } else {
            filterBtn.classList.add('hidden'); // Domyślnie ukryj, jeśli puste
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
    // Ten kod jest dobry.
    navIconsAndTooltips.forEach(element => {
        element.addEventListener('mouseenter', function() {
            const tooltipText = this.dataset.tooltip;
            if (tooltipText) {
                let tooltip = document.querySelector('.tooltip');
                if (!tooltip) {
                    tooltip = document.createElement('div');
                    tooltip.className = 'tooltip';
                    document.body.appendChild(tooltip);
                }
                tooltip.textContent = tooltipText;

                const rect = this.getBoundingClientRect();
                tooltip.style.left = `${rect.right + 10}px`;
                tooltip.style.top = `${rect.top + rect.height / 2 - tooltip.offsetHeight / 2}px`;
                tooltip.style.opacity = '1';
            }
        });

        element.addEventListener('mouseleave', () => {
            const tooltip = document.querySelector('.tooltip');
            if (tooltip) {
                tooltip.style.opacity = '0';
                setTimeout(() => tooltip.remove(), 200);
            }
        });
    });

    // === Drag & Drop dla "Fal Konwersacji" (przykładowa implementacja) ===
    document.querySelectorAll('.message-wave').forEach(wave => {
        wave.addEventListener('dragstart', (e) => {
            e.dataTransfer.setData('text/plain', e.target.textContent);
            e.dataTransfer.effectAllowed = 'copy';
            console.log('Dragging wave:', e.target.textContent);
        });
    });


    // === Globalna funkcja do resetowania UI ===
    resetUI = () => {
        closeChatPanel(); // Zamyka panel czatu i przywraca widok listy konwersacji

        // Zamknij kapsułę kontekstu
        if (contextCapsule && contextCapsule.classList.contains('active')) {
            contextCapsule.classList.remove('active');
        }
        // Zamknij panel konta
        if (accountPanel && accountPanel.classList.contains('active')) {
            accountPanel.classList.remove('active');
        }

        // Reset pola wyszukiwania
        if (searchInput) {
            searchInput.value = '';
            searchInput.style.width = '120px';
        }
        if (filterBtn) {
            filterBtn.classList.remove('active'); // Usuń klasę 'active'
            filterBtn.classList.add('hidden'); // Domyślnie ukryj, jeśli puste
        }

        // Usuń klasy trybu skupienia
        chatContentView?.classList.remove('blurred-focus');
        chatInputArea?.classList.remove('blurred-focus-input');

        // Reset nagłówka czatu
        const chatHeaderName = document.querySelector('.chat-header-name');
        const chatHeaderAvatar = document.querySelector('.chat-header-avatar');
        const chatStatusSpan = document.querySelector('.chat-status');
        if (chatHeaderName) chatHeaderName.textContent = 'Wybierz konwersację';
        if (chatHeaderAvatar) chatHeaderAvatar.src = '';
        if (chatStatusSpan) {
            chatStatusSpan.textContent = '';
            chatStatusSpan.classList.remove('online', 'offline');
        }

        // Reset aktywnej konwersacji na liście
        document.querySelectorAll('.convo-item').forEach(item => item.classList.remove('active'));

        // conversationList.innerHTML = ''; // Ta linia usunęłaby wszystkie konwersacje!
                                        // Zostaw ją, jeśli to jest zamierzone zachowanie resetu.
                                        // Jeśli nie, usuń ją lub przenieś do innej funkcji.
    };
});