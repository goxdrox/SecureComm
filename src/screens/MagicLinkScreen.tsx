import React, { useEffect } from 'react';
import { View, ActivityIndicator, Alert, StyleSheet } from 'react-native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RouteProp } from '@react-navigation/native';
import { savePrivateKey, savePublicKey, storeSession } from '../storage/secureStorage';
import { generateKeyPair } from '../utils/crypto';
import { encodeBase64 } from '../utils/helpers';
import { RootParamList } from '../App';

// Navigation types for MagicLinkScreen
type MagicLinkScreenNavigationProp = StackNavigationProp<RootParamList, 'MagicLink'>;
type MagicLinkScreenRouteProp = RouteProp<RootParamList, 'MagicLink'>;

interface MagicLinkScreenProps {
  navigation: MagicLinkScreenNavigationProp;
  route: MagicLinkScreenRouteProp;
}

const MagicLinkScreen: React.FC<MagicLinkScreenProps> = ({ route, navigation }) => {
  const { token } = route.params;

  useEffect(() => {
    const finishLogin = async () => {
      try {
        // Verify the magic token with backend
        const res = await fetch('http://10.0.2.2:8080/auth/verify-token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        });

        if (!res.ok) throw new Error('Invalid token');

        const { uid, publicKey: existingPublicKey, socialNumber } = await res.json();

        // Generate new key pair for the user
        const keypair = await generateKeyPair();
        const pub64 = encodeBase64(keypair.publicKey);
        const priv64 = encodeBase64(keypair.secretKey);

        // Upload public key if not already set
        if (!existingPublicKey) {
          await fetch('http://10.0.2.2:8080/users/upload-key', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ uid, publicKey: pub64 }),
          });
        }

        // Securely store key pair and session
        await savePrivateKey(priv64);
        await savePublicKey(pub64);


        await storeSession({ token, uid, socialNumber });


        // Navigate to display social number (home flow)
        navigation.reset({ index: 0, routes: [{ name: 'ShowSocialNumber', params: { uid } }] });
      } catch (e) {
        // On error, alert and go back to login screen
        Alert.alert('Login Failed', 'Could not verify magic link. Please try again.');
        navigation.navigate('Login');
      }
    };

    finishLogin();
  }, [token, navigation]);

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default MagicLinkScreen;
