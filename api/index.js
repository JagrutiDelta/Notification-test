// In-memory store for serverless notification queue (for Vercel serverless environment)
let globalNotifications = [];

module.exports = (req, res) => {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // 1. Send notification (POST /api)
  if (req.method === 'POST') {
    let body = req.body || {};
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch(e) {}
    }

    const payload = {
      id: 'notif_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
      title: '🔔 New Notification',
      message: body.message || 'Hello! This notification was sent from another PC.',
      sender: body.sender || 'PC (Cloud)',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    };

    globalNotifications.unshift(payload);
    if (globalNotifications.length > 50) globalNotifications.pop();

    return res.status(200).json({ success: true, notification: payload });
  }

  // 2. Poll/Get notifications (GET /api)
  const since = req.query.since || 0;
  const newNotifications = globalNotifications.filter(n => {
    const ts = parseInt(n.id.split('_')[1]) || 0;
    return ts > parseInt(since);
  });

  return res.status(200).json({
    status: 'ok',
    serverTime: new Date().toISOString(),
    notifications: newNotifications
  });
};
