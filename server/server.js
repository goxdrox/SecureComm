// server/server.js

require('dotenv').config(); // Load environment variables from .env
const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const { MongoClient } = require('mongodb');
const WebSocket = require('ws');
const sendMagicLinkEmail = require('./utils/sendEmail');


const PORT = process.env.PORT || 8080;
const MONGO_URL = process.env.MONGO_URI;
const DB_NAME = process.env.DB_NAME || 'secureComm';

if (!MONGO_URL) {
  console.error('Missing MONGO_URI environment variable');
  process.exit(1);
}

const app = express();
app.use(cors());
app.use(express.json());

let db, usersColl, msgsColl;

// Initialize MongoDB
MongoClient.connect(MONGO_URL, { useUnifiedTopology: true })
  .then(client => {
    db = client.db(DB_NAME);
    usersColl = db.collection('users');
    msgsColl = db.collection('messages');
    console.log('Connected to MongoDB');
  })
  .catch(err => {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  });

// Helper to generate 9-digit social number as string
function generateSocialNumber() {
  return String(Math.floor(100000000 + Math.random() * 900000000));
}

// 1) Request magic link
app.post('/auth/request-link', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email required' });

  const token = crypto.randomBytes(16).toString('hex');
  await db.collection('magicTokens').updateOne(
    { token },
    { $set: { email, createdAt: new Date() } },
    { upsert: true }
  );

  try {
    await sendMagicLinkEmail(email, token);
    console.log(`Magic link sent to ${email}`);
  } catch (err) {
    console.error('Failed to send email:', err);
    return res.status(500).json({ error: 'Failed to send email' });
  }
  
  res.json({ success: true });
});

// 2) Verify magic token
app.post('/auth/verify-token', async (req, res) => {
  const { token } = req.body;
  const tokenDoc = await db.collection('magicTokens').findOne({ token });
  if (!tokenDoc) return res.status(400).json({ error: 'Invalid token' });

  const { email } = tokenDoc;
  await db.collection('magicTokens').deleteOne({ token });

  let user = await usersColl.findOne({ email });
  if (!user) {
    const uid = crypto.randomBytes(4).toString('hex');
    const socialNumber = generateSocialNumber(); // now 9 digits
    user = { email, publicKey: null, uid, socialNumber };
    await usersColl.insertOne(user);
  }

  res.json({ uid: user.uid, publicKey: user.publicKey });
});

// 3) Upload public key
app.post('/users/upload-key', async (req, res) => {
  const { uid, publicKey } = req.body;
  if (!uid || !publicKey) return res.status(400).json({ error: 'uid & publicKey required' });

  const result = await usersColl.updateOne({ uid }, { $set: { publicKey } });
  if (result.matchedCount === 0) return res.status(404).json({ error: 'User not found' });

  res.json({ success: true });
});

// 4) Get public key by UID
app.get('/users/:uid', async (req, res) => {
  const user = await usersColl.findOne({ uid: req.params.uid });
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ publicKey: user.publicKey });
});

// 5) Lookup by social number
app.get('/users/by-social/:socialNumber', async (req, res) => {
  const user = await usersColl.findOne({ socialNumber: req.params.socialNumber });
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ uid: user.uid, email: user.email, publicKey: user.publicKey });
});

// 6) Fetch past messages by UID
app.get('/messages/:uid', async (req, res) => {
  const msgs = await msgsColl.find({ recipientUid: req.params.uid }).sort({ timestamp: 1 }).toArray();
  res.json(msgs);
});

// 7) WebSocket setup
const server = app.listen(PORT, () => console.log(`Server listening on http://localhost:${PORT}`));
const wss = new WebSocket.Server({ server });

wss.on('connection', ws => {
  ws.on('message', async data => {
    const msg = JSON.parse(data);
    if (msg.type === 'register-ws') {
      ws.uid = msg.uid;
      return;
    }
    if (msg.type === 'message') {
      await msgsColl.insertOne({ ...msg, timestamp: new Date() });
      wss.clients.forEach(client => {
        if (client !== ws && client.uid === msg.recipientUid && client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify(msg));
        }
      });
    }
  });
});
