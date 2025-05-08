// src/utils/cryptokeys.ts
import { Buffer } from 'buffer';
import nacl from 'tweetnacl';

/**
 * Generates a new nacl.box key pair (X25519) suitable for encryption,
 * returning them as Base64 encoded strings.
 */
export function generateBoxKeys(): { publicKey: string; privateKey: string } {
  // Use nacl.box.keyPair for encryption keys
  const { publicKey: boxPublicKeyRaw, secretKey: boxSecretKeyRaw } = nacl.box.keyPair();

  const privateKeyBase64 = Buffer.from(boxSecretKeyRaw).toString('base64');
  const publicKeyBase64 = Buffer.from(boxPublicKeyRaw).toString('base64');

  return { publicKey: publicKeyBase64, privateKey: privateKeyBase64 };
}

// If you also need separate signing keys (e.g., Ed25519 for message signatures),
// you could have another function here:
/*
export function generateSignKeys(): { publicKey: string; privateKey: string } {
  const { publicKey: signPublicKeyRaw, secretKey: signSecretKeyRaw } = nacl.sign.keyPair();
  const privateKeyBase64 = Buffer.from(signSecretKeyRaw).toString('base64');
  const publicKeyBase64 = Buffer.from(signPublicKeyRaw).toString('base64');
  return { publicKey: publicKeyBase64, privateKey: privateKeyBase64 };
}
*/