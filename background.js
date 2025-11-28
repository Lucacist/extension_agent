// Background Script - Gère les commandes et les appels API

// Écouter le raccourci clavier
chrome.commands.onCommand.addListener((command) => {
  if (command === "explain-text") {
    // Envoyer un message au content script de l'onglet actif
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, { action: "explainText" });
      }
    });
  }
});

// Écouter les demandes d'explication
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "getExplanation") {
    getAIExplanation(request.text)
      .then(explanation => {
        sendResponse({ explanation });
      })
      .catch(error => {
        console.error("Erreur lors de l'appel à l'API:", error);
        sendResponse({ error: error.message });
      });
    return true; // Indique que la réponse sera asynchrone
  }
});

// Fonction pour appeler l'API IA
async function getAIExplanation(text) {
  // Récupérer la configuration depuis le storage
  const config = await chrome.storage.sync.get(['apiKey', 'apiProvider', 'model']);

  if (!config.apiKey) {
    throw new Error("Clé API non configurée. Veuillez configurer votre clé API dans les paramètres de l'extension.");
  }

  const provider = config.apiProvider || 'openai';
  const model = config.model || 'gpt-3.5-turbo';

  // Appeler l'API appropriée
  switch (provider) {
    case 'openai':
      return await callOpenAI(text, config.apiKey, model);
    case 'anthropic':
      return await callAnthropic(text, config.apiKey, model);
    case 'gemini':
      return await callGemini(text, config.apiKey, model);
    default:
      throw new Error("Fournisseur d'API non supporté");
  }
}

// Appel à l'API OpenAI
async function callOpenAI(text, apiKey, model) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: model,
      messages: [
        {
          role: 'system',
          content: 'Tu es un assistant pédagogique qui explique des textes de manière claire et concise. Fournis des explications en français, structurées et faciles à comprendre.'
        },
        {
          role: 'user',
          content: `Explique-moi ce texte de manière simple et claire:\n\n"${text}"`
        }
      ],
      temperature: 0.7,
      max_tokens: 500
    })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || 'Erreur lors de l\'appel à l\'API OpenAI');
  }

  const data = await response.json();
  return data.choices[0].message.content;
}

// Appel à l'API Anthropic (Claude)
async function callAnthropic(text, apiKey, model) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: model || 'claude-3-haiku-20240307',
      max_tokens: 500,
      messages: [
        {
          role: 'user',
          content: `Explique-moi ce texte de manière simple et claire:\n\n"${text}"`
        }
      ]
    })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || 'Erreur lors de l\'appel à l\'API Anthropic');
  }

  const data = await response.json();
  return data.content[0].text;
}

// Appel à l'API Google Gemini
async function callGemini(text, apiKey, model) {
  const modelName = model || 'gemini-2.0-flash';
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            {
              text: `Explique-moi ce texte de manière simple et claire:\n\n"${text}"`
            }
          ]
        }
      ],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 500
      }
    })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || 'Erreur lors de l\'appel à l\'API Gemini');
  }

    const data = await response.json();
  
  // Log pour debug
  console.log('Réponse complète de Gemini:', JSON.stringify(data, null, 2));
  
  // Vérifier que la réponse contient bien des données
  if (!data.candidates || !data.candidates[0]) {
    console.error('Pas de candidates dans la réponse:', data);
    throw new Error('Réponse invalide de l\'API Gemini - Pas de candidates');
  }
  
  if (!data.candidates[0].content) {
    console.error('Pas de content dans candidates[0]:', data.candidates[0]);
    throw new Error('Réponse invalide de l\'API Gemini - Pas de content');
  }
  
  if (!data.candidates[0].content.parts || !data.candidates[0].content.parts[0]) {
    console.error('Pas de parts dans content:', data.candidates[0].content);
    throw new Error('Réponse invalide de l\'API Gemini - Pas de parts');
  }
  
  return data.candidates[0].content.parts[0].text;
}
