/* global JSZip, saveAs */
// Note: JSZip library https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js

(function () {
  'use strict';

  const C = {
    base:    '#1e1e2e', crust:  '#11111b', mantle: '#181825',
    surface: '#313244', overlay:'#45475a', muted:  '#585b70',
    text:    '#cdd6f4', subtext:'#a6adc8',
    blue:    '#89b4fa', green:  '#a6e3a1', red:    '#f38ba8',
    mauve:   '#cba6f7',
    hl_keyword: '#c586c0', hl_builtin: '#dcdcaa',
    hl_string:  '#ce9178', hl_number:  '#b5cea8',
    hl_comment: '#6a9955',
  };

  class PythonTranspiler {
    constructor () {
      this._updateTimer  = null;
      this._lastTargetId = null;
      this._pollInterval = null;
      this.sidebar       = null;
      this.codeDisplay   = null;
      this.lineNumbers   = null;
      this.spriteSelect  = null;
      this.statusBar     = null;

      this._buildSidebar();
      this._attachListeners();
      setTimeout(() => { this._refreshSprites(); this._scheduleUpdate(); }, 600);
    }

    // Extension metadata
    getInfo () {
      return {
        id: 'pyTranspiler', name: '🐍 Python View',
        color1: '#306998', color2: '#FFD43B', color3: '#FFD43B',
        blocks: [
          { opcode: 'toggleSidebar', blockType: Scratch.BlockType.COMMAND, text: 'toggle Python sidebar' },
          { opcode: 'showSidebar',   blockType: Scratch.BlockType.COMMAND, text: 'show Python sidebar'   },
          { opcode: 'hideSidebar',   blockType: Scratch.BlockType.COMMAND, text: 'hide Python sidebar'   },
        ],
      };
    }

    toggleSidebar () { this.sidebar.style.display = this.sidebar.style.display === 'none' ? 'flex' : 'none'; }
    showSidebar ()   { this.sidebar.style.display = 'flex'; }
    hideSidebar ()   { this.sidebar.style.display = 'none'; }

    // UI

    _buildSidebar () {
      const set  = (el, s) => Object.assign(el.style, s);
      const make = (tag, s = {}) => { const e = document.createElement(tag); set(e, s); return e; };

      //CSS Tabs
      const tabStyle = document.createElement('style');
      tabStyle.textContent = `
        .py-tab-bar { display: flex; background: ${C.crust}; padding: 8px; gap: 5px; border-bottom: 2px solid ${C.mantle}; }
        .py-tab { padding: 6px 12px; background: ${C.surface}; color: ${C.subtext}; cursor: pointer; border-radius: 4px; font-family: monospace; font-size: 13px; border: none; transition: 0.2s; }
        .py-tab:hover { background: ${C.overlay}; color: ${C.text}; }
        .py-tab.active { background: ${C.blue}; color: ${C.base}; font-weight: bold; }
        .py-view-container { display: flex; flex-direction: column; flex: 1; overflow: hidden; background: ${C.base}; }
        .py-view { display: none; flex: 1; overflow: auto; padding: 10px; }
        .py-view.active { display: flex; flex-direction: column; }
      `;
      document.head.appendChild(tabStyle);

      this.sidebar = make('div', {
        position: 'fixed', right: '0', top: '0',
        width: '360px', height: '100vh',
        backgroundColor: C.base, color: C.text,
        zIndex: '99999', display: 'flex', flexDirection: 'column',
        fontFamily: '"Fira Code","Cascadia Code",Consolas,monospace',
        fontSize: '12.5px',
        boxShadow: '-5px 0 30px rgba(0,0,0,.55)',
        borderLeft: `2px solid ${C.overlay}`,
        overflow: 'hidden', userSelect: 'text',
      });

      // Header
      const header = make('div', {
        display: 'flex', alignItems: 'center', gap: '7px',
        padding: '9px 12px', backgroundColor: C.mantle,
        borderBottom: `1px solid ${C.overlay}`,
        flexShrink: '0', flexWrap: 'wrap', minHeight: '42px',
      });

      const title = make('span', {
        fontWeight: '700', fontSize: '13px', color: C.mauve,
        marginRight: 'auto', flexShrink: '0',
      });
      title.textContent = '🐍 Python View';

      this.spriteSelect = make('select', {
        backgroundColor: C.surface, color: C.text,
        border: `1px solid ${C.overlay}`, borderRadius: '5px',
        padding: '3px 6px', fontSize: '11px', cursor: 'pointer',
        maxWidth: '120px', outline: 'none',
      });
      this.spriteSelect.addEventListener('change', () => this._scheduleUpdate(0));

      const mkBtn = (label, bg) => {
        const b = make('button', {
          backgroundColor: bg, color: C.base, border: 'none',
          borderRadius: '5px', padding: '4px 9px', cursor: 'pointer',
          fontWeight: '700', fontSize: '11px', flexShrink: '0',
        });
        b.textContent = label;
        b.addEventListener('mouseenter', () => (b.style.opacity = '.75'));
        b.addEventListener('mouseleave', () => (b.style.opacity = '1'));
        return b;
      };

      const copyBtn = mkBtn('📋 Copy', C.blue);
      copyBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(this.codeDisplay.textContent).then(() => {
          copyBtn.textContent = '✓ Copied!';
          setTimeout(() => (copyBtn.textContent = '📋 Copy'), 1600);
        });
      });

      const dlBtn = mkBtn('⬇ .py', C.green);
      dlBtn.addEventListener('click', () => {
        this._downloadZip();
      });

      const closeBtn = mkBtn('✕', C.red);
      closeBtn.addEventListener('click', () => this.hideSidebar());

      header.append(title, this.spriteSelect, copyBtn, dlBtn, closeBtn);

      // Tab Bar
      this.tabBar = document.createElement('div');
      this.tabBar.className = 'py-tab-bar';
      this.tabBar.innerHTML = `
        <button class="py-tab active" data-target="codeView">💻 Code</button>
        <button class="py-tab" data-target="spritesView">🐱 Sprites</button>
        <button class="py-tab" data-target="stageView">🖼️ Stage</button>
      `;

      this.viewContainer = document.createElement('div');
      this.viewContainer.className = 'py-view-container';

      this.codeView = document.createElement('div');
      this.codeView.className = 'py-view active';

      this.spritesView = document.createElement('div');
      this.spritesView.className = 'py-view';
      this.spritesView.innerHTML = `<h3 style="color:${C.text}; margin-top:0;">Sprite Assets</h3><div id="py-sprite-grid"></div>`;

      this.stageView = document.createElement('div');
      this.stageView.className = 'py-view';
      this.stageView.innerHTML = `<h3 style="color:${C.text}; margin-top:0;">Stage Assets</h3><div id="py-stage-grid"></div>`;

      const scrollBox = make('div', {
        flex: '1', overflow: 'auto', padding: '14px 16px',
        backgroundColor: C.base,
      });

      const codeTable = make('div', { display: 'flex', gap: '12px', minHeight: '100%' });

      this.lineNumbers = make('div', {
        color: C.muted, textAlign: 'right', userSelect: 'none',
        flexShrink: '0', lineHeight: '1.65', whiteSpace: 'pre', minWidth: '28px',
      });

      this.codeDisplay = make('pre', {
        margin: '0', flex: '1', whiteSpace: 'pre-wrap',
        wordBreak: 'break-word', lineHeight: '1.65',
      });
      this.codeDisplay.textContent = '# Python code will appear here…';

      codeTable.append(this.lineNumbers, this.codeDisplay);
      scrollBox.appendChild(codeTable);
      this.codeView.appendChild(scrollBox);

      this.viewContainer.appendChild(this.codeView);
      this.viewContainer.appendChild(this.spritesView);
      this.viewContainer.appendChild(this.stageView);

      // Status bar
      this.statusBar = make('div', {
        padding: '4px 12px', fontSize: '10.5px', color: C.subtext,
        backgroundColor: C.crust, borderTop: `1px solid ${C.overlay}`,
        flexShrink: '0', display: 'flex', justifyContent: 'space-between',
        userSelect: 'none',
      });
      this.statusBar.innerHTML = '<span>Ready</span><span>TurboWarp Python Transpiler</span>';

      this.sidebar.append(header, this.tabBar, this.viewContainer, this.statusBar);
      document.body.appendChild(this.sidebar);
    }

    _setCode (code) {
      this.codeDisplay.innerHTML = this._highlight(code);
      const n = (code.match(/\n/g) || []).length + 1;
      this.lineNumbers.textContent = Array.from({ length: n }, (_, i) => i + 1).join('\n');
    }

    // Asset Renderer
    _renderAssets (target) {
      // Grab the stage
      const stage = Scratch.vm.runtime.targets.find(t => t.isStage);

      // Helper function to build a grid of images
      const buildGrid = (targetObj, container) => {
        container.innerHTML = '';
        if (!targetObj || !targetObj.sprite || !targetObj.sprite.costumes) {
          container.innerHTML = `<div style="color:${C.muted}; padding: 10px;">No assets selected.</div>`;
          return;
        }

        // Apply grid styling to the container
        container.style.display = 'flex';
        container.style.flexWrap = 'wrap';
        container.style.gap = '10px';
        container.style.paddingTop = '10px';

        targetObj.sprite.costumes.forEach(costume => {
          // Create the card
          const card = document.createElement('div');
          card.style.cssText = `
            background: ${C.crust}; border: 1px solid ${C.overlay}; 
            border-radius: 6px; padding: 8px; text-align: center;
            display: inline-flex; flex-direction: column; align-items: center;
            width: 80px; justify-content: flex-end;
          `;
          
          // Create the image element
          const img = document.createElement('img');
          img.style.cssText = 'max-width: 64px; max-height: 64px; margin-bottom: 8px; object-fit: contain;';
          
          // Use Scratch's built-in encoder to get the image string
          if (costume.asset && costume.asset.encodeDataURI) {
            img.src = costume.asset.encodeDataURI();
          }
          
          // Create the label
          const name = document.createElement('span');
          name.style.cssText = `color: ${C.subtext}; font-size: 11px; word-break: break-word; line-height: 1.2;`;
          name.textContent = costume.name;
          
          card.append(img, name);
          container.appendChild(card);
        });
      };

      const spriteGrid = this.spritesView.querySelector('#py-sprite-grid');
      const stageGrid = this.stageView.querySelector('#py-stage-grid');
      
      // Render the grids
      if (spriteGrid) buildGrid(target.isStage ? null : target, spriteGrid);
      if (stageGrid) buildGrid(stage, stageGrid);
    }

    async _downloadZip () {
      // Check if JSZip exists, if not load it
      if (typeof JSZip === 'undefined') {
        console.log("Loading JSZip...");
        await new Promise((resolve) => {
          const script = document.createElement('script');
          script.src = "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js";
          script.onload = resolve;
          document.head.appendChild(script);
        });
      }

      // zip logic
      const zip = new JSZip();
      
      // Add the main Python code
      zip.file("main.py", this.codeDisplay.textContent);
      
      // Create an assets folder
      const assets = zip.folder("assets");
      
      // Loop through all targets and add costumes
      for (const target of Scratch.vm.runtime.targets) {
        for (const costume of target.sprite.costumes) {
          if (costume.asset && costume.asset.encodeDataURI) {
            const dataURI = costume.asset.encodeDataURI();
            const base64Data = dataURI.split(',')[1];
            const fileName = `${target.getName()}_${costume.name}.png`;
            assets.file(fileName, base64Data, { base64: true });
          }
        }
      }

      const content = await zip.generateAsync({ type: "blob" });
      
      // Use a standard download method
      const a = document.createElement('a');
      a.href = URL.createObjectURL(content);
      a.download = "scratch_project.zip";
      a.click();
    }

    // Live update wiring

    _attachListeners () {
      // Tab Switching Logic
      const tabs = this.tabBar.querySelectorAll('.py-tab');
      const views = [this.codeView, this.spritesView, this.stageView];

      tabs.forEach(tab => {
        tab.addEventListener('click', () => {
          tabs.forEach(t => t.classList.remove('active'));
          views.forEach(v => v.classList.remove('active'));

          tab.classList.add('active');

          const targetViewName = tab.getAttribute('data-target');
          this[targetViewName].classList.add('active');
        });
      });

      Scratch.vm.on('PROJECT_CHANGED', () => this._scheduleUpdate());
      Scratch.vm.on('targetsUpdate',   () => { this._refreshSprites(); this._scheduleUpdate(); });
      this._pollInterval = setInterval(() => {
        const t = Scratch.vm.editingTarget;
        if (t && this._lastTargetId !== t.id) {
          this._lastTargetId = t.id;
          this._refreshSprites();
          this._scheduleUpdate(0);
        }
      }, 300);
    }

    _scheduleUpdate (delay = 120) {
      clearTimeout(this._updateTimer);
      this._updateTimer = setTimeout(() => this._render(), delay);
    }

    _refreshSprites () {
      const targets = Scratch.vm.runtime.targets;
      if (!targets?.length) return;
      const prev = this.spriteSelect.value;
      this.spriteSelect.innerHTML = '';
      targets.forEach(t => {
        const o = document.createElement('option');
        o.value = t.id;
        o.textContent = t.isStage ? '🌐 Stage' : `🐱 ${t.getName()}`;
        this.spriteSelect.appendChild(o);
      });
      const et = Scratch.vm.editingTarget;
      this.spriteSelect.value = et?.id ?? prev ?? this.spriteSelect.options[0]?.value;
    }

    _render () {
      try {
        const id     = this.spriteSelect.value;
        const target = Scratch.vm.runtime.targets.find(t => t.id === id) ?? Scratch.vm.editingTarget;
        if (!target) return;
        const t0   = performance.now();
        const code = this._transpile(target);
        const ms   = (performance.now() - t0).toFixed(1);
        this._setCode(code);
        this._renderAssets(target); // Step 2: Hook it up to the update loop
        const hats  = Object.values(target.blocks._blocks).filter(b => b.topLevel).length;
        const total = Object.keys(target.blocks._blocks).length;
        const name  = target.isStage ? 'Stage' : target.getName();
        this.statusBar.innerHTML =
          `<span>${name} · ${hats} scripts · ${total} blocks</span><span>${ms} ms</span>`;
      } catch (err) {
        this._setCode(`# ⚠ Transpiler error:\n# ${err.message}\n#\n# ${err.stack?.split('\n')[1] ?? ''}`);
      }
    }

    // CORE TRANSPILER

    _pygameBoilerplate () {
      return `# Pygame Runtime Environment
import pygame
import math
import random
import time
import threading
import os

pygame.init()
screen = pygame.display.set_mode((480, 360))
pygame.display.set_caption("Scratch Project in Pygame")
clock = pygame.time.Clock()

# Global State Engine
x, y = 0, 0
direction = 90  # Scratch default (facing right)
size = 100
visible = True

# Event Registries
_flag_handlers = []
_broadcast_handlers = {}
_key_handlers = {}

def on_flag_clicked(func):
    _flag_handlers.append(func)
    return func

def on_broadcast(msg_name):
    def decorator(func):
        _broadcast_handlers.setdefault(msg_name, []).append(func)
        return func
    return decorator

def on_key_pressed(key_name):
    def decorator(func):
        _key_handlers.setdefault(key_name, []).append(func)
        return func
    return decorator

# Execution Engine
def broadcast(msg_name):
    if msg_name in _broadcast_handlers:
        for handler in _broadcast_handlers[msg_name]:
            handler()

def move(steps):
    global x, y
    # Convert Scratch degrees (0=up, 90=right) to standard math radians
    rad = math.radians(90 - direction)
    x += steps * math.cos(rad)
    y += steps * math.sin(rad)

def go_to(target):
    global x, y
    if target == "_mouse_":
        mx, my = pygame.mouse.get_pos()
        x, y = mx - 240, 180 - my  # Convert to Scratch coordinate space

def key_pressed(key_name):
    keys = pygame.key.get_pressed()
    if key_name == "any":
        return any(keys)
    
    # Map Scratch special key names to Pygame constants
    key_map = {
        "up arrow": pygame.K_UP,
        "down arrow": pygame.K_DOWN,
        "right arrow": pygame.K_RIGHT,
        "left arrow": pygame.K_LEFT,
        "space": pygame.K_SPACE,
        "enter": pygame.K_RETURN
    }
    
    if key_name in key_map:
        return keys[key_map[key_name]]
    
    # Handle single letters and numbers
    try:
        return keys[pygame.key.key_code(key_name)]
    except ValueError:
        return False

def is_mouse_down():
    # get_pressed() returns a tuple of (leftclick, middleclick, rightclick)
    # We just want the left click for standard Scratch behavior
    return pygame.mouse.get_pressed()[0]

def get_mouse_x():
    mx, my = pygame.mouse.get_pos()
    # Convert Pygame's 0 to 480 into Scratch's -240 to 240
    return mx - 240

def get_mouse_y():
    mx, my = pygame.mouse.get_pos()
    # Convert Pygame's 0 to 360 into Scratch's 180 to -180 (Pygame Y goes down, Scratch Y goes up)
    return 180 - my
`;
    }

    _transpile (target) {
      const blocks = target.blocks._blocks;
      const out    = [];
      out.push(`# Sprite : ${target.isStage ? 'Stage' : target.getName()}`);
      out.push(`# Source : TurboWarp Python Transpiler`);
      out.push('');

      // Boilerplate covers all imports (pygame, math, random, time, threading, os)
      out.push(this._pygameBoilerplate());
      out.push('');

      // Emit module-level initialisations for every Scratch variable and list
      const varEntries  = Object.values(target.variables ?? {});
      const listEntries = Object.values(target.lists     ?? {});
      if (varEntries.length || listEntries.length) {
        out.push('# Scratch Variables / Lists');
        for (const v of varEntries) {
          const pyName = this._n(v.name);
          const val    = (v.value !== '' && !isNaN(v.value))
            ? Number(v.value) : JSON.stringify(String(v.value ?? ''));
          out.push(`${pyName} = ${val}`);
        }
        for (const l of listEntries) {
          const pyName = this._n(l.name);
          const items  = (Array.isArray(l.value) ? l.value : [])
            .map(i => (i !== '' && !isNaN(i)) ? Number(i) : JSON.stringify(String(i)));
          out.push(`${pyName} = [${items.join(', ')}]`);
        }
        out.push('');
      }

      // Reset per-transpile hat-name counter so duplicate scripts get unique names
      this._hatNameCounts = {};

      // Define valid trigger hats
      const hatOpcodes = new Set([
        'event_whenflagclicked', 'event_whenkeypressed', 'event_whenthisspriteclicked',
        'event_whenstageclicked', 'event_whenbackdropswitchesto', 'event_whenbroadcastreceived',
        'control_start_as_clone', 'procedures_definition'
      ]);

      const hats = Object.values(blocks)
        .filter(b => b.topLevel && hatOpcodes.has(b.opcode))
        .sort((a, b) => (a.opcode.startsWith('procedures') ? 0 : 1) - (b.opcode.startsWith('procedures') ? 0 : 1));

      if (!hats.length) return out.join('\n') + '\n# (no scripts found)';

      hats.forEach(hat => {
        const code = this._block(hat, blocks, 0);
        if (code != null) out.push(code, '');
      });

      // Append the Pygame Execution Loop at the bottom
      out.push(`
# Asset Loader
# Loads every PNG exported by the ⬇ .py button into _sprite_images.
# Keys are "<SpriteName>_<CostumeName>" matching the zip filenames.
_sprite_images = {}
_current_costume = None
_asset_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "assets")
if os.path.isdir(_asset_dir):
    for _fn in sorted(os.listdir(_asset_dir)):
        if _fn.lower().endswith(('.png', '.jpg', '.jpeg', '.bmp', '.gif')):
            _key = os.path.splitext(_fn)[0]
            try:
                _img = pygame.image.load(os.path.join(_asset_dir, _fn)).convert_alpha()
                _sprite_images[_key] = _img
            except Exception as _e:
                print(f"Warning: could not load asset {_fn}: {_e}")
    if _sprite_images:
        _current_costume = next(iter(_sprite_images))

def _draw_sprite():
    """Draw the current costume at (x, y) in Scratch coordinate space."""
    if not visible:
        return
    sx = int(x + 240)
    sy = int(180 - y)
    if _current_costume and _current_costume in _sprite_images:
        img = _sprite_images[_current_costume]
        w = max(1, int(img.get_width()  * size / 100))
        h = max(1, int(img.get_height() * size / 100))
        scaled  = pygame.transform.scale(img, (w, h))
        rotated = pygame.transform.rotate(scaled, -(direction - 90))
        rect    = rotated.get_rect(center=(sx, sy))
        screen.blit(rotated, rect)
    else:
        # Fallback when no assets folder exists yet
        pygame.draw.circle(screen, (100, 149, 237), (sx, sy), max(4, int(size / 10)))

# Main Pygame Loop
# Each flag-clicked script runs in its own daemon thread so that
# forever-loops don't block the game loop from starting.
def _run_safe(handler):
    try:
        handler()
    except Exception as _e:
        import traceback
        print(f"[Script error in {handler.__name__}] {_e}")
        traceback.print_exc()

for handler in _flag_handlers:
    threading.Thread(target=_run_safe, args=(handler,), daemon=True).start()
time.sleep(0.05)  # brief pause so threads can initialise state

running = True
while running:
    screen.fill((255, 255, 255))  # White backdrop

    # Poll keys every frame — Scratch "when [key] pressed" fires
    # continuously while a key is held, not just on the initial KEYDOWN.
    for _key_name, _handlers in _key_handlers.items():
        if key_pressed(_key_name):
            for _h in _handlers:
                _h()

    # Draw the sprite using the loaded costume image (or fallback circle).
    _draw_sprite()

    for event in pygame.event.get():
        if event.type == pygame.QUIT:
            running = False

    pygame.display.flip()
    clock.tick(30)

pygame.quit()
`);

      return out.join('\n').trimEnd();
    }

    // Returns a unique Python function name for each hat block so that two
    // "when flag clicked" scripts don't silently overwrite each other.
    _uniqueHatName (base) {
      const count = (this._hatNameCounts[base] = (this._hatNameCounts[base] || 0) + 1);
      return count === 1 ? base : `${base}_${count}`;
    }

    // Sequence
    _stack (blockId, blocks, indent) {
      const lines = [];
      let id = blockId;
      while (id) {
        const b = blocks[id];
        if (!b) break;
        const line = this._block(b, blocks, indent);
        if (line != null) lines.push(line);
        id = b.next;
      }
      return lines.join('\n');
    }

    // Body attached below a hat (uses b.next)
    _body (b, blocks, indent) {
      if (!b.next) return `${'    '.repeat(indent + 1)}pass`;
      return this._stack(b.next, blocks, indent + 1) || `${'    '.repeat(indent + 1)}pass`;
    }

    // Body of a SUBSTACK/SUBSTACK2 input
    _sub (b, inputName, blocks, indent) {
      const id = this._subId(b, inputName, blocks);
      return id
        ? (this._stack(id, blocks, indent + 1) || `${'    '.repeat(indent + 1)}pass`)
        : `${'    '.repeat(indent + 1)}pass`;
    }

    /* Walk the block tree rooted at blockId and collect every module-level 
    name that the script *assigns to* (so we can emit a correct 'global'
    declaration at the top of each event-handler function). */
    _collectWrittenNames (blockId, blocks) {
      const names = new Set();

      // Built-in globals written by specific opcodes
      const OPCODE_WRITES = {
        'motion_gotoxy':           ['x', 'y'],
        'motion_changexby':        ['x'],
        'motion_setx':             ['x'],
        'motion_changeyby':        ['y'],
        'motion_sety':             ['y'],
        'motion_turnright':        ['direction'],
        'motion_turnleft':         ['direction'],
        'motion_pointindirection': ['direction'],
        'looks_changesizeby':      ['size'],
        'looks_setsizeto':         ['size'],
        'sensing_askandwait':      ['answer'],
        'sound_changevolumeby':    ['volume'],
        'sound_setvolumeto':       ['volume'],
        'sensing_resettimer':      ['timer'],
        'music_setTempo':          ['tempo'],
        'music_changeTempo':       ['tempo'],
      };

      const walk = (id) => {
        let cur = id;
        while (cur) {
          const blk = blocks[cur];
          if (!blk) break;
          const op = blk.opcode;

          // Built-in sprite globals
          if (OPCODE_WRITES[op]) OPCODE_WRITES[op].forEach(n => names.add(n));

          // User-defined Scratch variables
          if (op === 'data_setvariableto' || op === 'data_changevariableby') {
            const vn = blk.fields?.VARIABLE?.value;
            if (vn) names.add(this._n(vn));
          }

          // Recurse into any nested substacks (if/else, loops, etc.)
          const ss1 = blk.inputs?.SUBSTACK?.block;
          const ss2 = blk.inputs?.SUBSTACK2?.block;
          if (ss1) walk(ss1);
          if (ss2) walk(ss2);

          cur = blk.next;
        }
      };

      if (blockId) walk(blockId);
      return names;
    }

    _block (b, blocks, indent) {
      const I  = '    '.repeat(indent);
      const op = b.opcode;

      const inp  = n => this._inp(b, n, blocks);
      const fld  = n => b.fields?.[n]?.value ?? '';
      const body = ()  => this._body(b, blocks, indent);
      const sub1 = ()  => this._sub(b, 'SUBSTACK',  blocks, indent);
      const sub2 = ()  => this._sub(b, 'SUBSTACK2', blocks, indent);

      // EVENTS (Configured for standard Pygame engine callbacks)
      if (op === 'event_whenflagclicked') {
        const fname = this._uniqueHatName('when_flag_clicked');
        const written = this._collectWrittenNames(b.next, blocks);
        const globalDecl = written.size
          ? `${'    '.repeat(indent + 1)}global ${[...written].join(', ')}\n`
          : '';
        return `${I}@on_flag_clicked\ndef ${fname}():\n${globalDecl}${body()}`;
      }
      if (op === 'event_whenkeypressed') {
        let key = fld('KEY_OPTION').toLowerCase();
        if (key === 'space') key = 'space';
        const fname = this._uniqueHatName(`when_key_pressed_${this._n(fld('KEY_OPTION'))}`);
        const written = this._collectWrittenNames(b.next, blocks);
        const globalDecl = written.size
          ? `${'    '.repeat(indent + 1)}global ${[...written].join(', ')}\n`
          : '';
        return `${I}@on_key_pressed('${key}')\ndef ${fname}():\n${globalDecl}${body()}`;
      }
      if (op === 'event_whenthisspriteclicked') {
        const fname = this._uniqueHatName('when_sprite_clicked');
        const written = this._collectWrittenNames(b.next, blocks);
        const globalDecl = written.size
          ? `${'    '.repeat(indent + 1)}global ${[...written].join(', ')}\n`
          : '';
        return `${I}def ${fname}():\n${globalDecl}${body()}`;
      }
      if (op === 'event_whenstageclicked') {
        const fname = this._uniqueHatName('when_stage_clicked');
        const written = this._collectWrittenNames(b.next, blocks);
        const globalDecl = written.size
          ? `${'    '.repeat(indent + 1)}global ${[...written].join(', ')}\n`
          : '';
        return `${I}def ${fname}():\n${globalDecl}${body()}`;
      }
      if (op === 'event_whenbackdropswitchesto') {
        const fname = this._uniqueHatName(`when_backdrop_switches_to_${this._n(fld('BACKDROP'))}`);
        const written = this._collectWrittenNames(b.next, blocks);
        const globalDecl = written.size
          ? `${'    '.repeat(indent + 1)}global ${[...written].join(', ')}\n`
          : '';
        return `${I}def ${fname}():\n${globalDecl}${body()}`;
      }
      if (op === 'event_whenbroadcastreceived') {
        const msg = fld('BROADCAST_OPTION');
        const fname = this._uniqueHatName(`when_i_receive_${this._n(msg)}`);
        const written = this._collectWrittenNames(b.next, blocks);
        const globalDecl = written.size
          ? `${'    '.repeat(indent + 1)}global ${[...written].join(', ')}\n`
          : '';
        return `${I}@on_broadcast(${JSON.stringify(msg)})\ndef ${fname}():\n${globalDecl}${body()}`;
      }
      if (op === 'control_start_as_clone') {
        const fname = this._uniqueHatName('when_i_start_as_clone');
        const written = this._collectWrittenNames(b.next, blocks);
        const globalDecl = written.size
          ? `${'    '.repeat(indent + 1)}global ${[...written].join(', ')}\n`
          : '';
        return `${I}def ${fname}():\n${globalDecl}${body()}`;
      }
      if (op === 'event_whengreaterthan')        return `${I}def when_${this._n(fld('WHENGREATERTHANMENU'))}_gt_${inp('VALUE')}():\n${body()}`;
      if (op === 'event_broadcast')              return `${I}broadcast(${inp('BROADCAST_INPUT')})`;
      if (op === 'event_broadcastandwait')       return `${I}broadcast(${inp('BROADCAST_INPUT')}) # sequential processing stub`;

      // CONTROL
      if (op === 'control_if')           return `${I}if ${inp('CONDITION')}:\n${sub1()}`;
      if (op === 'control_if_else')      return `${I}if ${inp('CONDITION')}:\n${sub1()}\n${I}else:\n${sub2()}`;
      if (op === 'control_repeat')       return `${I}for _ in range(int(${inp('TIMES')})):\n${sub1()}`;
      if (op === 'control_forever') {
        const foreverBody = sub1();
        const sleepLine   = `${'    '.repeat(indent + 1)}time.sleep(0.03)  # ~30 fps throttle`;
        return `${I}while True:\n${foreverBody}\n${sleepLine}`;
      }
      if (op === 'control_wait')         return `${I}time.sleep(${inp('DURATION')})`;
      if (op === 'control_wait_until')   return `${I}while not (${inp('CONDITION')}):\n${I}    time.sleep(0.05)`;
      if (op === 'control_repeat_until') {
        const loopBody  = sub1();
        const sleepLine = `${'    '.repeat(indent + 1)}time.sleep(0.03)  # ~30 fps throttle`;
        return `${I}while not (${inp('CONDITION')}):\n${loopBody}\n${sleepLine}`;
      }
      if (op === 'control_stop') {
        const opt = fld('STOP_OPTION');
        if (opt === 'all')                     return `${I}exit()`;
        if (opt === 'this script')             return `${I}return`;
        if (opt === 'other scripts in sprite') return `${I}# stop other scripts`;
        return `${I}# stop ${opt}`;
      }
      if (op === 'control_create_clone_of')   return `${I}# create clone of ${inp('CLONE_OPTION')}`;
      if (op === 'control_delete_this_clone') return `${I}# delete this clone`;

      // LOOKS
      if (op === 'looks_say')              return `${I}print(${inp('MESSAGE')})`;
      if (op === 'looks_sayforsecs')       return `${I}print(${inp('MESSAGE')})\n${I}time.sleep(${inp('SECS')})`;
      if (op === 'looks_think')            return `${I}think(${inp('MESSAGE')})`;
      if (op === 'looks_thinkforsecs')     return `${I}think(${inp('MESSAGE')})\n${I}time.sleep(${inp('SECS')})`;
      if (op === 'looks_switchcostumeto')  return `${I}switch_costume(${inp('COSTUME')})`;
      if (op === 'looks_nextcostume')      return `${I}next_costume()`;
      if (op === 'looks_switchbackdropto') return `${I}switch_backdrop(${inp('BACKDROP')})`;
      if (op === 'looks_nextbackdrop')     return `${I}next_backdrop()`;
      if (op === 'looks_changesizeby')     return `${I}size += ${inp('CHANGE')}`;
      if (op === 'looks_setsizeto')        return `${I}size = ${inp('SIZE')}`;
      if (op === 'looks_changeeffectby')   return `${I}${this._n(fld('EFFECT'))}_effect += ${inp('CHANGE')}`;
      if (op === 'looks_seteffectto')      return `${I}${this._n(fld('EFFECT'))}_effect = ${inp('VALUE')}`;
      if (op === 'looks_cleargraphiceffects') return `${I}clear_effects()`;
      if (op === 'looks_show')             return `${I}show()`;
      if (op === 'looks_hide')             return `${I}hide()`;
      if (op === 'looks_gotofrontback')    return `${I}# go to ${fld('FRONT_BACK')} layer`;
      if (op === 'looks_goforwardbackwardlayers') return `${I}# go ${fld('FORWARD_BACKWARD')} ${inp('NUM')} layers`;
      if (op === 'looks_costumenumbername') return fld('NUMBER_NAME') === 'number' ? 'costume_number' : 'costume_name';
      if (op === 'looks_backdropnumbername') return fld('NUMBER_NAME') === 'number' ? 'backdrop_number' : 'backdrop_name';
      if (op === 'looks_size')             return 'size';

      // SOUND
      if (op === 'sound_play')            return `${I}play_sound(${inp('SOUND_MENU')})`;
      if (op === 'sound_playuntildone')   return `${I}play_sound_until_done(${inp('SOUND_MENU')})`;
      if (op === 'sound_stopallsounds')   return `${I}stop_all_sounds()`;
      if (op === 'sound_changevolumeby')  return `${I}volume += ${inp('VOLUME')}`;
      if (op === 'sound_setvolumeto')     return `${I}volume = ${inp('VOLUME')}`;
      if (op === 'sound_changeeffectby')  return `${I}# change sound ${this._n(fld('EFFECT'))} effect by ${inp('VALUE')}`;
      if (op === 'sound_seteffectto')     return `${I}# set sound ${this._n(fld('EFFECT'))} effect to ${inp('VALUE')}`;
      if (op === 'sound_cleareffects')    return `${I}# clear sound effects`;
      if (op === 'sound_volume')          return 'volume';

      // MOTION
      if (op === 'motion_movesteps')        return `${I}move(${inp('STEPS')})`;
      if (op === 'motion_turnright')        return `${I}direction = (direction + ${inp('DEGREES')}) % 360`;
      if (op === 'motion_turnleft')         return `${I}direction = (direction - ${inp('DEGREES')}) % 360`;
      if (op === 'motion_goto')             return `${I}go_to(${inp('TO')})`;
      if (op === 'motion_gotoxy')           return `${I}x, y = ${inp('X')}, ${inp('Y')}`;
      if (op === 'motion_glideto')          return `${I}# glide ${inp('SECS')} s to ${inp('TO')}`;
      if (op === 'motion_glidesecstoxy')    return `${I}# glide ${inp('SECS')} s to (${inp('X')}, ${inp('Y')})`;
      if (op === 'motion_pointindirection') return `${I}direction = ${inp('DIRECTION')}`;
      if (op === 'motion_pointtowards')     return `${I}# point towards ${inp('TOWARDS')}`;
      if (op === 'motion_changexby')        return `${I}x += ${inp('DX')}`;
      if (op === 'motion_setx')             return `${I}x = ${inp('X')}`;
      if (op === 'motion_changeyby')        return `${I}y += ${inp('DY')}`;
      if (op === 'motion_sety')             return `${I}y = ${inp('Y')}`;
      if (op === 'motion_ifonedgebounce')   return `${I}# if on edge, bounce`;
      if (op === 'motion_setrotationstyle') return `${I}# set rotation style: ${fld('STYLE')}`;
      if (op === 'motion_xposition')        return 'x';
      if (op === 'motion_yposition')        return 'y';
      if (op === 'motion_direction')        return 'direction';

      // SENSING
      if (op === 'sensing_askandwait')   return `${I}answer = input(${inp('QUESTION')})`;
      if (op === 'sensing_answer')       return 'answer';
      if (op === 'sensing_touchingobject') return `touching(${inp('TOUCHINGOBJECTMENU')})`;
      if (op === 'sensing_touchingcolor')  return `touching_color(${inp('COLOR')})`;
      if (op === 'sensing_coloristouchingcolor') return `color_touching_color(${inp('COLOR')}, ${inp('COLOR2')})`;
      if (op === 'sensing_distanceto')   return `distance_to(${inp('DISTANCETOMENU')})`;
      if (op === 'sensing_keypressed')   return `key_pressed(${inp('KEY_OPTION')})`;
      if (op === 'sensing_mousedown')    return 'is_mouse_down()';
      if (op === 'sensing_mousex')       return 'get_mouse_x()';
      if (op === 'sensing_mousey')       return 'get_mouse_y()';
      if (op === 'sensing_loudness')     return 'loudness';
      if (op === 'sensing_timer')        return 'timer';
      if (op === 'sensing_resettimer')   return `${I}timer = 0`;
      if (op === 'sensing_setdragmode')  return `${I}# set drag mode: ${fld('DRAG_MODE')}`;
      if (op === 'sensing_of')           return `get_attribute(${JSON.stringify(fld('PROPERTY'))}, ${inp('OBJECT')})`;
      if (op === 'sensing_current')      return `current_${this._n(fld('CURRENTMENU'))}`;
      if (op === 'sensing_dayssince2000') return 'days_since_2000';
      if (op === 'sensing_username')     return 'username';

      // OPERATORS
      if (op === 'operator_add')       return `(${inp('NUM1')} + ${inp('NUM2')})`;
      if (op === 'operator_subtract')  return `(${inp('NUM1')} - ${inp('NUM2')})`;
      if (op === 'operator_multiply')  return `(${inp('NUM1')} * ${inp('NUM2')})`;
      if (op === 'operator_divide')    return `(${inp('NUM1')} / ${inp('NUM2')})`;
      if (op === 'operator_mod')       return `(${inp('NUM1')} % ${inp('NUM2')})`;
      if (op === 'operator_round')     return `round(${inp('NUM')})`;
      if (op === 'operator_lt')        return `(${inp('OPERAND1')} < ${inp('OPERAND2')})`;
      if (op === 'operator_gt')        return `(${inp('OPERAND1')} > ${inp('OPERAND2')})`;
      if (op === 'operator_equals')    return `(${inp('OPERAND1')} == ${inp('OPERAND2')})`;
      if (op === 'operator_and')       return `(${inp('OPERAND1')} and ${inp('OPERAND2')})`;
      if (op === 'operator_or')        return `(${inp('OPERAND1')} or ${inp('OPERAND2')})`;
      if (op === 'operator_not')       return `(not ${inp('OPERAND')})`;
      if (op === 'operator_join')      return `(str(${inp('STRING1')}) + str(${inp('STRING2')}))`;
      if (op === 'operator_letter_of') return `str(${inp('STRING')})[int(${inp('LETTER')}) - 1]`;
      if (op === 'operator_length')    return `len(str(${inp('STRING')}))`;
      if (op === 'operator_contains')  return `(str(${inp('STRING2')}).lower() in str(${inp('STRING1')}).lower())`;
      if (op === 'operator_random')    return `random.randint(${inp('FROM')}, ${inp('TO')})`;
      if (op === 'operator_mathop') {
        const num = inp('NUM');
        const MAP = {
          'abs':     `abs(${num})`,       'floor':   `math.floor(${num})`,
          'ceiling': `math.ceil(${num})`, 'sqrt':    `math.sqrt(${num})`,
          'sin':     `math.sin(math.radians(${num}))`,
          'cos':     `math.cos(math.radians(${num}))`,
          'tan':     `math.tan(math.radians(${num}))`,
          'asin':    `math.degrees(math.asin(${num}))`,
          'acos':    `math.degrees(math.acos(${num}))`,
          'atan':    `math.degrees(math.atan(${num}))`,
          'ln':      `math.log(${num})`,  'log':     `math.log10(${num})`,
          'e ^':     `math.exp(${num})`,  '10 ^':    `(10 ** ${num})`,
        };
        return MAP[fld('OPERATOR').toLowerCase()] ?? `math_op(${JSON.stringify(fld('OPERATOR'))}, ${num})`;
      }

      // VARIABLES
      if (op === 'data_variable')         return this._n(fld('VARIABLE'));
      if (op === 'data_setvariableto')    return `${I}${this._n(fld('VARIABLE'))} = ${inp('VALUE')}`;
      if (op === 'data_changevariableby') return `${I}${this._n(fld('VARIABLE'))} += ${inp('VALUE')}`;
      if (op === 'data_showvariable')     return `${I}# show variable: ${this._n(fld('VARIABLE'))}`;
      if (op === 'data_hidevariable')     return `${I}# hide variable: ${this._n(fld('VARIABLE'))}`;

      // LISTS
      if (op === 'data_listidentifier')   return this._n(fld('LIST'));
      if (op === 'data_addtolist')        return `${I}${this._n(fld('LIST'))}.append(${inp('ITEM')})`;
      if (op === 'data_deleteoflist') {
        const lst = this._n(fld('LIST')); const idx = inp('INDEX');
        if (idx === '"last"' || idx === "'last'") return `${I}${lst}.pop()`;
        if (idx === '"all"'  || idx === "'all'")  return `${I}${lst}.clear()`;
        return `${I}${lst}.pop(int(${idx}) - 1)`;
      }
      if (op === 'data_deletealloflist')  return `${I}${this._n(fld('LIST'))}.clear()`;
      if (op === 'data_insertatlist') {
        const lst = this._n(fld('LIST')); const idx = inp('INDEX'); const itm = inp('ITEM');
        if (idx === '"last"' || idx === "'last'") return `${I}${lst}.append(${itm})`;
        return `${I}${lst}.insert(int(${idx}) - 1, ${itm})`;
      }
      if (op === 'data_replaceitemoflist')
        return `${I}${this._n(fld('LIST'))}[int(${inp('INDEX')}) - 1] = ${inp('ITEM')}`;
      if (op === 'data_itemoflist') {
        const lst = this._n(fld('LIST')); const idx = inp('INDEX');
        if (idx === '"last"' || idx === "'last'") return `${lst}[-1]`;
        return `${lst}[int(${idx}) - 1]`;
      }
      if (op === 'data_itemnumoflist')   return `(${this._n(fld('LIST'))}.index(${inp('ITEM')}) + 1)`;
      if (op === 'data_lengthoflist')    return `len(${this._n(fld('LIST'))})`;
      if (op === 'data_listcontainsitem') return `(${inp('ITEM')} in ${this._n(fld('LIST'))})`;
      if (op === 'data_showlist')        return `${I}# show list: ${this._n(fld('LIST'))}`;
      if (op === 'data_hidelist')        return `${I}# hide list: ${this._n(fld('LIST'))}`;

      // CUSTOM BLOCKS
      if (op === 'procedures_definition') return `${I}def ${this._procSig(b, blocks)}:\n${body()}`;
      if (op === 'procedures_call')       return `${I}${this._procCall(b, blocks)}`;
      if (op === 'argument_reporter_string_number') return this._n(fld('VALUE'));
      if (op === 'argument_reporter_boolean')       return this._n(fld('VALUE'));

      // PEN
      if (op === 'pen_clear')              return `${I}# pen: clear`;
      if (op === 'pen_stamp')              return `${I}# pen: stamp`;
      if (op === 'pen_penDown')            return `${I}# pen: down`;
      if (op === 'pen_penUp')              return `${I}# pen: up`;
      if (op === 'pen_setPenColorToColor') return `${I}# pen: set color ${inp('COLOR')}`;
      if (op === 'pen_changePenSizeBy')    return `${I}pen_size += ${inp('SIZE')}`;
      if (op === 'pen_setPenSizeTo')       return `${I}pen_size = ${inp('SIZE')}`;

      // MUSIC
      if (op === 'music_playDrumForBeats') return `${I}# music: drum ${inp('DRUM')} for ${inp('BEATS')} beats`;
      if (op === 'music_playNoteForBeats') return `${I}# music: note ${inp('NOTE')} for ${inp('BEATS')} beats`;
      if (op === 'music_restForBeats')     return `${I}# music: rest for ${inp('BEATS')} beats`;
      if (op === 'music_setInstrument')    return `${I}# music: set instrument ${inp('INSTRUMENT')}`;
      if (op === 'music_setTempo')         return `${I}tempo = ${inp('TEMPO')}`;
      if (op === 'music_changeTempo')      return `${I}tempo += ${inp('TEMPO')}`;
      if (op === 'music_getTempo')         return 'tempo';

      // TTS
      if (op === 'text2speech_speakAndWait') return `${I}# tts: speak ${inp('WORDS')}`;
      if (op === 'text2speech_setVoice')     return `${I}# tts: set voice ${inp('VOICE')}`;
      if (op === 'text2speech_setLanguage')  return `${I}# tts: set language ${inp('LANGUAGE')}`;

      // GENERIC SHADOW / MENU BLOCK FALLBACK
      // Catches all the little _menu_ opcodes automatically.
      // In runtime format, fields are objects: { value, id }
      const fieldKeys = Object.keys(b.fields || {});
      if (fieldKeys.length === 1) {
        const value = b.fields[fieldKeys[0]].value;
        // If it's a number, don't wrap it in string quotes
        if (value !== '' && !isNaN(value)) {
          return value;
        }
        return JSON.stringify(value);
      }

      return `${I}# [${op}]`;
    }

    /* INPUT RESOLUTION (aka) runtime format
    
     In Scratch VM runtime (what _blocks holds), inputs are stored as:
    
       block.inputs[name] = { name: string, block: id|null, shadow: id|null }
    
       • input.block  = the ID of the active block in the slot
                        (a reporter if one was dropped in, otherwise same as shadow)
       • input.shadow = the ID of the shadow block (default numeric/string value)
    
     Fields are stored as:
       block.fields[name] = { name: string, value: string, id: string|null }
    
     NOT the serialised .sb3 array format [shadowType, blockId]. */

    _inp (block, name, blocks) {
      const input = block.inputs?.[name];
      if (!input) {
        // Fallback -> some blocks store constant values in fields instead of inputs
        const f = block.fields?.[name];
        return f != null ? JSON.stringify(f.value ?? '') : '""';
      }

      // The "active" block is whatever is currently sitting in the slot.
      // If a reporter was dropped in, input.block !== input.shadow.
      // If no reporter, input.block === input.shadow (the default shadow).
      const activeId = input.block ?? input.shadow;
      if (!activeId) return '""';

      const activeBlock = blocks[activeId];
      if (!activeBlock) return '""';

      // Recursively transpile the block sitting in this slot.
      // Shadow blocks (number/string/menu defaults) are handled by the
      // generic fallback at the bottom of _block, which reads their fields.
      return this._block(activeBlock, blocks, 0) ?? '""';
    }

    // Get the block ID stored in a substack input (SUBSTACK / SUBSTACK2)
    _subId (block, name, blocks) {
      const input = block.inputs?.[name];
      if (!input) return null;
      // In runtime format, input.block holds the body's first block ID
      const id = input.block;
      return id && blocks[id] ? id : null;
    }

    // CUSTOM BLOCK HELPERS

    _procSig (defBlock, blocks) {
      const protoId = defBlock.inputs?.custom_block?.block;
      if (!protoId || !blocks[protoId]) return 'custom_block()';
      const proto    = blocks[protoId];
      const procCode = proto.mutation?.proccode  ?? 'custom_block';
      const argNames = JSON.parse(proto.mutation?.argumentnames ?? '[]');
      const rawName  = procCode.replace(/%[sbn]/g, '').trim();
      const funcName = (rawName ? this._n(rawName) : null) ?? 'custom_block';
      const params   = argNames.map(n => this._n(n)).join(', ');
      return `${funcName}(${params})`;
    }

    _procCall (callBlock, blocks) {
      const procCode = callBlock.mutation?.proccode ?? 'custom_block';
      const argIds   = JSON.parse(callBlock.mutation?.argumentids ?? '[]');
      const rawName  = procCode.replace(/%[sbn]/g, '').trim();
      const funcName = (rawName ? this._n(rawName) : null) ?? 'custom_block';
      const args = argIds.map(id => {
        const input = callBlock.inputs?.[id];
        if (!input) return '""';
        const activeId = input.block ?? input.shadow;
        if (!activeId || !blocks[activeId]) return '""';
        return this._block(blocks[activeId], blocks, 0) ?? '""';
      });
      return `${funcName}(${args.join(', ')})`;
    }

    // UTILITIES

    _n (name) {
      if (name == null || name === '') return 'var_';
      const KW = new Set(['False','None','True','and','as','assert','async','await',
        'break','class','continue','def','del','elif','else','except','finally',
        'for','from','global','if','import','in','is','lambda','nonlocal','not',
        'or','pass','raise','return','try','type','while','with','yield']);
      let r = String(name)
        .replace(/[^a-zA-Z0-9_]/g, '_')
        .replace(/^(\d)/, '_$1')
        .toLowerCase()
        .replace(/_+/g, '_')
        .replace(/^_+|_+$/g, '') || 'var_';
      if (KW.has(r)) r += '_';
      return r;
    }

    // SYNTAX HIGHLIGHTING

    _highlight (code) {
      const esc = s => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

      return code.split('\n').map(line => {
        // Full-line comment
        const cm = line.match(/^(\s*)(#.*)$/);
        if (cm) {
          return esc(cm[1]) +
            `<span style="color:${C.hl_comment};font-style:italic">${esc(cm[2])}</span>`;
        }

        const e = esc(line);

        // Split out string literals so keywords inside strings aren't coloured
        const segs = [];
        let lastIdx = 0;
        const strRe = /(&quot;(?:[^&]|&(?!quot;))*&quot;|'(?:[^'\\]|\\.)*')/g;
        let m;
        while ((m = strRe.exec(e)) !== null) {
          if (m.index > lastIdx) segs.push({ t: 'code', v: e.slice(lastIdx, m.index) });
          segs.push({ t: 'str', v: m[0] });
          lastIdx = m.index + m[0].length;
        }
        segs.push({ t: 'code', v: e.slice(lastIdx) });

        const KW  = /\b(def|class|if|elif|else|while|for|in|not|and|or|return|True|False|None|import|pass|break|continue|exit|lambda|yield|async|await|with|try|except|finally|raise|from|global|nonlocal|assert|del|is)\b/g;
        const BLT = /\b(print|input|range|len|round|abs|int|str|float|list|dict|set|bool|type|zip|map|filter|enumerate|sorted|reversed|sum|min|max|any|all|open|repr)\b/g;
        const NUM = /\b(\d+\.?\d*)\b/g;

        return segs.map(seg => {
          if (seg.t === 'str') return `<span style="color:${C.hl_string}">${seg.v}</span>`;
          return seg.v
            .replace(KW,  `<span style="color:${C.hl_keyword}">$1</span>`)
            .replace(BLT, `<span style="color:${C.hl_builtin}">$1</span>`)
            .replace(NUM, `<span style="color:${C.hl_number}">$1</span>`);
        }).join('');
      }).join('\n');
    }
  }

  Scratch.extensions.register(new PythonTranspiler());
})();