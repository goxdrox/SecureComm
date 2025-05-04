require('dotenv').config(); // Load environment variables from .env
const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const {MongoClient} = require('mongodb');
const WebSocket = require('ws');
const rateLimit = require('express-rate-limit');
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

// Rate limiter for auth link requests
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  message: {error: 'Too many requests, try again later.'},
});
app.use('/auth/request-link', authLimiter);

let db, usersColl, msgsColl;

// Connect to MongoDB
MongoClient.connect(MONGO_URL, {useUnifiedTopology: true})
  .then(async client => {
    db = client.db(DB_NAME);
    usersColl = db.collection('users');
    await usersColl.createIndex({uid: 1}, {unique: true});
    await usersColl.createIndex({socialNumber: 1}, {unique: true});
    msgsColl = db.collection('messages');

    const magicTokens = db.collection('magicTokens');
    // Set TTL index if not already set
    await magicTokens.createIndex({createdAt: 1}, {expireAfterSeconds: 900}); // 15 mins

    console.log('Connected to MongoDB');
  })
  .catch(err => {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  });

function generateSocialNumber() {
  return String(Math.floor(100000000 + Math.random() * 900000000)); // 9 digits
}

// 1) Request magic link
app.post('/auth/request-link', async (req, res) => {
  const {email} = req.body;
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({error: 'Valid email required'});
  }

  const token = String(Math.floor(100000 + Math.random() * 900000)); // 6-digit code
  await db
    .collection('magicTokens')
    .updateOne({email}, {$set: {token, createdAt: new Date()}}, {upsert: true});

  try {
    await sendMagicLinkEmail(email, token); // Send magic link email with token
  } catch (err) {
    console.error('Failed to send email:', err);
    return res.status(500).json({error: 'Failed to send email'});
  }

  res.json({success: true});
});

// 2) Verify magic token
app.post('/auth/verify-token', async (req, res) => {
  const {email, code, publicKey} = req.body;
  if (!email || !code || !publicKey) {
    return res.status(400).json({error: 'Missing required fields'});
  }

  const tokenDoc = await db
    .collection('magicTokens')
    .findOne({email, token: code});
  if (!tokenDoc)
    return res.status(400).json({error: 'Invalid or expired token'});

  // Clean up used token
  await db.collection('magicTokens').deleteOne({email, token: code});

  let user = await usersColl.findOne({email});
  if (!user) {
    let uid, socialNumber;

    // Ensure UID is unique
    do {
      uid = crypto.randomBytes(4).toString('hex');
    } while (await usersColl.findOne({uid}));

    // Ensure social number is unique
    do {
      socialNumber = generateSocialNumber();
    } while (await usersColl.findOne({socialNumber}));

    user = {email, uid, socialNumber, publicKey};
    await usersColl.insertOne(user);
  } else {
    // Update existing user with latest key
    await usersColl.updateOne({email}, {$set: {publicKey}});
  }

  res.json({
    uid: user.uid,
    socialNumber: user.socialNumber,
    token: crypto.randomBytes(16).toString('hex'),
  });
});

// 3) Upload public key
app.post('/users/upload-key', async (req, res) => {
  const {uid, publicKey} = req.body;
  if (!uid || typeof publicKey !== 'string') {
    return res.status(400).json({error: 'uid and valid publicKey required'});
  }

  const result = await usersColl.updateOne({uid}, {$set: {publicKey}});
  if (result.matchedCount === 0)
    return res.status(404).json({error: 'User not found'});

  res.json({success: true});
});

// 4) Get public key by UID
app.get('/users/:uid', async (req, res) => {
  const user = await usersColl.findOne({uid: req.params.uid});
  if (!user) return res.status(404).json({error: 'User not found'});
  res.json({publicKey: user.publicKey});
});

// 5) Lookup by social number
app.get('/users/by-social/:socialNumber', async (req, res) => {
  const user = await usersColl.findOne({socialNumber: req.params.socialNumber});
  if (!user) return res.status(404).json({error: 'User not found'});
  res.json({uid: user.uid, email: user.email, publicKey: user.publicKey});
});

// 6) Fetch past messages by UID
app.get('/messages/:uid', async (req, res) => {
  const msgs = await msgsColl
    .find({recipientUid: req.params.uid})
    .sort({timestamp: 1})
    .toArray();
  res.json(msgs);
});

// 7) WebSocket setup
const server = app.listen(PORT, () =>
  console.log(`Server listening on http://localhost:${PORT}`),
);
const wss = new WebSocket.Server({server});

wss.on('connection', ws => {
  ws.on('message', async data => {
    const msg = JSON.parse(data);
    if (msg.type === 'register-ws') {
      ws.uid = msg.uid;
      return;
    }
    if (msg.type === 'message') {
      await msgsColl.insertOne({...msg, timestamp: new Date()});
      wss.clients.forEach(client => {
        if (
          client !== ws &&
          client.uid === msg.recipientUid &&
          client.readyState === WebSocket.OPEN
        ) {
          client.send(JSON.stringify(msg));
        }
      });
    }
  });
});
