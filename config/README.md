# Configuration - GLM Codeur

Documentation complète de la configuration de GLM Codeur.

## Structure de configuration

GLM Codeur utilise un fichier TOML pour sa configuration, situé par défaut à :
- `~/.glmcode/config.toml` (Linux/macOS)
- `%USERPROFILE%\.glmcode\config.toml` (Windows)
- `./config/config.toml` (relatif au répertoire de l'application)

## Sections de configuration

### [zai]
Configuration du modèle principal (cerveau) :
- `api_key` : Clé API pour Z.ai (GLM-4.5-Flash)
- `model` : Modèle à utiliser (défaut: glm-4.5-flash)
- `temperature` : Créativité du modèle (0.0 à 2.0, défaut: 0.3)
- `max_retries` : Nombre maximal de tentatives en cas d'echec (défaut: 3)
- `max_tokens` : Nombre maximal de tokens générés (défaut: 8192)
- `auto_approve` : Approuver automatiquement les actions (défaut: false)

### [coder]
Configuration du modèle spécialisé en code :
- `enabled` : Activer/désactiver le codeur (défaut: false)
- `model` : Modèle codeur à utiliser (défaut: qwen2.5-coder)
- `base_url` : URL de base pour l'API Ollama (défaut: http://localhost:11434/v1)
- `api_key` : Clé API pour le service de code (requis si enabled=true)

### [skills]
Configuration des skills :
- `include_claude` : Inclure les skills de Claude Code (défaut: false)
- `dirs` : Tableau de répertoires supplémentaires pour charger des skills personnalisés

### [runtime]
Configuration de l'architecture runtime (ajoutée récemment) :
- `enabled` : Activer/désactiver l'architecture runtime (défaut: true)
- `shell_history_size` : Taille de l'historique des shells (défaut: 1000)
- `file_watch_delay` : Délai de surveillance des fichiers en secondes (défaut: 1.0)
- `git_watch_delay` : Délai de surveillance du git en secondes (défaut: 5.0)
- `background_workers` : Nombre de workers en arrière-plan (défaut: 4)
- `cache_max_size` : Taille maximale du cache (défaut: 1000)
- `cache_default_ttl` : Durée de vie par défaut du cache en secondes (défaut: 3600)

### [monitoring]
Configuration du monitoring de performance :
- `prometheus_enabled` : Activer l'export Prometheus (défaut: false)
- `prometheus_port` : Port pour l'export Prometheus (défaut: 8000)

### [auto_update]
Configuration du système de mise à jour automatique :
- `enabled` : Activer/désactiver la vérification automatique des mises à jour (défaut: true)
- `check_on_start` : Vérifier les mises à jour au démarrage de l'application (défaut: true)
- `interval` : Intervalle de vérification en heures (défaut: 24)
- `channel` : Canal de mise à jour à suivre (stable, beta, dev) (défaut: stable)

## Variables d'environnement

Alternativement, vous pouvez configurer GLM Codeur via des variables d'environnement :

- `GLMCODE_API_KEY` : Clé API Z.ai
- `GLMCODE_MODEL` : Modèle principal
- `GLMCODE_CODER_ENABLED` : Activer le codeur (true/false)
- `GLMCODE_CODER_MODEL` : Modèle codeur
- `GLMCODE_CODER_BASE_URL` : URL de base pour l'API du codeur
- `GLMCODE_CODER_API_KEY` : Clé API pour le codeur
- `GLMCODE_RUNTIME_ENABLED` : Activer l'architecture runtime (true/false)
- `GLMCODE_SHELL_HISTORY_SIZE` : Taille de l'historique des shells
- `GLMCODE_FILE_WATCH_DELAY` : Délai de surveillance des fichiers
- `GLMCODE_GIT_WATCH_DELAY` : Délai de surveillance du git
- `GLMCODE_BACKGROUND_WORKERS` : Nombre de workers en arrière-plan
- `GLMCODE_CACHE_MAX_SIZE` : Taille maximale du cache
- `GLMCODE_CACHE_DEFAULT_TTL` : Durée de vie par défaut du cache
- `GLMCODE_MONITORING_PROMETHEUS_ENABLED` : Activer l'export Prometheus (true/false)
- `GLMCODE_MONITORING_PROMETHEUS_PORT` : Port pour l'export Prometheus
- `GLMCODE_AUTO_UPDATE_ENABLED` : Activer la mise à jour automatique (true/false)
- `GLMCODE_AUTO_UPDATE_CHECK_ON_START` : Vérifier les mises à jour au démarrage (true/false)
- `GLMCODE_AUTO_UPDATE_INTERVAL` : Intervalle de vérification en heures
- `GLMCODE_AUTO_UPDATE_CHANNEL` : Canal de mise à jour (stable, beta, dev)

## Exemple de configuration complète

```toml
[zai]
api_key = "votre-cle-api-ici"
model = "glm-4.5-flash"
temperature = 0.3
max_tokens = 8192
auto_approve = false

[coder]
enabled = true
model = "qwen2.5-coder:latest"
base_url = "http://localhost:11434/v1"
api_key = "votre-cle-api-codeur-ici"

[skills]
include_claude = false
dirs = ["~/mon-projet/custom-skills"]

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

## Monitoring de performance

Depuis la version 0.1.0, GLM Codeur inclut un système de monitoring de performance intégré :

### Fonctionnalités activées par défaut
- Décorateur `@profile` sur toutes les fonctions principales de `glmcode/tools.py`
- Enregistrement automatique des métriques d'exécution
- Comptage des succès/échecs par type de fonction
- Surveillance du temps d'exécution avec histogrammes
- Architecture runtime complète avec gestionnaires de shell, processus, fichiers, tâches en arrière-plan et cache

### Métriques disponibles
Vous pouvez accéder aux métriques via :
1. L'interface de ligne de commande avec des commandes spécifiques
2. L'intégration Prometheus (si activée dans la configuration)
3. Les logs de l'application

Lorsque `prometheus_enabled = true`, les métriques sont exposées sur `http://localhost:{prometheus_port}/metrics` et incluent :
- Compteurs d'invocations de fonctions par statut (succès/échec)
- Histogrammes de durée d'exécution
- Métriques système (utilisation CPU, mémoire, disques, etc.)
- Statistiques des composants runtime (shels actifs, processus suivis, fichiers surveillés, etc.)