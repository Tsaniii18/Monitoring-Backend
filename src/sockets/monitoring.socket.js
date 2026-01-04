import {
  getRouterDynamicInfo,
  calculateThroughput,
  pingTarget
} from '../services/monitoring.service.js';

class MonitoringManager {
  constructor() {
    this.socketIntervals = new Map();
    this.previousData = new Map();
  }

  startMonitoring(socket, mikrotikApi, interfaceName = 'LAN-ATTACKER') {
    console.log(`[WebSocket] Starting monitoring for socket ${socket.id}`);
    
    const intervalId = setInterval(async () => {
      try {
        // Get dynamic router info
        const dynamicInfo = await getRouterDynamicInfo(mikrotikApi);
        
        // Calculate throughput
        let throughput = { rx_bps: 0, tx_bps: 0 };
        if (dynamicInfo.interface) {
          const now = Date.now();
          const previous = this.previousData.get(socket.id);
          
          if (previous && previous.timestamp) {
            const timeDiff = (now - previous.timestamp) / 1000;
            throughput = calculateThroughput(
              dynamicInfo.interface,
              previous.interface,
              timeDiff
            );
          }
          
          this.previousData.set(socket.id, {
            interface: dynamicInfo.interface,
            timestamp: now,
          });
        }

        // Get ping/latency
        const latency = await pingTarget(mikrotikApi);

        // Emit data
        socket.emit('monitoring:data', {
          timestamp: Date.now(),
          cpu: dynamicInfo.cpu,
          memory: dynamicInfo.memory,
          uptime: dynamicInfo.uptime,
          throughput,
          latency,
        });

      } catch (error) {
        console.error(`[WebSocket] Error for socket ${socket.id}:`, error.message);
        socket.emit('monitoring:error', {
          message: 'Failed to fetch monitoring data',
          error: error.message,
          timestamp: Date.now(),
        });
      }
    }, 2000); // Update every 2 seconds

    this.socketIntervals.set(socket.id, intervalId);
  }

  stopMonitoring(socketId) {
    console.log(`[WebSocket] Stopping monitoring for socket ${socketId}`);
    
    const intervalId = this.socketIntervals.get(socketId);
    if (intervalId) {
      clearInterval(intervalId);
      this.socketIntervals.delete(socketId);
    }
    
    this.previousData.delete(socketId);
  }

  cleanup() {
    for (const [socketId, intervalId] of this.socketIntervals.entries()) {
      clearInterval(intervalId);
      console.log(`[WebSocket] Cleaned up interval for socket ${socketId}`);
    }
    this.socketIntervals.clear();
    this.previousData.clear();
  }
}

export const monitoringSocket = (io, mikrotikApi) => {
  const monitoringManager = new MonitoringManager();

  io.on('connection', (socket) => {
    console.log(`[WebSocket] Client connected: ${socket.id}`);
    
    // Send connection confirmation
    socket.emit('monitoring:connected', {
      message: 'Connected to monitoring service',
      socketId: socket.id,
      timestamp: Date.now(),
    });

    // Start monitoring
    monitoringManager.startMonitoring(socket, mikrotikApi);

    // Handle disconnection
    socket.on('disconnect', (reason) => {
      console.log(`[WebSocket] Client disconnected: ${socket.id} - Reason: ${reason}`);
      monitoringManager.stopMonitoring(socket.id);
    });

    // Handle manual stop
    socket.on('monitoring:stop', () => {
      console.log(`[WebSocket] Manual stop requested by ${socket.id}`);
      monitoringManager.stopMonitoring(socket.id);
      socket.emit('monitoring:stopped', { timestamp: Date.now() });
    });

    // Handle manual start
    socket.on('monitoring:start', () => {
      console.log(`[WebSocket] Manual start requested by ${socket.id}`);
      monitoringManager.startMonitoring(socket, mikrotikApi);
      socket.emit('monitoring:started', { timestamp: Date.now() });
    });
  });

  // Global cleanup on server shutdown
  process.on('SIGINT', () => {
    console.log('[WebSocket] Server shutting down, cleaning up monitoring...');
    monitoringManager.cleanup();
    process.exit(0);
  });

  return monitoringManager;
};