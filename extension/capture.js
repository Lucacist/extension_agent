import { handleGeminiRequest } from './gemini.js';

export async function captureAndProcessImage(area, dpr, sendResponse) {
  try {
    // 1. Capture du buffer visuel
    const dataUrl = await chrome.tabs.captureVisibleTab(null, { format: "jpeg", quality: 90 });
    
    // 2. Extraction de la zone d'intérêt (ROI)
    const croppedBase64 = await cropImage(dataUrl, area, dpr);

    // 3. Envoi au moteur d'analyse numérique
    const prompt = `Mode: Scientific Computation Unit.
    
    PROTOCOLE DE SORTIE :
    1. SELECTOR : Retourne uniquement l'index (ex: "A").
    2. COMPUTE : Retourne uniquement la valeur numérique brute.
    3. UNITS : Strictement si spécifié dans l'input.
    
    RESTRICTIONS :
    - Pas de header.
    - Pas de verbose.
    - Pas de LaTeX.
    - Raw output only.`;

    await handleGeminiRequest(prompt, croppedBase64, sendResponse, false);

  } catch (error) {
    sendResponse({ error: "Erreur driver capture: " + error.message });
  }
}

async function cropImage(dataUrl, area, dpr) {
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  const bitmap = await createImageBitmap(blob);
  
  const x = area.x * dpr, y = area.y * dpr, w = area.width * dpr, h = area.height * dpr;
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