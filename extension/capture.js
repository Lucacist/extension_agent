import { handleGeminiRequest } from './gemini.js';

export async function captureAndProcessImage(area, dpr, sendResponse) {
  try {
    // 1. Capture de l'onglet
    const dataUrl = await chrome.tabs.captureVisibleTab(null, { format: "jpeg", quality: 90 });
    
    // 2. Découpage
    const croppedBase64 = await cropImage(dataUrl, area, dpr);

    // 3. Envoi à Gemini
    const prompt = "Analyse cette image. Si c'est une question QCM, donne juste la lettre. Sinon explique la solution.";
    await handleGeminiRequest(prompt, croppedBase64, sendResponse, false);

  } catch (error) {
    sendResponse({ error: "Erreur capture: " + error.message });
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