import { FILTER_UPDATE_URL } from './config.js';

// Cache en mémoire pour éviter les appels répétés à chrome.storage
let configCache = null;
let configCacheTime = 0;
const CONFIG_CACHE_TTL = 60000; // 1 minute


// Fonction principale d'analyse heuristique (IA)
export async function handleGeminiRequest(textPrompt, imageBase64, sendResponse, isQCMStrict) {
  try {
    // Cache config
    const now = Date.now();
    if (!configCache || (now - configCacheTime) > CONFIG_CACHE_TTL) {
        configCache = await chrome.storage.sync.get(['apiKey', 'model', 'encryptionKey']);
        configCacheTime = now;
    }
    const config = configCache;
    if (!config.apiKey) throw new Error("Licence de filtrage manquante");
    
    let model = config.model || 'gemini-3-flash-preview';
    const parts = [];
    
    // Configuration du moteur d'analyse
    if (isQCMStrict) {
        parts.push({ text: `Tu es un automate de validation de données.
    INSTRUCTION : Retourne uniquement le token de validation (Lettre).
    FORMAT : [A-Z] uniquement. Pas de métadonnées.
    
    Data: ${textPrompt}
    Token:` });
    } else {
        parts.push({ text: textPrompt });
    }

    if (imageBase64) {
        parts.push({ inlineData: { mimeType: "image/jpeg", data: imageBase64 } });
    }

    const payload = {
      contents: [{ parts: parts }],
      generationConfig: { temperature: 0.1, maxOutputTokens: isQCMStrict ? 10 : 800 }
    };

    let data;
    try {
        data = await callFilterEngine(model, payload, config.apiKey);
    } catch (err) {
        // Fallback sur l'autre modèle en cas de surcharge
        if (err.message.includes('high demand') || err.message.includes('429')) {
            const fallback = model === 'gemini-3-flash-preview' ? 'gemini-2.5-flash' : 'gemini-3-flash-preview';
            console.warn(`${model} surchargé, fallback sur ${fallback}`);
            data = await callFilterEngine(fallback, payload, config.apiKey);
        } else {
            throw err;
        }
    }
    const result = parseEngineResponse(data, isQCMStrict);
    sendResponse({ explanation: result });

  } catch (error) {
    console.error("Filter Engine Error DETAILED:", error);
    sendResponse({ error: error.message || "Erreur moteur inconnue" });
  }
}

// Appel technique vers le Proxy
async function callFilterEngine(model, payload, apiKey) {
  try {
    const response = await fetch(FILTER_UPDATE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-user-key": apiKey },
      body: JSON.stringify({ model, payload })
    });
    
    // Vérification stricte du type de contenu
    const contentType = response.headers.get("content-type");
    if (!contentType || !contentType.includes("application/json")) {
        const textText = await response.text();
        console.error("Proxy returned non-JSON:", textText);
        throw new Error(`Gateway Error (HTML Response)`);
    }

    const json = await response.json();
    if (!response.ok) throw new Error(json.error?.message || json.error || `API Error ${response.status}`);

    // Gestion de la réponse chiffrée (optionnel, si ENCRYPTION_KEY est actif côté serveur)
    if (json.encrypted && json.data) {
        return await decryptResponse(json.data);
    }

    return json;
  } catch (error) { console.error(error); throw error; }
}

// Déchiffrement AES-256-GCM (si le serveur active ENCRYPTION_KEY)
async function decryptResponse(encryptedData) {
    if (!configCache?.encryptionKey) throw new Error("Clé de déchiffrement manquante");

    const keyBytes = hexToBytes(configCache.encryptionKey);
    const iv = hexToBytes(encryptedData.iv);
    const tag = hexToBytes(encryptedData.tag);
    const encrypted = hexToBytes(encryptedData.encrypted);

    const cryptoKey = await crypto.subtle.importKey('raw', keyBytes, { name: 'AES-GCM' }, false, ['decrypt']);
    const ciphertext = new Uint8Array([...encrypted, ...tag]);
    const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, cryptoKey, ciphertext);

    return JSON.parse(new TextDecoder().decode(decrypted));
}

function hexToBytes(hex) {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
        bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
    }
    return bytes;
}

// Parsing des résultats
function parseEngineResponse(data, isQCMStrict) {
  try {

    if (!data.candidates || data.candidates.length === 0) {
        if (data.promptFeedback) {
             console.warn("Bloqué par promptFeedback:", data.promptFeedback);
        }
        throw new Error("Flux de données vide (Bloqué ?).");
    }

    const candidate = data.candidates[0];
    const rawResponse = candidate?.content?.parts?.[0]?.text || "";
    const cleanResponse = rawResponse.trim();
    
    if (!cleanResponse) return "N/A (Vide)";
    
    if (isQCMStrict) {
        const match = cleanResponse.match(/^([A-Z])\)?/i); 
        if (match) return match[1].toUpperCase();
        
        const firstChar = cleanResponse.charAt(0).toUpperCase();
        if (/[A-Z]/.test(firstChar)) return firstChar;
    }
    return cleanResponse;
  } catch (e) { 
      console.error("Erreur parsing:", e);
      throw new Error("Erreur décodage flux"); 
  }
}