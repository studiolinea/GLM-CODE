# GLM Code

> ⚠️ **v0.1.0 — version de test.** En cours d'amélioration.

Assistant de codage en terminal, dans l'esprit de Claude Code, propulsé par
l'API **Z.ai (GLM)**. Il lit et écrit des fichiers, lance des commandes, gère
Git et des sessions reprenables — avec, en option, une architecture à deux
niveaux **cerveau + codeur** qui délègue le code technique à un second modèle
(ex. Qwen3‑Coder via OpenRouter).

---

## Fonctionnalités

- **Interface terminal soignée** (barre de saisie épinglée en bas, transcript
  dans le défilement natif du terminal → sélectionnable/copiable).
- **Trois modes** (bascule avec `Shift+Tab`) :
  - `normal` — demande confirmation avant chaque action qui écrit ou lance une commande ;
  - `auto` — exécute sans confirmation ;
  - `plan` — lecture seule : propose un plan sans rien modifier.
- **Boîte à outils de l'agent** : lecture/écriture/édition de fichiers,
  recherche (glob, grep, symboles), shell, Git, tests/lint/format, réseau.
- **Architecture cerveau + codeur** (optionnelle) : le cerveau orchestre et
  délègue le code lourd au codeur via l'outil `deleguer_codeur`.
- **Skills** : des fichiers `.md` réutilisables invoqués par `/<nom>`.
- **Sessions** : reprise du travail avec `glm --resume` ou `/resume`.
- **Surveillance de fichiers** : réveille l'agent quand un fichier change en
  dehors de l'assistant (réglable dans `[runtime]`).
- **Mises à jour + message d'accueil (MOTD)** récupérés au démarrage.

---

## Installation

### Depuis le dépôt cloné

```bash
git clone https://github.com/studiolinea/GLM-CODE.git
cd GLM-CODE
```

**Windows** — double‑cliquez sur `install/install.bat`, ou en PowerShell :

```powershell
powershell -ExecutionPolicy Bypass -File install/install.ps1
```

**Linux / macOS :**

```bash
chmod +x install/install.sh
./install/install.sh
```

L'installeur crée la commande **`glm`** (elle lance `python -m glmcode`).

### Installation manuelle (pip)

```bash
pip install -r requirements.txt
pip install -e .
```

Vérifiez :

```bash
glm --version
```

> Prérequis : **Python 3.11+**. Dépendances : `requests`, `rich`,
> `prompt_toolkit`, `psutil`.

---

## Configuration

Copiez le fichier d'exemple et renseignez vos clés :

```bash
cp config.example.toml config.toml
```

Fichiers de configuration cherchés, dans l'ordre :

1. `./config.toml` (dossier courant) ;
2. `~/.glmcode/config.toml`.

Les variables d'environnement `GLMCODE_*` sont prioritaires. La clé API peut
être fournie ainsi :

```bash
export GLMCODE_API_KEY="votre_cle_zai"
```

⚠️ **Ne commitez jamais `config.toml`** : il contient vos clés. Il est déjà
dans `.gitignore`.

Exemple minimal (`config.toml`) :

```toml
[zai]
api_key = "VOTRE_CLE_API_ZAI"
model   = "glm-4.5-flash"   # modèle gratuit

# Codeur délégué (optionnel)
[coder]
enabled = true
base_url = "https://openrouter.ai/api/v1"
model    = "qwen/qwen3-coder:free"
api_key  = "VOTRE_CLE_API_OPENROUTER"
```

Voir `config.example.toml` pour toutes les options.

---

## Utilisation

```bash
glm                       # démarre l'assistant
glm --resume <id>         # reprend une session précise
glm --continue            # reprend la dernière session
glm --list-sessions       # liste les sessions puis quitte
glm --version
```

Dans l'interface, tapez votre demande en langage naturel, ou une commande :

```
/help                     affiche l'aide
/mode                     change de mode (ou Shift+Tab)
/generate-code "une fonction factorielle"
@chemin/fichier           joint le contenu d'un fichier au message
```

La liste complète des commandes et des skills est dans **[COMMANDES.md](COMMANDES.md)**.

---

## Architecture

- **Cerveau** — modèle principal (Z.ai / GLM). Comprend la demande, utilise les
  outils, décide quand déléguer.
- **Codeur** (optionnel) — modèle spécialisé (ex. Qwen3‑Coder via OpenRouter)
  appelé par l'outil `deleguer_codeur` pour produire du code conséquent.
- **Surveillance** — un thread léger (polling) observe le dossier courant et
  relance un tour d'agent quand un fichier change hors de l'assistant.

Modules principaux (`glmcode/`) : `cli.py` (REPL + commandes), `tui.py`
(interface épinglée), `agent.py` (boucle d'outils), `tools.py` (les outils),
`coder.py` (codeur délégué), `client.py` (client LLM), `config.py`,
`skills.py`, `session.py`, `motd.py`, `updater.py`, `runtime.py` (surveillance).

---

## Dépannage

- `glm` introuvable après installation → **redémarrez le terminal** (mise à
  jour du PATH).
- Erreur « Aucune clé API » → créez `config.toml` ou définissez
  `GLMCODE_API_KEY`.
- Vérifiez que **Python 3.11+** est dans le PATH.

---

## Licence

MIT.
