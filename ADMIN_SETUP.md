# Admin Features & Security Setup

## Overview

The Book Tracker now includes admin authentication for managing teams and exporting CSV data with full audit trails (including deleted/edited records).

## Default Admin Credentials (LOCAL TESTING)

```
Username: admin
Password: admin123
```

⚠️ **IMPORTANT**: Change these credentials before deploying to production!

## Admin Features

### 1. Admin Login
- Click the "Admin" button in the top-right corner
- Enter admin credentials
- Token is stored for the current browser session
- Clicking "Admin" button again shows "Logout" when logged in

### 2. Team Management (Admin Only)
Protected endpoints:
- POST `/api/teams` - Add new team
- PUT `/api/teams/:name` - Edit team
- DELETE `/api/teams/:name` - Delete team

**Requires:** Admin login

### 3. CSV Export with Full Audit Trail (Admin Only)
Protected endpoint:
- GET `/api/export?team=TeamName` - Download CSV

**Features:**
- 12 columns: Name, Discord, Author, Book, Pages, Team, Platform, Completion Date, Favorite Scene, Date Added, Last Edited, Status
- Shows active records first, then archived (deleted/edited)
- Includes records with status: 'active', 'deleted', 'edited'
- Timestamps show when records were created and last modified
- Admin-only view of complete record history

**Requires:** Admin login

### 4. Entry Management (Team Members)
Not protected - team members can:
- POST `/api/entries` - Create new entry
- PUT `/api/entries/:id` - Edit their entry (updates edited_at timestamp)
- DELETE `/api/entries/:id` - Delete entry (archives with status='deleted')

## Security Features

### Authentication Flow
1. User submits username/password to `/api/login`
2. Server validates against ADMIN_USERNAME and ADMIN_PASSWORD
3. Server generates random 64-character hex token
4. Token stored in-memory on server and in browser sessionStorage
5. All protected API calls include token in Authorization header: `Bearer {token}`
6. Token expires when browser session ends or user logs out

### Protected Resources
```javascript
// Middleware checks token on every request
function requireAuth(req, res, next){
  const token = req.headers.authorization?.replace('Bearer ', '')
  if(!verifyToken(token)) return res.status(401).json({error: 'Unauthorized'})
  next()
}
```

### What Stays Public
- Reading entry submission (POST `/api/entries`)
- Viewing entry lists and reports (filtered by team)
- Team dropdown for form (GET `/api/teams`)

## Configuration

### Environment Variables

Create `.env` file in project root:
```
NODE_ENV=production
PORT=3000
ADMIN_USERNAME=admin
ADMIN_PASSWORD=your-very-secure-password-here
DATABASE_URL=postgresql://...  # Optional
```

### For Local Testing
Create `.env`:
```
NODE_ENV=development
ADMIN_USERNAME=admin
ADMIN_PASSWORD=admin123
```

Then start with: `npm start`

### For Production
1. Copy `.env.example` to `.env`
2. Change ADMIN_PASSWORD to strong password (16+ chars, mix of upper/lower/numbers/symbols)
3. Optionally change ADMIN_USERNAME
4. Set NODE_ENV=production
5. Commit ONLY .env.example to git (never .env)

## Testing Admin Features

### Test 1: Login
1. Open app in browser
2. Click "Admin" button
3. Enter: username=`admin`, password=`admin123`
4. Should see success message
5. Admin button changes to "Logout"

### Test 2: Team Management
1. Login as admin
2. A "Teams" section should appear (if backend enabled)
3. Try adding/editing/deleting a team
4. Logout and refresh - teams section disappears

### Test 3: CSV Export
1. Login as admin
2. Fill in form with sample entry and submit
3. Go to Reports section
4. Click "Download CSV"
5. Should download file with full audit trail columns

### Test 4: Authorization Check
1. Without logging in, click "Download CSV"
2. Should see error: "Admin login required to export CSV"
3. Try team management without login
4. Should see error: "Admin login required to manage teams"

## API Endpoints

### Authentication
```
POST /api/login
  Body: {username, password}
  Response: {ok: true/false, token: "...", error?: "..."}

POST /api/logout
  Headers: Authorization: Bearer <token>
  Response: {ok: true}
```

### Protected Team Management
```
POST /api/teams
  Headers: Authorization: Bearer <token>
  Body: {name, platform}
  Response: {ok: true, teams: [...]}

PUT /api/teams/:name
  Headers: Authorization: Bearer <token>
  Body: {name, platform}
  Response: {ok: true, teams: [...]}

DELETE /api/teams/:name
  Headers: Authorization: Bearer <token>
  Response: {ok: true, teams: [...]}
```

### Protected CSV Export
```
GET /api/export?team=TeamName
  Headers: Authorization: Bearer <token>
  Response: CSV file download
```

### Public Entry Management
```
POST /api/entries
  Body: {name, discord, author, book, pages, team, platform, completionDate, favoriteScene}
  Response: {ok: true, entry: {...}}

PUT /api/entries/:id
  Body: {...updated fields...}
  Response: {ok: true, entry: {...}}

DELETE /api/entries/:id
  Response: {ok: true, archived: true}
```

## Deployment

See [DEPLOYMENT.md](DEPLOYMENT.md) for production deployment instructions.

## Session Management

- **Session Storage**: Browser sessionStorage (expires on browser close)
- **Server Storage**: In-memory Set (resets on server restart)
- **Token Format**: 64-character hex string
- **Token Lifetime**: Until logout or browser close

## Notes

- Tokens are NOT persistent across server restarts
- If server restarts, users need to login again
- Consider adding database-backed sessions for production
- For high-traffic production, consider Redis for token storage

