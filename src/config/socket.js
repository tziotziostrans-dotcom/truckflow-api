const socketIO = require('socket.io');
const jwt = require('jsonwebtoken');

let io;
const userSockets = new Map(); // Map userId to socket IDs

const getAllowedOrigins = () =>
  [
    process.env.FRONTEND_URL,
    'http://localhost:3000',
    'https://truckflowhq.com',
    'https://www.truckflowhq.com',
  ].filter(Boolean);

const initializeSocket = (server) => {
  io = socketIO(server, {
    cors: {
      origin: getAllowedOrigins(),
      methods: ['GET', 'POST'],
      credentials: true,
    },
  });

  // Authentication middleware
  io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    
    if (!token) {
      return next(new Error('Authentication error'));
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.userId = decoded.id;
      socket.userRole = decoded.role;
      next();
    } catch (err) {
      next(new Error('Authentication error'));
    }
  });

  io.on('connection', (socket) => {
    console.log(`User connected: ${socket.userId}`);
    
    // Store socket connection
    if (!userSockets.has(socket.userId)) {
      userSockets.set(socket.userId, new Set());
    }
    userSockets.get(socket.userId).add(socket.id);

    // Join user-specific room
    socket.join(`user:${socket.userId}`);
    
    // Join role-specific room
    socket.join(`role:${socket.userRole}`);

    socket.on('disconnect', () => {
      console.log(`User disconnected: ${socket.userId}`);
      const sockets = userSockets.get(socket.userId);
      if (sockets) {
        sockets.delete(socket.id);
        if (sockets.size === 0) {
          userSockets.delete(socket.userId);
        }
      }
    });
  });

  return io;
};

const getIO = () => {
  if (!io) {
    throw new Error('Socket.io not initialized');
  }
  return io;
};

const isUserOnline = (userId) => {
  return userSockets.has(userId.toString());
};

module.exports = {
  initializeSocket,
  getIO,
  isUserOnline
};
