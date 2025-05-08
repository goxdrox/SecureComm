// src/utils/crypto.ts
import nacl from 'tweetnacl';
import { Buffer } from 'buffer'; // **** ADD THIS IMPORT ****

// Generate key pair for nacl.box encryption (X25519 keys)
export function generateBoxKeyPair() { // Renamed for clarity to distinguish from sign keys
  return nacl.box.keyPair();
}

// Encrypt a message using nacl.box
export function encryptMessage(
  message: string, // Plaintext message
  recipientPublicKey: Uint8Array, // Recipient's X25519 public key
  senderSecretKey: Uint8Array,    // Sender's X25519 secret key
): { ciphertext: Uint8Array; nonce: Uint8Array; senderPublicKey: Uint8Array } {
  const nonce = nacl.randomBytes(nacl.box.nonceLength);
  // TextEncoder encodes to UTF-8 bytes, which Buffer.toString('utf8') can decode
  const messageBytes = new TextEncoder().encode(message);

  const senderPublicKey = nacl.box.keyPair.fromSecretKey(senderSecretKey).publicKey;
  const ciphertext = nacl.box(messageBytes, nonce, recipientPublicKey, senderSecretKey);

  return {
    ciphertext,
    nonce,
    senderPublicKey, // This is crucial for the recipient
  };
}

// Decrypt a message using nacl.box
export function decryptMessage(
  ciphertext: Uint8Array,
  nonce: Uint8Array,
  senderPublicKey: Uint8Array,    // Sender's X25519 public key (received with the message)
  recipientSecretKey: Uint8Array, // Recipient's X25519 secret key
): string { // Returns plaintext string
  const decryptedBytes = nacl.box.open(ciphertext, nonce, senderPublicKey, recipientSecretKey);
  if (!decryptedBytes) {
    throw new Error('Failed to decrypt message: Ciphertext authentication failed.');
  }
  // **** REPLACE TextDecoder with Buffer ****
  return Buffer.from(decryptedBytes).toString('utf8');
}