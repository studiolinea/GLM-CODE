# Guide de démarrage rapide - GLM Codeur

Ce guide vous aide à configurer et à utiliser rapidement GLM Codeur.

## Installation rapide

1. **Cloner le dépôt :**
   :**
   ```bash
   git clone https://github.com/Marreouu/GLM-C0deur.git
   cd GLM-C0deur
   ```

2. **Copier la configuration :**
   ```bash
   cp config/example.config.toml config/config.toml
   ```

3. **Configurer votre clé API :**
   ```bash
   # Sous Windows (PowerShell)
   $env:GLMCODE_API_KEY="votre_cle_api_ici"
   
   # Sous Linux/macOS
   export GLMCODE_API_KEY="votre_cle_api_ici"
   ```

4. **Installer les dépendances :**
   ```bash
   pip install -r requirements.txt
   ```

5. **Vérifier l'installation :**
   ```bash
   glm --version
   ```

## Configuration rapide

Le fichier `config/config.toml` contient les paramètres principaux :

```toml
[zai]
api_key = "votre-cle-api"
model = "glm-4.5-flash"
temperature = 0.3

[coder]
enabled = false
model = "qwen2.5-coder"

[runtime]
enabled = true
shell_history_size = 1000
file_watch_delay = 1.0
git_watch_delay = 5.0
background_workers = 4
cache_max_size = 1000
cache_default_ttl = 3600

[monitoring]
prometheus_enabled = false
prometheus_port = 8000

[auto_update]
enabled = true
check_on_start = true
interval = 24
channel = "stable"
```

## Utilisation de base

```bash
# Démarrer l'assistant
glm

# Dans l'interface :
"Bonjour, peux-tu m'aider avec mon projet Python ?"

# Ou utilisez les commandes internes :
/help
/review-code mon_fichier.py
/generate-code "crée une fonction pour calculer la factorielle"
```

## Fonctionnalités de performance

GLM Codeur inclut désormais un système de monitoring de performance intégré :

### Monitoring des fonctions
Toutes les fonctions principales dans `glmcode/tools.py` sont décorées avec `@profile` pour mesurer :
- Temps d'exécution
- Taux de succès/échec
- Métriques personnalisées selon le type de fonction

### Architecture runtime
Version 0.1.0 introduit une architecture runtime complète :
- **RuntimeManager** : Coordinateur principal de tous les composants système
- **ShellManager** : Gestionnaire de shells persistants (PowerShell, CMD, Bash, WSL)
- **ProcessManager** : Gestionnaire de processus système avec suivi PID et logs
- **WatchManager** : Surveillance en temps réel des fichiers, dossiers et dépôts Git
- **EventBus** : Bus d'événements central pour la communication inter-composants
- **BackgroundTasks** : Pool de workers pour l'exécution de tâches en arrière-plan
- **RuntimeCache** : Cache en mémoire avec expiration et politique LRU

### Métriques enregistrées
- `fonction_success` : Compteur de succès
- `fonction_*_error` : Compteurs d'erreurs par type
- `fonction_duration` : Histogramme de durée d'exécution

### Accès aux métriques
Les métriques sont disponibles via :
1. L'interface de ligne de commande avec des commandes spécifiques
2. L'intégration Prometheus (si activée dans la configuration)
3. Les logs de l'application

## Mise à jour automatique

GLM Codeur inclut un système de mise à jour automatique qui peut :

- Vérifier automatiquement les mises à jour au démarrage
- Télécharger et installer les mises à jour en arrière-plan
- Maintenir une sauvegarde sécurisée avant chaque mise à jour
- Restaurer automatiquement en cas d'échec
- Fonctionner hors ligne grâce au cache
- Être entièrement configuré via le fichier de configuration

### Configuration de la mise à jour
La section `[auto_update]` dans le fichier de configuration permet de :
- Activer/désactiver la vérification automatique (`enabled = true/false`)
- Vérifier les mises à jour au démarrage (`check_on_start = true/false`)
- Définir l'intervalle de vérification en heures (`interval = 24`)
- Choisir le canal de mise à jour (`channel = "stable"/"beta"/"dev"`)

### Commandes de mise à jour
- `/update` : Vérifie et installe les mises à jour disponibles
- `/check-update` : Vérifie uniquement la disponibilité des mises à jour
- `/version` : Affiche les informations de version locale et distante

## Prochaines étapes

1. Explorez les skills disponibles avec `/skills`
2. Consultez la [documentation complète](./README.md)
3. Découvrez l'[architecture runtime](./docs/FEATURES.md#7-architecture-runtime-niveau-système)
4. Apprenez à créer vos propres skills
5. Configurez l'export des métriques vers Prometheus si nécessaire