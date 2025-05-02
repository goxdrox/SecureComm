import React, { useEffect } from 'react';
import { View, ActivityIndicator, Alert } from 'react-native';
import { savePrivateKey, savePublicKey, storeSession } from '../storage/secureStorage';
import { generateKeyPair } from '../utils/crypto';
import { encodeBase64 } from '../utils/helpers';

const MagicLinkScreen = ({ route, navigation }: any) => {
  const { token } = route.params;

  useEffect(() => {
    const finishLogin = async () => {
      try {
        const res = await fetch('http://10.0.2.2:8080/auth/verify-token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        });

        if (!res.ok) throw new Error('Invalid token');

        const { uid, publicKey: existingPublicKey } = await res.json();

        const keypair = await generateKeyPair();

        const pub64 = encodeBase64(keypair.publicKey);
        const priv64 = encodeBase64(keypair.secretKey);

        // Upload public key only if not yet uploaded
        if (!existingPublicKey) {
          await fetch('http://10.0.2.2:8080/users/upload-key', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ uid, publicKey: pub64 }),
          });
        }

        await savePrivateKey(priv64);
        await savePublicKey(pub64);
        await storeSession({ token, uid });

        navigation.reset({ index: 0, routes: [{ name: 'ShowSocialNumber', params: { uid } }] });
      } catch (e) {
        Alert.alert('Login Failed', 'Could not verify magic link.');
        navigation.navigate('EnterEmail');
      }
    };

    finishLogin();
  }, []);

  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
      <ActivityIndicator size="large" />
    </View>
  );
};

export default MagicLinkScreen;
