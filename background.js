// Background Script - Chef d'Orchestre
// Ce fichier connecte les raccourcis aux modules spécialisés

import { handleGeminiRequest } from './extension/gemini.js';
import { captureAndProcessImage } from './extension/capture.js';
import { initBroadcast } from './extension/broadcast.js';

// 1. Initialiser le système de commande à distance (Réveil/Polling)
initBroadcast();

// 2. ÉCOUTER LES RACCOURCIS CLAVIER (Ctrl+Shift+X / Y)
chrome.commands.onCommand.addListener((command) => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    // Sécurité : on vérifie qu'on a bien un onglet actif
    if (chrome.runtime.lastError || !tabs[0]) return;

    if (command === "explain-text") {
      // Envoi du signal au Content Script pour qu'il traite le texte
      chrome.tabs.sendMessage(tabs[0].id, { action: "explainText" }).catch(() => {});
    } 
    else if (command === "capture-zone") {
      // Envoi du signal pour afficher l'outil de rognage
      chrome.tabs.sendMessage(tabs[0].id, { action: "startCapture" }).catch(() => {});
    }
  });
});

// 3. ÉCOUTER LES MESSAGES DU CONTENT SCRIPT (Le routeur)
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  
  // CAS A : Texte (Mode QCM Strict) -> On délègue au module Gemini
  if (request.action === "getExplanation") {
    handleGeminiRequest(request.text, null, sendResponse, true);
    return true; // Important : garde le canal ouvert pour la réponse asynchrone
  }
  
  // CAS B : Image (Zone capturée) -> On délègue au module Capture
  if (request.action === "captureArea") {
    captureAndProcessImage(request.area, request.devicePixelRatio, sendResponse);
    return true; // Important : garde le canal ouvert
  }
});