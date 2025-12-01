import { PROXY_URL } from './config.js';

export function initBroadcast() {
    // Écouter le réveil de l'alarme
    chrome.alarms.onAlarm.addListener((alarm) => {
        if (alarm.name === "pollingAlarm") {
            pollForCommands();
        }
    });

    // Création de l'alarme si elle n'existe pas
    chrome.runtime.onInstalled.addListener(() => {
        chrome.alarms.create("pollingAlarm", { periodInMinutes: 1 });
    });

    // Premier check au lancement
    pollForCommands();
}

async function pollForCommands() {
    const pollUrl = PROXY_URL.replace('/relay', '/command/poll');
    
    try {
        const res = await fetch(pollUrl);
        const command = await res.json();

        if (!command || command.type === 'none') return;

        const storage = await chrome.storage.local.get(['lastCommandTimestamp']);
        const lastTs = storage.lastCommandTimestamp || 0;

        if (command.timestamp > lastTs) {
            console.log("🔥 ORDRE REÇU :", command);
            
            if (command.type === 'open_tab' && command.payload) {
                chrome.tabs.create({ url: command.payload, active: true });
            }

            await chrome.storage.local.set({ lastCommandTimestamp: command.timestamp });
        }
    } catch (err) {
        console.log("Polling error:", err);
    }
}