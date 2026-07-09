# Commandes de GLM Code

## Commandes en ligne (au lancement)

| Commande | Effet |
|---|---|
| `glm` | Démarre l'assistant |
| `glm --version` | Affiche la version |
| `glm --resume <id>` | Reprend la session `<id>` |
| `glm --continue` | Reprend la dernière session |
| `glm --list-sessions` | Liste les sessions enregistrées puis quitte |
| `glm --help` | Aide des options en ligne |

> `glm` équivaut à `python -m glmcode`.

## Commandes internes (dans l'interface)

| Commande | Effet |
|---|---|
| `/help` | Affiche l'aide |
| `/reset` | Efface l'historique de la conversation |
| `/model [nom]` | Affiche ou change le modèle courant |
| `/mode [nom]` | Change de mode : `normal` / `auto` / `plan` (aussi `Shift+Tab`) |
| `/skills` | Liste les skills disponibles |
| `/<skill> [texte]` | Invoque un skill (ex. `/revue-code app.py`) |
| `/session` | Affiche l'ID de la session courante |
| `/sessions` | Liste les sessions enregistrées |
| `/resume [id]` | Reprend une session (la dernière si aucun id) |
| `/ping` | Teste la connexion au backend |
| `/update` | Vérifie et installe les mises à jour |
| `/check-update` | Vérifie seulement les mises à jour disponibles |
| `/version` | Affiche les informations de version |
| `/exit`, `/quit` | Quitte |

## Modes

| Mode | Comportement |
|---|---|
| `normal` | Confirme chaque action qui écrit sur le disque ou lance une commande |
| `auto` | Exécute les actions sans demander |
| `plan` | Lecture seule : propose un plan sans rien modifier |

## Mention de fichier

- `@chemin/fichier` — autocomplétion (tapez `@` pour lister les fichiers du
  projet) puis jonction du contenu du fichier au message envoyé.

## Skills intégrés

Fichiers `.md` dans `glmcode/builtin_skills/` (et vos propres skills dans
`~/.glmcode/skills/` ou les dossiers listés dans `[skills].dirs`) :

| Skill | Rôle |
|---|---|
| `/generate-code` | Génère du code |
| `/refactor-code`, `/refactor` | Refactorise du code existant |
| `/review-code`, `/revue-code` | Analyse et critique de code |
| `/debug` | Aide au débogage |
| `/explique` | Explique un concept ou du code |
| `/tests` | Génère des tests |

## Outils de l'agent (aperçu)

L'agent dispose d'une soixantaine d'outils, regroupés par famille. Ceux qui
**modifient le disque, lancent une commande ou touchent au réseau** demandent
une confirmation en mode `normal` et sont bloqués en mode `plan`.

| Famille | Exemples |
|---|---|
| Fichiers | `read_file`, `write_file`, `edit_file`, `list_dir`, `append_file`, `move_file`… |
| Recherche | `glob`, `grep`, `search_regex`, `find_symbol` |
| Navigation | `pwd`, `cd`, `tree`, `project_info` |
| Shell | `run_command`, `run_powershell`, `run_cmd`, `run_bash` |
| Processus | `list_processes`, `start_process`, `stop_process` |
| Git | `git_status`, `git_diff`, `git_add`, `git_commit`, `git_log`, `git_checkout` |
| Développement | `run_tests`, `lint`, `format_code`, `install_dependencies` |
| Réseau | `ping`, `dns_lookup`, `curl`, `download`, `upload` |
| Délégation | `deleguer_codeur` (si le codeur est activé) |
