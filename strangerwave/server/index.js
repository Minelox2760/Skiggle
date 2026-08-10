/**
 * StrangerWave — Real-time Signaling Server
 * Node.js + Express + Socket.io
 *
 * Handles:
 *  - Text + video mode matchmaking
 *  - WebRTC signaling (offer/answer/ICE)
 *  - Interest-based matching
 *  - Room lifecycle (skip, disconnect)
 */

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
  pingTimeout: 20000,
  pingInterval: 10000,
});

// ─── Static files ────────────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, '../public')));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// ─── State ────────────────────────────────────────────────────────────────────
// waitingQueues[mode] = [socket, socket, ...]  (mode: 'text' | 'video')
const waitingQueues = { text: [], video: [] };

// rooms[roomId] = { users: [socketId, socketId], mode, createdAt }
const rooms = {};

// users[socketId] = { roomId, mode, interests }
const users = {};

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Count of all connected sockets */
function onlineCount() {
  return io.engine.clientsCount;
}

/** Broadcast online count to everyone */
function broadcastCount() {
  io.emit('online_count', onlineCount());
}

/** Find best match from queue based on shared interests */
function findMatch(socket, queue) {
  const myInterests = users[socket.id]?.interests || [];

  if (myInterests.length === 0) {
    // No interests — just take first in queue
    return queue.length > 0 ? 0 : -1;
  }

  let bestIndex = -1;
  let bestScore = -1;

  for (let i = 0; i < queue.length; i++) {
    const other = queue[i];
    const theirInterests = users[other.id]?.interests || [];
    const shared = myInterests.filter(x => theirInterests.includes(x)).length;
    if (shared > bestScore) {
      bestScore = shared;
      bestIndex = i;
    }
  }

  return bestIndex >= 0 ? bestIndex : 0;
}

/** Pair two sockets into a room */
function pairUsers(socketA, socketB, mode) {
  const roomId = uuidv4();
  rooms[roomId] = { users: [socketA.id, socketB.id], mode, createdAt: Date.now() };
  users[socketA.id].roomId = roomId;
  users[socketB.id].roomId = roomId;

  socketA.join(roomId);
  socketB.join(roomId);

  // Tell both who's initiator (initiator sends WebRTC offer)
  socketA.emit('matched', { roomId, initiator: true, mode });
  socketB.emit('matched', { roomId, initiator: false, mode });

  console.log(`[MATCH] Room ${roomId.slice(0,8)} — ${socketA.id.slice(0,6)} ↔ ${socketB.id.slice(0,6)} (${mode})`);
}

/** Remove socket from whichever queue it's in */
function removeFromQueue(socketId) {
  for (const mode of ['text', 'video']) {
    const idx = waitingQueues[mode].findIndex(s => s.id === socketId);
    if (idx !== -1) {
      waitingQueues[mode].splice(idx, 1);
      return;
    }
  }
}

/** Clean up a room when someone leaves/skips */
function leaveRoom(socket) {
  const user = users[socket.id];
  if (!user?.roomId) return;

  const roomId = user.roomId;
  const room = rooms[roomId];
  if (!room) return;

  // Notify the other person
  socket.to(roomId).emit('stranger_left');

  // Remove both from room
  room.users.forEach(uid => {
    if (users[uid]) users[uid].roomId = null;
  });

  delete rooms[roomId];
  socket.leave(roomId);

  console.log(`[LEAVE] Room ${roomId.slice(0,8)} closed`);
}

// ─── Socket.io Events ────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log(`[CONNECT] ${socket.id.slice(0,8)} — total: ${onlineCount()}`);

  users[socket.id] = { roomId: null, mode: null, interests: [] };
  broadcastCount();

  // ── Find a stranger ──────────────────────────────────────────────────────
  socket.on('find_stranger', ({ mode, interests }) => {
    removeFromQueue(socket.id);
    leaveRoom(socket);

    users[socket.id].mode = mode;
    users[socket.id].interests = interests || [];
    users[socket.id].roomId = null;

    const queue = waitingQueues[mode];

    // Remove self if somehow already in queue
    const selfIdx = queue.findIndex(s => s.id === socket.id);
    if (selfIdx !== -1) queue.splice(selfIdx, 1);

    if (queue.length > 0) {
      const matchIdx = findMatch(socket, queue);
      const [partner] = queue.splice(matchIdx, 1);
      pairUsers(socket, partner, mode);
    } else {
      queue.push(socket);
      socket.emit('searching');
      console.log(`[QUEUE] ${socket.id.slice(0,8)} waiting for ${mode} — queue: ${queue.length}`);
    }

    broadcastCount();
  });

  // ── Skip current stranger ────────────────────────────────────────────────
  socket.on('skip', ({ mode, interests }) => {
    leaveRoom(socket);
    // Re-queue immediately
    socket.emit('find_stranger_ack');
    socket.emit('searching');

    users[socket.id].mode = mode;
    users[socket.id].interests = interests || [];
    users[socket.id].roomId = null;

    const queue = waitingQueues[mode];
    const selfIdx = queue.findIndex(s => s.id === socket.id);
    if (selfIdx !== -1) queue.splice(selfIdx, 1);

    if (queue.length > 0) {
      const matchIdx = findMatch(socket, queue);
      const [partner] = queue.splice(matchIdx, 1);
      pairUsers(socket, partner, mode);
    } else {
      queue.push(socket);
    }
  });

  // ── WebRTC Signaling ─────────────────────────────────────────────────────
  socket.on('webrtc_offer', ({ roomId, offer }) => {
    socket.to(roomId).emit('webrtc_offer', { offer });
  });

  socket.on('webrtc_answer', ({ roomId, answer }) => {
    socket.to(roomId).emit('webrtc_answer', { answer });
  });

  socket.on('webrtc_ice', ({ roomId, candidate }) => {
    socket.to(roomId).emit('webrtc_ice', { candidate });
  });

  // ── Chat message ─────────────────────────────────────────────────────────
  socket.on('message', ({ roomId, text }) => {
    if (!text || typeof text !== 'string') return;
    const clean = text.trim().slice(0, 1000); // max 1000 chars
    if (!clean) return;

    const room = rooms[roomId];
    if (!room || !room.users.includes(socket.id)) return;

    socket.to(roomId).emit('message', { text: clean });
  });

  // ── Typing indicators ────────────────────────────────────────────────────
  socket.on('typing_start', ({ roomId }) => {
    socket.to(roomId).emit('typing_start');
  });

  socket.on('typing_stop', ({ roomId }) => {
    socket.to(roomId).emit('typing_stop');
  });

  // ── Disconnect ───────────────────────────────────────────────────────────
  socket.on('disconnect', () => {
    console.log(`[DISCONNECT] ${socket.id.slice(0,8)} — total: ${onlineCount()}`);
    removeFromQueue(socket.id);
    leaveRoom(socket);
    delete users[socket.id];
    broadcastCount();
  });
});

// ─── Stats endpoint ───────────────────────────────────────────────────────────
app.get('/api/stats', (req, res) => {
  res.json({
    online: onlineCount(),
    rooms: Object.keys(rooms).length,
    waiting: {
      text: waitingQueues.text.length,
      video: waitingQueues.video.length,
    },
  });
});

// ─── Start ────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`\n🌊 StrangerWave server running on port ${PORT}`);
  console.log(`   http://localhost:${PORT}\n`);
});
