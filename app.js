// Book Tracker front-end with optional backend API (falls back to localStorage)
const STORAGE_KEY = 'bookTracker.entries.v1'
const NAME_KEY = 'bookTracker.savedName'
const ADMIN_TOKEN_KEY = 'bookTracker.adminToken'
const API_BASE = '/api'
let useApi = false
let isAdmin = false
let adminToken = null
let teamsList = []
let bookSearchTimeout = null

// Open Library API search
async function searchGoogleBooks(query){
  if(!query || query.length < 3) return []
  try{
    const encodedQuery = encodeURIComponent(query)
    console.log('Searching Open Library for:', query)
    const response = await fetch(`https://openlibrary.org/search.json?q=${encodedQuery}&limit=10`)
    console.log('Response status:', response.status)
    if(!response.ok) {
      console.error('Open Library API error:', response.status, response.statusText)
      return []
    }
    const data = await response.json()
    console.log('Open Library data:', data)
    if(!data.docs || data.docs.length === 0) {
      console.log('No books found')
      return []
    }
    
    const books = data.docs.map(doc => {
      // Get cover image URL
      const coverId = doc.cover_i
      const coverUrl = coverId ? `https://covers.openlibrary.org/b/id/${coverId}-M.jpg` : ''
      // Get page count from API - try multiple field names
      let pages = doc.number_of_pages_median || doc.number_of_pages || 0
      pages = parseInt(pages) || 0
      
      // Debug: log if no pages found to see what fields are available
      if(!pages) {
        console.log('Book with no pages found - available fields:', Object.keys(doc).join(', '))
      }
      
      return {
        title: doc.title || 'Unknown Title',
        authors: doc.author_name ? doc.author_name.join(', ') : 'Unknown Author',
        cover: coverUrl,
        pages: pages
      }
    })
    console.log('Processed books:', books)
    return books
  }catch(err){
    console.error('Book search error:', err)
    return []
  }
}

function showBookSuggestions(books){
  const container = document.getElementById('bookSuggestions')
  if(!container) return
  
  if(books.length === 0){
    container.innerHTML = '<div class="book-loading">No books found. You can still enter your book manually.</div>'
    container.classList.add('active')
    setTimeout(() => {
      container.classList.remove('active')
    }, 2000)
    return
  }
  
  let html = ''
  books.forEach(book => {
    const coverHtml = book.cover 
      ? `<img src="${escapeHtml(book.cover)}" alt="${escapeHtml(book.title)}" class="book-suggestion-cover">`
      : `<div class="book-suggestion-cover"></div>`
    const pagesText = book.pages ? `<div class="book-suggestion-pages">${book.pages} pages</div>` : ''
    html += `<div class="book-suggestion-item" data-title="${escapeHtml(book.title)}" data-author="${escapeHtml(book.authors)}" data-pages="${book.pages || 0}">
      ${coverHtml}
      <div class="book-suggestion-info">
        <div class="book-suggestion-title">${escapeHtml(book.title)}</div>
        <div class="book-suggestion-author">${escapeHtml(book.authors)}</div>
        ${pagesText}
      </div>
    </div>`
  })
  
  container.innerHTML = html
  container.classList.add('active')
}

function hideBookSuggestions(){
  const container = document.getElementById('bookSuggestions')
  if(container) container.classList.remove('active')
}

function loadSavedName(){
  const saved = localStorage.getItem(NAME_KEY)
  const nameInput = document.getElementById('name')
  if(saved && nameInput){
    nameInput.value = saved
  }
}

function saveName(name){
  localStorage.setItem(NAME_KEY, name)
}

function clearSavedName(){
  localStorage.removeItem(NAME_KEY)
  const nameInput = document.getElementById('name')
  if(nameInput) nameInput.value = ''
}

async function checkBackend(){
  try{
    const r = await fetch(API_BASE + '/ping')
    useApi = r.ok
  }catch(e){ useApi = false }
}

async function checkAdminStatus(){
  // Check if admin token exists
  adminToken = sessionStorage.getItem(ADMIN_TOKEN_KEY)
  if(adminToken){
    isAdmin = true
  }
}

async function adminLogin(username, password){
  try{
    const payload = {username, password}
    console.log('Sending login request with payload:', payload)
    const res = await fetch(API_BASE + '/login', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(payload)
    })
    console.log('Login response status:', res.status)
    const data = await res.json()
    console.log('Login response data:', data)
    if(!res.ok) throw new Error(data.error || 'Invalid credentials')
    adminToken = data.token
    sessionStorage.setItem(ADMIN_TOKEN_KEY, adminToken)
    isAdmin = true
    return true
  }catch(err){
    console.error('Login error:', err.message)
    showStatus('Admin login failed: ' + err.message, 'error')
    return false
  }
}

function adminLogout(){
  adminToken = null
  isAdmin = false
  sessionStorage.removeItem(ADMIN_TOKEN_KEY)
  showStatus('Logged out', 'success')
  location.reload()
}

async function loadEntries(){
  if(useApi){
    const res = await fetch(API_BASE + '/entries')
    if(res.ok) return res.json()
  }
  const raw = localStorage.getItem(STORAGE_KEY)
  return raw ? JSON.parse(raw) : []
}

async function checkDuplicateBook(book, team){
  const entries = await loadEntries()
  return entries.some(e => e.book.toLowerCase() === book.toLowerCase() && e.team === team && (e.status !== 'deleted' && e.status !== 'archived'))
}

async function loadTeams(){
  if(useApi){
    try{
      const res = await fetch(API_BASE + '/teams')
      if(res.ok) teamsList = await res.json()
    }catch(e){ teamsList = [{name:'Team A',platform:'facebook'},{name:'Team B',platform:'discord'}] }
  }else{
    teamsList = [{name:'Team A',platform:'facebook'},{name:'Team B',platform:'discord'}]
  }
  populateTeamDropdown()
  await renderTeamsList()
}

async function initializeAdminUI(){
  if(!isAdmin) return
  document.getElementById('adminTeams').style.display = 'block'
  const addTeamBtn = document.getElementById('addTeam')
  if(addTeamBtn){
    // Remove existing listeners and add once
    addTeamBtn.replaceWith(addTeamBtn.cloneNode(true))
    document.getElementById('addTeam').addEventListener('click', addTeam)
  }
  // Reload teams to ensure we have latest data (loadTeams calls renderTeamsList)
  await loadTeams()
  const adminBtn = document.getElementById('adminBtn')
  if(adminBtn) adminBtn.textContent = 'Logout'
}

async function autoPopulateTeam(){
  const nameInput = document.getElementById('name')
  const platformRadio = document.querySelector('input[name="platform"]:checked')
  const teamSelect = document.getElementById('team')
  
  if(!nameInput || !platformRadio || !teamSelect) return
  
  const name = nameInput.value.trim().toLowerCase()
  const platform = platformRadio.value
  
  if(!name || !platform) return
  
  // Find previous entry for this name and platform
  const entries = await loadEntries()
  const previousEntry = entries.find(e => 
    e.name.toLowerCase() === name && e.platform === platform
  )
  
  if(previousEntry && previousEntry.team){
    // Auto-populate the team dropdown
    teamSelect.value = previousEntry.team
  }
}

function populateTeamDropdown(){
  const sel = document.getElementById('team')
  if(!sel) return
  const selectedPlatform = (document.querySelector('input[name="platform"]:checked') || {}).value
  const filtered = selectedPlatform ? teamsList.filter(t => t.platform === selectedPlatform) : teamsList
  const currentValue = sel.value
  sel.innerHTML = '<option value="">Select a team...</option>' + 
    filtered.map(t => `<option value="${escapeHtml(t.name)}">${escapeHtml(t.name)}</option>`).join('\n')
  // Restore selected value if still valid
  if(currentValue && filtered.find(t => t.name === currentValue)){
    sel.value = currentValue
  }
  
  validateFormFields()
  
  // Also populate export team dropdown if admin
  if(isAdmin){
    const exportSel = document.getElementById('exportTeam')
    if(exportSel){
      exportSel.innerHTML = '<option value="all">All Teams</option>' + 
        teamsList.map(t => `<option value="${escapeHtml(t.name)}">${escapeHtml(t.name)}</option>`).join('\n')
    }
  }
}

async function renderTeamsList(){
  const list = document.getElementById('teamsList')
  if(!list) return
  if(!teamsList || teamsList.length === 0){
    list.innerHTML = '<p style="color:#999;font-style:italic">No teams found</p>'
    return
  }
  // Load entries to calculate pages per team
  const entries = await loadEntries()
  
  list.innerHTML = '<table style="width:100%;border-collapse:collapse"><thead><tr><th style="border:1px solid #ddd;padding:8px;text-align:left">Team Name</th><th style="border:1px solid #ddd;padding:8px;text-align:left">Platform</th><th style="border:1px solid #ddd;padding:8px;text-align:left">Pages Read</th><th style="border:1px solid #ddd;padding:8px;text-align:left">Actions</th></tr></thead><tbody>' + teamsList.map(t => {
    const teamPages = entries.filter(e => e.team === t.name).reduce((sum, e) => sum + (parseInt(e.pages, 10) || 0), 0)
    return `<tr id="team-row-${escapeHtml(t.name).replace(/\s+/g,'-')}"><td style="border:1px solid #ddd;padding:8px" class="team-name">${escapeHtml(t.name)}</td><td style="border:1px solid #ddd;padding:8px" class="team-platform">${escapeHtml(getPlatformDisplayName(t.platform))}</td><td style="border:1px solid #ddd;padding:8px;font-weight:600">${teamPages}</td><td style="border:1px solid #ddd;padding:8px"><button class="edit-team" data-name="${escapeHtml(t.name)}">Edit</button> <button class="delete-team" data-name="${escapeHtml(t.name)}">Delete</button></td></tr>`
  }).join('') + '</tbody></table>'
}

function getPlatformDisplayName(platform){
  if(platform === 'facebook') return 'Your Fairy Smut Lover (Facebook)'
  if(platform === 'discord') return 'Smutty Book Baddies (Discord)'
  return platform.toUpperCase()
}

async function addTeam(){
  const name = document.getElementById('newTeamName').value.trim()
  const platform = document.getElementById('newTeamPlatform').value
  if(!name) return showStatus('Enter a team name','error')
  if(!useApi) return showStatus('Teams management requires server backend','error')
  if(!isAdmin) return showStatus('Admin login required to manage teams','error')
  try{
    const res = await fetch(API_BASE + '/teams', {method:'POST', headers:{'Content-Type':'application/json', 'Authorization': `Bearer ${adminToken}`}, body: JSON.stringify({name, platform})})
    if(!res.ok){
      const errData = await res.json()
      throw new Error(errData.error || 'Failed to add team')
    }
    document.getElementById('newTeamName').value = ''
    await loadTeams()
    showStatus('Team added','success')
  }catch(err){
    showStatus('Failed to add team: '+err.message,'error')
    console.error('Add team error:', err)
  }
}

async function editTeam(oldName){
  const row = document.getElementById('team-row-' + oldName.replace(/\s+/g,'-'))
  if(!row) return
  const nameCell = row.querySelector('.team-name')
  const platformCell = row.querySelector('.team-platform')
  const actionsCell = row.querySelector('td:last-child')
  const origName = nameCell.textContent
  const origPlatform = platformCell.textContent
  
  nameCell.innerHTML = `<input type="text" value="${escapeHtml(origName)}" class="edit-team-name" style="width:100%">`
  platformCell.innerHTML = `<select class="edit-team-platform" style="width:100%"><option value="facebook" ${origPlatform.toLowerCase()==='facebook'?'selected':''}>Your Fairy Smut Lover (Facebook)</option><option value="discord" ${origPlatform.toLowerCase()==='discord'?'selected':''}>Smutty Book Baddies (Discord)</option></select>`
  actionsCell.innerHTML = `<button class="save-team" data-oldname="${escapeHtml(oldName)}">Save</button> <button class="cancel-team">Cancel</button>`
}

async function saveTeam(oldName){
  const row = document.getElementById('team-row-' + oldName.replace(/\s+/g,'-'))
  if(!row) return
  const name = row.querySelector('.edit-team-name').value.trim()
  const platform = row.querySelector('.edit-team-platform').value
  if(!name) return showStatus('Team name required','error')
  if(!useApi) return showStatus('Teams management requires server backend','error')
  if(!isAdmin) return showStatus('Admin login required to manage teams','error')
  try{
    const res = await fetch(API_BASE + '/teams/' + encodeURIComponent(oldName), {method:'PUT', headers:{'Content-Type':'application/json', 'Authorization': `Bearer ${adminToken}`}, body: JSON.stringify({name, platform})})
    if(!res.ok) throw new Error('Failed to update team')
    await loadTeams()
    showStatus('Team updated','success')
  }catch(err){
    showStatus('Failed to update team: '+err.message,'error')
  }
}

async function deleteTeam(name){
  if(!confirm(`Delete team "${name}"?`)) return
  if(!useApi) return showStatus('Teams management requires server backend','error')
  if(!isAdmin) return showStatus('Admin login required to manage teams','error')
  try{
    const res = await fetch(API_BASE + '/teams/' + encodeURIComponent(name), {method:'DELETE', headers:{'Authorization': `Bearer ${adminToken}`}})
    if(!res.ok) throw new Error('Failed to delete team')
    await loadTeams()
    showStatus('Team deleted','success')
  }catch(err){
    showStatus('Failed to delete team: '+err.message,'error')
  }
}

// make facebook image clickable to select platform
document.addEventListener('click', function(ev){
  const t = ev.target
  if(t && t.id === 'facebookImage'){
    const fbRadio = document.querySelector('input[name="platform"][value="facebook"]')
    if(fbRadio) fbRadio.checked = true
    // visual
    document.querySelectorAll('.platform-img').forEach(i=>i.classList.remove('selected'))
    t.classList.add('selected')
    populateTeamDropdown()
  }
  // when selecting radio update image border and team dropdown
  if(t && t.name === 'platform'){
    document.querySelectorAll('.platform-img').forEach(i=>i.classList.remove('selected'))
    const fb = document.querySelector('input[name="platform"][value="facebook"]').checked
    if(fb){
      const img = document.getElementById('facebookImage')
      if(img) img.classList.add('selected')
      // Hide Discord fields when Facebook is selected
      const discordLabel = document.querySelector('label:has(#discord)')
      if(discordLabel) discordLabel.style.display = 'none'
      const viewRows = document.querySelectorAll('.view-row')
      viewRows.forEach((row, index) => {
        if(index === 0) { // First view-row is the Discord section
          row.style.display = 'none'
        }
      })
    } else {
      // Show Discord fields when Discord is selected or Facebook is deselected
      const discordLabel = document.querySelector('label:has(#discord)')
      if(discordLabel) discordLabel.style.display = 'block'
      const viewRows = document.querySelectorAll('.view-row')
      viewRows.forEach((row, index) => {
        if(index === 0) { // First view-row is the Discord section
          row.style.display = 'block'
        }
      })
    }
    populateTeamDropdown()
    renderReports()
  }
})

async function saveEntry(entry){
  if(useApi){
    const res = await fetch(API_BASE + '/entries', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(entry)})
    if(res.ok) return res.json()
    throw new Error('Failed to save to API')
  }
  const entries = await loadEntries()
  entries.push(entry)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries))
  return entry
}

async function clearAll(){
  const platform = document.getElementById('clearPlatform') ? document.getElementById('clearPlatform').value : 'all'
  const platformText = platform === 'all' ? 'ALL entries' : platform.toUpperCase() + ' entries'
  if(!confirm(`Clear ${platformText}? This cannot be undone.`)) return
  if(useApi){
    const url = platform === 'all' ? API_BASE + '/entries' : API_BASE + '/entries?platform=' + platform
    await fetch(url, {method:'DELETE'})
  }else{
    if(platform === 'all'){
      localStorage.removeItem(STORAGE_KEY)
    }else{
      const entries = await loadEntries()
      const filtered = entries.filter(e => e.platform !== platform)
      localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered))
    }
  }
  showStatus(`${platformText} cleared`, 'success')
  renderReports()
  await renderTeamsList()
}

function groupByTeam(entries){
  // Filter out deleted and archived records for totals
  const activeEntries = entries.filter(e => !e.status || e.status === 'active')
  const teams = {}
  activeEntries.forEach(e => {
    const t = e.team || '(No Team)'
    teams[t] = teams[t] || {members:{}, total:0}
    teams[t].total += Number(e.pages) || 0
    const key = e.name.toLowerCase()
    if(!teams[t].members[key]) teams[t].members[key] = {name: e.name, discord: e.discord, author: e.author, pages:0, platform: e.platform}
    teams[t].members[key].pages += Number(e.pages) || 0
  })
  return teams
}

function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, function(c){
    return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c] || c
  })
}

async function renderReports(){
  const reportArea = document.getElementById('reportArea')
  const filter = document.getElementById('filterTeam').value.trim().toLowerCase()
  const selectedTeam = document.getElementById('team') ? document.getElementById('team').value : ''
  const selectedPlatform = (document.querySelector('input[name="platform"]:checked') || {}).value
  const enteredName = document.getElementById('name') ? document.getElementById('name').value.trim().toLowerCase() : ''
  let entries = await loadEntries()
  
  // Filter by selected platform if one is selected
  if(selectedPlatform){
    entries = entries.filter(e => e.platform === selectedPlatform)
  }
  
  if(entries.length===0){ reportArea.innerHTML = '<p>No entries yet.</p>'; return }

  const teams = groupByTeam(entries)
  let keys = Object.keys(teams)
  
  // Filter teams by their platform from teamsList if one is selected
  if(selectedPlatform){
    keys = keys.filter(teamName => {
      const teamInfo = teamsList.find(t => t.name === teamName)
      return teamInfo && teamInfo.platform === selectedPlatform
    })
  }
  
  // Filter by selected team from dropdown if a team is selected
  if(selectedTeam){
    keys = keys.filter(k => k === selectedTeam)
  }
  
  // Filter to only show teams where the entered name has entries
  if(enteredName){
    keys = keys.filter(teamName => {
      const team = teams[teamName]
      // Check if the entered name has any entries in this team
      return Object.keys(team.members).some(memberName => 
        memberName.toLowerCase() === enteredName
      )
    })
  }
  
  // Filter by team name from filterTeam input and sort
  keys = keys.filter(k=> k.toLowerCase().includes(filter)).sort((a,b)=> a.localeCompare(b))
  let html = ''
  keys.forEach(teamName => {
    const team = teams[teamName]
    html += `<div class="team-summary"><strong>${escapeHtml(teamName)}</strong> — Team total: <strong style="font-size:1.4em">${team.total}</strong> pages</div>`
  })
  reportArea.innerHTML = html
}

// render raw entries table for a team
function renderTeamEntries(entries, teamName){
  let html = '<table class="raw-entries"><thead><tr><th>Name</th><th>Discord</th><th>Author</th><th>Book</th><th>Pages</th><th>Completion Date</th><th>Favorite Scene</th><th>Team</th><th>Platform</th><th>Created</th><th>Actions</th></tr></thead><tbody>'
  entries.forEach(e=>{
    html += `<tr id="entry-${e.id}"><td>${escapeHtml(e.name)}</td><td>${escapeHtml(e.discord||'')}</td><td>${escapeHtml(e.author||'')}</td><td>${escapeHtml(e.book)}</td><td>${e.pages}</td><td>${escapeHtml(e.completionDate||'')}</td><td>${escapeHtml(e.favoriteScene||'')}</td><td>${escapeHtml(e.team)}</td><td>${escapeHtml(e.platform||'')}</td><td>${e.created ? new Date(e.created).toLocaleString() : ''}</td><td><button data-id="${e.id}" class="edit">Edit</button> <button data-id="${e.id}" class="del">Delete</button></td></tr>`
  })
  html += '</tbody></table>'
  return html
}

async function updateEntry(id, updates){
  if(useApi){
    const res = await fetch(API_BASE + '/entries/' + encodeURIComponent(id), {method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(updates)})
    if(!res.ok) throw new Error('Update failed')
    return res.json()
  }
  const entries = await loadEntries()
  const idx = entries.findIndex(e => String(e.id) === String(id))
  if(idx === -1) throw new Error('Not found')
  entries[idx] = Object.assign({}, entries[idx], updates)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries))
  return entries[idx]
}

async function deleteEntryById(id){
  if(!confirm('Delete this entry?')) return false
  if(useApi){
    const res = await fetch(API_BASE + '/entries/' + encodeURIComponent(id), {method:'DELETE'})
    if(!res.ok) throw new Error('Delete failed')
    return true
  }
  const entries = await loadEntries()
  const filtered = entries.filter(e => String(e.id) !== String(id))
  localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered))
  return true
}

// attach event delegation for edit/delete in reports and teams
document.addEventListener('click', async function(ev){
  const t = ev.target
  // Entry management
  if(t.classList.contains('edit')){
    const id = t.dataset.id
    const row = document.getElementById('entry-' + id)
    if(!row) return
    
    const inMyEntries = t.closest('#myEntries')
    let orig = {}
    
    // Check if this is card-based layout or table layout
    if(row.classList.contains('entry-card')){
      // Card-based layout (View My Entries)
      const fields = row.querySelectorAll('.entry-field')
      fields.forEach(field => {
        const label = field.querySelector('.entry-label').textContent.replace(':','').trim().toLowerCase()
        const value = field.querySelector('.entry-value').textContent
        if(label === 'name') orig.name = value
        else if(label === 'discord') orig.discord = value
        else if(label === 'author') orig.author = value
        else if(label === 'book') orig.book = value
        else if(label === 'pages') orig.pages = value
        else if(label === 'team') orig.team = value
        else if(label === 'platform') orig.platform = value
        else if(label === 'completion date') orig.completionDate = value
        else if(label === 'favorite scene') orig.favoriteScene = value
      })
      // Rebuild card with editable fields
      row.innerHTML = `
        <div class="entry-field"><span class="entry-label">Name:</span><span class="entry-value">${escapeHtml(orig.name)}</span></div>
        <div class="entry-field"><span class="entry-label">Discord:</span><span class="entry-value">${escapeHtml(orig.discord)}</span></div>
        <div class="entry-field"><span class="entry-label">Book:</span><span class="entry-value">${escapeHtml(orig.book)}</span></div>
        <div class="entry-field"><span class="entry-label">Author:</span><span class="entry-value">${escapeHtml(orig.author)}</span></div>
        <div class="entry-field"><span class="entry-label">Pages:</span><input value="${escapeHtml(orig.pages)}" class="edit-pages" type="number" style="flex:1;padding:6px;border:1px solid #ddd;border-radius:4px"></div>
        <div class="entry-field"><span class="entry-label">Completion Date:</span><input value="${escapeHtml(orig.completionDate)}" class="edit-completionDate" type="date" style="flex:1;padding:6px;border:1px solid #ddd;border-radius:4px"></div>
        <div class="entry-field"><span class="entry-label">Favorite Scene:</span><textarea class="edit-favoriteScene" style="flex:1;padding:6px;border:1px solid #ddd;border-radius:4px;font-family:inherit;min-height:80px">${escapeHtml(orig.favoriteScene)}</textarea></div>
        <div class="entry-field"><span class="entry-label">Team:</span><span class="entry-value">${escapeHtml(orig.team)}</span></div>
        <div class="entry-field"><span class="entry-label">Platform:</span><span class="entry-value">${escapeHtml(orig.platform)}</span></div>
        <div class="entry-actions"><button class="save" data-id="${id}">Save</button><button class="cancel" data-id="${id}">Cancel</button></div>
      `
    } else {
      // Table-based layout (Reports)
      const cells = row.querySelectorAll('td')
      orig = {name: cells[0].textContent, discord: cells[1].textContent, author: cells[2].textContent, book: cells[3].textContent, pages: cells[4].textContent, completionDate: cells[5].textContent, favoriteScene: cells[6].textContent, team: cells[7].textContent, platform: cells[8].textContent}
      row.innerHTML = `<td><input value="${escapeHtml(orig.name)}" class="edit-name"></td><td><input value="${escapeHtml(orig.discord)}" class="edit-discord"></td><td><input value="${escapeHtml(orig.author)}" class="edit-author"></td><td><input value="${escapeHtml(orig.book)}" class="edit-book"></td><td><input value="${escapeHtml(orig.pages)}" class="edit-pages" type="number"></td><td><input value="${escapeHtml(orig.completionDate)}" class="edit-completionDate" type="date"></td><td><textarea class="edit-favoriteScene" style="padding:6px;border:1px solid #ddd;border-radius:4px;font-family:inherit;min-height:60px">${escapeHtml(orig.favoriteScene)}</textarea></td><td><input value="${escapeHtml(orig.team)}" class="edit-team"></td><td><input value="${escapeHtml(orig.platform)}" class="edit-platform"></td><td><button class="save" data-id="${id}">Save</button> <button class="cancel" data-id="${id}">Cancel</button></td>`
    }
  }
  if(t.classList.contains('cancel')){
    // Check if we're in myEntries section
    const inMyEntries = t.closest('#myEntries')
    if(inMyEntries){
      refreshMyEntries()
    } else {
      renderReports()
    }
  }
  if(t.classList.contains('save')){
    const id = t.dataset.id
    const row = document.getElementById('entry-' + id)
    const inMyEntries = t.closest('#myEntries')
    
    if(inMyEntries){
      // For user view, only update pages, completionDate and favoriteScene
      const pages = parseInt(row.querySelector('.edit-pages').value,10) || 0
      const completionDate = row.querySelector('.edit-completionDate') ? row.querySelector('.edit-completionDate').value.trim() : ''
      const favoriteScene = row.querySelector('.edit-favoriteScene') ? row.querySelector('.edit-favoriteScene').value.trim() : ''
      try{
        await updateEntry(id, {pages, completionDate, favoriteScene})
        showStatus('Entry updated', 'success')
        refreshMyEntries()
        renderReports()
        await renderTeamsList()
      }catch(err){ showStatus('Update failed: '+err.message,'error') }
    } else {
      // For admin, update all fields
      const name = row.querySelector('.edit-name').value.trim()
      const discord = row.querySelector('.edit-discord').value.trim()
      const author = row.querySelector('.edit-author').value.trim()
      const book = row.querySelector('.edit-book').value.trim()
      const pages = parseInt(row.querySelector('.edit-pages').value,10) || 0
      const completionDate = row.querySelector('.edit-completionDate') ? row.querySelector('.edit-completionDate').value.trim() : ''
      const favoriteScene = row.querySelector('.edit-favoriteScene') ? row.querySelector('.edit-favoriteScene').value.trim() : ''
      const team = row.querySelector('.edit-team').value.trim()
      const platform = row.querySelector('.edit-platform').value.trim()
      try{
        await updateEntry(id, {name, discord, author, book, pages, completionDate, favoriteScene, team, platform})
        showStatus('Entry updated', 'success')
        renderReports()
        await renderTeamsList()
      }catch(err){ showStatus('Update failed: '+err.message,'error') }
    }
  }
  if(t.classList.contains('del')){
    const id = t.dataset.id
    try{
      const ok = await deleteEntryById(id)
      if(ok){ 
        showStatus('Entry deleted','success')
        renderReports()
        await renderTeamsList()
      }
    }catch(err){ showStatus('Delete failed: '+err.message,'error') }
  }
  if(t.classList.contains('del-my-entry')){
    const id = t.dataset.id
    try{
      const ok = await deleteEntryById(id)
      if(ok){ 
        showStatus('Entry deleted','success')
        refreshMyEntries()
        renderReports()
        await renderTeamsList()
      }
    }catch(err){ showStatus('Delete failed: '+err.message,'error') }
  }
  
  // Team management
  if(t.classList.contains('edit-team')){
    const name = t.dataset.name
    await editTeam(name)
  }
  if(t.classList.contains('save-team')){
    const oldName = t.dataset.oldname
    await saveTeam(oldName)
  }
  if(t.classList.contains('cancel-team')){
    await renderTeamsList()
  }
  if(t.classList.contains('delete-team')){
    const name = t.dataset.name
    await deleteTeam(name)
  }
})

function showStatus(message, type='info', timeout=3500){
  const s = document.getElementById('status')
  if(!s) return
  s.textContent = message
  s.className = 'status ' + (type === 'success' ? 'success' : (type === 'error' ? 'error' : ''))
  s.hidden = false
  clearTimeout(s._timer)
  s._timer = setTimeout(()=>{ s.hidden = true }, timeout)
}

function validateFormFields(){
  const name = document.getElementById('name').value.trim()
  const book = document.getElementById('book').value.trim()
  const author = document.getElementById('author').value.trim()
  const pages = parseInt(document.getElementById('pages').value,10) || 0
  const team = document.getElementById('team').value.trim()
  const platform = document.querySelector('input[name="platform"]:checked')
  const completionDate = document.getElementById('completionDate').value
  const favoriteScene = document.getElementById('favoriteScene').value.trim()
  
  const isValid = name.length >= 2 && book && author && pages > 0 && team && platform && completionDate && favoriteScene.length >= 20
  const submitBtn = document.getElementById('submitBtn')
  if(submitBtn) submitBtn.disabled = !isValid
}

async function addEntry(e){
  e.preventDefault()
  const name = document.getElementById('name').value.trim()
  const discord = document.getElementById('discord').value.trim()
  const book = document.getElementById('book').value.trim()
  const author = document.getElementById('author').value.trim()
  const pages = parseInt(document.getElementById('pages').value,10) || 0
  const team = document.getElementById('team').value.trim()
  const platform = (document.querySelector('input[name="platform"]:checked') || {}).value
  const completionDate = document.getElementById('completionDate').value.trim()
  const favoriteScene = document.getElementById('favoriteScene').value.trim()
  
  // Validate name
  if(!name || name.length < 2){
    showStatus('Please enter a valid name (at least 2 characters)','error')
    return
  }
  if(!/^[a-zA-Z\s'-]+$/.test(name)){
    showStatus('Name can only contain letters, spaces, hyphens, and apostrophes','error')
    return
  }
  
  if(!book||!author||!team||pages<=0||!platform){
    showStatus('Please fill all required fields with valid values','error')
    return
  }
  if(platform === 'discord' && !discord){
    showStatus('Discord name is required for Smutty Book Baddies (Discord)','error')
    return
  }

  if(!completionDate){
    showStatus('Completion Date is required','error')
    return
  }

  if(!favoriteScene || favoriteScene.length < 20){
    showStatus('Favorite scene must be at least 20 characters','error')
    return
  }

  // Check for duplicate book
  const isDuplicate = await checkDuplicateBook(book, team)
  if(isDuplicate){
    showStatus('Duplicate Record, Book Already logged','error')
    return
  }

  const entry = { 
    name, 
    discord: discord||'', 
    author: author, 
    book, 
    pages, 
    team, 
    platform, 
    completionDate: completionDate, 
    favoriteScene: favoriteScene, 
    created: new Date().toISOString(),
    status: 'active'
  }
  try{
    const submitBtn = document.getElementById('submitBtn')
    if(submitBtn) submitBtn.disabled = true
    await saveEntry(entry)
    saveName(name)
    document.getElementById('entryForm').reset()
    // Restore name after reset and re-populate team dropdown
    document.getElementById('name').value = name
    populateTeamDropdown()
    renderReports()
    await renderTeamsList()
    showStatus('Logged', 'success')
  }catch(err){
    showStatus('Failed to save entry: ' + err.message, 'error')
  }
  finally{
    const submitBtn = document.getElementById('submitBtn')
    if(submitBtn) submitBtn.disabled = false
    validateFormFields()
  }
}

async function viewMyEntries(){
  const discord = document.getElementById('viewDiscord').value.trim().toLowerCase()
  const out = document.getElementById('myEntries')
  if(!discord) return out.innerHTML = '<p>Enter your Discord Name to view your entries.</p>'
  const entries = (await loadEntries()).filter(e => e.discord.toLowerCase() === discord && (!e.status || e.status === 'active'))
  if(entries.length===0) return out.innerHTML = '<p>No entries found for that Discord Name.</p>'
  
  // Calculate totals
  const totalPages = entries.reduce((sum, e) => sum + (parseInt(e.pages, 10) || 0), 0)
  const totalBooks = entries.length
  
  let html = '<div class="entries-container">'
  entries.forEach(e=>{
    html += `<div class="entry-card" id="entry-${e.id}">
      <div class="entry-field"><span class="entry-label">Name:</span><span class="entry-value">${escapeHtml(e.name)}</span></div>
      <div class="entry-field"><span class="entry-label">Discord:</span><span class="entry-value">${escapeHtml(e.discord||'')}</span></div>
      <div class="entry-field"><span class="entry-label">Book:</span><span class="entry-value">${escapeHtml(e.book)}</span></div>
      <div class="entry-field"><span class="entry-label">Author:</span><span class="entry-value">${escapeHtml(e.author||'')}</span></div>
      <div class="entry-field"><span class="entry-label">Pages:</span><span class="entry-value">${e.pages}</span></div>
      <div class="entry-field"><span class="entry-label">Completion Date:</span><span class="entry-value">${escapeHtml(e.completionDate||'')}</span></div>
      <div class="entry-field"><span class="entry-label">Favorite Scene:</span><span class="entry-value">${escapeHtml(e.favoriteScene||'')}</span></div>
      <div class="entry-field"><span class="entry-label">Team:</span><span class="entry-value">${escapeHtml(e.team)}</span></div>
      <div class="entry-field"><span class="entry-label">Platform:</span><span class="entry-value">${escapeHtml(e.platform||'')}</span></div>
      <div class="entry-actions"><button data-id="${e.id}" class="edit">Edit</button><button data-id="${e.id}" class="del-my-entry">Delete</button></div>
    </div>`
  })
  html += '</div>'
  html += `<div style="margin-top:16px;padding:12px;background:#f5f5f5;border-radius:4px"><strong>Total Pages Read:</strong> ${totalPages} | <strong>Total Books:</strong> ${totalBooks}</div>`
  out.innerHTML = html
}

function refreshMyEntries(){
  // Determine which view to refresh based on which input has a value
  const discordInput = document.getElementById('viewDiscord')
  const facebookInput = document.getElementById('viewFacebook')
  
  if(facebookInput && facebookInput.value.trim()){
    viewMyFacebookEntries()
  } else if(discordInput && discordInput.value.trim()){
    viewMyEntries()
  }
}

async function viewMyFacebookEntries(){
  const name = document.getElementById('viewFacebook').value.trim().toLowerCase()
  const out = document.getElementById('myEntries')
  if(!name) return out.innerHTML = '<p>Enter your Facebook Name to view your entries.</p>'
  const entries = (await loadEntries()).filter(e => (e.platform === 'facebook') && e.name.toLowerCase() === name && (!e.status || e.status === 'active'))
  if(entries.length===0) return out.innerHTML = '<p>No entries found for that Facebook Name.</p>'
  
  // Calculate totals
  const totalPages = entries.reduce((sum, e) => sum + (parseInt(e.pages, 10) || 0), 0)
  const totalBooks = entries.length
  
  let html = '<div class="entries-container">'
  entries.forEach(e=>{
    html += `<div class="entry-card" id="entry-${e.id}">
      <div class="entry-field"><span class="entry-label">Name:</span><span class="entry-value">${escapeHtml(e.name)}</span></div>
      <div class="entry-field"><span class="entry-label">Discord:</span><span class="entry-value">${escapeHtml(e.discord||'')}</span></div>
      <div class="entry-field"><span class="entry-label">Book:</span><span class="entry-value">${escapeHtml(e.book)}</span></div>
      <div class="entry-field"><span class="entry-label">Author:</span><span class="entry-value">${escapeHtml(e.author||'')}</span></div>
      <div class="entry-field"><span class="entry-label">Pages:</span><span class="entry-value">${e.pages}</span></div>
      <div class="entry-field"><span class="entry-label">Completion Date:</span><span class="entry-value">${escapeHtml(e.completionDate||'')}</span></div>
      <div class="entry-field"><span class="entry-label">Favorite Scene:</span><span class="entry-value">${escapeHtml(e.favoriteScene||'')}</span></div>
      <div class="entry-field"><span class="entry-label">Team:</span><span class="entry-value">${escapeHtml(e.team)}</span></div>
      <div class="entry-field"><span class="entry-label">Platform:</span><span class="entry-value">${escapeHtml(e.platform||'')}</span></div>
      <div class="entry-actions"><button data-id="${e.id}" class="edit">Edit</button><button data-id="${e.id}" class="del-my-entry">Delete</button></div>
    </div>`
  })
  html += '</div>'
  html += `<div style="margin-top:16px;padding:12px;background:#f5f5f5;border-radius:4px"><strong>Total Pages Read:</strong> ${totalPages} | <strong>Total Books:</strong> ${totalBooks}</div>`
  out.innerHTML = html
}

async function exportCsv(){
  const selectedTeam = document.getElementById('exportTeam') ? document.getElementById('exportTeam').value : 'all'
  
  if(useApi){
    if(!isAdmin){
      showStatus('Admin login required to export CSV', 'error')
      return
    }
    
    const url = selectedTeam === 'all' ? API_BASE + '/export' : API_BASE + '/export?team=' + encodeURIComponent(selectedTeam)
    const response = await fetch(url, {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    })
    
    if(!response.ok){
      const error = await response.json()
      showStatus('Export failed: ' + (error.error || response.statusText), 'error')
      return
    }
    
    const blob = await response.blob()
    const blobUrl = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = blobUrl
    const filename = selectedTeam === 'all' ? 'book-tracker-entries.csv' : `book-tracker-${selectedTeam.replace(/\s+/g,'-')}.csv`
    a.download = filename
    a.click()
    URL.revokeObjectURL(blobUrl)
    return
  }
  
  let entries = await loadEntries()
  if(entries.length===0) return alert('No entries to export')
  
  // Filter by selected team if not "all"
  if(selectedTeam !== 'all'){
    entries = entries.filter(e => e.team === selectedTeam)
    if(entries.length===0) return alert('No entries found for team: ' + selectedTeam)
  }
  
  // Sort active records first, then archived
  const active = entries.filter(e => !e.status || e.status === 'active')
  const archived = entries.filter(e => e.status === 'edited' || e.status === 'deleted')
  const sortedEntries = [...active, ...archived]
  
  const header = ['Name','Discord','Author','Book','Pages','Team','Platform','Completion Date','Favorite Scene','Date Added','Last Edited','Status']
  const rows = sortedEntries.map(e=> [e.name,e.discord||'',e.author||'',e.book,e.pages,e.team,e.platform||'',e.completionDate||e.completion_date||'',e.favoriteScene||e.favorite_scene||'', e.created||'', e.edited_at||'', e.status||'active'])
  const csv = [header, ...rows].map(r=> r.map(cell=> '"'+String(cell).replace(/"/g,'""')+'"').join(',')).join('\n')
  const blob = new Blob([csv],{type:'text/csv'})
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  const filename = selectedTeam === 'all' ? 'book-tracker-entries.csv' : `book-tracker-${selectedTeam.replace(/\s+/g,'-')}.csv`
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

// wire events
document.getElementById('entryForm').addEventListener('submit', addEntry)
document.getElementById('clearAll').addEventListener('click', clearAll)
document.getElementById('refresh').addEventListener('click', renderReports)
document.getElementById('viewMy').addEventListener('click', viewMyEntries)
document.getElementById('viewMyFb').addEventListener('click', viewMyFacebookEntries)
document.getElementById('exportCsv').addEventListener('click', exportCsv)
document.getElementById('team').addEventListener('change', () => {
  renderReports()
  validateFormFields()
})
document.getElementById('name').addEventListener('input', () => {
  renderReports()
  autoPopulateTeam()
  validateFormFields()
})

// Form field validation listeners
const formInputs = document.querySelectorAll('#entryForm input[required], #entryForm select[required]')
formInputs.forEach(input => {
  input.addEventListener('input', validateFormFields)
  input.addEventListener('change', validateFormFields)
})

// Platform radio buttons - also trigger auto-populate team
const platformRadios = document.querySelectorAll('input[name="platform"]')
platformRadios.forEach(radio => {
  radio.addEventListener('change', () => {
    populateTeamDropdown()
    autoPopulateTeam()
  })
})

// Set completion date to today and add listeners
const completionDateInput = document.getElementById('completionDate')
if(completionDateInput){
  completionDateInput.addEventListener('input', validateFormFields)
  completionDateInput.addEventListener('change', validateFormFields)
}

// Favorite scene field validation
const favoriteSceneInput = document.getElementById('favoriteScene')
if(favoriteSceneInput){
  favoriteSceneInput.addEventListener('input', validateFormFields)
  favoriteSceneInput.addEventListener('change', validateFormFields)
}

// Book search autocomplete
const bookInput = document.getElementById('book')
if(bookInput){
  bookInput.addEventListener('input', function(e){
    const query = e.target.value.trim()
    
    clearTimeout(bookSearchTimeout)
    
    if(query.length < 3){
      hideBookSuggestions()
      return
    }
    
    // Show loading state
    const container = document.getElementById('bookSuggestions')
    if(container){
      container.innerHTML = '<div class="book-loading">Searching books...</div>'
      container.classList.add('active')
    }
    
    bookSearchTimeout = setTimeout(async () => {
      const books = await searchGoogleBooks(query)
      showBookSuggestions(books)
    }, 400)
  })
  
  bookInput.addEventListener('blur', function(){
    // Delay hiding to allow clicking on suggestions
    setTimeout(() => hideBookSuggestions(), 200)
  })
}

// Handle book suggestion clicks
document.addEventListener('click', function(ev){
  const item = ev.target.closest('.book-suggestion-item')
  if(item){
    const title = item.dataset.title
    const author = item.dataset.author
    const pages = item.dataset.pages
    
    if(title || author){
      const bookInput = document.getElementById('book')
      const authorInput = document.getElementById('author')
      const pagesInput = document.getElementById('pages')
      
      if(title && bookInput) bookInput.value = title
      if(author && authorInput) authorInput.value = author
      if(pages > 0 && pagesInput) pagesInput.value = pages
      
      hideBookSuggestions()
    }
  }
})

// Close suggestions when clicking outside
document.addEventListener('click', function(ev){
  const bookAutocomplete = ev.target.closest('.book-autocomplete')
  if(!bookAutocomplete){
    hideBookSuggestions()
  }
})

// Handle platform card selection
document.addEventListener('click', function(ev){
  const platformCard = ev.target.closest('.platform-card')
  if(platformCard){
    const radio = platformCard.querySelector('input[type="radio"]')
    if(radio && !radio.checked){
      radio.checked = true
      radio.dispatchEvent(new Event('change', { bubbles: true }))
      validateFormFields()
      autoPopulateTeam()
    }
  }
})

// Admin login form handling
document.getElementById('adminLoginForm').addEventListener('submit', async (e) => {
  e.preventDefault()
  const username = document.getElementById('adminUsername').value
  const password = document.getElementById('adminPassword').value
  if(await adminLogin(username, password)){
    document.getElementById('adminLoginModal').style.display = 'none'
    await initializeAdminUI()
    showStatus('Admin logged in', 'success')
  }
  document.getElementById('adminUsername').value = ''
  document.getElementById('adminPassword').value = ''
})

document.getElementById('adminLoginCancel').addEventListener('click', () => {
  document.getElementById('adminLoginModal').style.display = 'none'
  document.getElementById('adminUsername').value = ''
  document.getElementById('adminPassword').value = ''
})

// Add admin login button to header
const headerDiv = document.querySelector('.app-header')
if(headerDiv){
  const adminBtn = document.createElement('button')
  adminBtn.id = 'adminAccessBtn'
  adminBtn.style.cssText = 'position:absolute;right:16px;top:16px;background:var(--accent);color:#fff;border:none;padding:8px 12px;border-radius:4px;cursor:pointer;font-size:14px'
  adminBtn.textContent = 'Admin'
  adminBtn.onclick = () => {
    if(isAdmin){
      adminLogout()
      adminBtn.textContent = 'Admin'
    }else{
      document.getElementById('adminLoginModal').style.display = 'flex'
    }
  }
  headerDiv.style.position = 'relative'
  headerDiv.appendChild(adminBtn)
}

// Initial form validation and setup runs after async setup completes
// (moved inside initial setup below)

// Setup login modal handlers
function setupLoginModal(){
  const adminBtn = document.getElementById('adminBtn')
  const loginModal = document.getElementById('loginModal')
  const loginForm = document.getElementById('loginForm')
  const closeLogin = document.getElementById('closeLogin')
  const loginError = document.getElementById('loginError')
  
  if(!adminBtn) return
  
  adminBtn.onclick = () => {
    if(isAdmin){
      adminLogout()
    } else {
      loginModal.style.display = 'flex'
    }
  }
  
  closeLogin.onclick = () => {
    loginModal.style.display = 'none'
    loginError.style.display = 'none'
  }
  
  loginModal.onclick = (e) => {
    if(e.target === loginModal){
      loginModal.style.display = 'none'
      loginError.style.display = 'none'
    }
  }
  
  loginForm.onsubmit = async (e) => {
    e.preventDefault()
    const usernameInput = document.getElementById('loginUsername')
    const passwordInput = document.getElementById('loginPassword')
    
    console.log('Form submitted. Input elements found:', {usernameInput: !!usernameInput, passwordInput: !!passwordInput})
    
    if(!usernameInput || !passwordInput){
      console.error('Form inputs not found!')
      loginError.textContent = 'Form error: inputs not found'
      loginError.style.display = 'block'
      return
    }
    
    const username = usernameInput.value.trim()
    const password = passwordInput.value.trim()
    
    console.log('Form values:', {username: username.length > 0, password: password.length > 0})
    
    if(!username || !password){
      loginError.textContent = 'Please enter username and password'
      loginError.style.display = 'block'
      return
    }
    
    console.log('Attempting login with username:', username)
    const success = await adminLogin(username, password)
    if(success){
      loginModal.style.display = 'none'
      loginForm.reset()
      loginError.style.display = 'none'
      initializeAdminUI()
      showStatus('Logged in successfully!', 'success')
    } else {
      loginError.textContent = 'Invalid username or password'
      loginError.style.display = 'block'
    }
  }
}

// initial setup
(async function(){
  setupLoginModal()
  await checkBackend()
  await checkAdminStatus()
  await loadTeams()
  loadSavedName()
  renderReports()
  // Final form validation after everything is loaded
  validateFormFields()
  
  // Update admin button if already logged in
  if(isAdmin){
    initializeAdminUI()
  }
})()