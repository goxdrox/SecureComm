import React, {useState, useEffect, useCallback} from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  Alert,
  TextInput,
  RefreshControl,
} from 'react-native';
import debounce from 'lodash/debounce';
import {getSession} from '../storage/secureStorage';
import {isOnlyNumbers} from '../utils/tests';

interface Contact {
  uid: string;
  name: string | null;
  socialNumber: string;
}

const ContactsScreen = ({navigation}: any) => {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [filteredContacts, setFilteredContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const fetchContacts = async () => {
    try {
      const session = await getSession();
      const currentUser = session?.uid;
      const res = await fetch(`http://10.0.2.2:8080/${currentUser}/contacts`);
      const data = await res.json();

      if (!Array.isArray(data)) {
        console.warn('Unexpected response format:', data);
        setContacts([]);
        setFilteredContacts([]);
        return;
      }

      const mappedContacts = data.map((e: any) => ({
        uid: e.uid,
        socialNumber: e.socialNumber,
        name: e.name || null,
      }));

      setContacts(mappedContacts);
      setFilteredContacts(mappedContacts);
    } catch (e) {
      console.error('Fetch contacts failed:', e);
      setContacts([]);
      setFilteredContacts([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchContacts();
  }, []);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchContacts().finally(() => setRefreshing(false));
  }, []);

  const debouncedSearch = useCallback(
    debounce((text: string) => {
      if (!text) {
        setFilteredContacts(contacts);
        return;
      }
      const filtered = contacts.filter(c =>
        c.socialNumber.includes(text)
      );
      setFilteredContacts(filtered);
    }, 250),
    [contacts]
  );

  const handleSearch = (text: string) => {
    setSearch(text);
    debouncedSearch(text);
  };

  const handleContactPress = (contactUid: string) => {
    navigation.navigate('Chat', {recipientUid: contactUid});
    setSearch('');
  };

  const addContact = async () => {
    try {
      const session = await getSession();
      const res = await fetch(`http://10.0.2.2:8080/users/by-social/${search}`);

      if (!res.ok) {
        console.log('User not found');
        return;
      }

      const data = await res.json();
      navigation.navigate('ContactProfile', {data, session, fetchContacts});
    } catch (e) {
      console.error('Failed to find contact:', e);
    }
  };

  const handleSearchButtonPress = () => {
    setShowSearch(prev => !prev);
    if (search) setSearch('');
  };

  return (
    <View style={styles.container}>
      {loading ? (
        <Text>Loading contacts...</Text>
      ) : contacts.length === 0 ? (
        <Text>No contacts</Text>
      ) : filteredContacts.length === 0 ? (
        isOnlyNumbers(search) ? (
          <TouchableOpacity style={styles.contactItem} onPress={addContact}>
            <Text style={styles.contactName}>Add contact {search}</Text>
          </TouchableOpacity>
        ) : (
          <Text style={styles.contactName}>No contacts found</Text>
        )
      ) : (
        <FlatList
          data={filteredContacts}
          keyExtractor={item => item.uid}
          renderItem={({item}) => (
            <TouchableOpacity
              style={styles.contactItem}
              onPress={() => handleContactPress(item.uid)}>
              <Text style={styles.contactName}>
                {item.name ?? item.socialNumber}
              </Text>
            </TouchableOpacity>
          )}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
        />
      )}

      {showSearch && (
        <View style={styles.searchContainer}>
          <TextInput
            style={styles.searchInput}
            placeholder="Search"
            value={search}
            onChangeText={handleSearch}
            onSubmitEditing={addContact}
          />
        </View>
      )}

      <TouchableOpacity style={styles.searchButton} onPress={handleSearchButtonPress}>
        <Text style={styles.searchButtonText}>🔍</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {flex: 1, padding: 20},
  contactItem: {
    padding: 15,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
  },
  contactName: {fontSize: 18},
  searchContainer: {
    position: 'relative',
    marginBottom: 20,
    zIndex: 1,
  },
  searchInput: {
    width: '100%',
    height: 40,
    borderColor: '#ccc',
    borderWidth: 1,
    paddingLeft: 10,
    borderRadius: 8,
    borderBottomWidth: 2,
    borderTopWidth: 2,
    borderTopColor: '#007BFF',
  },
  searchButton: {
    position: 'absolute',
    bottom: 20,
    right: 20,
    width: 50,
    height: 50,
    backgroundColor: '#007BFF',
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchButtonText: {
    color: '#fff',
    fontSize: 30,
  },
});

export default ContactsScreen;
