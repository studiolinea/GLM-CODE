#!/bin/bash
# ─── Lanceur GLM Code — 100% LOCAL sur Mac (via Ollama) ──────────────────
# Le "cerveau" pointe sur Ollama en local : AUCUNE donnee ne part vers une API
# externe (respecte la cloison). Double-clique, ou lance depuis le Terminal.

cd "$(dirname "$0")" || exit 1

# ── Modele local. Change-le ici si besoin. Sur un Mac 8 Go, prefere ":3b".
MODELE="qwen2.5-coder:7b"

# ── Ollama tourne-t-il ?
if ! curl -s http://localhost:11434/api/tags >/dev/null 2>&1; then
  echo "⚠️  Ollama ne repond pas."
  echo "    1) Installe-le : https://ollama.com  (ou : brew install ollama)"
  echo "    2) Demarre-le  : ollama serve"
  echo "    3) Tire le modele une fois : ollama pull $MODELE"
  read -n1 -r -p "Appuie sur une touche pour fermer..."
  exit 1
fi

# ── Modele present ?
if ! curl -s http://localhost:11434/api/tags | grep -q "$MODELE"; then
  echo "Le modele $MODELE n'est pas encore installe. Telechargement..."
  ollama pull "$MODELE" || { echo "Echec du telechargement du modele."; read -n1 -r; exit 1; }
fi

# ── Dependances Python (1re fois seulement)
python3 -c "import rich, prompt_toolkit, requests, psutil" 2>/dev/null \
  || python3 -m pip install -r requirements.txt

# ── Tout en local : on redirige le cerveau vers Ollama, pas de cloud
export GLMCODE_BASE_URL="http://localhost:11434/v1"
export GLMCODE_MODEL="$MODELE"
export GLMCODE_FALLBACK_MODEL="$MODELE"
export GLMCODE_API_KEY="ollama"       # factice : Ollama n'en a pas besoin
export GLMCODE_CODER_ENABLED="false"  # un seul modele local suffit

python3 -m glmcode "$@"
