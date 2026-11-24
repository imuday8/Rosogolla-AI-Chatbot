import '../build.mjs';
const {default: worker} = await import('../dist/server/index.js');

export default async function handler(req, res) {
  try {
    const protocol = req.headers['x-forwarded-proto'] || 'https';
    const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost';
    const url = new URL(req.url, `${protocol}://${host}`);
    const method = req.method;
    
    let body = undefined;
    if (!['GET', 'HEAD'].includes(method)) {
      if (typeof req.body === 'string') {
        body = req.body;
      } else if (req.body && typeof req.body === 'object') {
        body = JSON.stringify(req.body);
      }
    }

    const request = new Request(url.href, {
      method,
      headers: req.headers,
      body: body ? body : undefined
    });

    const response = await worker.fetch(request, process.env);
    res.status(response.status);
    response.headers.forEach((val, key) => res.setHeader(key, val));
    
    const buffer = await response.arrayBuffer();
    res.send(Buffer.from(buffer));
  } catch (err) {
    res.status(500).send(err.message || 'Server error');
  }
}
