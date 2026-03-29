import type { Handler } from '@netlify/functions';
import fs from 'fs/promises';
import path from 'path';

const CONFIG_FILE = path.join(process.cwd(), 'config.json');

export const handler: Handler = async (event) => {
  if (event.httpMethod === 'GET') {
    try {
      const data = await fs.readFile(CONFIG_FILE, 'utf-8');
      return { statusCode: 200, body: data, headers: { 'Content-Type': 'application/json' } };
    } catch (error) {
      return { statusCode: 200, body: '{}', headers: { 'Content-Type': 'application/json' } };
    }
  } else if (event.httpMethod === 'POST') {
    try {
      await fs.writeFile(CONFIG_FILE, event.body || '{}');
      return { statusCode: 200, body: JSON.stringify({ status: 'ok' }), headers: { 'Content-Type': 'application/json' } };
    } catch (error) {
      return { statusCode: 500, body: JSON.stringify({ error: 'Failed to save config' }), headers: { 'Content-Type': 'application/json' } };
    }
  }
  return { statusCode: 405, body: 'Method Not Allowed' };
};
