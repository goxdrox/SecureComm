import nacl from 'tweetnacl';
import { Buffer } from 'buffer';
import { getPrivateKey } from '../storage/secureStorage';

// Generate key pair for encryption
export function generateKeyPair() {
  return nacl.box.keyPair();
}

// Encrypt a message
export function encryptMessage(
  message: string,
  recipientPublicKey: Uint8Array,
  senderSecretKey: Uint8Array
) {
  const nonce = nacl.randomBytes(nacl.box.nonceLength);
  const messageBytes = new TextEncoder().encode(message);
  const senderPublicKey = nacl.box.keyPair.fromSecretKey(senderSecretKey).publicKey;

  const ciphertext = nacl.box(messageBytes, nonce, recipientPublicKey, senderSecretKey);

  return {
    ciphertext,
    nonce,
    senderPublicKey,
  };
}

// Decrypt a message
export async function decryptMessage(
  ciphertext: Uint8Array,
  nonce: Uint8Array,
  senderPublicKey: Uint8Array,
  recipientSecretKey: Uint8Array
) {
  const decrypted = nacl.box.open(ciphertext, nonce, senderPublicKey, recipientSecretKey);
  if (!decrypted) throw new Error('Failed to decrypt message');
  return new TextDecoder().decode(decrypted);
}
