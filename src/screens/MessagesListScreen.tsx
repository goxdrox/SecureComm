// src/screens/MessagesListScreen.tsx (Implemented Example)
import React, { useState, useCallback } from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity, ActivityIndicator, RefreshControl, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native'; // To refresh when screen comes into focus
import * as chatStorage from '../storage/chatStorage'; // Import chatStorage
import { StoredMessage, ChatSummaryInfo } from '../storage/chatStorage'; // Import types

// Extend summary to potentially hold display name later
interface DisplayChatSummary extends ChatSummaryInfo {
  recipientName?: string;
}

export default function MessagesListScreen({ navigation }: any) {
  const [chatList, setChatList] = useState<DisplayChatSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Function to load chat list data
  const loadChatList = useCallback(async () => {
    // Don't set loading true if only refreshing in background via focus effect
    // setIsLoading(true); // Set loading only on initial load or manual refresh?
    try {
      const summaries = await chatStorage.getChatSummaries();
      // TODO: Enhance summaries with actual contact names.
      // You'd need a way to fetch contact details (name, pic) based on the chatId (recipientUid).
      // This might involve reading your contacts list from secureStorage or another source.
      const enhancedSummaries = await Promise.all(summaries.map(async (summary) => {
          // const contactDetails = await getContactDetails(summary.chatId); // Implement this lookup
          return {
              ...summary,
              recipientName: `User ${summary.chatId.substring(0, 6)}` // Placeholder name
          };
      }));

      setChatList(enhancedSummaries);
    } catch (error) {
      console.error("MessagesListScreen: Failed to load chat list", error);
      Alert.alert("Error", "Could not load conversations.");
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Load chats when the screen comes into focus
  useFocusEffect(
    useCallback(() => {
      console.log("MessagesListScreen focused, loading chats...");
      loadChatList();
    }, [loadChatList]) // Rerun if loadChatList changes (it shouldn't with useCallback)
  );

  // Manual refresh logic
  const onRefresh = useCallback(() => {
    console.log("MessagesListScreen: Manual refresh triggered.");
    setRefreshing(true);
    loadChatList(); // loadChatList handles setting refreshing false
  }, [loadChatList]);

  // Render list item
  const renderChatItem = ({ item }: { item: DisplayChatSummary }) => {
    const lastMsgText = item.lastMessage
      ? `${item.lastMessage.isSender ? 'You: ' : ''}${
          item.lastMessage.contentType === 'audio' ? '[Voice Message]' : item.lastMessage.content.substring(0, 40)
        }${item.lastMessage.content.length > 40 ? '...' : ''}`
      : 'No messages yet';

    const lastMsgTime = item.lastMessage
        ? new Date(item.lastMessage.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        : '';

    return (
      <TouchableOpacity
        style={styles.chatItem}
        onPress={() => navigation.navigate('Chat', {
            recipientUid: item.chatId,
            recipientName: item.recipientName // Pass name to ChatScreen header
        })}
      >
        <View style={styles.chatInfo}>
          {/* TODO: Add contact profile picture */}
          <Text style={styles.chatName}>{item.recipientName || item.chatId}</Text>
          <Text style={styles.lastMessage} numberOfLines={1}>{lastMsgText}</Text>
        </View>
        <Text style={styles.timestamp}>{lastMsgTime}</Text>
      </TouchableOpacity>
    );
  };

  // Initial loading state
  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#007AFF"/>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={chatList}
        renderItem={renderChatItem}
        keyExtractor={(item) => item.chatId}
        ListEmptyComponent={<View style={styles.centered}><Text style={styles.emptyText}>No conversations yet.</Text></View>}
        refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={["#007AFF"]}/>
        }
      />
    </View>
  );
}

// Add Styles (similar to previous example)
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  centered: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 20,
  },
  chatItem: {
    flexDirection: 'row',
    paddingVertical: 12, // Adjusted padding
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth, // Thinner border
    borderBottomColor: '#ccc', // Lighter grey
    alignItems: 'center',
    backgroundColor: '#fff', // Ensure background
  },
  chatInfo: {
    flex: 1,
    marginRight: 10,
  },
  chatName: {
    fontSize: 16, // Slightly smaller
    fontWeight: 'bold', // Bold name
    marginBottom: 3,
  },
  lastMessage: {
    fontSize: 14, // Slightly smaller
    color: '#555', // Darker grey for message
  },
  timestamp: {
    fontSize: 12, // Smaller timestamp
    color: '#999',
  },
  emptyText: {
      // textAlign: 'center', // Centered by parent View
      // marginTop: 50,
      fontSize: 16,
      color: '#777',
  }
});