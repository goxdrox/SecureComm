// src/screens/SettingsScreen.tsx
import React from 'react';
import { View, Text, Button, Alert, StyleSheet, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootParamList } from '../App';
import {
  clearSession,
  clearPrivateKey,
  clearPublicKey,
} from '../storage/secureStorage';
import MessageService from '../services/messageService';

type SettingsNavProp = StackNavigationProp<RootParamList, 'HomeTabs'>;

const SettingsScreen = () => {
  const navigation = useNavigation<SettingsNavProp>();

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

  return (
    <View style={styles.container}>
      <Text style={styles.header}>Settings</Text>

      <TouchableOpacity
        style={styles.profileButton}
        onPress={() => navigation.navigate('Profile')}
      >
        <Text style={styles.profileButtonText}>Edit Profile</Text>
      </TouchableOpacity>

      <Button title="Log Out" color="#d9534f" onPress={handleLogout} />
    </View>
  );
};

export default SettingsScreen;

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  header: { fontSize: 24, marginBottom: 24 },
  profileButton: {
    marginBottom: 16,
    padding: 12,
    backgroundColor: '#007bff',
    borderRadius: 8,
  },
  profileButtonText: {
    color: '#fff',
    textAlign: 'center',
    fontWeight: 'bold',
  },
});
