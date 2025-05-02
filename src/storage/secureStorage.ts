import EncryptedStorage from 'react-native-encrypted-storage';

export async function savePrivateKey(privateKey: string) {
  await EncryptedStorage.setItem('privateKey', privateKey);
}

export async function savePublicKey(publicKey: string) {
  await EncryptedStorage.setItem('publicKey', publicKey);
}

export async function getPrivateKey() {
  return await EncryptedStorage.getItem('privateKey');
}

export async function getPublicKey() {
  return await EncryptedStorage.getItem('publicKey');
}

export async function storeSession(session: { token: string; uid: string }) {
  await EncryptedStorage.setItem('session', JSON.stringify(session));
}

export async function getSession() {
  const sessionString = await EncryptedStorage.getItem('session');
  return sessionString ? JSON.parse(sessionString) : null;
}

export async function clearSession() {
  await EncryptedStorage.removeItem('session');
}

export async function clearPrivateKey() {
  await EncryptedStorage.removeItem('privateKey');
}

export async function clearPublicKey() {
  await EncryptedStorage.removeItem('publicKey');
}