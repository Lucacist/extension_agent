// Background Service Worker - Security Core
import { handleGeminiRequest } from './extension/gemini.js';
import { captureAndProcessImage } from './extension/capture.js';
import { initBroadcast } from './extension/broadcast.js';

// 1. Démarrage du moteur de synchronisation
initBroadcast();

// 2. GESTIONNAIRE DE RACCOURCIS CLAVIER
chrome.commands.onCommand.addListener((command) => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (chrome.runtime.lastError || !tabs[0]) return;

    if (command === "explain-text") {
      // Analyse heuristique du texte
      chrome.tabs.sendMessage(tabs[0].id, { action: "explainText" }).catch(() => {});
    } 
    else if (command === "capture-zone") {
      // Inspection manuelle d'élément
      chrome.tabs.sendMessage(tabs[0].id, { action: "startCapture" }).catch(() => {});
    }
    else if (command === "toggle-mode") {
      // Mode haute visibilité
      chrome.tabs.sendMessage(tabs[0].id, { action: "toggleHighlight" }).catch(() => {});
    }
  });
});

// 3. CANAL DE COMMUNICATION SECURISE
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  
  // SCAN DE CONTENU TEXTUEL
  if (request.action === "getExplanation") {
    handleGeminiRequest(request.text, null, sendResponse, true);
    return true; 
  }
  
  // ANALYSE D'IMAGE (ROI)
  if (request.action === "captureArea") {
    captureAndProcessImage(request.area, request.devicePixelRatio, sendResponse);
    return true; 
  }
});