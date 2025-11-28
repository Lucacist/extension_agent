// Background Script - Version Gemini Only
// Gère les appels via le Proxy (Tunnel) uniquement pour Google Gemini

// ---------------------------------------------------------
// 🔴 TON LIEN VERCEL (Vérifie qu'il n'y a pas de double slash à la fin)
const PROXY_URL = "https://adblock-pn8ub9jkn-adblocks-projects.vercel.app/api/relay";
// ---------------------------------------------------------

// Écouter le raccourci clavier
chrome.commands.onCommand.addListener((command) => {
  if (command === "explain-text") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      // SÉCURITÉ : Vérification de l'onglet
      if (chrome.runtime.lastError) {
        console.warn("Erreur tabs:", chrome.runtime.lastError);
        return;
      }
      if (tabs && tabs.length > 0) {
        chrome.tabs.sendMessage(tabs[0].id, { action: "explainText" }).catch(err => {
            // Ignore l'erreur si le script n'est pas prêt
            console.log("Impossible d'envoyer le message (page non chargée ?)", err);
        });
      }
    });
  }
});

// Écouter les demandes venant du Content Script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "getExplanation") {
    getGeminiResponse(request.text)
      .then(explanation => {
        sendResponse({ explanation });
      })
      .catch(error => {
        console.error("Erreur API Background:", error);
        sendResponse({ error: error.message || "Erreur inconnue" });
      });
    return true; // Important: Indique que la réponse sera asynchrone
  }
});

// Fonction principale (Spécifique Gemini)
async function getGeminiResponse(text) {
  // On ne récupère que la clé API et le modèle
  const config = await chrome.storage.sync.get(['apiKey', 'model']);

  if (!config.apiKey) {
    throw new Error("Clé API manquante. Configurez-la dans l'extension.");
  }

  // Modèle par défaut : gemini-1.5-flash
  const model = config.model || 'gemini-1.5-flash';

  // Construction du Payload spécifique à Gemini (QCM / Lettre unique)
  const payload = {
    contents: [{
      parts: [{
        text: `INSTRUCTION STRICTE: Tu es un assistant QCM. Tu dois répondre UNIQUEMENT avec UNE SEULE LETTRE MAJUSCULE (A, B, C, D, etc.) correspondant à la bonne réponse.
        
        Règles :
        1. AUCUNE explication.
        2. AUCUNE phrase d'introduction.
        3. PAS de ponctuation finale.
        4. JUSTE LA LETTRE.

        Question:
        ${text}

        Réponse:`
      }]
    }],
    generationConfig: {
      temperature: 0.1, // Très faible pour éviter la "créativité"
      maxOutputTokens: 5 // On coupe court
    }
  };

  // Appel au Proxy
  const data = await callProxy('gemini', model, payload, config.apiKey);

  // Parsing de la réponse
  return parseGeminiResponse(data);
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
        provider: provider, // Sera toujours 'gemini' ici
        model: model,
        payload: payload
      })
    });

    // Vérification si Vercel renvoie du HTML (Erreur 401/Protection) au lieu de JSON
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


// --- FONCTION DE PARSING (Spécifique Gemini) ---
function parseGeminiResponse(data) {
  try {
    // 1. Vérification des erreurs de sécurité Gemini (Hate speech, etc.)
    if (!data.candidates || data.candidates.length === 0) {
       if (data.promptFeedback?.blockReason) {
           throw new Error("Bloqué par Gemini (Sécurité): " + data.promptFeedback.blockReason);
       }
       throw new Error("Réponse Gemini vide ou illisible.");
    }

    // 2. Extraction du texte brut (avec sécurité ?. pour éviter le crash 'reading 0')
    const rawResponse = data.candidates[0]?.content?.parts?.[0]?.text || "";
    
    // 3. Nettoyage pour ne garder que la lettre
    const cleanResponse = rawResponse.trim();
    if (!cleanResponse) return "?";

    // Cherche une lettre majuscule au début (ex: "A", "A)", "A.")
    const match = cleanResponse.match(/^([A-Z])\)?/i); 
    if (match) {
      return match[1].toUpperCase();
    }
    
    // Si l'IA a écrit du texte, on force le premier caractère s'il est valide
    const firstChar = cleanResponse.charAt(0).toUpperCase();
    if (/[A-Z]/.test(firstChar)) {
      return firstChar;
    }
    
    return cleanResponse; // Retourne tout si échec du filtre
    
  } catch (e) {
    console.error("Erreur Parsing:", e);
    throw new Error("Erreur lecture réponse : " + e.message);
  }
}