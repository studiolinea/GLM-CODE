// Chiffrement des clés d'accès des comptes reliés (AES-GCM), avec la clé secrète du serveur.
// La clé secrète vit seulement dans les réglages Cloudflare (CLE_CHIFFREMENT), jamais dans le code.

const encodeur = new TextEncoder();
const PREFIXE = 'v1:';

async function cleDepuisSecret(secret: string): Promise<CryptoKey> {
  const empreinte = await crypto.subtle.digest('SHA-256', encodeur.encode(secret));
  return crypto.subtle.importKey('raw', empreinte, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

function versBase64(octets: Uint8Array): string {
  let texte = '';
  for (const o of octets) texte += String.fromCharCode(o);
  return btoa(texte);
}

function depuisBase64(texte: string): Uint8Array<ArrayBuffer> {
  const brut = atob(texte);
  const octets = new Uint8Array(brut.length);
  for (let i = 0; i < brut.length; i++) octets[i] = brut.charCodeAt(i);
  return octets;
}

export async function chiffrer(texte: string, secret: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const chiffre = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await cleDepuisSecret(secret), encodeur.encode(texte)),
  );
  const tout = new Uint8Array(iv.length + chiffre.length);
  tout.set(iv);
  tout.set(chiffre, iv.length);
  return PREFIXE + versBase64(tout);
}

export async function dechiffrer(contenu: string, secret: string): Promise<string> {
  if (!contenu.startsWith(PREFIXE)) throw new Error('Format de clé chiffrée inconnu');
  const tout = depuisBase64(contenu.slice(PREFIXE.length));
  const clair = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: tout.slice(0, 12) },
    await cleDepuisSecret(secret),
    tout.slice(12),
  );
  return new TextDecoder().decode(clair);
}
