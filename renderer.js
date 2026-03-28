/* APEX EXECUTOR — Renderer */

let editor = null;
let injected = false;
let execCount = 0;
let sPage = 1;
let sTotalPages = 1;
let sQuery = '';
let modalScript = null;
let searchTimer = null;
let robloxCheckInterval = null;
let pendingSaveCode = null;

// ── Window ───────────────────────────────────────────────────────────────────
document.getElementById('wc-min').onclick = () => apex.minimize();
document.getElementById('wc-max').onclick = () => apex.maximize();
document.getElementById('wc-close').onclick = () => apex.close();

// ── Tabs ─────────────────────────────────────────────────────────────────────
const navBtns = document.querySelectorAll('.nav-btn');
const pages = document.querySelectorAll('.page');

function goTab(id) {
  navBtns.forEach(b => b.classList.toggle('active', b.dataset.tab === id));
  pages.forEach(p => p.classList.toggle('active', p.id === 'page-' + id));
  if (id === 'scripts' && document.getElementById('sh-grid').querySelectorAll('.sc').length === 0) loadHub();
  if (id === 'editor' && editor) setTimeout(() => editor.layout(), 30);
  if (id === 'saved') loadSaved();
}
navBtns.forEach(b => b.onclick = () => goTab(b.dataset.tab));
document.getElementById('btn-go-editor').onclick = () => goTab('editor');
document.getElementById('btn-go-scripts').onclick = () => goTab('scripts');

// ── Console ──────────────────────────────────────────────────────────────────
function ts() { const d = new Date(); return [d.getHours(), d.getMinutes(), d.getSeconds()].map(n => String(n).padStart(2, '0')).join(':'); }
function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function log(t, m) {
  const o = document.getElementById('con-out');
  const el = document.createElement('div');
  el.className = 'cl ' + t;
  el.innerHTML = `<span class="ct">[${ts()}]</span><span class="cm">${esc(m)}</span>`;
  o.appendChild(el);
  o.scrollTop = o.scrollHeight;
}
document.getElementById('con-clr').onclick = () => { document.getElementById('con-out').innerHTML = ''; log('info', 'Console cleared.'); };
log('info', 'Apex Executor v1.0 initialized.');

// ── Roblox Status Check ──────────────────────────────────────────────────────
async function checkRoblox() {
  try {
    const res = await apex.checkRoblox();
    const dot = document.getElementById('rs-dot');
    const txt = document.getElementById('rs-text');
    if (res.running) {
      dot.className = 'rs-dot on';
      txt.textContent = 'Roblox Running';
      txt.style.color = '#22c55e';
    } else {
      dot.className = 'rs-dot off';
      txt.textContent = 'Roblox Not Found';
      txt.style.color = '';
    }
  } catch (e) {}
}
checkRoblox();
robloxCheckInterval = setInterval(checkRoblox, 5000);

function updateStatus(s, c) {
  document.getElementById('stat-status').textContent = s;
  document.getElementById('stat-status').style.color = c || '';
}

// ── Overlay ──────────────────────────────────────────────────────────────────
function showOv(t) { const o = document.getElementById('overlay'); document.getElementById('ov-txt').textContent = t; o.classList.remove('hidden'); }
function hideOv() { document.getElementById('overlay').classList.add('hidden'); }

// ── INJECT ───────────────────────────────────────────────────────────────────
async function doInject() {
  if (injected) log('warn', 'Re-injecting...');
  showOv('INJECTING...');
  log('info', '▸ Checking for Roblox process...');
  await checkRoblox();

  const res = await apex.inject();
  hideOv();

  if (res.success) {
    injected = true;
    updateStatus('Injected', '#22c55e');
    log('success', '✓ ' + res.message);

    // Show welcome overlay with Roblox avatar
    showWelcome();
  } else {
    updateStatus('Failed', '#ef4444');
    log('error', '✗ ' + res.message);
  }
}
document.getElementById('btn-inject').onclick = doInject;

// ── WELCOME SCREEN ──────────────────────────────────────────────────────────
async function showWelcome() {
  const overlay = document.getElementById('welcome-overlay');
  const avatar = document.getElementById('welcome-avatar');
  const nameEl = document.getElementById('welcome-name');
  const placeholder = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ccircle fill='%2316161a' cx='50' cy='50' r='50'/%3E%3Ctext fill='%2352525b' x='50' y='55' text-anchor='middle' font-size='28' font-family='sans-serif'%3E%3F%3C/text%3E%3C/svg%3E";

  try {
    const res = await apex.getRobloxUser();
    if (res.success && res.user) {
      nameEl.textContent = res.user.displayName || res.user.name;
      avatar.src = res.user.avatarUrl || placeholder;

      // Also set the persistent navbar user profile
      const navAvatar = document.getElementById('nav-avatar');
      const navName = document.getElementById('nav-name');
      const navUser = document.getElementById('nav-user');
      
      if (navAvatar && navName && navUser) {
        navAvatar.src = avatar.src;
        navName.textContent = nameEl.textContent;
        navUser.classList.remove('hidden');
      }

      log('info', '👋 Welcome back, ' + (res.user.displayName || res.user.name) + '!');
    } else {
      nameEl.textContent = 'Player';
      avatar.src = placeholder;
    }
  } catch (e) {
    nameEl.textContent = 'Player';
    avatar.src = placeholder;
  }

  overlay.classList.remove('hidden');
  overlay.style.opacity = '1';

  // Fade out after 3 seconds
  setTimeout(() => {
    overlay.style.transition = 'opacity 0.5s ease';
    overlay.style.opacity = '0';
    setTimeout(() => { overlay.classList.add('hidden'); overlay.style.opacity = ''; overlay.style.transition = ''; }, 500);
  }, 3000);

  overlay.onclick = () => { overlay.classList.add('hidden'); };
}

// ── EXECUTE ──────────────────────────────────────────────────────────────────
async function doExec(code) {
  if (!code || !code.trim()) { log('warn', 'Empty script — nothing to execute.'); return; }
  log('info', '▸ Sending script...');
  const res = await apex.executeScript(code);
  if (res.success) { execCount++; document.getElementById('stat-execs').textContent = execCount; log('success', '✓ ' + res.message); }
  else log('error', '✗ ' + res.message);
}

// ── Monaco Editor ─��──────────────────────────────────────────────────────────
require.config({ paths: { vs: 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.44.0/min/vs' } });

require(['vs/editor/editor.main'], function () {

  // ── Full Lua language with proper coloring ──
  monaco.languages.register({ id: 'lua' });

  monaco.languages.setMonarchTokensProvider('lua', {
    defaultToken: '',
    tokenPostfix: '.lua',

    keywords: [
      'and', 'break', 'do', 'else', 'elseif', 'end', 'false', 'for',
      'function', 'goto', 'if', 'in', 'local', 'nil', 'not', 'or',
      'repeat', 'return', 'then', 'true', 'until', 'while'
    ],

    brackets: [
      { open: '{', close: '}', token: 'delimiter.curly' },
      { open: '[', close: ']', token: 'delimiter.square' },
      { open: '(', close: ')', token: 'delimiter.parenthesis' },
    ],

    operators: ['+', '-', '*', '/', '%', '^', '#', '==', '~=', '<=', '>=', '<', '>', '=', ';', ':', ',', '.', '..', '...'],

    symbols: /[=><!~?:&|+\-*\/\^%]+/,

    tokenizer: {
      root: [
        // comments
        [/--\[([=]*)\[/, 'comment', '@blockComment.$1'],
        [/--.*$/, 'comment'],

        // strings
        [/"/, 'string', '@stringDouble'],
        [/'/, 'string', '@stringSingle'],
        [/\[([=]*)\[/, 'string', '@blockString.$1'],

        // numbers
        [/0[xX][0-9a-fA-F]*/, 'number.hex'],
        [/\d+(\.\d+)?([eE][-+]?\d+)?/, 'number'],
        [/\.\d+([eE][-+]?\d+)?/, 'number'],

        // keywords and identifiers
        [/[a-zA-Z_]\w*/, {
          cases: {
            '@keywords': { token: 'keyword.$0' },
            'self': 'variable.language',
            'print|warn|error|type|tostring|tonumber|pairs|ipairs|next|select|unpack|pcall|xpcall|assert|rawget|rawset|rawequal|rawlen|setmetatable|getmetatable|require|loadstring|dofile|load': 'support.function',
            'game|workspace|script|Instance|wait|spawn|delay|tick|time|typeof|newproxy|getfenv|setfenv|coroutine|string|table|math|os|io|debug|bit32|utf8|task': 'support.other',
            'Color3|Vector3|Vector2|CFrame|UDim2|UDim|Enum|BrickColor|Ray|Region3|TweenInfo|NumberRange|NumberSequence|ColorSequence|Rect|PhysicalProperties': 'type',
            '@default': 'identifier'
          }
        }],

        // operators
        [/[{}()\[\]]/, '@brackets'],
        [/@symbols/, {
          cases: {
            '@operators': 'operator',
            '@default': ''
          }
        }],

        // delimiter
        [/[;,.]/, 'delimiter'],
      ],

      blockComment: [
        [/\]([=]*)\]/, { cases: { '$1==$S2': { token: 'comment', next: '@pop' }, '@default': 'comment' } }],
        [/./, 'comment'],
      ],

      stringDouble: [
        [/[^\\"]+/, 'string'],
        [/\\./, 'string.escape'],
        [/"/, 'string', '@pop'],
      ],

      stringSingle: [
        [/[^\\']+/, 'string'],
        [/\\./, 'string.escape'],
        [/'/, 'string', '@pop'],
      ],

      blockString: [
        [/\]([=]*)\]/, { cases: { '$1==$S2': { token: 'string', next: '@pop' }, '@default': 'string' } }],
        [/./, 'string'],
      ],
    },
  });

  // ── Custom completions ──
  monaco.languages.registerCompletionItemProvider('lua', {
    provideCompletionItems: () => {
      const suggestions = [
        'game:GetService("Players")', 'game:GetService("Workspace")', 'game:GetService("ReplicatedStorage")',
        'game:GetService("TweenService")', 'game:GetService("UserInputService")',
        'game:GetService("RunService")', 'game:GetService("Lighting")',
        'game.Players.LocalPlayer', 'game.Players.LocalPlayer.Character',
        'print()', 'warn()', 'error()', 'wait()', 'task.wait()',
        'Instance.new()', 'loadstring()()', 'game:HttpGet("")',
        'loadstring(game:HttpGet(""))()',
      ].map(label => ({
        label,
        kind: monaco.languages.CompletionItemKind.Snippet,
        insertText: label,
        range: null,
      }));
      return { suggestions };
    }
  });

  // ── Apex Dark Theme ──
  monaco.editor.defineTheme('apex-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'comment',            foreground: '4a5568', fontStyle: 'italic' },
      { token: 'keyword',            foreground: 'c084fc' },
      { token: 'keyword.true',       foreground: 'f59e0b' },
      { token: 'keyword.false',      foreground: 'f59e0b' },
      { token: 'keyword.nil',        foreground: 'f59e0b' },
      { token: 'keyword.function',   foreground: 'c084fc' },
      { token: 'keyword.local',      foreground: 'c084fc' },
      { token: 'keyword.return',     foreground: 'c084fc' },
      { token: 'keyword.if',         foreground: 'c084fc' },
      { token: 'keyword.then',       foreground: 'c084fc' },
      { token: 'keyword.else',       foreground: 'c084fc' },
      { token: 'keyword.elseif',     foreground: 'c084fc' },
      { token: 'keyword.end',        foreground: 'c084fc' },
      { token: 'keyword.for',        foreground: 'c084fc' },
      { token: 'keyword.while',      foreground: 'c084fc' },
      { token: 'keyword.do',         foreground: 'c084fc' },
      { token: 'keyword.repeat',     foreground: 'c084fc' },
      { token: 'keyword.until',      foreground: 'c084fc' },
      { token: 'keyword.in',         foreground: 'c084fc' },
      { token: 'keyword.and',        foreground: 'c084fc' },
      { token: 'keyword.or',         foreground: 'c084fc' },
      { token: 'keyword.not',        foreground: 'c084fc' },
      { token: 'keyword.break',      foreground: 'c084fc' },
      { token: 'keyword.goto',       foreground: 'c084fc' },
      { token: 'support.function',   foreground: '60a5fa' },
      { token: 'support.other',      foreground: '38bdf8' },
      { token: 'type',               foreground: '2dd4bf' },
      { token: 'variable.language',  foreground: 'fb923c' },
      { token: 'string',             foreground: '4ade80' },
      { token: 'string.escape',      foreground: 'fbbf24' },
      { token: 'number',             foreground: 'fb923c' },
      { token: 'number.hex',         foreground: 'fb923c' },
      { token: 'operator',           foreground: '94a3b8' },
      { token: 'delimiter',          foreground: '64748b' },
      { token: 'delimiter.curly',    foreground: 'fbbf24' },
      { token: 'delimiter.square',   foreground: 'c084fc' },
      { token: 'delimiter.parenthesis', foreground: '94a3b8' },
      { token: 'identifier',         foreground: 'cbd5e1' },
    ],
    colors: {
      'editor.background':                '#0a0a0c',
      'editor.foreground':                '#cbd5e1',
      'editor.lineHighlightBackground':   '#ffffff06',
      'editor.selectionBackground':       '#ffffff14',
      'editor.inactiveSelectionBackground':'#ffffff08',
      'editorLineNumber.foreground':       '#27272a',
      'editorLineNumber.activeForeground': '#71717a',
      'editorCursor.foreground':           '#ffffff',
      'editorWhitespace.foreground':       '#1e1e24',
      'editorIndentGuide.background1':     '#1e1e24',
      'editorIndentGuide.activeBackground1':'#3f3f46',
      'editorWidget.background':           '#111114',
      'editorWidget.border':               '#27272a',
      'editorSuggestWidget.background':    '#111114',
      'editorSuggestWidget.selectedBackground': '#1e1e24',
      'scrollbarSlider.background':        '#27272a60',
      'scrollbarSlider.hoverBackground':   '#3f3f4680',
    }
  });

  editor = monaco.editor.create(document.getElementById('monaco-wrap'), {
    value: [
      '-- ══════════════════════════════════════════',
      '-- ║          APEX EXECUTOR  v1.0           ║',
      '-- ══════════════════════════════════════════',
      '',
      '-- 1. Click INJECT on Home tab (Roblox must be open)',
      '-- 2. Write your Lua script here',
      '-- 3. Click Execute or Ctrl+Enter',
      '',
      'local Players = game:GetService("Players")',
      'local LP = Players.LocalPlayer',
      '',
      'print("[Apex] Hello, " .. LP.Name .. "!")',
      'print("[Apex] Character: " .. tostring(LP.Character))',
      '',
      '-- Example: loadstring(game:HttpGet("URL"))()',
      '',
    ].join('\n'),
    language: 'lua',
    theme: 'apex-dark',
    fontSize: 13,
    fontFamily: '"JetBrains Mono", "Cascadia Code", monospace',
    fontLigatures: true,
    lineHeight: 22,
    minimap: { enabled: true, side: 'right', renderCharacters: false },
    scrollBeyondLastLine: false,
    wordWrap: 'off',
    renderLineHighlight: 'gutter',
    cursorStyle: 'line',
    cursorBlinking: 'phase',
    smoothScrolling: true,
    mouseWheelZoom: true,
    bracketPairColorization: { enabled: true },
    guides: { bracketPairs: true, indentation: true },
    overviewRulerBorder: false,
    padding: { top: 12, bottom: 12 },
    automaticLayout: true,
    suggest: { showKeywords: true, showSnippets: true },
  });

  editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => doExec(editor.getValue()));
  log('info', 'Monaco editor ready (Lua syntax enabled).');
});

// Editor toolbar
document.getElementById('eb-clear').onclick = () => { if (editor) { editor.setValue(''); log('info', 'Editor cleared.'); } };
document.getElementById('eb-copy').onclick = () => { if (editor) { navigator.clipboard.writeText(editor.getValue()); log('info', 'Copied to clipboard.'); } };
document.getElementById('eb-exec').onclick = () => { if (editor) doExec(editor.getValue()); };

// Save button
document.getElementById('eb-save').onclick = () => {
  if (!editor) return;
  pendingSaveCode = editor.getValue();
  document.getElementById('save-name').value = '';
  document.getElementById('save-dialog').classList.remove('hidden');
  document.getElementById('save-name').focus();
};

// ── Save Dialog ──────────────────────────────────────────────────────────────
document.getElementById('save-confirm').onclick = async () => {
  const name = document.getElementById('save-name').value.trim();
  if (!name) { log('warn', 'Enter a script name!'); return; }
  const res = await apex.saveScript(name, pendingSaveCode || '');
  if (res.success) log('success', '✓ ' + res.message);
  else log('error', '✗ ' + res.message);
  document.getElementById('save-dialog').classList.add('hidden');
  pendingSaveCode = null;
};
document.getElementById('save-cancel').onclick = () => { document.getElementById('save-dialog').classList.add('hidden'); pendingSaveCode = null; };

// ── Settings ─────────────────────────────────────────────────────────────���───
document.getElementById('st-topmost').onchange = (e) => { apex.setTopmost(e.target.checked); log('info', 'Always on top: ' + (e.target.checked ? 'ON' : 'OFF')); };

document.getElementById('st-opacity').oninput = (e) => {
  const v = parseInt(e.target.value);
  document.getElementById('st-opacity-val').textContent = v + '%';
  apex.setOpacity(v / 100);
};

document.getElementById('st-autocheck').onchange = (e) => {
  if (e.target.checked) { robloxCheckInterval = setInterval(checkRoblox, 5000); log('info', 'Auto-check Roblox: ON'); }
  else { clearInterval(robloxCheckInterval); log('info', 'Auto-check Roblox: OFF'); }
};

document.getElementById('st-theme').onchange = (e) => {
  const isLight = e.target.checked;
  document.body.setAttribute('data-theme', isLight ? 'light' : 'dark');
  document.getElementById('modal-bg').setAttribute('data-theme', isLight ? 'light' : 'dark');
  if (editor) {
    monaco.editor.setTheme(isLight ? 'vs' : 'apex-dark');
  }
  log('info', 'Theme changed to ' + (isLight ? 'Light' : 'Dark'));
};

document.getElementById('st-fontsize').onchange = (e) => { if (editor) editor.updateOptions({ fontSize: parseInt(e.target.value) }); };
document.getElementById('st-wordwrap').onchange = (e) => { if (editor) editor.updateOptions({ wordWrap: e.target.checked ? 'on' : 'off' }); };
document.getElementById('st-minimap').onchange = (e) => { if (editor) editor.updateOptions({ minimap: { enabled: e.target.checked } }); };
document.getElementById('st-linenums').onchange = (e) => { if (editor) editor.updateOptions({ lineNumbers: e.target.checked ? 'on' : 'off' }); };

// ═══ SCRIPT HUB ══════════════════════════════════════════════════════════════

function getImg(s) {
  const isValidUrl = (url) => typeof url === 'string' && url.trim().length > 0;
  
  if (isValidUrl(s.image)) return s.image.startsWith('/') ? 'https://rscripts.net' + s.image : s.image;
  if (s.game && isValidUrl(s.game.imgurl)) return s.game.imgurl.startsWith('/') ? 'https://rscripts.net' + s.game.imgurl : s.game.imgurl;
  
  return '';
}

function fallbackImg() {
  return "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 120'%3E%3Crect fill='%2316161a' width='200' height='120'/%3E%3Ctext fill='%233f3f46' x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' font-size='12' font-family='sans-serif'%3ENo Image%3C/text%3E%3C/svg%3E";
}

function dedup(scripts) {
  const seen = new Set();
  return scripts.filter(s => {
    const key = (s.title || '').trim().toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function mkCard(s, i) {
  const d = document.createElement('div');
  d.className = 'sc';
  d.style.animationDelay = (i * 0.03) + 's';
  const img = getImg(s);
  const game = s.game ? s.game.title : 'Unknown';
  let bgs = '';
  if (s.keySystem) bgs += '<span class="bg bg-k">🔑</span>';
  if (s.mobileReady) bgs += '<span class="bg bg-u">📱</span>';
  if (s.paid) bgs += '<span class="bg bg-p">$</span>';
  else bgs += '<span class="bg bg-v">Free</span>';

  d.innerHTML = `
    <img class="sc-img" src="${img || fallbackImg()}" alt="" onerror="this.src='${fallbackImg()}'" loading="lazy"/>
    <div class="sc-bd">
      <div class="sc-t" title="${esc(s.title || 'Untitled')}">${esc(s.title || 'Untitled')}</div>
      <div class="sc-g">${esc(game)}</div>
      <div class="sc-ft">
        <span class="sc-v"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>${(s.views||0).toLocaleString()}</span>
        <div class="sc-badges">${bgs}</div>
      </div>
    </div>`;
  d.onclick = () => openModal(s);
  return d;
}

async function loadHub(q, p) {
  const grid = document.getElementById('sh-grid');
  const ld = document.getElementById('sh-loading');
  grid.querySelectorAll('.sc').forEach(c => c.remove());
  ld.classList.remove('hidden');
  ld.querySelector('span').textContent = 'Loading scripts...';
  const ldSpin = ld.querySelector('.spin');
  if (ldSpin) ldSpin.style.display = '';

  sQuery = q !== undefined ? q : sQuery;
  sPage = p || sPage;

  try {
    const res = sQuery.trim() ? await apex.searchScripts(sQuery, sPage) : await apex.fetchScripts(sPage);
    ld.classList.add('hidden');
    if (!res.success) { log('error', 'Script load failed: ' + res.message); return; }
    sTotalPages = (res.data.info && res.data.info.maxPages) ? res.data.info.maxPages : 1;
    document.getElementById('pg-label').textContent = `${sPage} / ${sTotalPages}`;
    const scripts = dedup(res.data.scripts || []);
    if (!scripts.length) { ld.classList.remove('hidden'); ld.querySelector('span').textContent = 'No scripts found.'; if (ldSpin) ldSpin.style.display = 'none'; return; }
    scripts.forEach((s, i) => grid.appendChild(mkCard(s, i)));
  } catch (e) { ld.classList.add('hidden'); log('error', 'Load error: ' + e.message); }
}

document.getElementById('sh-input').oninput = (e) => { clearTimeout(searchTimer); searchTimer = setTimeout(() => { sPage = 1; loadHub(e.target.value, 1); }, 500); };
document.getElementById('pg-prev').onclick = () => { if (sPage > 1) { sPage--; loadHub(sQuery, sPage); } };
document.getElementById('pg-next').onclick = () => { if (sPage < sTotalPages) { sPage++; loadHub(sQuery, sPage); } };

// ── Modal ────────────────────────────────────────────────────────────────────
async function openModal(s) {
  modalScript = s;
  document.getElementById('modal-img').src = getImg(s) || fallbackImg();
  document.getElementById('modal-img').onerror = function() { this.src = fallbackImg(); };
  document.getElementById('modal-title').textContent = s.title || 'Untitled';
  const game = s.game ? s.game.title : 'Unknown';
  document.getElementById('modal-meta').innerHTML =
    `<span>🎮 ${esc(game)}</span><span>👁 ${(s.views||0).toLocaleString()} views</span>`;
  const bb = document.getElementById('modal-badges');
  bb.innerHTML = '';
  if (s.keySystem) bb.innerHTML += '<span class="bg bg-k">🔑 Key</span>';
  if (s.mobileReady) bb.innerHTML += '<span class="bg bg-u">Mobile</span>';
  if (s.paid) bb.innerHTML += '<span class="bg bg-p">Paid</span>';
  else bb.innerHTML += '<span class="bg bg-v">Free</span>';

  document.getElementById('modal-code').textContent = 'Loading script array...';
  document.getElementById('modal-bg').classList.remove('hidden');

  if (s.rawScript) {
    const rawContent = await apex.fetchRawScript(s.rawScript);
    if (rawContent.success) {
      s.script = rawContent.code;
      document.getElementById('modal-code').textContent = s.script;
    } else {
      document.getElementById('modal-code').textContent = '-- Failed to fetch raw code.';
    }
  } else {
    document.getElementById('modal-code').textContent = '-- No script URL found.';
  }
}

function closeModal() { document.getElementById('modal-bg').classList.add('hidden'); modalScript = null; }
document.getElementById('modal-x').onclick = closeModal;
document.getElementById('modal-bg').onclick = (e) => { if (e.target.id === 'modal-bg') closeModal(); };

document.getElementById('modal-exec').onclick = async () => { if (!modalScript) return; closeModal(); await doExec(modalScript.script); };
document.getElementById('modal-to-editor').onclick = () => { if (!modalScript || !editor) return; editor.setValue(modalScript.script || ''); closeModal(); goTab('editor'); log('info', 'Script loaded: ' + (modalScript.title || 'Untitled')); };
document.getElementById('modal-save').onclick = () => {
  if (!modalScript) return;
  pendingSaveCode = modalScript.script || '';
  document.getElementById('save-name').value = (modalScript.title || 'untitled').substring(0, 40);
  closeModal();
  document.getElementById('save-dialog').classList.remove('hidden');
  document.getElementById('save-name').focus();
};

// ═══ SAVED SCRIPTS ════════════════════���══════════════════════════════════════
async function loadSaved() {
  const list = document.getElementById('sv-list');
  const empty = document.getElementById('sv-empty');
  list.querySelectorAll('.sv-item').forEach(el => el.remove());

  const res = await apex.getSavedScripts();
  const scripts = res.scripts || [];
  empty.classList.toggle('hidden', scripts.length > 0);

  scripts.forEach((s, i) => {
    const el = document.createElement('div');
    el.className = 'sv-item';
    el.style.animationDelay = (i * 0.04) + 's';
    const sizeKB = (s.size / 1024).toFixed(1);
    const date = new Date(s.modified).toLocaleDateString();
    el.innerHTML = `
      <div class="sv-item-info">
        <div class="sv-item-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14,2 14,8 20,8"/></svg></div>
        <div>
          <div class="sv-item-name">${esc(s.name)}.lua</div>
          <div class="sv-item-meta">${sizeKB} KB &bull; ${date}</div>
        </div>
      </div>
      <div class="sv-item-acts">
        <button class="sv-btn" title="Load in Editor" data-action="load"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16,18 22,12 16,6"/><polyline points="8,6 2,12 8,18"/></svg></button>
        <button class="sv-btn" title="Execute" data-action="exec"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5,3 19,12 5,21"/></svg></button>
        <button class="sv-btn del" title="Delete" data-action="del"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3,6 5,6 21,6"/><path d="M19,6l-1,14H6L5,6"/></svg></button>
      </div>`;

    el.querySelector('[data-action="load"]').onclick = () => { if (editor) { editor.setValue(s.code); goTab('editor'); log('info', 'Loaded: ' + s.name); } };
    el.querySelector('[data-action="exec"]').onclick = () => doExec(s.code);
    el.querySelector('[data-action="del"]').onclick = async () => {
      const r = await apex.deleteScript(s.filename);
      if (r.success) { log('success', '✓ Deleted: ' + s.name); loadSaved(); }
      else log('error', '✗ ' + r.message);
    };
    list.appendChild(el);
  });
}

document.getElementById('sv-open-folder').onclick = () => apex.openScriptsFolder();
document.getElementById('sv-refresh').onclick = () => loadSaved();

// ── Keyboard ──────────────────────────────���──────────────────────────────────
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeModal(); document.getElementById('save-dialog').classList.add('hidden'); } });

// ═══ GITHUB SYNC — AUTO-UPDATE ═══════════════════════════════════════════════

// 1. Check if there's a pending changelog from a previous update
(async function showPendingChangelog() {
  try {
    const cl = await apex.getPendingChangelog();
    if (cl.success && cl.changelog.length > 0) {
      document.getElementById('changelog-ver').textContent = 'v' + cl.version;
      const list = document.getElementById('changelog-list');
      list.innerHTML = '';
      cl.changelog.forEach(item => {
        const li = document.createElement('li');
        li.textContent = item;
        list.appendChild(li);
      });
      document.getElementById('changelog-overlay').classList.remove('hidden');
      document.getElementById('changelog-ok').onclick = async () => {
        document.getElementById('changelog-overlay').classList.add('hidden');
        await apex.markChangelogSeen();
      };
      log('info', '🎉 Updated to v' + cl.version);
    }
  } catch (e) {}
})();

// 2. Check for new updates from GitHub
(async function checkForUpdates() {
  try {
    const res = await apex.checkForUpdate();
    if (res.success && res.hasUpdate) {
      log('info', `🔄 Update available: v${res.currentVersion} → v${res.remoteVersion}`);

      // Fill update card
      document.getElementById('update-ver').textContent = `v${res.currentVersion} → v${res.remoteVersion}`;
      const clDiv = document.getElementById('update-changelog');
      if (res.changelog && res.changelog.length > 0) {
        clDiv.innerHTML = '<ul>' + res.changelog.map(c => '<li>' + c + '</li>').join('') + '</ul>';
      } else {
        clDiv.innerHTML = '<p style="font-size:11px;color:#71717a">New version available</p>';
      }

      document.getElementById('update-overlay').classList.remove('hidden');

      // Sync button
      document.getElementById('update-now').onclick = async () => {
        const btn = document.getElementById('update-now');
        btn.disabled = true;
        btn.textContent = 'Syncing...';
        document.getElementById('update-progress').classList.remove('hidden');

        apex.onUpdateProgress((pct) => {
          document.getElementById('update-fill').style.width = pct + '%';
          document.getElementById('update-pct').textContent = pct + '%';
        });

        const result = await apex.syncUpdate(res.files, res.remoteVersion, res.changelog);

        if (result.success) {
          btn.textContent = 'Restarting...';
          log('success', '✓ ' + result.message);
          setTimeout(() => apex.restartApp(), 1500);
        } else {
          btn.textContent = 'Partial Update';
          log('warn', result.message);
          setTimeout(() => apex.restartApp(), 3000);
        }
      };

      // Skip button
      document.getElementById('update-later').onclick = () => {
        document.getElementById('update-overlay').classList.add('hidden');
        log('info', 'Update skipped.');
      };
    } else {
      log('info', '✓ Apex is up to date.');
    }
  } catch (e) {
    // No update server — that's fine
  }
})();
