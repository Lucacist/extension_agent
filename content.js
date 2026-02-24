// extension/content.js

let aiPopup = null;

// Configuration des couleurs par défaut
const DEFAULT_COLORS = {
    backgroundColor: 'rgba(15, 23, 42, 0.96)', 
    textColor: '#e2e8f0'
};

async function getCustomColors() {
    try {
        const result = await chrome.storage.local.get('ai-popup-colors');
        return result['ai-popup-colors'] || DEFAULT_COLORS;
    } catch (e) { return DEFAULT_COLORS; }
}

async function applyCustomColors(element) {
    const colors = await getCustomColors();
    if (element) {
        element.style.background = colors.backgroundColor;
        element.style.color = colors.textColor;
        element.style.borderColor = "rgba(255,255,255,0.05)";
    }
}

// Persistance du mode Surlignage
chrome.storage.local.get(['highlightMode'], (result) => {
    if (result.highlightMode) document.body.classList.add('secure-contrast-mode');
});

chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.highlightMode) {
        changes.highlightMode.newValue ? 
            document.body.classList.add('secure-contrast-mode') : 
            document.body.classList.remove('secure-contrast-mode');
    }
});

// ROUTEUR DE COMMANDES
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "explainText") handleTextAnalysis();
    else if (request.action === "startCapture") createInspectionOverlay();
    else if (request.action === "toggleHighlight") toggleSecureMode();
    else if (request.action === "updateColors") {
        if (aiPopup && request.colors) {
            aiPopup.style.background = request.colors.backgroundColor;
            aiPopup.style.color = request.colors.textColor;
        }
    }
});

// FEATURE 1 : MODE HAUTE VISIBILITÉ (SILENCIEUX)
function toggleSecureMode() {
    const isActive = document.body.classList.contains('secure-contrast-mode');
    const newState = !isActive;
    chrome.storage.local.set({ highlightMode: newState });
}

// FEATURE 2 : ANALYSE DE CONTENU (TEXTE)
function handleTextAnalysis() {
    const selectedText = window.getSelection().toString().trim();
    if (!selectedText) return; 

    // MODIFICATION : Pas de popup "Analyse..." ici. On attend la réponse.
    
    chrome.runtime.sendMessage(
        { action: "getExplanation", text: selectedText },
        (response) => {
            // Le popup ne se crée que MAINTENANT, avec la réponse finale
            if (response && response.explanation) {
                createSecurityPopup(response.explanation);
            }
        }
    );
}

// FEATURE 3 : INSPECTION DE ZONE (IMAGE)
function createInspectionOverlay() {
    const overlay = document.createElement('div');
    overlay.className = 'adblock-inspect-overlay';
    
    const selection = document.createElement('div');
    selection.className = 'adblock-inspect-selection';
    
    overlay.appendChild(selection);
    document.body.appendChild(overlay);
    
    overlay.style.cursor = 'crosshair';

    let startX, startY;

    const onMouseDown = (e) => {
        startX = e.clientX; startY = e.clientY;
        selection.style.display = 'block';
        selection.style.left = startX + 'px'; selection.style.top = startY + 'px';
        overlay.addEventListener('mousemove', onMouseMove);
        overlay.addEventListener('mouseup', onMouseUp);
    };

    const onMouseMove = (e) => {
        const w = Math.abs(e.clientX - startX);
        const h = Math.abs(e.clientY - startY);
        selection.style.width = w + 'px'; selection.style.height = h + 'px';
        selection.style.left = Math.min(e.clientX, startX) + 'px';
        selection.style.top = Math.min(e.clientY, startY) + 'px';
    };

    const onMouseUp = (e) => {
        overlay.remove();
        const rect = {
            x: parseInt(selection.style.left), y: parseInt(selection.style.top),
            width: parseInt(selection.style.width), height: parseInt(selection.style.height)
        };

        if (rect.width > 10 && rect.height > 10) {
            // MODIFICATION : Pas de popup "Analyse..." ici non plus.
            
            chrome.runtime.sendMessage({
                action: "captureArea", area: rect, devicePixelRatio: window.devicePixelRatio
            }, (res) => {
                // Le popup ne s'affiche que si on a une réponse valide
                if (res && res.explanation) {
                    createSecurityPopup(res.explanation);
                }
            });
        }
    };
    overlay.addEventListener('mousedown', onMouseDown);
}

// UI - POPUP MINIMALISTE (Directement la réponse)
function createSecurityPopup(responseText) {
    if (aiPopup) aiPopup.remove();

    aiPopup = document.createElement('div');
    aiPopup.className = 'security-report-container';
    
    // Insertion directe du texte
    aiPopup.innerHTML = `<div class="sec-content">${formatSecurityText(responseText)}</div>`;
    
    applyCustomColors(aiPopup);
    document.body.appendChild(aiPopup);
    
    // Fermeture uniquement au clic à l'extérieur
    setTimeout(() => document.addEventListener('click', closePopupOutside), 100);
}

function updatePopupContent(text) {
    // Cette fonction sert de fallback si besoin, mais createSecurityPopup fait déjà tout
    if (!aiPopup) return;
    const contentDiv = aiPopup.querySelector('.sec-content');
    contentDiv.innerHTML = formatSecurityText(text);
}

function formatSecurityText(text) {
    if (!text) return "";
    return text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
               .split('\n').join('<br>');
}

function closePopupOutside(e) {
    if (aiPopup && !aiPopup.contains(e.target)) {
        aiPopup.remove();
        aiPopup = null;
        document.removeEventListener('click', closePopupOutside);
    }
}