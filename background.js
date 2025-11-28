// Background Script - Gère les appels via le Proxy (Tunnel)

// ---------------------------------------------------------
// 🔴 TON LIEN VERCEL
const PROXY_URL = "https://adblock-pn8ub9jkn-adblocks-projects.vercel.app/api/relay";
// ---------------------------------------------------------


// Écouter le raccourci clavier
chrome.commands.onCommand.addListener((command) => {
  if (command === "explain-text") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      // SÉCURITÉ 1 : On vérifie s'il y a une erreur Chrome ou si aucun onglet n'est trouvé
      if (chrome.runtime.lastError) {
        console.warn("Erreur tabs:", chrome.runtime.lastError);
        return;
      }
      if (tabs && tabs.length > 0) {
        chrome.tabs.sendMessage(tabs[0].id, { action: "explainText" }).catch(err => {
            // Ignore l'erreur si le content script n'est pas encore chargé dans la page
            console.log("Impossible d'envoyer le message (page non chargée ?)", err);
        });
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
        console.error("Erreur API Background:", error);
        sendResponse({ error: error.message || "Erreur inconnue" });
      });
    return true; // Indique que la réponse sera asynchrone (OBLIGATOIRE)
  }
});

// Fonction principale d'orchestration
async function getAIExplanation(text) {
  const config = await chrome.storage.sync.get(['apiKey', 'apiProvider', 'model']);

  if (!config.apiKey) {
    throw new Error("Clé API manquante. Configurez-la dans l'extension.");
  }

  const provider = config.apiProvider || 'openai';
  const model = config.model || (provider === 'gemini' ? 'gemini-1.5-flash' : 'gpt-3.5-turbo');

  let payload = {};

  // Configuration des prompts stricts (Lettre uniquement)
  if (provider === 'openai') {
    payload = {
      model: model,
      messages: [
        { role: 'system', content: 'Tu es un assistant strict. Tu dois répondre UNIQUEMENT avec UNE SEULE LETTRE (A, B, C, D, etc.).' },
        { role: 'user', content: `Question QCM. Réponds avec LA LETTRE UNIQUEMENT:\n\n${text}\n\nRéponse:` }
      ],
      temperature: 0.1,
      max_tokens: 5
    };
  }
  else if (provider === 'anthropic') {
    payload = {
      model: model || 'claude-3-haiku-20240307',
      max_tokens: 5,
      messages: [{ role: 'user', content: `Réponds UNIQUEMENT avec UNE LETTRE (A, B, C, D). Question:\n${text}\n\nRéponse:` }]
    };
  }
  else if (provider === 'gemini') {
    payload = {
      contents: [{ parts: [{ text: `INSTRUCTION STRICTE: Réponds avec UNE SEULE LETTRE MAJUSCULE (A, B, C, D). Question:\n${text}\n\nRéponse:` }] }],
      generationConfig: { temperature: 0.1, maxOutputTokens: 5 }
    };
  }

  // Appel au Proxy
  const data = await callProxy(provider, model, payload, config.apiKey);

  // Parsing sécurisé
  return parseResponse(provider, data);
}


// --- FONCTION APPEL PROXY ---
async function callProxy(provider, model, payload, userApiKey) {
  try {
    const response = await fetch(PROXY_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-user-key": userApiKey
      },
      body: JSON.stringify({
        provider: provider,
        model: model,
        payload: payload
      })
    });

    const contentType = response.headers.get("content-type");
    if (!contentType || !contentType.includes("application/json")) {
       throw new Error(`Erreur Proxy: Reçu du HTML au lieu du JSON (Code ${response.status}). Vérifiez l'URL.`);
    }

    const json = await response.json();

    if (!response.ok) {
      throw new Error(json.error?.message || json.error || `Erreur API (${response.status})`);
    }

    return json;

  } catch (error) {
    console.error("Erreur réseau/proxy:", error);
    throw error;
  }
}


// --- FONCTION DE PARSING SÉCURISÉE (C'est ici qu'on corrige ton erreur 'reading 0') ---
function parseResponse(provider, data) {
  try {
    let rawResponse = '';

    // SÉCURITÉ 2 : Vérification de la structure avant de lire l'index [0]
    
    if (provider === 'openai') {
      if (!data.choices || data.choices.length === 0) throw new Error("Réponse OpenAI vide (choices missing)");
      rawResponse = data.choices[0]?.message?.content || "";
    }
    else if (provider === 'anthropic') {
      if (!data.content || data.content.length === 0) throw new Error("Réponse Claude vide (content missing)");
      rawResponse = data.content[0]?.text || "";
    }
    else if (provider === 'gemini') {
      // Gemini renvoie parfois "candidates" vide si le filtre de sécurité s'active
      if (!data.candidates || data.candidates.length === 0) {
         // On vérifie si c'est un blocage de sécurité
         if (data.promptFeedback?.blockReason) {
             throw new Error("Bloqué par Gemini (Sécurité): " + data.promptFeedback.blockReason);
         }
         throw new Error("Réponse Gemini vide ou illisible.");
      }
      rawResponse = data.candidates[0]?.content?.parts?.[0]?.text || "";
    }

    // Nettoyage et extraction de la lettre
    const cleanResponse = rawResponse.trim();
    if (!cleanResponse) return "?"; // Si vide, on renvoie ?

    const match = cleanResponse.match(/^([A-Z])\)?/i); // Capture A, a, A), a)
    if (match) {
      return match[1].toUpperCase();
    }
    
    // Fallback : premier caractère
    const firstChar = cleanResponse.charAt(0).toUpperCase();
    if (/[A-Z]/.test(firstChar)) {
      return firstChar;
    }
    
    return cleanResponse; // On renvoie tout si on n'a pas trouvé de lettre
    
  } catch (e) {
    console.error("Erreur Parsing:", e);
    throw new Error("Erreur lecture réponse IA: " + e.message);
  }
}