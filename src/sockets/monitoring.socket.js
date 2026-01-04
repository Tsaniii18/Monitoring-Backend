import {
  getRouterDynamicInfo,
  calculateThroughput,
  pingTarget
} from '../services/monitoring.service.js';

class MonitoringManager {
  constructor() {
    this.socketIntervals = new Map();
    this.previousData = new Map();
    this.intervalMs = 1000;
  }

  startMonitoring(socket, mikrotikApi) {
    console.log(`[WebSocket] Starting monitoring for socket ${socket.id}`);

    this.stopMonitoring(socket.id);
    this.socketIntervals.set(socket.id, null);

    const runMonitoring = async (isPriming = false) => {
      if (!this.socketIntervals.has(socket.id)) {
        return;
      }

      try {
        const [dynamicInfo, latency] = await Promise.all([
          getRouterDynamicInfo(mikrotikApi),
          pingTarget(mikrotikApi),
        ]);

        const now = Date.now();
        const previous = this.previousData.get(socket.id);
        let throughput = previous?.throughput ?? null;
        let throughputByInterface = [];
        let previousInterfaces = previous?.interfaces ?? {};

        if (previous && previous.timestamp) {
          const timeDiff = (now - previous.timestamp) / 1000;
          throughputByInterface = dynamicInfo.interfaces.map((iface) => {
            const previousInterface = previousInterfaces[iface.name];
            if (!previousInterface) {
              return {
                name: iface.name,
                rx_bps: null,
                tx_bps: null,
              };
            }

            return {
              name: iface.name,
              ...calculateThroughput(iface, previousInterface, timeDiff),
            };
          });

          throughput = throughputByInterface.reduce(
            (acc, item) => ({
              rx_bps: acc.rx_bps + (item.rx_bps ?? 0),
              tx_bps: acc.tx_bps + (item.tx_bps ?? 0),
            }),
            { rx_bps: 0, tx_bps: 0 }
          );
        }

        const currentInterfaces = dynamicInfo.interfaces.reduce((acc, iface) => {
          acc[iface.name] = {
            rx_bytes: iface.rx_bytes,
            tx_bytes: iface.tx_bytes,
          };
          return acc;
        }, {});

        this.previousData.set(socket.id, {
          interfaces: currentInterfaces,
          timestamp: now,
          throughput,
        });

        if (isPriming && !previous) {
          return;
        }

        // Emit data
        socket.emit('monitoring:data', {
          timestamp: Date.now(),
          cpu: dynamicInfo.cpu,
          memory: dynamicInfo.memory,
          uptime: dynamicInfo.uptime,
          throughput,
          throughput_by_interface: throughputByInterface,
          interfaces: dynamicInfo.interfaces,
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

      if (!this.socketIntervals.has(socket.id)) {
        return;
      }

      const timeoutId = setTimeout(() => runMonitoring(false), this.intervalMs);
      this.socketIntervals.set(socket.id, timeoutId);
    };

    runMonitoring(true);
  }

  stopMonitoring(socketId) {
    console.log(`[WebSocket] Stopping monitoring for socket ${socketId}`);
    
    const intervalId = this.socketIntervals.get(socketId);
    if (intervalId) {
      clearTimeout(intervalId);
    }
    this.socketIntervals.delete(socketId);
    
    this.previousData.delete(socketId);
  }

  cleanup() {
    for (const [socketId, intervalId] of this.socketIntervals.entries()) {
      clearTimeout(intervalId);
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
