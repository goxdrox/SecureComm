// src/storage/chatStorage.ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import {generateClientMessageId} from '../utils/helpers'; // Correctly imports now

const CHAT_MESSAGES_PREFIX = 'chat_messages_';
const CHAT_SETTINGS_PREFIX = 'chat_settings_';
export const DEFAULT_PRESERVATION_HOURS = 24;

// Structure of a message as stored locally
export type StoredMessage = {
  clientMessageId: string;
  serverMessageId?: string;
  chatId: string;
  senderUid: string;
  recipientUid: string;
  content: string;
  contentType: 'text' | 'audio' | string;
  timestamp: string;
  serverTimestamp?: string;
  isSender: boolean;
  status?:
    | 'sending'
    | 'sent_to_server'
    | 'delivered_to_recipient'
    | 'read'
    | 'failed';
  isRead?: boolean;
};

// Define Chat Summary type
export interface ChatSummaryInfo {
  chatId: string; // This is the recipientUid
  lastMessage: StoredMessage | null;
}

export type ChatSettings = {
  preservationHours: number;
};

export const getChatSummaries = async (): Promise<ChatSummaryInfo[]> => {
    try {
        const allKeys = await AsyncStorage.getAllKeys();
        const chatKeys = allKeys.filter(key => key.startsWith(CHAT_MESSAGES_PREFIX));
        const summaries = await Promise.all(chatKeys.map(async (key) => {
            const chatId = key.substring(CHAT_MESSAGES_PREFIX.length);
            const messagesStr = await AsyncStorage.getItem(key);
            const messages: StoredMessage[] = messagesStr ? JSON.parse(messagesStr) : [];
            // Sort messages by timestamp descending to get the last one
            messages.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
            return {
                chatId: chatId,
                lastMessage: messages.length > 0 ? messages[0] : null,
            };
        }));
        // Sort summaries so the chat with the most recent message is first
        summaries.sort((a, b) => {
             if (!b.lastMessage) return -1; // Chats without messages go last
             if (!a.lastMessage) return 1;
             return new Date(b.lastMessage.timestamp).getTime() - new Date(a.lastMessage.timestamp).getTime();
        });
        return summaries;
    } catch (error) {
        console.error("ChatStorage: Failed to get chat summaries", error);
        return [];
    }
};

const getMessagesStorageKey = (chatId: string) =>
  `${CHAT_MESSAGES_PREFIX}${chatId}`;
const getSettingsStorageKey = (chatId: string) =>
  `${CHAT_SETTINGS_PREFIX}${chatId}`;

export const getMessages = async (chatId: string): Promise<StoredMessage[]> => {
  const key = getMessagesStorageKey(chatId);
  try {
    const messagesStr = await AsyncStorage.getItem(key);
    const messages: StoredMessage[] = messagesStr
      ? JSON.parse(messagesStr)
      : [];
    messages.sort(
      (a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
    );
    return messages;
  } catch (error) {
    console.error(
      `ChatStorage: Failed to get messages for chat ${chatId}`,
      error,
    );
    return [];
  }
};

export const saveMessages = async (
  chatId: string,
  newMessages: StoredMessage[],
): Promise<void> => {
  if (!newMessages || newMessages.length === 0) return;
  const key = getMessagesStorageKey(chatId);
  try {
    const existingMessagesStr = await AsyncStorage.getItem(key);
    let messages: StoredMessage[] = existingMessagesStr
      ? JSON.parse(existingMessagesStr)
      : [];
    newMessages.forEach(newMessage => {
      const index = messages.findIndex(
        m => m.clientMessageId === newMessage.clientMessageId,
      );
      if (index !== -1) {
        messages[index] = {...messages[index], ...newMessage};
      } else {
        messages.push(newMessage);
      }
    });
    messages.sort(
      (a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
    );
    await AsyncStorage.setItem(key, JSON.stringify(messages));
  } catch (error) {
    console.error(
      `ChatStorage: Failed to save message(s) for chat ${chatId}`,
      error,
    );
  }
};

export const updateMessageStatus = async (
  chatId: string,
  clientMessageId: string,
  status: StoredMessage['status'],
): Promise<StoredMessage | null> => {
  const key = getMessagesStorageKey(chatId);
  try {
    const messagesStr = await AsyncStorage.getItem(key);
    if (!messagesStr) return null;
    let messages: StoredMessage[] = JSON.parse(messagesStr);
    const messageIndex = messages.findIndex(
      m => m.clientMessageId === clientMessageId,
    );
    if (messageIndex !== -1) {
      messages[messageIndex].status = status;
      await AsyncStorage.setItem(key, JSON.stringify(messages));
      return messages[messageIndex];
    }
    return null;
  } catch (error) {
    console.error(
      `ChatStorage: Failed to update message status for ${clientMessageId}`,
      error,
    );
    return null;
  }
};

export const getChatSettings = async (
  chatId: string,
): Promise<ChatSettings> => {
  const key = getSettingsStorageKey(chatId);
  try {
    const settingsStr = await AsyncStorage.getItem(key);
    if (settingsStr) {
      return JSON.parse(settingsStr);
    }
  } catch (error) {
    console.error(
      `ChatStorage: Failed to get settings for chat ${chatId}`,
      error,
    );
  }
  return {preservationHours: DEFAULT_PRESERVATION_HOURS};
};

export const setChatSettings = async (
  chatId: string,
  settings: ChatSettings,
): Promise<void> => {
  const key = getSettingsStorageKey(chatId);
  try {
    // Ensure preservationHours is a number, defaulting if not.
    const validHours =
      typeof settings.preservationHours === 'number'
        ? settings.preservationHours
        : DEFAULT_PRESERVATION_HOURS;
    await AsyncStorage.setItem(
      key,
      JSON.stringify({...settings, preservationHours: validHours}),
    );
  } catch (error) {
    console.error(
      `ChatStorage: Failed to set settings for chat ${chatId}`,
      error,
    );
  }
};

export const deleteOldMessagesForChat = async (
  chatId: string,
): Promise<number> => {
  const settings = await getChatSettings(chatId);
  if (settings.preservationHours <= 0) return 0; // 0 or less means keep indefinitely for this chat

  const cutoffTime = new Date(
    Date.now() - settings.preservationHours * 60 * 60 * 1000,
  ).getTime();
  const key = getMessagesStorageKey(chatId);
  let deletedCount = 0;

  try {
    const messagesStr = await AsyncStorage.getItem(key);
    if (!messagesStr) return 0;
    const messages: StoredMessage[] = JSON.parse(messagesStr);
    const keptMessages: StoredMessage[] = [];

    messages.forEach(msg => {
      if (new Date(msg.timestamp).getTime() >= cutoffTime) {
        keptMessages.push(msg);
      } else {
        // TODO: If msg.content is a local file URI (e.g., for audio), delete it using RNFS.
        // For example:
        // if (msg.contentType === 'audio' && msg.content.startsWith('file://')) {
        //   RNFS.unlink(msg.content).catch(err => console.warn(`Failed to delete audio file ${msg.content}`, err));
        // }
        deletedCount++;
      }
    });

    if (deletedCount > 0) {
      await AsyncStorage.setItem(key, JSON.stringify(keptMessages));
      console.log(
        `ChatStorage: Deleted ${deletedCount} old messages for chat ${chatId}`,
      );
    }
    return deletedCount;
  } catch (error) {
    console.error(
      `ChatStorage: Failed to delete old messages for chat ${chatId}`,
      error,
    );
    return 0;
  }
};

export const deleteOldMessagesForAllKnownChats = async (
  knownChatIds: string[],
): Promise<void> => {
  console.log(
    'ChatStorage: Running cleanup for old messages across known chats...',
  );
  for (const chatId of knownChatIds) {
    await deleteOldMessagesForChat(chatId);
  }
};

export const clearChat = async (chatId: string): Promise<void> => {
  try {
    // Consider deleting local files associated with messages here
    const messages = await getMessages(chatId);
    // for (const msg of messages) {
    //   if (msg.contentType === 'audio' && msg.content.startsWith('file://')) {
    //     await RNFS.unlink(msg.content).catch(err => console.warn(`Failed to delete audio file ${msg.content} during clearChat`, err));
    //   }
    // }
    await AsyncStorage.removeItem(getMessagesStorageKey(chatId));
    await AsyncStorage.removeItem(getSettingsStorageKey(chatId));
    console.log(`ChatStorage: Cleared all data for chat ${chatId}`);
  } catch (error) {
    console.error(`ChatStorage: Failed to clear chat ${chatId}`, error);
  }
};

// Removed generateLocalClientMessageId as it's now imported from helpers.ts
