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
    setLoading(true); // Set loading to true when fetching starts
    setRefreshing(true); // Also indicate refreshing if called by onRefresh

    try {
      const session = await getSession();
      console.log('ContactsScreen: Retrieved session:', session); // For debugging

      if (!session || !session.uid || !session.token) {
        console.error(
          'Fetch contacts failed: No active session, UID, or token.',
        );
        Alert.alert(
          'Authentication Error',
          "You're not logged in. Please log in to view contacts.",
        );
        setContacts([]);
        setFilteredContacts([]);
        // navigation.navigate('Login'); // Optionally navigate to login
        return; // Exit early
      }

      const currentUserUid = session.uid;
      const token = session.token;

      // Corrected URL and added headers with authentication token
      const response = await fetch(
        `http://10.0.2.2:8080/users/${currentUserUid}/contacts`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'X-Session-Token': token,
          },
        },
      );

      const responseText = await response.text(); // Get raw response text first for better debugging
      console.log(
        `ContactsScreen: Fetch contacts response status: ${response.status}`,
      );
      // console.log(`ContactsScreen: Fetch contacts response text: ${responseText}`); // Uncomment for deep debug

      if (!response.ok) {
        // Try to parse error JSON from server, otherwise use status text
        let errorMessage = `Server error: ${response.status}`;
        try {
          const errorJson = JSON.parse(responseText);
          errorMessage = errorJson.error || errorJson.message || errorMessage;
        } catch (e) {
          // Response was not JSON (e.g., HTML error page)
          console.warn(
            'ContactsScreen: Non-JSON error response from server:',
            responseText,
          );
          if (
            responseText.toLowerCase().includes('cannot get') ||
            response.status === 404
          ) {
            errorMessage =
              'Could not reach contacts service (404). Please check the URL.';
          } else if (responseText.length < 200 && responseText.length > 0) {
            // Short non-JSON error
            errorMessage = responseText;
          }
        }
        throw new Error(errorMessage);
      }

      const data = JSON.parse(responseText); // Now parse as JSON

      if (!Array.isArray(data)) {
        console.warn(
          'ContactsScreen: Unexpected response format (expected array):',
          data,
        );
        Alert.alert(
          'Data Error',
          'Received an unexpected format for contacts from the server.',
        );
        setContacts([]);
        setFilteredContacts([]);
        return;
      }

      const mappedContacts: Contact[] = data.map((e: any) => ({
        uid: e.uid,
        socialNumber: e.socialNumber,
        name: e.name || e.socialNumber || `User ${e.uid.substring(0, 4)}`, // Provide a better fallback name
      }));

      setContacts(mappedContacts);
      setFilteredContacts(mappedContacts); // Initialize filtered contacts
    } catch (error: any) {
      // Catch as any or unknown
      console.error('Fetch contacts failed:', error.message, error);
      Alert.alert('Error', `Failed to fetch contacts: ${error.message}`);
      setContacts([]); // Clear contacts on error to reflect failure
      setFilteredContacts([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchContacts();
  }, []);

  const onRefresh = useCallback(() => {
    // fetchContacts already sets refreshing to true and false
    fetchContacts();
  }, []); // No dependencies needed as fetchContacts gets fresh session

  const debouncedSearch = useCallback(
    debounce((text: string) => {
      if (!text) {
        setFilteredContacts(contacts);
        return;
      }
      const filtered = contacts.filter(c => c.socialNumber.includes(text));
      setFilteredContacts(filtered);
    }, 250),
    [contacts],
  );

  const handleSearch = (text: string) => {
    setSearch(text);
    debouncedSearch(text);
  };

  const handleContactPress = (contactUid: string) => {
    navigation.navigate('Chat', {recipientUid: contactUid});
    setSearch('');
  };

  // Ensure addContact also uses the correct URL and includes the session token if it modifies server data
  // Example for addContact (if it were POSTing to add a contact to the current user's list)
  const findContactBySocial = async () => {
    // Renamed from addContact for clarity of current function
    if (!search.trim() || !isOnlyNumbers(search)) {
      Alert.alert(
        'Invalid Input',
        'Please enter a valid social number to search.',
      );
      return;
    }
    try {
      const session = await getSession();
      console.log('ContactsScreen: Session object before navigating to ContactProfile:', JSON.stringify(session, null, 2));

      if (!session || !session.token) {
        Alert.alert(
          'Authentication Issue',
          'Your session is missing or invalid. Please log in again before searching for contacts.',
        );
        return; // Stop further execution if session is invalid
      }
      // This endpoint GETS a user profile, does not add a contact directly to current user's list.
      // The actual adding of a contact happens on ContactProfile screen or similar.
      const res = await fetch(
        `http://10.0.2.2:8080/users/by-social/${search.trim()}`,
        {
          headers: {
            // This endpoint on server currently doesn't require auth, but it's good practice if it did.
            // 'X-Session-Token': session.token,
          },
        },
      );

      if (!res.ok) {
        const errText = await res.text();
        let errMsg = `User not found or error: ${res.status}`;
        try {
          const errJson = JSON.parse(errText);
          errMsg = errJson.error || errMsg;
        } catch (e) {}
        Alert.alert('Search Failed', errMsg);
        return;
      }

      const data = await res.json();
      // Navigate to a screen where the user can confirm adding this found contact
      navigation.navigate('ContactProfile', {
        foundContactData: data,
        currentUserSession: session, // Pass the validated session
        onContactAdded: fetchContacts,
      });
    } catch (e: any) {
      console.error('Failed to find contact by social:', e);
      Alert.alert('Error', `Failed to search contact: ${e.message}`);
    }
  };

  // Update the search button handler or input submission to use the correct function
  const handleSearchButtonPress = () => {
    if (showSearch && search.trim() && isOnlyNumbers(search)) {
      findContactBySocial(); // If search input is open and has a social number, try to find
    } else {
      setShowSearch(prev => !prev); // Toggle search input visibility
      if (showSearch) setSearch(''); // Clear search if hiding
    }
  };

  // Ensure onSubmitEditing for the TextInput calls the correct search/add logic
  // In your existing code, onSubmitEditing={addContact} which is now findContactBySocial
  // ... in the <TextInput ... onSubmitEditing={findContactBySocial} />

  return (
    <View style={styles.container}>
      {loading ? (
        <Text>Loading contacts...</Text>
      ) :  filteredContacts.length === 0 ? (
        isOnlyNumbers(search) ? (
          <TouchableOpacity
            style={styles.contactItem}
            onPress={findContactBySocial}>
            <Text style={styles.contactName}>Search for contact {search}</Text>
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
            placeholder="Search by Social Number"
            value={search}
            onChangeText={handleSearch} // handleSearch calls debouncedSearch for filtering existing list
            onSubmitEditing={findContactBySocial} // This searches for a new contact on the server
            keyboardType="numeric"
          />
        </View>
      )}

      <TouchableOpacity
        style={styles.searchButton}
        onPress={handleSearchButtonPress}>
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
