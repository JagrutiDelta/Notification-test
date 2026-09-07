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

// Create Server
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

// Initialize Socket.IO
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

// Active connected devices registry
const connectedDevices = new Map();

function broadcastOnlineDevices() {
  if (!io) return;
  const devicesList = [];
  for (const [socketId, dev] of connectedDevices.entries()) {
    devicesList.push({
      socketId: socketId,
      name: dev.name,
      ip: dev.ip,
      connectedAt: dev.connectedAt
    });
  }
  
  io.emit('online_devices', {
    count: devicesList.length,
    devices: devicesList
  });
  io.emit('client_count', { count: devicesList.length });
}

// Socket.IO real-time event handling
io.on('connection', (socket) => {
  const clientIp = socket.handshake.address.replace('::ffff:', '');
  const isLocal = clientIp === '127.0.0.1' || clientIp === '::1';
  const defaultName = isLocal ? 'PC A (Host)' : `PC (${socket.id.substring(0, 4)})`;

  // Register device
  connectedDevices.set(socket.id, {
    name: defaultName,
    ip: clientIp,
    connectedAt: new Date().toLocaleTimeString()
  });

  console.log(`\n[+] Client Connected: ${socket.id} (${defaultName}) | IP: ${clientIp} | Total: ${connectedDevices.size}`);

  socket.emit('connection_ack', {
    socketId: socket.id,
    assignedName: defaultName,
    clientIp: clientIp,
    totalClients: connectedDevices.size,
    serverTime: new Date().toLocaleTimeString()
  });

  // Broadcast updated list to everyone
  broadcastOnlineDevices();

  // Allow client to update their friendly device name
  socket.on('set_device_name', (data) => {
    if (data && data.name) {
      const dev = connectedDevices.get(socket.id) || {};
      dev.name = data.name.trim();
      connectedDevices.set(socket.id, dev);
      console.log(`[i] Renamed socket ${socket.id} -> "${dev.name}"`);
      broadcastOnlineDevices();
    }
  });

  // Notification Handler (Supports Broadcast and Targeted 1-to-1)
  const handleSendNotification = (data) => {
    const senderDev = connectedDevices.get(socket.id);
    const senderName = (data && data.sender) ? data.sender : (senderDev ? senderDev.name : `PC (${socket.id.substring(0, 4)})`);
    const targetSocketId = data ? data.targetSocketId : 'all';
    
    const now = new Date();
    const timestamp = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    
    const payload = {
      id: 'notif_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
      title: '🔔 New Notification',
      message: (data && data.message) ? data.message : 'Hello! This notification was sent from another PC.',
      sender: senderName,
      senderSocketId: socket.id,
      targetSocketId: targetSocketId,
      timestamp: timestamp,
      serverTime: timestamp
    };

    console.log(`\n================ NOTIFICATION EVENT ================`);
    console.log(`[>] From: ${senderName} (${socket.id})`);
    console.log(`[>] To  : ${targetSocketId === 'all' ? 'All Online Devices (Broadcast)' : `Specific Device: ${targetSocketId}`}`);
    console.log(`[>] Msg : "${payload.message}"`);

    if (!targetSocketId || targetSocketId === 'all') {
      // Broadcast to EVERY connected client
      io.emit('notification', payload);
      io.emit('receive_notification', payload);
      console.log(`[✓] Broadcasted to all ${connectedDevices.size} connected device(s).`);
    } else {
      // 🎯 TARGETED 1-to-1: Send ONLY to target device and echo back to sender
      io.to(targetSocketId).emit('notification', payload);
      if (targetSocketId !== socket.id) {
        socket.emit('notification', payload); // So sender sees card in their own sent list
      }
      console.log(`[✓] Sent directly to target device (${targetSocketId}).`);
    }
    console.log(`====================================================\n`);
  };

  socket.on('send-notification', handleSendNotification);
  socket.on('send_notification', handleSendNotification);
  socket.on('message', handleSendNotification);

  socket.on('disconnect', (reason) => {
    const dev = connectedDevices.get(socket.id);
    console.log(`[-] Client Disconnected: ${socket.id} (${dev ? dev.name : 'Unknown'}) | Reason: ${reason}`);
    connectedDevices.delete(socket.id);
    broadcastOnlineDevices();
  });
});

// Start Server
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

// Export for Vercel
module.exports = app;
