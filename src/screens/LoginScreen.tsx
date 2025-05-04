import React, { useState } from 'react';
import { TextInput, Button, View, Text, Alert, TouchableOpacity } from 'react-native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootParamList } from '../App';

interface Props {
  navigation: StackNavigationProp<RootParamList, 'Login'>;
}

const LoginScreen = ({ navigation }: Props) => {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);

  const handleRequestMagicLink = async () => {
    if (!email || !email.includes('@')) {
      Alert.alert('Invalid Email', 'Please enter a valid email address.');
      return;
    }

    try {
      setLoading(true);
      const res = await fetch('http://10.0.2.2:8080/auth/request-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      if (!res.ok) throw new Error('Request failed');

      Alert.alert('Success', 'Check your email for a magic login link.');

      // After the magic link is sent, navigate to VerifyScreen
      navigation.navigate('VerifyScreen', { email });  // Navigate to VerifyScreen with email as a parameter
    } catch (e) {
      console.error(e);
      Alert.alert('Error', 'Could not send magic link.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={{ flex: 1, justifyContent: 'center', padding: 20 }}>
      <Text style={{ fontSize: 20, marginBottom: 20, textAlign: 'center' }}>
        Enter your email to log in securely
      </Text>
      <TextInput
        style={{
          height: 40,
          borderColor: 'gray',
          borderWidth: 1,
          marginBottom: 20,
          paddingLeft: 10,
        }}
        placeholder="you@example.com"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
      />
      <Button
        title={loading ? 'Sending...' : 'Send Magic Link'}
        onPress={handleRequestMagicLink}
        disabled={loading}
      />

      <TouchableOpacity onPress={() => navigation.navigate('RegisterScreen')}>
        <Text style={{ marginTop: 30, textAlign: 'center', color: '#007bff' }}>
          Don’t have an account? Register Instead
        </Text>
      </TouchableOpacity>
    </View>
  );
};

export default LoginScreen;
