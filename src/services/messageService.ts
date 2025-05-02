import RNFS from 'react-native-fs';
import {
  getSession,
  getPublicKey,
  getPrivateKey,
} from '../storage/secureStorage';
import {encryptMessage, decryptMessage} from '../utils/crypto';
import {decodeBase64, encodeBase64} from '../utils/helpers';
import {EventEmitter} from 'events';
import {Buffer} from 'buffer';

type EncryptedPayload = {
  type: 'message';
  senderUid: string;
  recipientUid: string;
  nonce: string;
  ciphertext: string;
  senderPublicKey: string;
  isAudio?: boolean;
};

class MessageService extends EventEmitter {
  private ws?: WebSocket;
  private uid?: string;

  public disconnect() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.close();
    }
  }

  async connect() {
    const session = await getSession();
    if (!session) throw new Error('Not logged in');
    this.uid = session.uid;

    this.ws = new WebSocket('ws://10.0.2.2:8080');
    this.ws.onopen = () => {
      this.ws!.send(JSON.stringify({type: 'register', uid: this.uid}));
    };

    this.ws.onmessage = async ({data}) => {
      const msg: EncryptedPayload = JSON.parse(data);
      if (msg.type !== 'message' || msg.recipientUid !== this.uid) return;

      const recipientSecretKeyBase64 = await getPrivateKey();
      if (!recipientSecretKeyBase64) throw new Error('Missing private key');

      const recipientSecretKey = decodeBase64(recipientSecretKeyBase64);
      const ciphertext = Buffer.from(msg.ciphertext, 'base64');
      const nonce = Buffer.from(msg.nonce, 'base64');
      const senderPublicKey = decodeBase64(msg.senderPublicKey); // ✅ FIXED

      const plaintext = await decryptMessage(
        ciphertext,
        nonce,
        senderPublicKey,
        recipientSecretKey,
      );

      if (msg.isAudio) {
        const audioBase64 = plaintext;
        const path = `${RNFS.CachesDirectoryPath}/${Date.now()}.mp4`;
        await RNFS.writeFile(path, audioBase64, 'base64');
        this.emit('message', {senderUid: msg.senderUid, audioUri: path});
      } else {
        this.emit('message', {senderUid: msg.senderUid, text: plaintext});
      }
    };
  }

  async send(recipientUid: string, text: string, audioUri?: string) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket not connected');
    }

    const session = await getSession();
    if (!session) throw new Error('Session not found');

    const senderUid = session.uid;
    const senderPublicKeyBase64 = await getPublicKey();
    const senderSecretKeyBase64 = await getPrivateKey();
    if (!senderPublicKeyBase64 || !senderSecretKeyBase64)
      throw new Error('Missing sender key(s)');

    const senderSecretKey = decodeBase64(senderSecretKeyBase64); // ✅ FIXED
    const senderPublicKey = decodeBase64(senderPublicKeyBase64); // ✅ FIXED

    let payloadText = text;
    let isAudio = false;

    if (audioUri) {
      const audioBase64 = await RNFS.readFile(audioUri, 'base64');
      payloadText = audioBase64;
      isAudio = true;
    }

    const recipientPublicKeyBase64 = await this.lookupRecipientKey(
      recipientUid,
    );
    const recipientPublicKey = decodeBase64(recipientPublicKeyBase64); // ✅ FIXED

    const {nonce, ciphertext} = encryptMessage(
      payloadText,
      recipientPublicKey,
      senderSecretKey,
    );

    const payload: EncryptedPayload = {
      type: 'message',
      senderUid,
      recipientUid,
      nonce: Buffer.from(nonce).toString('base64'),
      ciphertext: Buffer.from(ciphertext).toString('base64'),
      senderPublicKey: encodeBase64(senderPublicKey), // ✅ Send encoded again
      ...(isAudio ? {isAudio: true} : {}),
    };

    this.ws.send(JSON.stringify(payload));
  }

  private async lookupRecipientKey(uid: string): Promise<string> {
    const res = await fetch(`http://10.0.2.2:8080/users/${uid}`);
    if (!res.ok) throw new Error('User not found');
    const json = await res.json();
    return json.publicKey; // base64 string
  }
}

export default new MessageService();
