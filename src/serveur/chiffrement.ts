// Chiffrement des clés d'accès des comptes reliés (AES-GCM), avec la clé secrète du serveur.
// La clé secrète vit seulement dans les réglages Cloudflare (CLE_CHIFFREMENT), jamais dans le code.

const encodeur = new TextEncoder();
const PREFIXE = 'v1:';
/** v2 : le chiffré est lié à sa ligne (compte, business, plateforme, identifiant). */
const PREFIXE_V2 = 'v2:';

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

/** `contexte` (par exemple « userId|businessId|stripe| ») lie le chiffré à sa ligne. Sans contexte : ancien format v1. */
export async function chiffrer(texte: string, secret: string, contexte?: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const parametres: AesGcmParams = contexte === undefined ? { name: 'AES-GCM', iv } : { name: 'AES-GCM', iv, additionalData: encodeur.encode(contexte) };
  const chiffre = new Uint8Array(await crypto.subtle.encrypt(parametres, await cleDepuisSecret(secret), encodeur.encode(texte)));
  const tout = new Uint8Array(iv.length + chiffre.length);
  tout.set(iv);
  tout.set(chiffre, iv.length);
  return (contexte === undefined ? PREFIXE : PREFIXE_V2) + versBase64(tout);
}

export async function dechiffrer(contenu: string, secret: string, contexte?: string): Promise<string> {
  const v2 = contenu.startsWith(PREFIXE_V2);
  if (!v2 && !contenu.startsWith(PREFIXE)) throw new Error('Format de clé chiffrée inconnu');
  if (v2 && contexte === undefined) throw new Error('Contexte manquant');
  const tout = depuisBase64(contenu.slice(PREFIXE.length));
  const iv = tout.slice(0, 12);
  const parametres: AesGcmParams = v2 ? { name: 'AES-GCM', iv, additionalData: encodeur.encode(contexte!) } : { name: 'AES-GCM', iv };
  const clair = await crypto.subtle.decrypt(parametres, await cleDepuisSecret(secret), tout.slice(12));
  return new TextDecoder().decode(clair);
}
