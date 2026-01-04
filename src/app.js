import dotenv from 'dotenv';
dotenv.config();

import cors from 'cors';
import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';

import monitoringRoutes from './routes/monitoring.routes.js';
import { monitoringSocket } from './sockets/monitoring.socket.js';
import { createMikrotikClient } from './client/mikrotik.client.js';

// Init Express
const app = express();

// Security middleware
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}));

// Rate limiting for API
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
});

app.use('/api/', apiLimiter);
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: Date.now(),
    uptime: process.uptime(),
  });
});

// Initialize MikroTik client
let mikrotikApi;
try {
  mikrotikApi = createMikrotikClient();
  
  // Test connection
  mikrotikApi.get('/system/resource')
    .then(() => console.log('[MIKROTIK] ✓ Connection successful'))
    .catch(err => {
      console.error('[MIKROTIK] ✗ Connection failed:', err.message);
      process.exit(1);
    });
} catch (err) {
  console.error('[MIKROTIK] ✗ Failed to init client:', err.message);
  process.exit(1);
}

// Store client in app context
app.set('mikrotikApi', mikrotikApi);

// Routes
app.use('/api/monitoring', monitoringRoutes);

// Create HTTP server
const server = http.createServer(app);

// Initialize Socket.IO
const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    methods: ['GET', 'POST'],
    credentials: true,
  },
  pingTimeout: 60000,
  pingInterval: 25000,
});

// WebSocket connection handling
let connectionCount = 0;

io.on('connection', (socket) => {
  connectionCount++;
  console.log(`[Socket.IO] Client connected. Total: ${connectionCount}`);
  
  socket.on('disconnect', () => {
    connectionCount--;
    console.log(`[Socket.IO] Client disconnected. Total: ${connectionCount}`);
  });
});

// Initialize monitoring WebSocket
monitoringSocket(io, mikrotikApi);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('[APP] Error:', err.stack);
  res.status(500).json({
    success: false,
    message: 'Internal server error',
    timestamp: Date.now(),
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Endpoint not found',
    timestamp: Date.now(),
  });
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`[Server] ✓ API & WebSocket running on port ${PORT}`);
  console.log(`[Server] ✓ Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`[Server] ✓ MikroTik host: ${process.env.MIKROTIK_HOST}`);
});