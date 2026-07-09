# GLM Code sur Mac — 100 % local avec Ollama

But : faire tourner GLM Code sur ton MacBook **sans aucun cloud** (le modèle
tourne en local via Ollama → rien ne sort, cloison respectée).

## 1. Installer Ollama (une fois)

- Va sur **https://ollama.com** et télécharge l'app Mac (ou, en Terminal :
  `brew install ollama`).
- Lance Ollama (l'app le démarre ; sinon en Terminal : `ollama serve`).

## 2. Télécharger un modèle (une fois)

En Terminal :

```bash
ollama pull qwen2.5-coder:7b      # Mac 16 Go et +
# ou, si Mac 8 Go (plus léger) :
ollama pull qwen2.5-coder:3b
```

> `qwen2.5-coder` est choisi car il gère bien le **code** et les **appels
> d'outils** dont l'agent a besoin. Si tu prends le `:3b`, ouvre
> `Lancer-GLM-Mac.command` et remplace `qwen2.5-coder:7b` par `qwen2.5-coder:3b`.

## 3. Lancer GLM Code

Le dossier est déjà sur ton Mac via pCloud Drive
(`~/pCloud Drive/Shared/Cerveau-Commun/GLM-Code`).

**Méthode fiable (Terminal)** — copie-colle :

```bash
bash ~/"pCloud Drive/Shared/Cerveau-Commun/GLM-Code/Lancer-GLM-Mac.command"
```

**Double-clic** : un `.command` posé sur pCloud Drive n'est pas toujours
double-cliquable. Astuce (comme pour le Cerveau-3D) : crée un raccourci sur le
Bureau. En Terminal, une fois :

```bash
echo 'bash ~/"pCloud Drive/Shared/Cerveau-Commun/GLM-Code/Lancer-GLM-Mac.command"' > ~/Desktop/Lancer-GLM.command
chmod +x ~/Desktop/Lancer-GLM.command
```

Ensuite tu double-cliques **`Lancer-GLM.command`** sur le Bureau.
(Au 1er lancement, macOS peut demander une confirmation : clic droit → Ouvrir.)

## Notes

- Le lanceur force tout en local (variables `GLMCODE_*` → `localhost:11434`).
  Ta `config.toml` (clés Z.ai) n'est **pas** utilisée sur ce mode → aucune clé,
  aucun cloud.
- 1re fois : le lanceur installe les dépendances Python et tire le modèle si
  besoin (ça peut prendre quelques minutes).
- Si l'agent semble ne pas utiliser les outils (lecture/écriture de fichiers),
  c'est que le modèle local gère mal les *tool calls* : prends un modèle
  connu pour ça (`qwen2.5-coder`, `llama3.1`) plutôt qu'un très petit modèle.
