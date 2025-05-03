import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, Button, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { Linking } from 'react-native';
import axios from 'axios';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../types/navigation';

type AuthScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, 'Auth'>;

const AuthScreen: React.FC = () => {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const navigation = useNavigation<AuthScreenNavigationProp>();

  useEffect(() => {
    const handleDeepLink = ({ url }: { url: string }) => {
      const token = url.split('securecomm://auth/')[1];
      if (token) verifyToken(token);
    };

    const subscription = Linking.addEventListener('url', handleDeepLink);

    Linking.getInitialURL().then(url => {
      if (url && url.startsWith('securecomm://auth/')) {
        const token = url.split('securecomm://auth/')[1];
        if (token) verifyToken(token);
      }
    });

    return () => {
      subscription.remove();
    };
  }, []);

  const requestMagicLink = async () => {
    try {
      setLoading(true);
      await axios.post('http://localhost:8080/auth/request-link', { email });
      Alert.alert('Check your email', 'Click the magic link to continue.');
    } catch (err) {
      console.error(err);
      Alert.alert('Error', 'Failed to request link');
    } finally {
      setLoading(false);
    }
  };

  const verifyToken = async (token: string) => {
    try {
      setLoading(true);
      const res = await axios.post('http://localhost:8080/auth/verify-token', { token });
      const { uid, publicKey } = res.data;

      // Save UID and proceed
      // You can use context or secure storage later
      navigation.navigate('KeySetup', { uid, publicKey });
    } catch (err) {
      console.error(err);
      Alert.alert('Error', 'Invalid or expired link');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>SecureComm Login</Text>
      <TextInput
        style={styles.input}
        placeholder="Enter your email"
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <Button title="Send Magic Link" onPress={requestMagicLink} disabled={loading || !email} />
      {loading && <ActivityIndicator style={{ marginTop: 20 }} />}
    </View>
  );
};

export default AuthScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: 20,
  },
  title: {
    fontSize: 24,
    marginBottom: 20,
    alignSelf: 'center',
  },
  input: {
    borderWidth: 1,
    borderColor: '#aaa',
    padding: 10,
    marginBottom: 20,
    borderRadius: 5,
  },
});
