// extension/content.js

let aiPopup = null;

// --- GESTION DES COULEURS PERSONNALISÉES ---
const DEFAULT_COLORS = {
  backgroundColor: 'rgba(30, 27, 75, 0.95)',
  textColor: '#ffffff'
};

async function getCustomColors() {
  try {
    const result = await chrome.storage.local.get('ai-popup-colors');
    return result['ai-popup-colors'] || DEFAULT_COLORS;
  } catch (e) {
    return DEFAULT_COLORS;
  }
}

async function applyCustomColors(element) {
  const colors = await getCustomColors();
  if (element) {
    element.style.background = colors.backgroundColor;
    element.style.color = colors.textColor;
  }
}

// --- PERSISTANCE DU MODE SURLIGNAGE ---
// Au chargement de la page, on vérifie si le mode est activé
chrome.storage.local.get(['highlightMode'], (result) => {
    if (result.highlightMode) {
        document.body.classList.add('gemini-mode');
    }
});

// Écoute les changements de storage (pour sync entre onglets)
chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.highlightMode) {
        if (changes.highlightMode.newValue) {
            document.body.classList.add('gemini-mode');
        } else {
            document.body.classList.remove('gemini-mode');
        }
    }
});

// Écoute les demandes du Background
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  
  if (request.action === "explainText") {
    handleTextExplanation();
  } 
  else if (request.action === "startCapture") {
    createCropOverlay();
  }
  else if (request.action === "toggleHighlight") {
    toggleHighlightMode();
  }
  else if (request.action === "updateColors") {
    if (aiPopup && request.colors) {
      aiPopup.style.background = request.colors.backgroundColor;
      aiPopup.style.color = request.colors.textColor;
    }
  }
});


// --- FONCTIONNALITÉ 1 : MODE SURLIGNAGE (PERSISTANT) ---
function toggleHighlightMode() {
    const body = document.body;
    const isActive = body.classList.contains('gemini-mode');
    
    // On inverse l'état
    const newState = !isActive;

    // On met à jour le storage (ce qui déclenchera l'écouteur onChanged ci-dessus)
    chrome.storage.local.set({ highlightMode: newState }, () => {
        // Feedback visuel
        if (newState) {
            showNotification("✨ Mode Surlignage ACTIVÉ");
        } else {
            showNotification("⚪ Mode Surlignage DÉSACTIVÉ");
        }
    });
}


// --- FONCTIONNALITÉ 2 : EXPLIQUER TEXTE ---
function handleTextExplanation() {
  const selectedText = window.getSelection().toString().trim();

  if (!selectedText) {
    showNotification("⚠️ Veuillez surligner du texte avant d'utiliser ce raccourci.");
    return;
  }

  createAIPopup("Analyse en cours...", true);

  chrome.runtime.sendMessage(
    { action: "getExplanation", text: selectedText },
    (response) => {
      if (response && response.explanation) {
        updatePopupContent(response.explanation);
      } else if (response && response.error) {
        updatePopupContent(`❌ Erreur: ${response.error}`);
      } else {
        updatePopupContent("❌ Erreur inconnue ou pas de réponse.");
      }
    }
  );
}


// --- FONCTIONNALITÉ 3 : CAPTURE D'ÉCRAN (CROP) ---
function createCropOverlay() {
  const overlay = document.createElement('div');
  overlay.className = 'ai-crop-overlay';

  const selection = document.createElement('div');
  selection.className = 'ai-crop-selection';
  
  overlay.appendChild(selection);
  document.body.appendChild(overlay);

  let startX, startY;

  const onMouseDown = (e) => {
    startX = e.clientX;
    startY = e.clientY;
    selection.style.display = 'block';
    selection.style.width = '0px';
    selection.style.height = '0px';
    selection.style.left = startX + 'px';
    selection.style.top = startY + 'px';

    overlay.addEventListener('mousemove', onMouseMove);
    overlay.addEventListener('mouseup', onMouseUp);
  };

  const onMouseMove = (e) => {
    const currentX = e.clientX;
    const currentY = e.clientY;
    const width = Math.abs(currentX - startX);
    const height = Math.abs(currentY - startY);
    const left = Math.min(currentX, startX);
    const top = Math.min(currentY, startY);

    selection.style.width = width + 'px';
    selection.style.height = height + 'px';
    selection.style.left = left + 'px';
    selection.style.top = top + 'px';
  };

  const onMouseUp = (e) => {
    overlay.removeEventListener('mousemove', onMouseMove);
    overlay.removeEventListener('mouseup', onMouseUp);
    overlay.removeEventListener('mousedown', onMouseDown);
    document.body.removeChild(overlay);

    const rect = {
      x: parseInt(selection.style.left),
      y: parseInt(selection.style.top),
      width: parseInt(selection.style.width),
      height: parseInt(selection.style.height)
    };

    if (rect.width > 10 && rect.height > 10) {
      createAIPopup("Analyse de l'image...", true);
      
      chrome.runtime.sendMessage({
        action: "captureArea",
        area: rect,
        devicePixelRatio: window.devicePixelRatio
      }, (response) => {
        if (response && response.explanation) {
            updatePopupContent(response.explanation);
        } else {
            updatePopupContent("❌ Erreur : " + (response ? response.error : "Inconnue"));
        }
      });
    }
  };

  overlay.addEventListener('mousedown', onMouseDown);
}


// --- UI / GESTION DU POPUP & NOTIFICATIONS ---

function createAIPopup(initialText, isLoading = false) {
  if (aiPopup) {
    aiPopup.remove();
  }

  aiPopup = document.createElement('div');
  aiPopup.id = 'ai-explainer-popup';
  aiPopup.className = 'ai-explainer-container glass';

  let contentHTML = '';
  if (isLoading) {
      contentHTML = `<div style="display:flex; align-items:center;">
                     </div>`;
  } else {
      contentHTML = initialText;
  }

  aiPopup.innerHTML = `
    <div class="ai-explainer-content">
        ${contentHTML}
    </div>
  `;

  const closeBtn = aiPopup.querySelector('.ai-close-btn');
  if (closeBtn) {
      closeBtn.onclick = () => aiPopup.remove();
  }

  applyCustomColors(aiPopup);

  document.body.appendChild(aiPopup);

  setTimeout(() => {
    document.addEventListener('click', closePopupOutside);
  }, 100);
}

function updatePopupContent(explanation) {
  if (!aiPopup) return;

  const contentDiv = aiPopup.querySelector('.ai-explainer-content');
  contentDiv.innerHTML = `
    <div class="ai-explainer-explanation">
      ${formatExplanation(explanation)}
    </div>
  `;
}

function formatExplanation(text) {
    if (!text) return "";
    let formatted = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    
    return formatted
        .split('\n\n')
        .map(paragraph => `<p>${paragraph}</p>`)
        .join('');
}

function closePopupOutside(e) {
  if (aiPopup && !aiPopup.contains(e.target)) {
    aiPopup.remove();
    aiPopup = null;
    document.removeEventListener('click', closePopupOutside);
  }
}

function showNotification(message) {
  const notification = document.createElement('div');
  notification.className = 'ai-explainer-notification';
  notification.textContent = message;
  document.body.appendChild(notification);

  setTimeout(() => { notification.classList.add('show'); }, 10);

  setTimeout(() => {
    notification.classList.remove('show');
    setTimeout(() => notification.remove(), 300);
  }, 3000);
}