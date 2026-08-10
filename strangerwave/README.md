# 🌊 StrangerWave

Real-time stranger chat with text and video. Built with Node.js, Socket.io, and WebRTC.

---

## What's Inside

```
strangerwave/
├── server/
│   └── index.js          ← Node.js + Socket.io signaling server
├── public/
│   └── index.html        ← Full frontend (HTML + CSS + JS)
├── package.json
└── README.md
```

---

## How It Works

1. User opens the site and clicks Text or Video
2. Browser connects to your server via WebSocket (Socket.io)
3. Server puts them in a waiting queue
4. When two people are waiting, server pairs them into a room
5. For video: WebRTC peer-to-peer connection is established (video goes directly browser-to-browser, NOT through your server)
6. For text: messages go through your server (Socket.io)
7. Skip or disconnect cleans up the room and re-queues

---

## Run Locally (Test on Your Machine)

### Requirements
- Node.js 18+ (download from nodejs.org)

### Steps

```bash
# 1. Install dependencies
npm install

# 2. Start the server
npm start

# 3. Open your browser
# Go to: http://localhost:3000

# To test with two people locally:
# Open two browser tabs at http://localhost:3000
# One in normal mode, one in Incognito
# Click the same mode (text or text) in both
# They will connect to each other
```

For development with auto-restart:
```bash
npm run dev
```

---

## Deploy Free on Railway (Recommended — Easiest)

Railway gives you a free server that runs 24/7. Takes about 5 minutes.

### Step 1 — Create accounts
- Go to railway.app and sign up (free)
- Go to github.com and sign up (free)

### Step 2 — Push your code to GitHub

```bash
# In your strangerwave folder:
git init
git add .
git commit -m "first commit"

# Create a new repo on github.com (click + → New repository)
# Then run (replace YOUR_USERNAME and YOUR_REPO):
git remote add origin https://github.com/YOUR_USERNAME/strangerwave.git
git push -u origin main
```

### Step 3 — Deploy on Railway

1. Go to railway.app → New Project
2. Click "Deploy from GitHub repo"
3. Select your strangerwave repo
4. Railway auto-detects Node.js and deploys
5. Click "Generate Domain" → you get a free URL like `strangerwave.up.railway.app`
6. Done! Share that URL with anyone

**Railway free tier:** 500 hours/month (enough for testing and early users)

---

## Deploy Free on Render

Another great free option.

1. Go to render.com → New → Web Service
2. Connect your GitHub repo
3. Set:
   - Build Command: `npm install`
   - Start Command: `npm start`
   - Environment: Node
4. Click Deploy
5. Get your free URL like `strangerwave.onrender.com`

**Note:** Render free tier sleeps after 15 min of inactivity (first load is slow). Upgrade to $7/month to keep it awake.

---

## Deploy on a VPS (Best for Real Traffic)

When you have real users, use a VPS. Cheapest options:

| Provider | Price | Good for |
|----------|-------|----------|
| Hetzner | $4/month | Best value, European servers |
| DigitalOcean | $6/month | Easy interface |
| Vultr | $5/month | Global locations |

### VPS Setup (Ubuntu 22.04)

```bash
# SSH into your server
ssh root@YOUR_SERVER_IP

# Install Node.js
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Install PM2 (keeps app running forever)
npm install -g pm2

# Upload your code (from your local machine):
# scp -r ./strangerwave root@YOUR_SERVER_IP:/home/strangerwave

# On the server — go to app folder
cd /home/strangerwave

# Install dependencies
npm install

# Start with PM2
pm2 start server/index.js --name strangerwave
pm2 save
pm2 startup

# App now runs forever, even after server restart
```

### Add a Domain + HTTPS (Free with Nginx + Certbot)

```bash
# Install Nginx
sudo apt install nginx

# Install Certbot (free SSL)
sudo apt install certbot python3-certbot-nginx

# Create Nginx config
sudo nano /etc/nginx/sites-available/strangerwave
```

Paste this (replace yourdomain.com):

```nginx
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

```bash
# Enable config
sudo ln -s /etc/nginx/sites-available/strangerwave /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx

# Get free SSL certificate
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com

# Done! Your site now runs at https://yourdomain.com
```

---

## Add TURN Server (Makes Video More Reliable)

Without a TURN server, about 15-20% of video connections fail (users behind strict firewalls).

### Free Option: Metered.ca

1. Go to metered.ca → sign up free
2. Create a TURN server → get credentials
3. Open `public/index.html`
4. Find the `ICE` config at the top of the script:

```javascript
const ICE = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    // ADD THESE:
    {
      urls: 'turn:your-turn.metered.ca:80',
      username: 'YOUR_USERNAME',
      credential: 'YOUR_CREDENTIAL'
    },
    {
      urls: 'turn:your-turn.metered.ca:443',
      username: 'YOUR_USERNAME',
      credential: 'YOUR_CREDENTIAL'
    }
  ]
};
```

Metered free tier: 50GB/month bandwidth — good for your first few hundred users.

---

## Environment Variables

You can configure the server with these env variables:

| Variable | Default | Description |
|----------|---------|-------------|
| PORT | 3000 | Server port |
| NODE_ENV | development | Set to `production` on live server |

On Railway/Render, set these in the dashboard under "Environment".

---

## Scaling Up

When you start getting real traffic:

| Users | What to do |
|-------|-----------|
| 0–1,000 | Free Railway/Render is fine |
| 1,000–10,000 | $4–6/month VPS + PM2 |
| 10,000–100,000 | Bigger VPS ($20–40/month) + Redis for queue |
| 100,000+ | Multiple servers + load balancer + Redis cluster |

For the queue system at scale, replace the in-memory arrays in `server/index.js` with Redis using the `ioredis` package. The socket events and frontend stay exactly the same.

---

## What to Build Next

- [ ] Report/block button for bad users
- [ ] Country flag display (use IP geolocation)
- [ ] Mobile app (React Native reusing same Socket.io server)
- [ ] Premium membership (Stripe integration)
- [ ] Interest-based rooms (not just chips, but dedicated rooms)
- [ ] Text filters for spam/abuse (bad-words npm package)
- [ ] Admin dashboard (see live rooms, ban users)

---

## Questions?

The server logs everything to console. Watch logs with:
```bash
# PM2 logs
pm2 logs strangerwave

# Railway/Render: check the Logs tab in dashboard
```
