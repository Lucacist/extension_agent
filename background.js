// Background Script - Gère les appels via le Proxy (Tunnel)

// ---------------------------------------------------------
// 🔴 COLLE TON LIEN VERCEL ICI (n'oublie pas /api/relay à la fin)
const PROXY_URL = "https://adblock-dcn7y0b7n-adblocks-projects.vercel.app//api/relay"; 
// ---------------------------------------------------------


// Écouter le raccourci clavier
chrome.commands.onCommand.addListener((command) => {
  if (command === "explain-text") {
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
        console.error("Erreur API:", error);
        sendResponse({ error: error.message });
      });
    return true; // Réponse asynchrone
  }
});

// Fonction principale d'orchestration
async function getAIExplanation(text) {
  const config = await chrome.storage.sync.get(['apiKey', 'apiProvider', 'model']);

  if (!config.apiKey) {
    throw new Error("Clé API manquante. Veuillez la configurer dans l'extension.");
  }

  const provider = config.apiProvider || 'openai';
  const model = config.model || (provider === 'gemini' ? 'gemini-1.5-flash' : 'gpt-3.5-turbo');

  // 1. On prépare le payload (le corps du message) spécifique à chaque IA
  let payload = {};

  if (provider === 'openai') {
    payload = {
      model: model,
      messages: [
        { role: 'system', content: 'Tu es un assistant pédagogique qui explique de manière simple et claire en français.' },
        { role: 'user', content: `Explique-moi ce texte simplement:\n\n"${text}"` }
      ],
      temperature: 0.7,
      max_tokens: 500
    };
  } 
  else if (provider === 'anthropic') {
    payload = {
      model: model || 'claude-3-haiku-20240307',
      max_tokens: 500,
      messages: [{ role: 'user', content: `Explique-moi ce texte simplement:\n\n"${text}"` }]
    };
  } 
  else if (provider === 'gemini') {
    payload = {
      contents: [{ parts: [{ text: `Explique-moi ce texte simplement:\n\n"${text}"` }] }],
      generationConfig: { temperature: 0.7, maxOutputTokens: 500 }
    };
  }

  // 2. On envoie tout ça à TON Proxy
  const data = await callProxy(provider, model, payload, config.apiKey);

  // 3. On extrait la réponse (Le parsing dépend de l'IA)
  return parseResponse(provider, data);
}


// --- FONCTION QUI APPELLE TON SERVEUR VERCEL ---
async function callProxy(provider, model, payload, userApiKey) {
  try {
    const response = await fetch(PROXY_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // C'est ici qu'on envoie la clé de l'utilisateur de manière sécurisée
        "x-user-key": userApiKey 
      },
      body: JSON.stringify({
        provider: provider,
        model: model,
        payload: payload
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error?.message || errorData.error || `Erreur Proxy (${response.status})`);
    }

    return await response.json();

  } catch (error) {
    console.error("Erreur réseau ou proxy:", error);
    throw error;
  }
}


// --- FONCTION DE PARSING (Extraction du texte) ---
function parseResponse(provider, data) {
  try {
    if (provider === 'openai') {
      return data.choices[0].message.content;
    } 
    else if (provider === 'anthropic') {
      return data.content[0].text;
    } 
    else if (provider === 'gemini') {
      // Sécurités pour éviter les crashs si Gemini répond bizarrement
      if (!data.candidates || !data.candidates[0]?.content?.parts?.[0]?.text) {
        console.error('Structure réponse Gemini invalide:', data);
        throw new Error("Réponse Gemini illisible (peut-être bloquée par sécurité)");
      }
      return data.candidates[0].content.parts[0].text;
    }
  } catch (e) {
    throw new Error("Impossible de lire la réponse de l'IA : " + e.message);
  }
}