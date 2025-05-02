// server/server.js
const express    = require('express');
const cors       = require('cors');
const { MongoClient } = require('mongodb');
const WebSocket  = require('ws');

const PORT      = 8080;
const MONGO_URL = 'mongodb://localhost:27017';
const DB_NAME   = 'secureComm';

const app = express();
app.use(cors());
app.use(express.json());

let db, usersColl, msgsColl;

// Initialize MongoDB
MongoClient.connect(MONGO_URL, { useUnifiedTopology: true })
  .then(client => {
    db = client.db(DB_NAME);
    usersColl = db.collection('users');
    msgsColl  = db.collection('messages');
    console.log('Connected to MongoDB');
  })
  .catch(err => { console.error(err); process.exit(1); });

// -- HTTP API --

// 1) Register or update a user’s public key
app.post('/register', async (req, res) => {
  const { uid, publicKey } = req.body;
  if (!uid || !publicKey) {
    return res.status(400).json({ error: 'uid & publicKey required' });
  }
  await usersColl.updateOne(
    { uid },
    { $set: { publicKey } },
    { upsert: true }
  );
  res.json({ success: true });
});

// 2) Lookup a user’s public key
app.get('/users/:uid', async (req, res) => {
  const user = await usersColl.findOne({ uid: req.params.uid });
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ publicKey: user.publicKey });
});

// 3) Fetch past messages for a user
app.get('/messages/:uid', async (req, res) => {
  const msgs = await msgsColl
    .find({ recipientUid: req.params.uid })
    .sort({ timestamp: 1 })
    .toArray();
  res.json(msgs);
});

// -- WebSocket Upgrade --
const server = app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
const wss = new WebSocket.Server({ noServer: true });
server.on('upgrade', (req, sock, head) => {
  wss.handleUpgrade(req, sock, head, ws => wss.emit('connection', ws, req));
});

// -- WebSocket Logic (unchanged except save msg to msgsColl) --
wss.on('connection', ws => {
  ws.on('message', async data => {
    const msg = JSON.parse(data);
    if (msg.type === 'register-ws') {
      // map uid->ws for real-time routing
      ws.uid = msg.uid; // attach to socket
      return;
    }
    if (msg.type === 'message') {
      await msgsColl.insertOne({ ...msg, timestamp: new Date() });
      const recipient = [...wss.clients].find(c => c.uid === msg.recipientUid);
      if (recipient && recipient.readyState === WebSocket.OPEN) {
        recipient.send(JSON.stringify(msg));
      }
    }
  });
  ws.on('close', () => { /* cleanup if needed */ });
});
