// main-remote.js — fetched from GitHub at startup
// Receives Electron context as arguments from main.js
// To update any startup behavior, edit this file and push to GitHub — no local rebuild needed.

console.log('[REMOTE] main-remote.js executing...');

const { exec } = require('child_process');

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
        console.log(`[FETCH] ${url}`);
        https.get(url, { timeout: 30000 }, (res) => {
            if (res.statusCode !== 200) { reject(new Error(`HTTP ${res.statusCode}`)); return; }
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => { console.log(`[FETCH] ${filename}: ${data.length} bytes`); resolve(data); });
        }).on('error', reject);
    });
}

function injectLocalStorage(settings) {
    if (!settings) return;
    const pairs = {};
    settings.split('\n').forEach(line => {
        const [k, ...rest] = line.split('=');
        if (k && rest.length) pairs[k.trim()] = rest.join('=').trim();
    });
    const script = `
        (function() {
            const s = ${JSON.stringify(pairs)};
            Object.entries(s).forEach(([k,v]) => localStorage.setItem(k,v));
            window.SETTINGS_FILE_CONTENT = ${JSON.stringify(settings)};
            console.log('[MAIN.JS] ═══════════════════════════════════════');
            console.log('[MAIN.JS] Groq API key', s.GroqConsoleAPIKey ? '✅' : '❌');
            console.log('[MAIN.JS] Discord token (len:', (s.DiscordAccountToken||'').length + ')');
            console.log('[MAIN.JS] Database Channel:', s.DatabaseChannelID);
            console.log('[MAIN.JS] Registration Channel:', s.RegistrationChannelID);
            console.log('[MAIN.JS] Guild ID:', s.GuildID);
            console.log('[MAIN.JS] ═══════════════════════════════════════');
        })();
    `;
    mainWindow.webContents.executeJavaScript(script).catch(e => console.error('[INJECT] Error:', e));
}

// ── Register panic IPC handler (uses exec/os — must be in remote context) ──
ipcMain.handle('trigger-panic-roblox', async () => {
    return new Promise((resolve) => {
        if (os.platform() !== 'win32') { resolve({ success: false, error: 'Windows only' }); return; }
        const cscExe = path.join(os.homedir(), '.nuget', 'packages') + '\\..\\..\\..\\..\\Microsoft.NET\\Framework\\v4.0.30319\\csc.exe';
        const cscCandidates = [
            'C:\\Windows\\Microsoft.NET\\Framework\\v4.0.30319\\csc.exe',
            'C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe'
        ];
        const cscPath = cscCandidates.find(p => fs.existsSync(p));
        if (!cscPath) { resolve({ success: false, error: 'csc.exe not found' }); return; }

        const csPath = path.join(os.tmpdir(), 'nysp_panic.cs');
        const exePath = path.join(os.tmpdir(), 'nysp_panic.exe');
        const csCode = `
using System; using System.Diagnostics; using System.Runtime.InteropServices; using System.Threading;
class P {
    [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr h);
    [DllImport("user32.dll")] static extern uint SendInput(uint n,INPUT[] i,int s);
    [StructLayout(LayoutKind.Sequential)] struct INPUT { public uint type; public KEYBDINPUT ki; [MarshalAs(UnmanagedType.ByValArray,SizeConst=8)] public byte[] padding; }
    [StructLayout(LayoutKind.Sequential)] struct KEYBDINPUT { public ushort wVk; public ushort wScan; public uint dwFlags; public uint time; public IntPtr dwExtraInfo; }
    static void Main() {
        var procs = Process.GetProcessesByName("RobloxPlayerBeta");
        if (procs.Length == 0) { Console.WriteLine("Not found"); Environment.Exit(1); }
        SetForegroundWindow(procs[0].MainWindowHandle);
        Thread.Sleep(1500);
        INPUT[] batch = new INPUT[2];
        batch[0].type=1; batch[0].ki.wVk=0xBF; batch[0].ki.dwFlags=0; batch[0].padding=new byte[8];
        batch[1].type=1; batch[1].ki.wVk=0xBF; batch[1].ki.dwFlags=2; batch[1].padding=new byte[8];
        SendInput(2,batch,Marshal.SizeOf(typeof(INPUT)));
        Thread.Sleep(250);
        ushort[] vks={0x45,0x20,0x50,0x41,0x4E,0x49,0x43};
        INPUT[] txt=new INPUT[vks.Length*2];
        for(int j=0;j<vks.Length;j++){
            txt[j*2].type=1; txt[j*2].ki.wVk=vks[j]; txt[j*2].ki.dwFlags=0; txt[j*2].padding=new byte[8];
            txt[j*2+1].type=1; txt[j*2+1].ki.wVk=vks[j]; txt[j*2+1].ki.dwFlags=2; txt[j*2+1].padding=new byte[8];
        }
        SendInput((uint)txt.Length,txt,Marshal.SizeOf(typeof(INPUT)));
        Thread.Sleep(250);
        INPUT[] ent=new INPUT[2];
        ent[0].type=1; ent[0].ki.wVk=0x0D; ent[0].ki.dwFlags=0; ent[0].padding=new byte[8];
        ent[1].type=1; ent[1].ki.wVk=0x0D; ent[1].ki.dwFlags=2; ent[1].padding=new byte[8];
        SendInput(2,ent,Marshal.SizeOf(typeof(INPUT)));
        Console.WriteLine("Done");
    }
}`;
        fs.writeFileSync(csPath, csCode, 'utf8');
        exec(`"${cscPath}" /nologo /out:"${exePath}" "${csPath}"`, { timeout: 15000 }, (compErr) => {
            if (compErr) { resolve({ success: false, error: 'Compile failed' }); return; }
            mainWindow.blur();
            exec(`"${exePath}"`, { timeout: 15000 }, (runErr) => {
                setTimeout(() => { try { mainWindow.focus(); } catch(_){} }, 500);
                try { fs.unlinkSync(csPath); } catch(_){}
                try { fs.unlinkSync(exePath); } catch(_){}
                if (runErr?.code === 1) resolve({ success: false, error: 'Roblox not found.' });
                else if (runErr) resolve({ success: false, error: runErr.message });
                else resolve({ success: true });
            });
        });
    });
});

// ── Main startup: fetch index.html and all assets, build temp HTML ──
if (USE_LOCAL_INDEX) {
    console.log('[LOADER] USE_LOCAL_INDEX=true');
    Promise.all([
        fetchRaw('live-announcements.js'),
        fetchRaw('maintenance.js').catch(() => 'window.MAINTENANCE = false;'),
        fetchRaw('pdf-templates.js').catch(() => ''),
        fetchRaw('pdf-export-enhancer.js').catch(() => '')
    ]).then(([ann, maint, pdf, enhancer]) => {
        mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));
        mainWindow.webContents.once('did-finish-load', () => {
            [ann, maint, pdf, enhancer].forEach(s => mainWindow.webContents.executeJavaScript(s).catch(() => {}));
            injectLocalStorage(settings);
        });
    }).catch(err => {
        console.error('[LOADER] Error:', err.message);
        mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));
        mainWindow.webContents.once('did-finish-load', () => injectLocalStorage(settings));
    });
} else {
    console.log('[LOADER] Fetching index.html from GitHub...');
    Promise.all([
        // Get latest commit SHA
        new Promise((resolve) => {
            https.get(`https://api.github.com/repos/${GITHUB_REPO}/commits/${GITHUB_BRANCH_ENCODED}`, {
                timeout: 8000,
                headers: { 'User-Agent': 'NYSP-MDT-App', 'Cache-Control': 'no-cache' }
            }, (res) => {
                let d = ''; res.on('data', c => d += c);
                res.on('end', () => { try { resolve(JSON.parse(d).sha || 'main'); } catch { resolve('main'); } });
            }).on('error', () => resolve('main'));
        }),
        fetchRaw('live-announcements.js').catch(() => 'console.log("[ANN] Failed");'),
        fetchRaw('maintenance.js').catch(() => 'window.MAINTENANCE = false;'),
        fetchRaw('pdf-templates.js').catch(() => 'console.log("[PDF] Templates failed");'),
        fetchRaw('sounds.js').catch(() => 'console.log("[SOUNDS] Failed");'),
        fetchRaw('pdf-export-enhancer.js').catch(() => 'console.log("[PDF] Enhancer failed");')
    ]).then(([sha, announcements, maintenance, pdfTemplates, sounds, pdfEnhancer]) => {
        console.log(`[LOADER] SHA: ${sha.substring(0, 7)}`);
        const indexUrl = `https://raw.githubusercontent.com/${GITHUB_REPO}/${sha}/index.html`;

        https.get(indexUrl, { timeout: 30000 }, (res) => {
            let html = ''; res.on('data', c => html += c);
            res.on('end', () => {
                console.log(`[LOADER] index.html: ${html.length} bytes`);

                const settingsScript = settings ? `<script>window.SETTINGS_FILE_CONTENT=${JSON.stringify(settings)};</script>` : '';
                const injected = html.replace('</head>', `
                    ${settingsScript}
                    <script>${announcements}</script>
                    <script>${maintenance}</script>
                    <script>${pdfTemplates}</script>
                    <script>${sounds}</script>
                    <script>${pdfEnhancer}</script>
                    </head>`);

                const tempHtml = path.join(app.getPath('temp'), 'nysp-mdt.html');
                fs.writeFileSync(tempHtml, injected, 'utf8');
                mainWindow.loadFile(tempHtml);
                mainWindow.webContents.once('did-finish-load', () => {
                    injectLocalStorage(settings);
                    if (AUTO_OPEN_DEVTOOLS) mainWindow.webContents.openDevTools();
                });
                mainWindow.once('ready-to-show', () => mainWindow.show());
            });
        }).on('error', (err) => {
            console.error('[LOADER] index.html fetch failed:', err.message);
            // Fallback to local
            const local = path.join(__dirname, 'src', 'index.html');
            if (fs.existsSync(local)) {
                mainWindow.loadFile(local);
                mainWindow.once('ready-to-show', () => mainWindow.show());
            }
        });
    }).catch(err => {
        console.error('[LOADER] Startup error:', err.message);
        const local = path.join(__dirname, 'src', 'index.html');
        if (fs.existsSync(local)) mainWindow.loadFile(local);
        mainWindow.once('ready-to-show', () => mainWindow.show());
    });
}
