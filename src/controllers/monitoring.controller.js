import { getRouterStaticInfo } from '../services/monitoring.service.js';

export const routerInfo = async (req, res) => {
  try {
    const mikrotikApi = req.app.get('mikrotikApi');
    const data = await getRouterStaticInfo(mikrotikApi);
    
    res.json({
      success: true,
      timestamp: Date.now(),
      data,
    });
  } catch (err) {
    console.error('Router info error:', err);
    
    res.status(500).json({
      success: false,
      message: 'Failed to fetch router information',
      error: err.message,
      timestamp: Date.now(),
    });
  }
};

export const getInterfaces = async (req, res) => {
  try {
    const mikrotikApi = req.app.get('mikrotikApi');
    const { data } = await mikrotikApi.get('/interface');
    
    const interfaces = data.map(iface => ({
      name: iface.name,
      type: iface.type,
      running: iface.running,
      mtu: iface.mtu,
      mac_address: iface['mac-address'],
      rx_bytes: Number(iface['rx-byte']),
      tx_bytes: Number(iface['tx-byte']),
    }));

    res.json({
      success: true,
      data: interfaces,
      timestamp: Date.now(),
    });
  } catch (err) {
    console.error('Interfaces error:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch interfaces',
      error: err.message,
    });
  }
};