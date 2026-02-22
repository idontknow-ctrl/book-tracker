const http = require('http')

const HOST = 'localhost'
const PORT = 3000

function request(method, path, data){
  return new Promise((resolve,reject)=>{
    const opts = { hostname: HOST, port: PORT, path, method, headers: {} }
    let body = null
    if(data){ body = Buffer.from(JSON.stringify(data)); opts.headers['Content-Type'] = 'application/json'; opts.headers['Content-Length'] = body.length }
    const req = http.request(opts, res => {
      let chunks = []
      res.on('data', c => chunks.push(c))
      res.on('end', ()=>{
        const buf = Buffer.concat(chunks)
        const ct = (res.headers['content-type']||'').toLowerCase()
        const text = buf.toString('utf8')
        if(ct.includes('application/json')){
          try{ resolve({status: res.statusCode, body: JSON.parse(text)}) }catch(err){ reject(err) }
        } else {
          resolve({status: res.statusCode, body: text})
        }
      })
    })
    req.on('error', reject)
    if(body) req.write(body)
    req.end()
  })
}

;(async ()=>{
  try{
    console.log('1) PING /api/ping')
    let r = await request('GET','/api/ping')
    if(r.status !== 200 || !r.body.ok) throw new Error('Ping failed')

    console.log('2) POST /api/entries')
    const entry = { name: 'Test User', discord: 'tester#0001', book: 'Demo Book', pages: 42, team: 'Testers' }
    r = await request('POST','/api/entries', entry)
    if(r.status !== 200) throw new Error('POST failed: ' + JSON.stringify(r))
    console.log('  saved id:', r.body.id)

    console.log('3) GET /api/entries')
    r = await request('GET','/api/entries')
    if(r.status !== 200 || !Array.isArray(r.body)) throw new Error('GET entries failed')
    console.log('  entries count:', r.body.length)

    console.log('4) GET /api/export')
    r = await request('GET','/api/export')
    if(r.status !== 200 || typeof r.body !== 'string') throw new Error('Export failed')
    console.log('  export length:', r.body.length)

    console.log('5) DELETE /api/entries')
    r = await request('DELETE','/api/entries')
    if(r.status !== 200) throw new Error('Delete failed')

    console.log('6) Verify cleared')
    r = await request('GET','/api/entries')
    if(r.status !== 200) throw new Error('Final GET failed')
    if(Array.isArray(r.body) && r.body.length !== 0) throw new Error('Entries not cleared')

    console.log('All tests passed')
    process.exit(0)
  }catch(err){
    console.error('Test failed:', err)
    process.exit(1)
  }
})()
