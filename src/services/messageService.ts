// src/services/messageService.ts
import RNFS from 'react-native-fs';
import { Buffer } from 'buffer';
import { EventEmitter } from 'events';

import {
  getSession,
  getPublicKey as getOwnPublicKey, // Renamed for clarity
  getPrivateKey as getOwnPrivateKey, // Renamed for clarity
} from '../storage/secureStorage';
import * as chatStorage from '../storage/chatStorage'; // Import chatStorage
import { StoredMessage } from '../storage/chatStorage'; // Import StoredMessage type
import { encryptMessage, decryptMessage } from '../utils/crypto';
import { decodeBase64, encodeBase64, generateClientMessageId } from '../utils/helpers';

// Define the structure of the encrypted payload exchanged with the server
type EncryptedPayloadFromServer = {
  type: 'message'; // Indicates a new message from server
  clientMessageId: string; // ID generated by the original sender
  senderUid: string;
  recipientUid: string; // Should be current user's UID
  nonce: string; // base64
  ciphertext: string; // base64
  senderPublicKey: string; // base64, original sender's public key
  isAudio?: boolean;
  timestamp: string; // Original sender's client timestamp (ISO)
  serverTimestamp?: string; // Timestamp from server
  // _id?: string; // Server's internal DB id, if sent
};

// Type for outgoing payload
type EncryptedPayloadToServer = Omit<EncryptedPayloadFromServer, 'recipientUid' | 'serverTimestamp'> & {
    recipientUid: string; // Explicitly recipient
};


const API_BASE_URL = 'http://10.0.2.2:8080'; // For Android emulator accessing host machine
const WS_URL = 'ws://10.0.2.2:8080';


class MessageService extends EventEmitter {
  private ws?: WebSocket;
  private currentUid?: string;
  private currentSessionToken?: string;
  private reconnectTimeoutId?: NodeJS.Timeout;
  private isConnected: boolean = false;
  private pendingAckMessages: Set<string> = new Set(); // clientMessageIds to ACK
  private ackDebounceTimeout?: NodeJS.Timeout;


  constructor() {
    super();
    this.setMaxListeners(20); // Increase listeners if needed
  }

  public async initialize() {
    const session = await getSession();
    if (session && session.uid && session.token) {
      this.currentUid = session.uid;
      this.currentSessionToken = session.token;
      this.connect();
    } else {
      console.warn('MessageService: No session, skipping connection.');
    }
  }

  private connect() {
    if (this.isConnected || !this.currentUid || !this.currentSessionToken) {
      if (!this.currentUid || !this.currentSessionToken) {
          console.log('MessageService: Attempted to connect without UID or token.');
      }
      return;
    }
    console.log('MessageService: Attempting to connect...');

    this.ws = new WebSocket(WS_URL);

    this.ws.onopen = () => {
      this.isConnected = true;
      console.log('MessageService: WebSocket connection opened.');
      this.emit('connectionStatus', 'connected');
      // Register with UID and session token
      this.ws!.send(JSON.stringify({
        type: 'register',
        uid: this.currentUid,
        token: this.currentSessionToken,
      }));
      // Clear any previous reconnect timeout
      if (this.reconnectTimeoutId) clearTimeout(this.reconnectTimeoutId);
    };

    this.ws.onmessage = async ({ data }) => {
      try {
        const serverMsg = JSON.parse(data.toString());

        if (serverMsg.type === 'registered') {
          console.log('MessageService: WebSocket registered with server.');
          // Fetch offline messages after successful registration
          await this.fetchAndProcessOfflineMessages();
          return;
        }

        if (serverMsg.type === 'message') {
          // This is a real-time message or an offline message pushed after fetch (if server does that)
          const payload = serverMsg as EncryptedPayloadFromServer;
          if (payload.recipientUid !== this.currentUid) return; // Should not happen if server routes correctly

          console.log(`MessageService: Received real-time message ${payload.clientMessageId} from ${payload.senderUid}`);
          const storedMessage = await this.processIncomingMessagePayload(payload);
          if (storedMessage) {
            this.emit('message', storedMessage); // Emit for UI
            this.scheduleAck(storedMessage.clientMessageId);
          }
        } else if (serverMsg.type === 'error') {
            console.error('MessageService: Received error from server:', serverMsg.message);
            this.emit('error', new Error(serverMsg.message));
        }

      } catch (error) {
        console.error('MessageService: Error processing incoming WebSocket message:', error);
        this.emit('error', error instanceof Error ? error : new Error(String(error)));
      }
    };

    this.ws.onerror = (errorEvent) => {
      console.error('MessageService: WebSocket error:', errorEvent.message);
      this.emit('connectionStatus', 'error');
      this.emit('error', new Error(errorEvent.message || 'WebSocket error'));
      // No automatic reconnect here, let onclose handle it.
    };

    this.ws.onclose = (closeEvent) => {
      this.isConnected = false;
      console.log(`MessageService: WebSocket connection closed. Code: ${closeEvent.code}, Reason: ${closeEvent.reason}`);
      this.emit('connectionStatus', 'disconnected');
      // Implement reconnect logic with backoff
      if (this.reconnectTimeoutId) clearTimeout(this.reconnectTimeoutId);
      // Don't attempt to reconnect if token is invalid (e.g. code 1008 from server)
      if (closeEvent.code === 1008) { // 1008 Policy Violation (e.g. auth failed)
          console.warn("MessageService: WebSocket closed due to policy violation (e.g. auth). Won't auto-reconnect.");
          // Potentially clear session and navigate to login
          this.emit('authError', 'WebSocket authentication failed.');
          return;
      }
      this.reconnectTimeoutId = setTimeout(() => {
        console.log('MessageService: Attempting to reconnect...');
        this.connect();
      }, 5000); // Reconnect after 5 seconds
    };
  }

  public disconnect() {
    if (this.reconnectTimeoutId) clearTimeout(this.reconnectTimeoutId);
    this.reconnectTimeoutId = undefined; // Prevent reconnection attempts after explicit disconnect

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.close(1000, "User disconnected"); // 1000 is normal closure
    }
    this.isConnected = false;
    console.log('MessageService: Disconnected.');
    this.emit('connectionStatus', 'disconnected');
  }


  private async processIncomingMessagePayload(payload: EncryptedPayloadFromServer, source: 'realtime' | 'offline' = 'realtime'): Promise<StoredMessage | null> {
    if (!this.currentUid) return null;

    // Check if message already processed (e.g., received via real-time AND offline fetch)
    const existing = (await chatStorage.getMessages(payload.senderUid)).find(m => m.clientMessageId === payload.clientMessageId);
    if (existing && existing.status !== 'sending') { // If it exists and isn't just an optimistic 'sending' one
      console.log(`MessageService: Duplicate message ${payload.clientMessageId} from ${source}, already processed. Updating timestamp if newer.`);
      if (payload.serverTimestamp && (!existing.serverTimestamp || new Date(payload.serverTimestamp) > new Date(existing.serverTimestamp))) {
        await chatStorage.saveMessages(payload.senderUid, [{...existing, serverTimestamp: payload.serverTimestamp}]);
      }
      return existing; // Don't re-process or re-emit for UI if it's a true duplicate.
    }


    const ownPrivateKeyBase64 = await getOwnPrivateKey();
    if (!ownPrivateKeyBase64) {
      console.error('MessageService: Missing own private key for decryption.');
      this.emit('error', new Error('Your private key is missing. Cannot decrypt messages.'));
      return null;
    }

    try {
      const ownPrivateKey = decodeBase64(ownPrivateKeyBase64);
      const ciphertext = Buffer.from(payload.ciphertext, 'base64');
      const nonce = Buffer.from(payload.nonce, 'base64');
      const senderPublicKey = decodeBase64(payload.senderPublicKey);

      const decryptedContent = await decryptMessage(
        ciphertext,
        nonce,
        senderPublicKey,
        ownPrivateKey,
      );

      let finalContent = decryptedContent;
      let contentType: StoredMessage['contentType'] = 'text';

      if (payload.isAudio) {
        contentType = 'audio';
        const audioPath = `${RNFS.CachesDirectoryPath}/${payload.clientMessageId}.mp4`; // Use clientMessageId for unique name
        await RNFS.writeFile(audioPath, decryptedContent, 'base64');
        finalContent = audioPath; // Store local URI
      }

      const storedMessage: StoredMessage = {
        clientMessageId: payload.clientMessageId,
        // serverMessageId: payload._id, // If server sends its DB ID
        chatId: payload.senderUid, // For 1-on-1, chatId is the other person's UID
        senderUid: payload.senderUid,
        recipientUid: this.currentUid,
        content: finalContent,
        contentType: contentType,
        timestamp: payload.timestamp, // Sender's original timestamp
        serverTimestamp: payload.serverTimestamp,
        isSender: false,
        status: 'delivered_to_recipient', // Or 'read' if app is in foreground and chat open
        isRead: false, // Default to false
      };

      await chatStorage.saveMessages(payload.senderUid, [storedMessage]);
      console.log(`MessageService: Processed and stored message ${storedMessage.clientMessageId} from ${payload.senderUid}`);
      return storedMessage;

    } catch (error) {
      console.error(`MessageService: Failed to decrypt or process message ${payload.clientMessageId}:`, error);
      this.emit('error', new Error(`Failed to process message ${payload.clientMessageId}`));
      // Optionally save a "failed decryption" placeholder
      const failedMessage: StoredMessage = {
        clientMessageId: payload.clientMessageId,
        chatId: payload.senderUid,
        senderUid: payload.senderUid,
        recipientUid: this.currentUid!,
        content: "Error: Could not decrypt this message.",
        contentType: 'text',
        timestamp: payload.timestamp,
        isSender: false,
        status: 'failed',
      };
      await chatStorage.saveMessages(payload.senderUid, [failedMessage]);
      return failedMessage; // So UI can show something
    }
  }

  private async fetchAndProcessOfflineMessages() {
    if (!this.currentUid || !this.currentSessionToken) return;
    console.log('MessageService: Fetching offline messages...');
    try {
      const response = await fetch(`${API_BASE_URL}/messages/offline?uid=${this.currentUid}`, {
        headers: {
          'X-Session-Token': this.currentSessionToken,
        },
      });

      if (!response.ok) {
        const errorBody = await response.text();
        console.error(`MessageService: Failed to fetch offline messages: ${response.status} ${errorBody}`);
        this.emit('error', new Error(`Failed to fetch offline messages: ${response.status}`));
        return;
      }

      const offlineMessages: EncryptedPayloadFromServer[] = await response.json();
      console.log(`MessageService: Received ${offlineMessages.length} offline messages.`);

      if (offlineMessages.length > 0) {
        const processedClientMessageIds: string[] = [];
        for (const payload of offlineMessages) {
          const storedMessage = await this.processIncomingMessagePayload(payload, 'offline');
          if (storedMessage) {
            this.emit('message', storedMessage); // Emit for UI
            processedClientMessageIds.push(storedMessage.clientMessageId);
          }
        }
        // Acknowledge all successfully processed messages
        if (processedClientMessageIds.length > 0) {
          this.batchAckMessages(processedClientMessageIds);
        }
      }
    } catch (error) {
      console.error('MessageService: Error during offline message fetch/process:', error);
      this.emit('error', error instanceof Error ? error : new Error('Failed to sync offline messages.'));
    }
  }

  // Debounced ACK for real-time messages
  private scheduleAck(clientMessageId: string) {
      this.pendingAckMessages.add(clientMessageId);
      if (this.ackDebounceTimeout) clearTimeout(this.ackDebounceTimeout);
      this.ackDebounceTimeout = setTimeout(() => {
          const idsToAck = Array.from(this.pendingAckMessages);
          this.pendingAckMessages.clear();
          if (idsToAck.length > 0) {
              this.batchAckMessages(idsToAck);
          }
      }, 3000); // Send ACKs every 3 seconds or if batch grows
  }


  private async batchAckMessages(clientMessageIds: string[]) {
    if (!this.currentUid || !this.currentSessionToken || clientMessageIds.length === 0) return;
    console.log(`MessageService: Acknowledging messages: ${clientMessageIds.join(', ')}`);
    try {
      const response = await fetch(`${API_BASE_URL}/messages/ack`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Session-Token': this.currentSessionToken,
        },
        body: JSON.stringify({
          uid: this.currentUid,
          token: this.currentSessionToken, // Server validates this again
          messageIds: clientMessageIds,
        }),
      });
      if (!response.ok) {
        const errorBody = await response.text();
        console.error(`MessageService: Failed to ACK messages: ${response.status} ${errorBody}`);
        // Consider re-queueing these ACKs or handling failure
      } else {
        const ackResult = await response.json();
        console.log(`MessageService: Messages acknowledged on server. Count: ${ackResult.acknowledgedCount}`);
      }
    } catch (error) {
      console.error('MessageService: Error sending ACK:', error);
      // Handle network error for ACK
    }
  }


  public async sendTextMessage(recipientUid: string, text: string): Promise<StoredMessage | null> {
    return this.sendMessage(recipientUid, text, undefined);
  }

  public async sendAudioMessage(recipientUid: string, audioUri: string): Promise<StoredMessage | null> {
    // In a real app, 'text' might be an empty string or a placeholder like "[Voice Message]"
    // if you want a text representation for the audio. For now, we'll pass an empty string for text.
    return this.sendMessage(recipientUid, "[Voice Message]", audioUri);
  }


  private async sendMessage(recipientUid: string, textContent: string, audioUri?: string): Promise<StoredMessage | null> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.emit('error', new Error('WebSocket not connected. Message queued or failed.'));
      // TODO: Implement offline queuing for sending messages. For now, we'll save as 'failed' or 'pending_sync'
      // For now, just indicate an error and save locally as 'sending' but it might fail.
      console.warn("MessageService: WebSocket not connected. Attempting to save message locally as 'sending'.");
      // Fall through to save locally if needed, but it won't be sent.
    }
    if (!this.currentUid) {
        console.error("MessageService: Cannot send message, current user UID not set.");
        return null;
    }

    const clientMessageId = generateClientMessageId();
    const clientTimestamp = new Date().toISOString();

    // 1. Optimistically save to local storage with 'sending' status
    const optimisticMessage: StoredMessage = {
      clientMessageId,
      chatId: recipientUid,
      senderUid: this.currentUid,
      recipientUid,
      content: audioUri || textContent, // Store local audio URI or text
      contentType: audioUri ? 'audio' : 'text',
      timestamp: clientTimestamp,
      isSender: true,
      status: 'sending',
    };
    await chatStorage.saveMessages(recipientUid, [optimisticMessage]);
    this.emit('message', optimisticMessage); // Emit for optimistic UI update

    // 2. Prepare for encryption
    const ownPublicKeyBase64 = await getOwnPublicKey();
    const ownPrivateKeyBase64 = await getOwnPrivateKey();

    if (!ownPublicKeyBase64 || !ownPrivateKeyBase64) {
      console.error('MessageService: Missing own keys for sending.');
      await chatStorage.updateMessageStatus(recipientUid, clientMessageId, 'failed');
      this.emit('messageStatusUpdate', { clientMessageId, chatId: recipientUid, status: 'failed' });
      return {...optimisticMessage, status: 'failed'};
    }

    try {
      const ownPrivateKey = decodeBase64(ownPrivateKeyBase64);

      let payloadText = textContent;
      if (audioUri) {
        const audioBase64 = await RNFS.readFile(audioUri, 'base64');
        payloadText = audioBase64; // Encrypt the base64 audio data
      }

      const recipientPublicKeyBase64 = await this.lookupRecipientPublicKey(recipientUid); // Ensure this is just key lookup
      if (!recipientPublicKeyBase64) {
          throw new Error(`Recipient ${recipientUid} public key not found.`);
      }
      const recipientPublicKey = decodeBase64(recipientPublicKeyBase64);

      const { nonce, ciphertext, senderPublicKey: derivedSenderPublicKey } = encryptMessage(
        payloadText,
        recipientPublicKey,
        ownPrivateKey,
      );

      const payloadToServer: EncryptedPayloadToServer = {
        type: 'message',
        clientMessageId,
        senderUid: this.currentUid,
        recipientUid,
        nonce: Buffer.from(nonce).toString('base64'),
        ciphertext: Buffer.from(ciphertext).toString('base64'),
        senderPublicKey: encodeBase64(derivedSenderPublicKey),
        isAudio: !!audioUri,
        timestamp: clientTimestamp,
      };

      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify(payloadToServer));
        console.log(`MessageService: Sent message ${clientMessageId} to ${recipientUid} via WebSocket.`);
        // Update status to 'sent_to_server' - server will confirm actual storage/relay
        // The server doesn't explicitly ACK individual message sends in this model,
        // but successful send implies it reached the server.
        await chatStorage.updateMessageStatus(recipientUid, clientMessageId, 'sent_to_server');
        this.emit('messageStatusUpdate', { clientMessageId, chatId: recipientUid, status: 'sent_to_server' });
        return {...optimisticMessage, status: 'sent_to_server'};
      } else {
         // If WS was not open after all the async ops.
        console.warn("MessageService: WebSocket became unavailable before send. Message saved locally as 'sending'.");
        // Message remains 'sending', will be picked up if app implements send retry for 'sending' messages.
        this.emit('error', new Error('Message queued locally, connection unavailable.'));
        return optimisticMessage; // Return the message with 'sending' status
      }

    } catch (error) {
      console.error(`MessageService: Error sending message ${clientMessageId}:`, error);
      await chatStorage.updateMessageStatus(recipientUid, clientMessageId, 'failed');
      this.emit('messageStatusUpdate', { clientMessageId, chatId: recipientUid, status: 'failed' });
      this.emit('error', error instanceof Error ? error : new Error('Failed to send message.'));
      return {...optimisticMessage, status: 'failed'};
    }
  }

  private async lookupRecipientPublicKey(uid: string): Promise<string | null> {
    // This should ideally be cached from contact list or fetched once.
    try {
      const response = await fetch(`${API_BASE_URL}/users/${uid}/public-key`);
      if (!response.ok) {
        console.error(`Failed to lookup recipient public key for ${uid}: ${response.status}`);
        return null;
      }
      const data = await response.json();
      return data.publicKey; // Expects base64 string
    } catch (error) {
      console.error(`Error fetching public key for ${uid}:`, error);
      return null;
    }
  }
}

export default new MessageService();