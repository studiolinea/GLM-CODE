@echo off
REM ─── Lanceur GLM Code (version corrigee locale) ──────────────────────────
REM Double-clique ce fichier. Il installe les dependances la 1re fois,
REM puis lance l'assistant depuis CE dossier (ta config.toml locale).
title GLM Code
cd /d "%~dp0"

REM Verifie les dependances ; ne (re)installe que si besoin.
python -c "import rich, prompt_toolkit, requests, psutil" 2>nul
if errorlevel 1 (
    echo Installation des dependances...
    python -m pip install -r requirements.txt
)

python -m glmcode %*

echo.
echo (GLM Code s'est ferme. Ferme cette fenetre.)
pause
