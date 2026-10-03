// Local demo only: forward TLS bytes unchanged; Caddy still verifies as localhost.
const net = require('node:net');
net.createServer(client => {
  const upstream = net.connect(8443, 'gateway');
  client.on('error', () => upstream.destroy());
  upstream.on('error', () => client.destroy());
  client.pipe(upstream).pipe(client);
}).listen(8443, '127.0.0.1');
