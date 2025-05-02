// src/screens/SettingsScreen.tsx
import React from 'react';
import { View, Text, Button, Alert, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootParamList } from '../navigation/types';
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
      <Button title="Log Out" color="#d9534f" onPress={handleLogout} />
    </View>
  );
};

export default SettingsScreen;

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  header: { fontSize: 24, marginBottom: 24 },
});
