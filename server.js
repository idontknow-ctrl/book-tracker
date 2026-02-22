const express = require('express')
const path = require('path')
const fs = require('fs').promises
const cors = require('cors')
const bodyParser = require('body-parser')
const crypto = require('crypto')
const { Pool } = require('pg')
require('dotenv').config()

const PORT = process.env.PORT || 3000
const DATA_FILE = path.join(__dirname, 'data.json')

// Admin credentials from environment or defaults
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin'
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123'
const ADMIN_SECRET = process.env.ADMIN_SECRET || 'super-secret-key'

// Simple token storage (in production, use Redis or DB)
const validTokens = new Set()

function generateToken(){
  return crypto.randomBytes(32).toString('hex')
}

function verifyToken(token){
  return validTokens.has(token)
}

const app = express()
app.use(cors())
app.use(express.json())
app.use(express.urlencoded({ extended: true }))
app.use(express.static(path.join(__dirname)))

// Postgres pool (optional). If DATABASE_URL not set, fall back to file storage
const pool = process.env.DATABASE_URL ? new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false }) : null

async function initDb(){
  if(!pool) return
  await pool.query(`
    CREATE TABLE IF NOT EXISTS entries (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
        discord TEXT,
        author TEXT,
        book TEXT NOT NULL,
        pages INTEGER NOT NULL,
        team TEXT NOT NULL,
        platform TEXT NOT NULL,
      created TIMESTAMPTZ NOT NULL DEFAULT now(),
      edited_at TIMESTAMPTZ,
      completion_date DATE,
      favorite_scene TEXT,
      status TEXT DEFAULT 'active'
    )
  `)
}

async function readData(){
  if(pool){
    const r = await pool.query('SELECT id, name, discord, author, book, pages, team, platform, created, edited_at, completion_date, favorite_scene, status FROM entries ORDER BY created ASC')
    return r.rows
  }
  try{
    const raw = await fs.readFile(DATA_FILE, 'utf8')
    return JSON.parse(raw || '[]')
  }catch(err){
    if(err.code === 'ENOENT') return []
    throw err
  }
}

async function writeData(data){
  if(pool){
    // writeData used only for file fallback; when using Postgres we don't use this
    throw new Error('writeData should not be used when Postgres is enabled')
  }
  await fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2), 'utf8')
}

app.get('/api/ping', (req,res)=> res.json({ok:true}))

// Admin authentication endpoints
app.post('/api/admin/login', (req,res)=>{
  const { username, password } = req.body
  if(username === ADMIN_USERNAME && password === ADMIN_PASSWORD){
    const token = generateToken()
    validTokens.add(token)
    // Token expires in 24 hours
    setTimeout(() => validTokens.delete(token), 24 * 60 * 60 * 1000)
    return res.json({ ok: true, token })
  }
  res.status(401).json({ error: 'Invalid credentials' })
})

app.post('/api/admin/verify', (req,res)=>{
  const { token } = req.body
  if(verifyToken(token)){
    return res.json({ ok: true })
  }
  res.status(401).json({ error: 'Invalid token' })
})

app.get('/api/entries', async (req,res)=>{
  const data = await readData()
  res.json(data)
})

app.post('/api/entries', async (req,res)=>{
  const entry = req.body
  if(!entry || !entry.name || !entry.book || !entry.team || !entry.pages || !entry.platform){
    return res.status(400).json({error:'Missing required fields'})
  }
  // If platform is discord, discord name is required
  if(entry.platform === 'discord' && !entry.discord) return res.status(400).json({error:'Discord name required for Discord platform'})
  
  // Check for duplicate book in the same team (only check active records)
  const data = await readData()
  const isDuplicate = data.some(e => e.book.toLowerCase() === entry.book.toLowerCase() && e.team === entry.team && e.status !== 'deleted')
  if(isDuplicate) return res.status(400).json({error:'Duplicate Record, Book Already logged'})
  
  if(pool){
    const created = new Date().toISOString()
    const r = await pool.query(
      'INSERT INTO entries (name, discord, author, book, pages, team, platform, created, completion_date, favorite_scene, status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id, name, discord, author, book, pages, team, platform, created, edited_at, completion_date, favorite_scene, status',
      [entry.name, entry.discord || null, entry.author || null, entry.book, entry.pages, entry.team, entry.platform, created, entry.completionDate || null, entry.favoriteScene || null, 'active']
    )
    return res.json(r.rows[0])
  }
  const saved = Object.assign({}, entry, { id: Date.now() + Math.random(), created: new Date().toISOString(), status: 'active' })
  data.push(saved)
  await writeData(data)
  res.json(saved)
})

// Update a single entry
app.put('/api/entries/:id', async (req,res)=>{
  const id = req.params.id
  const entry = req.body
  if(!entry) return res.status(400).json({error:'Missing body'})
  if(pool){
    const editedAt = new Date().toISOString()
    const r = await pool.query(
      'UPDATE entries SET name=$1, discord=$2, author=$3, book=$4, pages=$5, team=$6, platform=$7, completion_date=$8, favorite_scene=$9, edited_at=$10, status=$11 WHERE id=$12 RETURNING id, name, discord, author, book, pages, team, platform, created, edited_at, completion_date, favorite_scene, status',
      [entry.name, entry.discord || null, entry.author || null, entry.book, entry.pages, entry.team, entry.platform || 'discord', entry.completionDate || null, entry.favoriteScene || null, editedAt, 'active', id]
    )
    if(r.rowCount===0) return res.status(404).json({error:'Not found'})
    return res.json(r.rows[0])
  }
  const data = await readData()
  const idx = data.findIndex(e => String(e.id) === String(id))
  if(idx === -1) return res.status(404).json({error:'Not found'})
  const updatedEntry = Object.assign({}, data[idx], entry, { edited_at: new Date().toISOString(), status: 'active' })
  data[idx] = updatedEntry
  await writeData(data)
  res.json(data[idx])
})

// Teams management (simple file-backed list)
const TEAMS_FILE = path.join(__dirname, 'teams.json')
async function readTeams(){
  try{
    const raw = await fs.readFile(TEAMS_FILE, 'utf8')
    return JSON.parse(raw || '[]')
  }catch(err){
    if(err.code === 'ENOENT') return [{name:'Team A',platform:'facebook'},{name:'Team B',platform:'discord'}]
    throw err
  }
}
async function writeTeams(teams){
  await fs.writeFile(TEAMS_FILE, JSON.stringify(teams, null, 2), 'utf8')
}

// Auth middleware - verify token in Authorization header or request body
function requireAuth(req, res, next){
  const token = req.headers.authorization?.replace('Bearer ', '') || req.body?.token
  if(!verifyToken(token)){
    return res.status(401).json({error: 'Unauthorized. Please login first.'})
  }
  next()
}

// Login endpoint
app.post('/api/login', (req,res)=>{
  console.log('Login request received:', {body: req.body, headers: req.headers['content-type']})
  const { username, password } = req.body
  if(!username || !password){
    console.log('Missing credentials:', {username: !!username, password: !!password})
    return res.status(400).json({error: 'Missing username or password'})
  }
  console.log('Checking credentials for user:', username)
  if(username === ADMIN_USERNAME && password === ADMIN_PASSWORD){
    const token = generateToken()
    validTokens.add(token)
    console.log('Login successful for:', username)
    return res.json({ok: true, token, message: 'Logged in successfully'})
  }
  console.log('Invalid credentials for user:', username)
  res.status(401).json({error: 'Invalid credentials'})
})

// Logout endpoint
app.post('/api/logout', (req,res)=>{
  const token = req.headers.authorization?.replace('Bearer ', '') || req.body?.token
  if(token) validTokens.delete(token)
  res.json({ok: true, message: 'Logged out'})
})

app.get('/api/teams', async (req,res)=>{
  const teams = await readTeams()
  res.json(teams)
})

app.post('/api/teams', requireAuth, async (req,res)=>{
  const name = (req.body && req.body.name || '').trim()
  const platform = (req.body && req.body.platform || '').trim()
  if(!name) return res.status(400).json({error:'Missing name'})
  if(!platform || !['facebook','discord'].includes(platform)) return res.status(400).json({error:'Invalid platform'})
  const teams = await readTeams()
  if(teams.find(t => t.name === name)) return res.status(400).json({error:'Already exists'})
  teams.push({name, platform})
  await writeTeams(teams)
  res.json({ok:true, teams})
})

app.put('/api/teams/:name', requireAuth, async (req,res)=>{
  const oldName = req.params.name
  const newName = (req.body && req.body.name || '').trim()
  const platform = (req.body && req.body.platform || '').trim()
  if(!newName) return res.status(400).json({error:'Missing name'})
  if(!platform || !['facebook','discord'].includes(platform)) return res.status(400).json({error:'Invalid platform'})
  const teams = await readTeams()
  const idx = teams.findIndex(t => t.name === oldName)
  if(idx === -1) return res.status(404).json({error:'Team not found'})
  if(newName !== oldName && teams.find(t => t.name === newName)) return res.status(400).json({error:'Name already exists'})
  teams[idx] = {name: newName, platform}
  await writeTeams(teams)
  res.json({ok:true, teams})
})

app.delete('/api/teams/:name', requireAuth, async (req,res)=>{
  const name = req.params.name
  const teams = await readTeams()
  const filtered = teams.filter(t => t.name !== name)
  if(filtered.length === teams.length) return res.status(404).json({error:'Team not found'})
  await writeTeams(filtered)
  res.json({ok:true, teams: filtered})
})

// Delete single entry - mark as deleted instead of removing
app.delete('/api/entries/:id', async (req,res)=>{
  const id = req.params.id
  if(pool){
    const deletedAt = new Date().toISOString()
    const r = await pool.query('UPDATE entries SET status=$1, edited_at=$2 WHERE id=$3 RETURNING id', [
      'deleted', deletedAt, id
    ])
    return res.json({ok: true, archived: r.rowCount})
  }
  const data = await readData()
  const idx = data.findIndex(e => String(e.id) === String(id))
  if(idx === -1) return res.status(404).json({error:'Not found'})
  data[idx] = Object.assign({}, data[idx], { status: 'deleted', edited_at: new Date().toISOString() })
  await writeData(data)
  res.json({ok:true})
})

// Admin: clear all entries
app.delete('/api/entries', requireAuth, async (req,res)=>{
  const platform = req.query.platform
  if(pool){
    if(platform && ['facebook','discord'].includes(platform)){
      await pool.query('DELETE FROM entries WHERE platform=$1', [platform])
    }else{
      await pool.query('TRUNCATE entries')
    }
    return res.json({ok:true})
  }
  const data = await readData()
  if(platform && ['facebook','discord'].includes(platform)){
    const filtered = data.filter(e => e.platform !== platform)
    await writeData(filtered)
  }else{
    await writeData([])
  }
  res.json({ok:true})
})

// Export CSV - includes archived records for admin visibility
app.get('/api/export', requireAuth, async (req,res)=>{
  let data = await readData()
  const team = req.query.team
  
  // Filter by team if specified
  if(team && team !== 'all'){
    data = data.filter(e => e.team === team)
  }
  
  // Sort active records first, then archived
  const active = data.filter(e => e.status === 'active' || !e.status)
  const archived = data.filter(e => e.status === 'edited' || e.status === 'deleted')
  const sortedData = [...active, ...archived]
  
  const header = ['Name','Discord','Author','Book','Pages','Team','Platform','Completion Date','Favorite Scene','Date Added','Last Edited','Status']
  const rows = sortedData.map(e => [e.name,e.discord || '', e.author || '', e.book,e.pages,e.team,e.platform || '', e.completion_date || e.completionDate || '', e.favorite_scene || e.favoriteScene || '', e.created || '', e.edited_at || '', e.status || 'active'])
  const csv = [header, ...rows].map(r => r.map(c => '"'+String(c).replace(/"/g,'""')+'"').join(',')).join('\n')
  const filename = team && team !== 'all' ? `book-tracker-${team.replace(/\s+/g,'-')}.csv` : 'book-tracker-entries.csv'
  res.setHeader('Content-Type','text/csv')
  res.setHeader('Content-Disposition',`attachment; filename="${filename}"`)
  res.send(csv)
})

initDb().then(()=>{
  app.listen(PORT, ()=>{
    console.log(`Book Tracker API listening on http://localhost:${PORT}`)
  })
}).catch(err=>{
  console.error('Failed to initialize DB:', err)
  process.exit(1)
})
