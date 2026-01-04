import axios from 'axios';

export const createMikrotikClient = () => {
  const host = process.env.MIKROTIK_HOST;
  const username = process.env.MIKROTIK_USER;
  const password = process.env.MIKROTIK_PASS;

  if (!host || !username || !password) {
    throw new Error('MikroTik ENV not loaded');
  }

  return axios.create({
    baseURL: `http://${host}/rest`,
    auth: { username, password },
    timeout: 10000,
    headers: {
      'Content-Type': 'application/json',
    },
    validateStatus: (status) => status >= 200 && status < 500,
  });
};