const fs = require('fs');
const path = require('path');
const https = require('https');
const os = require('os');
const express = require('express');
const { Server } = require('socket.io');

const PORT = process.env.PORT || 3000;
const app = express();

// Path to SSL Certificate and Key
const keyPath = path.join(__dirname, 'cert', 'server.key');
const certPath = path.join(__dirname, 'cert', 'server.crt');

// Verify certificates exist
if (!fs.existsSync(keyPath) || !fs.existsSync(certPath)) {
  console.error('\n❌ Error: SSL certificates not found in ./cert directory.');
  console.error('👉 Run "npm run generate-cert" to create them automatically.\n');
  process.exit(1);
}

const httpsOptions = {
  key: fs.readFileSync(keyPath),
  cert: fs.readFileSync(certPath)
};

// Disable browser caching completely for POC testing
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

// Endpoint to download the SSL Certificate directly on PC B
app.get(['/download-cert', '/cert'], (req, res) => {
  res.download(certPath, 'server.crt');
});

// API Status endpoint for testing connectivity via HTTP
app.get('/api/status', (req, res) => {
  res.json({
    status: 'ok',
    serverTime: new Date().toISOString(),
    connectedClients: io.engine ? io.engine.clientsCount : 0
  });
});

// Create HTTPS Server
const server = https.createServer(httpsOptions, app);

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
  const count = io.engine ? io.engine.clientsCount : 0;
  io.emit('client_count', { count });
}

// Socket.IO real-time event handling
io.on('connection', (socket) => {
  const clientIp = socket.handshake.address;
  const total = io.engine.clientsCount;
  console.log(`\n[+] Client Connected: ${socket.id} | IP: ${clientIp} | Total Online: ${total}`);
  
  // Send immediate welcome & status to newly connected client
  socket.emit('connection_ack', {
    socketId: socket.id,
    clientIp: clientIp,
    totalClients: total,
    serverTime: new Date().toLocaleTimeString()
  });

  // Broadcast updated count to all clients
  broadcastClientCount();

  // Handler for notification dispatch
  const handleSendNotification = (data) => {
    const totalClients = io.engine.clientsCount;
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

    // Broadcast to EVERY connected client
    io.emit('notification', payload);
    io.emit('receive_notification', payload);
    
    console.log(`[✓] Broadcast completed.`);
    console.log(`====================================================\n`);
  };

  // Support all event names
  socket.on('send-notification', handleSendNotification);
  socket.on('send_notification', handleSendNotification);
  socket.on('message', handleSendNotification);

  socket.on('disconnect', (reason) => {
    console.log(`[-] Client Disconnected: ${socket.id} | Reason: ${reason} | Remaining Online: ${io.engine.clientsCount}`);
    broadcastClientCount();
  });
});

// Start HTTPS Server
server.listen(PORT, '0.0.0.0', () => {
  const localIPs = getLocalIPAddresses();
  console.log('\n========================================================');
  console.log('🚀 PC-to-PC Notification POC Server is Running (HTTPS)!');
  console.log('========================================================');
  console.log(`\n💻 Local Machine (PC A):`);
  console.log(`   👉 https://localhost:${PORT}`);

  if (localIPs.length > 0) {
    console.log(`\n🌐 Remote Machine (PC B on same Wi-Fi / Local Network):`);
    localIPs.forEach((ip) => {
      console.log(`   👉 https://${ip.address}:${PORT}  (${ip.name})`);
    });
  } else {
    console.log('\n⚠️ No external LAN IP detected. Make sure you are connected to Wi-Fi/Ethernet.');
  }

  console.log('\n========================================================\n');
});
