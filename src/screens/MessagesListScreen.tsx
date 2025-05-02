import React from 'react';
import { View, Text, Button } from 'react-native';

export default function MessagesListScreen({ navigation }: any) {
  const dummyRecipientPublicKey = 'dummyPublicKey123'; // For testing

  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
      <Text>Messages List</Text>
      <Button
        title="Chat with Contact 1"
        onPress={() => navigation.navigate('Chat',      { recipientUid: 'contact-1' })}
      />
    </View>
  );
}
