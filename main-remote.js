const { app, BrowserWindow, ipcMain, dialog, globalShortcut, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');
const http = require('http');
const crypto = require('crypto');
const net = require('net');
const os = require('os');
const { exec } = require('child_process');

const WORKER_URL = 'https://ny-cad-proxy.robertoscreationsinquiries.workers.dev';
const GITHUB_REPO = 'robertoscreationsinquiries/NYSP-MDT';
const GITHUB_BRANCH = 'testing#1';
const GITHUB_BRANCH_ENCODED = encodeURIComponent(GITHUB_BRANCH);
const AUTO_OPEN_DEVTOOLS = process.env.CAD_CONSOLE_LOGS === '1';
const USE_LOCAL_INDEX = false;

// Version of this Electron shell. The backend keeps a table of supported shell
// versions; if this value isn't on it, index.html blocks launch with "App Outdated".
// Bump this whenever main.js/launcher.html/preload.js change in a way that must be
// distributed (GitHub pushes cannot update these files).
const BUILD_VERSION = '0.1.5';

let mainWindow = null;
let launcherWindow = null;
let windowFocused = false;
let bootInProgress = false;
let bootStartedAt = null;

// ─────────────────────────────────────────────────────────────────────────────
// Boot-time statistics (for the launcher's load estimate)
// ─────────────────────────────────────────────────────────────────────────────
function statsPath() { return path.join(app.getPath('userData'), 'launcher-stats.json'); }
function readBootStats() {
    try { return JSON.parse(fs.readFileSync(statsPath(), 'utf8')); } catch { return { samples: [] }; }
}
function recordBootTime(ms) {
    try {
        const stats = readBootStats();
        stats.samples = [...(stats.samples || []), ms].slice(-8); // keep last 8 boots
        fs.writeFileSync(statsPath(), JSON.stringify(stats));
    } catch (e) { console.error('[LAUNCHER] Failed to save boot stats:', e.message); }
}
function estimateBootMs() {
    const s = readBootStats().samples || [];
    if (!s.length) return null;
    const sorted = [...s].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)]; // median — robust to one slow boot
}

// ─────────────────────────────────────────────────────────────────────────────
// Progress reporting — parses the REAL loader logs (main.js + main-remote.js)
// so the launcher bar reflects actual fetch stages, not a fake timer.
// ─────────────────────────────────────────────────────────────────────────────
let lastPct = 0;
function sendProgress(pct, label) {
    if (pct < lastPct) pct = lastPct; // monotonic — never move backwards
    lastPct = pct;
    if (launcherWindow && !launcherWindow.isDestroyed()) {
        launcherWindow.webContents.send('launcher-progress', { pct, label });
    }
}
function installLogProgressBridge() {
    const origLog = console.log.bind(console);
    console.log = (...args) => {
        origLog(...args);
        try {
            const line = args.join(' ');
            if (line.includes('[REMOTE] Fetching main-remote.js'))      sendProgress(8,  'Contacting update server…');
            else if (line.includes('[REMOTE] Got main-remote.js'))      sendProgress(18, 'Core loader downloaded');
            else if (line.includes('[LOADER] Fetching from GitHub'))    sendProgress(24, 'Starting app download…');
            else if (line.includes('[FETCH] Getting:')) {
                const asset = (line.split('/').pop() || 'assets').slice(0, 32);
                sendProgress(Math.min(lastPct + 5, 55), 'Fetching ' + asset + '…');
            }
            else if (line.includes('[FETCH] Fetching index.html'))      sendProgress(60, 'Downloading interface…');
            else if (line.includes('[FETCH] Got index.html'))           sendProgress(82, 'Interface downloaded');
            else if (line.includes('[LOADER] Got valid HTML'))          sendProgress(90, 'Preparing interface…');
            else if (line.includes('injected'))                          sendProgress(Math.min(lastPct + 2, 97), 'Applying live data…');
        } catch (_) {}
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// Settings file — packaged-app aware.
// In dev, __dirname is the project folder. In a BUILT app, __dirname points inside
// the read-only app.asar archive, so we look next to the executable, in the bundled
// resources, in the per-user data folder, and in Documents. Whatever we find first is
// also seeded into userData so it persists across reinstalls/updates.
// ─────────────────────────────────────────────────────────────────────────────
function loadSettings() {
    const exeDir = path.dirname(process.execPath);
    const userDataFile = path.join(app.getPath('userData'), 'CADSystemSettings.txt');
    let docsDir = '';
    try { docsDir = app.getPath('documents'); } catch (_) {}

    // The file the user actually edits — next to the exe, or in Documents — is read
    // FIRST. The userData location is only a last-resort fallback, so a leftover cache
    // there can never shadow the settings file the user is editing.
    const candidates = [
        path.join(exeDir, 'CADSystemSettings.txt'),               // next to installed exe (user edits this)
        path.join(exeDir, '..', 'CADSystemSettings.txt'),
        path.join(exeDir, 'resources', 'CADSystemSettings.txt'),  // bundled with installer
        process.resourcesPath ? path.join(process.resourcesPath, 'CADSystemSettings.txt') : null,
        docsDir ? path.join(docsDir, 'NYSP-MDT', 'CADSystemSettings.txt') : null,
        docsDir ? path.join(docsDir, 'CADSystemSettings.txt') : null,
        path.join(__dirname, '..', 'CADSystemSettings.txt'),      // dev layout
        path.join(__dirname, 'CADSystemSettings.txt'),
        userDataFile                                              // last-resort fallback only
    ].filter(Boolean);

    for (const p of candidates) {
        try {
            if (fs.existsSync(p)) {
                const content = fs.readFileSync(p, 'utf8');
                console.log('[SETTINGS] Loaded from:', p, `(${content.length} bytes)`);
                return content;
            }
        } catch (_) {}
    }
    console.error('[SETTINGS] CADSystemSettings.txt NOT FOUND. Looked in:');
    candidates.forEach(p => console.error('  -', p));
    console.error('[SETTINGS] Drop the file here:', userDataFile);
    return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Launcher window — the pinned-app entry point
// ─────────────────────────────────────────────────────────────────────────────
function createLauncher() {
    launcherWindow = new BrowserWindow({
        width: 440, height: 610, resizable: false, frame: false,
        maximizable: false, fullscreenable: false, minimizable: true,
        // NOTE: transparent:true was removed. Transparent frameless windows force a
        // different GPU compositing path that (a) disables subpixel font antialiasing —
        // which was corrupting fonts app-wide — and (b) causes focus flicker/re-show
        // when clicking away. An opaque window with a solid background fixes both.
        backgroundColor: '#0a0d15',
        title: 'NYSP MDT Launcher',
        icon: path.join(__dirname, 'build', 'icon.ico'),
        webPreferences: { nodeIntegration: true, contextIsolation: false },
        show: false
    });
    launcherWindow.setFullScreenable(false);
    launcherWindow.loadFile(path.join(__dirname, 'launcher.html'));
    launcherWindow.once('ready-to-show', () => launcherWindow.show());
    launcherWindow.on('closed', () => { launcherWindow = null; });
}

// IPC: launcher asks for version + boot estimate
ipcMain.handle('launcher-get-info', () => {
    let version = '?';
    try { version = require('./package.json').version; } catch {}
    return { version, estimateMs: estimateBootMs() };
});

// IPC: the renderer (index.html) asks which shell version it's running inside,
// so it can send it to the backend version-check. Legacy shells lack this handler,
// which is exactly how the backend identifies them as outdated.
ipcMain.handle('get-build-version', () => BUILD_VERSION);

// ── Discord Rich Presence ──
// Shows the user's current MDT activity on their Discord profile. Uses discord-rpc over
// the local Discord IPC socket (no token, no secret — only the public Client ID). The
// renderer sends updates via 'discord-rpc-update' and clears via 'discord-rpc-clear'.
const DISCORD_RPC_CLIENT_ID = '1533131423580684419';
let _rpcClient = null;
let _rpcReady = false;
let _rpcLastActivity = null;
let _rpcConnecting = false;

function buildActivity(a) {
    // Discord requires details/state to be >= 2 chars, and rejects the whole activity if
    // any field is malformed. Build a clean object with only defined, valid fields.
    const act = { instance: false };
    if (a.details && String(a.details).length >= 2) act.details = String(a.details).slice(0, 128);
    if (a.state && String(a.state).length >= 2) act.state = String(a.state).slice(0, 128);
    if (typeof a.startTimestamp === 'number' && a.startTimestamp > 0) act.startTimestamp = a.startTimestamp;
    if (a.largeImageKey) act.largeImageKey = a.largeImageKey;
    if (a.largeImageText && String(a.largeImageText).length >= 2) act.largeImageText = String(a.largeImageText);
    return act;
}
function applyActivity() {
    if (!_rpcClient || !_rpcReady || !_rpcLastActivity) return;
    try { _rpcClient.setActivity(_rpcLastActivity); console.log('[RPC] Activity set:', JSON.stringify(_rpcLastActivity)); }
    catch (e) { console.log('[RPC] setActivity failed:', e.message); }
}
async function ensureRpc() {
    if (_rpcReady && _rpcClient) return { ok: true, stage: 'already-ready' };
    if (_rpcConnecting) return { ok: false, stage: 'connecting' };
    _rpcConnecting = true;
    try {
        let RPC;
        try { RPC = require('discord-rpc'); }
        catch (reqErr) { _rpcConnecting = false; return { ok: false, stage: 'require-failed', error: 'discord-rpc library not installed: ' + reqErr.message }; }
        _rpcClient = new RPC.Client({ transport: 'ipc' });
        _rpcClient.on('ready', () => {
            _rpcReady = true;
            console.log('[RPC] Ready — connected to Discord');
            applyActivity();
        });
        await _rpcClient.login({ clientId: DISCORD_RPC_CLIENT_ID });
        _rpcConnecting = false;
        return { ok: true, stage: 'logged-in' };
    } catch (e) {
        console.log('[RPC] Unavailable:', e.message);
        _rpcClient = null; _rpcReady = false; _rpcConnecting = false;
        return { ok: false, stage: 'login-failed', error: e.message };
    }
}
ipcMain.handle('discord-rpc-update', async (_e, activity) => {
    _rpcLastActivity = buildActivity(activity || {});
    console.log('[RPC] update requested; built activity:', JSON.stringify(_rpcLastActivity));
    const res = await ensureRpc();
    applyActivity();
    return { ok: _rpcReady, ensured: res, ready: _rpcReady, activity: _rpcLastActivity, clientId: DISCORD_RPC_CLIENT_ID };
});
ipcMain.handle('discord-rpc-clear', async () => {
    _rpcLastActivity = null;
    try { if (_rpcClient && _rpcReady) await _rpcClient.clearActivity(); } catch (_) {}
    return { ok: true };
});

// IPC: quit from launcher
ipcMain.on('launcher-quit', () => app.quit());

// IPC: launch — optionally relaunching through a command prompt for debug logs
let _openDevToolsOnBoot = false;
ipcMain.on('launcher-launch', (_e, { withConsole } = {}) => {
    // Console/debug mode: rather than relaunch a second process (which the single-instance
    // lock now blocks — that was causing the crash), we open DevTools on THIS instance once
    // the app window boots. This gives the same live logs without spawning a new process.
    if (withConsole) _openDevToolsOnBoot = true;
    if (bootInProgress) return;
    bootInProgress = true;
    bootStartedAt = Date.now();
    lastPct = 0;
    sendProgress(3, 'Initializing…');
    bootApp().catch(err => {
        bootInProgress = false;
        if (launcherWindow && !launcherWindow.isDestroyed()) {
            launcherWindow.webContents.send('launcher-error', { message: err.message });
        }
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// App boot — the original createWindow flow, now reporting progress
// ─────────────────────────────────────────────────────────────────────────────
async function bootApp() {
    const settings = loadSettings();

    mainWindow = new BrowserWindow({
        width: 1400, height: 900, minWidth: 1200, minHeight: 700,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            enableRemoteModule: true,
            webSecurity: false,
            backgroundThrottling: false,
            preload: path.join(__dirname, 'preload.js')
        },
        title: 'NYSP MDT', backgroundColor: '#0f172a',
        icon: path.join(__dirname, 'build', 'icon.ico'),
        autoHideMenuBar: true, show: false
    });

    mainWindow.on('focus', () => { windowFocused = true; });
    mainWindow.on('blur', () => { windowFocused = false; });
    mainWindow.on('close', () => {
        globalShortcut.unregisterAll();
        if (mainWindow && !mainWindow.isDestroyed()) mainWindow.destroy();
        app.quit();
    });
    mainWindow.webContents.on('before-input-event', (event, input) => {
        if (input.key === 'F12' ||
            (input.control && input.shift && input.key === 'I') ||
            (input.meta && input.alt && input.key === 'I')) {
            mainWindow.webContents.toggleDevTools();
        }
    });

    // When the MDT window actually appears: finish the bar, record the boot time,
    // and retire the launcher.
    mainWindow.once('show', () => {
        sendProgress(100, 'Ready');
        if (bootStartedAt) recordBootTime(Date.now() - bootStartedAt);
        setTimeout(() => {
            if (launcherWindow && !launcherWindow.isDestroyed()) launcherWindow.close();
            // Open DevTools AFTER the launcher window has closed. Opening a DETACHED
            // DevTools window while the launcher is still closing created a brief
            // window-count race that let 'window-all-closed' fire and quit the app —
            // that was the "auto-close only with console checked" bug. Docking it into
            // the main window (default mode) avoids any extra top-level window entirely.
            if (_openDevToolsOnBoot || AUTO_OPEN_DEVTOOLS) {
                setTimeout(() => {
                    try { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.openDevTools({ mode: 'bottom' }); } catch (_) {}
                }, 400);
            }
        }, 650); // let the bar visibly complete
    });

    // ── Fetch main-remote.js from GitHub and execute it ──
    // PERF: We resolve the branch commit SHA ONCE here and reuse it everywhere:
    //  - to fetch main-remote.js from the fast raw CDN (not the slow API)
    //  - passed into main-remote.js as PRELOADED_SHA so it doesn't re-hit the
    //    GitHub commits API two more times (that API is slow + rate-limited to
    //    60/hr unauthenticated, and was the main cause of 60-80s cold starts).
    try {
        // Resolve SHA once (with a short timeout + graceful fallback to the branch ref).
        const resolvedSha = await new Promise((resolve) => {
            const req = https.get(`https://api.github.com/repos/${GITHUB_REPO}/commits/${GITHUB_BRANCH_ENCODED}`, {
                timeout: 6000,
                headers: { 'User-Agent': 'NYSP-MDT-App', 'Cache-Control': 'no-cache' }
            }, (shaRes) => {
                let d = ''; shaRes.on('data', c => d += c);
                shaRes.on('end', () => { try { resolve(JSON.parse(d).sha || GITHUB_BRANCH_ENCODED); } catch { resolve(GITHUB_BRANCH_ENCODED); } });
            });
            req.on('error', () => resolve(GITHUB_BRANCH_ENCODED));
            req.on('timeout', () => { req.destroy(); resolve(GITHUB_BRANCH_ENCODED); });
        });
        console.log(`[REMOTE] Resolved SHA @ ${String(resolvedSha).substring(0,7)} — fetching main-remote.js`);

        const remoteCode = await new Promise((resolve, reject) => {
            https.get(`https://raw.githubusercontent.com/${GITHUB_REPO}/${resolvedSha}/main-remote.js`, {
                timeout: 30000
            }, (res) => {
                if (res.statusCode !== 200) { reject(new Error(`HTTP ${res.statusCode}`)); return; }
                let code = ''; res.on('data', c => code += c);
                res.on('end', () => { console.log(`[REMOTE] Got main-remote.js: ${code.length} bytes`); resolve(code); });
            }).on('error', reject);
        });

        // Execute remote code with full Electron context injected.
        // PRELOADED_SHA lets main-remote.js skip its own commit-API lookups.
        const fn = new Function(
            'mainWindow','app','ipcMain','dialog','shell',
            'path','fs','https','http','net','crypto','os','exec',
            'WORKER_URL','GITHUB_REPO','GITHUB_BRANCH','GITHUB_BRANCH_ENCODED',
            'USE_LOCAL_INDEX','AUTO_OPEN_DEVTOOLS','settings','windowFocused',
            'globalShortcut','__dirname','__filename','PRELOADED_SHA',
            remoteCode
        );
        fn(
            mainWindow, app, ipcMain, dialog, shell,
            path, fs, https, http, net, crypto, os, exec,
            WORKER_URL, GITHUB_REPO, GITHUB_BRANCH, GITHUB_BRANCH_ENCODED,
            USE_LOCAL_INDEX, AUTO_OPEN_DEVTOOLS, settings, windowFocused,
            globalShortcut, __dirname, __filename, resolvedSha
        );

    } catch (err) {
        console.error('[REMOTE] Failed to load main-remote.js:', err.message);
        console.log('[REMOTE] Falling back to local src/index.html');
        const localHtml = path.join(__dirname, 'src', 'index.html');
        const target = fs.existsSync(localHtml) ? localHtml : null;
        if (target) {
            mainWindow.loadFile(target);
            mainWindow.once('ready-to-show', () => mainWindow.show());
        } else {
            // No local fallback available — surface the failure in the launcher
            // instead of showing a broken window.
            if (mainWindow && !mainWindow.isDestroyed()) mainWindow.destroy();
            mainWindow = null;
            throw err;
        }
    }
}

// Single-instance lock: if the app is already running, clicking the shortcut/pin
// again just focuses the existing window instead of spawning a duplicate launcher.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
    app.quit();
} else {
    app.on('second-instance', () => {
        const win = mainWindow || launcherWindow;
        if (win && !win.isDestroyed()) {
            if (win.isMinimized()) win.restore();
            win.focus();
        }
    });
    app.whenReady().then(() => {
        installLogProgressBridge();
        createLauncher();
    });
}
app.on('window-all-closed', () => {
    // Don't quit during the launcher→app handoff. There's a brief moment where the
    // launcher has closed and the main window is mid-creation; without this guard a
    // transient "no windows" state (worsened by opening DevTools) quit the whole app.
    if (bootInProgress && !mainWindow) return;
    if (process.platform !== 'darwin') app.quit();
});
app.on('will-quit', () => globalShortcut.unregisterAll());
