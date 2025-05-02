import { Buffer } from 'buffer';
import nacl from 'tweetnacl';

export function generateKeys() {
  const { publicKey, secretKey } = nacl.sign.keyPair();

  const privateKeyBase64 = Buffer.from(secretKey).toString('base64');
  const publicKeyBase64 = Buffer.from(publicKey).toString('base64');

  return { publicKey: publicKeyBase64, privateKey: privateKeyBase64 };
}
