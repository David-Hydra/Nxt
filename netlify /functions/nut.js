const https = require('https');

const BACKEND_HOST = 'heatwave.run.place';
const BACKEND_PORT = 443;

exports.handler = async (event, context) => {
  // Netlify gives you the full path in event.path (e.g. "/api/nut/foo")
  // Strip the function prefix so the backend gets the real path.
  const prefix = '/api/nut';
  let path = event.path || '/';
  if (path.startsWith(prefix)) path = path.slice(prefix.length) || '/';

  // Preserve query string
  const qs = event.rawQuery ? `?${event.rawQuery}` : '';
  const fullPath = path + qs;

  // Build headers, override Host
  const headers = { ...event.headers, host: BACKEND_HOST };
  // Remove Netlify-internal headers that confuse the backend
  delete headers['x-nf-client-connection-ip'];
  delete headers['x-nf-request-id'];
  delete headers['x-forwarded-host'];
  delete headers['x-forwarded-proto'];

  const body =
    event.body && event.isBase64Encoded
      ? Buffer.from(event.body, 'base64')
      : event.body || undefined;

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: BACKEND_HOST,
        port: BACKEND_PORT,
        path: fullPath,
        method: event.httpMethod,
        headers,
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const buf = Buffer.concat(chunks);
          // Pass through status + headers; drop hop-by-hop headers
          const outHeaders = { ...res.headers };
          delete outHeaders['transfer-encoding'];
          delete outHeaders['connection'];

          resolve({
            statusCode: res.statusCode || 502,
            headers: outHeaders,
            body: buf.toString('base64'),
            isBase64Encoded: true,
          });
        });
      }
    );

    req.on('error', (err) => {
      console.error('Backend error:', err);
      resolve({ statusCode: 502, body: 'Bad Gateway' });
    });

    if (body) req.write(body);
    req.end();
  });
};
