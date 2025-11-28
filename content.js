// Content Script - Capte le texte surligné et affiche le popup

let aiPopup = null;

// Écouter le raccourci clavier depuis le background
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "explainText") {
    handleTextExplanation();
  }
});

function handleTextExplanation() {
  // Récupérer le texte surligné
  const selectedText = window.getSelection().toString().trim();

  if (!selectedText) {
    showNotification("⚠️ Veuillez surligner du texte avant d'utiliser ce raccourci.");
    return;
  }

  // Récupérer la position de la sélection pour placer le popup
  const selection = window.getSelection();
  const range = selection.getRangeAt(0);
  const rect = range.getBoundingClientRect();

  // Créer et afficher le popup
  createAIPopup(selectedText, rect);

  // Envoyer le texte au background pour traitement IA
  chrome.runtime.sendMessage(
    { action: "getExplanation", text: selectedText },
    (response) => {
      if (response && response.explanation) {
        updatePopupContent(response.explanation);
      } else if (response && response.error) {
        updatePopupContent(`❌ Erreur: ${response.error}`);
      }
    }
  );
}

function createAIPopup(text, rect) {
  // Supprimer l'ancien popup s'il existe
  if (aiPopup) {
    aiPopup.remove();
  }

  // Créer le conteneur du popup
  aiPopup = document.createElement('div');
  aiPopup.id = 'ai-explainer-popup';
  aiPopup.className = 'ai-explainer-container glass';

  // Calculer la position (au-dessus du texte surligné)
  aiPopup.style.position = 'fixed';
  aiPopup.style.bottom = '20px';
  aiPopup.style.right = '20px';
  aiPopup.style.top = 'auto';
  aiPopup.style.left = 'auto';

  // Contenu initial du popup
  aiPopup.innerHTML = `
    <div class="ai-explainer-content">
    </div>
  `;

  document.body.appendChild(aiPopup);

  // Fermer en cliquant à l'extérieur
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
  // Convertir le texte en HTML avec formatage basique
  return text
    .split('\n\n')
    .map(paragraph => `<p>${escapeHtml(paragraph)}</p>`)
    .join('');
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
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

  setTimeout(() => {
    notification.classList.add('show');
  }, 10);

  setTimeout(() => {
    notification.classList.remove('show');
    setTimeout(() => notification.remove(), 300);
  }, 3000);
}
