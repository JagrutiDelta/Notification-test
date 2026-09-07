// DOM Elements
const connectionStatusEl = document.getElementById('connectionStatus');
const connectionTextEl = document.getElementById('connectionText');
const deviceCountBadge = document.getElementById('deviceCountBadge');
const deviceCountText = document.getElementById('deviceCountText');
const permissionStatusEl = document.getElementById('permissionStatus');
const permissionTextEl = document.getElementById('permissionText');
const enableNotifBtn = document.getElementById('enableNotifBtn');
const alertBannerEl = document.getElementById('alertBanner');

const messageInput = document.getElementById('messageInput');
const senderNameInput = document.getElementById('senderNameInput');
const sendBtn = document.getElementById('sendBtn');
const notificationsList = document.getElementById('notificationsList');
const emptyState = document.getElementById('emptyState');
const clearListBtn = document.getElementById('clearListBtn');
const testPopupBtn = document.getElementById('testPopupBtn');

// Debug elements
const debugSocketId = document.getElementById('debugSocketId');
const debugTransport = document.getElementById('debugTransport');
const debugLastEvent = document.getElementById('debugLastEvent');

// Register Service Worker for robust notification delivery
let swRegistration = null;
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js')
    .then((reg) => {
      swRegistration = reg;
      console.log('Service Worker registered successfully:', reg.scope);
    })
    .catch((err) => {
      console.warn('Service Worker registration warning:', err);
    });
}

// Initialize Socket.IO connection with polling first then upgrade
const socket = io({
  transports: ['polling', 'websocket'],
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  timeout: 20000
});

// ==========================================
// 1. Connection Lifecycle
// ==========================================
socket.on('connect', () => {
  console.log(`[CONNECTED] Socket ID: ${socket.id} | Transport: ${socket.io.engine.transport.name}`);
  setConnectionState(true);
  hideAlertBanner();
  
  if (debugSocketId) debugSocketId.textContent = socket.id;
  if (debugTransport) debugTransport.textContent = socket.io.engine.transport.name;

  socket.io.engine.on('upgrade', () => {
    console.log(`[UPGRADE] Transport upgraded to: ${socket.io.engine.transport.name}`);
    if (debugTransport) debugTransport.textContent = socket.io.engine.transport.name;
  });
});

socket.on('connection_ack', (data) => {
  console.log('[SERVER ACK]', data);
  if (data.totalClients !== undefined) {
    updateDeviceCount(data.totalClients);
  }
});

socket.on('disconnect', (reason) => {
  console.warn(`[DISCONNECTED] Reason: ${reason}`);
  setConnectionState(false);
  updateDeviceCount(0);
});

socket.on('connect_error', (error) => {
  console.error('[CONNECTION ERROR]', error);
  setConnectionState(false);
  showAlertBanner(`⚠️ Connection Error: ${error.message || 'Cannot reach server'}. Check IP & Firewall.`, 'danger');
});

socket.on('client_count', (data) => {
  console.log('[CLIENT COUNT]', data);
  updateDeviceCount(data.count);
});

function updateDeviceCount(count) {
  if (!deviceCountBadge || !deviceCountText) return;
  if (count <= 1) {
    deviceCountBadge.className = 'status-badge device-count-solo';
    deviceCountText.textContent = `👥 ${count} Device Online (Open on PC B)`;
  } else {
    deviceCountBadge.className = 'status-badge device-count-multi';
    deviceCountText.textContent = `👥 ${count} Devices Online (Connected!)`;
  }
}

function setConnectionState(isConnected) {
  if (isConnected) {
    connectionStatusEl.className = 'status-badge connected';
    connectionTextEl.textContent = '● Connected';
  } else {
    connectionStatusEl.className = 'status-badge disconnected';
    connectionTextEl.textContent = '● Disconnected';
  }
}

// ==========================================
// 2. Browser Notification Permission
// ==========================================
function updatePermissionStatus() {
  if (!('Notification' in window)) {
    permissionStatusEl.className = 'status-badge permission-denied';
    permissionTextEl.textContent = 'Notification: Unsupported';
    enableNotifBtn.style.display = 'none';
    showAlertBanner('⚠️ This browser does not support desktop notifications.', 'warning');
    return;
  }

  const permission = Notification.permission;
  console.log(`[PERMISSION] Status: ${permission}`);

  if (permission === 'granted') {
    permissionStatusEl.className = 'status-badge permission-granted';
    permissionTextEl.textContent = 'Permission: Granted';
    enableNotifBtn.textContent = '✓ Notifications Enabled';
    enableNotifBtn.disabled = true;
    enableNotifBtn.classList.remove('btn-outline');
    enableNotifBtn.classList.add('btn-text');
    if (testPopupBtn) testPopupBtn.style.display = 'inline-flex';
  } else if (permission === 'denied') {
    permissionStatusEl.className = 'status-badge permission-denied';
    permissionTextEl.textContent = 'Permission: Denied (Blocked)';
    enableNotifBtn.textContent = '⚠️ Blocked in Browser';
    enableNotifBtn.disabled = true;
    showAlertBanner('⚠️ Desktop notifications are blocked for this site in your browser. Click the site settings/lock icon in the URL bar to allow notifications.', 'warning');
  } else {
    permissionStatusEl.className = 'status-badge permission-default';
    permissionTextEl.textContent = 'Permission: Default (Click Enable)';
    enableNotifBtn.textContent = '🔔 Enable Notifications';
    enableNotifBtn.disabled = false;
  }
}

enableNotifBtn.addEventListener('click', async () => {
  if (!('Notification' in window)) {
    alert('This browser does not support system notifications.');
    return;
  }

  try {
    const permission = await Notification.requestPermission();
    updatePermissionStatus();
    if (permission === 'granted') {
      showToast('Notifications Enabled!', 'You will now receive desktop popups from other PCs.');
      triggerBrowserNotification({
        title: '🔔 Notifications Enabled!',
        message: 'Ready to receive real-time alerts from other PCs.',
        sender: 'System'
      });
    }
  } catch (err) {
    console.error('Error requesting notification permission:', err);
  }
});

// Test Popup button handler on PC B
if (testPopupBtn) {
  testPopupBtn.addEventListener('click', () => {
    showToast('Test Notification', 'If you see this on PC B, reception is working!');
    triggerBrowserNotification({
      title: '🔔 Test Notification',
      message: 'If you see this desktop popup, your PC is configured correctly!',
      sender: 'Local Test'
    });
  });
}

// ==========================================
// 3. Send Notification Flow (PC A)
// ==========================================
function sendNotification() {
  const message = messageInput.value.trim() || 'Hello! This notification was sent from another PC.';
  const sender = senderNameInput.value.trim() || 'PC A';

  if (!socket.connected) {
    showAlertBanner('❌ Cannot send: Server is disconnected. Check network connection.', 'danger');
    return;
  }

  // Emit 'send-notification' event to the server
  socket.emit('send-notification', {
    message: message,
    sender: sender
  });

  // Visual feedback
  const originalHtml = sendBtn.innerHTML;
  sendBtn.innerHTML = '<span>✓</span> Sent to PC B!';
  sendBtn.style.backgroundColor = '#10b981';
  setTimeout(() => {
    sendBtn.innerHTML = originalHtml;
    sendBtn.style.backgroundColor = '';
  }, 1200);

  if (debugLastEvent) {
    debugLastEvent.textContent = `Sent: "${message}" (${new Date().toLocaleTimeString()})`;
  }
}

sendBtn.addEventListener('click', sendNotification);

// Press Enter inside input to send
messageInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    sendNotification();
  }
});

// Quick preset tags
document.querySelectorAll('.tag-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    messageInput.value = btn.getAttribute('data-msg');
    messageInput.focus();
  });
});

// ==========================================
// 4. Receive Notification Flow (PC B)
// ==========================================
const handleIncomingNotification = (data) => {
  console.log('\n[EVENT RECEIVED] Notification payload:', data);
  
  if (debugLastEvent) {
    debugLastEvent.textContent = `Received: "${data.message}" from ${data.sender} (${data.timestamp})`;
  }

  const isSender = data.senderSocketId && data.senderSocketId === socket.id;

  // 1. Add notification card to web page list on BOTH PC A and PC B
  addNotificationCard(data, isSender);

  // 2. Always show an on-screen toast popup on PC B
  if (!isSender) {
    showToast(`🔔 ${data.sender || 'Remote PC'}`, data.message);
  }

  // 3. Trigger native Windows / Browser Desktop Popup Notification
  if (!isSender) {
    triggerBrowserNotification(data);
  }
};

// Listen to all possible event names
socket.on('notification', handleIncomingNotification);
socket.on('receive_notification', handleIncomingNotification);

function addNotificationCard(data, isSender = false) {
  if (emptyState && emptyState.parentNode) {
    emptyState.style.display = 'none';
  }

  const card = document.createElement('div');
  card.className = `notification-card ${isSender ? 'sent-card' : 'received-card'}`;

  const meta = document.createElement('div');
  meta.className = 'notification-meta';

  const senderTag = document.createElement('span');
  senderTag.className = 'sender-tag';
  if (isSender) {
    senderTag.innerHTML = `<span>📤</span> <strong>You (Sent)</strong>`;
  } else {
    senderTag.innerHTML = `<span>📥</span> <strong>${escapeHtml(data.sender || 'Remote PC')}</strong>`;
  }

  const timeTag = document.createElement('span');
  timeTag.className = 'time-tag';
  timeTag.textContent = data.timestamp || new Date().toLocaleTimeString();

  meta.appendChild(senderTag);
  meta.appendChild(timeTag);

  const body = document.createElement('div');
  body.className = 'notification-body';
  body.textContent = data.message;

  card.appendChild(meta);
  card.appendChild(body);

  // Prepend to show newest at top
  notificationsList.insertBefore(card, notificationsList.firstChild);
}

// In-App Toast Popup (Visual overlay on page that guarantees on-screen popup)
function showToast(title, message) {
  let toastContainer = document.getElementById('toastContainer');
  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.id = 'toastContainer';
    toastContainer.className = 'toast-container';
    document.body.appendChild(toastContainer);
  }

  const toast = document.createElement('div');
  toast.className = 'toast-popup';
  toast.innerHTML = `
    <div class="toast-header">
      <strong>${escapeHtml(title)}</strong>
      <span class="toast-time">${new Date().toLocaleTimeString()}</span>
    </div>
    <div class="toast-body">${escapeHtml(message)}</div>
  `;

  toastContainer.appendChild(toast);

  // Auto remove toast after 6 seconds
  setTimeout(() => {
    toast.classList.add('fade-out');
    setTimeout(() => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 400);
  }, 6000);
}

// Audio Chime using Web Audio API (Synthesizer)
function playNotificationSound() {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    
    // Tone 1 (D5)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(587.33, ctx.currentTime);
    gain1.gain.setValueAtTime(0.15, ctx.currentTime);
    gain1.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(ctx.currentTime);
    osc1.stop(ctx.currentTime + 0.3);

    // Tone 2 (A5)
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(880, ctx.currentTime + 0.1);
    gain2.gain.setValueAtTime(0.18, ctx.currentTime + 0.1);
    gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(ctx.currentTime + 0.1);
    osc2.stop(ctx.currentTime + 0.5);
  } catch (err) {
    // Autoplay policy fallback
  }
}

async function triggerBrowserNotification(data) {
  // 1. Play sound chime
  playNotificationSound();

  if (!('Notification' in window)) {
    console.warn('[NOTIF] Desktop Notifications are not supported in this browser.');
    return;
  }

  if (Notification.permission !== 'granted') {
    console.warn('[NOTIF] Cannot show native popup: Notification.permission is', Notification.permission);
    return;
  }

  const title = data.title || '🔔 New Notification';
  const bodyText = `${data.sender ? data.sender + ': ' : ''}${data.message}`;

  // Safe options for Windows Toast Notifications (PNG icon only, no SVGs)
  const options = {
    body: bodyText,
    icon: '/icon.png',
    badge: '/icon.png',
    tag: data.id || 'pc_poc_' + Date.now(),
    requireInteraction: true,
    renotify: true,
    silent: false
  };

  // Method 1: Try Service Worker showNotification (Windows Action Center integration)
  if ('serviceWorker' in navigator) {
    try {
      const reg = await navigator.serviceWorker.ready;
      if (reg && reg.showNotification) {
        await reg.showNotification(title, options);
        console.log('[NOTIF] ✓ Displayed via ServiceWorker.showNotification');
        return;
      }
    } catch (swErr) {
      console.warn('[NOTIF] ServiceWorker showNotification failed:', swErr);
    }
  }

  // Method 2: Standard Notification constructor fallback
  try {
    const notif = new Notification(title, {
      body: bodyText,
      icon: '/icon.png'
    });
    notif.onclick = () => {
      window.focus();
      notif.close();
    };
    console.log('[NOTIF] ✓ Displayed via Notification constructor');
  } catch (err) {
    console.error('[NOTIF] Error creating Notification constructor:', err);
    // Extreme fallback: no options
    try {
      new Notification(title, { body: bodyText });
    } catch (e) {}
  }
}

// Clear List Action
clearListBtn.addEventListener('click', () => {
  notificationsList.innerHTML = '';
  if (emptyState) {
    emptyState.style.display = 'block';
    notificationsList.appendChild(emptyState);
  }
});

// Helper: Alert banner
function showAlertBanner(msg, type = 'warning') {
  alertBannerEl.className = `alert-banner ${type}`;
  alertBannerEl.textContent = msg;
  alertBannerEl.classList.remove('hidden');
}

function hideAlertBanner() {
  alertBannerEl.classList.add('hidden');
}

// Helper: Escape HTML
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Check notification permission on page load
updatePermissionStatus();
