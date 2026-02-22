# Production Deployment Guide

This guide covers deploying the Book Tracker app to free hosting services.

## Option 1: Render.com (Recommended for Node.js)

Render offers a free tier with good performance for Node.js apps.

### Steps:

1. **Create Render Account**
   - Go to [render.com](https://render.com)
   - Sign up with GitHub or email

2. **Push to GitHub**
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin https://github.com/yourusername/book-tracker.git
   git push -u origin main
   ```

3. **Connect to Render**
   - Log in to Render dashboard
   - Click "New +" → "Web Service"
   - Connect your GitHub repository
   - Select the book-tracker repository

4. **Configure Service**
   - **Name:** book-tracker
   - **Environment:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Plan:** Free (limited to 750 hours/month, auto-pauses if idle)

5. **Set Environment Variables**
   - Go to "Environment" tab
   - Add these variables:
     ```
     NODE_ENV = production
     ADMIN_USERNAME = your-admin-username
     ADMIN_PASSWORD = your-secure-password
     ```
   - (DATABASE_URL is optional - Render provides PostgreSQL)

6. **Deploy**
   - Click "Create Web Service"
   - Render automatically deploys on every git push
   - Your app will be available at: `https://book-tracker-xxx.onrender.com`

### Important Notes:
- Free tier auto-pauses after 15 minutes of inactivity
- First request will take 30-60 seconds to wake up
- Database: Use file-based data.json for free tier (default), or add PostgreSQL

---

## Option 2: Railway.app

Railway offers generous free tier with monthly credit.

### Steps:

1. **Create Railway Account**
   - Go to [railway.app](https://railway.app)
   - Sign up with GitHub

2. **Push to GitHub** (same as above)

3. **Connect to Railway**
   - Log in to Railway dashboard
   - Click "Create New Project"
   - Select "Deploy from GitHub repo"
   - Select book-tracker repository

4. **Configure**
   - Railway auto-detects Node.js
   - Sets start command from package.json

5. **Set Environment Variables**
   - Go to "Variables" tab
   - Add these:
     ```
     NODE_ENV=production
     ADMIN_USERNAME=your-admin-username
     ADMIN_PASSWORD=your-secure-password
     PORT=3000
     ```

6. **Deploy**
   - Push to GitHub, Railway auto-deploys
   - Your app URL: `https://book-tracker-xxx.up.railway.app`

### Important Notes:
- Free tier: $5/month credit (usually enough for hobby projects)
- Projects don't auto-pause like Render
- Better uptime for free tier

---

## Option 3: Self-Hosted (VPS)

If you have a server (DigitalOcean, Linode, AWS, etc.):

1. **SSH into server**
   ```bash
   ssh root@your-server-ip
   ```

2. **Install Node.js**
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
   sudo apt-get install -y nodejs
   ```

3. **Clone repository**
   ```bash
   git clone https://github.com/yourusername/book-tracker.git
   cd book-tracker
   npm install
   ```

4. **Create .env file**
   ```bash
   cp .env.example .env
   nano .env  # Edit with your admin credentials
   ```

5. **Use PM2 for process management**
   ```bash
   npm install -g pm2
   pm2 start server.js --name "book-tracker"
   pm2 startup
   pm2 save
   ```

6. **Setup Nginx reverse proxy**
   ```bash
   sudo apt-get install -y nginx
   # Configure nginx to proxy requests to port 3000
   ```

7. **SSL Certificate (Let's Encrypt)**
   ```bash
   sudo apt-get install certbot python3-certbot-nginx
   sudo certbot --nginx -d yourdomain.com
   ```

---

## Local Testing Before Production

1. **Create .env file locally**
   ```bash
   cp .env.example .env
   ```

2. **Update credentials in .env**
   ```
   ADMIN_USERNAME=admin
   ADMIN_PASSWORD=YourStrongPassword123
   ```

3. **Start server**
   ```bash
   npm start
   ```

4. **Test admin login**
   - Open http://localhost:3000
   - Click "Admin" button
   - Login with credentials from .env
   - Try CSV export and team management

---

## Security Best Practices

1. **Strong Admin Password**
   - Use at least 12 characters
   - Include uppercase, lowercase, numbers, symbols
   - Different from database password

2. **Environment Variables**
   - Never commit .env file to git
   - .env.example shows structure only
   - Each deployment has own .env values

3. **Database Security** (if using PostgreSQL)
   - Use strong database password
   - Restrict database access to app only
   - Regular backups

4. **HTTPS**
   - Render/Railway provide free SSL
   - Self-hosted: use Let's Encrypt certificate
   - Never transmit credentials over HTTP

5. **Monitor Logs**
   - Render/Railway: View logs in dashboard
   - Self-hosted: Check PM2 logs and nginx logs

---

## Troubleshooting

### App won't start
```bash
npm install
npm start
```

### Port already in use
- Change PORT in .env
- Or kill existing process: `lsof -ti:3000 | xargs kill -9`

### CSV export not working
- Ensure you're logged in as admin
- Check browser console for errors
- Verify ADMIN_USERNAME and ADMIN_PASSWORD are set

### Teams management says "unauthorized"
- Click Admin button and login
- Token expires on browser close (uses sessionStorage)
- Login again if needed

---

## Deployment Checklist

- [ ] Change ADMIN_PASSWORD in .env (strong password!)
- [ ] Update ADMIN_USERNAME if desired
- [ ] Test locally with new credentials
- [ ] Push to GitHub
- [ ] Set environment variables on hosting platform
- [ ] Verify app starts and is accessible
- [ ] Test admin login on production
- [ ] Test CSV export with auth
- [ ] Test team management
- [ ] Share admin credentials securely with team

---

## Getting Help

- Check logs on your hosting platform dashboard
- Render: Logs tab in service details
- Railway: Build and Deploy logs
- Self-hosted: `pm2 logs book-tracker`

