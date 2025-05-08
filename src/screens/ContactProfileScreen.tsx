import React, { useState } from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View, Alert } from 'react-native';

export default function ContactProfileScreen({ navigation, route }: any) {
  const { data, session, fetchContacts } = route.params;
  const [adding, setAdding] = useState(false);

  const addContact = async () => {
    if (adding) return;
    setAdding(true);
    try {
      const postRes = await fetch(
        `http://10.0.2.2:8080/users/${session?.uid}/Addcontact`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            uid: data.uid,
            socialNumber: data.socialNumber,
            publicKey: data.publicKey,
          }),
        }
      );

      if (!postRes.ok) {
        const errorData = await postRes.json();
        console.error('Failed to add contact:', errorData?.error);
        Alert.alert('Error', errorData?.error || 'Failed to add contact');
        return;
      }

      await fetchContacts();
      Alert.alert('Success', 'Contact added successfully');
      navigation.goBack();
    } catch (e) {
      console.error('Unexpected error:', e);
      Alert.alert('Error', 'Something went wrong');
    } finally {
      setAdding(false);
    }
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.photoContainer}>
        <Image source={require('../media/profile.jpg')} style={styles.photo} />
      </TouchableOpacity>

      <Text style={styles.userName}>{data.name || 'Unknown User'}</Text>

      <Text style={styles.socialNumberLabel}>Social Number</Text>
      <Text style={styles.socialNumber}>{data.socialNumber}</Text>

      <TouchableOpacity
        onPress={addContact}
        style={[styles.saveButton, adding && { opacity: 0.6 }]}
        disabled={adding}>
        <Text style={styles.saveButtonText}>
          {adding ? 'Adding...' : 'Add Contact'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 50, backgroundColor: '#fff' },
  photoContainer: {
    marginTop: 'auto',
    alignSelf: 'center',
    marginBottom: 16,
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#eee',
    justifyContent: 'center',
    alignItems: 'center',
  },
  photo: { width: 120, height: 120, borderRadius: 60 },
  userName: {
    fontSize: 20,
    fontWeight: 'bold',
    textAlign: 'center',
    color: '#333',
    marginBottom: 14,
  },
  socialNumberLabel: {
    fontSize: 14,
    color: '#555',
    textAlign: 'center',
    marginTop: 4,
  },
  socialNumber: {
    fontSize: 20,
    fontWeight: 'bold',
    textAlign: 'center',
    color: '#333',
    marginBottom: 24,
  },
  saveButton: {
    marginTop: 'auto',
    backgroundColor: '#28a745',
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 'auto',
  },
  saveButtonText: { color: '#fff', fontWeight: 'bold' },
});
