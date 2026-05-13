// ==UserScript==
// @name           YT: Dismiss all - not interested
// @description    Floating button: mark all visible videos as "Not interested". Shift+Click for the whole page.
// @version        1.0.0
//
// @match          https://www.youtube.com/*
//
// @noframes
// @grant          none
//
// @license        MIT License
// ==/UserScript==
'use strict';

// ─── Selectors (kept in sync with wOxxOm's original script) ──────────────────

const ENTRY = [
  'ytd-rich-item-renderer',                        // Startseite
  'ytd-compact-video-renderer',                    // Seitenleiste beim Schauen
  '#related yt-lockup-view-model',                 // Seitenleiste (neues Layout)
  'ytd-video-renderer',                            // Suche / Verlauf
  '[page-subtype="history"] yt-lockup-view-model', // Verlauf (neues Layout)
].join(',');

const MENU_BTN = [
  '.ytLockupMetadataViewModelMenuButton button',
  '.dropdown-trigger',
  '.yt-lockup-metadata-view-model-wiz__menu-button button',
  '.yt-lockup-metadata-view-model__menu-button button',
  '.shortsLockupViewModelHostOutsideMetadataMenu button',
].join(',');

// Icon-Bezeichner für „Kein Interesse" in beiden Menu-Formaten
const NI_ICON_OLD = 'NOT_INTERESTED';   // data.icon.iconType
const NI_ICON_NEW = 'not_interested';   // clientResource.imageName (Teilstring)

// Fallback: Textmuster für verschiedene YouTube-Sprachen
const NI_TEXT_PATTERNS = [
  'not interested',
  'kein interesse',
  'pas intéressé',
  'no me interesa',
  'non mi interessa',
  'não tenho interesse',
  'нет интереса',
  '관심 없음',
  '興味なし',
];

// ─── Hilfsfunktionen ──────────────────────────────────────────────────────────

const $ = (sel, base = document) => base.querySelector(sel);
const $$ = (sel, base = document) => [...base.querySelectorAll(sel)];

function getProp(obj, path, isRaw = false) {
  if (!obj) return;
  const parts = path.split('.');
  try {
    if (obj instanceof Node) {
      obj = obj.wrappedJSObject || obj;
      obj = obj.polymerController || obj.__instance || obj.inst || obj;
      if (!isRaw) obj = obj.__data || obj;
    }
    for (const p of parts) {
      if (obj == null) return;
      obj = obj[p];
    }
    return obj;
  } catch (_) {}
}

function isInViewport(el) {
  const r = el.getBoundingClientRect();
  return r.top < window.innerHeight && r.bottom > 0;
}

const delay = (ms = 0) => new Promise(r => setTimeout(r, ms));
const raf   = ()       => new Promise(requestAnimationFrame);

function timedPromise(init, ms = 2000) {
  const timeout = new Promise(r => setTimeout(r, ms));
  return init ? Promise.race([timeout, new Promise(init)]) : timeout;
}

async function waitFor(sel, base = document) {
  return $(sel, base) || timedPromise(resolve => {
    const mo = new MutationObserver(() => {
      const el = $(sel, base);
      if (!el) return;
      mo.disconnect();
      resolve(el);
    });
    mo.observe(base, {childList: true, subtree: true});
  });
}

// ─── Menü-Erkennung ───────────────────────────────────────────────────────────

function isNotInterestedItem(el) {
  // Altes Format: data.icon.iconType === 'NOT_INTERESTED'
  if (getProp(el, 'data.icon.iconType') === NI_ICON_OLD) return true;
  // Neues Format: clientResource.imageName enthält 'not_interested'
  const imgName = getProp(el, 'props.data.leadingImage.sources.0.clientResource.imageName') || '';
  if (imgName.toLowerCase().includes(NI_ICON_NEW)) return true;
  // Textfallback (sprachunabhängig)
  const text = (el.innerText || '').toLowerCase();
  return NI_TEXT_PATTERNS.some(p => text.includes(p));
}

// ─── Kern-Logik: einen Eintrag dismissieren ───────────────────────────────────

let _sheet; // gemeinsames CSSStyleSheet für opacity-Hack

function ensureSheet() {
  if (_sheet) return _sheet;
  const s = document.createElement('style');
  document.head.appendChild(s);
  _sheet = s.sheet;
  return _sheet;
}

async function dismissEntry(entry) {
  const menuBtn = $(MENU_BTN, entry);
  if (!menuBtn) return false;

  const sheet = ensureSheet();
  const ruleIdx = sheet.insertRule(
    'ytd-popup-container:not(#\\0) { opacity: 0 !important }'
  );

  try {
    menuBtn.dispatchEvent(new MouseEvent('click', {bubbles: true}));
    await raf();

    // Popup finden, das zu diesem Eintrag gehört
    let menu;
    const container = await waitFor('ytd-popup-container');
    if (container) {
      const popups = getProp(container, 'popups_', true);
      if (popups) {
        const found = Object.values(popups).find(
          p => p.target && entry.contains(p.target)
        );
        if (found) menu = found.popup;
      }
    }
    if (!menu) return false;

    // Auf Menu-Rendering warten
    await delay(120);

    const itemContainer =
      $('#items', menu) ||
      $('[role="menu"], [role="listbox"]', menu);
    if (!itemContainer) return false;

    for (const item of itemContainer.children) {
      if (isNotInterestedItem(item)) {
        item.click();
        await delay(80);
        document.body.click();   // Menü schließen
        return true;
      }
    }

    document.body.click();
    return false;
  } finally {
    await delay(60);
    try { sheet.deleteRule(ruleIdx); } catch (_) {}
  }
}

// ─── Bulk-Dismiss ─────────────────────────────────────────────────────────────

let running = false;

async function dismissAll(viewportOnly) {
  if (running) {
    // zweiter Klick → Stop
    running = false;
    return;
  }
  running = true;

  const entries = $$(ENTRY).filter(e => !viewportOnly || isInViewport(e));
  let dismissed = 0;
  const total = entries.length;

  setBtn({label: `⏳ 0 / ${total}`, active: true});

  for (let i = 0; i < entries.length; i++) {
    if (!running) break;
    setBtn({label: `⏳ ${i + 1} / ${total}`, active: true});
    const ok = await dismissEntry(entries[i]);
    if (ok) {
        dismissed++;
        await delay(350); // Tempo drosseln, damit YT nicht streikt
    }
  }

  running = false;
  setBtn({
    label: `✓ ${dismissed} ausgeblendet`,
    active: false,
    temporary: true,
  });
}

// ─── Floating Button ──────────────────────────────────────────────────────────

let btnEl;

function setBtn({label, active, temporary = false}) {
  if (!btnEl) return;
  btnEl.title = active
    ? 'Klicken zum Stoppen'
    : 'Klick: Viewport  •  Shift+Klick: ganze Seite';
  if (active) {
    // flatten to plain text pill while running
    btnEl.textContent = label;
    Object.assign(btnEl.style, {
      opacity: '0.7', color: '#fff',
      background: 'rgba(50,50,50,0.9)', borderColor: 'transparent',
      borderRadius: '16px',
    });
  }
  if (temporary) {
    btnEl.textContent = label; // show ✓ result
    setTimeout(() => {
      if (!running) {
        // restore two-span idle structure
        Object.assign(btnEl.style, {
          opacity: '0.3', color: 'rgba(255,255,255,0.3)',
          background: 'transparent', borderColor: 'rgba(255,255,255,0.1)',
          borderRadius: '50%',
        });
        rebuildIdleSpans();
      }
    }, 4000);
  }
}

let lblSpan, icoSpan;

// Restores the two-span structure used in idle state.
function rebuildIdleSpans() {
  btnEl.innerHTML = '';

  lblSpan = document.createElement('span');
  lblSpan.textContent = '\u00A0Alle ausblenden'; // space after icon
  Object.assign(lblSpan.style, {
    display:    'inline-block',
    maxWidth:   '0',
    overflow:   'hidden',
    whiteSpace: 'nowrap',
    opacity:    '0',
    transition: 'max-width .45s ease, opacity .35s ease',
    verticalAlign: 'middle',
  });

  icoSpan = document.createElement('span');
  icoSpan.textContent = '🚫';
  Object.assign(icoSpan.style, {
    display:       'inline-block',
    verticalAlign: 'middle',
    lineHeight:    '1',
  });

  btnEl.appendChild(icoSpan);
  btnEl.appendChild(lblSpan);
}

function createButton() {
  if (btnEl) return;

  btnEl = document.createElement('button');
  btnEl.title = 'Klick: Viewport  •  Shift+Klick: ganze Seite';

  Object.assign(btnEl.style, {
    position:      'fixed',
    top:           '12px',  // centers 32px in 56px masthead
    left:          '200px', // after hamburger (~40px) + logo (~120px) + gap
    zIndex:        '99999',
    background:    'transparent',
    color:         'rgba(255,255,255,0.3)',
    border:        '1px solid rgba(255,255,255,0.1)',
    borderRadius:  '50%',
    minWidth:      '32px',
    height:        '32px',
    padding:       '0 8px',
    fontSize:      '15px',
    display:       'flex',
    alignItems:    'center',
    justifyContent:'flex-start', // icon anchors left, pill grows right
    cursor:        'pointer',
    opacity:       '0.3',
    transition:    'opacity .4s, background .4s, border-color .4s, border-radius .4s, color .4s',
    fontFamily:    'Roboto, sans-serif',
    userSelect:    'none',
    boxSizing:     'border-box',
  });

  rebuildIdleSpans();

  btnEl.addEventListener('mouseenter', () => {
    if (running) return;
    Object.assign(btnEl.style, {
      opacity:     '0.75',
      color:       'rgba(255,255,255,0.8)',
      background:  'rgba(255,255,255,0.08)',
      borderColor: 'rgba(255,255,255,0.18)',
      borderRadius:'16px',
    });
    lblSpan.style.maxWidth = '140px';
    lblSpan.style.opacity  = '1';
  });

  btnEl.addEventListener('mouseleave', () => {
    if (running) return;
    Object.assign(btnEl.style, {
      opacity:     '0.3',
      color:       'rgba(255,255,255,0.3)',
      background:  'transparent',
      borderColor: 'rgba(255,255,255,0.1)',
      borderRadius:'50%',
    });
    lblSpan.style.maxWidth = '0';
    lblSpan.style.opacity  = '0';
  });

  btnEl.addEventListener('mousedown', () => { btnEl.style.transform = 'scale(.92)'; });
  btnEl.addEventListener('mouseup',   () => { btnEl.style.transform = ''; });

  btnEl.addEventListener('click', e => {
    dismissAll(/* viewportOnly = */ !e.shiftKey);
  });

  document.body.appendChild(btnEl);
}

// ─── Init + SPA-Navigation ────────────────────────────────────────────────────

function init() {
  if (document.body) createButton();
  else setTimeout(init, 80);
}

function updateVisibility() {
  if (!btnEl) return;
  const onWatch = (location.pathname === '/watch') || (location.pathname === '/feed/subscriptions');
  btnEl.style.display = onWatch ? 'none' : '';
  btnEl.style.pointerEvents = onWatch ? 'none' : '';
}

// YouTube ist eine SPA – Button nach Navigation neu anhängen + Sichtbarkeit prüfen
addEventListener('yt-navigate-finish', () => {
  if (!document.body.contains(btnEl)) btnEl = null;
  init();
  updateVisibility();
});

init();
updateVisibility();