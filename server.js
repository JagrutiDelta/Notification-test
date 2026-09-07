const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const os = require('os');
const express = require('express');
const { Server } = require('socket.io');

const PORT = process.env.PORT || 3000;
const app = express();

// Path to SSL Certificate and Key
const keyPath = path.join(__dirname, 'cert', 'server.key');
const certPath = path.join(__dirname, 'cert', 'server.crt');

const isVercel = process.env.VERCEL === '1' || process.env.NOW_REGION !== undefined;
const hasLocalCerts = fs.existsSync(keyPath) && fs.existsSync(certPath);

// Disable browser caching for POC testing
app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Surrogate-Control', 'no-store');
  next();
});

// Serve static files from /public directory
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Endpoint to download the SSL Certificate directly on PC B (if exists)
app.get(['/download-cert', '/cert'], (req, res) => {
  if (hasLocalCerts) {
    res.download(certPath, 'server.crt');
  } else {
    res.status(404).send('Certificate file not available on cloud server.');
  }
});

// API Status endpoint for testing connectivity via HTTP
app.get('/api/status', (req, res) => {
  res.json({
    status: 'ok',
    environment: isVercel ? 'vercel' : (hasLocalCerts ? 'local-https' : 'http'),
    serverTime: new Date().toISOString(),
    connectedClients: io && io.engine ? io.engine.clientsCount : 0
  });
});

// Support legacy URLs (receiver.html, sender.html) by routing to public files
app.get(['/receiver', '/sender'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Create Server (HTTPS for local with certs, HTTP for Cloud/Vercel/Render where cloud handles SSL)
let server;
if (!isVercel && hasLocalCerts) {
  try {
    const httpsOptions = {
      key: fs.readFileSync(keyPath),
      cert: fs.readFileSync(certPath)
    };
    server = https.createServer(httpsOptions, app);
    console.log('[INFO] Starting server with Local HTTPS.');
  } catch (err) {
    console.warn('[WARN] Failed to load SSL certs, falling back to HTTP:', err.message);
    server = http.createServer(app);
  }
} else {
  server = http.createServer(app);
  console.log('[INFO] Starting standard HTTP server (Cloud/Proxy handles SSL).');
}

// Initialize Socket.IO with CORS and robust polling/websocket transports
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  },
  transports: ['polling', 'websocket'],
  allowEIO3: true
});

// Helper: Get local network IPv4 addresses
function getLocalIPAddresses() {
  const interfaces = os.networkInterfaces();
  const addresses = [];
  for (const name of Object.keys(interfaces)) {
    for (const net of interfaces[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        addresses.push({ name, address: net.address });
      }
    }
  }
  return addresses;
}

function broadcastClientCount() {
  if (io && io.engine) {
    const count = io.engine.clientsCount;
    io.emit('client_count', { count });
  }
}

// Socket.IO real-time event handling
io.on('connection', (socket) => {
  const clientIp = socket.handshake.address;
  const total = io.engine ? io.engine.clientsCount : 1;
  console.log(`\n[+] Client Connected: ${socket.id} | IP: ${clientIp} | Total Online: ${total}`);
  
  socket.emit('connection_ack', {
    socketId: socket.id,
    clientIp: clientIp,
    totalClients: total,
    serverTime: new Date().toLocaleTimeString()
  });

  broadcastClientCount();

  const handleSendNotification = (data) => {
    const totalClients = io.engine ? io.engine.clientsCount : 1;
    const now = new Date();
    const timestamp = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    
    const payload = {
      id: 'notif_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
      title: '🔔 New Notification',
      message: (data && data.message) ? data.message : 'Hello! This notification was sent from another PC.',
      sender: (data && data.sender) ? data.sender : `PC (${socket.id.substring(0, 5)})`,
      senderSocketId: socket.id,
      timestamp: timestamp,
      serverTime: timestamp
    };

    console.log(`\n================ NOTIFICATION EVENT ================`);
    console.log(`[>] From Client   : ${socket.id} (${clientIp})`);
    console.log(`[>] Message       : "${payload.message}"`);
    console.log(`[>] Broadcasting to: ${totalClients} connected client(s)`);

    io.emit('notification', payload);
    io.emit('receive_notification', payload);
    
    console.log(`[✓] Broadcast completed.`);
    console.log(`====================================================\n`);
  };

  socket.on('send-notification', handleSendNotification);
  socket.on('send_notification', handleSendNotification);
  socket.on('message', handleSendNotification);

  socket.on('disconnect', (reason) => {
    console.log(`[-] Client Disconnected: ${socket.id} | Reason: ${reason}`);
    broadcastClientCount();
  });
});

// Start Server if not imported as serverless function
if (!isVercel) {
  server.listen(PORT, '0.0.0.0', () => {
    const localIPs = getLocalIPAddresses();
    const protocol = hasLocalCerts ? 'https' : 'http';
    console.log('\n========================================================');
    console.log(`🚀 Notification POC Server Running on Port ${PORT}!`);
    console.log('========================================================');
    console.log(`\n💻 Local Machine (PC A):`);
    console.log(`   👉 ${protocol}://localhost:${PORT}`);

    if (localIPs.length > 0) {
      console.log(`\n🌐 Remote Machine (PC B on same Wi-Fi / Local Network):`);
      localIPs.forEach((ip) => {
        console.log(`   👉 ${protocol}://${ip.address}:${PORT}  (${ip.name})`);
      });
    }
    console.log('\n========================================================\n');
  });
}

// Export for Vercel / Serverless environments
module.exports = app;
