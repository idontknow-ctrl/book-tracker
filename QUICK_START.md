# Book Tracker - Quick Start Guide

## Local Development

### 1. Clone/Open Project
```bash
cd c:\Users\Administrator\App\book-tracker
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Start Server
```bash
npm start
```
Server runs on http://localhost:3000

### 4. Open in Browser
- Navigate to http://localhost:3000
- You'll see the form to log books
- Click "Admin" button to access admin features

## Default Login (Testing Only)
```
Username: admin
Password: admin123
```

⚠️ Change credentials before production deployment!

## Key Features

### For Team Members
✅ Log books read with:
- Reader name, team, platform (Facebook/Discord)
- Book title, author, pages  
- Completion date, favorite scene (required, 20+ chars)
- Timestamps track when record was created/edited

✅ View team statistics
✅ View personal reading history

### For Admin
🔐 **Login required** for:
- Team management (add/edit/delete)
- CSV export with full audit trail

🔓 CSV includes:
- All user entries plus deleted/edited records
- Completion dates, favorite scenes, timestamps
- Status indicators (active/deleted/edited)

## Workflow

1. **Team Members:**
   - Fill form with book information
   - Submit entry
   - Entry appears in team reports

2. **Admin (End of Competition):**
   - Click "Admin" button
   - Login with admin credentials
   - Download CSV export
   - CSV shows all records including deleted ones

## Environment Variables

### Create `.env` file with:

```bash
# For local testing:
NODE_ENV=development
ADMIN_USERNAME=admin
ADMIN_PASSWORD=admin123

# For production:
NODE_ENV=production
ADMIN_USERNAME=admin
ADMIN_PASSWORD=your-very-secure-password
PORT=3000
```

## Deployment

When ready for production:
1. See [DEPLOYMENT.md](DEPLOYMENT.md) for hosting options
2. Set strong admin password in environment variables
3. Follow deployment checklist

## Documentation Files

- **ADMIN_SETUP.md** - Complete admin features & security documentation
- **DEPLOYMENT.md** - Production deployment to Render, Railway, or self-hosted
- **README.md** - Original project documentation (if exists)

## File Structure

```
book-tracker/
  ├── server.js           # Express API with auth
  ├── app.js              # Frontend JavaScript (1000+ lines, all features)
  ├── index.html          # Form with login modal
  ├── styles.css          # Styling
  ├── data.json           # Local data storage
  ├── package.json        # Dependencies
  ├── .env.example        # Environment template
  ├── ADMIN_SETUP.md      # Admin & security docs
  ├── DEPLOYMENT.md       # Production deployment
  └── assets/             # Images (Facebook, Discord badge)
```

## Common Tasks

### Change Admin Password
1. Stop server (Ctrl+C)
2. Edit `.env` file
3. Change `ADMIN_PASSWORD` to new password
4. Restart server: `npm start`

### Add New Team
1. Login as admin
2. Scroll to Teams section
3. Enter team name, select platform
4. Click "Add Team"

### Award a Book to Wrong Team by Mistake
1. Login as admin
2. Download CSV
3. Original entry marked as "deleted" in CSV
4. Submit correct entry if needed

### Local User Testing
1. Have multiple people access http://localhost:3000
2. Each fills form as different user
3. All entries appear in team reports
4. Admin can see all in CSV export

## Troubleshooting

### "Port 3000 already in use"
```bash
# Find and kill existing process
Get-Process -Name node | Stop-Process -Force
npm start
```

### "Admin login required" error
1. Click "Admin" button
2. Login with credentials from .env
3. Try action again

### CSV export not downloading
1. Check if you're logged in as admin
2. Try different team filter
3. Check browser console for errors

### Teams management not appearing
- Backend must be running (`npm start`)
- Must be logged in as admin

## Support

For detailed information:
- Read ADMIN_SETUP.md for security details
- Read DEPLOYMENT.md for production setup
- Check GitHub repo (if available)

---

**Version:** 1.0
**Last Updated:** February 2026
