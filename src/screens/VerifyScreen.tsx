// src/screens/VerifyScreen.tsx

import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Alert, StyleSheet } from 'react-native';
import nacl from 'tweetnacl';
import { encodeBase64 } from '../utils/helpers';
import { savePrivateKey, savePublicKey, storeSession } from '../storage/secureStorage';

const VerifyScreen = ({ route, navigation }: any) => {
  const { email } = route.params;
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);

  const verifyCode = async () => {
    if (code.trim().length < 4) return Alert.alert('Code too short');
    setLoading(true);

    try {
      // 1. Generate keypair
      const keyPair = nacl.box.keyPair();
      const pub = encodeBase64(keyPair.publicKey);
      const priv = encodeBase64(keyPair.secretKey);

      // 2. Send code + public key to server
      const res = await fetch('http://10.0.2.2:8080/auth/verify', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ email, code, publicKey: pub })
      });

      if (!res.ok) throw new Error('Invalid code or server error');
      const { token, uid } = await res.json();

      // 3. Save session + keys
      await savePrivateKey(priv);
      await savePublicKey(pub);
      await storeSession({ token, uid });

      Alert.alert('Success', `Welcome! Your social number is ${uid}`);
      navigation.reset({ index: 0, routes: [{ name: 'ChatListScreen' }] }); // Or Home screen
    } catch (err) {
      console.error(err);
      Alert.alert('Verification failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Enter Verification Code</Text>
      <TextInput
        style={styles.input}
        placeholder="123456"
        keyboardType="numeric"
        value={code}
        onChangeText={setCode}
      />
      <TouchableOpacity onPress={verifyCode} style={styles.button}>
        <Text style={styles.buttonText}>{loading ? 'Verifying...' : 'Verify'}</Text>
      </TouchableOpacity>
    </View>
  );
};

export default VerifyScreen;

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 20 },
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 20 },
  input: { borderWidth: 1, borderColor: '#ccc', padding: 12, borderRadius: 8, marginBottom: 20 },
  button: { backgroundColor: '#28a745', padding: 14, borderRadius: 8 },
  buttonText: { color: '#fff', textAlign: 'center', fontWeight: 'bold' },
});
