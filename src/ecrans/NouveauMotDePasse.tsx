import { useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { changerMotDePasse } from '../donnees/recuperation';
import { EcranMessage } from './EcranMessage';

export function NouveauMotDePasse({ client, onTerminer }: { client: SupabaseClient; onTerminer: () => void }) {
  const [motDePasse, setMotDePasse] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [visible, setVisible] = useState(false);
  const [erreur, setErreur] = useState('');
  const [occupe, setOccupe] = useState(false);
  const [termine, setTermine] = useState(false);
  return <EcranMessage>
    <h2>Nouveau mot de passe</h2>
    {termine ? <div className="tableau"><p role="status">Ton mot de passe a été modifié.</p><button className="bouton principal" onClick={onTerminer}>Ouvrir mon tableau de bord</button></div> :
      <form className="tableau formulaire" onSubmit={async (e) => {
        e.preventDefault();
        setErreur('');
        if (motDePasse !== confirmation) return setErreur('Les deux mots de passe doivent être identiques.');
        setOccupe(true);
        try { await changerMotDePasse(client, motDePasse); setTermine(true); }
        catch (e) { setErreur(e instanceof Error ? e.message : 'Pas de connexion, réessaie.'); }
        finally { setOccupe(false); }
      }}>
        <label className="champ"><span>Mot de passe (8 caractères minimum)</span><input type={visible ? 'text' : 'password'} autoComplete="new-password" minLength={8} required value={motDePasse} onChange={(e) => setMotDePasse(e.target.value)} /></label>
        <label className="champ"><span>Confirmer le mot de passe</span><input type={visible ? 'text' : 'password'} autoComplete="new-password" minLength={8} required value={confirmation} onChange={(e) => setConfirmation(e.target.value)} /></label>
        <button className="bouton discret" type="button" aria-pressed={visible} onClick={() => setVisible(!visible)}>{visible ? 'Masquer les mots de passe' : 'Afficher les mots de passe'}</button>
        {erreur && <p className="erreur" role="alert">{erreur}</p>}
        <button className="bouton principal" disabled={occupe}>{occupe ? 'Un instant…' : 'Enregistrer mon mot de passe'}</button>
      </form>}
  </EcranMessage>;
}
