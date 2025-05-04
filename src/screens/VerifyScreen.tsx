// src/screens/VerifyScreen.tsx

import React, {useState} from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Alert,
  StyleSheet,
} from 'react-native';
import nacl from 'tweetnacl';
import {encodeBase64} from '../utils/helpers';
import {
  savePrivateKey,
  savePublicKey,
  storeSession,
} from '../storage/secureStorage';

interface VerifyScreenProps {
  route: {params: {email: string}};
  navigation: any;
}

const VerifyScreen = ({route, navigation}: VerifyScreenProps) => {
  const {email} = route.params;
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);

  const verifyCode = async () => {
    if (code.trim().length !== 6) {
      Alert.alert('Invalid code', 'Please enter a 6-digit code.');
      return;
    }

    setLoading(true);

    try {
      // 1. Generate keypair
      const keyPair = nacl.box.keyPair();
      const pub = encodeBase64(keyPair.publicKey);
      const priv = encodeBase64(keyPair.secretKey);

      // 2. Send email + code + public key to server
      const res = await fetch('http://10.0.2.2:8080/auth/verify-token', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({email, code, publicKey: pub}),
      });

      if (!res.ok) throw new Error('Invalid code or server error');
      const {token, uid, socialNumber} = await res.json();

      // 3. Save session + keys
      await savePrivateKey(priv);
      await savePublicKey(pub);
      await storeSession({token, uid, socialNumber});

      Alert.alert('Success', 'Welcome!');
      navigation.reset({index: 0, routes: [{name: 'HomeTabs'}]});
    } catch (err) {
      console.error(err);
      Alert.alert(
        'Verification failed',
        'Please check your code and try again.',
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>
        Enter the code sent to{`\n`}
        {email}
      </Text>
      <TextInput
        style={styles.input}
        placeholder="123456"
        keyboardType="numeric"
        maxLength={6}
        value={code}
        onChangeText={setCode}
      />
      <TouchableOpacity
        onPress={verifyCode}
        style={styles.button}
        disabled={loading}>
        <Text style={styles.buttonText}>
          {loading ? 'Verifying...' : 'Verify'}
        </Text>
      </TouchableOpacity>
    </View>
  );
};

export default VerifyScreen;

const styles = StyleSheet.create({
  container: {flex: 1, justifyContent: 'center', padding: 20},
  title: {fontSize: 20, textAlign: 'center', marginBottom: 20},
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    padding: 12,
    borderRadius: 8,
    marginBottom: 20,
  },
  button: {
    backgroundColor: '#28a745',
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  buttonText: {color: '#fff', fontWeight: 'bold'},
});
