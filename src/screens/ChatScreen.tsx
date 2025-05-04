import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Alert
} from 'react-native';
import RNFS from 'react-native-fs';
import AudioRecorderPlayer from 'react-native-audio-recorder-player';
import MessageService from '../services/messageService';
import { getSession, getPrivateKey } from '../storage/secureStorage';
import { decodeBase64 } from '../utils/helpers';
import { decryptMessage } from '../utils/crypto';
import { Buffer } from 'buffer';

type Message = {
  id: string;
  type: 'sent' | 'received';
  text?: string;
  audioUri?: string;
};

const ChatScreen = ({ route }: any) => {
  const { recipientUid } = route.params;
  const [messages, setMessages] = useState<Message[]>([]);
  const [message, setMessage] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [audioUri, setAudioUri] = useState<string | null>(null);
  const flatListRef = useRef<FlatList>(null);
  const audioRecorder = useRef(new AudioRecorderPlayer());

  // 1) Load past messages on mount
  useEffect(() => {
    const loadHistory = async () => {
      const session = await getSession();
      if (!session) return;

      try {
        const url = `http://10.0.2.2:8080/messages/${session.uid}`;


        const res = await fetch(url);
  

        if (!res.ok) {
          const body = await res.text();
          console.error('History fetch failed body:', body);
          throw new Error(`Server returned ${res.status}: ${body}`);
        }

        const history = await res.json();
   

        const decrypted: Message[] = [];
        const privKeyBase64 = await getPrivateKey();
        if (!privKeyBase64) throw new Error('No private key');

        const recipientSecretKey = decodeBase64(privKeyBase64);

        for (const msg of history) {
          const ct = Buffer.from(msg.ciphertext, 'base64');
          const nonce = Buffer.from(msg.nonce, 'base64');
          const senderPub = decodeBase64(msg.senderPublicKey);
          const plain = await decryptMessage(ct, nonce, senderPub, recipientSecretKey);

          if (msg.isAudio) {
            const path = `${RNFS.CachesDirectoryPath}/${msg._id}.mp4`;
            await RNFS.writeFile(path, plain, 'base64');
            decrypted.push({ id: msg._id, type: 'received', audioUri: path });
          } else {
            decrypted.push({ id: msg._id, type: 'received', text: plain });
          }
        }

        setMessages(decrypted);
      } catch (err: any) {
        console.error('Failed loading history:', err.message);
        Alert.alert('Error', `Failed to load history: ${err.message}`);
      }
    };

    loadHistory();
  }, []);

  // 2) Setup websocket listener & connect
  useEffect(() => {
    (async () => {
      await MessageService.connect(); // Connect to WebSocket
    })();

    const onMsg = (msg: any) => {
      setMessages(prev => [
        ...prev,
        {
          id: Date.now().toString(),
          type: 'received',
          text: msg.text,
          audioUri: msg.audioUri
        }
      ]);
    };

    // Listen for incoming messages
    MessageService.on('message', onMsg);

    // Cleanup listener when component unmounts
    return () => {
      MessageService.removeListener('message', onMsg);
    };
  }, []);

  // 3) Auto-scroll
  useEffect(() => {
    flatListRef.current?.scrollToEnd({ animated: true });
  }, [messages]);

  // 4) Send handler
  const handleSend = async () => {
    if (!message.trim() && !audioUri) return;

    const newMsg: Message = {
      id: Date.now().toString(),
      type: 'sent',
      text: message.trim() || undefined,
      audioUri: audioUri || undefined
    };
    setMessages(prev => [...prev, newMsg]);
    setMessage(''); 
    setAudioUri(null);

    await MessageService.send(recipientUid, message, audioUri || undefined);
  };

  // 5) Recording handlers
  const startRecording = async () => {
    setIsRecording(true);
    const uri = await audioRecorder.current.startRecorder();
    setAudioUri(uri);
  };

  const stopRecording = async () => {
    await audioRecorder.current.stopRecorder();
    setIsRecording(false);
  };

  const renderMessage = ({ item }: { item: Message }) => (
    <View style={[styles.bubble, item.type === 'sent' ? styles.sent : styles.received]}>
      {item.text && <Text style={styles.text}>{item.text}</Text>}
      {item.audioUri && (
        <TouchableOpacity onPress={() => audioRecorder.current.startPlayer(item.audioUri!)}>
          <Text style={styles.audio}>▶️ Play Voice</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={80}
    >
      <FlatList
        ref={flatListRef}
        data={messages}
        renderItem={renderMessage}
        keyExtractor={(i) => i.id}
        contentContainerStyle={styles.list}
      />

      <View style={styles.inputRow}>
        <TouchableOpacity onPress={isRecording ? stopRecording : startRecording}>
          <Text>{isRecording ? '⏹' : '🎤'}</Text>
        </TouchableOpacity>

        <TextInput
          style={styles.input}
          placeholder="Type a message"
          value={message}
          onChangeText={setMessage}
        />

        <TouchableOpacity onPress={handleSend}>
          <Text>📤</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
};

export default ChatScreen;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f4f4f4' },
  list: { padding: 10 },
  bubble: { padding: 10, borderRadius: 16, marginVertical: 4, maxWidth: '75%' },
  sent: { backgroundColor: '#DCF8C5', alignSelf: 'flex-end' },
  received: { backgroundColor: '#E5E5EA', alignSelf: 'flex-start' },
  text: { fontSize: 16 },
  audio: { color: '#007AFF', marginTop: 4 },
  inputRow: {
    flexDirection: 'row',
    padding: 10,
    alignItems: 'center',
    borderTopWidth: 1,
    borderColor: '#ddd',
    backgroundColor: '#fff',
  },
  input: {
    flex: 1,
    padding: 8,
    marginHorizontal: 8,
    backgroundColor: '#f1f1f1',
    borderRadius: 20,
  },
});
