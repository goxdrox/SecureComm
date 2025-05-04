import React, { useState } from 'react';
import {
  View,
  Text,
  Button,
  Alert,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootParamList } from '../App';
import {
  clearSession,
  clearPrivateKey,
  clearPublicKey,
  getSession,
} from '../storage/secureStorage';
import MessageService from '../services/messageService';

type SettingsNavProp = StackNavigationProp<RootParamList, 'HomeTabs'>;

const TIMEOUT_OPTIONS = [0, 24, 48];

const SettingsScreen = () => {
  const navigation = useNavigation<SettingsNavProp>();
  const [selectedTimeout, setSelectedTimeout] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  const handleLogout = () => {
    Alert.alert(
      'Log Out',
      'Are you sure?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Log Out',
          style: 'destructive',
          onPress: async () => {
            await clearSession();
            await clearPrivateKey();
            await clearPublicKey();
            MessageService.disconnect();
            navigation.reset({
              index: 0,
              routes: [{ name: 'Login' }],
            });
          },
        },
      ],
      { cancelable: true }
    );
  };

  const updateLogoutTimeout = async (timeout: number) => {
    setLoading(true);
    try {
      console.log(`Attempting to set logout timeout to ${timeout}h`);
      const session = await getSession();
      console.log('Current session:', session);
      if (!session?.uid || !session?.token) {
        throw new Error('Session invalid');
      }

      console.log('Sending request to backend...');
      const res = await fetch('http://10.0.2.2:8080/users/set-logout-timeout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uid: session.uid,
          token: session.token,
          timeout,
        }),
      });
      console.log('Response status:', res.status);

      const data = await res.json();
      console.log('Response data:', data);

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to update timeout');
      }

      setSelectedTimeout(timeout);
      Alert.alert('Success', `Logout timeout set to ${timeout}h`);
    } catch (err: any) {
      console.error('Error updating logout timeout:', err);
      Alert.alert('Error', err.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.header}>Settings</Text>

      <TouchableOpacity
        style={styles.profileButton}
        onPress={() => navigation.navigate('Profile')}
      >
        <Text style={styles.profileButtonText}>Edit Profile</Text>
      </TouchableOpacity>

      <Text style={styles.sectionTitle}>Auto Logout</Text>
      <View style={styles.timeoutButtons}>
        {TIMEOUT_OPTIONS.map(timeout => (
          <TouchableOpacity
            key={timeout}
            style={[
              styles.timeoutButton,
              selectedTimeout === timeout && styles.timeoutButtonSelected,
            ]}
            onPress={() => updateLogoutTimeout(timeout)}
            disabled={loading}
          >
            <Text
              style={[
                styles.timeoutButtonText,
                selectedTimeout === timeout && styles.timeoutButtonTextSelected,
              ]}
            >
              {timeout}h
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading && <ActivityIndicator style={{ marginTop: 10 }} />}

      <View style={{ marginTop: 32 }}>
        <Button title="Log Out" color="#d9534f" onPress={handleLogout} />
      </View>
    </View>
  );
};

export default SettingsScreen;

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  header: { fontSize: 24, marginBottom: 24 },
  profileButton: {
    marginBottom: 24,
    padding: 12,
    backgroundColor: '#007bff',
    borderRadius: 8,
  },
  profileButtonText: {
    color: '#fff',
    textAlign: 'center',
    fontWeight: 'bold',
  },
  sectionTitle: {
    fontSize: 18,
    marginBottom: 12,
    fontWeight: '600',
  },
  timeoutButtons: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 16,
  },
  timeoutButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: '#eee',
    borderRadius: 8,
  },
  timeoutButtonSelected: {
    backgroundColor: '#007bff',
  },
  timeoutButtonText: {
    fontSize: 16,
    color: '#333',
  },
  timeoutButtonTextSelected: {
    color: '#fff',
    fontWeight: 'bold',
  },
});
