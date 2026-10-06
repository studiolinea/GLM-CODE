import type { SupabaseClient } from '@supabase/supabase-js';
import { useEffect, useRef, useState } from 'react';
import { traduireErreurConnexion } from '../donnees/erreursConnexion';
import { demanderRecuperation } from '../donnees/recuperation';
import { fr } from '../texte';
import { EcranMessage } from './EcranMessage';
import { avecSouris } from './Feuille';
import { LiensLegaux } from './LiensLegaux';

/** Connexion par e-mail et mot de passe. Le même compte sert sur le Mac et sur le téléphone. */
export function Connexion({ client }: { client: SupabaseClient }) {
  const champEmail = useRef<HTMLInputElement>(null);
  // Sur ordinateur, le curseur va directement dans l'e-mail. Sur téléphone, non : le clavier monterait tout seul.
  useEffect(() => {
    if (avecSouris()) champEmail.current?.focus();
  }, []);
  const [mode, setMode] = useState<'connexion' | 'inscription' | 'recuperation'>('connexion');
  const [visible, setVisible] = useState(false);
  const [email, setEmail] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState('');
  const [info, setInfo] = useState('');

  const valider = async (e: React.FormEvent) => {
    e.preventDefault();
    setErreur('');
    setInfo('');
    const adresse = email.trim();
    if (!/^\S+@\S+\.\S+$/.test(adresse)) return setErreur('Indique ton adresse e-mail.');
    if (mode === 'inscription' && motDePasse.length < 8) {
      return setErreur('Choisis un mot de passe d’au moins 8 caractères.');
    }
    if (mode !== 'recuperation' && !motDePasse) return setErreur('Indique ton mot de passe.');

    setOccupe(true);
    try {
      if (mode === 'recuperation') {
        await demanderRecuperation(client, adresse, window.location.origin);
        setInfo('Si un compte correspond à cette adresse, tu recevras un lien pour choisir un nouveau mot de passe. Pense à vérifier les courriers indésirables.');
      } else if (mode === 'connexion') {
        const { error } = await client.auth.signInWithPassword({ email: adresse, password: motDePasse });
        if (error) {
          console.warn('Connexion refusée :', error.message);
          setErreur(traduireErreurConnexion(error.message));
        }
      } else {
        const { data, error } = await client.auth.signUp({
          email: adresse,
          password: motDePasse,
          options: { emailRedirectTo: window.location.origin + window.location.pathname },
        });
        if (error) {
          console.warn('Création de compte refusée :', error.message);
          setErreur(traduireErreurConnexion(error.message));
        } else if (!data.session) {
          setInfo(
            `Compte créé. Ouvre l’e-mail envoyé à ${adresse} et clique sur le lien de confirmation. Ensuite, reviens ici et connecte-toi.`,
          );
          setMode('connexion');
        }
      }
    } catch {
      setErreur('Pas de connexion, réessaie.');
    } finally {
      setOccupe(false);
    }
  };

  const inscription = mode === 'inscription';

  return (
    <EcranMessage>
      <p className="sous-titre">
        {mode === 'recuperation' ? 'Indique ton adresse e-mail pour recevoir un lien de récupération.' : inscription
          ? 'Crée ton compte : il gardera tes chiffres, les mêmes sur le Mac et le téléphone.'
          : 'Connecte-toi pour retrouver tes chiffres, les mêmes sur le Mac et le téléphone.'}
      </p>
      <form className="tableau formulaire" onSubmit={valider} noValidate>
        <label className="champ">
          <span>Adresse e-mail</span>
          <input
            ref={champEmail}
            id="connexion-email"
            type="email"
            autoComplete="email"
            inputMode="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        {mode !== 'recuperation' && <label className="champ">
          <span>Mot de passe{inscription ? ' (8 caractères minimum)' : ''}</span>
          <input
            id="connexion-mot-de-passe"
            type={visible ? 'text' : 'password'}
            autoComplete={inscription ? 'new-password' : 'current-password'}
            value={motDePasse}
            onChange={(e) => setMotDePasse(e.target.value)}
          />
        </label>}
        {mode !== 'recuperation' && <button type="button" className="bouton discret" aria-controls="connexion-mot-de-passe" aria-pressed={visible} onClick={() => setVisible(!visible)}>{visible ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}</button>}
        {erreur && (
          <p className="erreur" role="alert">
            {fr(erreur)}
          </p>
        )}
        {info && (
          <p className="succes" role="status">
            {fr(info)}
          </p>
        )}
        <button type="submit" className="bouton principal large" disabled={occupe}>
          {occupe ? 'Un instant…' : mode === 'recuperation' ? 'Recevoir le lien' : inscription ? 'Créer mon compte' : 'Se connecter'}
        </button>
        <button
          type="button"
          className="bouton discret large"
          onClick={() => {
            setMode(mode === 'connexion' ? 'inscription' : 'connexion');
            setErreur('');
            setInfo('');
            setMotDePasse('');
            setVisible(false);
          }}
        >
          {mode === 'recuperation' ? 'Retour à la connexion' : inscription ? 'J’ai déjà un compte' : 'Première fois ? Créer mon compte'}
        </button>
        {mode === 'connexion' && <button type="button" className="bouton discret large" disabled={occupe} onClick={() => { setMode('recuperation'); setErreur(''); setInfo(''); setMotDePasse(''); }}>Mot de passe oublié ?</button>}
      </form>
      <LiensLegaux />
    </EcranMessage>
  );
}
