import { PROXY_URL } from './config.js';

// Fonction principale pour appeler l'IA
export async function handleGeminiRequest(textPrompt, imageBase64, sendResponse, isQCMStrict) {
  try {
    const config = await chrome.storage.sync.get(['apiKey', 'model']);
    if (!config.apiKey) throw new Error("Clé API manquante");
    
    const model = config.model || 'gemini-2.0-flash';
    const parts = [];
    
    if (isQCMStrict) {
        parts.push({ text: `INSTRUCTION STRICTE: Tu es un assistant QCM. Réponds UNIQUEMENT avec UNE SEULE LETTRE MAJUSCULE. Question: ${textPrompt} Réponse:` });
    } else {
        parts.push({ text: textPrompt });
    }
    if (imageBase64) {
        parts.push({ inlineData: { mimeType: "image/jpeg", data: imageBase64 } });
    }

    const payload = {
      contents: [{ parts: parts }],
      generationConfig: { temperature: 0.1, maxOutputTokens: isQCMStrict ? 5 : 800 }
    };

    const data = await callProxy('gemini', model, payload, config.apiKey);
    const result = parseGeminiResponse(data, isQCMStrict);
    
    sendResponse({ explanation: result });

  } catch (error) {
    console.error("Erreur Gemini:", error);
    sendResponse({ error: error.message || "Erreur inconnue" });
  }
}

// Appel technique vers l'API
async function callProxy(provider, model, payload, userApiKey) {
  try {
    const response = await fetch(PROXY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-user-key": userApiKey },
      body: JSON.stringify({ provider, model, payload })
    });
    const contentType = response.headers.get("content-type");
    if (!contentType || !contentType.includes("application/json")) throw new Error(`Erreur Proxy HTML`);
    const json = await response.json();
    if (!response.ok) throw new Error(json.error?.message || json.error || `Erreur API`);
    return json;
  } catch (error) { console.error(error); throw error; }
}

// Parsing de la réponse
function parseGeminiResponse(data, isQCMStrict) {
  try {
    if (!data.candidates || data.candidates.length === 0) throw new Error("Réponse vide ou bloquée.");
    const rawResponse = data.candidates[0]?.content?.parts?.[0]?.text || "";
    const cleanResponse = rawResponse.trim();
    if (!cleanResponse) return "?";
    
    if (isQCMStrict) {
        const match = cleanResponse.match(/^([A-Z])\)?/i); 
        if (match) return match[1].toUpperCase();
        const firstChar = cleanResponse.charAt(0).toUpperCase();
        if (/[A-Z]/.test(firstChar)) return firstChar;
    }
    return cleanResponse;
  } catch (e) { throw new Error("Erreur lecture réponse"); }
}