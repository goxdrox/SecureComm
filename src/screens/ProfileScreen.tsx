import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Image,
  Alert,
  StyleSheet,
  Platform,
  Clipboard,
} from 'react-native';
import { launchImageLibrary } from 'react-native-image-picker';
import { getSession, updateProfile } from '../storage/secureStorage';

const ProfileScreen = ({ navigation }: any) => {
  const [socialNumber, setSocialNumber] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [photoUri, setPhotoUri] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const session = await getSession();


      if (session) {
        setSocialNumber(session.socialNumber || ''); 
        setFirstName(session.firstName || '');
        setLastName(session.lastName || '');
        setPhotoUri(session.photoUri || null);
      }
    })();
  }, []);

  const pickImage = () => {
    launchImageLibrary(
      {
        mediaType: 'photo',
        quality: 0.7,
      },
      (response) => {
        if (response.didCancel) return;
        if (response.errorCode) {
          Alert.alert('Error', response.errorMessage || 'ImagePicker Error');
          return;
        }
        const uri =
          Platform.OS === 'android'
            ? response.assets?.[0].uri
            : response.assets?.[0].uri?.replace('file://', '');
        if (uri) setPhotoUri(uri);
      }
    );
  };

  const handleSave = async () => {
    await updateProfile({ firstName, lastName, photoUri });
    Alert.alert('Profile Saved');
    navigation.goBack();
  };

  const handleCopySocialNumber = () => {
    Clipboard.setString(socialNumber);
    Alert.alert('Copied!', 'Your social number has been copied to clipboard.');
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity onPress={pickImage} style={styles.photoContainer}>
        {photoUri ? (
          <Image source={{ uri: photoUri }} style={styles.photo} />
        ) : (
          <Image source={require('../media/add-profile.jpg')} style={styles.photo} />
        )}
      </TouchableOpacity>

      <TouchableOpacity onPress={handleCopySocialNumber}>
        <Text style={styles.socialNumberLabel}>Your Social Number (tap to copy)</Text>
        <Text style={styles.socialNumber}>{socialNumber}</Text>
      </TouchableOpacity>

      <TextInput
        style={styles.input}
        placeholder="First Name"
        value={firstName}
        onChangeText={setFirstName}
      />
      <TextInput
        style={styles.input}
        placeholder="Last Name"
        value={lastName}
        onChangeText={setLastName}
      />

      <TouchableOpacity onPress={handleSave} style={styles.saveButton}>
        <Text style={styles.saveButtonText}>Save Profile</Text>
      </TouchableOpacity>
    </View>
  );
};

export default ProfileScreen;

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#fff' },
  photoContainer: {
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
  photoPlaceholder: { color: '#666' },
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
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  saveButton: {
    backgroundColor: '#28a745',
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  saveButtonText: { color: '#fff', fontWeight: 'bold' },
});
