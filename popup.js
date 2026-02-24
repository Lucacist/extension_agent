document.addEventListener('DOMContentLoaded', async () => {
    
    // --- ELEMENTS DOM ---
    const pauseBtn = document.getElementById('pauseBtn');
    const pauseBtnText = document.getElementById('pauseBtnText');
    const statusTitle = document.getElementById('statusTitle');
    const currentDomainEl = document.getElementById('currentDomain');
    const adsCountEl = document.getElementById('adsCount');
    const trackersCountEl = document.getElementById('trackersCount');
    
    // Settings DOM
    const settingsToggle = document.getElementById('settingsToggle');
    const settingsContent = document.getElementById('settingsContent');
    const apiKeyInput = document.getElementById('apiKey');
    const encryptionKeyInput = document.getElementById('encryptionKey');
    const modelSelect = document.getElementById('modelSelect');
    
    // Couleurs
    const bgColorInput = document.getElementById('bgColor');
    const bgOpacityInput = document.getElementById('bgOpacity');
    const textColorInput = document.getElementById('textColor'); // Nouveau champ
    
    const btnSave = document.getElementById('btnSave');
    const saveMsg = document.getElementById('saveMsg');


    // --- 1. LOGIQUE "CAMOUFLAGE" ---
    
    // Récupérer l'URL
    chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
        if (tabs[0]?.url) {
            try {
                const hostname = new URL(tabs[0].url).hostname;
                currentDomainEl.textContent = hostname;
                const isPaused = localStorage.getItem(`paused_${hostname}`) === 'true';
                if (isPaused) setPausedState(true);
            } catch {
                currentDomainEl.textContent = "Page locale";
            }
        }
    });

    // Compteurs Fake
    let totalAds = parseInt(localStorage.getItem('adblock_stats_ads')) || 1428;
    let totalTrackers = parseInt(localStorage.getItem('adblock_stats_trackers')) || 342;

    totalAds += Math.floor(Math.random() * 5) + 1;
    totalTrackers += Math.floor(Math.random() * 2);

    localStorage.setItem('adblock_stats_ads', totalAds);
    localStorage.setItem('adblock_stats_trackers', totalTrackers);

    adsCountEl.textContent = totalAds.toLocaleString();
    trackersCountEl.textContent = totalTrackers.toLocaleString();


    // --- 2. GESTION DU BOUTON PAUSE ---
    pauseBtn.addEventListener('click', () => {
        const body = document.body;
        const isPaused = body.classList.toggle('is-paused');
        const domain = currentDomainEl.textContent;
        
        if (domain !== "Page locale") {
            localStorage.setItem(`paused_${domain}`, isPaused);
        }
        updateUIState(isPaused);
    });

    function setPausedState(isPaused) {
        if (isPaused) document.body.classList.add('is-paused');
        else document.body.classList.remove('is-paused');
        updateUIState(isPaused);
    }

    function updateUIState(isPaused) {
        if (isPaused) {
            statusTitle.textContent = "Protection suspendue";
            pauseBtnText.textContent = "Réactiver la protection";
            pauseBtn.innerHTML = `
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                   <polygon points="5 3 19 12 5 21 5 3"></polygon>
                </svg>
                <span>${pauseBtnText.textContent}</span>`;
        } else {
            statusTitle.textContent = "Protection Active";
            pauseBtnText.textContent = "Mettre en pause sur ce site";
            pauseBtn.innerHTML = `
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                   <rect x="6" y="4" width="4" height="16"></rect>
                   <rect x="14" y="4" width="4" height="16"></rect>
                </svg>
                <span>${pauseBtnText.textContent}</span>`;
        }
    }

    // --- 3. GESTION DU MENU REGLAGES ---
    settingsToggle.addEventListener('click', () => {
        settingsToggle.classList.toggle('open');
        settingsContent.classList.toggle('open');
    });


    // --- 4. LOGIQUE FONCTIONNELLE ---
    
    // Charger la config API
    const config = await chrome.storage.sync.get(['apiKey', 'model', 'encryptionKey']);
    if (config.apiKey) apiKeyInput.value = config.apiKey;
    if (config.model) modelSelect.value = config.model;
    if (config.encryptionKey) encryptionKeyInput.value = config.encryptionKey;

    // Charger la config Couleurs
    const uiConfig = await chrome.storage.local.get('ai-popup-colors');
    if (uiConfig?.['ai-popup-colors']) {
        const c = uiConfig['ai-popup-colors'];
        
        // 1. Background
        const match = c.backgroundColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+),?\s*([\d.]+)?\)/);
        if (match) {
            const r = parseInt(match[1]).toString(16).padStart(2,'0');
            const g = parseInt(match[2]).toString(16).padStart(2,'0');
            const b = parseInt(match[3]).toString(16).padStart(2,'0');
            bgColorInput.value = `#${r}${g}${b}`;
            bgOpacityInput.value = match[4] ? Math.round(parseFloat(match[4]) * 100) : 100;
        }

        // 2. Text Color (Nouveau)
        if (c.textColor) {
            textColorInput.value = c.textColor;
        }
    }

    // Sauvegarder
    btnSave.addEventListener('click', async () => {
        // API
        const apiKey = apiKeyInput.value.trim();
        const model = modelSelect.value;
        const encryptionKey = encryptionKeyInput.value.trim();
        if (apiKey) await chrome.storage.sync.set({ apiKey, model, encryptionKey });

        // Couleurs
        const r = parseInt(bgColorInput.value.slice(1, 3), 16);
        const g = parseInt(bgColorInput.value.slice(3, 5), 16);
        const b = parseInt(bgColorInput.value.slice(5, 7), 16);
        const opacity = bgOpacityInput.value / 100;
        
        const colors = {
            backgroundColor: `rgba(${r}, ${g}, ${b}, ${opacity})`,
            textColor: textColorInput.value // Valeur dynamique
        };
        
        await chrome.storage.local.set({ 'ai-popup-colors': colors });
        
        // Broadcast
        chrome.tabs.query({}, (tabs) => {
            tabs.forEach(tab => chrome.tabs.sendMessage(tab.id, { action: 'updateColors', colors }).catch(() => {}));
        });

        // Feedback
        saveMsg.classList.add('show');
        setTimeout(() => saveMsg.classList.remove('show'), 2000);
    });
});