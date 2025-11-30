// Script pour gérer le popup de configuration (Version Gemini Only - Modèles Stables)

const DEFAULT_COLORS = {
  backgroundColor: 'rgba(255, 255, 255, 0.329)',
  textColor: '#ffffff'
};

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

  // 4. Initialiser la personnalisation des couleurs
  initColorCustomization();
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

function showColorStatus(message, type) {
  const statusDiv = document.getElementById('color-status');
  if (statusDiv) {
      statusDiv.textContent = message;
      statusDiv.className = `status ${type}`;
      statusDiv.style.display = 'block';

      if (type === 'success') {
        setTimeout(() => {
          statusDiv.style.display = 'none';
        }, 2000);
      }
  }
}

// --- GESTION DES COULEURS PERSONNALISÉES ---

function initColorCustomization() {
  const bgColorInput = document.getElementById('bg-color');
  const bgOpacityInput = document.getElementById('bg-opacity');
  const opacityValue = document.getElementById('opacity-value');
  const textColorInput = document.getElementById('text-color');
  const saveBtn = document.getElementById('save-colors');
  const resetBtn = document.getElementById('reset-colors');

  // Charger les couleurs sauvegardées
  loadSavedColors();

  // Mettre à jour l'affichage de l'opacité
  bgOpacityInput.addEventListener('input', () => {
    opacityValue.textContent = bgOpacityInput.value + '%';
  });

  // Sauvegarder les couleurs
  saveBtn.addEventListener('click', async () => {
    const bgColor = bgColorInput.value;
    const opacity = bgOpacityInput.value / 100;
    const textColor = textColorInput.value;

    // Convertir hex en rgba
    const r = parseInt(bgColor.slice(1, 3), 16);
    const g = parseInt(bgColor.slice(3, 5), 16);
    const b = parseInt(bgColor.slice(5, 7), 16);
    const backgroundColor = `rgba(${r}, ${g}, ${b}, ${opacity})`;

    const colors = { backgroundColor, textColor };

    try {
      // Sauvegarder dans chrome.storage.local pour que tous les onglets y aient accès
      await chrome.storage.local.set({ 'ai-popup-colors': colors });
      
      // Notifier tous les onglets du changement
      chrome.tabs.query({}, (tabs) => {
        tabs.forEach(tab => {
          chrome.tabs.sendMessage(tab.id, { 
            action: 'updateColors', 
            colors: colors 
          }).catch(() => {
            // Ignorer les erreurs pour les onglets qui n'ont pas le content script
          });
        });
      });

      showColorStatus('✅ Couleurs enregistrées !', 'success');
    } catch (error) {
      showColorStatus('❌ Erreur lors de la sauvegarde', 'error');
      console.error(error);
    }
  });

  // Réinitialiser les couleurs
  resetBtn.addEventListener('click', async () => {
    try {
      await chrome.storage.local.set({ 'ai-popup-colors': DEFAULT_COLORS });
      
      // Notifier tous les onglets du changement
      chrome.tabs.query({}, (tabs) => {
        tabs.forEach(tab => {
          chrome.tabs.sendMessage(tab.id, { 
            action: 'updateColors', 
            colors: DEFAULT_COLORS 
          }).catch(() => {});
        });
      });

      loadSavedColors();
      showColorStatus('✅ Couleurs réinitialisées !', 'success');
    } catch (error) {
      showColorStatus('❌ Erreur lors de la réinitialisation', 'error');
      console.error(error);
    }
  });
}

async function loadSavedColors() {
  const bgColorInput = document.getElementById('bg-color');
  const bgOpacityInput = document.getElementById('bg-opacity');
  const opacityValue = document.getElementById('opacity-value');
  const textColorInput = document.getElementById('text-color');

  try {
    const result = await chrome.storage.local.get('ai-popup-colors');
    const colors = result['ai-popup-colors'] || DEFAULT_COLORS;

    // Extraire la couleur et l'opacité du background
    const rgbaMatch = colors.backgroundColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+),?\s*([\d.]+)?\)/);
    if (rgbaMatch) {
      const r = parseInt(rgbaMatch[1]);
      const g = parseInt(rgbaMatch[2]);
      const b = parseInt(rgbaMatch[3]);
      const a = rgbaMatch[4] ? parseFloat(rgbaMatch[4]) : 1;
      
      const hexColor = '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');
      bgColorInput.value = hexColor;
      
      const opacityPercent = Math.round(a * 100);
      bgOpacityInput.value = opacityPercent;
      opacityValue.textContent = opacityPercent + '%';
    }

    // Extraire la couleur du texte
    if (colors.textColor.startsWith('#')) {
      textColorInput.value = colors.textColor;
    } else if (colors.textColor.startsWith('rgb')) {
      const rgbMatch = colors.textColor.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
      if (rgbMatch) {
        const hexColor = '#' + [rgbMatch[1], rgbMatch[2], rgbMatch[3]].map(x => parseInt(x).toString(16).padStart(2, '0')).join('');
        textColorInput.value = hexColor;
      }
    }
  } catch (error) {
    console.error('Erreur lors du chargement des couleurs:', error);
  }
}