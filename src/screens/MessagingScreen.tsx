import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, Button, FlatList, StyleSheet } from 'react-native';
import { encryptMessage, decryptMessage } from '../utils/crypto';
import { getPrivateKey } from '../storage/secureStorage';
import { decodeBase64 } from '../utils/helpers';

const MessagingScreen = ({ route }: any) => {
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState<
    { type: 'sent' | 'received'; message: string }[]
  >([]);

  const { recipientPublicKey } = route.params;

  const handleSendMessage = async () => {
    try {
      const senderSecretKeyBase64 = await getPrivateKey();
      if (!senderSecretKeyBase64) throw new Error('No sender secret key');

      const senderSecretKey = decodeBase64(senderSecretKeyBase64);

      const encrypted = encryptMessage(message, recipientPublicKey, senderSecretKey);

      setMessages(prev => [
        ...prev,
        {
          type: 'sent',
          message: JSON.stringify({
            ciphertext: Array.from(encrypted.ciphertext),
            nonce: Array.from(encrypted.nonce),
            senderPublicKey: Array.from(encrypted.senderPublicKey),
          }),
        },
      ]);

      setMessage('');
    } catch (error) {
      console.error('Failed to send message:', error);
    }
  };

  const handleReceiveMessage = async (encryptedObject: {
    ciphertext: number[];
    nonce: number[];
    senderPublicKey: number[];
  }) => {
    try {
      const recipientSecretKeyBase64 = await getPrivateKey();
      if (!recipientSecretKeyBase64) throw new Error('No recipient secret key');

      const recipientSecretKey = decodeBase64(recipientSecretKeyBase64);

      const decrypted = await decryptMessage(
        new Uint8Array(encryptedObject.ciphertext),
        new Uint8Array(encryptedObject.nonce),
        new Uint8Array(encryptedObject.senderPublicKey),
        recipientSecretKey
      );

      setMessages(prev => [...prev, { type: 'received', message: decrypted }]);
    } catch (error) {
      console.error('Failed to decrypt message:', error);
    }
  };

  // Simulate receiving a message
  useEffect(() => {
    setTimeout(async () => {
      const senderSecretKeyBase64 = await getPrivateKey();
      if (!senderSecretKeyBase64) return;

      const senderSecretKey = decodeBase64(senderSecretKeyBase64);
      const encrypted = encryptMessage('Simulated incoming message', recipientPublicKey, senderSecretKey);

      handleReceiveMessage({
        ciphertext: Array.from(encrypted.ciphertext),
        nonce: Array.from(encrypted.nonce),
        senderPublicKey: Array.from(encrypted.senderPublicKey),
      });
    }, 3000);
  }, [recipientPublicKey]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Messaging</Text>
      <FlatList
        data={messages}
        renderItem={({ item }) => (
          <View
            style={[
              styles.messageContainer,
              item.type === 'sent' ? styles.sentMessage : styles.receivedMessage,
            ]}
          >
            <Text>{item.type === 'sent' ? 'You' : 'Them'}: {item.message}</Text>
          </View>
        )}
        keyExtractor={(_, index) => index.toString()}
        style={styles.messageList}
      />
      <TextInput
        style={styles.input}
        placeholder="Type your message"
        value={message}
        onChangeText={setMessage}
      />
      <Button title="Send Message" onPress={handleSendMessage} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  title: { fontSize: 24, textAlign: 'center', marginBottom: 16 },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    padding: 8,
    marginBottom: 16,
  },
  messageList: { flex: 1, marginBottom: 16 },
  messageContainer: { padding: 10, marginVertical: 5, borderRadius: 10 },
  sentMessage: { backgroundColor: '#d1f7d1', alignSelf: 'flex-end' },
  receivedMessage: { backgroundColor: '#f7d1d1', alignSelf: 'flex-start' },
});

export default MessagingScreen;
