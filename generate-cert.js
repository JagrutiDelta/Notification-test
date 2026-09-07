const fs = require('fs');
const path = require('path');
const os = require('os');
const selfsigned = require('selfsigned');

const certDir = path.join(__dirname, 'cert');
if (!fs.existsSync(certDir)) {
  fs.mkdirSync(certDir, { recursive: true });
}

// Gather all local network IP addresses
const interfaces = os.networkInterfaces();
const altNames = [
  { type: 2, value: 'localhost' },
  { type: 7, ip: '127.0.0.1' }
];

for (const name of Object.keys(interfaces)) {
  for (const net of interfaces[name]) {
    if (net.family === 'IPv4' && !net.internal) {
      altNames.push({ type: 7, ip: net.address });
      altNames.push({ type: 2, value: net.address });
    }
  }
}

const attrs = [{ name: 'commonName', value: 'Local Development Server' }];

console.log('Generating self-signed SSL/TLS certificates with SANs for:');
altNames.forEach(san => console.log(` - ${san.ip || san.value}`));

const pems = selfsigned.generate(attrs, {
  days: 365,
  keySize: 2048,
  algorithm: 'sha256',
  extensions: [
    {
      name: 'basicConstraints',
      cA: true
    },
    {
      name: 'keyUsage',
      keyCertSign: true,
      digitalSignature: true,
      nonRepudiation: true,
      keyEncipherment: true,
      dataEncipherment: true
    },
    {
      name: 'subjectAltName',
      altNames: altNames
    }
  ]
});

fs.writeFileSync(path.join(certDir, 'server.key'), pems.private);
fs.writeFileSync(path.join(certDir, 'server.crt'), pems.cert);

console.log('\n Certificates generated successfully:');
console.log(` - Key:  ${path.join(certDir, 'server.key')}`);
console.log(` - Cert: ${path.join(certDir, 'server.crt')}`);
