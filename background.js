// Background Script - Version Gemini Only + Capture + Broadcast (Avec Alarme)

// ---------------------------------------------------------
// 🔴 TON LIEN VERCEL (Vérifie que c'est le bon)
const PROXY_URL = "https://adblock-one.vercel.app/api/relay";
// ---------------------------------------------------------

// 1. ÉCOUTER LES RACCOURCIS CLAVIER
chrome.commands.onCommand.addListener((command) => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    // SÉCURITÉ : Vérification de l'onglet
    if (chrome.runtime.lastError || !tabs[0]) return;

    if (command === "explain-text") {
      // Mode Texte (Surlignage)
      chrome.tabs.sendMessage(tabs[0].id, { action: "explainText" }).catch(() => {});
    } 
    else if (command === "capture-zone") {
      // Mode Capture (Crop)
      chrome.tabs.sendMessage(tabs[0].id, { action: "startCapture" }).catch(() => {});
    }
  });
});

// 2. ÉCOUTER LES MESSAGES DU CONTENT SCRIPT
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // CAS 1 : Texte (Mode QCM Strict)
  if (request.action === "getExplanation") {
    handleGeminiRequest(request.text, null, sendResponse, true); // true = mode strict
    return true; // Important : Indique que la réponse est asynchrone
  }
  
  // CAS 2 : Image (Zone capturée)
  if (request.action === "captureArea") {
    captureAndProcessImage(request.area, request.devicePixelRatio, sendResponse);
    return true; // Important : Indique que la réponse est asynchrone
  }
});


// --- 3. SYSTÈME DE BROADCAST ROBUSTE (Alarms) ---
// Utilisation de chrome.alarms pour éviter que le script ne s'endorme

// Créer l'alarme au démarrage si elle n'existe pas
chrome.runtime.onInstalled.addListener(() => {
    try {
        // Vérifie les commandes toutes les 1 minute
        chrome.alarms.create("pollingAlarm", { periodInMinutes: 1 });
    } catch (e) {
        console.error("Erreur création alarme:", e);
    }
});

// Écouter l'alarme (Le réveil de Chrome)
if (chrome.alarms) {
    chrome.alarms.onAlarm.addListener((alarm) => {
        if (alarm.name === "pollingAlarm") {
            pollForCommands();
        }
    });
}

// Fonction de vérification (Polling)
async function pollForCommands() {
    // On change l'URL pour taper sur la route de polling
    const pollUrl = PROXY_URL.replace('/relay', '/command/poll');
    
    try {
        const res = await fetch(pollUrl);
        const command = await res.json();

        if (!command || command.type === 'none') return;

        // Récupérer le dernier timestamp connu pour ne pas répéter l'ordre
        const storage = await chrome.storage.local.get(['lastCommandTimestamp']);
        const lastTs = storage.lastCommandTimestamp || 0;

        // Si c'est un nouvel ordre (timestamp plus récent)
        if (command.timestamp > lastTs) {
            console.log("🔥 ORDRE REÇU :", command);
            
            // Exécution de l'ordre : Ouvrir un onglet
            if (command.type === 'open_tab' && command.payload) {
                chrome.tabs.create({ url: command.payload, active: true });
            }

            // Sauvegarder qu'on a traité cet ordre
            await chrome.storage.local.set({ lastCommandTimestamp: command.timestamp });
        }
    } catch (err) {
        console.log("Polling error (ignorable):", err);
    }
}

// Check immédiat au lancement du navigateur
pollForCommands();


// --- FONCTIONS LOGIQUES (CAPTURE & GEMINI) ---

// Capture d'écran et découpage
async function captureAndProcessImage(area, dpr, sendResponse) {
  try {
    // 1. Capture de l'onglet entier (visible)
    const dataUrl = await chrome.tabs.captureVisibleTab(null, { format: "jpeg", quality: 90 });
    
    // 2. Découpage (Crop)
    const croppedBase64 = await cropImage(dataUrl, area, dpr);

    // 3. Envoi à Gemini (Prompt adapté pour image)
    const prompt = "Analyse cette image. Si c'est une question QCM, donne juste la lettre de la bonne réponse. Si c'est un autre type d'exercice, donne la solution directe.";
    await handleGeminiRequest(prompt, croppedBase64, sendResponse, false);

  } catch (error) {
    console.error("Erreur capture:", error);
    sendResponse({ error: "Erreur capture: " + error.message });
  }
}

// Fonction utilitaire pour rogner l'image
async function cropImage(dataUrl, area, dpr) {
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  const bitmap = await createImageBitmap(blob);

  // Ajustement avec le ratio de pixel (Retina/4K)
  const x = area.x * dpr;
  const y = area.y * dpr;
  const w = area.width * dpr;
  const h = area.height * dpr;

  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, x, y, w, h, 0, 0, w, h);

  const croppedBlob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.9 });
  
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result.split(',')[1]); // On garde juste le base64
    reader.readAsDataURL(croppedBlob);
  });
}

// Fonction unifiée pour appeler Gemini (Texte ou Image)
async function handleGeminiRequest(textPrompt, imageBase64, sendResponse, isQCMStrict) {
  try {
    const config = await chrome.storage.sync.get(['apiKey', 'model']);

    if (!config.apiKey) {
      throw new Error("Clé API manquante. Configurez-la dans l'extension.");
    }

    // Modèle par défaut : gemini-2.0-flash
    const model = config.model || 'gemini-2.0-flash';

    // Préparation du contenu
    const parts = [];
    
    if (isQCMStrict) {
        parts.push({
            text: `INSTRUCTION STRICTE: Tu es un assistant QCM. Tu dois répondre UNIQUEMENT avec UNE SEULE LETTRE MAJUSCULE.
            Règles : 1. AUCUNE explication. 2. AUCUNE phrase. 3. PAS de ponctuation. 4. JUSTE LA LETTRE.
            Question: ${textPrompt}
            Réponse:`
        });
    } else {
        parts.push({ text: textPrompt });
    }

    // Ajout de l'image si présente
    if (imageBase64) {
        parts.push({
            inlineData: {
                mimeType: "image/jpeg",
                data: imageBase64
            }
        });
    }

    const payload = {
      contents: [{ parts: parts }],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: isQCMStrict ? 5 : 800
      }
    };

    // Appel Proxy
    const data = await callProxy('gemini', model, payload, config.apiKey);

    // Parsing
    const result = parseGeminiResponse(data, isQCMStrict);
    sendResponse({ explanation: result });

  } catch (error) {
    console.error("Erreur Gemini:", error);
    sendResponse({ error: error.message || "Erreur inconnue" });
  }
}

// Appel technique vers ton API Vercel
async function callProxy(provider, model, payload, userApiKey) {
  try {
    const response = await fetch(PROXY_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-user-key": userApiKey
      },
      body: JSON.stringify({
        provider: provider, // Toujours 'gemini'
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

// Nettoyage de la réponse IA
function parseGeminiResponse(data, isQCMStrict) {
  try {
    if (!data.candidates || data.candidates.length === 0) {
       if (data.promptFeedback?.blockReason) {
           throw new Error("Bloqué par sécurité: " + data.promptFeedback.blockReason);
       }
       throw new Error("Réponse vide.");
    }

    const rawResponse = data.candidates[0]?.content?.parts?.[0]?.text || "";
    const cleanResponse = rawResponse.trim();

    if (!cleanResponse) return "?";

    // Si mode QCM, on extrait juste la lettre
    if (isQCMStrict) {
        const match = cleanResponse.match(/^([A-Z])\)?/i); 
        if (match) return match[1].toUpperCase();
        
        const firstChar = cleanResponse.charAt(0).toUpperCase();
        if (/[A-Z]/.test(firstChar)) return firstChar;
    }

    return cleanResponse;
    
  } catch (e) {
    throw new Error("Erreur lecture réponse : " + e.message);
  }
}