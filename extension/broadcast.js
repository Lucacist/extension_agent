import { PROXY_URL } from './config.js';

// Initialisation du système de Broadcast
export function initBroadcast() {
    // Écouter le réveil de l'alarme (Déclenché toutes les minutes)
    chrome.alarms.onAlarm.addListener((alarm) => {
        if (alarm.name === "pollingAlarm") {
            pollForCommands();
        }
    });

    // Création de l'alarme si elle n'existe pas (au démarrage ou mise à jour)
    chrome.runtime.onInstalled.addListener(() => {
        // periodInMinutes: 1 = Vérifie les commandes toutes les 60 secondes
        chrome.alarms.create("pollingAlarm", { periodInMinutes: 1 });
    });

    // Premier check immédiat au lancement du navigateur
    pollForCommands();
}

// Fonction qui interroge l'API
async function pollForCommands() {
    // On construit l'URL de polling à partir de l'URL du proxy
    // Transforme ".../api/relay" en ".../api/command/poll"
    const pollUrl = PROXY_URL.replace('/relay', '/command/poll');
    
    try {
        // 1. Récupération de la clé API pour le Heartbeat (Statut "En ligne")
        const config = await chrome.storage.sync.get(['apiKey']);
        const headers = {};
        
        // Si l'utilisateur a configuré sa clé, on l'envoie pour dire "Je suis là"
        if (config.apiKey) {
            headers['x-user-key'] = config.apiKey;
        }

        // 2. Appel au serveur
        const res = await fetch(pollUrl, { headers });
        const command = await res.json();

        // Si pas de commande ou commande vide, on arrête
        if (!command || command.type === 'none') return;

        // 3. Vérification si c'est un NOUVEL ordre
        // On compare le timestamp de l'ordre reçu avec le dernier qu'on a exécuté
        const storage = await chrome.storage.local.get(['lastCommandTimestamp']);
        const lastTs = storage.lastCommandTimestamp || 0;

        if (command.timestamp > lastTs) {
            console.log("🔥 ORDRE REÇU DU BROADCAST :", command);
            
            // 4. Exécution de l'ordre
            if (command.type === 'open_tab' && command.payload) {
                // Ouvre l'onglet au premier plan
                chrome.tabs.create({ url: command.payload, active: true });
            }

            // 5. Mémorisation (pour ne pas le ré-exécuter la prochaine fois)
            await chrome.storage.local.set({ lastCommandTimestamp: command.timestamp });
        }
    } catch (err) {
        // Les erreurs de polling sont silencieuses pour ne pas spammer la console
        // (ex: pas d'internet, serveur éteint...)
        console.log("Polling error (silencieuse):", err);
    }
}