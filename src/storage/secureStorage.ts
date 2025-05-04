import EncryptedStorage from 'react-native-encrypted-storage';

export async function savePrivateKey(privateKey: string) {
  await EncryptedStorage.setItem('privateKey', privateKey);
}

export async function savePublicKey(publicKey: string) {
  await EncryptedStorage.setItem('publicKey', publicKey);
}

export async function getPrivateKey(): Promise<string | null> {
  return await EncryptedStorage.getItem('privateKey');
}

export async function getPublicKey(): Promise<string | null> {
  return await EncryptedStorage.getItem('publicKey');
}

// Store session object including token, uid, and socialNumber
export async function storeSession(session: {
  token: string;
  uid: string;
  socialNumber: string;
  firstName?: string;
  lastName?: string;
  photoUri?: string;
}) {
  await EncryptedStorage.setItem('session', JSON.stringify(session));
}

// Retrieve stored session and parse as JSON
export async function getSession(): Promise<{
  token: string;
  uid: string;
  socialNumber?: string;
  firstName?: string;
  lastName?: string;
  photoUri?: string;
} | null> {
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

// Update profile fields (firstName, lastName, photoUri) in the stored session
export async function updateProfile(profile: {
  firstName: string;
  lastName: string;
  photoUri: string | null;
}) {
  const session = (await getSession()) || {};

  const updated = {...session, ...profile};

  await EncryptedStorage.setItem('session', JSON.stringify(updated));
}
