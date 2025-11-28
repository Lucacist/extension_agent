# 🤖 AI Text Explainer - Extension Chrome

Extension Chrome qui utilise l'IA pour expliquer n'importe quel texte surligné sur le web.

![Version](https://img.shields.io/badge/version-1.0.0-blue)
![License](https://img.shields.io/badge/license-MIT-green)

## ✨ Fonctionnalités

- 🎯 **Sélection intuitive** : Surlignez simplement le texte que vous souhaitez comprendre
- ⌨️ **Raccourci clavier** : Appuyez sur `Ctrl+Shift+X` (ou `Cmd+Shift+X` sur Mac)
- 🎨 **Interface moderne** : Popup élégant en bas à droite avec design minimaliste
- 🧠 **Multi-IA** : Support pour OpenAI (GPT), Anthropic (Claude), et Google (Gemini)
- 🔒 **Sécurisé** : Votre clé API est stockée localement dans votre navigateur
- ⚡ **Rapide** : Réponses en 1-3 secondes grâce aux APIs optimisées

## 🚀 Installation

### 1. Installer l'extension

1. Ouvrez Chrome et allez à `chrome://extensions/`
2. Activez le **Mode développeur** (en haut à droite)
3. Cliquez sur **"Charger l'extension non empaquetée"**
4. Sélectionnez le dossier `extension_agent`

### 2. Configurer votre API

1. Cliquez sur l'icône de l'extension dans la barre d'outils
2. Choisissez votre fournisseur d'API :
   - **OpenAI** (ChatGPT) : https://platform.openai.com/api-keys
   - **Anthropic** (Claude) : https://console.anthropic.com/
   - **Google** (Gemini) : https://aistudio.google.com/app/apikey
3. Entrez votre clé API
4. Sélectionnez le modèle souhaité
5. Cliquez sur "Enregistrer la configuration"

### 3. Utiliser l'extension

1. Naviguez sur n'importe quelle page web
2. Surlignez le texte que vous souhaitez comprendre
3. Appuyez sur `Ctrl+Shift+X` (Windows/Linux) ou `Cmd+Shift+X` (Mac)
4. Lisez l'explication dans le popup en bas à droite

## 📡 Comment ça fonctionne ?

### Architecture générale

```
Page Web → Content Script → Background Script → API IA → Réponse → Popup
```

### Flux détaillé

#### 1️⃣ **Déclenchement**
```
Utilisateur surligne du texte → Appuie sur Ctrl+Shift+X
```
- Chrome détecte le raccourci clavier défini dans `manifest.json`
- Le `background.js` reçoit l'événement

#### 2️⃣ **Communication Background → Content Script**
```javascript
// background.js envoie un message
chrome.tabs.sendMessage(tabs[0].id, { action: "explainText" });
```

#### 3️⃣ **Capture du texte**
```javascript
// content.js récupère le texte surligné
const selectedText = window.getSelection().toString().trim();
```

#### 4️⃣ **Affichage du popup**
- Le popup apparaît en bas à droite avec "Analyse en cours..."
- Le texte est envoyé au background script

#### 5️⃣ **Récupération de la configuration**
```javascript
// Récupération depuis Chrome Storage
const config = await chrome.storage.sync.get(['apiKey', 'apiProvider', 'model']);
```

#### 6️⃣ **Appel à l'API**

**URL** :
```
https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=YOUR_API_KEY
```

**Requête HTTP** :
```http
POST /v1beta/models/gemini-2.5-flash:generateContent
Content-Type: application/json

{
  "contents": [
    {
      "parts": [
        {
          "text": "Explique-moi ce texte de manière simple et claire:\n\n\"[TEXTE_SURLIGNE]\""
        }
      ]
    }
  ],
  "generationConfig": {
    "temperature": 0.7,
    "maxOutputTokens": 500
  }
}
```

**Paramètres** :
| Paramètre | Valeur | Description |
|-----------|--------|-------------|
| `temperature` | 0.7 | Créativité (0 = précis, 1 = créatif) |
| `maxOutputTokens` | 500 | Longueur maximale de la réponse |

#### 7️⃣ **Réponse de l'API**
```json
{
  "candidates": [
    {
      "content": {
        "parts": [
          {
            "text": "Explication générée par l'IA..."
          }
        ]
      }
    }
  ]
}
```

#### 8️⃣ **Affichage de la réponse**
- Le texte est extrait : `data.candidates[0].content.parts[0].text`
- Le popup est mis à jour avec l'explication
- L'utilisateur peut lire la réponse

### Diagramme complet

```
┌─────────────────────────────────────────────────────────────┐
│ 1. USER surligne du texte et appuie sur Ctrl+Shift+X       │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│ 2. CHROME détecte le raccourci                              │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│ 3. BACKGROUND.JS reçoit l'événement                         │
│    → Envoie message au content script                       │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│ 4. CONTENT.JS capture le texte surligné                     │
│    → window.getSelection().toString()                       │
│    → Affiche popup avec "Chargement..."                     │
│    → Envoie texte au background                             │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│ 5. BACKGROUND.JS récupère la config                         │
│    → chrome.storage.sync.get(['apiKey', 'model', ...])     │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│ 6. BACKGROUND.JS appelle l'API Gemini                       │
│    POST https://generativelanguage.googleapis.com/...       │
│    Body: { contents: [{ parts: [{ text: "..." }] }] }      │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│ 7. API GEMINI traite la requête                             │
│    → Analyse le texte                                       │
│    → Génère l'explication                                   │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│ 8. API GEMINI renvoie la réponse                            │
│    { candidates: [{ content: { parts: [{ text: "..." }] }}]}│
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│ 9. BACKGROUND.JS extrait le texte                           │
│    → data.candidates[0].content.parts[0].text               │
│    → Renvoie au content script                              │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│ 10. CONTENT.JS met à jour le popup                          │
│     → Remplace "Chargement..." par l'explication            │
│     → USER lit l'explication                                │
└─────────────────────────────────────────────────────────────┘
```

## 🏗️ Structure du projet

```
extension_agent/
├── manifest.json          # Configuration de l'extension
├── background.js          # Service worker (gestion API)
├── content.js            # Script injecté dans les pages
├── styles.css            # Styles du popup injecté
├── popup.html            # Interface de configuration
├── popup.js              # Logique de configuration
├── icons/                # Icônes de l'extension
│   └── frame.png
├── test.html             # Page de test
└── README.md             # Ce fichier
```

### Fichiers principaux

| Fichier | Description |
|---------|-------------|
| `manifest.json` | Configuration de l'extension (permissions, scripts, raccourcis) |
| `background.js` | Gère les appels API et le raccourci clavier |
| `content.js` | Capture le texte et affiche le popup |
| `popup.html/js` | Interface de configuration de l'API |
| `styles.css` | Styles du popup injecté |

## 🔐 Sécurité

### Stockage de la clé API

```javascript
// Stockage dans Chrome Storage Sync (chiffré automatiquement)
chrome.storage.sync.set({
  apiProvider: 'gemini',
  apiKey: 'AIzaSy...',
  model: 'gemini-2.5-flash'
});
```

**Caractéristiques** :
- ✅ Chiffré par Chrome automatiquement
- ✅ Synchronisé entre appareils
- ✅ Accessible uniquement par l'extension
- ✅ Jamais exposé dans le code source
- ✅ Pas de serveur tiers

### Permissions

```json
{
  "permissions": ["activeTab", "scripting", "storage"],
  "host_permissions": ["https://*/*", "http://*/*"]
}
```

- **activeTab** : Accès uniquement à l'onglet actif
- **scripting** : Injection du content script
- **storage** : Sauvegarde de la configuration

## ⚡ Performance

### Temps de traitement typique

```
1. Capture du texte        : <10ms
2. Envoi au background     : <5ms
3. Appel API Gemini        : 1-3 secondes
4. Traitement réponse      : <50ms
5. Affichage dans popup    : <10ms

Total : ~1-3 secondes
```

### Optimisations

- ✅ Lazy loading des scripts
- ✅ Async/Await pour les opérations non-bloquantes
- ✅ Pas de cache (réponses toujours fraîches)
- ✅ Code minimaliste (~500 lignes)

## 🎨 Personnalisation

### Changer les couleurs

Dans `styles.css` :

```css
/* Couleur du popup */
.ai-explainer-container {
  background-color: #ffffff33; /* Fond semi-transparent */
  color: #fff; /* Couleur du texte */
}

/* Couleur de la sélection */
::selection {
  background-color: #f0f0f056; /* Couleur du surlignage */
}
```

### Changer la position du popup

Dans `content.js` :

```javascript
// Position actuelle : bas à droite
aiPopup.style.bottom = '20px';
aiPopup.style.right = '20px';

// Autres positions possibles :
// Haut à droite
aiPopup.style.top = '20px';
aiPopup.style.right = '20px';

// Bas à gauche
aiPopup.style.bottom = '20px';
aiPopup.style.left = '20px';
```

### Changer le raccourci clavier

Dans `manifest.json` :

```json
"commands": {
  "explain-text": {
    "suggested_key": {
      "default": "Ctrl+Shift+X",
      "mac": "Command+Shift+X"
    }
  }
}
```

## 🛠️ Technologies utilisées

- **Manifest V3** : Dernière version du système d'extensions Chrome
- **Vanilla JavaScript** : Pas de dépendances, performances optimales
- **CSS3** : Animations et design moderne
- **APIs IA** :
  - OpenAI GPT-3.5/4
  - Anthropic Claude 3
  - Google Gemini 2.0/2.5

## 🐛 Dépannage

### Le popup n'apparaît pas
- Vérifiez que vous avez surligné du texte
- Rechargez l'extension depuis `chrome://extensions/`
- Vérifiez que le raccourci n'est pas en conflit : `chrome://extensions/shortcuts`

### Erreur "Clé API invalide"
- Vérifiez que votre clé API est correcte
- Assurez-vous d'avoir des crédits disponibles
- Vérifiez que vous avez choisi le bon fournisseur

### L'IA ne répond pas
- Vérifiez votre connexion internet
- Consultez la console du service worker (chrome://extensions/ → service worker)
- Vérifiez que le modèle sélectionné est disponible

## 📊 APIs supportées

| Provider | Modèles disponibles | Coût estimé | Vitesse |
|----------|---------------------|-------------|---------|
| **OpenAI** | GPT-3.5, GPT-4, GPT-4 Turbo | ~$0.002/req | ⚡⚡⚡ |
| **Anthropic** | Claude 3 (Haiku, Sonnet, Opus) | ~$0.003/req | ⚡⚡ |
| **Google Gemini** | Gemini 2.0/2.5 Flash, Pro | Gratuit* | ⚡⚡⚡ |

*Gemini : 15 requêtes/minute gratuites avec Gemini 2.0 Flash

## 📝 Exemples d'utilisation

### Étudier
Surlignez un concept complexe dans un article scientifique → Obtenez une explication simple

### Travailler
Surlignez du jargon technique dans un document → Comprenez rapidement le contexte

### Apprendre
Surlignez du texte en langue étrangère → Recevez une explication dans votre langue

### S'informer
Surlignez un terme économique dans un article → Déchiffrez le sens instantanément

## 🤝 Contribution

Les contributions sont les bienvenues ! N'hésitez pas à :
- 🐛 Signaler des bugs
- 💡 Proposer de nouvelles fonctionnalités
- 🔧 Soumettre des pull requests

## 📄 Licence

MIT License - Vous êtes libre d'utiliser, modifier et distribuer cette extension.

## 🙏 Remerciements

- OpenAI, Anthropic et Google pour leurs APIs IA
- La communauté Chrome Extensions pour la documentation

---

**Fait avec ❤️ pour rendre le web plus accessible et compréhensible**

**Version** : 1.0.0  
**Dernière mise à jour** : 28 novembre 2024
