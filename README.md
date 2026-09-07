# PC-to-PC Real-Time Notification POC

A standalone Proof of Concept (POC) demonstrating real-time browser notifications between **two physical PCs** over a local network using **Node.js, Express, Socket.IO, and HTTPS**.

---

## 🎯 Architecture & Data Flow

```text
┌─────────────────────────────────┐
│              PC A               │
│        (Sender Device)          │
│   [ ⚡ Send Notification ]       │
└────────────────┬────────────────┘
                 │
                 │ 1. HTTPS Socket.IO emit: 'send-notification'
                 ▼
┌─────────────────────────────────┐
│          HTTPS Server           │
│        (Node.js / Express)      │
│     Socket.IO Event Broadcast   │
└────────────────┬────────────────┘
                 │
                 │ 2. Broadcasts: 'notification'
                 ▼
┌─────────────────────────────────┐
│              PC B               │
│       (Receiver Device)         │
│  🔔 Desktop Browser Alert       │
│  + Real-time In-Page Card       │
└─────────────────────────────────┘
```

---

## 📁 Project Structure

```text
notification-poc/
│
├── server.js               # Node.js HTTPS server & Socket.IO event handler
├── package.json            # Project dependencies & scripts
├── generate-cert.js        # Automatic SSL certificate generation tool
│
├── cert/                   # SSL/TLS Certificate Directory
│   ├── server.key          # Private Key
│   └── server.crt          # Self-Signed Certificate with SANs
│
└── public/                 # Client Frontend (Vanilla HTML, CSS, JS)
    ├── index.html          # Unified UI (Sender & Receiver sections)
    ├── style.css           # Modern dark-mode UI stylesheet
    └── app.js              # Socket.IO connection & Notification API logic
```

---

## ⚙️ Prerequisites

- **Node.js** (v16+ or v18+ recommended) installed on **PC A** (the host PC).
- **Two physical PCs** (PC A and PC B) connected to the **same Wi-Fi or Local Area Network (LAN)**.
- Modern web browser on both machines (Google Chrome, Microsoft Edge, Mozilla Firefox, or Brave).

---

## 🚀 Quick Start Guide

### 1. Install Dependencies (on PC A)

Open PowerShell or Command Prompt in the project folder:

```powershell
npm install
```

### 2. Generate SSL Certificate (on PC A)

The Web Notification API requires a **Secure Context (HTTPS)** when accessed over an IP address.

Generate the local certificate with Subject Alternative Names (SANs) for all network adapters:

```powershell
npm run generate-cert
```

> *This creates `cert/server.key` and `cert/server.crt` automatically.*

### 3. Start the Server (on PC A)

```powershell
npm start
```

You will see output similar to:

```text
========================================================
🚀 PC-to-PC Notification POC Server is Running (HTTPS)!
========================================================

💻 Local Machine (PC A):
   👉 https://localhost:3000

🌐 Remote Machine (PC B on same Wi-Fi / Local Network):
   👉 https://192.168.1.100:3000  (Wi-Fi)
========================================================
```

---

## 🛡️ Windows Firewall Configuration (Crucial for PC B)

If PC B cannot load the page, Windows Firewall on PC A is likely blocking incoming connections on port 3000.

### Allow Port 3000 via PowerShell (Run as Administrator on PC A):

```powershell
New-NetFirewallRule -DisplayName "Notification POC Port 3000" -Direction Inbound -LocalPort 3000 -Protocol TCP -Action Allow
```

### Alternative: Windows Defender Firewall GUI
1. Open **Windows Defender Firewall with Advanced Security**.
2. Click **Inbound Rules** &rarr; **New Rule...**
3. Select **Port** &rarr; Next &rarr; Specific local ports: `3000` &rarr; Next.
4. Select **Allow the connection** &rarr; Next &rarr; Apply to **Domain, Private, Public** &rarr; Name: `Node POC 3000` &rarr; Finish.

---

## 🧪 Testing with Two Physical PCs (Step-by-Step)

### Step 1: Open on PC A (Host / Sender)
1. On PC A, open Chrome or Edge and navigate to:
   ```text
   https://localhost:3000
   ```
2. If prompted with a self-signed certificate warning (*"Your connection isn't private"*):
   - Click **Advanced** &rarr; Click **Proceed to localhost (unsafe)**.
3. Check the top status bar:
   - `● Connected` (Green dot)

---

### Step 2: Open on PC B (Remote / Receiver)
1. Ensure PC B is on the **same Wi-Fi / LAN network** as PC A.
2. Open Chrome or Edge on PC B and navigate to PC A's LAN IP:
   ```text
   https://<PC_A_IP>:3000
   ```
   *(Example: `https://192.168.1.100:3000`)*
3. Bypass the self-signed certificate warning:
   - Click **Advanced** &rarr; Click **Proceed to 192.168.1.100 (unsafe)**.
4. Verify connection status:
   - `● Connected` (Green dot)
5. In the top status bar, click **`🔔 Enable Notifications`**.
6. When the browser prompt appears, click **Allow**.
   - The badge will update to `Permission: Granted`.

---

### Step 3: Trigger the Notification Test
1. On **PC A**:
   - In the **Send Notification** section, type a message or use default:
     ```text
     Hello! This notification was sent from another PC.
     ```
   - Click **⚡ Send Notification**.

2. On **PC B**:
   - **Immediately** (without refreshing the page):
     - A native **desktop notification popup** will appear in the bottom-right corner of Windows:
       ```text
       🔔 New Notification
       PC A: Hello! This notification was sent from another PC.
       ```
     - A new card will appear in the **Received Notifications** list with the timestamp and sender information.

---

## 📡 Socket.IO Event Reference

| Event Name | Direction | Payload Structure | Description |
|---|---|---|---|
| `send-notification` | Client &rarr; Server | `{ message: string, sender: string }` | Emitted when user clicks Send on PC A |
| `notification` | Server &rarr; All Clients | `{ id: string, title: string, message: string, sender: string, timestamp: string }` | Broadcasted by server to trigger desktop alerts & UI cards |

---

## 🔍 Server Console Logs

When executing actions, `server.js` outputs clear diagnostic logs:

```text
Client connected: mG8ZtY4e1O7K...
Client connected: pX9AwQ2e5L3M...
Notification received from: mG8ZtY4e1O7K...
Notification broadcast successfully
Client disconnected: pX9AwQ2e5L3M...
```

---

## 🛠️ Troubleshooting

| Issue | Cause | Solution |
|---|---|---|
| **PC B says "This site can't be reached"** | Windows Firewall blocking port 3000 | Run the PowerShell firewall command on PC A (see Firewall section above). |
| **PC B cannot ping PC A** | Wi-Fi Router has "AP Isolation" or "Guest Mode" enabled | Connect both PCs to the main Wi-Fi network (or a mobile hotspot) where device-to-device communication is allowed. |
| **Notification permission denied on PC B** | User accidentally clicked "Block" | Click the lock/tune icon next to the URL in PC B's browser address bar &rarr; Reset "Notifications" to **Allow** &rarr; Reload. |
| **Notification doesn't pop up on Windows desktop** | Windows "Do Not Disturb" / Focus Assist is active | Check Windows Action Center (bottom right corner) and turn off **Focus Assist** or **Do Not Disturb**. |

---

## ✅ Acceptance Criteria Checklist

- [x] Completely standalone POC (No .NET, React, or DB dependencies).
- [x] HTTPS server running with valid SANs certificates.
- [x] PC A and PC B connect via Socket.IO simultaneously.
- [x] Shows real-time connection status (`● Connected` / `● Disconnected`).
- [x] PC B can grant browser notification permission.
- [x] PC A sends message with `send-notification`.
- [x] Server broadcasts `notification` event.
- [x] PC B displays desktop alert via `Notification API` and appends card to page.
- [x] No page refresh required.
