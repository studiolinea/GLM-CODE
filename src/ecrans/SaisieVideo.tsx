import { useState } from 'react';
import { NOMS_RESEAUX, type Reseau, type Video } from '../modele';
import { dateParis, heureParis, instantParis } from '../temps';
import { Feuille } from './Feuille';

function nouvelId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** « J'ai publié » : noter une vidéo en quelques secondes, ou compléter une vidéo déjà notée. */
export function SaisieVideo({
  video,
  maintenant,
  onEnregistrer,
  onSupprimer,
  onFermer,
}: {
  video?: Video;
  maintenant: Date;
  onEnregistrer: (video: Video) => void;
  onSupprimer?: (id: string) => void;
  onFermer: () => void;
}) {
  const aujourdhui = dateParis(maintenant);
  const instantInitial = video ? new Date(video.instant) : maintenant;
  const [reseau, setReseau] = useState<Reseau>(video?.reseau ?? 'tiktok');
  const [date, setDate] = useState(dateParis(instantInitial));
  const [heure, setHeure] = useState(heureParis(instantInitial));
  const [heureTouchee, setHeureTouchee] = useState(Boolean(video));
  const [lien, setLien] = useState(video?.lien ?? '');
  const [vues, setVues] = useState(video?.vues !== undefined ? String(video.vues) : '');
  const [erreur, setErreur] = useState('');

  const changerDate = (nouvelle: string) => {
    setDate(nouvelle);
    // Par défaut : maintenant si c'est aujourd'hui, sinon midi.
    if (!heureTouchee) setHeure(nouvelle === aujourdhui ? heureParis(maintenant) : '12:00');
  };

  const valider = (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(heure)) {
      return setErreur('Indique la date et l’heure de publication.');
    }
    const instant = instantParis(date, heure);
    if (instant.getTime() > maintenant.getTime() + 5 * 60_000) {
      return setErreur('Cette date est dans le futur.');
    }
    const lienPropre = lien.trim();
    if (lienPropre && !/^https?:\/\/\S+$/i.test(lienPropre)) {
      return setErreur('Le lien doit commencer par https://');
    }
    let nombreVues: number | undefined;
    if (vues.trim() !== '') {
      nombreVues = Number(vues.replace(/[\s  ]/g, ''));
      if (!Number.isInteger(nombreVues) || nombreVues < 0) return setErreur('Les vues doivent être un nombre entier.');
    }
    onEnregistrer({
      id: video?.id ?? nouvelId(),
      instant: instant.toISOString(),
      reseau,
      ...(lienPropre ? { lien: lienPropre } : {}),
      ...(nombreVues !== undefined ? { vues: nombreVues } : {}),
    });
  };

  return (
    <Feuille titre={video ? 'Compléter la vidéo' : 'J’ai publié'} onFermer={onFermer}>
      <form onSubmit={valider} noValidate>
        <div className="champ">
          <span>Sur quel réseau ?</span>
          <div className="choix">
            {(Object.keys(NOMS_RESEAUX) as Reseau[]).map((r) => (
              <button key={r} type="button" className="periode" aria-pressed={reseau === r} onClick={() => setReseau(r)}>
                {NOMS_RESEAUX[r]}
              </button>
            ))}
          </div>
        </div>
        <div className="ligne">
          <label className="champ">
            <span>Date</span>
            <input id="video-date" type="date" value={date} max={aujourdhui} onChange={(e) => changerDate(e.target.value)} />
          </label>
          <label className="champ">
            <span>Heure</span>
            <input
              id="video-heure"
              type="time"
              value={heure}
              onChange={(e) => {
                setHeure(e.target.value);
                setHeureTouchee(true);
              }}
            />
          </label>
        </div>
        <label className="champ">
          <span>Lien de la vidéo (facultatif)</span>
          <input id="video-lien" type="url" inputMode="url" placeholder="https://" value={lien} onChange={(e) => setLien(e.target.value)} />
        </label>
        <label className="champ">
          <span>Vues (facultatif, à compléter plus tard)</span>
          <input id="video-vues" type="text" inputMode="numeric" placeholder="ex. 850" value={vues} onChange={(e) => setVues(e.target.value)} />
        </label>
        {erreur && <p className="erreur">{erreur}</p>}
        <div className="pied">
          {video && onSupprimer && (
            <button type="button" className="bouton danger" onClick={() => onSupprimer(video.id)}>
              Supprimer
            </button>
          )}
          <button type="button" className="bouton discret" onClick={onFermer}>
            Annuler
          </button>
          <button type="submit" className="bouton principal">
            Enregistrer
          </button>
        </div>
      </form>
    </Feuille>
  );
}
