// Script pour gérer le popup de configuration

document.addEventListener('DOMContentLoaded', async () => {
  const form = document.getElementById('config-form');
  const apiProviderSelect = document.getElementById('api-provider');
  const apiKeyInput = document.getElementById('api-key');
  const modelSelect = document.getElementById('model');
  const statusDiv = document.getElementById('status');

  // Charger la configuration existante
  const config = await chrome.storage.sync.get(['apiKey', 'apiProvider', 'model']);

  if (config.apiProvider) {
    apiProviderSelect.value = config.apiProvider;
    updateModelOptions(config.apiProvider);
  }

  if (config.apiKey) {
    apiKeyInput.value = config.apiKey;
  }

  if (config.model) {
    modelSelect.value = config.model;
  }

  // Mettre à jour les options de modèle quand le fournisseur change
  apiProviderSelect.addEventListener('change', (e) => {
    updateModelOptions(e.target.value);
  });

  // Gérer la soumission du formulaire
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const apiProvider = apiProviderSelect.value;
    const apiKey = apiKeyInput.value.trim();
    const model = modelSelect.value;

    if (!apiKey) {
      showStatus('Veuillez entrer une clé API', 'error');
      return;
    }

    try {
      // Sauvegarder la configuration
      await chrome.storage.sync.set({
        apiProvider,
        apiKey,
        model
      });

      showStatus('✅ Configuration enregistrée avec succès !', 'success');

      // Fermer le popup après 1.5 secondes
      setTimeout(() => {
        window.close();
      }, 1500);
    } catch (error) {
      showStatus('❌ Erreur lors de l\'enregistrement', 'error');
      console.error(error);
    }
  });
});

function updateModelOptions(provider) {
  const modelSelect = document.getElementById('model');
  modelSelect.innerHTML = '';

  let options = [];

  switch (provider) {
    case 'openai':
      options = [
        { value: 'gpt-3.5-turbo', label: 'GPT-3.5 Turbo (Rapide)' },
        { value: 'gpt-4', label: 'GPT-4 (Plus précis)' },
        { value: 'gpt-4-turbo', label: 'GPT-4 Turbo' },
        { value: 'gpt-4o', label: 'GPT-4o (Dernière version)' }
      ];
      break;
    case 'anthropic':
      options = [
        { value: 'claude-3-haiku-20240307', label: 'Claude 3 Haiku (Rapide)' },
        { value: 'claude-3-sonnet-20240229', label: 'Claude 3 Sonnet (Équilibré)' },
        { value: 'claude-3-opus-20240229', label: 'Claude 3 Opus (Plus puissant)' }
      ];
      break;
    case 'gemini':
      options = [
        { value: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash (Rapide)' },
        { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash (Très rapide)' },
        { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro (Plus puissant)' }
      ];
      break;
  }

  options.forEach(option => {
    const optionElement = document.createElement('option');
    optionElement.value = option.value;
    optionElement.textContent = option.label;
    modelSelect.appendChild(optionElement);
  });
}

function showStatus(message, type) {
  const statusDiv = document.getElementById('status');
  statusDiv.textContent = message;
  statusDiv.className = `status ${type}`;
  statusDiv.style.display = 'block';

  if (type === 'success') {
    setTimeout(() => {
      statusDiv.style.display = 'none';
    }, 3000);
  }
}
