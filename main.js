const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const { spawn, exec } = require('child_process');
const fs = require('fs');
const https = require('https');
const http = require('http');

let mainWindow;
let isAlwaysOnTop = false;
let bridge = null;       // PowerShell bridge process
let bridgeReady = false; // Whether bridge has initialized

// Paths — works both in dev and packaged
function getResourcePath(filename) {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'app', filename);
  }
  return path.join(__dirname, filename);
}

let SAVED_SCRIPTS_DIR;

function ensureSavedDir() {
  if (!SAVED_SCRIPTS_DIR) SAVED_SCRIPTS_DIR = path.join(app.getPath('userData'), 'saved_scripts');
  if (!fs.existsSync(SAVED_SCRIPTS_DIR)) fs.mkdirSync(SAVED_SCRIPTS_DIR, { recursive: true });
}

// ── Apex API Bridge (JSON Protocol) ──────────────────────────────────────
// Launches ApexBridge.exe which loads QuorumAPI.dll and communicates
// via JSON messages over stdin/stdout.

let responseCallbacks = {};  // action -> [resolve, ...]

function startBridge() {
  const bridgeExe = getResourcePath('ApexBridge.exe');
  const bridgeDir = app.isPackaged ? path.join(process.resourcesPath, 'app') : __dirname;

  console.log('[Bridge] === STARTING BRIDGE ===' );
  console.log('[Bridge] bridgeExe:', bridgeExe);
  console.log('[Bridge] bridgeDir (CWD):', bridgeDir);
  console.log('[Bridge] bridgeExe exists:', fs.existsSync(bridgeExe));
  console.log('[Bridge] QuorumAPI.dll exists:', fs.existsSync(path.join(bridgeDir, 'QuorumAPI.dll')));
  console.log('[Bridge] Bin folder exists:', fs.existsSync(path.join(bridgeDir, 'Bin')));

  if (!fs.existsSync(bridgeExe)) {
    console.error('[Bridge] ApexBridge.exe NOT FOUND at', bridgeExe);
    return false;
  }

  // Kill old bridge if still alive
  if (bridge && !bridge.killed) {
    try { bridge.kill(); } catch(e) {}
    bridge = null;
    bridgeReady = false;
  }

  bridge = spawn(bridgeExe, [], {
    cwd: bridgeDir,
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true
  });

  console.log('[Bridge] Spawned PID:', bridge.pid);

  // Bridge is ready immediately — StartCommunication() is called inside Main()
  bridgeReady = true;

  bridge.on('error', (err) => {
    console.error('[Bridge] SPAWN ERROR:', err.message);
    bridge = null;
    bridgeReady = false;
  });

  let buffer = '';

  bridge.stdout.on('data', (data) => {
    buffer += data.toString();
    const lines = buffer.split('\n');
    buffer = lines.pop();

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      try {
        const response = JSON.parse(trimmed);
        console.log('[Bridge] Response:', JSON.stringify(response));

        const action = response.action || '';
        if (responseCallbacks[action] && responseCallbacks[action].length > 0) {
          const cb = responseCallbacks[action].shift();
          cb(response);
        }
      } catch (e) {
        console.log('[Bridge] Non-JSON output:', trimmed);
      }
    }
  });

  bridge.stderr.on('data', (data) => {
    console.error('[Bridge STDERR]', data.toString().trim());
  });

  bridge.on('close', (code) => {
    console.log('[Bridge] Process CLOSED with code', code);
    bridge = null;
    bridgeReady = false;
    // Reject all pending callbacks
    for (const action in responseCallbacks) {
      while (responseCallbacks[action].length > 0) {
        responseCallbacks[action].shift()({ success: false, action, error: 'Bridge exited' });
      }
    }
  });

  return true;
}

function sendBridgeJSON(action, data = null, timeout = 30000) {
  return new Promise((resolve) => {
    if (!bridge || bridge.killed || !bridgeReady) {
      resolve({ success: false, action, error: 'Bridge not running' });
      return;
    }

    if (!responseCallbacks[action]) responseCallbacks[action] = [];
    responseCallbacks[action].push(resolve);

    const msg = JSON.stringify({ action, data: data || null });
    bridge.stdin.write(msg + '\n');
    console.log('[Bridge] Sent:', msg.substring(0, 100));

    // Timeout after specified interval
    setTimeout(() => {
      const cbs = responseCallbacks[action] || [];
      const idx = cbs.indexOf(resolve);
      if (idx !== -1) {
        cbs.splice(idx, 1);
        resolve({ success: false, action, error: 'Bridge command timed out' });
      }
    }, timeout);
  });
}

// ══ GITHUB REPO SYNC — CONFIG & UTILS ════════════════════════════════════
const GITHUB_REPO = 'Michaeljackson1234567/apex-executor';
const GITHUB_BRANCH = 'Guesspapers-AI';
const GITHUB_RAW = `https://raw.githubusercontent.com/${GITHUB_REPO}/${GITHUB_BRANCH}`;

let LOCAL_VERSION_FILE;
let CHANGELOG_FILE;

function ensurePaths() {
  if (!LOCAL_VERSION_FILE) LOCAL_VERSION_FILE = path.join(app.getPath('userData'), 'apex_version.json');
  if (!CHANGELOG_FILE) CHANGELOG_FILE = path.join(app.getPath('userData'), 'apex_changelog.json');
}

const SYNC_FILES = [
  'renderer.js', 'style.css', 'index.html',
  'preload.js', 'version.json',
  'bootstrapper.html', 'preload_boot.js',
  'ApexBridge.exe', 'ApexBridge.dll', 'ApexBridge.deps.json', 'ApexBridge.runtimeconfig.json',
  'QuorumAPI.dll'
];

function getLocalVersion() {
  ensurePaths();
  try {
    if (fs.existsSync(LOCAL_VERSION_FILE)) {
      return JSON.parse(fs.readFileSync(LOCAL_VERSION_FILE, 'utf8'));
    }
  } catch (e) {}
  return { version: '1.0.0' };
}

function saveLocalVersion(data) {
  ensurePaths();
  fs.writeFileSync(LOCAL_VERSION_FILE, JSON.stringify(data, null, 2), 'utf8');
}

function fetchFile(url, asBuffer = false) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    lib.get(url, { headers: { 'User-Agent': 'ApexExecutor/1.0' } }, (res) => {
      if (res.statusCode === 302 || res.statusCode === 301) {
        lib.get(res.headers.location, { headers: { 'User-Agent': 'ApexExecutor/1.0' } }, (res2) => {
          let chunks = [];
          res2.on('data', c => chunks.push(c));
          res2.on('end', () => resolve(asBuffer ? Buffer.concat(chunks) : Buffer.concat(chunks).toString('utf8')));
        }).on('error', reject);
        return;
      }
      if (res.statusCode !== 200) { reject(new Error(`HTTP ${res.statusCode}`)); return; }
      let chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(asBuffer ? Buffer.concat(chunks) : Buffer.concat(chunks).toString('utf8')));
    }).on('error', reject);
  });
}

// ── Window ───────────────────────────────────────────────────────────────
let bootWindow = null;

function createBootWindow() {
  bootWindow = new BrowserWindow({
    width: 420,
    height: 520,
    frame: false,
    resizable: false,
    transparent: true,
    backgroundColor: '#00000000',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload_boot.js')
    },
    title: 'Apex Executor',
    center: true,
    show: false
  });

  bootWindow.loadFile('bootstrapper.html');
  bootWindow.setMenuBarVisibility(false);
  bootWindow.once('ready-to-show', () => bootWindow.show());
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 780,
    minWidth: 900,
    minHeight: 600,
    frame: false,
    backgroundColor: '#09090b',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    title: 'Apex Executor',
    show: false
  });

  mainWindow.loadFile('index.html');
  mainWindow.setMenuBarVisibility(false);
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    if (bootWindow && !bootWindow.isDestroyed()) {
      bootWindow.close();
      bootWindow = null;
    }
  });
}

function bootSend(text, type, progress) {
  if (bootWindow && !bootWindow.isDestroyed()) {
    bootWindow.webContents.send('boot-status', { text, type: type || '', progress });
  }
}

function bootVersion(ver) {
  if (bootWindow && !bootWindow.isDestroyed()) {
    bootWindow.webContents.send('boot-version', ver);
  }
}

async function bootSequence() {
  ensurePaths();
  const delay = ms => new Promise(r => setTimeout(r, ms));

  bootSend('Initializing Apex Executor...');
  await delay(800);

  // Show version
  const localVer = getLocalVersion();
  bootVersion(localVer.version);

  // Check for updates
  bootSend('Checking for updates...');
  await delay(500);

  try {
    const remoteVersionStr = await fetchFile(`${GITHUB_RAW}/version.json`);
    const remote = JSON.parse(remoteVersionStr);
    const hasUpdate = remote.version && remote.version !== localVer.version;

    if (hasUpdate) {
      bootSend(`Update found: v${localVer.version} → v${remote.version}`);
      await delay(600);

      const filesToSync = remote.files || SYNC_FILES;
      const appDir = app.isPackaged ? path.join(process.resourcesPath, 'app') : __dirname;

      for (let i = 0; i < filesToSync.length; i++) {
        const file = filesToSync[i];
        bootSend(`Downloading ${file}...`, '', Math.round(((i) / filesToSync.length) * 100));
        try {
          const isBinary = file.endsWith('.exe') || file.endsWith('.dll') || file.endsWith('.png');
          const content = await fetchFile(`${GITHUB_RAW}/${file}`, isBinary);
          const destPath = path.join(appDir, file);
          const dir = path.dirname(destPath);
          if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
          fs.writeFileSync(destPath, content);
        } catch (e) {
          console.error(`[Update] Failed to sync ${file}:`, e.message);
        }
      }

      bootSend('Update complete!', 'ok', 100);
      saveLocalVersion({ version: remote.version, updatedAt: new Date().toISOString() });

      // Save changelog
      try {
        const clPath = path.join(app.getPath('userData'), 'apex_changelog.json');
        fs.writeFileSync(clPath, JSON.stringify({ version: remote.version, changelog: remote.changelog || [], shown: false }, null, 2), 'utf8');
      } catch (e) {}

      bootVersion(remote.version);
      await delay(1000);
    } else {
      bootSend('Up to date ✓', 'ok', 100);
      await delay(600);
    }
  } catch (e) {
    bootSend('Offline mode', '', 100);
    await delay(600);
  }

  // Start bridge
  bootSend('Starting Apex API bridge...');
  const bridgeStarted = startBridge();
  if (bridgeStarted) {
    bootSend('Bridge started ✓', 'ok');
  } else {
    bootSend('Bridge failed to start!', 'err');
  }
  await delay(500);

  bootSend('Launching Apex Executor...', 'ok', 100);
  await delay(500);

  // Open main window
  createMainWindow();
}

app.whenReady().then(() => {
  ensureSavedDir();
  createBootWindow();
  // Start boot sequence after a short delay to let the window render
  setTimeout(() => bootSequence(), 300);
});

app.on('window-all-closed', () => {
  // Tell bridge to shut down
  if (bridge && !bridge.killed) {
    try { bridge.stdin.write('EXIT\n'); } catch (e) {}
    setTimeout(() => { try { bridge.kill(); } catch (e) {} }, 2000);
  }
  if (process.platform !== 'darwin') app.quit();
});

// ── Fetch helper ─────────────────────────────────────────────────────────
function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    lib.get(url, { headers: { 'User-Agent': 'ApexExecutor/1.0' } }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error('Invalid JSON')); }
      });
    }).on('error', reject);
  });
}

// ── Check if Roblox is running ───────────────────────────────────────��───
function isRobloxRunning() {
  return new Promise((resolve) => {
    exec('tasklist /FI "IMAGENAME eq RobloxPlayerBeta.exe" /NH', (err, stdout) => {
      if (err) { resolve(false); return; }
      resolve(stdout.toLowerCase().includes('robloxplayerbeta.exe'));
    });
  });
}

// ── Window controls ──────────────────────────────────────────────────────
ipcMain.on('win-minimize', () => mainWindow?.minimize());
ipcMain.on('win-maximize', () => {
  if (mainWindow?.isMaximized()) mainWindow.unmaximize();
  else mainWindow?.maximize();
});
ipcMain.on('win-close', () => mainWindow?.close());

// ── INJECT — uses Apex API via bridge ────────────────────────────────────
ipcMain.handle('inject', async () => {
  console.log('[Inject] === INJECT CLICKED ===' );

  // Check if Roblox is running first
  const robloxUp = await isRobloxRunning();
  console.log('[Inject] Roblox running:', robloxUp);
  if (!robloxUp) {
    return { success: false, message: 'Roblox is not running! Open Roblox first, then inject.' };
  }

  // Restart bridge if it died
  if (!bridge || bridge.killed) {
    console.log('[Inject] Bridge not running, restarting...');
    const started = startBridge();
    if (!started) {
      return { success: false, message: 'Failed to start bridge. ApexBridge.exe missing?' };
    }
  }

  console.log('[Inject] Sending attach JSON...');
  const result = await sendBridgeJSON('attach', null, 180000); // 3-minute timeout to allow for Defender scans & Quorum offset downloads
  console.log('[Inject] attach result:', JSON.stringify(result));

  if (result.success) {
    return { success: true, message: 'Attached to Roblox successfully!' };
  } else {
    return { success: false, message: result.error || 'Attach failed' };
  }
});

// ── EXECUTE SCRIPT — uses QuorumAPI via bridge ───────────────────────────
ipcMain.handle('execute-script', async (_ev, script) => {
  if (!bridge || bridge.killed) {
    return { success: false, message: 'Not injected! Click Inject first.' };
  }

  // Send script as JSON — the bridge handles unescaping
  const result = await sendBridgeJSON('execute', { script: script });

  if (result.success) {
    return { success: true, message: 'Script executed successfully' };
  } else {
    return { success: false, message: result.error || 'Execution failed' };
  }
});

// ── SEARCH SCRIPTS ───────────────────────────────────────────────────────
ipcMain.handle('search-scripts', async (_ev, query, page) => {
  try {
    const q = encodeURIComponent(query || '');
    const url = `https://rscripts.net/api/v2/scripts?q=${q}&page=${page || 1}`;
    const data = await fetchJSON(url);
    return { success: true, data: data };
  } catch (err) {
    return { success: false, message: err.message };
  }
});

ipcMain.handle('fetch-scripts', async (_ev, page) => {
  try {
    const url = `https://rscripts.net/api/v2/scripts?page=${page || 1}`;
    const data = await fetchJSON(url);
    return { success: true, data: data };
  } catch (err) {
    return { success: false, message: err.message };
  }
});

ipcMain.handle('fetch-raw-script', async (_ev, rawUrl) => {
  return new Promise((resolve) => {
    const lib = rawUrl.startsWith('https') ? https : http;
    lib.get(rawUrl, { headers: { 'User-Agent': 'ApexExecutor/1.0' } }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve({ success: true, code: data }));
    }).on('error', (err) => resolve({ success: false, message: err.message }));
  });
});

// ── SAVED SCRIPTS CRUD ──────────────────────────────────────────────────
ipcMain.handle('save-script', async (_ev, name, code) => {
  ensureSavedDir();
  const safeName = name.replace(/[^a-zA-Z0-9_\- ]/g, '').trim() || 'untitled';
  const filePath = path.join(SAVED_SCRIPTS_DIR, safeName + '.lua');
  try {
    fs.writeFileSync(filePath, code, 'utf8');
    return { success: true, message: `Saved "${safeName}.lua"` };
  } catch (err) {
    return { success: false, message: err.message };
  }
});

ipcMain.handle('get-saved-scripts', async () => {
  ensureSavedDir();
  try {
    const files = fs.readdirSync(SAVED_SCRIPTS_DIR).filter(f => f.endsWith('.lua'));
    const scripts = files.map(f => ({
      name: f.replace('.lua', ''),
      filename: f,
      code: fs.readFileSync(path.join(SAVED_SCRIPTS_DIR, f), 'utf8'),
      size: fs.statSync(path.join(SAVED_SCRIPTS_DIR, f)).size,
      modified: fs.statSync(path.join(SAVED_SCRIPTS_DIR, f)).mtime.toISOString(),
    }));
    return { success: true, scripts };
  } catch (err) {
    return { success: false, scripts: [], message: err.message };
  }
});

ipcMain.handle('delete-script', async (_ev, filename) => {
  const filePath = path.join(SAVED_SCRIPTS_DIR, filename);
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    return { success: true, message: `Deleted "${filename}"` };
  } catch (err) {
    return { success: false, message: err.message };
  }
});

// ── SETTINGS ─────────────────────────────────────────────────────────────
ipcMain.handle('set-topmost', async (_ev, val) => {
  isAlwaysOnTop = val;
  mainWindow?.setAlwaysOnTop(val);
  return { success: true };
});

ipcMain.handle('set-opacity', async (_ev, val) => {
  mainWindow?.setOpacity(val);
  return { success: true };
});

ipcMain.handle('open-scripts-folder', async () => {
  ensureSavedDir();
  shell.openPath(SAVED_SCRIPTS_DIR);
  return { success: true };
});

ipcMain.handle('check-roblox', async () => {
  const running = await isRobloxRunning();
  return { running };
});

// ── GET ROBLOX USER (avatar + name) ─────────────────────────────────────
ipcMain.handle('get-roblox-user', async () => {
  try {
    // Scan Roblox logs to find the logged-in userId
    const logDir = path.join(process.env.LOCALAPPDATA || '', 'Roblox', 'logs');
    if (!fs.existsSync(logDir)) return { success: false, message: 'Roblox logs not found' };

    // Get most recent log files
    const logs = fs.readdirSync(logDir)
      .filter(f => f.endsWith('.log'))
      .map(f => ({ name: f, time: fs.statSync(path.join(logDir, f)).mtime }))
      .sort((a, b) => b.time - a.time)
      .slice(0, 5);

    let userId = null;

    for (const log of logs) {
      const content = fs.readFileSync(path.join(logDir, log.name), 'utf8');
      // Try multiple patterns
      const patterns = [
        /userId:\s*(\d{5,})/i,
        /UserId[=:]\s*(\d{5,})/i,
        /initializeUser.*?(\d{7,})/i,
        /localuserid[=:\s]+(\d{5,})/i,
        /"userId":(\d{5,})/i,
      ];
      for (const p of patterns) {
        const m = content.match(p);
        if (m && m[1]) { userId = m[1]; break; }
      }
      if (userId) break;
    }

    if (!userId) return { success: false, message: 'Could not find Roblox user ID in logs' };

    // Fetch user info from Roblox public API
    const userInfo = await fetchJSON(`https://users.roblox.com/v1/users/${userId}`);
    const thumbData = await fetchJSON(`https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${userId}&size=150x150&format=Png&isCircular=true`);

    let avatarUrl = '';
    if (thumbData.data && thumbData.data.length > 0 && thumbData.data[0].imageUrl) {
      avatarUrl = thumbData.data[0].imageUrl;
    }

    return {
      success: true,
      user: {
        id: userId,
        name: userInfo.name || 'Player',
        displayName: userInfo.displayName || userInfo.name || 'Player',
        avatarUrl: avatarUrl
      }
    };
  } catch (err) {
    return { success: false, message: err.message };
  }
});

// ── GITHUB SYNC — IPC HANDLERS ──────────────────────────────────────────
// Check for update by comparing remote version.json with local
ipcMain.handle('check-for-update', async () => {
  try {
    const remoteVersionStr = await fetchFile(`${GITHUB_RAW}/version.json`);
    const remote = JSON.parse(remoteVersionStr);
    const local = getLocalVersion();

    const hasUpdate = remote.version && remote.version !== local.version;
    return {
      success: true,
      hasUpdate,
      currentVersion: local.version,
      remoteVersion: remote.version || local.version,
      changelog: remote.changelog || [],
      files: remote.files || SYNC_FILES
    };
  } catch (err) {
    return { success: true, hasUpdate: false, currentVersion: getLocalVersion().version, remoteVersion: getLocalVersion().version };
  }
});

// Download all changed files from GitHub and overwrite local copies
ipcMain.handle('sync-update', async (_ev, files, remoteVersion, changelog) => {
  const appDir = app.isPackaged ? path.join(process.resourcesPath, 'app') : __dirname;
  let updated = 0;
  let errors = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    try {
      const content = await fetchFile(`${GITHUB_RAW}/${file}`);
      const destPath = path.join(appDir, file);

      // Create subdirectories if needed
      const dir = path.dirname(destPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

      fs.writeFileSync(destPath, content, 'utf8');
      updated++;

      // Send progress
      const pct = Math.round(((i + 1) / files.length) * 100);
      mainWindow?.webContents.send('update-progress', pct);
    } catch (err) {
      errors.push(`${file}: ${err.message}`);
    }
  }

  // Save the new version locally
  saveLocalVersion({ version: remoteVersion, updatedAt: new Date().toISOString() });

  // Save changelog so we can show it after restart
  try {
    fs.writeFileSync(CHANGELOG_FILE, JSON.stringify({ version: remoteVersion, changelog, shown: false }, null, 2), 'utf8');
  } catch (e) {}

  return {
    success: errors.length === 0,
    updated,
    total: files.length,
    errors,
    message: errors.length === 0
      ? `Updated ${updated} files to v${remoteVersion}. Restart to apply.`
      : `Updated ${updated}/${files.length} files. Errors: ${errors.join(', ')}`
  };
});

// Check if there's an unshown changelog after an update
ipcMain.handle('get-pending-changelog', async () => {
  try {
    if (fs.existsSync(CHANGELOG_FILE)) {
      const data = JSON.parse(fs.readFileSync(CHANGELOG_FILE, 'utf8'));
      if (!data.shown && data.changelog && data.changelog.length > 0) {
        return { success: true, version: data.version, changelog: data.changelog };
      }
    }
  } catch (e) {}
  return { success: false };
});

// Mark changelog as seen
ipcMain.handle('mark-changelog-seen', async () => {
  try {
    if (fs.existsSync(CHANGELOG_FILE)) {
      const data = JSON.parse(fs.readFileSync(CHANGELOG_FILE, 'utf8'));
      data.shown = true;
      fs.writeFileSync(CHANGELOG_FILE, JSON.stringify(data, null, 2), 'utf8');
    }
  } catch (e) {}
  return { success: true };
});

// Restart the app after update
ipcMain.handle('restart-app', async () => {
  app.relaunch();
  app.exit(0);
});

ipcMain.handle('get-version', async () => {
  return { version: getLocalVersion().version };
});
