// Le compte-tours : vidéos publiées sur 7 jours par rapport à l'objectif.

import type { CSSProperties } from 'react';

const CX = 100;
const CY = 100;
const RAYON = 80;
const DEBUT = 225; // degrés : en bas à gauche
const BALAYAGE = 270; // jusqu'en bas à droite, en passant par le haut

const arrondi = (n: number) => Math.round(n * 100) / 100;

function point(degres: number, rayon: number): [number, number] {
  const rad = (degres * Math.PI) / 180;
  return [arrondi(CX + rayon * Math.cos(rad)), arrondi(CY - rayon * Math.sin(rad))];
}

function arc(de: number, a: number): string {
  const [x1, y1] = point(de, RAYON);
  const [x2, y2] = point(a, RAYON);
  return `M ${x1} ${y1} A ${RAYON} ${RAYON} 0 ${de - a > 180 ? 1 : 0} 1 ${x2} ${y2}`;
}

export function Jauge({ valeur, max }: { valeur: number; max: number }) {
  const angle = (v: number) => DEBUT - (Math.min(v, max) / max) * BALAYAGE;
  const pas = max <= 14 ? 1 : max / 4;
  const crans: number[] = [];
  for (let v = 0; v <= max + 1e-9; v += pas) crans.push(v);
  // Aiguille courte : elle reste au-dessus du chiffre, même à zéro.
  const [ax, ay] = point(angle(valeur), 40);
  const atteint = max > 0 && valeur >= max;

  return (
    <svg
      className="jauge"
      viewBox="0 0 200 178"
      role="img"
      aria-label={`${valeur} vidéo${valeur > 1 ? 's' : ''} publiée${valeur > 1 ? 's' : ''} sur ${max} visées ces 7 derniers jours`}
    >
      <path className="jauge-fond" d={arc(DEBUT, DEBUT - BALAYAGE)} fill="none" strokeWidth="10" strokeLinecap="round" />
      {valeur > 0 && (
        <path className={`jauge-valeur${atteint ? ' atteint' : ''}`} d={arc(DEBUT, angle(valeur))} fill="none" strokeWidth="10" strokeLinecap="round" />
      )}
      <g className="jauge-cran" strokeWidth="2" fill="none">
        {crans.map((v) => {
          const [x1, y1] = point(angle(v), 88);
          const [x2, y2] = point(angle(v), 95);
          return <line key={v} x1={x1} y1={y1} x2={x2} y2={y2} />;
        })}
      </g>
      <line
        className="jauge-aiguille"
        x1={CX}
        y1={CY}
        x2={ax}
        y2={ay}
        strokeWidth="3"
        strokeLinecap="round"
        fill="none"
        // Point de départ de l'animation « contact » : l'aiguille revient à zéro puis monte.
        style={{ '--depart': `${angle(valeur) - DEBUT}deg` } as CSSProperties}
      />
      <circle className="jauge-moyeu" cx={CX} cy={CY} r="7" strokeWidth="2" />
      <text className="jauge-grand" x={CX} y="152" textAnchor="middle">
        {valeur}/{max}
      </text>
      <text className="jauge-petit" x={CX} y="168" textAnchor="middle">
        VIDÉOS · 7 JOURS
      </text>
    </svg>
  );
}
