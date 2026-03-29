import type { Handler } from '@netlify/functions';

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const { url, method, headers, body } = JSON.parse(event.body || '{}');

    if (!url) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Missing target URL' }) };
    }

    console.log(`Proxying ${method || 'POST'} request to: ${url}`);

    const response = await fetch(url, {
      method: method || 'POST',
      headers: {
        ...headers,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    const text = await response.text();
    let data;
    try {
      data = text ? JSON.parse(text) : {};
    } catch (e) {
      data = { error: 'Invalid JSON response from upstream', raw: text };
    }

    return {
      statusCode: response.status,
      body: JSON.stringify(data),
      headers: { 'Content-Type': 'application/json' },
    };
  } catch (error) {
    console.error('Proxy error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Proxy request failed',
        message: error instanceof Error ? error.message : String(error),
      }),
    };
  }
};
