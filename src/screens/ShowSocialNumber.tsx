import React, { useEffect, useState } from 'react';
import { View, Text, Button, ActivityIndicator, StyleSheet, Clipboard, Alert } from 'react-native';

interface Props {
  route: {
    params: {
      uid: string;
    };
  };
  navigation: any;
}

// Define the expected shape of the response data
interface SocialNumberResponse {
  socialNumber: string;
}

const ShowSocialNumber = ({ route, navigation }: Props) => {
  const { uid } = route.params;
  const [socialNumber, setSocialNumber] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSocialNumber = async () => {
      try {
        const res = await fetch(`http://10.0.2.2:8080/users/${uid}/social-number`);
        if (!res.ok) throw new Error('Failed to fetch social number');
        
        // Type the response to conform to SocialNumberResponse
        const { socialNumber }: SocialNumberResponse = await res.json();
        setSocialNumber(socialNumber);
      } catch (e) {
        Alert.alert('Error', 'Could not load social number.');
        console.error(e);
      } finally {
        setLoading(false);
      }
    };

    fetchSocialNumber();
  }, [uid]);

  const handleContinue = () => {
    navigation.reset({ index: 0, routes: [{ name: 'HomeTabs' }] });
  };

  const handleCopy = () => {
    if (socialNumber) {
      Clipboard.setString(socialNumber);
      Alert.alert('Copied', 'Your social number has been copied to clipboard.');
    }
  };

  return (
    <View style={styles.container}>
      {loading ? (
        <ActivityIndicator size="large" />
      ) : (
        <>
          <Text style={styles.label}>Your Social Number:</Text>
          <Text style={styles.socialNumber}>{socialNumber}</Text>
          <Button title="Copy to Clipboard" onPress={handleCopy} />
          <View style={{ height: 20 }} />
          <Button title="Continue to App" onPress={handleContinue} />
        </>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: 20,
    alignItems: 'center',
  },
  label: {
    fontSize: 18,
    marginBottom: 10,
  },
  socialNumber: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 20,
  },
});

export default ShowSocialNumber;
