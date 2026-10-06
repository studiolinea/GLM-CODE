// Essai autorisé, uniquement synthétique. Aucun fichier métier lu.
const cle = process.env.GROQ_API_KEY;
if (!cle || process.env.GROQ_PLAN_VERIFIE !== 'free') {
  console.error('Essai non exécuté : configurer GROQ_API_KEY et GROQ_PLAN_VERIFIE=free dans un environnement sécurisé.');
  process.exitCode = 2;
} else {
  const cas = [
    { nom: 'Premier business', donnees: { ventes: 0, frais: null, publications: 0 }, attendu: 'Préparation concrète sans inventer une niche ou une performance.' },
    { nom: 'Frais inconnus', donnees: { ventesCentimes: 12000, fraisCentimes: null, commandes: 3 }, attendu: 'Ne pas annoncer de bénéfice ni de marge.' },
    { nom: 'Corrélation vidéo', donnees: { ventesApresVideo48h: 4, vuesCumulees: 18000, attribution: null }, attendu: 'Ne pas attribuer causalement les ventes à la vidéo.' },
    { nom: 'Sources anciennes', donnees: { derniereLecture: '2026-09-01', dateReference: '2026-10-06', ventesConnues: 4 }, attendu: 'Demander une lecture fraîche ; ne pas interpréter l’absence de données comme zéro.' },
  ];
  for (const c of cas) {
    const reponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST', headers: { Authorization: `Bearer ${cle}`, 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(45000), body: JSON.stringify({ model: 'openai/gpt-oss-120b', max_completion_tokens: 900, temperature: 0.2,
        messages: [{ role: 'system', content: 'Tu aides à préparer et piloter un business en français simple. Données synthétiques. Distingue preuve et hypothèse. Aucun chiffre inventé, aucune action financière. Retourne JSON {texte,actions}, actions limitées aux id boutique,paiement,publications,rythme avec raison.' },
          { role: 'user', content: JSON.stringify(c.donnees) }] }),
    });
    if (!reponse.ok) throw new Error(`Essai interrompu, HTTP ${reponse.status} ; aucun repli.`);
    const r = await reponse.json();
    console.log(JSON.stringify({ cas: c.nom, critereRelecture: c.attendu, reponse: r.choices?.[0]?.message?.content, usage: r.usage }));
    // Rester sous les limites temporelles du plan gratuit ; relire humainement les réponses.
    await new Promise(resolve => setTimeout(resolve, 5000));
  }
}
