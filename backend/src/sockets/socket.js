import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import env from '../config/env.js';
import { logger } from '../utils/logger.js';
import User from '../models/User.js';

let ioInstance = null;

export function initSocketServer(httpServer) {
  const allowedOrigins = (env.CLIENT_ORIGIN || 'http://localhost:5173')
    .split(',')
    .map((o) => o.trim().replace(/\/+$/, ''))
    .filter(Boolean);

  const isAllowedOrigin = (origin) => {
    if (!origin) return true;
    const clean = origin.replace(/\/+$/, '');
    if (allowedOrigins.includes(clean) || allowedOrigins.includes('*')) {
      return true;
    }
    // Automatically allow Netlify production and preview deploy domains (*.netlify.app)
    if (clean.endsWith('.netlify.app')) {
      return true;
    }
    // Allow localhost and local IP development
    if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(clean)) {
      return true;
    }
    return false;
  };

  const io = new Server(httpServer, {
    cors: {
      origin: (origin, callback) => {
        if (isAllowedOrigin(origin)) {
          return callback(null, true);
        }
        return callback(new Error(`Origin ${origin} not allowed by Socket CORS`));
      },
      credentials: true,
    },
  });

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token || socket.handshake.query?.token;
      if (token) {
        try {
          const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET);
          const user = await User.findById(decoded.sub).select('+status');
          if (user && (user.status === 'active' || user.status === 'pending_approval')) {
            socket.user = user;
          }
        } catch (jwtErr) {
          logger.debug({ err: jwtErr.message }, 'Socket token verify failed');
        }
      }
      next();
    } catch (err) {
      next(err);
    }
  });

  io.on('connection', (socket) => {
    if (socket.user) {
      socket.join(`user:${socket.user._id}`);
      socket.join(`role:${socket.user.role}`);
      logger.debug({ userId: socket.user._id, role: socket.user.role }, 'Authenticated socket connected');
    } else {
      socket.join('public');
      logger.debug('Anonymous socket connected');
    }

    socket.on('join:order', (orderId) => {
      if (orderId && typeof orderId === 'string') {
        socket.join(`order:${orderId}`);
      }
    });

    socket.on('leave:order', (orderId) => {
      if (orderId && typeof orderId === 'string') {
        socket.leave(`order:${orderId}`);
      }
    });

    socket.on('disconnect', () => {
      logger.debug('Socket disconnected');
    });
  });

  ioInstance = io;
  return io;
}

export function getIO() {
  return ioInstance;
}

export function emitToUser(userId, event, data) {
  if (ioInstance && userId) {
    ioInstance.to(`user:${userId}`).emit(event, data);
  }
}

export function emitToRole(role, event, data) {
  if (ioInstance && role) {
    ioInstance.to(`role:${role}`).emit(event, data);
  }
}

export function emitToOrder(orderId, event, data) {
  if (ioInstance && orderId) {
    ioInstance.to(`order:${orderId}`).emit(event, data);
  }
}

export function broadcastEvent(event, data) {
  if (ioInstance) {
    ioInstance.emit(event, data);
  }
}
