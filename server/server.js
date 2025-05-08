require('dotenv').config();
const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const {MongoClient, ObjectId} = require('mongodb'); // ObjectId might be useful
const WebSocket = require('ws');
const rateLimit = require('express-rate-limit');
const sendMagicLinkEmail = require('./utils/sendEmail');

const PORT = process.env.PORT || 8080;
const MONGO_URL = process.env.MONGO_URI;
const DB_NAME = process.env.DB_NAME || 'secureComm';
const MESSAGE_TTL_SECONDS = process.env.MESSAGE_TTL_SECONDS || 7 * 24 * 60 * 60; // 7 days default

if (!MONGO_URL) {
  console.error('Missing MONGO_URI environment variable');
  process.exit(1);
}

const app = express();
app.use(cors());
app.use(express.json());

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  message: {error: 'Too many requests, try again later.'},
});
app.use('/auth/request-link', authLimiter);

let db, usersColl, msgsColl;
const authenticatedWsClients = new Map(); // uid -> Set<WebSocket>

MongoClient.connect(MONGO_URL, {useUnifiedTopology: true})
  .then(async client => {
    db = client.db(DB_NAME);
    usersColl = db.collection('users');
    await usersColl.createIndex({uid: 1}, {unique: true});
    await usersColl.createIndex({socialNumber: 1}, {unique: true});
    await usersColl.createIndex({sessionToken: 1}, {sparse: true});

    msgsColl = db.collection('messages');
    // Index for querying messages for a recipient
    await msgsColl.createIndex({recipientUid: 1, status: 1});
    // Index for clientMessageId to ensure we don't process duplicates from sender
    await msgsColl.createIndex(
      {senderUid: 1, clientMessageId: 1},
      {unique: true, sparse: true},
    );

    // CORRECTED TTL index for messages
    // TTL is applied to 'serverTimestamp', but only for documents matching the partialFilterExpression.
    await msgsColl.createIndex(
      {serverTimestamp: 1}, // <-- Key is NOW a SINGLE field
      {
        expireAfterSeconds: MESSAGE_TTL_SECONDS,
        partialFilterExpression: {status: 'pending_delivery'}, // Only expire undelivered messages
        name: 'message_ttl_pending_delivery', // Optional: giving the index a custom name
      },
    );

    const magicTokens = db.collection('magicTokens');
    await magicTokens.createIndex({createdAt: 1}, {expireAfterSeconds: 900});

    console.log(
      `Connected to MongoDB. Messages will TTL after ${MESSAGE_TTL_SECONDS} seconds if undelivered.`,
    );
  })
  .catch(err => {
    console.error('MongoDB connection error:', err);
    process.exit(1); // Ensure process exits on critical error
  });

// --- Auth Endpoints (largely unchanged, ensure publicKey storage) ---
function generateSocialNumber() {
  return String(Math.floor(100000000 + Math.random() * 900000000)); // 9 digits
}

app.post('/auth/request-link', async (req, res) => {
  const {email} = req.body;
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({error: 'Valid email required'});
  }
  const token = String(Math.floor(100000 + Math.random() * 900000));
  await db
    .collection('magicTokens')
    .updateOne({email}, {$set: {token, createdAt: new Date()}}, {upsert: true});
  try {
    await sendMagicLinkEmail(email, token);
    res.json({success: true});
  } catch (err) {
    console.error('Failed to send email:', err);
    res.status(500).json({error: 'Failed to send email'});
  }
});

app.post('/auth/verify-token', async (req, res) => {
  const {email, code, publicKey} = req.body; // publicKey is base64 string from client
  if (!email || !code || !publicKey || typeof publicKey !== 'string') {
    return res
      .status(400)
      .json({
        error: 'Missing or invalid required fields (email, code, publicKey)',
      });
  }

  const tokenDoc = await db
    .collection('magicTokens')
    .findOne({email, token: code});
  if (!tokenDoc)
    return res.status(400).json({error: 'Invalid or expired token'});
  await db.collection('magicTokens').deleteOne({email, token: code});

  let user = await usersColl.findOne({email});
  if (!user) {
    let uid, socialNumber;
    do {
      uid = crypto.randomBytes(4).toString('hex');
    } while (await usersColl.findOne({uid}));
    do {
      socialNumber = generateSocialNumber();
    } while (await usersColl.findOne({socialNumber}));
    user = {
      email,
      uid,
      socialNumber,
      publicKey, // Store base64 public key
      logoutTimeout: 48,
      lastActive: new Date(),
      contacts: [],
    };
    await usersColl.insertOne(user);
  } else {
    await usersColl.updateOne(
      {email},
      {$set: {publicKey, lastActive: new Date()}},
    ); // Update public key on login
    user = await usersColl.findOne({email}); // Fetch updated user
  }

  const sessionToken = crypto.randomBytes(32).toString('hex'); // Longer session token
  await usersColl.updateOne(
    {uid: user.uid},
    {$set: {sessionToken, lastActive: new Date()}},
  );
  res.json({
    uid: user.uid,
    socialNumber: user.socialNumber,
    token: sessionToken,
    publicKey: user.publicKey,
  });
});

app.post('/auth/validate-token', async (req, res) => {
  const {uid, token} = req.body;
  if (!uid || !token)
    return res.status(400).json({error: 'Missing uid or token'});
  const user = await usersColl.findOne({uid, sessionToken: token});
  if (!user) return res.status(401).json({error: 'Invalid session'});
  const hoursSinceLastActive = (Date.now() - new Date(user.lastActive)) / 36e5;
  if (user.logoutTimeout > 0 && hoursSinceLastActive > user.logoutTimeout) {
    // Check if logoutTimeout is enabled
    return res.status(401).json({error: 'Session expired due to inactivity'});
  }
  await usersColl.updateOne({uid}, {$set: {lastActive: new Date()}});
  res.json({
    success: true,
    uid: user.uid,
    publicKey: user.publicKey,
    socialNumber: user.socialNumber,
  });
});

// --- User Endpoints (largely unchanged) ---
app.post('/users/set-logout-timeout', async (req, res) => {
  const {uid, token, timeout} = req.body;
  if (!uid || !token || ![0, 24, 48, 7 * 24].includes(timeout)) {
    // Added 7 days, 0 means never timeout
    return res.status(400).json({error: 'Invalid request'});
  }
  const user = await usersColl.findOne({uid, sessionToken: token});
  if (!user) return res.status(401).json({error: 'Unauthorized'});
  await usersColl.updateOne({uid}, {$set: {logoutTimeout: timeout}});
  res.json({success: true});
});

app.post('/users/upload-key', async (req, res) => {
  // Expects session token for auth
  const {uid, token, publicKey} = req.body;
  if (!uid || !token || typeof publicKey !== 'string') {
    return res
      .status(400)
      .json({error: 'uid, token, and valid publicKey required'});
  }
  const user = await usersColl.findOne({uid, sessionToken: token});
  if (!user) return res.status(401).json({error: 'Unauthorized'});

  const result = await usersColl.updateOne({uid}, {$set: {publicKey}});
  if (result.matchedCount === 0)
    return res
      .status(404)
      .json({error: 'User not found (should not happen if token valid)'});
  res.json({success: true});
});

app.get('/users/:uid/public-key', async (req, res) => {
  // Changed route for clarity
  const user = await usersColl.findOne({uid: req.params.uid});
  if (!user || !user.publicKey)
    return res.status(404).json({error: 'User or public key not found'});
  res.json({publicKey: user.publicKey}); // publicKey is base64
});

app.get('/users/by-social/:socialNumber', async (req, res) => {
  const user = await usersColl.findOne({socialNumber: req.params.socialNumber});
  if (!user) return res.status(404).json({error: 'User not found'});
  res.json({
    uid: user.uid,
    socialNumber: user.socialNumber,
    publicKey: user.publicKey,
    name: user.name,
  });
});

app.post('/users/:uid/contacts', async (req, res) => {
  console.log(`--- Server Received: POST /users/${req.params.uid}/contacts ---`);
  console.log("Received Body:", JSON.stringify(req.body, null, 2));
  console.log("--------------------------------------------------------");

  const currentUserIdFromParams = req.params.uid;
  // 1. Correctly destructure sessionToken and the contactToAdd OBJECT
  //    Rename contactToAdd from body to avoid confusion with the DB lookup result later
  const { sessionToken, contactToAdd: contactDetailsFromClient } = req.body;

  // 2. Validate the destructured variables
  if (!sessionToken || !contactDetailsFromClient || !contactDetailsFromClient.uid) {
    // Log the actual values received to understand why validation failed
    console.error("Validation Failed! sessionToken:", sessionToken, "contactDetailsFromClient:", contactDetailsFromClient);
    return res.status(400).json({ error: "Missing sessionToken or complete contactToAdd details (at least contact UID)" });
  }

  // 3. Authenticate the current user making the request
  let currentUser; // Declare currentUser outside try block if needed in catch/finally
  try {
      currentUser = await usersColl.findOne({
        uid: currentUserIdFromParams,
        sessionToken: sessionToken, // Use the destructured sessionToken
      });
  } catch (authError) {
      console.error("Error during current user authentication:", authError);
      return res.status(500).json({ error: "Server error during authentication." });
  }

  if (!currentUser) {
    return res.status(401).json({ error: 'Unauthorized or current user not found' });
  }

  // 4. Find the user to add as a contact using the UID from the client data
  let contactUserToAdd; // Declare outside try block
  try {
      contactUserToAdd = await usersColl.findOne({ uid: contactDetailsFromClient.uid });
  } catch (dbError) {
      console.error("Error finding contact user in DB:", dbError);
      return res.status(500).json({ error: "Server error finding contact user." });
  }

  if (!contactUserToAdd) {
    // Use the UID from the request in the error message
    return res.status(404).json({ error: `User to add as contact (UID: ${contactDetailsFromClient.uid}) not found.` });
  }

  // Ensure currentUser.contacts exists (initialize if needed)
  if (!currentUser.contacts) {
    currentUser.contacts = [];
  }

  // 5. Check if contact already exists in the current user's list
  const alreadyExists = currentUser.contacts.some(contact => contact.uid === contactUserToAdd.uid);
  if (alreadyExists) {
    return res.status(409).json({ error: 'User already exists in your contacts.' });
  }

  // 6. Create the new contact entry using data from the FOUND user (contactUserToAdd)
  //    This ensures we use the latest data from the database.
  const newContactEntry = {
    uid: contactUserToAdd.uid,
    name: contactUserToAdd.name || null, // Use name from DB
    socialNumber: contactUserToAdd.socialNumber, // Use socialNumber from DB
    publicKey: contactUserToAdd.publicKey, // Use publicKey from DB
    addedAt: new Date(),
  };

  // 7. Add the new contact to the current user's contact list
  try {
    const updateResult = await usersColl.updateOne(
      { uid: currentUserIdFromParams },
      { $push: { contacts: newContactEntry } }
    );

    if (updateResult.modifiedCount === 1) {
        res.status(201).json({ message: 'Contact added successfully', contact: newContactEntry });
    } else {
        // This might happen if the user document was somehow modified between the find and update
        console.error(`Failed to add contact for user ${currentUserIdFromParams}. Update modifiedCount: ${updateResult.modifiedCount}`);
        res.status(500).json({ error: "Failed to save contact update." });
    }
  } catch (dbError) {
    console.error(`Error updating contacts for user ${currentUserIdFromParams}:`, dbError);
    res.status(500).json({ error: "Failed to save contact due to a database issue." });
  }
});
;

app.get('/users/:uid/contacts', async (req, res) => {
  // Requires session token in query or header for auth
  const {uid} = req.params;
  const token = req.headers['x-session-token'] || req.query.token;

  if (!token) return res.status(401).json({error: 'Session token required'});

  const user = await usersColl.findOne({uid, sessionToken: token});
  if (!user)
    return res.status(401).json({error: 'Unauthorized or user not found'});
  res.json(user.contacts || []);
});

// --- Messaging Endpoints (Store-and-Forward) ---
// Endpoint for clients to fetch their undelivered messages
app.get('/messages/offline', async (req, res) => {
  const token = req.headers['x-session-token'] || req.query.token;
  const clientUid = req.query.uid;

  if (!token || !clientUid)
    return res.status(400).json({error: 'Missing uid or token'});

  const user = await usersColl.findOne({uid: clientUid, sessionToken: token});
  if (!user) return res.status(401).json({error: 'Unauthorized'});

  try {
    const messages = await msgsColl
      .find({recipientUid: clientUid, status: 'pending_delivery'})
      .sort({serverTimestamp: 1})
      .toArray();
    res.json(messages); // These are the encrypted payloads as stored
  } catch (error) {
    console.error('Error fetching offline messages:', error);
    res.status(500).json({error: 'Failed to fetch messages'});
  }
});

// Endpoint for clients to acknowledge message receipt
app.post('/messages/ack', async (req, res) => {
  const {uid, token, messageIds} = req.body; // messageIds is an array of clientMessageId strings

  if (!uid || !token || !Array.isArray(messageIds) || messageIds.length === 0) {
    return res
      .status(400)
      .json({error: 'Missing uid, token, or messageIds array'});
  }

  const user = await usersColl.findOne({uid, sessionToken: token});
  if (!user) return res.status(401).json({error: 'Unauthorized'});

  try {
    // Option 1: Mark as delivered (if you want to keep them for a bit for other devices)
    // const result = await msgsColl.updateMany(
    //   { recipientUid: uid, clientMessageId: { $in: messageIds }, status: 'pending_delivery' },
    //   { $set: { status: 'delivered_to_client', deliveredAt: new Date() } }
    // );
    // res.json({ success: true, acknowledged: result.modifiedCount });

    // Option 2: Delete immediately (simpler for "don't store once delivered")
    const result = await msgsColl.deleteMany({
      recipientUid: uid,
      clientMessageId: {$in: messageIds},
    });
    console.log(`ACK: Deleted ${result.deletedCount} messages for user ${uid}`);
    res.json({success: true, acknowledgedCount: result.deletedCount});
  } catch (error) {
    console.error('Error acknowledging messages:', error);
    res.status(500).json({error: 'Failed to acknowledge messages'});
  }
});

// --- WebSocket Setup ---
const httpServer = app.listen(PORT, () =>
  console.log(`Server listening on http://localhost:${PORT}`),
);
const wss = new WebSocket.Server({server: httpServer});

wss.on('connection', (ws, req) => {
  // For securing WebSocket: use a token in the connection URL or an initial message.
  // Here, we'll expect an initial 'register' message with a valid session token.
  ws.isAlive = true;
  ws.on('pong', () => {
    ws.isAlive = true;
  });

  ws.on('message', async data => {
    let msg;
    try {
      msg = JSON.parse(data.toString());
    } catch (e) {
      console.error('WS: Failed to parse message:', data.toString(), e);
      ws.send(
        JSON.stringify({type: 'error', message: 'Invalid JSON payload.'}),
      );
      return;
    }

    if (msg.type === 'register' && msg.uid && msg.token) {
      const user = await usersColl.findOne({
        uid: msg.uid,
        sessionToken: msg.token,
      });
      if (user) {
        ws.uid = msg.uid; // Associate UID with this WebSocket connection
        if (!authenticatedWsClients.has(msg.uid)) {
          authenticatedWsClients.set(msg.uid, new Set());
        }
        authenticatedWsClients.get(msg.uid).add(ws);
        console.log(`WS: Client ${msg.uid} registered and authenticated.`);
        ws.send(
          JSON.stringify({
            type: 'registered',
            message: 'WebSocket connection registered.',
          }),
        );
      } else {
        console.log(
          `WS: Failed registration for UID ${msg.uid} - invalid token.`,
        );
        ws.send(
          JSON.stringify({type: 'error', message: 'Authentication failed.'}),
        );
        ws.terminate();
      }
      return;
    }

    // All other messages require ws.uid to be set (i.e., registered)
    if (!ws.uid) {
      console.log('WS: Message from unregistered client.');
      ws.send(
        JSON.stringify({
          type: 'error',
          message: 'Client not registered. Send register message first.',
        }),
      );
      ws.terminate(); // Or just ignore
      return;
    }

    if (msg.type === 'message') {
      // Validate incoming message structure from an authenticated sender (ws.uid)
      if (
        !msg.recipientUid ||
        !msg.ciphertext ||
        !msg.nonce ||
        !msg.senderPublicKey ||
        !msg.clientMessageId ||
        !msg.timestamp
      ) {
        ws.send(
          JSON.stringify({
            type: 'error',
            message: 'Malformed message payload.',
          }),
        );
        return;
      }
      if (msg.senderUid !== ws.uid) {
        ws.send(
          JSON.stringify({type: 'error', message: 'Sender UID mismatch.'}),
        );
        return;
      }

      const messageToStore = {
        clientMessageId: msg.clientMessageId, // ID generated by the sending client
        senderUid: ws.uid, // Authenticated sender
        recipientUid: msg.recipientUid,
        ciphertext: msg.ciphertext, // Encrypted content
        nonce: msg.nonce, // Nonce for decryption
        senderPublicKey: msg.senderPublicKey, // Sender's public key (base64) for recipient
        isAudio: msg.isAudio || false,
        originalTimestamp: msg.timestamp, // Timestamp from client
        serverTimestamp: new Date(), // Timestamp when server received/stored it
        status: 'pending_delivery', // Initial status
      };

      try {
        await msgsColl.insertOne(messageToStore);
        console.log(
          `WS: Stored message from ${ws.uid} to ${msg.recipientUid} (ID: ${msg.clientMessageId})`,
        );

        // Attempt real-time delivery if recipient is connected
        const recipientSockets = authenticatedWsClients.get(msg.recipientUid);
        if (recipientSockets) {
          recipientSockets.forEach(recipientWs => {
            if (recipientWs.readyState === WebSocket.OPEN) {
              // Send the full stored message object; client decides what to do
              recipientWs.send(
                JSON.stringify({type: 'message', ...messageToStore}),
              );
              console.log(
                `WS: Relayed message ${msg.clientMessageId} to ${msg.recipientUid} in real-time.`,
              );
            }
          });
        }
      } catch (error) {
        // Handle potential unique constraint violation if client retries sending same clientMessageId
        if (error.code === 11000) {
          // MongoDB duplicate key error
          console.warn(
            `WS: Duplicate clientMessageId ${msg.clientMessageId} from sender ${ws.uid}. Ignoring.`,
          );
          ws.send(
            JSON.stringify({
              type: 'error',
              message:
                'Duplicate message ID. Message likely already processed.',
            }),
          );
        } else {
          console.error('WS: Error storing or relaying message:', error);
          ws.send(
            JSON.stringify({
              type: 'error',
              message: 'Server error processing message.',
            }),
          );
        }
      }
    }
  });

  ws.on('close', () => {
    if (ws.uid) {
      const userSockets = authenticatedWsClients.get(ws.uid);
      if (userSockets) {
        userSockets.delete(ws);
        if (userSockets.size === 0) {
          authenticatedWsClients.delete(ws.uid);
        }
      }
      console.log(`WS: Client ${ws.uid} disconnected.`);
    } else {
      console.log('WS: Unauthenticated client disconnected.');
    }
  });

  ws.on('error', error =>
    console.error(`WS: Error for client ${ws.uid || 'unknown'}:`, error),
  );
});

// Keep-alive for WebSockets
const interval = setInterval(function ping() {
  wss.clients.forEach(function each(ws) {
    if (ws.isAlive === false) return ws.terminate();
    ws.isAlive = false;
    ws.ping(() => {});
  });
}, 30000);

wss.on('close', function close() {
  clearInterval(interval);
});
