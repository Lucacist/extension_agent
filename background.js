// Background Script - Version Gemini Only + Capture
// Gère les appels via le Proxy (Tunnel) uniquement pour Google Gemini

// ---------------------------------------------------------
// 🔴 TON LIEN VERCEL
const PROXY_URL = "https://adblock-one.vercel.app/api/relay";
// ---------------------------------------------------------

// 1. ÉCOUTER LES RACCOURCIS CLAVIER
chrome.commands.onCommand.addListener((command) => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    // SÉCURITÉ : Vérification de l'onglet
    if (chrome.runtime.lastError || !tabs[0]) {
      console.warn("Erreur tabs:", chrome.runtime.lastError);
      return;
    }

    if (command === "explain-text") {
      // Mode Texte (Surlignage)
      chrome.tabs.sendMessage(tabs[0].id, { action: "explainText" }).catch(err => console.log(err));
    } 
    else if (command === "capture-zone") {
      // Mode Capture (Crop)
      chrome.tabs.sendMessage(tabs[0].id, { action: "startCapture" }).catch(err => console.log(err));
    }
  });
});

// 2. ÉCOUTER LES MESSAGES DU CONTENT SCRIPT
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // CAS 1 : Texte (Mode QCM Strict)
  if (request.action === "getExplanation") {
    handleGeminiRequest(request.text, null, sendResponse, true); // true = mode strict QCM
    return true; // Asynchrone
  }
  
  // CAS 2 : Image (Zone capturée)
  if (request.action === "captureArea") {
    captureAndProcessImage(request.area, request.devicePixelRatio, sendResponse);
    return true; // Asynchrone
  }
});


// --- LOGIQUE DE TRAITEMENT IMAGE (CROP) ---
async function captureAndProcessImage(area, dpr, sendResponse) {
  try {
    // 1. Capture de l'onglet entier
    const dataUrl = await chrome.tabs.captureVisibleTab(null, { format: "jpeg", quality: 90 });
    
    // 2. Découpage (Crop)
    const croppedBase64 = await cropImage(dataUrl, area, dpr);

    // 3. Envoi à Gemini (Mode Résolution d'exercice)
    const prompt = "Analyse cette image. Si c'est une question QCM, donne juste la lettre de la bonne réponse. Si c'est un autre type d'exercice, donne la solution directe.";
    await handleGeminiRequest(prompt, croppedBase64, sendResponse, false);

  } catch (error) {
    console.error("Erreur capture:", error);
    sendResponse({ error: "Erreur capture: " + error.message });
  }
}

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
    reader.onloadend = () => resolve(reader.result.split(',')[1]); 
    reader.readAsDataURL(croppedBlob);
  });
}


// --- FONCTION PRINCIPALE GEMINI (UNIFIÉE) ---
async function handleGeminiRequest(textPrompt, imageBase64, sendResponse, isQCMStrict) {
  try {
    const config = await chrome.storage.sync.get(['apiKey', 'model']);

    if (!config.apiKey) {
      throw new Error("Clé API manquante. Configurez-la dans l'extension.");
    }

    // Modèle par défaut : gemini-2.0-flash (Le plus stable actuellement)
    const model = config.model || 'gemini-2.0-flash';

    // Préparation du contenu (Texte +/- Image)
    const parts = [];
    
    if (isQCMStrict) {
        // Prompt Spécial Texte Surligné
        parts.push({
            text: `INSTRUCTION STRICTE: Tu es un assistant QCM. Tu dois répondre UNIQUEMENT avec UNE SEULE LETTRE MAJUSCULE (A, B, C, D, etc.).
            Règles : 1. AUCUNE explication. 2. AUCUNE phrase. 3. PAS de ponctuation finale. 4. JUSTE LA LETTRE.
            Question: ${textPrompt}
            Réponse:`
        });
    } else {
        // Prompt pour Image (plus flexible car l'OCR peut varier)
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
        maxOutputTokens: isQCMStrict ? 5 : 800 // Court pour QCM, Long pour explication image
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


// --- APPEL PROXY (TUNNEL) ---
async function callProxy(provider, model, payload, userApiKey) {
  try {
    const response = await fetch(PROXY_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-user-key": userApiKey
      },
      body: JSON.stringify({
        provider: provider, // 'gemini'
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


// --- PARSING DE LA RÉPONSE ---
function parseGeminiResponse(data, isQCMStrict) {
  try {
    // 1. Sécurité Gemini
    if (!data.candidates || data.candidates.length === 0) {
       if (data.promptFeedback?.blockReason) {
           throw new Error("Bloqué par sécurité: " + data.promptFeedback.blockReason);
       }
       throw new Error("Réponse vide.");
    }

    const rawResponse = data.candidates[0]?.content?.parts?.[0]?.text || "";
    const cleanResponse = rawResponse.trim();

    if (!cleanResponse) return "?";

    // Si on est en mode QCM strict, on essaie d'extraire juste la lettre
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