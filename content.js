// extension/content.js

let aiPopup = null;

// Écoute les demandes du Background
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "explainText") {
    handleTextExplanation();
  } 
  else if (request.action === "startCapture") {
    createCropOverlay();
  }
});

// --- 1. LOGIQUE TEXTE ---

function handleTextExplanation() {
  const selectedText = window.getSelection().toString().trim();

  if (!selectedText) {
    showNotification("⚠️ Veuillez surligner du texte avant d'utiliser ce raccourci.");
    return;
  }

  createAIPopup("", true);

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

// --- 2. LOGIQUE IMAGE (CROP) ---

function createCropOverlay() {
  const overlay = document.createElement('div');
  overlay.className = 'ai-crop-overlay'; // Classe CSS

  const selection = document.createElement('div');
  selection.className = 'ai-crop-selection'; // Classe CSS
  
  overlay.appendChild(selection);
  document.body.appendChild(overlay);

  let startX, startY;

  const onMouseDown = (e) => {
    startX = e.clientX;
    startY = e.clientY;
    selection.style.display = 'block';
    
    // Reset dimensions (Les styles dynamiques de position restent en JS)
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
      createAIPopup("", true);
      
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

// --- 3. UI / POPUP / NOTIFICATIONS ---

function createAIPopup(initialText, isLoading = false) {
  if (aiPopup) {
    aiPopup.remove();
  }

  aiPopup = document.createElement('div');
  aiPopup.id = 'ai-explainer-popup';
  // On utilise les classes CSS définies dans style.css
  aiPopup.className = 'ai-explainer-container glass';

  let contentHTML = '';
  if (isLoading) {
      // Utilisation de la classe ai-spinner au lieu du style inline
      contentHTML = `<div style="display:flex; align-items:center;">
                        <span>${initialText}</span>
                     </div>`;
  } else {
      contentHTML = initialText;
  }

  // Structure HTML utilisant les classes CSS pour le header et le bouton close
  aiPopup.innerHTML = `
    <div class="ai-explainer-content">
        ${contentHTML}
    </div>
  `;

  // Gestionnaire de fermeture
  const closeBtn = aiPopup.querySelector('.ai-close-btn');
  if (closeBtn) {
      closeBtn.onclick = () => aiPopup.remove();
  }

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
  notification.className = 'ai-explainer-notification'; // Utilise la classe CSS
  notification.textContent = message;
  document.body.appendChild(notification);

  // L'animation est gérée par la classe .show dans le CSS
  setTimeout(() => { notification.classList.add('show'); }, 10);

  setTimeout(() => {
    notification.classList.remove('show');
    setTimeout(() => notification.remove(), 300);
  }, 3000);
}