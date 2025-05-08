// src/screens/ContactProfileScreen.tsx
import React, {useState, useEffect} from 'react';
import {
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Alert,
} from 'react-native';

// Assuming Contact interface is similar to what server returns for /users/by-social/
interface FoundContactData {
  uid: string;
  name?: string | null;
  socialNumber: string;
  publicKey: string;
}

interface CurrentUserSession {
  uid: string;
  token: string;
  // other session fields
}

export default function ContactProfileScreen({navigation, route}: any) {
  // Destructure with expected names
  const {foundContactData, currentUserSession, onContactAdded} =
    route.params as {
      foundContactData: FoundContactData;
      currentUserSession: CurrentUserSession;
      onContactAdded: () => Promise<void>;
    };

  const [adding, setAdding] = useState(false);

  // Check if data is received correctly
  useEffect(() => {
    if (!foundContactData || !foundContactData.uid) {
      Alert.alert('Error', 'Contact information is missing. Please try again.');
      navigation.goBack();
    }
    if (
      !currentUserSession ||
      !currentUserSession.uid ||
      !currentUserSession.token
    ) {
      Alert.alert('Error', 'User session is missing. Please log in again.');
      navigation.goBack(); // Or navigate to login
    }
  }, [foundContactData, currentUserSession, navigation]);

  const addContact = async () => {
    if (adding || !foundContactData || !currentUserSession) return;

    const payload = {
      sessionToken: currentUserSession.token,
      contactToAdd: {
        uid: foundContactData.uid,
        name: foundContactData.name,
        socialNumber: foundContactData.socialNumber,
        publicKey: foundContactData.publicKey,
      },
    };

    // Log the values to be sent
    console.log('ContactProfileScreen: Preparing to send addContact request.');
    console.log('--- currentUserSession.token:', currentUserSession.token);
    console.log('--- foundContactData.uid:', foundContactData.uid);
    console.log('--- Full Payload Object:', JSON.stringify(payload, null, 2));

    if (
      !payload.sessionToken ||
      !payload.contactToAdd ||
      !payload.contactToAdd.uid
    ) {
      Alert.alert(
        'Internal Error',
        'Cannot proceed, token or contact UID is missing just before sending.',
      );
      setAdding(false); // Reset button state
      return;
    }

    setAdding(true);
    try {
      const response = await fetch(
        `http://10.0.2.2:8080/users/${currentUserSession.uid}/contacts`, // Corrected endpoint
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            // The sessionToken for auth is now sent in the body as per revised server logic
          },
          body: JSON.stringify({
            sessionToken: currentUserSession.token, // Send current user's token for auth
            contactToAdd: {
              // Send the details of the contact to be added
              uid: foundContactData.uid,
              name: foundContactData.name, // Optional, server can re-fetch if preferred
              socialNumber: foundContactData.socialNumber,
              publicKey: foundContactData.publicKey,
            },
          }),
        },
      );

      const responseText = await response.text(); // Get text first
      // console.log(`Add Contact Response Status: ${response.status}`);
      // console.log(`Add Contact Response Text: ${responseText}`);

      if (!response.ok) {
        let errorMsg = `Failed to add contact (Status: ${response.status})`;
        try {
          const errorData = JSON.parse(responseText);
          errorMsg = errorData?.error || errorData?.message || errorMsg;
        } catch (e) {
          // Not JSON, use text or generic
          if (responseText && responseText.length < 200)
            errorMsg = responseText;
        }
        console.error('Failed to add contact:', errorMsg);
        Alert.alert('Error', errorMsg);
        return; // Important: return after handling error
      }

      // const successData = JSON.parse(responseText); // If you need data from success response
      Alert.alert('Success', 'Contact added successfully!');
      if (onContactAdded) {
        await onContactAdded(); // Call the callback to refresh contacts on previous screen
      }
      navigation.goBack();
    } catch (e: any) {
      console.error('Unexpected error adding contact:', e);
      Alert.alert('Error', `Something went wrong: ${e.message}`);
    } finally {
      setAdding(false);
    }
  };

  // If data is not yet available or invalid, show loading or error
  if (!foundContactData || !foundContactData.uid) {
    return (
      <View style={styles.container}>
        <Text>Loading contact details or contact not found...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.photoContainer}>
        {/* TODO: Use actual photo if available in foundContactData.photoUri */}
        <Image source={require('../media/profile.jpg')} style={styles.photo} />
      </TouchableOpacity>

      <Text style={styles.userName}>
        {foundContactData.name ||
          `User ${foundContactData.uid.substring(0, 6)}`}
      </Text>

      <Text style={styles.socialNumberLabel}>Social Number</Text>
      <Text style={styles.socialNumber}>{foundContactData.socialNumber}</Text>

      <TouchableOpacity
        onPress={addContact}
        style={[styles.saveButton, adding && {opacity: 0.6}]}
        disabled={adding}>
        <Text style={styles.saveButtonText}>
          {adding ? 'Adding...' : 'Add Contact'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 30,
    paddingBottom: 50,
    backgroundColor: '#fff',
    alignItems: 'center',
  },
  photoContainer: {
    // marginTop: 'auto', // Removed for more control with paddingTop
    alignSelf: 'center',
    marginBottom: 20, // Increased margin
    width: 130, // Slightly larger
    height: 130,
    borderRadius: 65,
    backgroundColor: '#e0e0e0', // Lighter placeholder
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#007AFF',
  },
  photo: {width: 120, height: 120, borderRadius: 60}, // Slightly smaller than container for border effect
  userName: {
    fontSize: 24, // Larger
    fontWeight: '600', // Semibold
    textAlign: 'center',
    color: '#2c3e50', // Darker blue/grey
    marginBottom: 10, // Reduced margin
  },
  socialNumberLabel: {
    fontSize: 15,
    color: '#7f8c8d', // Lighter grey
    textAlign: 'center',
    // marginTop: 4, // Removed, spacing handled by userName marginBottom
  },
  socialNumber: {
    fontSize: 18, // Slightly smaller for balance
    fontWeight: '500', // Medium
    textAlign: 'center',
    color: '#34495e', // Dark grey/blue
    marginBottom: 30, // Increased margin before button
  },
  saveButton: {
    // marginTop: 'auto', // Removed
    backgroundColor: '#007AFF', // Changed to primary blue
    paddingVertical: 15, // More padding
    paddingHorizontal: 30,
    borderRadius: 10, // More rounded
    alignItems: 'center',
    width: '80%', // Relative width
    alignSelf: 'center', // Ensure it's centered
    // marginBottom: 'auto', // Removed
  },
  saveButtonText: {color: '#fff', fontWeight: 'bold', fontSize: 16},
});
