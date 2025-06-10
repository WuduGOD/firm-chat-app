// Deklarujemy i eksportujemy funkcje na najwyższym poziomie
export let openChatPanel;
export let closeChatPanel;
export let resetUI;

document.addEventListener('DOMContentLoaded', () => {
    const appContainer = document.querySelector('.app-container');
    const convoItems = document.querySelectorAll('.convo-item');
    const backToListBtn = document.querySelector('.back-to-list-btn');
    const accountIcon = document.querySelector('.account-icon');
    const accountPanel = document.querySelector('.account-panel');
    const closeAccountBtn = document.querySelector('.close-account-btn');
    const flowBar = document.querySelector('.flow-bar');
    const contextCapsule = document.querySelector('.context-capsule');
    const closeCapsuleBtn = document.querySelector('.close-capsule-btn');
    const whisperModeBtn = document.querySelector('.whisper-mode-btn');
    const chatContentView = document.querySelector('.chat-content-view');
    const chatInputArea = document.querySelector('.chat-input-area');
    const navIcons = document.querySelectorAll('.nav-icon');
    const searchInput = document.querySelector('.search-input');
    const filterBtn = document.querySelector('.filter-btn');

    let currentActiveConvo = null; // Przechowuje aktualnie aktywną konwersację
    let whisperModeActive = false; // Stan trybu szeptu

    // --- Obsługa kliknięć na konwersacje ---
    convoItems.forEach(item => {
        item.addEventListener('click', () => {
            // Usuń klasę 'active' z poprzedniej aktywnej konwersacji
            if (currentActiveConvo) {
                currentActiveConvo.classList.remove('active');
            }
            // Dodaj klasę 'active' do klikniętej konwersacji
            item.classList.add('active');
            currentActiveConvo = item;

            // Dodaj klasę 'chat-open' do głównego kontenera aplikacji
            // To wywoła animację otwierania panelu czatu i zwężania listy
            appContainer.classList.add('chat-open');

            // Aktywuj animację aktywności na liczniku nieprzeczytanych (jeśli istnieje)
            const unreadCount = item.querySelector('.unread-count');
            if (unreadCount) {
                unreadCount.classList.add('animate-activity');
                setTimeout(() => {
                    unreadCount.classList.remove('animate-activity');
                }, 500); // Czas trwania animacji elasticExpand
            }
        });
    });

    // --- Obsługa przycisku "Wróć do listy" w czacie ---
    if (backToListBtn) {
        backToListBtn.addEventListener('click', () => {
            // Usuń klasę 'chat-open' z głównego kontenera aplikacji
            // To wywoła animację zamykania panelu czatu i rozszerzania listy
            appContainer.classList.remove('chat-open');

            // Opcjonalnie: Usuń klasę 'active' z aktywnej konwersacji po powrocie
            // if (currentActiveConvo) {
            //     currentActiveConvo.classList.remove('active');
            // }

            // Wyłącz tryb szeptu po powrocie do listy
            if (whisperModeActive) {
                toggleWhisperMode();
            }
        });
    }

    // --- Obsługa otwierania/zamykania panelu konta ---
    if (accountIcon && accountPanel && closeAccountBtn) {
        accountIcon.addEventListener('click', () => {
            accountPanel.classList.remove('hidden'); // Upewnij się, że nie ma display:none
            setTimeout(() => { // Mały delay, aby transition zadziałało
                accountPanel.classList.add('active');
                // Opcjonalnie: rozmyj tło aplikacji, jeśli to pożądane
                // appContainer.classList.add('blurred');
            }, 10);
        });

        closeAccountBtn.addEventListener('click', () => {
            accountPanel.classList.remove('active');
            // appContainer.classList.remove('blurred');
            setTimeout(() => {
                accountPanel.classList.add('hidden'); // Ukryj po animacji
            }, 300); // Czas musi odpowiadać transition-duration
        });
    }

    // --- Obsługa otwierania/zamykania kapsuły kontekstu (Flow Bar) ---
    if (flowBar && contextCapsule && closeCapsuleBtn) {
        flowBar.addEventListener('click', () => {
            contextCapsule.classList.remove('hidden'); // Upewnij się, że nie ma display:none
            setTimeout(() => { // Mały delay, aby transition zadziałało
                contextCapsule.classList.add('active');
                // Opcjonalnie: rozmyj tło aplikacji
                // appContainer.classList.add('blurred');
            }, 10);
        });

        closeCapsuleBtn.addEventListener('click', () => {
            contextCapsule.classList.remove('active');
            // appContainer.classList.remove('blurred');
            setTimeout(() => {
                contextCapsule.classList.add('hidden'); // Ukryj po animacji
            }, 300); // Czas musi odpowiadać transition-duration
        });
    }

    // --- Obsługa trybu "Szeptu" (Whisper Mode) ---
    if (whisperModeBtn && chatContentView && chatInputArea) {
        whisperModeBtn.addEventListener('click', toggleWhisperMode);

        function toggleWhisperMode() {
            whisperModeActive = !whisperModeActive;
            chatContentView.classList.toggle('blurred-focus', whisperModeActive);
            chatInputArea.classList.toggle('blurred-focus-input', whisperModeActive);
            whisperModeBtn.classList.toggle('active', whisperModeActive); // Dodaj klasę active, jeśli chcesz zmienić styl przycisku
        }
    }


    // --- Obsługa aktywnych ikon nawigacyjnych w sidebarze ---
    if (navIcons.length > 0) {
        navIcons.forEach(icon => {
            icon.addEventListener('click', () => {
                navIcons.forEach(i => i.classList.remove('active')); // Usuń 'active' ze wszystkich
                icon.classList.add('active'); // Dodaj 'active' do klikniętej
            });
        });
        // Ustaw domyślną aktywną ikonę po załadowaniu
        const defaultActiveIcon = document.querySelector('.nav-icon[data-tooltip="Główne"]');
        if (defaultActiveIcon) {
            defaultActiveIcon.classList.add('active');
        }
    }

    // --- Obsługa Tooltipów ---
    const tooltip = document.createElement('div');
    tooltip.classList.add('tooltip');
    document.body.appendChild(tooltip);

    document.querySelectorAll('[data-tooltip]').forEach(element => {
        element.addEventListener('mouseenter', (e) => {
            const text = e.target.getAttribute('data-tooltip');
            if (text) {
                tooltip.textContent = text;
                tooltip.style.opacity = '1';
                tooltip.style.pointerEvents = 'auto'; // Umożliwia widoczność

                // Pozycjonowanie tooltipa
                const rect = e.target.getBoundingClientRect();
                // Dla sidebara, tooltip powinien być po prawej stronie elementu
                const isSidebarElement = e.target.closest('.sidebar');
                if (isSidebarElement) {
                    tooltip.style.left = `${rect.right + 10}px`; // 10px odstępu od prawej krawędzi elementu
                    tooltip.style.top = `${rect.top + rect.height / 2 - tooltip.offsetHeight / 2}px`; // Wyśrodkuj pionowo
                    tooltip.style.transform = 'none'; // Reset transform z CSS, jeśli jest
                } else {
                    // Domyślne pozycjonowanie dla innych tooltipów (np. obrazków)
                    tooltip.style.left = `${rect.left + rect.width / 2}px`;
                    tooltip.style.top = `${rect.top - 10}px`;
                    tooltip.style.transform = `translate(-50%, -100%)`; // Pozycja nad elementem
                }
            }
        });

        element.addEventListener('mouseleave', () => {
            tooltip.style.opacity = '0';
            tooltip.style.pointerEvents = 'none'; // Wyłącz interakcje
        });
    });

    // --- Obsługa wyszukiwania (rozszerzanie pola i pokazywanie filtra) ---
    if (searchInput && filterBtn) {
        searchInput.addEventListener('focus', () => {
            searchInput.style.width = '180px'; // Rozszerz na focus
            filterBtn.style.opacity = '1'; // Pokaż przycisk
        });

        searchInput.addEventListener('blur', () => {
            if (searchInput.value === '') {
                searchInput.style.width = '120px'; // Zwiń, jeśli puste
                filterBtn.style.opacity = '0'; // Ukryj przycisk
            }
        });
    }

});