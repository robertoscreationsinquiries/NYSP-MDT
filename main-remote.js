// main-remote.js — loaded from GitHub at startup by main.js
// All variables from main.js are injected: mainWindow, app, ipcMain, dialog, shell,
// path, fs, https, os, exec, WORKER_URL, GITHUB_REPO, GITHUB_BRANCH,
// GITHUB_BRANCH_ENCODED, USE_LOCAL_INDEX, AUTO_OPEN_DEVTOOLS, settings,
// windowFocused, globalShortcut

console.log('[REMOTE] main-remote.js executing...');

// ════════════════════════════════════════════════════════════
// SESSION EXPIRATION WARNING — configurable timings (in SECONDS)
// ════════════════════════════════════════════════════════════
// SESSION_INACTIVITY_SECONDS: how long the user can be inactive (no key/mouse/tab
//   activity inside the app) before the "Wake up!" warning popup appears.
// SESSION_WARNING_COUNTDOWN_SECONDS: once the popup is showing, how many seconds the
//   countdown runs before the user is automatically logged out.
// Both are injected into the renderer as window.SESSION_* below (see buildScript).
const SESSION_INACTIVITY_SECONDS = 900;          // 15 minutes idle → warning appears
const SESSION_WARNING_COUNTDOWN_SECONDS = 150;    // 30s countdown → auto logout

// Defense-in-depth: catch any unhandled errors from async callbacks in this process
// (e.g. HTTP parse errors from libraries) so they don't crash the renderer.
process.on('uncaughtException', (err) => {
    console.error('[REMOTE] Uncaught:', err?.message || err);
});
process.on('unhandledRejection', (err) => {
    console.error('[REMOTE] Unhandled rejection:', err?.message || err);
});

// ── IPC: quit / devtools / compact / global shortcut ──
let _streamServer = null;

// ── Mini-MDT bridge state ──
// The renderer pushes its current data here; the server reads it. For plate lookups we
// use a pending-request map keyed by a token the renderer echoes back.
let _streamSnapshot = null;
const _pendingStreamReqs = new Map(); // token -> { resolve, timer }
let _streamReqSeq = 0;

// Renderer → main: push the latest calls/units snapshot for the phone to read.
ipcMain.on('stream-push-data', (_e, snapshot) => { _streamSnapshot = snapshot; });

// Renderer → main: reply to a pending request (plate lookup, call action).
ipcMain.on('stream-response', (_e, { token, data }) => {
    const p = _pendingStreamReqs.get(token);
    if (p) { clearTimeout(p.timer); p.resolve(data); _pendingStreamReqs.delete(token); }
});

// Main → renderer request/response helper: sends a channel + payload to the renderer and
// resolves when the renderer posts back a 'stream-response' with the matching token.
function requestFromRenderer(channel, payload, timeoutMs) {
    return new Promise((resolve) => {
        if (!mainWindow || mainWindow.isDestroyed()) { resolve({ error: 'App window unavailable' }); return; }
        const token = 'sr_' + (++_streamReqSeq) + '_' + Date.now();
        const timer = setTimeout(() => {
            if (_pendingStreamReqs.has(token)) { _pendingStreamReqs.delete(token); resolve({ error: 'Timed out — is the MDT still open and connected?' }); }
        }, timeoutMs || 8000);
        _pendingStreamReqs.set(token, { resolve, timer });
        try { mainWindow.webContents.send(channel, { token, ...payload }); }
        catch (e) { clearTimeout(timer); _pendingStreamReqs.delete(token); resolve({ error: e.message }); }
    });
}

ipcMain.handle('start-streaming', async () => {
    if (_streamServer) return { success: true, alreadyRunning: true };
    // NOTE: main-remote.js runs inside a new Function() with dependencies injected as
    // parameters — `require` does NOT exist here. `http` and `os` are already provided by
    // main.js (see its new Function parameter list), so we use them directly. Calling
    // require('http') here throws "require is not defined" and hangs the streaming UI.
    const interfaces = os.networkInterfaces();
    let localIp = '127.0.0.1';
    for (const iface of Object.values(interfaces)) {
        for (const alias of iface) {
            if (alias.family === 'IPv4' && !alias.internal) { localIp = alias.address; break; }
        }
    }
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"><meta name="theme-color" content="#07090f"><meta name="apple-mobile-web-app-capable" content="yes"><meta name="mobile-web-app-capable" content="yes"><title>East Greenbush MDT</title>
<style>*{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent}
html,body{background:#07090f;color:#e2e8f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;min-height:100vh;-webkit-text-size-adjust:100%}
body{max-width:640px;margin:0 auto;padding-bottom:calc(72px + env(safe-area-inset-bottom))}
.topbar{position:sticky;top:0;z-index:10;background:#07090f;padding:calc(10px + env(safe-area-inset-top)) 14px 10px;border-bottom:1px solid rgba(255,255,255,0.06)}
h1{font-size:15px;font-weight:800;letter-spacing:1.5px;color:#60a5fa;text-transform:uppercase;display:flex;align-items:center;gap:8px}
h1 .live{font-size:8px;background:rgba(16,185,129,0.15);border:1px solid rgba(16,185,129,0.4);color:#6ee7b7;padding:2px 7px;border-radius:999px;letter-spacing:1.5px}
.sub{font-size:10px;color:#4b5563;margin-top:3px;letter-spacing:1px}
.wrap{padding:12px 12px 0}
.card{background:#0d1117;border:1px solid rgba(59,130,246,0.16);border-radius:14px;padding:13px;margin-bottom:11px}
.card-title{font-size:9px;font-weight:800;letter-spacing:2px;text-transform:uppercase;color:#4b5563;margin-bottom:10px;display:flex;justify-content:space-between}
.card-title .count{color:#93c5fd}
.officer{display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid rgba(255,255,255,0.04)}
.officer:last-child{border-bottom:none}
.badge{font-size:11px;font-weight:800;color:#93c5fd;background:rgba(59,130,246,0.12);padding:4px 9px;border-radius:6px;font-family:monospace;flex-shrink:0}
.name{flex:1;font-size:14px;font-weight:600;color:#f1f5f9;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.status{font-size:11px;color:#6b7280;font-weight:700;flex-shrink:0;font-family:monospace}
.panic{background:rgba(239,68,68,0.12);border:1px solid rgba(239,68,68,0.4);border-radius:14px;padding:14px;margin-bottom:11px;animation:pulse 1s infinite}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.55}}
.panic-title{color:#f87171;font-size:14px;font-weight:900}.panic-sub{color:#fca5a5;font-size:12px;margin-top:5px}
.call{background:#0d1117;border:1px solid rgba(255,255,255,0.06);border-left:3px solid #6b7280;border-radius:12px;padding:12px;margin-bottom:10px}
.call.pri{border-left-color:#ef4444;background:rgba(239,68,68,0.05)}
.call.ackd{opacity:.5}
.call-name{font-size:14px;font-weight:700;color:#f1f5f9}
.call-svc{font-size:11px;color:#fbbf24;font-weight:600;margin:3px 0}
.call-desc{font-size:12px;color:#cbd5e1;margin:4px 0;line-height:1.4}
.call-loc{font-size:11px;color:#60a5fa;font-weight:600}
.call-meta{font-size:10px;color:#4b5563;margin-top:6px}
.call-btns{display:flex;gap:8px;margin-top:10px}
.btn{flex:1;padding:10px;border-radius:8px;border:none;font-size:12px;font-weight:700;cursor:pointer}
.btn-ack{background:#10b981;color:#052e16}.btn-dis{background:rgba(255,255,255,0.06);color:#9aa5b1}
.search-row{display:flex;gap:8px;margin-bottom:12px}
.search-row input{flex:1;background:#0d1117;border:1px solid rgba(59,130,246,0.25);border-radius:10px;padding:13px;color:#e2e8f0;font-size:16px;font-family:monospace;letter-spacing:2px;text-transform:uppercase;outline:none}
.search-row button{background:#3b82f6;color:#fff;border:none;border-radius:10px;padding:0 18px;font-size:14px;font-weight:700;cursor:pointer}
.result-field{display:flex;justify-content:space-between;padding:9px 0;border-bottom:1px solid rgba(255,255,255,0.04);font-size:13px}
.result-field .k{color:#6b7280}.result-field .v{color:#f1f5f9;font-weight:600;font-family:monospace}
.stolen{background:rgba(239,68,68,0.15);border:1px solid #ef4444;color:#fca5a5;padding:10px;border-radius:8px;text-align:center;font-weight:800;font-size:12px;margin-bottom:10px}
.empty{color:#374151;font-size:12px;text-align:center;padding:22px 0}
.refresh{color:#374151;font-size:10px;text-align:center;margin:12px 0;letter-spacing:.5px}
.dot{display:inline-block;width:6px;height:6px;border-radius:50%;margin-right:5px;background:#10b981;animation:pulse 2s infinite}
.tabs{position:fixed;bottom:0;left:50%;transform:translateX(-50%);width:100%;max-width:640px;display:flex;background:#0a0e17;border-top:1px solid rgba(255,255,255,0.08);padding-bottom:env(safe-area-inset-bottom);z-index:20}
.tab{flex:1;padding:12px 0 14px;text-align:center;color:#4b5563;font-size:10px;font-weight:700;letter-spacing:.5px;cursor:pointer;border:none;background:none}
.tab.active{color:#60a5fa}.tab svg{display:block;margin:0 auto 4px}
@media(max-width:380px){.name{font-size:13px}h1{font-size:14px}}
</style></head><body>
<div class="topbar"><h1>East Greenbush MDT <span class="live"><span class="dot"></span>LIVE</span></h1><div class="sub" id="sub">MOBILE UNIT</div></div>
<div class="wrap"><div id="root"><div class="empty">Loading...</div></div><div class="refresh" id="ts">Connecting...</div></div>
<div class="tabs">
  <button class="tab active" data-t="units" onclick="setTab('units')"><svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/></svg>Units</button>
  <button class="tab" data-t="calls" onclick="setTab('calls')"><svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M15 17h5l-1.4-1.4A2 2 0 0118 14.2V11a6 6 0 00-4-5.7V5a2 2 0 10-4 0v.3C7.7 6.2 6 8.4 6 11v3.2c0 .5-.2 1-.6 1.4L4 17h5m6 0v1a3 3 0 11-6 0v-1"/></svg>Calls</button>
  <button class="tab" data-t="plate" onclick="setTab('plate')"><svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>Plates</button>
</div>
<script>
var tab='units',data={calls:[],units:[],panic:null},plateRes=null,plateLoading=false;
function setTab(t){tab=t;document.querySelectorAll('.tab').forEach(b=>b.classList.toggle('active',b.dataset.t===t));render();}
function esc(s){return String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));}
async function pull(){try{const r=await fetch('/api/data');data=await r.json();document.getElementById('ts').textContent='Updated '+new Date().toLocaleTimeString();if(tab!=='plate')render();}catch(e){document.getElementById('ts').textContent='Connection lost — retrying...';}}
async function callAction(id,action,author){try{await fetch('/api/call-action',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,action,author})});pull();}catch(e){}}
async function searchPlate(){var q=document.getElementById('pq').value.trim();if(!q)return;plateLoading=true;plateRes=null;render();try{var r=await fetch('/api/plate?q='+encodeURIComponent(q));plateRes=await r.json();}catch(e){plateRes={error:'Request failed'};}plateLoading=false;render();}
function render(){var h='',root=document.getElementById('root');
if(data.panic){h+='<div class="panic"><div class="panic-title">🚨 PANIC — '+esc(data.panic.name)+'</div><div class="panic-sub">Badge #'+esc(data.panic.badge)+' · Session '+esc(data.panic.session)+'</div></div>';}
if(tab==='units'){var o=data.units||[];h+='<div class="card"><div class="card-title"><span>Online Units</span><span class="count">'+o.length+'</span></div>';if(!o.length)h+='<div class="empty">No units online</div>';else o.forEach(function(u){h+='<div class="officer"><span class="badge">#'+esc(u.badge)+'</span><span class="name">'+esc(u.name||u.callSign)+'</span><span class="status">'+esc(u.status)+'</span></div>';});h+='</div>';}
else if(tab==='calls'){var c=data.calls||[];if(!c.length)h+='<div class="empty">No active calls</div>';else c.forEach(function(cl){h+='<div class="call '+(cl.isPriority?'pri':'')+(cl.acknowledged?' ackd':'')+'"><div class="call-name">'+esc(cl.name)+'</div><div class="call-svc">'+esc(cl.services)+'</div><div class="call-desc">'+esc(cl.description)+'</div><div class="call-loc">📍 '+esc(cl.location)+'</div><div class="call-meta">'+esc(cl.author)+' · '+esc(cl.timestamp)+'</div>'+(cl.acknowledged?'':'<div class="call-btns"><button class="btn btn-ack" onclick="callAction(\\''+cl.id+'\\',\\'ack\\',\\''+esc(cl.author)+'\\')">Acknowledge</button><button class="btn btn-dis" onclick="callAction(\\''+cl.id+'\\',\\'dismiss\\',\\''+esc(cl.author)+'\\')">Dismiss</button></div>')+'</div>';});}
else if(tab==='plate'){h+='<div class="search-row"><input id="pq" placeholder="PLATE #" value="'+(plateRes&&plateRes._q?esc(plateRes._q):'')+'" onkeydown="if(event.key===\\'Enter\\')searchPlate()"><button onclick="searchPlate()">Search</button></div>';if(plateLoading)h+='<div class="empty">Searching…</div>';else if(plateRes){if(plateRes.error)h+='<div class="empty">'+esc(plateRes.error)+'</div>';else if(plateRes.notFound)h+='<div class="card"><div class="empty">No registration found for that plate.</div></div>';else{h+='<div class="card">';if(plateRes.reportedStolen)h+='<div class="stolen">⚠ VEHICLE REPORTED STOLEN</div>';[['Plate',plateRes.plate],['Owner',plateRes.owner],['Year',plateRes.year],['Make',plateRes.make],['Model',plateRes.model],['Color',plateRes.color],['Type',plateRes.type]].forEach(function(f){if(f[1])h+='<div class="result-field"><span class="k">'+f[0]+'</span><span class="v">'+esc(f[1])+'</span></div>';});h+='</div>';}}else h+='<div class="empty">Enter a plate to search.</div>';}
root.innerHTML=h;}
pull();setInterval(pull,5000);
</script></body></html>`;
    // ── Mini-MDT data bridge ──
    // The phone page can't use the Discord token (it'd be exposed on the LAN). Instead the
    // renderer — which already fetches & parses calls/units/plates — pushes a snapshot to
    // the main process, and this server serves that snapshot to the phone. Plate lookups are
    // request/response: the server asks the renderer, waits for the answer, returns it.
    _streamServer = http.createServer(async (req, res) => {
        const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type' };
        try {
            const u = new URL(req.url, 'http://localhost');

            // Live snapshot of calls + units (pushed by the renderer, see stream-push-data)
            if (u.pathname === '/api/data') {
                res.writeHead(200, { 'Content-Type': 'application/json', ...cors });
                res.end(JSON.stringify(_streamSnapshot || { calls: [], units: [], panic: null, session: null, updatedAt: 0 }));
                return;
            }

            // Plate lookup — ask the renderer and wait for its reply (max 12s).
            if (u.pathname === '/api/plate') {
                const plate = (u.searchParams.get('q') || '').trim();
                if (!plate) { res.writeHead(400, { 'Content-Type': 'application/json', ...cors }); res.end(JSON.stringify({ error: 'Missing plate' })); return; }
                const result = await requestFromRenderer('stream-plate-lookup', { plate }, 12000);
                res.writeHead(200, { 'Content-Type': 'application/json', ...cors });
                res.end(JSON.stringify(result || { error: 'No response' }));
                return;
            }

            // Acknowledge / dismiss a call from the phone → relayed to the renderer.
            if (u.pathname === '/api/call-action' && req.method === 'POST') {
                let body = ''; req.on('data', c => body += c);
                await new Promise(r => req.on('end', r));
                let parsed = {}; try { parsed = JSON.parse(body || '{}'); } catch (_) {}
                const result = await requestFromRenderer('stream-call-action', parsed, 6000);
                res.writeHead(200, { 'Content-Type': 'application/json', ...cors });
                res.end(JSON.stringify(result || { ok: false }));
                return;
            }

            if (req.method === 'OPTIONS') { res.writeHead(204, cors); res.end(); return; }

            // Default: the mini-MDT page
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(html);
        } catch (e) {
            res.writeHead(500, { 'Content-Type': 'application/json', ...cors });
            res.end(JSON.stringify({ error: e.message }));
        }
    });

    // Properly wait for listen() to succeed OR fail. The old code returned success
    // immediately without awaiting, so if port 3000 was taken the server silently never
    // started and the UI hung on "Starting local server". We now await binding and, on
    // EADDRINUSE, retry a few alternate ports before giving up with a real error.
    const candidatePorts = [3000, 3001, 3002, 3010, 8080, 8081];
    const tryListen = (idx) => new Promise((resolve) => {
        if (idx >= candidatePorts.length) {
            resolve({ success: false, error: 'All candidate ports are in use (3000, 3001, 3002, 3010, 8080, 8081). Close whatever is using them and try again.' });
            return;
        }
        const port = candidatePorts[idx];
        const onError = (err) => {
            _streamServer.removeListener('listening', onListening);
            if (err && err.code === 'EADDRINUSE') {
                resolve(tryListen(idx + 1)); // try next port
            } else {
                resolve({ success: false, error: (err && err.message) || 'Failed to start server' });
            }
        };
        const onListening = () => {
            _streamServer.removeListener('error', onError);
            resolve({ success: true, ip: localIp, port });
        };
        _streamServer.once('error', onError);
        _streamServer.once('listening', onListening);
        _streamServer.listen(port, '0.0.0.0');
    });

    try {
        const result = await tryListen(0);
        if (!result.success) {
            try { _streamServer.close(); } catch (_) {}
            _streamServer = null;
        }
        return result;
    } catch (e) {
        try { if (_streamServer) _streamServer.close(); } catch (_) {}
        _streamServer = null;
        return { success: false, error: e.message };
    }
});
// ── TeamSpeak ClientQuery poll ──
// Renderer calls every 5s with the API key. Main process fetches localhost:25639
// (which is only reachable from the same machine running TS3), parses the channel
// list and client list, maps each client to a department based on nickname format,
// filters to the active session prefix (`1 |`, `2 |`, or `3 |`), and returns a
// normalized officer array. Errors are returned, not thrown — the renderer needs
// a stable shape so it can render an "unavailable" state.
// ClientQuery uses TeamSpeak's escaped key-value wire format, not JSON.
// Records: `key=value key=value|key=value ...` (records separated by `|`).
// Escapes: \s=space, \p=pipe, \/=slash, \\=backslash, \n=newline, \r=cr, \t=tab.
function tsUnescape(s) {
    if (typeof s !== 'string') return s;
    return s.replace(/\\(s|p|\/|\\|n|r|t)/g, (_, c) => {
        switch (c) { case 's': return ' '; case 'p': return '|'; case '/': return '/';
                     case '\\': return '\\'; case 'n': return '\n'; case 'r': return '\r';
                     case 't': return '\t'; default: return c; }
    });
}

// Parse a single ClientQuery response body. Returns { ok, status, body: [records...] }.
// Body may end with `error id=0 msg=ok` — we strip that and return the records.
function tsParse(raw) {
    if (!raw || typeof raw !== 'string') return { ok: false, status: 'empty', body: [] };
    // Split out the trailing `error id=N msg=...` line if present
    const errMatch = raw.match(/(\n|^)error id=(\d+) msg=([^\n]*)/);
    const errId = errMatch ? parseInt(errMatch[2], 10) : 0;
    const errMsg = errMatch ? tsUnescape(errMatch[3] || '') : '';
    const payload = errMatch ? raw.slice(0, errMatch.index).trim() : raw.trim();
    if (errId !== 0) return { ok: false, status: errMsg || `error ${errId}`, body: [] };
    if (!payload) return { ok: true, status: 'ok', body: [] };
    const records = payload.split('|').map(rec => {
        const obj = {};
        rec.split(/\s+/).forEach(pair => {
            const eq = pair.indexOf('=');
            if (eq < 0) return;
            const k = pair.slice(0, eq);
            const v = tsUnescape(pair.slice(eq + 1));
            obj[k] = v;
        });
        return obj;
    });
    return { ok: true, status: 'ok', body: records };
}

// ── tsSession: connect via TCP, auth, run commands, close.
//
// Robustness features:
// • Tries IPv4 (127.0.0.1) first, falls back to IPv6 (::1) if connect fails.
//   ClientQuery on some Windows builds binds to ::1 only — Node won't auto-resolve.
// • Greeting detection accepts ANY known greeting marker, not just the last line.
//   After first data arrives, we wait 150ms for the rest of the greeting then send auth.
// • All response blocks end with `error id=N msg=...` which marks the boundary.
// • Promise never rejects — always resolves with { responses } or { error }.
// • Logs first chunk in main-process console for diagnostics.
function tsSession(apiKey, commands, timeoutMs = 6000) {
    const tryHost = (host) => new Promise((resolve) => {
        const responses = [];
        let buffer = '';
        let phase = 'await-greeting';
        let cmdIndex = 0;
        let settled = false;
        let sock;
        let firstDataLogged = false;
        let greetingTimer = null;
        const finish = (err, val) => {
            if (settled) return;
            settled = true;
            if (greetingTimer) clearTimeout(greetingTimer);
            try { sock && sock.destroy(); } catch (_) {}
            if (err) resolve({ error: err.message || String(err), host });
            else resolve({ responses: val, host });
        };
// writeAndLog must be declared BEFORE proceedToAuth references it
        const writeAndLog = (cmd) => {
            const preview = cmd.replace(/[\r\n]/g, m => m === '\r' ? '\\r' : '\\n');
            console.log(`[TS] → SEND (${cmd.length}b): "${preview}"`);
            try { sock.write(cmd); return true; }
            catch (e) { console.log(`[TS] WRITE ERR: ${e.message}`); finish(e); return false; }
        };
        const proceedToAuth = () => {
            if (phase !== 'await-greeting') return;
            phase = 'await-auth';
            buffer = ''; // discard greeting
            if (!writeAndLog('auth apikey=' + apiKey + '\n')) return;
        };
        try {
            sock = net.createConnection({ host, port: 25639, family: host === '::1' ? 6 : 4 });
        } catch (e) { return finish(e); }
        sock.setEncoding('utf8');
        sock.setTimeout(timeoutMs);
        sock.on('error', e => finish(new Error(
            e.code === 'ECONNREFUSED' ? `ClientQuery not reachable on ${host}:25639 (${e.code})` :
            e.code === 'EHOSTUNREACH' ? `Host ${host} unreachable` :
            (e.message || String(e))
        )));
        sock.on('timeout', () => finish(new Error(`ClientQuery timed out in phase '${phase}' from ${host} — buffer had ${buffer.length}b unparsed`)));
        sock.on('close', () => {
            if (!settled) finish(new Error(`ClientQuery (${host}) closed connection in phase '${phase}'`));
        });
        sock.on('connect', () => {
            console.log(`[TS] Connected to ClientQuery at ${host}:25639`);
        });
        sock.on('data', chunk => {
            if (settled) return;
            buffer += chunk;
            const chunkPreview = String(chunk).slice(0, 300).replace(/[\r\n]/g, m => m === '\r' ? '\\r' : '\\n');
            console.log(`[TS] ← RECV (phase=${phase}, ${chunk.length}b, buf=${buffer.length}b): "${chunkPreview}"`);
            if (!firstDataLogged) firstDataLogged = true;

            // 1) Greeting phase: many possible markers across TS3 versions
            if (phase === 'await-greeting') {
                const sawSelected = /selected schandlerid=\d+/.test(buffer);
                const sawTS3Client = /TS3 Client/.test(buffer);
                const sawWelcome = /Welcome to the TeamSpeak/i.test(buffer);
                // If we see the canonical "selected schandlerid=" line, proceed immediately.
                if (sawSelected) {
                    if (greetingTimer) { clearTimeout(greetingTimer); greetingTimer = null; }
                    return proceedToAuth();
                }
                // If we've seen ANY greeting marker but not the canonical end,
                // schedule a fallback proceedToAuth in 250ms (greeting fully arrived).
                if ((sawTS3Client || sawWelcome) && !greetingTimer) {
                    greetingTimer = setTimeout(proceedToAuth, 250);
                }
                return;
            }

            // 2 & 3) Process complete `error id=N msg=...` blocks
            while (true) {
                const m = buffer.match(/(^|[\r\n])error id=(\d+) msg=([^\n\r]*)[\r\n]+/);
                if (!m) break;
                const blockEnd = m.index + m[0].length;
                const blockText = buffer.slice(0, blockEnd);
                buffer = buffer.slice(blockEnd);
                const errId = parseInt(m[2], 10);
                const errMsg = m[3] || '';

                if (phase === 'await-auth') {
                    if (errId !== 0) {
                        return finish(new Error(`TS auth failed (id=${errId}): ${errMsg} — check API key`));
                    }
                    phase = 'await-cmd';
                    cmdIndex = 0;
                    if (commands.length === 0) {
                        writeAndLog('quit\n');
                        return finish(null, []);
                    }
                    if (!writeAndLog(commands[0] + '\n')) return;
                    continue;
                }

                if (phase === 'await-cmd') {
                    if (errId !== 0) {
                        return finish(new Error(`TS command '${commands[cmdIndex]}' failed (id=${errId}): ${errMsg}`));
                    }
                    responses.push(tsParse(blockText));
                    cmdIndex++;
                    if (cmdIndex < commands.length) {
                        if (!writeAndLog(commands[cmdIndex] + '\n')) return;
                    } else {
                        phase = 'done';
                        writeAndLog('quit\n');
                        return finish(null, responses);
                    }
                    continue;
                }
            }
        });
    });

    // Try IPv4 first, fall back to IPv6 on connect/timeout failure
    return tryHost('127.0.0.1').then(r => {
        if (r.responses) return r;
        const v4err = r.error || '';
        // Don't retry on auth errors (we'd just get the same answer)
        if (/auth failed|check API key/i.test(v4err)) return r;
        console.log(`[TS] IPv4 attempt failed (${v4err}); trying IPv6 ::1`);
        return tryHost('::1').then(r2 => {
            if (r2.responses) return r2;
            // Combine errors so the user sees both attempts
            return { error: `IPv4: ${v4err} | IPv6: ${r2.error || ''}` };
        });
    });
}

// Backwards-compatible single-request helper (legacy callers, if any)
function tsRequest(apiKey, command) {
    return tsSession(apiKey, [command]).then(r => r.responses ? r.responses[0] : null);
}
ipcMain.handle('ts-poll', async (_event, { apiKey, session }) => {
    if (!apiKey || apiKey.length < 10) return { ok: false, reason: 'INVALID_KEY' };
    if (!session) return { ok: false, reason: 'NO_SESSION' };
    const sessionPrefix = String(session) + ' |';

    // Run all three queries in one telnet session. tsSession returns
    // { responses: [...] } on success or { error: string } on failure — never throws.
    const result = await tsSession(apiKey, ['whoami', 'channellist', 'clientlist']);
    if (result.error) {
        return { ok: false, reason: 'ERROR', error: result.error };
    }
    const [whoamiRes, chRes, clRes] = result.responses;

    // whoami body is a single record describing the local client
    const me = (whoamiRes?.body || [])[0] || {};
    const myClid = me.clid;
    const myCid  = me.cid;

    const channels = (chRes?.body || []).filter(c => c && c.channel_name);
    const clients  = (clRes?.body || []).filter(c => c && c.client_nickname && c.client_type === '0');

    // Map cid → { sessionMatch (bool), shortName }
    const channelInfo = {};
    for (const ch of channels) {
        const name = String(ch.channel_name).trim();
        const sessionMatch = name.startsWith(sessionPrefix);
        let short;
        if (sessionMatch) {
            const after = name.slice(sessionPrefix.length).trim();
            short = (after.split(/\s+/)[0] || after).replace(/^VLAW\d+/i, 'VLAW');
        } else {
            short = name.length > 12 ? name.slice(0, 12) + '…' : name;
        }
        channelInfo[ch.cid] = { sessionMatch, short, fullName: name };
    }

    // Department detection from callsign (the part before " | ")
const patterns = [
        // EGFD — engines, ladders, medics, REMS. Accept BOTH dash and space (e.g. "MEDIC-1" or "Medic 1")
        { dept: 'EGFD', re: /^(ENGINE|LADDER|MEDIC|REMS)[-\s]\d+$/i },
        // DOT — tow / truck units
        { dept: 'DOT',  re: /^(TOW|TRUCK)[-\s]\d+$/i },
        // EGPD — RAPID-N (or "Rapid N") and bare 3-digit NNN
        { dept: 'EGPD', re: /^RAPID[-\s]\d+$/i },
        { dept: 'EGPD', re: /^\d{3}$/ },
        // NYSP — many forms. Specific prefixes BEFORE the bare L-N pattern.
        { dept: 'NYSP', re: /^MOTOR[-\s]\d+$/i },     // MOTOR-N or "Motor N"
        { dept: 'NYSP', re: /^\d[A-Z]\d{2}$/i },      // NLNN like 2B02
        { dept: 'NYSP', re: /^\d-[A-Z]\d+$/i },       // N-LN like 1-L1
        { dept: 'NYSP', re: /^[A-Z]-\d+$/i },         // L-N like B-3, C-1, S-1
    ];
    function classify(callsign) {
        for (const p of patterns) {
            if (!p.re.test(callsign)) continue;
            if (p.allowWords) {
                const word = callsign.split('-')[0].toUpperCase();
                if (!p.allowWords.includes(word)) continue;
            }
            return p.dept;
        }
        return 'UNKNOWN';
    }
    function parseNick(nick) {
        nick = String(nick).trim();
        const pipeIdx = nick.indexOf('|');
        if (pipeIdx > -1) {
            return { callsign: nick.slice(0, pipeIdx).trim(), robloxName: nick.slice(pipeIdx + 1).trim() };
        }
        return { callsign: nick, robloxName: '' };
    }

    const officers = [];
    let selfIncluded = false;

    for (const cl of clients) {
        const nick = String(cl.client_nickname).trim();
        const ch = channelInfo[cl.cid];
        const isMe = String(cl.clid) === String(myClid);

        if (!ch) continue; // shouldn't happen but defensive

        // Include only session-channel clients, OR the local user always (so YOU never disappear)
        if (!ch.sessionMatch && !isMe) continue;

        const { callsign, robloxName } = parseNick(nick);
        officers.push({
            clid: cl.clid,
            nickname: nick,
            callsign,
            robloxName,
            channel: ch.short,
            inSession: ch.sessionMatch,
            dept: classify(callsign),
            isMe
        });
        if (isMe) selfIncluded = true;
    }

    // Sort: in-session first, then dept order, then callsign
    const deptOrder = { EGPD: 0, NYSP: 1, EGFD: 2, DOT: 3, UNKNOWN: 4 };
    officers.sort((a, b) => {
        if (a.inSession !== b.inSession) return a.inSession ? -1 : 1;
        const d = (deptOrder[a.dept] ?? 9) - (deptOrder[b.dept] ?? 9);
        if (d !== 0) return d;
        return (a.callsign || '').localeCompare(b.callsign || '');
    });

    return { ok: true, officers, pollAt: Date.now(), selfFound: selfIncluded };
});

ipcMain.handle('stop-streaming', async () => {
    if (_streamServer) { _streamServer.close(); _streamServer = null; }
    return { success: true };
});

ipcMain.on('quit-app', () => {
    console.log('[MAIN] quit-app received');
    globalShortcut.unregisterAll();
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.destroy();
    app.quit();
});

// ── Tamper-detect force quit ──
// Called by the renderer when the central Cloudflare cache detects that a security-
// relevant field on the logged-in user's record has changed mid-session (banned status,
// password, or feature locks). Shows a native Windows messagebox blocking the app, then
// hard-quits. This is intentionally NOT cancellable — the only path forward is restart.
ipcMain.handle('force-quit-with-dialog', async (_e, { title, message, detail }) => {
    try {
        if (mainWindow && !mainWindow.isDestroyed()) {
            await dialog.showMessageBox(mainWindow, {
                type: 'error',
                title: title || 'Connection Failed',
                message: message || 'Connection failed',
                detail: detail || 'Please restart the application.',
                buttons: ['OK'],
                noLink: true
            });
        } else {
            await dialog.showMessageBox({
                type: 'error',
                title: title || 'Connection Failed',
                message: message || 'Connection failed',
                detail: detail || 'Please restart the application.',
                buttons: ['OK'],
                noLink: true
            });
        }
    } catch (_) {}
    try { globalShortcut.unregisterAll(); } catch (_) {}
    try { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.destroy(); } catch (_) {}
    app.quit();
    // Belt and braces in case .quit() is ignored mid-handler
    setTimeout(() => process.exit(0), 100);
    return { ok: true };
});
ipcMain.on('open-dev-tools', () => mainWindow?.webContents.openDevTools());
ipcMain.on('toggle-compact-mode', () => {});

let _panicShortcutKey = null;
ipcMain.handle('register-panic-shortcut', async (event, { key }) => {
    try {
        if (_panicShortcutKey && globalShortcut.isRegistered(_panicShortcutKey)) {
            globalShortcut.unregister(_panicShortcutKey);
        }
    } catch(_) {}
    _panicShortcutKey = null;
    if (!key) return { success: true };
    try {
        const converted = key.replace('CTRL', 'CommandOrControl').replace('ALT', 'Alt').replace('SHIFT', 'Shift');
        globalShortcut.register(converted, () => {
            mainWindow?.webContents.send('global-shortcut-fired', 'panic-trigger');
        });
        _panicShortcutKey = converted;
        return { success: true };
    } catch(e) {
        return { success: false, error: e.message };
    }
});

// ── Pursuit Mode shortcut ──
// Separate from panic and mic so the three can coexist (a single _shortcutKey var would
// clobber). Supports requireFocus exactly like mic/global, since pursuit can be toggled
// while in-game with the app unfocused.
let _pursuitShortcutKey = null;
ipcMain.handle('register-pursuit-shortcut', async (event, { key, requireFocus }) => {
    try {
        if (_pursuitShortcutKey && globalShortcut.isRegistered(_pursuitShortcutKey)) {
            globalShortcut.unregister(_pursuitShortcutKey);
        }
    } catch(_) {}
    _pursuitShortcutKey = null;
    if (!key) return { success: true };
    try {
        const converted = key
            .replace('CTRL', 'CommandOrControl')
            .replace('ALT', 'Alt')
            .replace('SHIFT', 'Shift');
        globalShortcut.register(converted, () => {
            // When requireFocus is true, only fire if our window has focus.
            // When false, fire regardless — that's the whole point of the 🖥️ keybinds.
            if (requireFocus && !windowFocused) return;
            mainWindow?.webContents.send('global-shortcut-fired', 'pursuit-trigger');
        });
        _pursuitShortcutKey = converted;
        return { success: true };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

let _micShortcutKey = null;
ipcMain.handle('register-global-shortcut', async (event, { key, id, requireFocus }) => {
    try {
        if (_micShortcutKey && globalShortcut.isRegistered(_micShortcutKey)) {
            globalShortcut.unregister(_micShortcutKey);
        }
    } catch(_) {}
    _micShortcutKey = null;
    if (!key) return { success: true };
    try {
        const converted = key
            .replace('CTRL', 'CommandOrControl')
            .replace('ALT', 'Alt')
            .replace('SHIFT', 'Shift');
        globalShortcut.register(converted, () => {
            if (requireFocus && !windowFocused) return;
            mainWindow?.webContents.send('global-shortcut-fired', id);
        });
        _micShortcutKey = converted;
        return { success: true };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

// ── IPC: panic ──
ipcMain.handle('trigger-panic-roblox', async () => {
    console.log('[PANIC] trigger-panic-roblox IPC called');

    const ahkPaths = [
        'C:\\Program Files\\AutoHotkey\\v2\\AutoHotkey64.exe',
        'C:\\Program Files\\AutoHotkey\\v2\\AutoHotkey.exe',
        'C:\\Program Files\\AutoHotkey\\AutoHotkey.exe',
        'C:\\Program Files (x86)\\AutoHotkey\\AutoHotkey.exe',
        'C:\\Program Files\\AutoHotkey\\AutoHotkeyU64.exe',
    ];
    const ahkExe = ahkPaths.find(p => fs.existsSync(p));

    const cscPaths = [
        'C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe',
        'C:\\Windows\\Microsoft.NET\\Framework\\v4.0.30319\\csc.exe',
        'C:\\Windows\\Microsoft.NET\\Framework64\\v3.5\\csc.exe',
        'C:\\Windows\\Microsoft.NET\\Framework\\v3.5\\csc.exe',
    ];
    const cscExe = cscPaths.find(p => fs.existsSync(p));

    return new Promise((resolve) => {
        if (ahkExe) {
            const ahkScript = [
                '#Requires AutoHotkey v2.0',
                'if !WinExist("Roblox") {',
                '    ExitApp 1',
                '}',
                'WinActivate "Roblox"',
                'WinWaitActive "Roblox",, 3',
                'Sleep 050',
                'A_Clipboard := "/e panic"',
                'SendEvent "{sc035}"',
                'Sleep 050',
                'SendEvent "^v"',
                'Sleep 050',
                'SendEvent "{Enter}"',
                'ExitApp 0'
            ].join('\n');
            const ahkPath = path.join(os.tmpdir(), 'nysp_panic.ahk');
            fs.writeFileSync(ahkPath, ahkScript, 'utf8');
            mainWindow.blur();
            exec(`"${ahkExe}" "${ahkPath}"`, { timeout: 15000 }, (err) => {
                setTimeout(() => { try { mainWindow.focus(); } catch(_) {} }, 500);
                try { fs.unlinkSync(ahkPath); } catch(_) {}
                if (err?.code === 1) resolve({ success: false, error: 'Roblox not found. Make sure Roblox is open.' });
                else if (err) resolve({ success: false, error: err.message });
                else resolve({ success: true });
            });
            return;
        }

        if (!cscExe) {
            resolve({ success: false, error: 'Neither AutoHotkey nor .NET compiler found.' });
            return;
        }

        const csPath = path.join(os.tmpdir(), 'nysp_panic.cs');
        const exePath = path.join(os.tmpdir(), 'nysp_panic.exe');
        const csCode = `
using System; using System.Runtime.InteropServices; using System.Threading; using System.Diagnostics;
class PanicSender {
    [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr h);
    [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr h, int n);
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint p);
    [DllImport("kernel32.dll")] static extern uint GetCurrentThreadId();
    [DllImport("user32.dll")] static extern bool AttachThreadInput(uint a, uint b, bool c);
    [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] static extern bool AllowSetForegroundWindow(uint p);
    [DllImport("user32.dll")] static extern uint SendInput(uint n, INPUT[] i, int s);
    [StructLayout(LayoutKind.Sequential)] struct INPUT { public uint type; public KEYBDINPUT ki; [MarshalAs(UnmanagedType.ByValArray,SizeConst=8)] public byte[] padding; }
    [StructLayout(LayoutKind.Sequential)] struct KEYBDINPUT { public ushort wVk,wScan; public uint dwFlags,time; public IntPtr dwExtraInfo; }
    static void SendVK(ushort vk, bool up) { INPUT[] i=new INPUT[1]; i[0].type=1; i[0].ki.wVk=vk; i[0].ki.dwFlags=up?2u:0u; i[0].padding=new byte[8]; SendInput(1,i,System.Runtime.InteropServices.Marshal.SizeOf(typeof(INPUT))); }
    static bool ForceFocus(IntPtr hwnd) { uint pid; IntPtr fg=GetForegroundWindow(); uint fgT=GetWindowThreadProcessId(fg,out pid),myT=GetCurrentThreadId(),tgT=GetWindowThreadProcessId(hwnd,out pid); AllowSetForegroundWindow(0xFFFFFFFF); AttachThreadInput(myT,fgT,true); AttachThreadInput(tgT,fgT,true); ShowWindow(hwnd,9); bool r=SetForegroundWindow(hwnd); AttachThreadInput(myT,fgT,false); AttachThreadInput(tgT,fgT,false); return r; }
    static void Main() {
        Process roblox=null;
        foreach(Process p in Process.GetProcesses()) { if(p.MainWindowTitle.Contains("Roblox")&&p.ProcessName!="RobloxPlayerLauncher"&&p.MainWindowHandle!=IntPtr.Zero){roblox=p;break;} }
        if(roblox==null){Console.WriteLine("Not found");Environment.Exit(1);}
        ForceFocus(roblox.MainWindowHandle); Thread.Sleep(1500);
        INPUT[] batch=new INPUT[2]; batch[0].type=1;batch[0].ki.wVk=0xBF;batch[0].ki.dwFlags=0;batch[0].padding=new byte[8]; batch[1].type=1;batch[1].ki.wVk=0xBF;batch[1].ki.dwFlags=2;batch[1].padding=new byte[8]; SendInput(2,batch,System.Runtime.InteropServices.Marshal.SizeOf(typeof(INPUT))); Thread.Sleep(250);
        ushort[] vks={0x45,0x20,0x50,0x41,0x4E,0x49,0x43}; INPUT[] txt=new INPUT[vks.Length*2]; for(int j=0;j<vks.Length;j++){txt[j*2].type=1;txt[j*2].ki.wVk=vks[j];txt[j*2].ki.dwFlags=0;txt[j*2].padding=new byte[8];txt[j*2+1].type=1;txt[j*2+1].ki.wVk=vks[j];txt[j*2+1].ki.dwFlags=2;txt[j*2+1].padding=new byte[8];} SendInput((uint)txt.Length,txt,System.Runtime.InteropServices.Marshal.SizeOf(typeof(INPUT))); Thread.Sleep(250);
        INPUT[] ent=new INPUT[2]; ent[0].type=1;ent[0].ki.wVk=0x0D;ent[0].ki.dwFlags=0;ent[0].padding=new byte[8]; ent[1].type=1;ent[1].ki.wVk=0x0D;ent[1].ki.dwFlags=2;ent[1].padding=new byte[8]; SendInput(2,ent,System.Runtime.InteropServices.Marshal.SizeOf(typeof(INPUT)));
        Console.WriteLine("Done");
    }
}`;
        fs.writeFileSync(csPath, csCode, 'utf8');
        const grantPath = path.join(os.tmpdir(), 'nysp_grant.ps1');
        fs.writeFileSync(grantPath, 'Add-Type @"\nusing System; using System.Runtime.InteropServices;\npublic class FG { [DllImport("user32.dll")] public static extern bool AllowSetForegroundWindow(uint pid); }\n"@\n[FG]::AllowSetForegroundWindow(0xFFFFFFFF)\nWrite-Host "granted"', 'utf8');
        exec(`powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "${grantPath}"`, { timeout: 5000 }, () => {
            try { fs.unlinkSync(grantPath); } catch(_) {}
            exec(`"${cscExe}" /nologo /out:"${exePath}" "${csPath}"`, { timeout: 15000 }, (compErr) => {
                if (compErr) { resolve({ success: false, error: 'Compile failed: ' + compErr.message }); return; }
                mainWindow.blur();
                exec(`"${exePath}"`, { timeout: 15000 }, (runErr) => {
                    setTimeout(() => { try { mainWindow.focus(); } catch(_) {} }, 500);
                    try { fs.unlinkSync(csPath); } catch(_) {}
                    try { fs.unlinkSync(exePath); } catch(_) {}
                    if (runErr?.code === 1) resolve({ success: false, error: 'Roblox not found.' });
                    else if (runErr) resolve({ success: false, error: runErr.message });
                    else resolve({ success: true });
                });
            });
        });
    });
});

// ── IPC: remaining handlers ──
ipcMain.handle('read-settings-file', async () => {
    const paths = [path.join(__dirname, '..', 'CADSystemSettings.txt'), path.join(__dirname, 'CADSystemSettings.txt')];
    for (const p of paths) { try { if (fs.existsSync(p)) return { success: true, content: fs.readFileSync(p, 'utf8') }; } catch(_) {} }
    return { success: false, error: 'Settings file not found' };
});
ipcMain.handle('write-cad-settings', async (event, { content }) => {
    // CRITICAL: write to the SAME file loadSettings() reads at launch, or changes vanish
    // on reboot. loadSettings() prefers the userData copy (and seeds it), so that's the
    // single source of truth. We also mirror to the exe-dir/app-root copies if they exist,
    // so a user editing those by hand still sees consistent data — but userData is
    // authoritative and always written.
    const userDataPath = path.join(app.getPath('userData'), 'CADSystemSettings.txt');
    const mirrorPaths = [
        path.join(path.dirname(process.execPath), 'CADSystemSettings.txt'),
        path.join(__dirname, '..', 'CADSystemSettings.txt'),
        path.join(__dirname, 'CADSystemSettings.txt')
    ];
    try {
        fs.writeFileSync(userDataPath, content, 'utf8'); // authoritative — what launch reads
        for (const p of mirrorPaths) {
            try { if (fs.existsSync(p)) fs.writeFileSync(p, content, 'utf8'); } catch (_) {}
        }
        return { success: true, path: userDataPath };
    } catch (err) {
        // Fallback: if userData is unwritable, at least write app-root so nothing is lost.
        try {
            const dp = path.join(__dirname, '..', 'CADSystemSettings.txt');
            fs.writeFileSync(dp, content, 'utf8');
            return { success: true, path: dp };
        } catch (err2) { return { success: false, error: err2.message }; }
    }
});
ipcMain.handle('save-file', async (event, { filename, content }) => {
    const { filePath } = await dialog.showSaveDialog({ defaultPath: filename, filters: [{ name: 'All Files', extensions: ['*'] }] });
    if (filePath) { fs.writeFileSync(filePath, content); return { success: true, path: filePath }; }
    return { success: false };
});
ipcMain.handle('load-settings', async () => {
    const p = path.join(app.getPath('userData'), 'settings.json');
    try { return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null; } catch(_) { return null; }
});
ipcMain.handle('save-settings', async (event, s) => {
    const p = path.join(app.getPath('userData'), 'settings.json');
    try { fs.writeFileSync(p, JSON.stringify(s, null, 2)); return { success: true }; } catch(err) { return { success: false, error: err.message }; }
});
ipcMain.handle('load-storage', async (event, key) => {
    const p = path.join(app.getPath('userData'), 'storage.json');
    try { return fs.existsSync(p) ? (JSON.parse(fs.readFileSync(p, 'utf8'))[key] || null) : null; } catch(_) { return null; }
});
ipcMain.handle('save-storage', async (event, key, value) => {
    const p = path.join(app.getPath('userData'), 'storage.json');
    try { const d = fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : {}; d[key] = value; fs.writeFileSync(p, JSON.stringify(d, null, 2)); return { success: true }; } catch(err) { return { success: false, error: err.message }; }
});
ipcMain.handle('export-pdf', async (event, { type }) => {
    try {
        const templatePath = path.join(__dirname, `${type}-template.pdf`);
        if (!fs.existsSync(templatePath)) return { success: false, error: `Template not found: ${type}-template.pdf` };
        const outputPath = path.join(app.getPath('temp'), `${type}-${Date.now()}.pdf`);
        fs.writeFileSync(outputPath, fs.readFileSync(templatePath));
        // Open in the user's DEFAULT EXTERNAL BROWSER (not inside the CAD/Electron window,
        // and not the OS PDF app). shell.openExternal with a file:// URL routes to the
        // registered browser. pathToFileURL handles spaces/backslashes correctly on Windows.
        const fileUrl = require('url').pathToFileURL(outputPath).href;
        try {
            await shell.openExternal(fileUrl);
        } catch (extErr) {
            // Fallback to OS default handler if the browser refused the file URL
            await shell.openPath(outputPath);
        }
        return { success: true, path: outputPath };
    } catch(err) { return { success: false, error: err.message }; }
});
// ── Mini-mode ──
// Spotify-miniplayer-style: shrink to a compact always-on-top window in the
// bottom-right. We must clear the window's minimumSize (1200×700) first, or
// setSize is silently clamped back up — that's why the old handler never shrank.
// We remember the pre-mini bounds so exiting restores the exact prior layout.
let _preMiniBounds = null;
ipcMain.handle('set-mini-mode', async (e, { enabled, width, height }) => {
    if (!mainWindow) return { success: false };
    if (enabled) {
        if (!_preMiniBounds) _preMiniBounds = mainWindow.getBounds();
        // Mini-mode and fullscreen are contradictory — leave fullscreen and block it.
        if (mainWindow.isFullScreen()) mainWindow.setFullScreen(false);
        mainWindow.setFullScreenable(false);
        const w = Math.max(220, Math.min(900, Math.round(width || 340)));
        const h = Math.max(300, Math.min(1000, Math.round(height || 520)));
        mainWindow.setMinimumSize(220, 300);
        mainWindow.setResizable(true);
        mainWindow.setAlwaysOnTop(true, 'screen-saver'); // highest practical level
        mainWindow.setSize(w, h);
        // Bottom-right of the current display's work area, with a small margin.
        try {
            const { screen } = require('electron');
            const disp = screen.getDisplayMatching(mainWindow.getBounds());
            const wa = disp.workArea;
            mainWindow.setPosition(wa.x + wa.width - w - 16, wa.y + wa.height - h - 16);
        } catch (_) {}
        return { success: true };
    } else {
        mainWindow.setAlwaysOnTop(false);
        mainWindow.setFullScreenable(true); // allow fullscreen again
        mainWindow.setMinimumSize(1200, 700);
        if (_preMiniBounds) { mainWindow.setBounds(_preMiniBounds); _preMiniBounds = null; }
        else mainWindow.setSize(1400, 900);
        return { success: true };
    }
});
// Live slider resize while already in mini-mode (keeps it anchored bottom-right).
ipcMain.handle('set-mini-size', async (e, { width, height }) => {
    if (!mainWindow) return { success: false };
    const w = Math.max(220, Math.min(900, Math.round(width || 340)));
    const h = Math.max(300, Math.min(1000, Math.round(height || 520)));
    mainWindow.setSize(w, h);
    try {
        const { screen } = require('electron');
        const disp = screen.getDisplayMatching(mainWindow.getBounds());
        const wa = disp.workArea;
        mainWindow.setPosition(wa.x + wa.width - w - 16, wa.y + wa.height - h - 16);
    } catch (_) {}
    return { success: true };
});
ipcMain.handle('toggle-mini-mode', async (e, compact) => {
    mainWindow.setSize(compact ? 120 : 1400, compact ? 450 : 900);
    return { success: true };
});
ipcMain.handle('toggle-always-on-top', async (e, pin) => {
    mainWindow.setAlwaysOnTop(pin);
    return { success: true, pinned: pin };
});

// ── Helper functions ──
function fetchRaw(filename) {
    return new Promise((resolve, reject) => {
        const routes = {
            'live-announcements.js': '/announcements',
            'maintenance.js':        '/maintenance',
            'pdf-templates.js':      '/pdf-templates',
            'pdf-export-enhancer.js':'/pdf-export-enhancer',
            'sounds.js':             '/sounds'
        };
        const route = routes[filename];
        if (!route) return reject(new Error(`Unknown file: ${filename}`));
        const url = `${WORKER_URL}${route}`;
        console.log(`[FETCH] Getting: ${url}`);
        https.get(url, { timeout: 30000 }, (res) => {
            if (res.statusCode !== 200) { reject(new Error(`HTTP ${res.statusCode}`)); return; }
            let data = ''; res.on('data', c => data += c);
            res.on('end', () => { console.log(`[FETCH] Got ${filename}: ${data.length} bytes`); resolve(data); });
        }).on('error', reject);
    });
}

// Exact replica of original injectLocalStorage — preserves all specific key names
function injectLocalStorage(content) {
    if (!content) {
        console.warn('[SETTINGS] No settings to inject');
        mainWindow.show();
        return;
    }

    const parsed = {};
    content.split('\n').forEach(line => {
        const eq = line.indexOf('=');
        if (eq > 0) {
            parsed[line.substring(0, eq).trim()] = line.substring(eq + 1).trim();
        }
    });

    const script = `
        console.log('[MAIN.JS] ═══════════════════════════════════════');
        ${parsed.GroqConsoleAPIKey ? `
            localStorage.setItem('groqConsoleAPIKey', ${JSON.stringify(parsed.GroqConsoleAPIKey)});
            console.log('[MAIN.JS] Groq API key');
        ` : ''}
        ${parsed.DiscordAccountToken && parsed.DiscordAccountToken !== 'HIDDEN' ? `
            localStorage.setItem('discordToken', ${JSON.stringify(parsed.DiscordAccountToken)});
            console.log('[MAIN.JS] Discord token (len: ' + ${JSON.stringify(parsed.DiscordAccountToken)}.length + ')');
        ` : ''}
        ${parsed.DatabaseChannelID ? `
            localStorage.setItem('databaseChannelID', ${JSON.stringify(parsed.DatabaseChannelID)});
            console.log('[MAIN.JS] Database Channel:', ${JSON.stringify(parsed.DatabaseChannelID)});
        ` : ''}
        ${parsed.RegistrationChannelID ? `
            localStorage.setItem('registrationChannelID', ${JSON.stringify(parsed.RegistrationChannelID)});
            console.log('[MAIN.JS] Registration Channel:', ${JSON.stringify(parsed.RegistrationChannelID)});
        ` : ''}
        ${parsed.GuildID ? `
            localStorage.setItem('guildID', ${JSON.stringify(parsed.GuildID)});
            console.log('[MAIN.JS] Guild ID:', ${JSON.stringify(parsed.GuildID)});
        ` : ''}
        console.log('[MAIN.JS] ═══════════════════════════════════════');
    `;

    if (AUTO_OPEN_DEVTOOLS) mainWindow.webContents.openDevTools();

    mainWindow.webContents.executeJavaScript(script);

    // Inject compact-mode CSS and JS from local src/
    ['compact-mode.css', 'compact-mode.js', 'pdf-export-enhancer.js'].forEach(file => {
        const p = path.join(__dirname, 'src', file);
        if (fs.existsSync(p)) {
            const fileContent = fs.readFileSync(p, 'utf8');
            if (file.endsWith('.css')) mainWindow.webContents.insertCSS(fileContent);
            else mainWindow.webContents.executeJavaScript(fileContent);
        }
    });

    mainWindow.show();
    console.log('[MAIN] Ready!');
    try { fs.writeFileSync(path.join(os.tmpdir(), 'nysp_mdt_ready.flag'), '1'); } catch(_) {}
}

// ── Main startup logic ──
const localHtml = path.join(__dirname, 'src', 'index.html');
const tempHtml = path.join(app.getPath('temp'), 'nysp-mdt.html');

if (USE_LOCAL_INDEX) {
    console.log('[LOADER] USE_LOCAL_INDEX=true — loading local src/index.html');
    Promise.all([
        fetchRaw('live-announcements.js'),
        fetchRaw('maintenance.js').catch(() => 'window.MAINTENANCE = false; console.log("[MAINTENANCE] Default: false");'),
        fetchRaw('pdf-templates.js').catch(() => 'console.log("[PDF] Templates not loaded");'),
        fetchRaw('pdf-export-enhancer.js').catch(() => 'console.log("[PDF] Enhancer not loaded");')
    ]).then(([announcements, maintenance, pdfTemplates, pdfEnhancer]) => {
        mainWindow.loadFile(localHtml);
        mainWindow.webContents.once('did-finish-load', () => {
            [announcements, maintenance, pdfTemplates, pdfEnhancer].forEach(s =>
                mainWindow.webContents.executeJavaScript(s).catch(() => {})
            );
            injectLocalStorage(settings);
        });
    }).catch(err => {
        console.error('[LOADER] Error in local mode:', err.message);
        mainWindow.loadFile(localHtml);
        mainWindow.webContents.once('did-finish-load', () => injectLocalStorage(settings));
    });
} else {
    console.log('[LOADER] Fetching from GitHub...');

    // Build sounds script directly from branch URL (same as original main.js)
    const GITHUB_SOUNDS_BASE = `https://raw.githubusercontent.com/${GITHUB_REPO}/${GITHUB_BRANCH_ENCODED}`;
    const soundsScript = `window.SOUNDS = {TIMER_SIDEPANEL: '${GITHUB_SOUNDS_BASE}/TIMER_SIDEPANEL.mp3', panicAlarm: '${GITHUB_SOUNDS_BASE}/panicAlarm.mp3', platePass: '${GITHUB_SOUNDS_BASE}/platePass.mp3', plateFail: '${GITHUB_SOUNDS_BASE}/plateFail.mp3', callAlert: '${GITHUB_SOUNDS_BASE}/CallIncoming.mp3', PriorityCallIncoming: '${GITHUB_SOUNDS_BASE}/PriorityCallIncoming.mp3', warrantAlert: '${GITHUB_SOUNDS_BASE}/warrantAlert.mp3', StartupSFX: '${GITHUB_SOUNDS_BASE}/StartupSFX.mp3', LoginAccessDenied: '${GITHUB_SOUNDS_BASE}/LoginAccessDenied.mp3', LoginIncorrect: '${GITHUB_SOUNDS_BASE}/LoginIncorrect.mp3', LoginPageCorrect: '${GITHUB_SOUNDS_BASE}/LoginPageCorrect.mp3', MIC_ACTIVESFX: '${GITHUB_SOUNDS_BASE}/MIC_ACTIVESFX.mp3', MIC_INACTIVESFX: '${GITHUB_SOUNDS_BASE}/MIC_INACTIVESFX.mp3', MIC_NOTAVAILABLESFX: '${GITHUB_SOUNDS_BASE}/MIC_NOTAVAILABLESFX.mp3', noCitizenSFX: '${GITHUB_SOUNDS_BASE}/noCitizenSFX.mp3', clientSessionExpirationWarning: '${GITHUB_SOUNDS_BASE}/clientSessionExpirationWarning.mp3', PursuitModeActive: '${GITHUB_SOUNDS_BASE}/PursuitModeActive.mp3', PursuitModeNotActive: '${GITHUB_SOUNDS_BASE}/PursuitModeNotActive.mp3' }; window.SOUNDS_BASE64 = window.SOUNDS; console.log('[SOUNDS] Ready from branch ${GITHUB_BRANCH}! Keys:', Object.keys(window.SOUNDS).join(', '));`;

    Promise.all([
        // PERF: SHA is already resolved by main.js and injected as PRELOADED_SHA.
        // Previously this block called the GitHub commits API TWICE more (once for
        // display, once chained before index.html) — the single biggest cause of slow
        // cold starts, since that API is slow and rate-limited to 60/hr unauthenticated.
        // Now we reuse the preloaded SHA and go straight to the fast raw CDN.
        Promise.resolve((typeof PRELOADED_SHA === 'string' ? PRELOADED_SHA : GITHUB_BRANCH_ENCODED).substring(0, 7)),
        // index.html directly from the raw CDN by SHA (no API hop, cache-busted by SHA)
        new Promise((resolve, reject) => {
            const shaRef = (typeof PRELOADED_SHA === 'string' && PRELOADED_SHA) ? PRELOADED_SHA : GITHUB_BRANCH_ENCODED;
            console.log(`[FETCH] Fetching index.html at SHA: ${String(shaRef).substring(0, 7)}`);
            https.get(`https://raw.githubusercontent.com/${GITHUB_REPO}/${shaRef}/index.html`, { timeout: 30000 }, (res) => {
                let html = ''; res.on('data', c => html += c);
                res.on('end', () => { console.log(`[FETCH] Got index.html: ${html.length} bytes`); resolve(html); });
            }).on('error', reject);
        }),
        fetchRaw('live-announcements.js'),
        fetchRaw('maintenance.js').catch(() => 'window.MAINTENANCE = false; console.log("[MAINTENANCE] Default: false");'),
        fetchRaw('pdf-templates.js').catch(() => 'console.log("[PDF] Templates not loaded");'),
        Promise.resolve(soundsScript),
        fetchRaw('pdf-export-enhancer.js').catch(() => 'console.log("[PDF] Enhancer not loaded");')
    ])
    .then(([commitSha, html, announcements, maintenance, pdfTemplates, sounds, pdfEnhancer]) => {
        if (!html.trim().startsWith('<!DOCTYPE') && !html.trim().startsWith('<html')) {
            throw new Error('Invalid HTML returned from GitHub');
        }

        console.log('[LOADER] Got valid HTML');

        const settingsScript = `<script>
            console.log('[PRELOAD] Injecting settings from main.js...');
            window.SETTINGS_FILE_CONTENT = ${JSON.stringify(settings)};
            console.log('[PRELOAD] Settings injected BEFORE React loads');
        </script>`;
        const buildScript = `<script>window.APP_COMMIT_SHA = '${commitSha}'; window.APP_GITHUB_BRANCH = '${GITHUB_BRANCH}'; window.SESSION_INACTIVITY_SECONDS = ${SESSION_INACTIVITY_SECONDS}; window.SESSION_WARNING_COUNTDOWN_SECONDS = ${SESSION_WARNING_COUNTDOWN_SECONDS};</script>`;

        html = html.replace('</head>', settingsScript + buildScript + '</head>');
        fs.writeFileSync(tempHtml, html, 'utf8');
        mainWindow.loadFile(tempHtml);

        mainWindow.webContents.once('did-finish-load', () => {
            mainWindow.webContents.executeJavaScript(announcements)
                .then(() => console.log('[LOADER] Announcements injected'))
                .catch(e => console.error('[LOADER] Announcements error:', e));
            mainWindow.webContents.executeJavaScript(maintenance)
                .then(() => console.log('[LOADER] Maintenance injected'))
                .catch(e => console.error('[LOADER] Maintenance error:', e));
            mainWindow.webContents.executeJavaScript(pdfTemplates)
                .then(() => console.log('[LOADER] PDF templates injected'))
                .catch(e => console.error('[LOADER] PDF templates error:', e));
            mainWindow.webContents.executeJavaScript(sounds)
                .then(() => console.log('[LOADER] ✅ Sounds injected'))
                .catch(e => console.error('[LOADER] Sounds error:', e));
            mainWindow.webContents.executeJavaScript(pdfEnhancer)
                .then(() => console.log('[LOADER] PDF enhancer injected'))
                .catch(e => console.error('[LOADER] PDF enhancer error:', e));

            injectLocalStorage(settings);
        });
    })
    .catch(err => {
        console.error('[LOADER] ❌ GitHub fetch failed:', err.message);
        console.log('[LOADER] Loading local fallback...');
        mainWindow.loadFile(localHtml);
        mainWindow.webContents.once('did-finish-load', () => {
            if (settings) {
                mainWindow.webContents.executeJavaScript(`
                    window.SETTINGS_FILE_CONTENT = ${JSON.stringify(settings)};
                `);
            }
            if (AUTO_OPEN_DEVTOOLS) mainWindow.webContents.openDevTools();
            injectLocalStorage(settings);
        });
    });
}

// ============================================================
// ROBLOX API — direct fetch from main process (no CORS, no proxies)
// ============================================================
// The renderer can't hit users.roblox.com directly because of CORS.
// But the main process is Node — no CORS. So we fetch here and hand back JSON.
// Renderer calls: window.electron.invoke('roblox-fetch', { url })

// POST helper for Roblox endpoints that take a JSON body (e.g. /v1/usernames/users).
// The POST username-resolve endpoint is far less rate-limited than GET /v1/users/search.
function _robloxHttpsPost(targetUrl, bodyObj) {
    return new Promise((resolve, reject) => {
        let parsed;
        try { parsed = new URL(targetUrl); } catch (e) { return reject(new Error('Bad URL')); }
        const allowed = ['users.roblox.com', 'thumbnails.roblox.com', 'avatar.roblox.com', 'api.roblox.com', 'www.roblox.com'];
        if (!allowed.includes(parsed.hostname)) return reject(new Error('Domain not allowed: ' + parsed.hostname));
        const payload = JSON.stringify(bodyObj || {});
        const req = https.request({
            hostname: parsed.hostname,
            path: parsed.pathname + parsed.search,
            method: 'POST',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload),
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'
            }
        }, (res) => {
            let raw = '';
            res.on('data', c => raw += c);
            res.on('end', () => {
                const retryAfter = parseInt(res.headers['retry-after'], 10);
                resolve({ status: res.statusCode, body: raw, retryAfter: Number.isFinite(retryAfter) ? retryAfter : null });
            });
        });
        req.on('error', reject);
        req.setTimeout(8000, () => { req.destroy(); reject(new Error('timeout')); });
        req.write(payload);
        req.end();
    });
}

function _robloxHttpsGet(targetUrl) {
    return new Promise((resolve, reject) => {
        let parsed;
        try { parsed = new URL(targetUrl); } catch (e) { return reject(new Error('Bad URL')); }
        // Allowlist — only Roblox domains
        const allowed = ['users.roblox.com', 'thumbnails.roblox.com', 'avatar.roblox.com', 'api.roblox.com', 'www.roblox.com'];
        if (!allowed.includes(parsed.hostname)) return reject(new Error('Domain not allowed: ' + parsed.hostname));

        const req = https.request({
            hostname: parsed.hostname,
            path: parsed.pathname + parsed.search,
            method: 'GET',
            headers: {
                'Accept': 'application/json',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'
            }
        }, (res) => {
            let raw = '';
            res.on('data', c => raw += c);
            res.on('end', () => {
                const retryAfter = parseInt(res.headers['retry-after'], 10);
                resolve({ status: res.statusCode, body: raw, retryAfter: Number.isFinite(retryAfter) ? retryAfter : null });
            });
        });
        req.on('error', reject);
        req.setTimeout(8000, () => { req.destroy(); reject(new Error('timeout')); });
        req.end();
    });
}

// ── Durable Roblox fetch: cache + in-flight dedup + 429 backoff ──
// Roblox aggressively rate-limits (429) bursts of requests, especially from non-browser
// clients. The CAD can fire several lookups for the same user within seconds, which trips
// the limit. Three layers prevent that from ever surfacing as a "BACKEND ERROR":
//   1. 6h success cache — repeat lookups of the same person never re-hit Roblox.
//   2. In-flight dedup — simultaneous identical requests share ONE network call.
//   3. 429 backoff — on a 429, wait (honoring Retry-After) and retry inside main, so the
//      renderer receives a success instead of a transient failure.
const _robloxCache = new Map();      // url -> { at, status, body }
const _robloxInflight = new Map();   // url -> Promise<{status, body}>
const _ROBLOX_TTL = 6 * 60 * 60 * 1000; // 6 hours
const _sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function _robloxFetchWithBackoff(url) {
    const maxAttempts = 4;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const result = await _robloxHttpsGet(url);
        if (result.status === 429) {
            if (attempt === maxAttempts - 1) return result; // give up, return the 429
            // Honor Retry-After if present, else exponential backoff capped at 8s.
            const waitMs = (result.retryAfter ? result.retryAfter * 1000 : Math.min(1000 * Math.pow(2, attempt), 8000));
            await _sleep(waitMs);
            continue;
        }
        return result;
    }
}

ipcMain.handle('roblox-fetch', async (_e, { url }) => {
    try {
        // 1) Serve from cache
        const cached = _robloxCache.get(url);
        if (cached && (Date.now() - cached.at) < _ROBLOX_TTL) {
            return { ok: true, status: cached.status, body: cached.body, cached: true };
        }
        // 2) Coalesce duplicate concurrent requests for the same URL
        if (_robloxInflight.has(url)) {
            const result = await _robloxInflight.get(url);
            return { ok: true, status: result.status, body: result.body, cached: false, coalesced: true };
        }
        // 3) Fetch with 429 backoff
        const promise = _robloxFetchWithBackoff(url);
        _robloxInflight.set(url, promise);
        let result;
        try {
            result = await promise;
        } finally {
            _robloxInflight.delete(url);
        }
        if (result.status >= 200 && result.status < 300) {
            _robloxCache.set(url, { at: Date.now(), status: result.status, body: result.body });
            if (_robloxCache.size > 500) {
                const firstKey = _robloxCache.keys().next().value;
                _robloxCache.delete(firstKey);
            }
        }
        return { ok: true, status: result.status, body: result.body, cached: false };
    } catch (e) {
        return { ok: false, error: e.message };
    }
});

// ── Resolve an exact username → user object via POST /v1/usernames/users ──
// This replaces GET /v1/users/search, which Roblox rate-limits (429) extremely aggressively
// from non-browser clients. The POST endpoint is the official username-resolution path and
// is far more lenient. Cached for 6h keyed by lowercase username.
const _robloxNameCache = new Map(); // lowercaseName -> { at, user }
ipcMain.handle('roblox-resolve-username', async (_e, { username }) => {
    try {
        const key = (username || '').trim().toLowerCase();
        if (!key) return { ok: false, error: 'empty username' };
        const cached = _robloxNameCache.get(key);
        if (cached && (Date.now() - cached.at) < _ROBLOX_TTL) {
            return { ok: true, user: cached.user, cached: true };
        }
        // Retry with backoff on the rare 429
        let result;
        for (let attempt = 0; attempt < 4; attempt++) {
            result = await _robloxHttpsPost('https://users.roblox.com/v1/usernames/users', {
                usernames: [username],
                excludeBannedUsers: false
            });
            if (result.status === 429 && attempt < 3) {
                const waitMs = result.retryAfter ? result.retryAfter * 1000 : Math.min(1000 * Math.pow(2, attempt), 8000);
                await new Promise(r => setTimeout(r, waitMs));
                continue;
            }
            break;
        }
        if (result.status >= 200 && result.status < 300) {
            let parsed;
            try { parsed = JSON.parse(result.body); } catch (_) { parsed = null; }
            const user = parsed?.data?.[0] || null;
            if (user) {
                _robloxNameCache.set(key, { at: Date.now(), user });
                if (_robloxNameCache.size > 500) {
                    const firstKey = _robloxNameCache.keys().next().value;
                    _robloxNameCache.delete(firstKey);
                }
            }
            return { ok: true, user, status: result.status };
        }
        return { ok: false, status: result.status, error: 'Roblox returned ' + result.status };
    } catch (e) {
        return { ok: false, error: e.message };
    }
});

// Fetch a Roblox CDN image and return it as a base64 data URL (for avatars).
ipcMain.handle('roblox-image', async (_e, { url }) => {
    try {
        let parsed;
        try { parsed = new URL(url); } catch (_) { return { ok: false, error: 'bad url' }; }
        // Roblox CDN images live on rbxcdn.com subdomains
        if (!/\.rbxcdn\.com$/.test(parsed.hostname) && !parsed.hostname.endsWith('roblox.com')) {
            return { ok: false, error: 'domain not allowed' };
        }
        const data = await new Promise((resolve, reject) => {
            https.get(url, (res) => {
                if (res.statusCode !== 200) { reject(new Error('status ' + res.statusCode)); return; }
                const chunks = [];
                res.on('data', c => chunks.push(c));
                res.on('end', () => resolve(Buffer.concat(chunks)));
            }).on('error', reject);
        });
        const contentType = 'image/png';
        return { ok: true, dataUrl: `data:${contentType};base64,${data.toString('base64')}` };
    } catch (e) {
        return { ok: false, error: e.message };
    }
});

// ============================================================
// SPOTIFY INTEGRATION — OAuth (PKCE) + Polling
// ============================================================
// Flow:
//   1. Renderer calls `spotify-begin-auth` with the user's Client ID
//   2. Main starts a one-shot HTTP listener on 127.0.0.1:8888
//   3. Main opens https://accounts.spotify.com/authorize?...&code_challenge=...
//      in the user's default browser via shell.openExternal
//   4. User logs in, grants permission, Spotify redirects to 127.0.0.1:8888/callback?code=...
//   5. Listener captures the code, exchanges it for access+refresh tokens via PKCE
//   6. Tokens persisted; main starts a 5s poll loop for currently-playing track
//   7. Renderer subscribes via `spotify-state` event sender

// crypto is injected by main.js — no require needed (require is not in scope)
let _spotifyState = {
    clientId: null,
    accessToken: null,
    refreshToken: null,
    expiresAt: 0,
    product: null,
    deviceId: null,
    nowPlaying: null,
    error: null,
    volume: 50,
    pollTimer: null
};
let _spotifyAuthServer = null;
let _spotifyCodeVerifier = null;

function _spotifyBase64Url(buf) {
    return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function _spotifyMakePkce() {
    const verifier = _spotifyBase64Url(crypto.randomBytes(32));
    const challenge = _spotifyBase64Url(crypto.createHash('sha256').update(verifier).digest());
    return { verifier, challenge };
}

function _spotifyHttpsJSON(method, hostname, path, headers, body) {
    return new Promise((resolve, reject) => {
        const req = https.request({ hostname, port: 443, path, method, headers: headers || {} }, (res) => {
            let raw = '';
            res.on('data', c => raw += c);
            res.on('end', () => {
                try {
                    const parsed = raw ? JSON.parse(raw) : {};
                    if (res.statusCode >= 200 && res.statusCode < 300) resolve(parsed);
                    else reject(new Error(`Spotify ${method} ${path} → ${res.statusCode}: ${parsed.error_description || parsed.error?.message || raw.slice(0, 200)}`));
                } catch (e) { reject(new Error(`Spotify parse error: ${e.message}`)); }
            });
        });
        req.on('error', reject);
        if (body) req.write(body);
        req.end();
    });
}

async function _spotifyExchangeCode(code) {
    const body = new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: 'http://127.0.0.1:8888/callback',
        client_id: _spotifyState.clientId,
        code_verifier: _spotifyCodeVerifier
    }).toString();
    return _spotifyHttpsJSON('POST', 'accounts.spotify.com', '/api/token',
        { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body) }, body);
}

async function _spotifyRefresh() {
    if (!_spotifyState.refreshToken || !_spotifyState.clientId) return false;
    try {
        const body = new URLSearchParams({
            grant_type: 'refresh_token',
            refresh_token: _spotifyState.refreshToken,
            client_id: _spotifyState.clientId
        }).toString();
        const r = await _spotifyHttpsJSON('POST', 'accounts.spotify.com', '/api/token',
            { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body) }, body);
        _spotifyState.accessToken = r.access_token;
        _spotifyState.expiresAt = Date.now() + (r.expires_in - 60) * 1000;
        if (r.refresh_token) _spotifyState.refreshToken = r.refresh_token;
        return true;
    } catch (e) { _spotifyState.error = 'Refresh failed: ' + e.message; return false; }
}

async function _spotifyEnsureToken() {
    if (!_spotifyState.accessToken) return false;
    if (Date.now() < _spotifyState.expiresAt - 5000) return true;
    return await _spotifyRefresh();
}

async function _spotifyApiGet(path) {
    if (!await _spotifyEnsureToken()) throw new Error('No access token');
    return _spotifyHttpsJSON('GET', 'api.spotify.com', '/v1' + path,
        { 'Authorization': 'Bearer ' + _spotifyState.accessToken });
}

function _spotifyApiSend(method, path, body) {
    return new Promise((resolve, reject) => {
        const data = body ? JSON.stringify(body) : '';
        const headers = { 'Authorization': 'Bearer ' + _spotifyState.accessToken };
        if (data) { headers['Content-Type'] = 'application/json'; headers['Content-Length'] = Buffer.byteLength(data); }
        else headers['Content-Length'] = 0;
        const req = https.request({ hostname: 'api.spotify.com', port: 443, path: '/v1' + path, method, headers }, (res) => {
            let raw = '';
            res.on('data', c => raw += c);
            res.on('end', () => {
                if (res.statusCode >= 200 && res.statusCode < 300) resolve({ ok: true });
                else if (res.statusCode === 404) resolve({ ok: false, error: 'NO_DEVICE' });
                else if (res.statusCode === 403) resolve({ ok: false, error: 'PREMIUM_REQUIRED' });
                else reject(new Error(`Spotify ${method} ${path} → ${res.statusCode}: ${raw.slice(0, 200)}`));
            });
        });
        req.on('error', reject);
        if (data) req.write(data);
        req.end();
    });
}

async function _spotifyControl(method, path, body) {
    if (!await _spotifyEnsureToken()) throw new Error('No access token');
    return _spotifyApiSend(method, path, body);
}

async function _spotifyPollOnce() {
    if (!_spotifyState.accessToken) return;
    try {
        if (!_spotifyState.product) {
            try {
                const me = await _spotifyApiGet('/me');
                _spotifyState.product = me.product || 'free';
                if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.webContents.send('spotify-profile', { product: _spotifyState.product, displayName: me.display_name });
                }
            } catch (_) {}
        }
        const r = await _spotifyApiGet('/me/player');
        if (!r || !r.item) {
            _spotifyState.nowPlaying = null;
            _spotifyState.deviceId = r?.device?.id || null;
            _spotifyState.error = null;
        } else {
            _spotifyState.deviceId = r.device?.id || null;
            _spotifyState.volume = (typeof r.device?.volume_percent === 'number') ? r.device.volume_percent : _spotifyState.volume;
            _spotifyState.nowPlaying = {
                track: r.item.name,
                artist: (r.item.artists || []).map(a => a.name).join(', '),
                album: r.item.album?.name,
                art: r.item.album?.images?.[0]?.url || null,
                isPlaying: r.is_playing === true,
                progressMs: r.progress_ms || 0,
                durationMs: r.item.duration_ms || 0,
                trackId: r.item.id,
                url: r.item.external_urls?.spotify || null,
                volume: _spotifyState.volume,
                shuffle: r.shuffle_state === true,
                repeat: r.repeat_state || 'off'
            };
            _spotifyState.error = null;
        }
    } catch (e) { _spotifyState.error = e.message; }
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('spotify-state', {
            connected: !!_spotifyState.accessToken,
            product: _spotifyState.product,
            deviceId: _spotifyState.deviceId,
            nowPlaying: _spotifyState.nowPlaying,
            volume: _spotifyState.volume,
            error: _spotifyState.error
        });
    }
}

function _spotifyStartPolling() {
    if (_spotifyState.pollTimer) clearInterval(_spotifyState.pollTimer);
    // Adaptive cadence:
    //  • Playing → poll every 5s (the "count to 4, update on the 5th" feel). The renderer
    //    ticks the progress bar locally between polls so it stays smooth without spamming the API.
    //  • Paused/idle → poll every 15s only (a paused track's position doesn't move, so frequent
    //    polling is wasted). When you pause/resume THROUGH our app, _spotifyPollSoon() fires an
    //    immediate poll so the timestamp is exact the instant state changes.
    const schedule = () => {
        if (_spotifyState.pollTimer) { clearInterval(_spotifyState.pollTimer); _spotifyState.pollTimer = null; }
        const playing = !!(_spotifyState.nowPlaying && _spotifyState.nowPlaying.isPlaying);
        const interval = playing ? 5000 : 15000;
        _spotifyState.pollTimer = setInterval(() => { _spotifyPollOnce().then(() => {
            // If playback state flipped since this interval was set, reschedule at the new cadence.
            const nowPlaying = !!(_spotifyState.nowPlaying && _spotifyState.nowPlaying.isPlaying);
            if (nowPlaying !== playing) schedule();
        }); }, interval);
    };
    _spotifyPollOnce().then(schedule);
}

// Immediate poll shortly after a control action, then re-evaluate cadence.
function _spotifyPollSoon(delay = 250) {
    setTimeout(() => { _spotifyPollOnce().then(() => _spotifyStartPolling()); }, delay);
}

function _spotifyStopPolling() {
    if (_spotifyState.pollTimer) { clearInterval(_spotifyState.pollTimer); _spotifyState.pollTimer = null; }
}

// ── App-only resource metrics (Debug view) ──
// app.getAppMetrics() reports EVERY process this Electron app owns (main/"Browser",
// each renderer, the GPU process, utilities) — and nothing else on the machine. So the
// numbers here are strictly this application's usage, not system-wide.
//
// Honest limitation: Chromium exposes the GPU *process's* CPU and RAM, but NOT the
// GPU's core utilization percentage. There is no API for that. We report what is real
// and label it accordingly rather than inventing a GPU-usage gauge.
// ── Eco Mode (main-process side) ──
// The renderer toggles this. The single biggest measured cost was the window rendering
// at 144 FPS on a static screen. Capping the frame rate to 30 FPS cuts GPU-process and
// renderer churn substantially with no visible difference on a data terminal.
// setFrameRate requires backgroundThrottling to behave; we also let the OS throttle
// when the window isn't focused.
ipcMain.handle('set-eco-mode', (_e, { enabled, frameRate, throttle } = {}) => {
    try {
        if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents) {
            const wc = mainWindow.webContents;
            // Eco ON: cap to 30-60. Eco OFF: caller sends 240 = "display max" (uncapped),
            // which restores native refresh (144Hz etc.). Electron clamps to the actual
            // monitor rate, so 240 never over-drives the display.
            let fps = typeof frameRate === 'number' ? frameRate : (enabled ? 30 : 240);
            fps = Math.max(30, Math.min(240, Math.round(fps)));
            wc.setFrameRate(fps);
            // Re-assert shortly after — setFrameRate can be dropped if called mid-swap.
            setTimeout(() => { try { if (!wc.isDestroyed()) wc.setFrameRate(fps); } catch (_) {} }, 60);
            // Throttle only when Eco is on AND the user opted in; never throttle a focused
            // full-rate window (that was contributing to the "feels like 30" sluggishness).
            wc.setBackgroundThrottling(throttle === true);
        }
        return { ok: true, frameRate: Math.max(30, Math.min(240, Math.round(typeof frameRate === 'number' ? frameRate : (enabled ? 30 : 240)))) };
    } catch (e) {
        return { ok: false, error: e.message };
    }
});

// Bring the main window to the front (used when a call OS-notification is clicked).
ipcMain.handle('focus-window', () => {
    try {
        if (mainWindow && !mainWindow.isDestroyed()) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.show();
            mainWindow.focus();
        }
        return { ok: true };
    } catch (e) { return { ok: false, error: e.message }; }
});

ipcMain.handle('get-app-metrics', () => {
    try {
        const metrics = app.getAppMetrics();
        let totalRamMB = 0, totalCpu = 0, rendererRamMB = 0;
        let gpuRamMB = null, gpuCpu = null, mainRamMB = null;

        for (const m of metrics) {
            const ramMB = (m.memory && m.memory.workingSetSize ? m.memory.workingSetSize : 0) / 1024; // KB → MB
            const cpu = (m.cpu && m.cpu.percentCPUUsage) ? m.cpu.percentCPUUsage : 0;
            totalRamMB += ramMB;
            totalCpu += cpu;
            if (m.type === 'GPU') { gpuRamMB = ramMB; gpuCpu = cpu; }
            else if (m.type === 'Browser') { mainRamMB = ramMB; }
            else { rendererRamMB += ramMB; }
        }

        const r1 = (n) => (n === null || isNaN(n)) ? null : Math.round(n * 10) / 10;
        return {
            ok: true,
            processCount: metrics.length,
            totalRamMB:      r1(totalRamMB),
            totalCpuPercent: r1(totalCpu),      // summed across processes; can exceed 100 (per-core)
            mainRamMB:       r1(mainRamMB),
            rendererRamMB:   r1(rendererRamMB),
            gpuRamMB:        r1(gpuRamMB),
            gpuCpuPercent:   r1(gpuCpu)
        };
    } catch (e) {
        return { ok: false, error: e.message };
    }
});

ipcMain.handle('spotify-init', async (_e, { clientId, refreshToken }) => {
    if (!clientId || clientId.length < 25) return { ok: false, reason: 'INVALID_CLIENT_ID' };
    _spotifyState.clientId = clientId;
    if (refreshToken) {
        _spotifyState.refreshToken = refreshToken;
        const ok = await _spotifyRefresh();
        if (ok) { _spotifyStartPolling(); return { ok: true, hasAuth: true }; }
        return { ok: true, hasAuth: false, error: _spotifyState.error };
    }
    return { ok: true, hasAuth: false };
});

ipcMain.handle('spotify-begin-auth', async (_e, { clientId }) => {
    if (!clientId || clientId.length < 25) return { ok: false, reason: 'INVALID_CLIENT_ID' };
    _spotifyState.clientId = clientId;
    if (_spotifyAuthServer) { try { _spotifyAuthServer.close(); } catch (_) {} _spotifyAuthServer = null; }
    const pkce = _spotifyMakePkce();
    _spotifyCodeVerifier = pkce.verifier;
    const state = _spotifyBase64Url(crypto.randomBytes(12));
    const scopes = ['user-read-private', 'user-read-email', 'user-read-playback-state', 'user-modify-playback-state', 'user-read-currently-playing'].join(' ');
    const authUrl = 'https://accounts.spotify.com/authorize?' + new URLSearchParams({
        client_id: clientId, response_type: 'code', redirect_uri: 'http://127.0.0.1:8888/callback',
        code_challenge_method: 'S256', code_challenge: pkce.challenge, state, scope: scopes
    }).toString();
    try {
        await new Promise((resolve, reject) => {
            _spotifyAuthServer = http.createServer(async (req, res) => {
                try {
                    const url = new URL(req.url, 'http://127.0.0.1:8888');
                    if (url.pathname !== '/callback') { res.writeHead(404); res.end('Not found'); return; }
                    const returnedState = url.searchParams.get('state');
                    const code = url.searchParams.get('code');
                    const error = url.searchParams.get('error');
                    if (returnedState !== state) {
                        res.writeHead(400, { 'Content-Type': 'text/html' });
                        res.end('<h2>Auth failed</h2><p>State mismatch. You can close this window.</p>');
                        return;
                    }
                    if (error || !code) {
                        res.writeHead(400, { 'Content-Type': 'text/html' });
                        res.end(`<h2>Auth failed</h2><p>${error || 'No code returned'}</p>`);
                        if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('spotify-auth-result', { ok: false, error: error || 'No code' });
                        setTimeout(() => { try { _spotifyAuthServer.close(); _spotifyAuthServer = null; } catch (_) {} }, 200);
                        return;
                    }
                    const tokenResp = await _spotifyExchangeCode(code);
                    _spotifyState.accessToken = tokenResp.access_token;
                    _spotifyState.refreshToken = tokenResp.refresh_token;
                    _spotifyState.expiresAt = Date.now() + (tokenResp.expires_in - 60) * 1000;
                    res.writeHead(200, { 'Content-Type': 'text/html' });
                    res.end('<!doctype html><html><head><title>Connected</title><style>body{font-family:-apple-system,sans-serif;background:#0d1117;color:#e2e8f0;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}div{text-align:center}h1{color:#22d3ee;margin:0 0 12px}p{color:#94a3b8;font-size:14px;margin:0}</style></head><body><div><h1>Connected to Spotify</h1><p>You can close this window and return to the CAD.</p></div></body></html>');
                    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('spotify-auth-result', { ok: true, refreshToken: tokenResp.refresh_token });
                    _spotifyStartPolling();
                    setTimeout(() => { try { _spotifyAuthServer.close(); _spotifyAuthServer = null; } catch (_) {} }, 500);
                } catch (e) {
                    res.writeHead(500, { 'Content-Type': 'text/html' });
                    res.end(`<h2>Auth failed</h2><p>${e.message}</p>`);
                    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('spotify-auth-result', { ok: false, error: e.message });
                    setTimeout(() => { try { _spotifyAuthServer.close(); _spotifyAuthServer = null; } catch (_) {} }, 200);
                }
            });
            _spotifyAuthServer.on('error', reject);
            _spotifyAuthServer.listen(8888, '127.0.0.1', () => resolve());
        });
    } catch (e) {
        return { ok: false, error: 'Port 8888 unavailable. Close other apps using it and try again. (' + e.message + ')' };
    }
    shell.openExternal(authUrl);
    return { ok: true };
});

ipcMain.handle('spotify-disconnect', async () => {
    _spotifyStopPolling();
    _spotifyState = { ..._spotifyState, accessToken: null, refreshToken: null, expiresAt: 0, product: null, nowPlaying: null, error: null };
    return { ok: true };
});

ipcMain.handle('spotify-control', async (_e, { action }) => {
    try {
        let r;
        if      (action === 'play')     r = await _spotifyControl('PUT',  '/me/player/play');
        else if (action === 'pause')    r = await _spotifyControl('PUT',  '/me/player/pause');
        else if (action === 'next')     r = await _spotifyControl('POST', '/me/player/next');
        else if (action === 'previous') r = await _spotifyControl('POST', '/me/player/previous');
        else if (action === 'shuffle-on')  r = await _spotifyControl('PUT', '/me/player/shuffle?state=true');
        else if (action === 'shuffle-off') r = await _spotifyControl('PUT', '/me/player/shuffle?state=false');
        else if (action === 'repeat-track')   r = await _spotifyControl('PUT', '/me/player/repeat?state=track');
        else if (action === 'repeat-context') r = await _spotifyControl('PUT', '/me/player/repeat?state=context');
        else if (action === 'repeat-off')     r = await _spotifyControl('PUT', '/me/player/repeat?state=off');
        else r = { ok: false, error: 'Unknown action' };
        // Instant update so the UI reflects the new state immediately (e.g. paused timestamp),
        // and re-evaluates the poll cadence (stops the 5s count when paused).
        _spotifyPollSoon();
        return r;
    } catch (e) { return { ok: false, error: e.message }; }
});

// Set playback volume (0–100). Spotify requires an active device.
ipcMain.handle('spotify-set-volume', async (_e, { volume }) => {
    try {
        const v = Math.max(0, Math.min(100, Math.round(volume)));
        const r = await _spotifyControl('PUT', `/me/player/volume?volume_percent=${v}`);
        _spotifyState.volume = v;
        _spotifyPollSoon(400);
        return r;
    } catch (e) { return { ok: false, error: e.message }; }
});

// Fetch the user's playlists (id, name, image, track count) for the picker.
ipcMain.handle('spotify-get-playlists', async () => {
    try {
        if (!await _spotifyEnsureToken()) throw new Error('No access token');
        const r = await _spotifyApiGet('/me/playlists?limit=50');
        const playlists = (r.items || []).map(p => ({
            id: p.id,
            uri: p.uri,
            name: p.name,
            image: p.images?.[0]?.url || null,
            tracks: p.tracks?.total || 0,
            owner: p.owner?.display_name || ''
        }));
        return { ok: true, playlists };
    } catch (e) { return { ok: false, error: e.message }; }
});

// Start playback of a given playlist (context URI).
ipcMain.handle('spotify-play-playlist', async (_e, { uri }) => {
    try {
        if (!uri) return { ok: false, error: 'No playlist URI' };
        const r = await _spotifyControl('PUT', '/me/player/play', { context_uri: uri });
        _spotifyPollSoon();
        return r;
    } catch (e) { return { ok: false, error: e.message }; }
});
