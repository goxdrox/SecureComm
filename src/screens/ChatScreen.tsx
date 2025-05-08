// src/screens/ChatScreen.tsx
import React, {useState, useEffect, useRef, useCallback} from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Alert,
  ActivityIndicator,
  ActionSheetIOS, // For iOS settings, or use a custom modal
} from 'react-native';
import RNFS from 'react-native-fs'; // For cleaning up audio files if necessary
import AudioRecorderPlayer, {
  AudioSet,
  PlayBackType,
  RecordBackType,
  // Import the necessary enums directly from the library
  AVEncoderAudioQualityIOSType,
  AVEncodingOption, // This enum provides values for AVEncodingType
  AudioSourceAndroidType,
  OutputFormatAndroidType,
  AudioEncoderAndroidType,
} from 'react-native-audio-recorder-player';

import MessageService from '../services/messageService';
import * as chatStorage from '../storage/chatStorage';
import {
  StoredMessage,
  ChatSettings,
  DEFAULT_PRESERVATION_HOURS,
} from '../storage/chatStorage';
import {getSession} from '../storage/secureStorage'; // To get current user's UID

// Define the UI Message type based on StoredMessage
type UIMessage = StoredMessage & {
  // Add any UI-specific temporary fields if needed
};

const ChatScreen = ({route}: any) => {
  const {recipientUid, recipientName} = route.params; // Assuming recipientName is passed for header
  const [messages, setMessages] = useState<UIMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false); // For send button state
  const [currentUserUid, setCurrentUserUid] = useState<string | null>(null);

  // Audio Recording
  const [isRecording, setIsRecording] = useState(false);
  const [recordingUri, setRecordingUri] = useState<string | null>(null);
  const audioRecorderPlayer = useRef(new AudioRecorderPlayer());
  audioRecorderPlayer.current.setSubscriptionDuration(0.1); // Optional: for UI updates during recording

  const flatListRef = useRef<FlatList<UIMessage>>(null);

  // --- Chat Settings State ---
  const [chatSettings, setChatSettings] = useState<ChatSettings>({
    preservationHours: DEFAULT_PRESERVATION_HOURS,
  });

  // Fetch current user UID
  useEffect(() => {
    getSession().then(session => {
      if (session?.uid) {
        setCurrentUserUid(session.uid);
      } else {
        // Handle case where session is not available (e.g., navigate to login)
        console.error('ChatScreen: No active session found!');
        Alert.alert('Error', 'No active session. Please log in again.');
      }
    });
  }, []);

  // --- Load Initial Data: Messages and Settings ---
  const loadChatData = useCallback(async () => {
    if (!currentUserUid || !recipientUid) return;
    setIsLoading(true);
    try {
      // 1. Delete old messages first based on current settings
      await chatStorage.deleteOldMessagesForChat(recipientUid);

      // 2. Load messages from local storage
      const localMessages = await chatStorage.getMessages(recipientUid);
      setMessages(localMessages);

      // 3. Load chat settings
      const settings = await chatStorage.getChatSettings(recipientUid);
      setChatSettings(settings);
    } catch (error) {
      console.error('ChatScreen: Failed to load chat data:', error);
      Alert.alert('Error', 'Failed to load chat history or settings.');
    } finally {
      setIsLoading(false);
    }
  }, [recipientUid, currentUserUid]);

  useEffect(() => {
    if (currentUserUid) {
      // Only load data once currentUserUid is available
      loadChatData();
    }
  }, [currentUserUid, loadChatData]); // recipientUid is in loadChatData's dep array

  // --- WebSocket Message Handling ---
  useEffect(() => {
    if (!currentUserUid) return;

    const handleNewMessage = (newMessage: StoredMessage) => {
      // Check if the message belongs to the current chat
      // Message from recipient OR message sent by current user TO recipient
      const isForCurrentChat =
        (newMessage.senderUid === recipientUid &&
          newMessage.recipientUid === currentUserUid) ||
        (newMessage.senderUid === currentUserUid &&
          newMessage.recipientUid === recipientUid);

      if (isForCurrentChat) {
        setMessages(prevMessages => {
          const existingMsgIndex = prevMessages.findIndex(
            m => m.clientMessageId === newMessage.clientMessageId,
          );
          if (existingMsgIndex !== -1) {
            // Update existing message (e.g., status change)
            const updatedMessages = [...prevMessages];
            updatedMessages[existingMsgIndex] = {
              ...updatedMessages[existingMsgIndex],
              ...newMessage,
            };
            return updatedMessages;
          } else {
            // Add new message and re-sort
            const newArr = [...prevMessages, newMessage];
            newArr.sort(
              (a, b) =>
                new Date(a.timestamp).getTime() -
                new Date(b.timestamp).getTime(),
            );
            return newArr;
          }
        });
      }
    };

    const handleMessageStatusUpdate = ({
      clientMessageId,
      chatId,
      status,
    }: {
      clientMessageId: string;
      chatId: string;
      status: StoredMessage['status'];
    }) => {
      if (chatId === recipientUid) {
        setMessages(prevMessages =>
          prevMessages.map(msg =>
            msg.clientMessageId === clientMessageId ? {...msg, status} : msg,
          ),
        );
      }
    };

    const handleConnectionStatus = (status: string) => {
      console.log('ChatScreen: Connection status:', status);
      // You could display this status in the UI header
      if (status === 'connected' && currentUserUid) {
        // Re-fetch offline messages when reconnected, MessageService might handle this automatically
        // or you can trigger a specific sync if needed.
        // MessageService.fetchAndProcessOfflineMessages(); // MessageService already does this on 'registered'
      }
    };

    const handleError = (error: Error) => {
      console.error('ChatScreen: MessageService error:', error);
      // Alert.alert("Connection Error", error.message); // Could be too noisy
    };

    MessageService.on('message', handleNewMessage);
    MessageService.on('messageStatusUpdate', handleMessageStatusUpdate);
    MessageService.on('connectionStatus', handleConnectionStatus);
    MessageService.on('error', handleError);

    // Ensure MessageService is initialized (ideally done once in App.tsx)
    // If not done centrally, you might call it here, but be careful about multiple initializations.
    // MessageService.initialize(); // Call if not handled globally

    return () => {
      MessageService.removeListener('message', handleNewMessage);
      MessageService.removeListener(
        'messageStatusUpdate',
        handleMessageStatusUpdate,
      );
      MessageService.removeListener('connectionStatus', handleConnectionStatus);
      MessageService.removeListener('error', handleError);
    };
  }, [currentUserUid, recipientUid]); // Re-subscribe if recipientUid changes (though unlikely in same screen instance)

  // --- Auto-scroll ---
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => flatListRef.current?.scrollToEnd({animated: true}), 100);
    }
  }, [messages.length]); // Trigger on new message count

  // --- Sending Messages ---
  const handleSend = async () => {
    if ((!inputText.trim() && !recordingUri) || !currentUserUid || isSending)
      return;

    setIsSending(true);
    const textToSend = inputText.trim();
    const audioUriToSend = recordingUri;

    // Clear input fields immediately for optimistic UI
    setInputText('');
    setRecordingUri(null); // Clear recorded audio URI

    try {
      let sentMessage: StoredMessage | null = null;
      if (audioUriToSend) {
        sentMessage = await MessageService.sendAudioMessage(
          recipientUid,
          audioUriToSend,
        );
      } else if (textToSend) {
        sentMessage = await MessageService.sendTextMessage(
          recipientUid,
          textToSend,
        );
      }

      if (!sentMessage) {
        // Handle case where send method returns null (e.g., error before processing)
        Alert.alert('Error', 'Could not prepare message to send.');
        // Optionally restore inputText or re-enable audio recording if it failed very early
        if (textToSend) setInputText(textToSend);
        if (audioUriToSend) setRecordingUri(audioUriToSend); // This might be tricky if file was temporary
      }
      // MessageService now emits 'message' with the locally saved message (including 'sending' status)
      // So, the optimistic update in ChatScreen before calling send is less critical if MessageService handles it.
      // The useEffect listener for 'message' will add it to the list.
    } catch (error: any) {
      console.error('ChatScreen: Failed to send message:', error);
      Alert.alert('Error', `Failed to send message: ${error.message}`);
      // Restore message to input if needed
      if (textToSend) setInputText(textToSend);
      // If audio, the URI might still be valid if not consumed, or user has to re-record
      if (audioUriToSend) setRecordingUri(audioUriToSend);
    } finally {
      setIsSending(false);
    }
  };

  // --- Audio Recording Handlers ---
  const onStartRecord = async () => {
    try {
      const path = Platform.select({
        ios: `${Date.now()}.m4a`, // .m4a is a good container for AAC audio on iOS
        android: `${RNFS.CachesDirectoryPath}/${Date.now()}.mp4`, // .mp4 can also contain AAC
      });
      if (!path) {
        Alert.alert('Error', 'Platform not supported for recording path.');
        return;
      }

      const audioSet: AudioSet = {
        // --- iOS Specific ---
        AVEncoderAudioQualityKeyIOS: AVEncoderAudioQualityIOSType.high, // Use the enum value
        AVNumberOfChannelsKeyIOS: 2, // Stereo
        AVFormatIDKeyIOS: AVEncodingOption.aac, // Use the enum value for 'aac'

        // --- Android Specific ---
        AudioSourceAndroid: AudioSourceAndroidType.MIC,
        OutputFormatAndroid: OutputFormatAndroidType.MPEG_4,
        AudioEncoderAndroid: AudioEncoderAndroidType.AAC,

        // Optional: Consider adding these for more control on Android if needed by your app
        // AudioEncodingBitRateAndroid: 128000, // e.g., 128 kbps
        // AudioSamplingRateAndroid: 44100,    // e.g., 44.1 kHz
        // AudioChannelsAndroid: 2,            // e.g., Stereo
      };

      console.log(
        'Attempting to start recorder with path:',
        path,
        'and audioSet:',
        audioSet,
      );

      const uri = await audioRecorderPlayer.current.startRecorder(
        path,
        audioSet,
      );
      audioRecorderPlayer.current.addRecordBackListener((e: RecordBackType) => {
        // console.log('Recording: ', e.currentPosition, e.currentMetering);
        return;
      });
      setRecordingUri(uri);
      setIsRecording(true);
      console.log(`Recording started at ${uri}`);
    } catch (err: any) {
      // Catch as 'any' or 'unknown' then check type if needed
      console.error('Failed to start recording', err);
      Alert.alert(
        'Recording Error',
        `Could not start audio recording: ${err.message || err}`,
      );
    }
  };

  const onStopRecord = async () => {
    try {
      const result = await audioRecorderPlayer.current.stopRecorder();
      audioRecorderPlayer.current.removeRecordBackListener();
      setIsRecording(false);
      console.log('Recording stopped, file saved at: ', result);
      // recordingUri is already set by startRecorder if it returns a promise that resolves to the path
      // setRecordingUri(result); // Ensure this is the final path if startRecorder doesn't provide it immediately
    } catch (err) {
      console.error('Failed to stop recording', err);
    }
  };

  // --- Audio Playback ---
  const onStartPlay = async (uri: string) => {
    try {
      console.log('Playing audio from: ', uri);
      await audioRecorderPlayer.current.startPlayer(uri);
      audioRecorderPlayer.current.addPlayBackListener((e: PlayBackType) => {
        if (e.currentPosition === e.duration) {
          audioRecorderPlayer.current.stopPlayer();
          audioRecorderPlayer.current.removePlayBackListener();
        }
        return;
      });
    } catch (err) {
      console.error('Failed to start playing audio', err);
    }
  };

  // --- Message Preservation Settings UI ---
  const showPreservationSettings = () => {
    const options = [
      'Keep for 1 hour',
      'Keep for 6 hours',
      'Keep for 12 hours',
      'Keep for 24 hours',
      'Keep Forever (Client-side)',
      'Cancel',
    ];
    const cancelButtonIndex = options.length - 1;

    // Simple ActionSheet for iOS, for Android you might use a custom modal or a library
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options,
          cancelButtonIndex,
          title: 'Message Preservation Time',
          message: `Current: ${
            chatSettings.preservationHours <= 0
              ? 'Forever'
              : `${chatSettings.preservationHours}h`
          }`,
        },
        async buttonIndex => {
          let newHours = chatSettings.preservationHours;
          if (buttonIndex === 0) newHours = 1;
          else if (buttonIndex === 1) newHours = 6;
          else if (buttonIndex === 2) newHours = 12;
          else if (buttonIndex === 3) newHours = 24;
          else if (buttonIndex === 4)
            newHours = 0; // 0 means keep forever locally
          else return; // Cancel

          const newSettings = {...chatSettings, preservationHours: newHours};
          await chatStorage.setChatSettings(recipientUid, newSettings);
          setChatSettings(newSettings);
          await chatStorage.deleteOldMessagesForChat(recipientUid); // Apply new setting immediately
          const updatedMessages = await chatStorage.getMessages(recipientUid); // Reload messages
          setMessages(updatedMessages);
        },
      );
    } else {
      // For Android, implement a custom modal or use a library
      Alert.alert(
        'Message Preservation',
        `Current: ${
          chatSettings.preservationHours <= 0
            ? 'Forever'
            : `${chatSettings.preservationHours}h`
        }\n\nSelect new duration:`,
        [
          {text: '1h', onPress: () => updatePreservation(1)},
          {text: '6h', onPress: () => updatePreservation(6)},
          {text: '12h', onPress: () => updatePreservation(12)},
          {text: '24h', onPress: () => updatePreservation(24)},
          {text: 'Forever', onPress: () => updatePreservation(0)},
          {text: 'Cancel', style: 'cancel'},
        ],
      );
    }
  };

  const updatePreservation = async (hours: number) => {
    const newSettings = {...chatSettings, preservationHours: hours};
    await chatStorage.setChatSettings(recipientUid, newSettings);
    setChatSettings(newSettings);
    await chatStorage.deleteOldMessagesForChat(recipientUid);
    const updatedMessages = await chatStorage.getMessages(recipientUid);
    setMessages(updatedMessages);
  };

  // --- Render Item ---
  const renderMessageItem = ({item}: {item: UIMessage}) => (
    <View
      style={[
        styles.bubbleContainer,
        item.isSender
          ? styles.sentBubbleContainer
          : styles.receivedBubbleContainer,
      ]}>
      <View
        style={[
          styles.bubble,
          item.isSender ? styles.sentBubble : styles.receivedBubble,
        ]}>
        {item.contentType === 'text' && item.content && (
          <Text style={styles.text}>{item.content}</Text>
        )}
        {item.contentType === 'audio' && item.content && (
          <TouchableOpacity onPress={() => onStartPlay(item.content)}>
            <Text style={styles.audioText}>
              ▶️ Play Voice Message ({item.isSender ? 'Sent' : 'Received'})
            </Text>
          </TouchableOpacity>
        )}
        <Text style={styles.timestamp}>
          {new Date(item.timestamp).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          })}
          {item.isSender && item.status === 'sending' && ' (Sending...)'}
          {item.isSender && item.status === 'sent_to_server' && ' (✓)'}
          {item.isSender && item.status === 'delivered_to_recipient' && ' (✓✓)'}
          {/* Add more status indicators if needed, e.g., for 'read' */}
        </Text>
      </View>
    </View>
  );

  if (isLoading && messages.length === 0) {
    // Show loader only if no messages are displayed yet
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" />
        <Text>Loading messages...</Text>
      </View>
    );
  }

  // Add a settings button to your header in navigation options, or place a button in the UI
  // Example: <TouchableOpacity onPress={showPreservationSettings}><Text>Settings</Text></TouchableOpacity>

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined} // 'height' might also work
      keyboardVerticalOffset={Platform.OS === 'ios' ? 60 : 0} // Adjust as needed
    >
      <FlatList
        ref={flatListRef}
        data={messages}
        renderItem={renderMessageItem}
        keyExtractor={item => item.clientMessageId}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          !isLoading ? (
            <Text style={styles.emptyText}>
              No messages yet. Start chatting!
            </Text>
          ) : null
        }
      />

      {recordingUri &&
        !isRecording && ( // Show if an audio is recorded but not yet sent
          <View style={styles.recordedAudioPreview}>
            <Text>Voice message ready. </Text>
            <TouchableOpacity onPress={() => onStartPlay(recordingUri)}>
              <Text style={styles.linkText}>Play</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setRecordingUri(null)}>
              <Text style={styles.linkText}>Clear</Text>
            </TouchableOpacity>
          </View>
        )}

      <View style={styles.inputContainer}>
        <TouchableOpacity
          onPress={isRecording ? onStopRecord : onStartRecord}
          style={styles.iconButton}
          disabled={isSending}>
          <Text style={styles.iconText}>{isRecording ? '⏹️' : '🎤'}</Text>
        </TouchableOpacity>
        <TextInput
          style={styles.input}
          value={inputText}
          onChangeText={setInputText}
          placeholder={isRecording ? 'Recording...' : 'Type a message...'}
          editable={!isRecording && !isSending}
          multiline
        />
        <TouchableOpacity
          onPress={handleSend}
          style={styles.iconButton}
          disabled={isSending || (!inputText.trim() && !recordingUri)}>
          <Text style={styles.iconText}>➡️</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ECE5DD', // WhatsApp like background
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    paddingVertical: 10,
    paddingHorizontal: 8,
  },
  bubbleContainer: {
    marginVertical: 2, // Reduced margin
    maxWidth: '80%',
  },
  sentBubbleContainer: {
    alignSelf: 'flex-end',
  },
  receivedBubbleContainer: {
    alignSelf: 'flex-start',
  },
  bubble: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 18,
    elevation: 1, // Android shadow
    shadowColor: '#000', // iOS shadow
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.1,
    shadowRadius: 1,
  },
  sentBubble: {
    backgroundColor: '#DCF8C6', // WhatsApp sent green
  },
  receivedBubble: {
    backgroundColor: '#FFFFFF', // White for received
  },
  text: {
    fontSize: 16,
    color: '#000',
  },
  timestamp: {
    fontSize: 11,
    color: '#888',
    alignSelf: 'flex-end',
    marginTop: 4,
  },
  audioText: {
    fontSize: 16,
    color: '#007AFF', // Blue for links/actions
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderTopWidth: 1,
    borderTopColor: '#D1D1D1',
    backgroundColor: '#F0F0F0', // Light grey input area
  },
  input: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingHorizontal: 15,
    paddingVertical: Platform.OS === 'ios' ? 10 : 8,
    fontSize: 16,
    marginHorizontal: 8,
    maxHeight: 100, // For multiline
  },
  iconButton: {
    padding: 8,
  },
  iconText: {
    fontSize: 24, // Larger icons
  },
  emptyText: {
    textAlign: 'center',
    marginTop: 50,
    fontSize: 16,
    color: '#777',
  },
  recordedAudioPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    padding: 10,
    backgroundColor: '#e0e0e0',
  },
  linkText: {
    color: '#007AFF',
    fontWeight: 'bold',
  },
});

export default ChatScreen;
