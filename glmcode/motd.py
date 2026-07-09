"""Systeme d'annonces (Message Of The Day) pour GLM Code.

Affiche un panneau d'information dans la partie droite de l'interface
recupere depuis un fichier heberge sur GitHub.
"""

from __future__ import annotations

import json
import os
import threading
import time
import urllib.error
import urllib.request
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional

from rich.console import Console
from rich.panel import Panel
from rich.text import Text

from . import ui


class MotdManager:
    """Gestionnaire du Message Of The Day (MOTD)."""

    def __init__(self, cache_dir: str = ".cache/remote", update_interval: int = 1800):
        """
        Initialise le gestionnaire MOTD.

        Args:
            cache_dir: Repertoire de stockage du cache
            update_interval: Intervalle de mise a jour en secondes (30 min par defaut)
        """
        self.cache_dir = Path(cache_dir)
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self.motd_file = self.cache_dir / "motd.txt"
        self.update_interval = update_interval
        self.last_update = 0.0
        self._lock = threading.Lock()
        self._update_thread: Optional[threading.Thread] = None
        self._stop_event = threading.Event()

        # URL par defaut (sera remplacee par celle depuis update.json)
        self.default_motd_url = "https://raw.githubusercontent.com/Marreouu/MAJ-GLMC0DE/main/motd.txt"
        self.motd_url = self.default_motd_url

    def _download_motd(self, url: str) -> Optional[str]:
        """
        Telecharge le MOTD depuis l'URL specifiee.

        Returns:
            Le contenu du MOTD ou None en cas d'echec
        """
        try:
            req = urllib.request.Request(
                url,
                headers={'User-Agent': 'GLM-Code/1.0'}
            )
            with urllib.request.urlopen(req, timeout=10) as response:
                if response.status == 200:
                    content = response.read().decode('utf-8')
                    return content.strip()
        except (urllib.error.URLError, UnicodeDecodeError, TimeoutError):
            pass
        return None

    def _load_cached_motd(self) -> Optional[str]:
        """
        Charge le MOTD depuis le cache local.

        Returns:
            Le contenu du MOTD en cache ou None si inexistant
        """
        try:
            if self.motd_file.exists():
                return self.motd_file.read_text(encoding='utf-8').strip()
        except (OSError, UnicodeDecodeError):
            pass
        return None

    def _save_to_cache(self, content: str) -> None:
        """Sauvegarde le MOTD dans le cache local."""
        try:
            self.motd_file.write_text(content, encoding='utf-8')
        except OSError:
            pass  # Ignorer les erreurs d'ecriture du cache

    def update_motd_url(self, url: str) -> None:
        """Met a jour l'URL du MOTD a utiliser."""
        with self._lock:
            self.motd_url = url

    def get_motd(self) -> str:
        """
        Obtient le MOTD actuel, mettant a jour si necessaire.

        Returns:
            Le contenu du MOTD a afficher
        """
        now = time.time()

        # Verifier si une mise a jour est necessaire
        with self._lock:
            if now - self.last_update > self.update_interval:
                # Lancer la mise a jour en arriere-plan si pas deja en cours
                if self._update_thread is None or not self._update_thread.is_alive():
                    self._update_thread = threading.Thread(
                        target=self._update_motd_background,
                        daemon=True
                    )
                    self._update_thread.start()

        # Retourner la version en cache ou un message par defaut
        cached = self._load_cached_motd()
        if cached is not None:
            return cached
        return "Chargement du MOTD en cours..."

    def _update_motd_background(self) -> None:
        """Met a jour le MOTD en arriere-plan."""
        try:
            content = self._download_motd(self.motd_url)
            if content is not None:
                self._save_to_cache(content)
                with self._lock:
                    self.last_update = time.time()
            # Si le telechargement echoue, on garde la version en cache
        except Exception:
            # En cas d'erreur, on conserve silencieusement la version en cache
            pass

    def start_background_updates(self) -> None:
        """Demarre les mises a jour periodiques en arriere-plan."""
        if self._update_thread is None or not self._update_thread.is_alive():
            self._stop_event.clear()
            self._update_thread = threading.Thread(
                target=self._update_loop,
                daemon=True
            )
            self._update_thread.start()

    def stop_background_updates(self) -> None:
        """Arrete les mises a jour periodiques."""
        self._stop_event.set()
        if self._update_thread and self._update_thread.is_alive():
            self._update_thread.join(timeout=5.0)

    def _update_loop(self) -> None:
        """Boucle principale de mise a jour périodique."""
        while not self._stop_event.is_set():
            self._update_motd_background()
            # Attendre l'intervalle specifie ou jusqu'à ce qu'on demande l'arret
            self._stop_event.wait(self.update_interval)

    def render_motd(self) -> Optional[Panel]:
        """
        Rend le MOTD sous forme de panneau Rich.

        Returns:
            Un panneau Pret a afficher ou None si pas de contenu
        """
        motd_content = self.get_motd()
        if not motd_content or motd_content.isspace():
            return None

        # Le motd.txt distant peut arriver deja encadre (art ASCII ╭─╮ │ ╰─╯).
        # On retire ce cadre entrant pour ne garder que le texte : Rich dessine
        # ensuite UN seul cadre propre, en gerant correctement la largeur des
        # emojis. Sans ca on obtenait un cadre-dans-un-cadre desaligne.
        motd_content = _strip_frame(motd_content)
        if not motd_content or motd_content.isspace():
            return None

        # Creer le contenu du panneau
        text = Text(motd_content)

        if not self._is_fresh():
            # Si pas frais, afficher en jaune pour indiquer que c'est peut-etre périme
            border_style = "yellow"
            title = "[yellow]📢 MESSAGE[/yellow]"
        else:
            border_style = "blue"
            title = "[blue]📢 MESSAGE[/blue]"

        return Panel(
            text,
            title=title,
            border_style=border_style,
            padding=(1, 2),
            expand=False,
        )

    def _is_fresh(self) -> bool:
        """Verifie si le MOTD en cache est frais (mis a jour recemment)."""
        return time.time() - self.last_update < self.update_interval

    def is_update_available(self) -> bool:
        """Verifie si une mise a jour du MOTD est disponible en arriere-plan."""
        return (self._update_thread is not None and
                self._update_thread.is_alive() and
                time.time() - self.last_update < self.update_interval)


# Caracteres de trace de cadre (box-drawing) + barres verticales possibles.
_FRAME_CHARS = set("─━│┃╌╍╎╏┄┅┆┇┈┉┊┋┌┍┎┏┐┑┒┓└┕┖┗┘┙┚┛├┝┞┟┠┡┢┣┤┥┦┧┨┩┪┫"
                   "┬┭┮┯┰┱┲┳┴┵┶┷┸┹┺┻┼╀╁╂╃╄╅╆╇╈╉╊╋═║╒╓╔╕╖╗╘╙╚╛╜╝╞╟╠╡╢╣"
                   "╤╥╦╧╨╩╪╫╬╭╮╯╰╱╲╳|")
_VERTICAL_CHARS = "│┃║╎╏┆┇┊┋|"


def _strip_frame(content: str) -> str:
    """Retire un cadre ASCII/box-drawing entourant le texte, s'il y en a un.

    Tolerant : si le contenu n'est pas encadre, il est renvoye tel quel (a la
    marge de droite pres). Objectif : que Rich puisse dessiner un unique cadre
    propre, quelle que soit la forme du motd.txt distant.
    """
    raw_lines = content.replace("\r\n", "\n").replace("\r", "\n").split("\n")
    horizontal = _FRAME_CHARS - set(_VERTICAL_CHARS)

    def is_border_only(line: str) -> bool:
        # Vraie ligne de bordure : uniquement des caracteres de cadre + espaces,
        # ET contenant au moins un trait horizontal/coin (sinon c'est une ligne
        # vide « │   │ » qu'on veut garder pour aerer le message).
        stripped = line.strip()
        if not stripped or not all(ch in _FRAME_CHARS or ch.isspace() for ch in stripped):
            return False
        return any(ch in horizontal for ch in stripped)

    cleaned: list[str] = []
    for line in raw_lines:
        # Lignes 100 % cadre (haut, bas, separateurs internes) -> supprimees.
        if is_border_only(line):
            continue
        # Barre verticale de gauche.
        stripped = line.strip()
        if stripped and stripped[0] in _VERTICAL_CHARS:
            line = line[line.index(stripped[0]) + 1:]
        # Barre verticale de droite.
        rstripped = line.rstrip()
        if rstripped and rstripped[-1] in _VERTICAL_CHARS:
            line = rstripped[:-1]
        cleaned.append(line.rstrip())

    # Enleve les lignes vides en tete/pied (le padding du Panel les recree).
    while cleaned and not cleaned[0].strip():
        cleaned.pop(0)
    while cleaned and not cleaned[-1].strip():
        cleaned.pop()

    # Dedent commun (les barres verticales laissaient souvent une marge d'espaces).
    non_empty = [ln for ln in cleaned if ln.strip()]
    if non_empty:
        indent = min(len(ln) - len(ln.lstrip()) for ln in non_empty)
        if indent:
            cleaned = [ln[indent:] if ln.strip() else ln for ln in cleaned]

    return "\n".join(cleaned)


def get_motd_manager() -> MotdManager:
    """Factory pour obtenir une instance du gestionnaire MOTD."""
    return MotdManager()