import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

const CheckEmailScreen = () => {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>📬 Check your inbox</Text>
      <Text style={styles.subtitle}>
        We’ve sent a magic link to your email. Tap it to continue.
      </Text>
    </View>
  );
};

export default CheckEmailScreen;

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 20 },
  subtitle: { fontSize: 16, textAlign: 'center', color: '#555' },
});
