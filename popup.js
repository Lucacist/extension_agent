// Script pour gérer le popup de configuration (Version Gemini Only - Modèles Stables)

document.addEventListener('DOMContentLoaded', async () => {
  const form = document.getElementById('config-form');
  const apiKeyInput = document.getElementById('api-key');
  const modelSelect = document.getElementById('model');
  
  // 1. Initialiser la liste avec UNIQUEMENT les modèles qui marchent
  initGeminiModels();

  // 2. Charger la configuration existante
  const config = await chrome.storage.sync.get(['apiKey', 'model']);

  if (config.apiKey) {
    apiKeyInput.value = config.apiKey;
  }

  // Si le modèle sauvegardé n'existe plus dans notre liste (ex: 1.5), on sélectionne le défaut
  if (config.model && isModelValid(config.model)) {
    modelSelect.value = config.model;
  } else {
    // Force la sélection du premier modèle valide si l'ancien est obsolète
    modelSelect.selectedIndex = 0;
  }

  // 3. Gérer la soumission du formulaire
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const apiKey = apiKeyInput.value.trim();
    const model = modelSelect.value;

    if (!apiKey) {
      showStatus('Veuillez entrer une clé API Gemini', 'error');
      return;
    }

    try {
      await chrome.storage.sync.set({
        apiKey,
        model,
        apiProvider: 'gemini'
      });

      showStatus('✅ Configuration enregistrée !', 'success');

      setTimeout(() => {
        window.close();
      }, 1500);
      
    } catch (error) {
      showStatus('❌ Erreur', 'error');
      console.error(error);
    }
  });
});

// Liste stricte des modèles fonctionnels
function initGeminiModels() {
  const modelSelect = document.getElementById('model');
  modelSelect.innerHTML = ''; 

  const options = [
    { value: 'gemini-2.0-flash', label: '(Recommandé - Très rapide) Gemini 2.0 Flash' },
    { value: 'gemini-2.5-flash-lite', label: '(Léger & Stable) Gemini 2.5 Flash Lite' }
  ];

  options.forEach(option => {
    const optionElement = document.createElement('option');
    optionElement.value = option.value;
    optionElement.textContent = option.label;
    modelSelect.appendChild(optionElement);
  });
}

// Vérifie si un modèle est dans notre liste autorisée
function isModelValid(modelValue) {
  const validModels = ['gemini-2.0-flash', 'gemini-2.5-flash-lite'];
  return validModels.includes(modelValue);
}

function showStatus(message, type) {
  const statusDiv = document.getElementById('status');
  if (statusDiv) {
      statusDiv.textContent = message;
      statusDiv.className = `status ${type}`;
      statusDiv.style.display = 'block';

      if (type === 'success') {
        setTimeout(() => {
          statusDiv.style.display = 'none';
        }, 3000);
      }
  } else {
      alert(message);
  }
}