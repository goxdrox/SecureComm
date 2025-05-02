import React, { useState, useEffect } from 'react';
import { View, Text, Button, FlatList, StyleSheet, TouchableOpacity, Alert } from 'react-native';

interface Contact {
  uid: string;
  name: string;
}

const ContactsScreen = ({ navigation }: any) => {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchContacts = async () => {
      try {
        const res = await fetch('http://10.0.2.2:8080/users/contacts');
        if (!res.ok) throw new Error('Failed to fetch contacts');
        const data = await res.json();
        setContacts(data.contacts);
      } catch (e) {
        Alert.alert('Error', 'Could not load contacts.');
        console.error(e);
      } finally {
        setLoading(false);
      }
    };

    fetchContacts();
  }, []);

  const handleContactPress = (contactUid: string) => {
    navigation.navigate('Chat', { recipientUid: contactUid });
  };

  return (
    <View style={styles.container}>
      {loading ? (
        <Text>Loading contacts...</Text>
      ) : (
        <>
          <Text style={styles.header}>Contacts</Text>
          <FlatList
            data={contacts}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.contactItem}
                onPress={() => handleContactPress(item.uid)}
              >
                <Text style={styles.contactName}>{item.name}</Text>
              </TouchableOpacity>
            )}
            keyExtractor={(item) => item.uid}
          />
        </>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
  },
  header: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
  },
  contactItem: {
    padding: 15,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
  },
  contactName: {
    fontSize: 18,
  },
});

export default ContactsScreen;
