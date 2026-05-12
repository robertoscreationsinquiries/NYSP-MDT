// main-remote.js — loaded from GitHub at startup by main.js
// All variables from main.js are injected: mainWindow, app, ipcMain, dialog, shell,
// path, fs, https, os, exec, WORKER_URL, GITHUB_REPO, GITHUB_BRANCH,
// GITHUB_BRANCH_ENCODED, USE_LOCAL_INDEX, AUTO_OPEN_DEVTOOLS, settings,
// windowFocused, globalShortcut

console.log('[REMOTE] main-remote.js executing...');

// ── IPC: quit / devtools / compact / global shortcut ──
let _streamServer = null;
ipcMain.handle('start-streaming', async () => {
    if (_streamServer) return { success: true, alreadyRunning: true };
    const http = require('http');
    const os = require('os');
    const interfaces = os.networkInterfaces();
    let localIp = '127.0.0.1';
    for (const iface of Object.values(interfaces)) {
        for (const alias of iface) {
            if (alias.family === 'IPv4' && !alias.internal) { localIp = alias.address; break; }
        }
    }
    const PORT = 3000;
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1"><title>NYSP MDT</title>
<style>*{box-sizing:border-box;margin:0;padding:0}body{background:#07090f;color:#e2e8f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;min-height:100vh;padding:16px}
h1{font-size:16px;font-weight:800;letter-spacing:2px;color:#60a5fa;text-transform:uppercase;margin-bottom:4px}.sub{font-size:11px;color:#374151;margin-bottom:20px;letter-spacing:1px}
.card{background:#0d1117;border:1px solid rgba(59,130,246,0.18);border-radius:12px;padding:14px;margin-bottom:12px}
.card-title{font-size:9px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#374151;margin-bottom:10px}
.officer{display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.04)}
.officer:last-child{border-bottom:none}.badge{font-size:10px;font-weight:700;color:#93c5fd;background:rgba(59,130,246,0.12);padding:3px 8px;border-radius:5px;font-family:monospace}
.name{flex:1;font-size:13px;font-weight:600;color:#f1f5f9}.status{font-size:10px;color:#6b7280;font-weight:600}
.panic{background:rgba(239,68,68,0.12);border:1px solid rgba(239,68,68,0.35);border-radius:10px;padding:12px;margin-bottom:12px;animation:pulse 1s infinite}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.6}}.panic-title{color:#f87171;font-size:13px;font-weight:800;letter-spacing:1px}
.panic-sub{color:#fca5a5;font-size:11px;margin-top:4px}.bolo{padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.04)}
.bolo:last-child{border-bottom:none}.bolo-plate{font-size:14px;font-weight:900;font-family:monospace;color:#e2e8f0;letter-spacing:2px}
.bolo-meta{font-size:10px;color:#6b7280;margin-top:2px}.empty{color:#374151;font-size:12px;text-align:center;padding:16px 0}
.refresh{color:#374151;font-size:10px;text-align:center;margin-top:16px}.dot{display:inline-block;width:6px;height:6px;border-radius:50%;margin-right:5px;background:#10b981}
</style></head><body>
<h1>NYSP MDT</h1><div class="sub">MOBILE VIEWER · LIVE</div>
<div id="root"><div class="empty">Loading...</div></div>
<div class="refresh" id="ts">Refreshing...</div>
<script>
async function load(){try{
const r=await fetch('https://ny-cad-proxy.robertoscreationsinquiries.workers.dev/presence?session=all');
const d=await r.json();
const officers=d.officers||[];const panic=d.panic;
let html='';
if(panic){html+='<div class="panic"><div class="panic-title">🚨 PANIC — '+panic.name+'</div><div class="panic-sub">Badge #'+panic.badge+' · Session '+panic.session+'</div></div>';}
html+='<div class="card"><div class="card-title">Online Officers ('+officers.length+')</div>';
if(officers.length===0){html+='<div class="empty">No officers online</div>';}
else{officers.forEach(o=>{html+='<div class="officer"><span class="badge">#'+o.badge+'</span><span class="name">'+o.name+'</span><span class="status">'+o.status+'</span></div>';});}
html+='</div>';
document.getElementById('root').innerHTML=html;
document.getElementById('ts').textContent='Updated '+new Date().toLocaleTimeString();
}catch(e){document.getElementById('ts').textContent='Connection error — retrying...';}}
load();setInterval(load,5000);
</script></body></html>`;
    _streamServer = http.createServer((req, res) => {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(html);
    });
    _streamServer.listen(PORT, '0.0.0.0');
    return { success: true, ip: localIp, port: PORT };
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

function tsRequest(apiKey, command) {
    return new Promise((resolve, reject) => {
        // Send api-key BOTH as header AND query param — different ClientQuery versions
        // accept different formats; doing both is safe and idempotent.
        const path = '/' + command + (command.includes('?') ? '&' : '?') + 'api-key=' + encodeURIComponent(apiKey);
        const req = http.request({
            host: '127.0.0.1', port: 25639, path, method: 'GET',
            headers: { 'Api-Key': apiKey, 'Accept': 'text/plain' },
            timeout: 4000
        }, (res) => {
            let body = '';
            res.on('data', c => body += c);
            res.on('end', () => {
                if (res.statusCode === 401 || res.statusCode === 403) {
                    return reject(new Error(`TS auth failed (HTTP ${res.statusCode}) — check API key`));
                }
                const parsed = tsParse(body);
                if (!parsed.ok) return reject(new Error(`TS error: ${parsed.status}`));
                resolve(parsed);
            });
        });
        req.on('error', e => reject(new Error(e.code === 'ECONNREFUSED' ? 'ClientQuery not reachable on port 25639 — enable the plugin in TeamSpeak → Tools → Options → Addons' : e.message)));
        req.on('timeout', () => { req.destroy(); reject(new Error('TS request timed out — is TeamSpeak running?')); });
        req.end();
    });
}

ipcMain.handle('ts-poll', async (_event, { apiKey, session }) => {
    if (!apiKey || apiKey.length < 10) return { ok: false, reason: 'INVALID_KEY' };
    if (!session) return { ok: false, reason: 'NO_SESSION' };
    const sessionPrefix = String(session) + ' |';
    try {
        // Pull channel list + client list in parallel
        const [chRes, clRes] = await Promise.all([
            tsRequest(apiKey, 'channellist'),
            tsRequest(apiKey, 'clientlist')
        ]);
        const channels = (chRes?.body || []).filter(c => c && c.channel_name);
        const clients  = (clRes?.body || []).filter(c => c && c.client_nickname && c.client_type === '0');

        // Channels matching the session prefix → id -> shortened display name
        const sessionChannelMap = {};
        for (const ch of channels) {
            const name = String(ch.channel_name).trim();
            if (!name.startsWith(sessionPrefix)) continue;
            // Strip "N | " prefix
            const after = name.slice(sessionPrefix.length).trim();
            // Use first word as short name (NYSP, EGPD, RCSO, VLAW, etc.)
            const short = (after.split(/\s+/)[0] || after)
                .replace(/^VLAW\d*/i, 'VLAW')
                .replace(/^NYSDOT$/i, 'NYSDOT');
            sessionChannelMap[ch.cid] = short;
        }

        // Department detection from nickname callsign
        const patterns = [
            { dept: 'EGFD', re: /^(ENGINE|LADDER|MEDIC|REMS)-\d+$/i },
            { dept: 'DOT',  re: /^[A-Z]+-\d+$/i, allowWords: ['TOW', 'TRUCK'] },
            { dept: 'NYSP', re: /^[A-Z]-\d+$/i },                  // L-N
            { dept: 'NYSP', re: /^\d[A-Z]\d{2}$/i },               // NLNN
            { dept: 'NYSP', re: /^MOTOR-\d+$/i },
            { dept: 'EGPD', re: /^\d{3}$/ },
        ];

        const officers = [];
        for (const cl of clients) {
            const nick = String(cl.client_nickname).trim();
            const channelShort = sessionChannelMap[cl.cid];
            if (!channelShort) continue; // not in this session

            // Split on " | " to get callsign vs roblox name
            let callsign = nick, robloxName = '';
            const pipeIdx = nick.indexOf('|');
            if (pipeIdx > -1) {
                callsign = nick.slice(0, pipeIdx).trim();
                robloxName = nick.slice(pipeIdx + 1).trim();
            }

            // Match against department patterns
            let dept = 'UNKNOWN';
            for (const p of patterns) {
                if (!p.re.test(callsign)) continue;
                if (p.allowWords) {
                    const word = callsign.split('-')[0].toUpperCase();
                    if (!p.allowWords.includes(word)) continue;
                }
                dept = p.dept;
                break;
            }

            officers.push({
                clid: cl.clid,
                nickname: nick,
                callsign,
                robloxName,
                channel: channelShort,
                dept
            });
        }

        // Sort: dept order first, then by callsign
        const deptOrder = { EGPD: 0, NYSP: 1, EGFD: 2, DOT: 3, UNKNOWN: 4 };
        officers.sort((a, b) => {
            const d = (deptOrder[a.dept] ?? 9) - (deptOrder[b.dept] ?? 9);
            if (d !== 0) return d;
            return a.callsign.localeCompare(b.callsign);
        });

        return { ok: true, officers, pollAt: Date.now() };
    } catch (err) {
        return { ok: false, reason: 'ERROR', error: err.message };
    }
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
    const paths = [path.join(__dirname, '..', 'CADSystemSettings.txt'), path.join(__dirname, 'CADSystemSettings.txt')];
    for (const p of paths) { try { if (fs.existsSync(p)) { fs.writeFileSync(p, content, 'utf8'); return { success: true, path: p }; } } catch(err) { return { success: false, error: err.message }; } }
    try { const dp = path.join(__dirname, '..', 'CADSystemSettings.txt'); fs.writeFileSync(dp, content, 'utf8'); return { success: true, path: dp }; } catch(err) { return { success: false, error: err.message }; }
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
        await shell.openPath(outputPath);
        return { success: true, path: outputPath };
    } catch(err) { return { success: false, error: err.message }; }
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
    const soundsScript = `window.SOUNDS = { panicAlarm: '${GITHUB_SOUNDS_BASE}/panicAlarm.mp3', platePass: '${GITHUB_SOUNDS_BASE}/platePass.mp3', plateFail: '${GITHUB_SOUNDS_BASE}/plateFail.mp3', callAlert: '${GITHUB_SOUNDS_BASE}/CallIncoming.mp3', warrantAlert: '${GITHUB_SOUNDS_BASE}/warrantAlert.mp3', StartupSFX: '${GITHUB_SOUNDS_BASE}/StartupSFX.mp3', LoginAccessDenied: '${GITHUB_SOUNDS_BASE}/LoginAccessDenied.mp3', LoginIncorrect: '${GITHUB_SOUNDS_BASE}/LoginIncorrect.mp3', LoginPageCorrect: '${GITHUB_SOUNDS_BASE}/LoginPageCorrect.mp3', MIC_ACTIVESFX: '${GITHUB_SOUNDS_BASE}/MIC_ACTIVESFX.mp3', MIC_INACTIVESFX: '${GITHUB_SOUNDS_BASE}/MIC_INACTIVESFX.mp3', MIC_NOTAVAILABLESFX: '${GITHUB_SOUNDS_BASE}/MIC_NOTAVAILABLESFX.mp3', noCitizenSFX: '${GITHUB_SOUNDS_BASE}/noCitizenSFX.mp3' }; window.SOUNDS_BASE64 = window.SOUNDS; console.log('[SOUNDS] Ready from branch ${GITHUB_BRANCH}! Keys:', Object.keys(window.SOUNDS).join(', '));`;

    Promise.all([
        // SHA for display
        new Promise((resolve) => {
            https.get(`https://api.github.com/repos/${GITHUB_REPO}/commits/${GITHUB_BRANCH_ENCODED}`, {
                timeout: 8000,
                headers: { 'User-Agent': 'NYSP-MDT-App', 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' }
            }, (res) => {
                let d = ''; res.on('data', c => d += c);
                res.on('end', () => { try { resolve((JSON.parse(d).sha || '').substring(0, 7)); } catch { resolve('unknown'); } });
            }).on('error', () => resolve('unknown'));
        }),
        // index.html via full SHA to bypass CDN cache
        new Promise((resolve, reject) => {
            https.get(`https://api.github.com/repos/${GITHUB_REPO}/commits/${GITHUB_BRANCH_ENCODED}`, {
                timeout: 8000,
                headers: { 'User-Agent': 'NYSP-MDT-App', 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' }
            }, (shaRes) => {
                let d = ''; shaRes.on('data', c => d += c);
                shaRes.on('end', () => {
                    let fullSha = GITHUB_BRANCH_ENCODED;
                    try { fullSha = JSON.parse(d).sha || GITHUB_BRANCH_ENCODED; } catch {}
                    console.log(`[FETCH] Fetching index.html at SHA: ${fullSha.substring(0, 7)}`);
                    https.get(`https://raw.githubusercontent.com/${GITHUB_REPO}/${fullSha}/index.html`, { timeout: 30000 }, (res) => {
                        let html = ''; res.on('data', c => html += c);
                        res.on('end', () => { console.log(`[FETCH] Got index.html: ${html.length} bytes`); resolve(html); });
                    }).on('error', reject);
                });
            }).on('error', () => {
                https.get(`https://raw.githubusercontent.com/${GITHUB_REPO}/${GITHUB_BRANCH_ENCODED}/index.html`, { timeout: 30000 }, (res) => {
                    let html = ''; res.on('data', c => html += c);
                    res.on('end', () => resolve(html));
                }).on('error', reject);
            });
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
        const buildScript = `<script>window.APP_COMMIT_SHA = '${commitSha}'; window.APP_GITHUB_BRANCH = '${GITHUB_BRANCH}';</script>`;

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
