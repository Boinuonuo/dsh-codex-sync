/**
 * dsh-codex-sync client bundle (browser side).
 *
 * Registers the modern "Sync settings" trigger in the official additive
 * `shell.overlay` slot. One button toggles a menu with:
 *
 *   Actions (操作)
 *     - Import from Codex (从 Codex 导入)
 *     - Export to Codex (导出到 Codex)
 *     - Mirror status (查看镜像状态)
 *     - Refresh states (刷新状态)
 *   Features (功能开关) — live iOS-style smooth toggle switches
 *     - enableImport / autoImport / enableInstructions / enableConfig /
 *       enableSkills / mcpMirror
 *   Language (语言) — seamless English ⇄ 简体中文 toggle
 *
 * Fully adapts to DSH dark and light themes via native `--dsw-alias-*` tokens.
 *
 * Hand-authored CJS bundle (no build step). Adapted from dsh-import-agents'
 * SyncButton (MIT, (c) Chang-Tong / dongzhangust) — see NOTICE.
 */
window.__ModuleLoader__.load({ id: "dsh-codex-sync", factory: (require) => {
var module = { exports: {} }; var exports = module.exports;
'use strict'

const React = require('react')
let ReactDOM
try { ReactDOM = require('react-dom') } catch {}
if (!ReactDOM && typeof window !== 'undefined') ReactDOM = window.ReactDOM
const h = React.createElement
const { useEffect, useRef, useState, useCallback } = React

/* --- Inject Pure CSS for perfectly responsive hover transitions --- */
function ensureStylesInjected() {
  if (typeof document === 'undefined') return
  const id = 'dsh-codex-sync-style-v1'
  if (document.getElementById(id)) return
  const style = document.createElement('style')
  style.id = id
  style.textContent = `
    @keyframes codex-modal-pop {
      from { opacity: 0; transform: scale(0.96) translateY(4px); }
      to { opacity: 1; transform: scale(1) translateY(0); }
    }
    @keyframes codex-subpage-in {
      from { opacity: 0; transform: translateX(8px); }
      to { opacity: 1; transform: translateX(0); }
    }
    .codex-sync-dialog-animate {
      animation: codex-modal-pop 180ms cubic-bezier(0.16, 1, 0.3, 1) both;
    }
    .codex-sync-subpage-animate {
      animation: codex-subpage-in 160ms cubic-bezier(0.16, 1, 0.3, 1) both;
    }
    .codex-sync-card {
      transition: background 0.15s ease, border-color 0.15s ease, transform 0.12s ease, box-shadow 0.15s ease !important;
    }
    .codex-sync-card:hover {
      background: var(--dsw-alias-interactive-bg-hover, rgba(127,127,127,0.12)) !important;
      border-color: var(--dsw-alias-border-l2, rgba(127,127,127,0.28)) !important;
      transform: translateY(-1px);
      box-shadow: 0 4px 12px var(--dsw-alias-bg-mask-1, rgba(0,0,0,0.12)) !important;
    }
    .codex-sync-card:active {
      transform: scale(0.985);
    }
    .codex-sync-row {
      transition: background 0.12s ease !important;
    }
    .codex-sync-row:hover {
      background: var(--dsw-alias-interactive-bg-hover, rgba(127,127,127,0.06)) !important;
    }
    .codex-sync-item-row {
      transition: background 0.12s ease, transform 0.1s ease !important;
    }
    .codex-sync-item-row:hover {
      background: var(--dsw-alias-interactive-bg-hover, rgba(127,127,127,0.08)) !important;
    }
    .codex-sync-open-cfg {
      transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease, transform 0.1s ease !important;
    }
    .codex-sync-open-cfg:hover {
      background: var(--dsw-alias-interactive-bg-hover, rgba(127,127,127,0.14)) !important;
      border-color: var(--dsw-alias-border-l2, rgba(127,127,127,0.36)) !important;
      color: var(--dsw-alias-label-primary) !important;
      transform: scale(1.05);
    }
    .codex-sync-pill-btn {
      transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease !important;
    }
    .codex-sync-pill-btn:hover {
      background: var(--dsw-alias-interactive-bg-hover, rgba(127,127,127,0.18)) !important;
      color: var(--dsw-alias-label-primary) !important;
    }
    .codex-sync-back {
      transition: background 0.15s ease, transform 0.1s ease, color 0.15s ease !important;
    }
    .codex-sync-back:hover {
      background: var(--dsw-alias-interactive-bg-hover, rgba(127,127,127,0.12)) !important;
      color: var(--dsw-alias-label-primary) !important;
      transform: translateX(-1px);
    }
    [data-codex-sync-trigger] {
      pointer-events: auto !important;
    }
    .codex-sync-trigger-wide {
      transition: background-color 0.15s ease, color 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease !important;
      color: var(--dsw-alias-label-secondary) !important;
    }
    .codex-sync-trigger-wide:hover {
      background: var(--dsw-alias-interactive-bg-hover, rgba(127,127,127,0.14)) !important;
      color: var(--dsw-alias-label-primary) !important;
    }
    .codex-sync-trigger-rail {
      transition: background-color 0.15s ease, color 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease !important;
      animation: codex-sync-rail-fade-in 160ms ease-out both;
      color: var(--dsw-alias-label-secondary, var(--dsw-text-secondary, currentColor)) !important;
    }
    @keyframes codex-sync-rail-fade-in {
      from { opacity: 0; }
      to { opacity: 1; }
    }
    .codex-sync-trigger-rail:hover {
      background: var(--dsw-alias-interactive-bg-hover, rgba(127,127,127,0.14)) !important;
      color: var(--dsw-alias-label-primary) !important;
    }

    /* Maid-atelier (深海女仆工坊) skin integration: exact native rail icon button style */
    body[data-dsh-maid-atelier] [data-codex-sync-trigger] {
      color: #dfbf7c !important;
    }
    body[data-dsh-maid-atelier] [data-codex-sync-trigger]:is(:hover, :focus-visible, [aria-expanded="true"]) {
      border-color: rgba(225, 191, 124, 0.68) !important;
      color: #fff1ce !important;
      background: rgba(87, 117, 190, 0.28) !important;
      outline: none !important;
      box-shadow: none !important;
    }
    body[data-dsh-maid-atelier] [data-codex-sync-trigger][data-mode="rail"] {
      width: 38px !important;
      min-width: 38px !important;
      height: 38px !important;
      border: 1px solid transparent !important;
      border-radius: 50% !important;
      background: transparent !important;
      box-shadow: none !important;
      color: #dfbf7c !important;
    }
    body[data-dsh-maid-atelier] [data-codex-sync-trigger][data-mode="wide"] {
      color: #dfbf7c !important;
    }
    body[data-dsh-maid-atelier] [data-codex-sync-trigger][data-mode="wide"]:is(:hover, :focus-visible, [aria-expanded="true"]) {
      border-color: rgba(225, 191, 124, 0.68) !important;
      color: #fff1ce !important;
      background: rgba(87, 117, 190, 0.28) !important;
      outline: none !important;
      box-shadow: none !important;
    }
  `
  document.head.appendChild(style)
}

/* --- SVG Icons --- */
const svgIcon = (children, viewBox = "0 0 24 24", size = 13, style = {}) => h('svg', {
  width: size,
  height: size,
  viewBox,
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: '2',
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  style: Object.assign({ flexShrink: 0, display: 'inline-block', verticalAlign: 'middle' }, style)
}, children)

const Icons = {
  codex: (size = 16) => h('svg', {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'currentColor',
    fillRule: 'evenodd',
    style: { flexShrink: 0, display: 'inline-block', verticalAlign: 'middle' },
  }, h('path', {
    clipRule: 'evenodd',
    d: 'M8.086.457a6.105 6.105 0 013.046-.415c1.333.153 2.521.72 3.564 1.7a.117.117 0 00.107.029c1.408-.346 2.762-.224 4.061.366l.063.03.154.076c1.357.703 2.33 1.77 2.918 3.198.278.679.418 1.388.421 2.126a5.655 5.655 0 01-.18 1.631.167.167 0 00.04.155 5.982 5.982 0 011.578 2.891c.385 1.901-.01 3.615-1.183 5.14l-.182.22a6.063 6.063 0 01-2.934 1.851.162.162 0 00-.108.102c-.255.736-.511 1.364-.987 1.992-1.199 1.582-2.962 2.462-4.948 2.451-1.583-.008-2.986-.587-4.21-1.736a.145.145 0 00-.14-.032c-.518.167-1.04.191-1.604.185a5.924 5.924 0 01-2.595-.622 6.058 6.058 0 01-2.146-1.781c-.203-.269-.404-.522-.551-.821a7.74 7.74 0 01-.495-1.283 6.11 6.11 0 01-.017-3.064.166.166 0 00.008-.074.115.115 0 00-.037-.064 5.958 5.958 0 01-1.38-2.202 5.196 5.196 0 01-.333-1.589 6.915 6.915 0 01.188-2.132c.45-1.484 1.309-2.648 2.577-3.493.282-.188.55-.334.802-.438.286-.12.573-.22.861-.304a.129.129 0 00.087-.087A6.016 6.016 0 015.635 2.31C6.315 1.464 7.132.846 8.086.457zm-.804 7.85a.848.848 0 00-1.473.842l1.694 2.965-1.688 2.848a.849.849 0 001.46.864l1.94-3.272a.849.849 0 00.007-.854l-1.94-3.393zm5.446 6.24a.849.849 0 000 1.695h4.848a.849.849 0 000-1.696h-4.848z',
  })),
  sync: () => svgIcon([
    h('path', { key: 1, d: 'M21.5 2v6h-6' }),
    h('path', { key: 2, d: 'M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67' })
  ], '0 0 24 24', 12),
  import: () => svgIcon([
    h('path', { key: 1, d: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4' }),
    h('polyline', { key: 2, points: '7 10 12 15 17 10' }),
    h('line', { key: 3, x1: '12', y1: '15', x2: '12', y2: '3' })
  ], '0 0 24 24', 13),
  export: () => svgIcon([
    h('path', { key: 1, d: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4' }),
    h('polyline', { key: 2, points: '17 8 12 3 7 8' }),
    h('line', { key: 3, x1: '12', y1: '3', x2: '12', y2: '15' })
  ], '0 0 24 24', 13),
  status: () => svgIcon([
    h('rect', { key: 1, x: '2', y: '2', width: '20', height: '8', rx: '2', ry: '2' }),
    h('rect', { key: 2, x: '2', y: '14', width: '20', height: '8', rx: '2', ry: '2' }),
    h('line', { key: 3, x1: '6', y1: '6', x2: '6.01', y2: '6' }),
    h('line', { key: 4, x1: '6', y1: '18', x2: '6.01', y2: '18' })
  ], '0 0 24 24', 13),
  refresh: () => svgIcon([
    h('polyline', { key: 1, points: '23 4 23 10 17 10' }),
    h('polyline', { key: 2, points: '1 20 1 14 7 14' }),
    h('path', { key: 3, d: 'M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15' })
  ], '0 0 24 24', 13),
  globe: () => svgIcon([
    h('circle', { key: 1, cx: '12', cy: '12', r: '10' }),
    h('line', { key: 2, x1: '2', y1: '12', x2: '22', y2: '12' }),
    h('path', { key: 3, d: 'M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z' })
  ], '0 0 24 24', 13),
  info: () => svgIcon([
    h('circle', { key: 1, cx: '12', cy: '12', r: '10' }),
    h('line', { key: 2, x1: '12', y1: '16', x2: '12', y2: '12' }),
    h('line', { key: 3, x1: '12', y1: '8', x2: '12.01', y2: '8' })
  ], '0 0 24 24', 12),
  search: () => svgIcon([
    h('circle', { key: 1, cx: '11', cy: '11', r: '7' }),
    h('line', { key: 2, x1: '21', y1: '21', x2: '16.2', y2: '16.2' })
  ], '0 0 24 24', 13),
  folder: () => svgIcon([
    h('path', { key: 1, d: 'M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z' })
  ], '0 0 24 24', 13),
  folderOpen: () => svgIcon([
    h('path', { key: 1, d: 'm6 14 1.5-6.5A2 2 0 0 1 9.4 6H20a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.7.9l.8 1.2A2 2 0 0 0 12.1 6H19a2 2 0 0 1 2 2' })
  ], '0 0 24 24', 13),
  chat: () => svgIcon([
    h('path', { key: 1, d: 'M7.9 20A9 9 0 1 0 4 16.1L2 22Z' })
  ], '0 0 24 24', 12),
  chevronRight: () => svgIcon([
    h('polyline', { key: 1, points: '9 18 15 12 9 6' })
  ], '0 0 24 24', 11),
  chevronDown: () => svgIcon([
    h('polyline', { key: 1, points: '6 9 12 15 18 9' })
  ], '0 0 24 24', 11),
  checkCircle: () => svgIcon([
    h('path', { key: 1, d: 'M22 11.08V12a10 10 0 1 1-5.93-9.14' }),
    h('polyline', { key: 2, points: '22 4 12 14.01 9 11.01' })
  ], '0 0 24 24', 28, { color: 'var(--dsw-alias-state-success-primary, #22c55e)' }),
  sparkles: () => svgIcon([
    h('path', { key: 1, d: 'm12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3z' }),
    h('path', { key: 2, d: 'M19 3v4' }),
    h('path', { key: 3, d: 'M21 5h-4' }),
  ], '0 0 24 24', 14),
  server: () => svgIcon([
    h('rect', { key: 1, x: '2', y: '2', width: '20', height: '8', rx: '2', ry: '2' }),
    h('rect', { key: 2, x: '2', y: '14', width: '20', height: '8', rx: '2', ry: '2' }),
    h('line', { key: 3, x1: '6', y1: '6', x2: '6.01', y2: '6' }),
    h('line', { key: 4, x1: '6', y1: '18', x2: '6.01', y2: '18' }),
  ], '0 0 24 24', 14),
  arrowLeft: () => svgIcon([
    h('line', { key: 1, x1: '19', y1: '12', x2: '5', y2: '12' }),
    h('polyline', { key: 2, points: '12 19 5 12 12 5' }),
  ], '0 0 24 24', 13),
  externalLink: () => svgIcon([
    h('path', { key: 1, d: 'M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6' }),
    h('polyline', { key: 2, points: '15 3 21 3 21 9' }),
    h('line', { key: 3, x1: '10', y1: '14', x2: '21', y2: '3' }),
  ], '0 0 24 24', 11),
  lock: () => svgIcon([
    h('rect', { key: 1, x: '3', y: '11', width: '18', height: '11', rx: '2', ry: '2' }),
    h('path', { key: 2, d: 'M7 11V7a5 5 0 0 1 10 0v4' }),
  ], '0 0 24 24', 11),
  clear: () => svgIcon([
    h('line', { key: 1, x1: '18', y1: '6', x2: '6', y2: '18' }),
    h('line', { key: 2, x1: '6', y1: '6', x2: '18', y2: '18' })
  ], '0 0 24 24', 10),
}

/** Theme-adaptive styles: full integration with DSH `--dsw-alias-*` design system. */
const styles = {
  wrapper: {
    position: 'relative',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    userSelect: 'none',
  },
  triggerBtn: {
    position: 'relative',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '32px',
    height: '32px',
    borderRadius: '50%',
    border: 'none',
    background: 'transparent',
    color: 'var(--dsw-alias-label-secondary, var(--dsw-text-secondary, currentColor))',
    cursor: 'pointer',
    padding: 0,
    transition: 'background-color 0.15s cubic-bezier(0.4, 0, 0.2, 1), color 0.15s cubic-bezier(0.4, 0, 0.2, 1)',
  },
  triggerBtnHover: {
    background: 'var(--dsw-alias-interactive-bg-hover, var(--dsw-surface-hover, rgba(127,127,127,0.12)))',
    color: 'var(--dsw-alias-label-primary, var(--dsw-text-primary, currentColor))',
  },
  triggerBtnActive: {
    background: 'var(--dsw-alias-interactive-bg-active, var(--dsw-surface-active, rgba(127,127,127,0.18)))',
    color: 'var(--dsw-alias-label-primary, var(--dsw-text-primary, currentColor))',
  },
  busy: { opacity: 0.6, cursor: 'progress' },
  menu: {
    position: 'absolute',
    left: '0',
    bottom: 'calc(100% + 8px)',
    minWidth: '260px',
    zIndex: 1000,
    border: '1px solid var(--dsw-alias-border-l2, var(--dsw-border-subtle, rgba(127,127,127,0.22)))',
    borderRadius: '10px',
    background: 'var(--dsw-alias-bg-layer-2, var(--dsw-surface, #ffffff))',
    backdropFilter: 'blur(16px)',
    WebkitBackdropFilter: 'blur(16px)',
    boxShadow: '0 12px 36px rgba(0,0,0,0.22), 0 2px 8px rgba(0,0,0,0.08)',
    padding: '6px',
    fontSize: '12px',
    color: 'var(--dsw-alias-label-primary, var(--dsw-text-primary, currentColor))',
  },
  sectionTitle: {
    padding: '6px 8px 3px',
    color: 'var(--dsw-alias-label-tertiary, var(--dsw-text-tertiary, #8e8e93))',
    fontSize: '10px',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
  },
  divider: {
    height: '1px',
    margin: '4px 6px',
    background: 'var(--dsw-alias-border-l1, var(--dsw-border-subtle, rgba(127,127,127,0.14)))',
  },
  rowWrap: {
    position: 'relative',
    width: '100%',
    margin: '1px 0',
  },
  item: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: '7px',
    width: '100%',
    padding: '6px 8px',
    border: 'none',
    borderRadius: '6px',
    background: 'transparent',
    color: 'var(--dsw-alias-label-primary, var(--dsw-text-primary, currentColor))',
    fontSize: '12px',
    textAlign: 'left',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    transition: 'background 0.12s ease, color 0.12s ease',
  },
  itemHover: {
    background: 'var(--dsw-alias-interactive-bg-hover, var(--dsw-surface-hover, rgba(127,127,127,0.12)))',
  },
  rowLabel: {
    color: 'var(--dsw-alias-label-primary, var(--dsw-text-primary, currentColor))',
    fontWeight: '400',
  },
  infoIconWrapper: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '16px',
    height: '16px',
    color: 'var(--dsw-alias-label-tertiary, var(--dsw-text-tertiary, #999))',
    borderRadius: '50%',
    cursor: 'help',
    transition: 'color 0.15s ease',
  },
  spacer: { flex: '1 1 auto' },
  switchTrack: {
    position: 'relative',
    display: 'inline-flex',
    alignItems: 'center',
    width: '28px',
    height: '16px',
    borderRadius: '999px',
    flexShrink: 0,
    transition: 'background-color 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
  },
  switchThumb: {
    position: 'absolute',
    width: '12px',
    height: '12px',
    borderRadius: '50%',
    backgroundColor: '#ffffff',
    boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
    transition: 'left 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
  },
  tagPill: {
    fontSize: '11px',
    fontWeight: '500',
    padding: '2px 7px',
    borderRadius: '6px',
    background: 'var(--dsw-alias-bg-module-platform, rgba(127,127,127,0.12))',
    color: 'var(--dsw-alias-label-secondary, var(--dsw-text-secondary, #888))',
  },
  tooltip: {
    position: 'absolute',
    left: '6px',
    right: '6px',
    top: 'calc(100% + 2px)',
    zIndex: 1300,
    padding: '7px 10px',
    borderRadius: '8px',
    // Same contrast pair as the menu (layer + primary label). Do not use
    // --dsw-alias-label-primary-inverted: in dark theme it is a dark color
    // and becomes unreadable on a dark tooltip/menu surface.
    background: 'var(--dsw-alias-bg-layer-3, var(--dsw-alias-bg-layer-2))',
    border: '1px solid var(--dsw-alias-border-l2)',
    boxShadow: '0 8px 24px var(--dsw-alias-bg-mask-1, rgba(0,0,0,0.28))',
    color: 'var(--dsw-alias-label-primary)',
    fontSize: '11px',
    lineHeight: '1.45',
    whiteSpace: 'normal',
    wordBreak: 'break-word',
    pointerEvents: 'none',
  },
  overlay: {
    position: 'fixed',
    inset: 0,
    zIndex: 2000,
    background: 'var(--dsw-alias-bg-mask-1, rgba(0,0,0,0.45))',
    backdropFilter: 'blur(8px)',
    WebkitBackdropFilter: 'blur(8px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '20px',
  },
  dialog: {
    width: 'min(640px, 95vw)',
    maxHeight: 'min(78vh, 680px)',
    display: 'flex',
    flexDirection: 'column',
    borderRadius: '14px',
    background: 'var(--dsw-alias-bg-layer-2, var(--dsw-surface, #fff))',
    border: '1px solid var(--dsw-alias-border-l2, rgba(127,127,127,0.22))',
    boxShadow: '0 24px 64px -12px var(--dsw-alias-bg-mask-1, rgba(0,0,0,0.4)), 0 4px 16px rgba(0,0,0,0.1)',
    color: 'var(--dsw-alias-label-primary)',
    overflow: 'hidden',
  },
  settingsDialog: {
    width: 'min(580px, 95vw)',
    maxHeight: 'min(86vh, 740px)',
    display: 'flex',
    flexDirection: 'column',
    borderRadius: '16px',
    background: 'var(--dsw-alias-bg-layer-2, var(--dsw-surface, #1e1e20))',
    border: '1px solid var(--dsw-alias-border-l2, rgba(127,127,127,0.22))',
    boxShadow: '0 24px 64px -12px var(--dsw-alias-bg-mask-1, rgba(0,0,0,0.5)), 0 4px 20px rgba(0,0,0,0.15)',
    color: 'var(--dsw-alias-label-primary)',
    overflow: 'hidden',
  },
  dialogHead: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '13px 16px',
    background: 'var(--dsw-alias-bg-layer-3, rgba(127,127,127,0.04))',
    borderBottom: '1px solid var(--dsw-alias-border-l1, rgba(127,127,127,0.14))',
  },
  backBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '26px',
    height: '26px',
    border: '1px solid var(--dsw-alias-border-l1, rgba(127,127,127,0.18))',
    borderRadius: '7px',
    background: 'var(--dsw-alias-bg-layer-1, rgba(127,127,127,0.06))',
    color: 'var(--dsw-alias-label-secondary, currentColor)',
    cursor: 'pointer',
    padding: 0,
    flex: '0 0 auto',
  },
  subpageBody: {
    padding: '14px 18px 16px',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    overflowY: 'auto',
  },
  settingDesc: {
    fontSize: '11px',
    lineHeight: 1.45,
    color: 'var(--dsw-alias-label-tertiary, var(--dsw-text-secondary, rgba(255,255,255,0.55)))',
    marginTop: '2px',
    whiteSpace: 'normal',
    wordBreak: 'break-word',
  },
  openCfgBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '22px',
    height: '22px',
    border: '1px solid var(--dsw-alias-border-l1, rgba(127,127,127,0.22))',
    borderRadius: '6px',
    background: 'var(--dsw-alias-bg-layer-2, rgba(127,127,127,0.08))',
    color: 'var(--dsw-alias-label-secondary, currentColor)',
    cursor: 'pointer',
    padding: 0,
    flex: '0 0 auto',
  },
  searchWrap: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    flex: '1 1 auto',
    minWidth: 0,
  },
  searchIcon: {
    position: 'absolute',
    left: '9px',
    color: 'var(--dsw-alias-label-tertiary)',
    pointerEvents: 'none',
    display: 'flex',
    alignItems: 'center',
  },
  search: {
    width: '100%',
    height: '32px',
    padding: '0 26px 0 28px',
    borderRadius: '8px',
    border: '1px solid var(--dsw-alias-border-l2, rgba(127,127,127,0.24))',
    background: 'var(--dsw-alias-bg-layer-1, rgba(127,127,127,0.06))',
    color: 'var(--dsw-alias-label-primary)',
    fontSize: '12px',
    outline: 'none',
    transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
  },
  searchClear: {
    position: 'absolute',
    right: '6px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '18px',
    height: '18px',
    padding: 0,
    border: 'none',
    borderRadius: '50%',
    background: 'transparent',
    color: 'var(--dsw-alias-label-tertiary)',
    cursor: 'pointer',
  },
  filterBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    flexShrink: 0,
    height: '30px',
    padding: '0 10px',
    borderRadius: '7px',
    border: '1px solid var(--dsw-alias-border-l2, rgba(127,127,127,0.24))',
    background: 'transparent',
    color: 'var(--dsw-alias-label-secondary)',
    fontSize: '12px',
    fontWeight: '500',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    transition: 'background-color 0.15s ease, color 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease',
  },
  dialogBody: {
    flex: '1 1 auto',
    overflowY: 'auto',
    overflowX: 'hidden',
    padding: '8px 12px 12px',
    boxSizing: 'border-box',
    width: '100%',
  },
  dialogFoot: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '8px',
    padding: '11px 14px',
    background: 'var(--dsw-alias-bg-layer-3, rgba(127,127,127,0.03))',
    borderTop: '1px solid var(--dsw-alias-border-l1, rgba(127,127,127,0.14))',
    boxSizing: 'border-box',
  },
  ghostBtn: {
    height: '30px',
    padding: '0 14px',
    borderRadius: '7px',
    border: '1px solid var(--dsw-alias-border-l2, rgba(127,127,127,0.24))',
    background: 'transparent',
    color: 'var(--dsw-alias-label-primary)',
    fontSize: '12px',
    fontWeight: '500',
    cursor: 'pointer',
    transition: 'background 0.15s ease, border-color 0.15s ease',
  },
  primaryBtn: {
    height: '30px',
    padding: '0 16px',
    borderRadius: '7px',
    border: 'none',
    background: 'var(--dsw-alias-button-info-fill, var(--dsw-static-deepseek-500, #4176e6))',
    boxShadow: '0 2px 8px var(--dsw-alias-bg-mask-1, rgba(65,118,230,0.28))',
    color: '#fff',
    fontSize: '12px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'transform 0.1s ease, opacity 0.15s ease, box-shadow 0.15s ease',
  },
  treeRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '7px',
    width: '100%',
    maxWidth: '100%',
    minWidth: 0,
    boxSizing: 'border-box',
    padding: '6px 8px',
    margin: '1px 0',
    border: 'none',
    borderRadius: '7px',
    background: 'transparent',
    color: 'inherit',
    fontSize: '12px',
    textAlign: 'left',
    transition: 'background 0.12s ease',
    overflow: 'hidden',
  },
  muted: { opacity: 0.5 },
  tagsContainer: {
    marginLeft: 'auto',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    flexShrink: 0,
    paddingLeft: '10px',
  },
  projectCount: {
    fontSize: '10px',
    fontWeight: '600',
    padding: '1px 6px',
    borderRadius: '10px',
    background: 'var(--dsw-alias-bg-layer-1, rgba(127,127,127,0.12))',
    color: 'var(--dsw-alias-label-tertiary)',
    marginLeft: 'auto',
    flexShrink: 0,
    whiteSpace: 'nowrap',
  },
  updatedTag: {
    display: 'inline-flex',
    alignItems: 'center',
    fontSize: '10px',
    fontWeight: '600',
    padding: '1px 6px',
    borderRadius: '4px',
    background: 'rgba(34,197,94,0.14)',
    border: '1px solid rgba(34,197,94,0.28)',
    color: 'var(--dsw-alias-state-success-primary, #22c55e)',
    flexShrink: 0,
    whiteSpace: 'nowrap',
  },
  importedTag: {
    display: 'inline-flex',
    alignItems: 'center',
    fontSize: '10px',
    padding: '1px 6px',
    borderRadius: '4px',
    background: 'var(--dsw-alias-bg-layer-1, rgba(127,127,127,0.08))',
    color: 'var(--dsw-alias-label-tertiary)',
    flexShrink: 0,
    whiteSpace: 'nowrap',
  },
  modalCloseBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '24px',
    height: '24px',
    padding: 0,
    border: 'none',
    borderRadius: '6px',
    background: 'transparent',
    color: 'var(--dsw-alias-label-tertiary, var(--dsw-text-tertiary, #999))',
    cursor: 'pointer',
    transition: 'background 0.15s ease, color 0.15s ease',
  },
  modalSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  modalSectionTitle: {
    color: 'var(--dsw-alias-label-tertiary, var(--dsw-text-tertiary, #8e8e93))',
    fontSize: '11px',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    paddingLeft: '2px',
  },
  actionGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: '9px',
  },
  actionCard: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '10px 13px',
    borderRadius: '10px',
    border: '1px solid var(--dsw-alias-border-l1, rgba(127,127,127,0.18))',
    background: 'var(--dsw-alias-bg-layer-1, rgba(127,127,127,0.04))',
    boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
    color: 'var(--dsw-alias-label-primary, var(--dsw-text-primary, currentColor))',
    fontSize: '12.5px',
    fontWeight: '500',
    textAlign: 'left',
    cursor: 'pointer',
    position: 'relative',
  },
  actionCardHover: {
    background: 'var(--dsw-alias-interactive-bg-hover, rgba(127,127,127,0.12))',
    borderColor: 'var(--dsw-alias-border-l2, rgba(127,127,127,0.28))',
  },
  actionCardIcon: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '26px',
    height: '26px',
    borderRadius: '7px',
    background: 'var(--dsw-alias-bg-layer-2, rgba(127,127,127,0.08))',
    border: '1px solid var(--dsw-alias-border-l1, rgba(127,127,127,0.12))',
    color: 'var(--dsw-alias-label-secondary, var(--dsw-text-secondary, #888))',
    flexShrink: 0,
  },
  actionCardLabel: {
    flex: '1 1 auto',
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    letterSpacing: '-0.01em',
  },
  settingsGroup: {
    borderRadius: '10px',
    border: '1px solid var(--dsw-alias-border-l1, rgba(127,127,127,0.16))',
    background: 'var(--dsw-alias-bg-layer-1, rgba(127,127,127,0.04))',
    overflow: 'visible',
    position: 'relative',
  },
  itemListPanel: {
    borderTop: '1px solid var(--dsw-alias-border-l1, rgba(127,127,127,0.10))',
    padding: '8px 10px 10px',
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    maxHeight: '260px',
    overflowY: 'auto',
  },
  itemToolbar: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    paddingBottom: '8px',
    position: 'sticky',
    top: '-8px',
    background: 'var(--dsw-alias-bg-layer-2, var(--dsw-surface, #1e1e20))',
    zIndex: 1,
  },
  itemToolbarBtn: {
    border: '1px solid var(--dsw-alias-border-l1, rgba(127,127,127,0.20))',
    background: 'var(--dsw-alias-bg-layer-1, rgba(127,127,127,0.08))',
    color: 'var(--dsw-alias-label-secondary, currentColor)',
    fontSize: '11px',
    fontWeight: '500',
    cursor: 'pointer',
    padding: '3px 8px',
    borderRadius: '6px',
  },
  itemName: {
    fontSize: '12px',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    color: 'var(--dsw-alias-label-primary)',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  itemRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '9px',
    padding: '6px 8px',
    borderRadius: '7px',
    cursor: 'default',
  },
  itemRowDisabled: {
    opacity: 0.45,
  },
  itemBadge: {
    fontSize: '10.5px',
    fontWeight: '500',
    padding: '2px 7px',
    borderRadius: '999px',
    border: '1px solid var(--dsw-alias-border-l1, rgba(127,127,127,0.20))',
    background: 'var(--dsw-alias-bg-layer-3, rgba(127,127,127,0.10))',
    color: 'var(--dsw-alias-label-secondary)',
    whiteSpace: 'nowrap',
  },
  chevron: {
    transition: 'transform 0.15s ease',
    display: 'inline-flex',
    color: 'var(--dsw-alias-label-secondary)',
  },
  settingRow: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 14px',
    cursor: 'pointer',
    userSelect: 'none',
    transition: 'background 0.12s ease',
  },
  settingRowFull: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '12px',
    padding: '10px 14px',
    cursor: 'default',
    userSelect: 'none',
    transition: 'background 0.12s ease',
  },
  settingRowBorder: {
    borderBottom: '1px solid var(--dsw-alias-border-l1, rgba(127,127,127,0.10))',
  },
  settingRowHover: {
    background: 'var(--dsw-alias-interactive-bg-hover, rgba(127,127,127,0.08))',
  },
  settingName: {
    fontSize: '12.5px',
    fontWeight: '500',
    color: 'var(--dsw-alias-label-primary, var(--dsw-text-primary, currentColor))',
  },
  repairHint: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '8px',
    padding: '9px 12px',
    borderRadius: '10px',
    background: 'var(--dsw-alias-bg-layer-2, rgba(127,127,127,0.08))',
    border: '1px solid var(--dsw-alias-border-l1, rgba(127,127,127,0.22))',
    borderLeft: '2px solid var(--dsw-alias-state-warning-primary, #f59e0b)',
    color: 'var(--dsw-alias-label-secondary, var(--dsw-text-secondary, #b8b8bc))',
    fontSize: '11px',
    lineHeight: '1.5',
    textAlign: 'left',
  },
  repairHintTitle: {
    fontWeight: '600',
    color: 'var(--dsw-alias-label-primary, var(--dsw-text-primary, #ffffff))',
    marginBottom: '2px',
  },
  repairHintCode: {
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    fontSize: '10.5px',
    padding: '1px 5px',
    borderRadius: '4px',
    background: 'var(--dsw-alias-bg-layer-3, rgba(127,127,127,0.15))',
    border: '1px solid var(--dsw-alias-border-l1, rgba(127,127,127,0.25))',
    whiteSpace: 'nowrap',
  },
  modalTooltip: {
    position: 'absolute',
    left: '8px',
    right: '8px',
    top: 'calc(100% + 2px)',
    zIndex: 1000,
    padding: '8px 12px',
    borderRadius: '8px',
    background: 'var(--dsw-alias-bg-layer-3, var(--dsw-surface, #252526))',
    border: '1px solid var(--dsw-alias-border-l2, rgba(127,127,127,0.3))',
    boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
    color: 'var(--dsw-alias-label-primary, #ffffff)',
    fontSize: '11px',
    lineHeight: '1.45',
    whiteSpace: 'normal',
    wordBreak: 'break-word',
    pointerEvents: 'none',
  },
}

/** Settings exposed as on/off switches, in display order. */
// Feature switches shown in the main settings page. enableSkills/mcpMirror
// live inside their manager subpages (master switch at the top), not here.
const SETTING_KEYS = ['enableImport', 'autoImport', 'enableInstructions', 'enableConfig']

/** Per-action explainers shown by the ⓘ icon (bilingual). */
const ACTION_INFO = {
  importNow: {
    zh: '从 Codex 扫描并导入项目历史对话到 DSH，完整保留推理与工具调用轨迹，支持断点续聊与增量追加。',
    en: 'Scan and import project chat histories from Codex into DSH, preserving reasoning and tool calls for seamless continuation.',
  },
  exportNow: {
    zh: '将当前 DSH 会话导出为全新的 Codex 对话副本（无法直接覆盖原对话）。若该项目仅在 DSH 中存在，只需在 Codex 内手动打开/创建同路径项目，即可正常识别与导入。',
    en: 'Exports current DSH chats as new Codex conversation copies (cannot overwrite original threads). For projects that only exist in DSH, simply create or open a project with the same directory in Codex to import and view them.',
  },
  status: {
    zh: '查看 MCP 镜像状态：检查从 ~/.codex/config.toml 镜像的各 MCP 服务器连接状态与诊断原因。',
    en: 'Show MCP mirror status: inspect connection health and diagnosis for servers mirrored from ~/.codex/config.toml.',
  },
  refresh: {
    zh: '重新从宿主机读取所有同步开关与配置的最新真实值并刷新界面。',
    en: 'Re-sync all switch states and configuration values from the host.',
  },
}

/** Per-setting explainers shown by the ⓘ icon (bilingual). */
const SETTING_INFO = {
  enableImport: {
    zh: '控制是否在 DSH 中注册 /import-codex、/export-codex 等命令以及导入/导出界面。开启后可进行对话迁移与导出。',
    en: 'Enables /import-codex and /export-codex command family and GUI pickers for session migration.',
  },
  autoImport: {
    zh: '每次启动 DSH 的首个会话时，自动在后台静默扫描 ~/.codex/sessions 并增量同步最新的 Codex 对话。',
    en: 'Automatically and silently scan ~/.codex/sessions to incrementally import new chats at startup.',
  },
  enableInstructions: {
    zh: '把 ~/.codex/instructions.md 或 AGENTS.md 注入系统提示词，让 DSH 遵循 Codex 的全局规范与人设要求。',
    en: 'Injects ~/.codex/instructions.md or AGENTS.md into the system prompt to follow Codex guidelines.',
  },
  enableConfig: {
    zh: '读取 ~/.codex/config.toml 的模型参数与推理配置摘要，作为上下文参考信息注入给 DSH 模型。',
    en: 'Injects a summary of ~/.codex/config.toml model and reasoning settings into prompt context.',
  },
  enableSkills: {
    zh: '将 ~/.codex/skills/*/SKILL.md 挂载为 DSH 原生技能。改动本地技能文件后下次调用即时生效，无需重启。',
    en: 'Live-mounts ~/.codex/skills as native DSH skills with zero-restart auto-reload on file edits.',
  },
  mcpMirror: {
    zh: '自动监听 ~/.codex/config.toml 的 [mcp_servers.*] 并动态镜像到 DSH 供工具调用，支持实时热启停。',
    en: 'Auto-mirrors [mcp_servers.*] from ~/.codex/config.toml into DSH with live watching and hot reloads.',
  },
}

/** Language choice: default English; 'zh' when the user switched once. */
const LANG_KEY = 'codex-sync.lang'
function readLang() {
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem(LANG_KEY) === 'zh' ? 'zh' : 'en'
  } catch { return 'en' }
}
function writeLang(lang) {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(LANG_KEY, lang)
  } catch { /* no storage: session-local language */ }
}

/** Labels for the chosen UI language (default English). */
function labels(lang) {
  return lang === 'zh'
    ? {
        button: '同步设置',
        settingsModalTitle: 'Codex 同步设置',
        actions: '操作',
        importNow: '从 Codex 导入',
        exportNow: '导出到 Codex',
        status: '查看镜像状态',
        statusTitle: 'MCP 镜像状态',
        close: '关闭',
        switches: '功能开关',
        refresh: '刷新状态',
        language: '语言',
        langBadge: '简体中文',
        on: '开',
        off: '关',
        unknown: '？',
        noSession: '当前没有会话',
        commandMissing: '命令未找到',
        done: '完成',
        settingNames: {
          enableImport: '导入命令',
          autoImport: '自动导入',
          enableInstructions: '指令注入',
          enableConfig: '配置摘要',
          enableSkills: '技能注册',
          mcpMirror: 'MCP 镜像',
        },
        selectAllShort: '全选',
        deselectAllShort: '全不选',
        defaultSyncLabel: '新项目默认同步',
        itemsEmpty: '暂无可列项',
        itemBadgeMounted: '已挂载',
        itemBadgeFailed: '失败',
        itemBadgeUserOff: '已关闭',
        itemBadgeDenied: '系统强制排除',
        itemBadgeOverrideDefault: '跟随默认',
        expandHint: (n) => `${n} 项`,
        back: '返回',
        skillsPageTitle: '技能管理',
        mcpsPageTitle: 'MCP 管理',
        searchItems: '搜索名称…',
        openCfgTitle: '打开配置文件/目录',
        openCfgFailed: '打开失败（文件不存在或系统不支持）',
        descEnableImport: '控制是否注册 /import-codex、/export-codex 等命令与导入导出界面；关闭后对话迁移功能整体停用。',
        descAutoImport: '每次启动 DSH 首个会话时自动增量扫描并导入 Codex 新对话，无需手动操作。',
        descInstructions: '将 ~/.codex/instructions.md 或 AGENTS.md 注入 DSH 系统提示词，让两侧遵循同一套规范。',
        descConfig: '读取 ~/.codex/config.toml 的模型与推理配置摘要注入上下文。',
        descSkills: '将 ~/.codex/skills 挂载为 DSH 原生技能，支持逐项开关与实时生效。',
        descMcpMirror: '监听 ~/.codex/config.toml 的 [mcp_servers.*] 并镜像到 DSH，支持逐项开关与热启停。',
        pickerTitle: '导入 Codex 会话',
        pickerTitleExport: '导出 DSH 会话到 Codex',
        importSource: '导入来源',
        localSource: '本地',
        configuredSourcesOnly: '仅可选择已配置的 SSH 来源；连接设置由宿主管理。',
        sourcesError: '无法读取 SSH 来源；仍可使用本地导入。',
        remoteReadOnly: 'SSH 来源只读：仅导入历史，不修改远端。续聊时的工具不会自动通过 SSH 执行。',
        remoteError: 'SSH 来源请求失败，未回退到本地导入。',
        sourceMismatch: '返回的目录与所选 SSH 来源不一致。',
        originalDirectory: '原始目录',
        mappedDirectory: '映射目录',
        unknownDirectory: '未知目录',
        historyOnly: '未映射；仅导入历史',
        mappingChanged: '映射已变更',
        savedDirectory: '已保存目录',
        configuredDirectory: '当前配置目录',
        mappingChangedHint: '目录映射与已导入会话不一致，已禁止选择；需由宿主处理映射冲突后再导入。',
        projectMappingHint: '部分会话的目录映射已变更；展开可对比已保存与当前配置的目录，受影响会话不可选择。',
        preview: '预览导入',
        previewRequired: '请先成功预览当前来源、所选会话与筛选条件，再执行导入。',
        previewReady: '预览成功，可以导入当前所选会话。',
        catalogWarnings: (big, unreadable) => `跳过大文件：${big}；无法读取：${unreadable}`,
        confirmExportTitle: '确认导出',
        confirmExportBody: (count) => `即将导出 ${count} 个会话。由于插件无法覆盖或追加原 Codex 对话，导出将创建全新的 Codex 会话副本；子代理会话将作为独立会话导出，无法与父会话合并。导出的对话重启 Codex 可见。`,
        confirmExportBtn: '确认导出',
        selectAll: '全选',
        search: '搜索项目或对话标题',
        hideSub: '过滤子代理',
        fromCodex: '来自 Codex',
        cancel: '取消',
        importN: '导入',
        exportN: '导出',
        exportedOk: '已写出 Codex 会话',
        exportHint: '导出完成。对话重启 Codex 可见。',
        loading: '正在读取…',
        empty: '没有可处理的会话',
        imported: '已导入',
        updated: '有更新',
        tagDshUpdated: 'DSH 已续聊',
        tagCodexUnchanged: 'Codex · 未更新',
        tagCodexSourceMissing: 'Codex · 源缺失',
        tagNotInCodex: 'Codex 无此项目',
        tagSubagent: '子代理',
        tipDshUpdated: '导出将创建新的 Codex 副本，不会覆盖原对话',
        tipNotInCodex: '该项目尚未在 Codex 中建立。请先在 Codex 中创建/打开该项目后再导出对话。',
        tipSubagent: '作为子代理展示仅用于归类组织；勾选后将作为独立 Codex 会话导出，不会与父会话合并',
        error: '无法读取目录。请完全退出并重新启动 dsh web（只刷新页面不够，后台插件不会更新）。',
        importedOk: '导入完成',
        reloadHint: '正在刷新页面，新对话会出现在会话列表里（不用重启 dsh）。点「稍后」可取消自动刷新。',
        reloadNow: '立即刷新',
        reloadLater: '稍后',
        repairHintTitle: '导入对话报错？',
        repairHintBody: '若导入的对话在切换模型或压缩时报「token meter / no matching step/start event」等错误，可在任意新对话中执行 /repair-sessions --fix 一键修复（自动备份 .bak）。',
      }
    : {
        button: 'Sync',
        settingsModalTitle: 'Codex Sync Settings',
        actions: 'Actions',
        importNow: 'Import from Codex',
        exportNow: 'Export to Codex',
        status: 'Mirror status',
        statusTitle: 'MCP Mirror Status',
        close: 'Close',
        switches: 'Features',
        refresh: 'Refresh states',
        language: 'Language',
        langBadge: 'English',
        on: 'on',
        off: 'off',
        unknown: '?',
        noSession: 'no active session',
        commandMissing: 'command not found',
        done: 'Done',
        settingNames: {
          enableImport: 'Import commands',
          autoImport: 'Auto import',
          enableInstructions: 'Instructions',
          enableConfig: 'Config summary',
          enableSkills: 'Skills',
          mcpMirror: 'MCP mirror',
        },
        selectAllShort: 'All on',
        deselectAllShort: 'All off',
        defaultSyncLabel: 'Sync new items by default',
        itemsEmpty: 'No items found',
        itemBadgeMounted: 'mounted',
        itemBadgeFailed: 'failed',
        itemBadgeUserOff: 'off',
        itemBadgeDenied: 'system denied',
        itemBadgeOverrideDefault: 'default',
        expandHint: (n) => `${n}`,
        back: 'Back',
        skillsPageTitle: 'Skill Manager',
        mcpsPageTitle: 'MCP Manager',
        searchItems: 'Search by name…',
        openCfgTitle: 'Open config file / folder',
        openCfgFailed: 'Failed to open (missing or unsupported)',
        descEnableImport: 'Registers /import-codex, /export-codex commands and the migration UI; disabling stops all chat migration.',
        descAutoImport: 'Incrementally scans and imports new Codex chats at every DSH startup session.',
        descInstructions: 'Injects ~/.codex/instructions.md or AGENTS.md into the system prompt so both sides follow the same rules.',
        descConfig: 'Injects a summary of model & reasoning settings from ~/.codex/config.toml.',
        descSkills: 'Mounts ~/.codex/skills as native DSH skills with per-item switches and live reload.',
        descMcpMirror: 'Mirrors [mcp_servers.*] from ~/.codex/config.toml with per-item switches and hot start/stop.',
        pickerTitle: 'Import Codex sessions',
        pickerTitleExport: 'Export DSH sessions to Codex',
        importSource: 'Import source',
        localSource: 'Local',
        configuredSourcesOnly: 'Only configured SSH sources are available; connection settings are managed by the host.',
        sourcesError: 'Could not load SSH sources; local import is still available.',
        remoteReadOnly: 'SSH sources are read-only: only history is imported; the remote is not modified. Continued tools do NOT automatically run through SSH.',
        remoteError: 'SSH source request failed; no local import fallback was used.',
        sourceMismatch: 'The catalog does not match the selected SSH source.',
        originalDirectory: 'Original directory',
        mappedDirectory: 'Mapped directory',
        unknownDirectory: 'Unknown directory',
        historyOnly: 'not mapped; history only',
        mappingChanged: 'Mapping changed',
        savedDirectory: 'Saved directory',
        configuredDirectory: 'Configured directory',
        mappingChangedHint: 'The mapping differs from the imported session. Selection is blocked until the host resolves the mapping conflict.',
        projectMappingHint: 'Some session mappings changed. Expand to compare saved and configured directories; affected sessions cannot be selected.',
        preview: 'Preview import',
        previewRequired: 'Successfully preview the current source, selected sessions and filters before importing.',
        previewReady: 'Preview succeeded; the current selection is ready to import.',
        catalogWarnings: (big, unreadable) => `Skipped large files: ${big}; unreadable: ${unreadable}`,
        confirmExportTitle: 'Confirm export',
        confirmExportBody: (count) => `About to export ${count} session(s). Because the plugin cannot overwrite or append to original Codex threads, exporting will create new, independent Codex conversation copies; subagents will export separately and cannot merge into parent sessions. Exported conversations will be visible after restarting Codex.`,
        confirmExportBtn: 'Confirm export',
        selectAll: 'Select all',
        search: 'Search projects or titles',
        hideSub: 'Hide sub-agents',
        fromCodex: 'From Codex',
        cancel: 'Cancel',
        importN: 'Import',
        exportN: 'Export',
        exportedOk: 'Wrote Codex sessions',
        exportHint: 'Export complete. Conversations will be visible after restarting Codex.',
        loading: 'Reading sessions…',
        empty: 'Nothing to display',
        imported: 'imported',
        updated: 'updated',
        tagDshUpdated: 'Updated in DSH',
        tagCodexUnchanged: 'Codex · unchanged',
        tagCodexSourceMissing: 'Codex · source missing',
        tagNotInCodex: 'Not in Codex',
        tagSubagent: 'Sub-agent',
        tipDshUpdated: 'Export creates a new Codex copy and does not overwrite original',
        tipNotInCodex: 'This workspace is not recognized in Codex. Open or create this project in Codex first before exporting chats.',
        tipSubagent: 'Shown nested for organization; selected child exports separately, not merged.',
        error: 'Could not load catalog. Fully quit and restart dsh web (a page refresh does not reload the host plugin).',
        importedOk: 'Import finished',
        reloadHint: 'Reloading so new chats show up in the session list (no dsh restart). Tap Later to cancel.',
        reloadNow: 'Reload now',
        reloadLater: 'Later',
        repairHintTitle: 'Imported chats erroring?',
        repairHintBody: 'If an imported conversation fails with "token meter / no matching step/start event" on model switch or compaction, run /repair-sessions --fix in any new chat to repair in place (a .bak backup is kept automatically).',
      }
}

/** Success marker: set ONLY after settings actually populated badges. */
const SEEDED_KEY = 'codex-sync.seeded.v2'
function readSeeded() {
  try {
    if (typeof localStorage === 'undefined') return false
    if (localStorage.getItem('codex-sync.seeded') !== null) localStorage.removeItem('codex-sync.seeded')
    return localStorage.getItem(SEEDED_KEY) === '1'
  } catch { return false }
}
function writeSeeded() {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(SEEDED_KEY, '1')
  } catch { /* no storage: retry next open */ }
}

const PREFIX = 'codex-sync.setting.'
function readBadge(key) {
  try {
    if (typeof localStorage === 'undefined') return undefined
    const v = localStorage.getItem(PREFIX + key)
    return v === 'on' ? true : v === 'off' ? false : undefined
  } catch { return undefined }
}
function writeBadge(key, on) {
  try {
    if (typeof localStorage === 'undefined') return
    localStorage.setItem(PREFIX + key, on ? 'on' : 'off')
  } catch { /* storage unavailable: badge stays session-local */ }
}

/** Parse `key=on` / `key=off` machine tokens from a command result. */
function parseStateLines(text) {
  const out = {}
  const re = /\b([A-Za-z]+)=(on|off)\b/g
  let m
  while ((m = re.exec(text ?? '')) !== null) {
    out[m[1]] = m[2] === 'on'
  }
  return out
}

function triState(selected, total) {
  if (total <= 0) return 'empty'
  if (selected <= 0) return 'empty'
  if (selected >= total) return 'checked'
  return 'partial'
}

function walkSessions(nodes, fn) {
  for (const n of nodes || []) {
    fn(n)
    walkSessions(n.children, fn)
  }
}

function isNodeSelectable(n, isExport) {
  if (isExport) {
    if (n.isCodexWorkspace === false) return false
    if (n.alreadyCodex || n.fromCodex) {
      return n.dshUpdated === true
    }
    return true
  }
  return !n.mappingChanged && !n.alreadyCodex && (!n.imported || n.stale)
}

function collectSelectable(projects, isExport = false) {
  const ids = []
  for (const p of projects || []) {
    walkSessions(p.sessions, (n) => {
      if (isNodeSelectable(n, isExport)) ids.push(n.id)
    })
  }
  return ids
}

function filterCatalog(projects, query) {
  const q = String(query || '').trim().toLowerCase()
  if (!q) return projects
  const matchNode = (n) => {
    const self = String(n.title || '').toLowerCase().includes(q)
    const kids = (n.children || []).map(matchNode).filter(Boolean)
    if (!self && kids.length === 0) return null
    return Object.assign({}, n, { children: self ? (n.children || []) : kids })
  }
  const out = []
  for (const p of projects || []) {
    if (String(p.label || '').toLowerCase().includes(q)) {
      out.push(p)
      continue
    }
    const sessions = (p.sessions || []).map(matchNode).filter(Boolean)
    if (sessions.length) out.push(Object.assign({}, p, { sessions }))
  }
  return out
}

function TriBox({ state, disabled }) {
  const isChecked = state === 'checked'
  const isPartial = state === 'partial'
  const filled = isChecked || isPartial
  const bg = !filled ? 'transparent' : (disabled
    ? 'var(--dsw-alias-border-l2, rgba(127,127,127,0.24))'
    : 'var(--dsw-alias-state-success-primary, #22c55e)')
  const border = filled && !disabled
    ? '1px solid var(--dsw-alias-state-success-primary, #22c55e)'
    : '1px solid var(--dsw-alias-border-l3, rgba(127,127,127,0.36))'
  const iconColor = disabled ? 'var(--dsw-alias-label-tertiary, #888)' : '#ffffff'

  return h('span', {
    style: {
      width: '15px',
      height: '15px',
      flexShrink: 0,
      borderRadius: '4px',
      border,
      background: bg,
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      transition: 'background-color 0.12s ease, border-color 0.12s ease, box-shadow 0.12s ease, color 0.12s ease',
      boxShadow: filled && !disabled ? '0 1px 3px var(--dsw-alias-bg-mask-1, rgba(34,197,94,0.25))' : 'none',
    },
  },
    isChecked ? h('svg', {
      width: 10,
      height: 10,
      viewBox: '0 0 16 16',
      fill: 'none',
      stroke: iconColor,
      strokeWidth: '2.4',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    }, h('polyline', { points: '3.5 8.5 6.5 11.5 12.5 4.5' }))
    : isPartial ? h('svg', {
      width: 10,
      height: 10,
      viewBox: '0 0 16 16',
      fill: 'none',
      stroke: iconColor,
      strokeWidth: '2.6',
      strokeLinecap: 'round',
    }, h('line', { x1: '3.5', y1: '8', x2: '12.5', y2: '8' }))
    : null
  )
}

function configuredImportSources(data) {
  const seen = new Set()
  return (Array.isArray(data?.sources) ? data.sources : []).filter((source) => {
    if (source?.kind !== 'ssh' || typeof source.id !== 'string' || !source.id || seen.has(source.id)) return false
    seen.add(source.id)
    return true
  }).map((source) => ({ id: source.id, label: typeof source.label === 'string' && source.label ? source.label : source.id, kind: 'ssh' }))
}

function importCatalogUrl(isExport, includeSubagents, includeCodex, sourceId) {
  if (isExport) return `/dsh-codex-sync/export-catalog?includeCodex=${includeCodex ? '1' : '0'}&includeSubagents=${includeSubagents ? '1' : '0'}`
  return `/dsh-codex-sync/catalog?includeSubagents=${includeSubagents ? '1' : '0'}` + (sourceId ? `&source=${encodeURIComponent(sourceId)}` : '')
}

// Bind approval to the exact source, selection and both filters, not the row count.
function importPreviewKey(sourceId, ids, includeSubagents, query) {
  return JSON.stringify([sourceId, [...new Set(ids)].sort(), includeSubagents, query])
}

function ImportSourceSelect({ lang, sources, sourceId, disabled, onChange }) {
  const t = labels(lang)
  return h('label', { style: { display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px' } },
    h('span', { style: { flexShrink: 0 } }, t.importSource),
    h('select', {
      'aria-label': t.importSource,
      value: sourceId,
      disabled,
      onChange: (e) => onChange(e.target.value),
      style: Object.assign({}, styles.search, { padding: '0 8px', minWidth: 0 }),
    },
      h('option', { value: '' }, t.localSource),
      sources.map((source) => h('option', { key: source.id, value: source.id }, source.label + ' (SSH)')),
    ),
  )
}

function ImportDirectoryMapping({ lang, original, mapped, configured, mappingChanged, style }) {
  const t = labels(lang)
  return h('div', {
    style: Object.assign({ fontSize: '10.5px', lineHeight: '1.5', color: 'var(--dsw-alias-label-secondary)', overflowWrap: 'anywhere' }, style),
  },
    h('div', null, t.originalDirectory + ': ', original || t.unknownDirectory),
    mappingChanged
      ? [
        h('div', { key: 'saved' }, t.savedDirectory + ': ', mapped || t.historyOnly),
        h('div', { key: 'configured' }, t.configuredDirectory + ': ', configured || t.historyOnly),
        h('div', { key: 'warning', style: { color: 'var(--dsw-alias-state-warning-primary, #b67d17)' } }, t.mappingChangedHint),
      ]
      : h('div', null, mapped ? t.mappedDirectory + ': ' + mapped : t.historyOnly),
  )
}

// Client fragment injected into the hand-authored bundle; no standalone page.
function sshLabels(lang) {
  const zh = lang === 'zh'
  return zh ? {
    title: 'SSH 来源管理', add: '添加 SSH 来源', edit: '编辑', remove: '删除', cancel: '取消', close: '返回', save: '保存来源', test: '测试连接', reload: '重新加载',
    empty: '还没有 SSH 来源。添加一台机器，再到导入窗口手动拉取会话。',
    note: '配置只保存在本机 Harness profile。保存不会连接或导入；认证复用本机 SSH，不收集密码或密钥。',
    testNote: '测试只检查 SSH、远端 Python 和会话目录，不读取对话。请先用系统 SSH 核实主机指纹。',
    id: '来源 ID', label: '显示名称', host: 'SSH 别名或 user@host', platform: '远端系统', home: '远端 Codex 目录', port: '端口（可选）',
    mappings: '目录映射（可选）', from: '远端目录', to: '本地目录', addMapping: '添加映射', removeMapping: '移除映射',
    advanced: '高级限制', seconds: '超时（秒）', files: '最多 rollout 文件', total: '总量上限（MiB）', session: '单 rollout 上限（MiB）',
    stable: 'ID 决定导入身份，创建后不能改名。未映射时只导入历史，不启用 SSH 工具执行。',
    saved: '已保存。没有连接远端或导入会话。', tested: '连接成功：SSH、Python 和安全会话目录均可用。未读取对话。',
    deleted: '来源配置已删除；已导入历史和远端文件保持不变。', confirm: '确认删除此来源？不会删除 DSH 历史或远端文件。',
    conflict: '配置已被其他窗口修改。请重新加载；你的表单不会自动覆盖新配置。', failed: '请求失败。保存可能已完成，请重新加载确认；不要直接重试。',
    invalid: '请填写合法 ID、SSH 别名和目录；端口及限制必须为正整数。', loading: '处理中…',
  } : {
    title: 'SSH sources', add: 'Add SSH source', edit: 'Edit', remove: 'Delete', cancel: 'Cancel', close: 'Back', save: 'Save source', test: 'Test connection', reload: 'Reload',
    empty: 'No SSH sources yet. Add a machine, then pull conversations manually from the import picker.',
    note: 'Stored only in this host’s Harness profile. Saving does not connect or import. Authentication uses local SSH; no passwords or keys are collected.',
    testNote: 'Test checks SSH, remote Python and the sessions root only; it does not read conversations. Verify the host fingerprint with system SSH first.',
    id: 'Source ID', label: 'Display name', host: 'SSH alias or user@host', platform: 'Remote platform', home: 'Remote Codex home', port: 'Port (optional)',
    mappings: 'Directory mappings (optional)', from: 'Remote directory', to: 'Local directory', addMapping: 'Add mapping', removeMapping: 'Remove mapping',
    advanced: 'Advanced limits', seconds: 'Timeout (seconds)', files: 'Maximum rollout files', total: 'Total limit (MiB)', session: 'Per-rollout limit (MiB)',
    stable: 'The ID owns imported history and cannot be renamed. Unmapped sessions are history-only; SSH tool execution is not enabled.',
    saved: 'Saved. No SSH connection or session import was performed.', tested: 'Connected: SSH, Python and the safe sessions root are available. No conversations were read.',
    deleted: 'Source configuration deleted. Imported history and remote files are unchanged.', confirm: 'Delete this source? DSH history and remote files will not be deleted.',
    conflict: 'Sources changed in another window. Reload first; your form will not overwrite newer settings automatically.', failed: 'Request failed. A save may have committed: reload to verify before trying again.',
    invalid: 'Enter a valid ID, SSH alias and directory. Port and limits must be positive integers.', loading: 'Working…',
  }
}
function sshDraft(source) {
  return source ? { ...source, port: source.port ?? '', cwdMappings: source.cwdMappings.map(m => ({ ...m })), timeoutSeconds: source.timeoutMs / 1000, totalMiB: source.maxTotalBytes / 1048576, sessionMiB: source.maxSessionBytes / 1048576 }
    : { id: '', label: '', host: '', platform: 'posix', codexHome: '~/.codex', port: '', cwdMappings: [], timeoutSeconds: 60, maxFiles: 1000, totalMiB: 256, sessionMiB: 64 }
}
function sshPayload(draft) {
  const source = { label: draft.label || draft.id, host: draft.host.trim(), platform: draft.platform, codexHome: draft.codexHome.trim(), cwdMappings: draft.cwdMappings.map(m => ({ from: m.from.trim(), to: m.to.trim() })), timeoutMs: Number(draft.timeoutSeconds) * 1000, maxFiles: Number(draft.maxFiles), maxTotalBytes: Number(draft.totalMiB) * 1048576, maxSessionBytes: Number(draft.sessionMiB) * 1048576 }
  if (draft.port !== '') source.port = Number(draft.port)
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(draft.id) || !source.host || !source.codexHome || ['timeoutMs', 'maxFiles', 'maxTotalBytes', 'maxSessionBytes', ...(source.port === undefined ? [] : ['port'])].some(k => !Number.isSafeInteger(source[k]) || source[k] < 1)) throw new Error('invalid')
  return source
}
function SshSourceManager({ lang, onClose, onChanged }) {
  const t = sshLabels(lang)
  const [data, setData] = useState(null)
  const [draft, setDraft] = useState(null)
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [deleting, setDeleting] = useState(null)
  const [conflict, setConflict] = useState(false)
  const request = useRef(null)
  const active = useRef(true)
  const panel = useRef(null)
  const changed = useRef(false)
  const cancel = () => { request.current?.abort(); request.current = null }
  async function call(payload) {
    cancel()
    if (payload?.action === 'save' || payload?.action === 'delete') changed.current = true
    const controller = new AbortController(); request.current = controller
    setBusy(true); setError(''); setMessage('')
    try {
      const res = await fetch('/dsh-codex-sync/source-config', { credentials: 'same-origin', signal: controller.signal, ...(payload ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) } : {}) })
      const value = await res.json()
      if (!active.current || request.current !== controller) return
      if (!res.ok) {
        if (res.status === 409 || value.code === 'SOURCE_CONFLICT') { setConflict(true); throw new Error(t.conflict) }
        throw new Error(value.error || t.failed)
      }
      if (!payload || payload.action !== 'test') { setData(value); setConflict(false) }
      if (payload?.action === 'save' || payload?.action === 'delete') {
        changed.current = true; setDraft(null); setDeleting(null); setMessage(payload.action === 'save' ? t.saved : t.deleted)
      } else if (payload?.action === 'test') setMessage(t.tested)
      return value
    } catch (e) {
      if (active.current && request.current === controller && !controller.signal.aborted) setError(e.message || t.failed)
    } finally { if (active.current && request.current === controller) setBusy(false) }
  }
  const close = () => { active.current = false; cancel(); if (changed.current) onChanged?.(); onClose() }
  useEffect(() => {
    active.current = true
    const previous = typeof document !== 'undefined' ? document.activeElement : null
    panel.current?.focus()
    void call()
    return () => { active.current = false; cancel(); previous?.focus?.() }
  }, [])
  const update = (key, value) => { setDraft(d => ({ ...d, [key]: value })); setMessage(''); setError('') }
  const submit = action => {
    try { const source = sshPayload(draft); void call({ action, id: draft.id, source, ...(action === 'save' ? { revision: data.revision } : {}) }) }
    catch { setError(t.invalid) }
  }
  const keydown = e => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close() }
    if (e.key === 'Tab' && panel.current) {
      const nodes = [...panel.current.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), summary, [tabindex="0"]')]
      if (!nodes.length) return
      if (e.shiftKey && (document.activeElement === nodes[0] || document.activeElement === panel.current)) { e.preventDefault(); nodes.at(-1).focus() }
      else if (!e.shiftKey && document.activeElement === nodes.at(-1)) { e.preventDefault(); nodes[0].focus() }
    }
  }
  const writable = data?.writable === true
  const fieldStyle = { width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: '7px', border: '1px solid var(--dsw-alias-border-l2)', background: 'var(--dsw-alias-bg-base)', color: 'var(--dsw-alias-label-primary)', font: 'inherit' }
  const field = (key, text, options = {}) => h('label', { key, style: { display: 'flex', flexDirection: 'column', gap: '5px', minWidth: 0 } }, h('span', null, text), h('input', { ...options, value: draft[key], 'aria-label': text, 'data-codex-source-field': key, disabled: busy || (key === 'id' && editing), onChange: e => update(key, e.target.value), style: fieldStyle }))
  return h('div', { style: styles.overlay, onMouseDown: e => { if (e.target === e.currentTarget) close() } },
    h('div', { ref: panel, role: 'dialog', 'aria-modal': true, 'aria-label': t.title, tabIndex: -1, 'data-codex-source-manager': '', onKeyDown: keydown, style: Object.assign({}, styles.dialog, { width: 'min(720px, 94vw)', maxHeight: '88vh', overflow: 'auto', outline: 'none' }) },
      h('div', { style: styles.dialogHead }, h('strong', null, t.title), h('span', { style: styles.spacer }), h('button', { type: 'button', style: styles.ghostBtn, onClick: close }, t.close)),
      h('div', { style: { padding: '16px', display: 'flex', flexDirection: 'column', gap: '14px', fontSize: '12px', color: 'var(--dsw-alias-label-primary)' } },
        h('p', { style: { margin: 0, lineHeight: 1.6, color: 'var(--dsw-alias-label-secondary)' } }, t.note),
        error ? h('div', { role: 'alert', style: { color: 'var(--dsw-alias-state-error-primary)', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' } }, error) : null,
        message ? h('div', { role: 'status', style: { color: 'var(--dsw-alias-state-success-primary)' } }, message) : null,
        data && !writable ? h('p', { role: 'status' }, data.reason) : null,
        h('div', { style: { display: 'flex', gap: '8px' } }, h('button', { type: 'button', style: styles.primaryBtn, disabled: busy || !writable, 'data-codex-source-add': '', onClick: () => { setDraft(sshDraft()); setEditing(false); setDeleting(null); setError(''); setMessage('') } }, t.add), h('button', { type: 'button', style: styles.ghostBtn, disabled: busy, onClick: () => { void call() } }, t.reload), busy ? h('span', { role: 'status' }, t.loading) : null),
        !data ? null : !data.sources.length ? h('p', null, t.empty) : data.sources.map(source => h('div', { key: source.id, style: { border: '1px solid var(--dsw-alias-border-l1)', borderRadius: '8px', padding: '10px', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' } },
          h('div', { style: { flex: '1 1 220px', minWidth: 0, overflowWrap: 'anywhere' } }, h('strong', null, source.label), h('div', { style: { marginTop: '4px', color: 'var(--dsw-alias-label-secondary)' } }, source.id + ' · ' + source.host + ' · ' + source.platform), h('div', null, source.codexHome)),
          h('button', { type: 'button', style: styles.ghostBtn, disabled: busy, 'data-codex-source-edit': source.id, onClick: () => { setDraft(sshDraft(source)); setEditing(true); setDeleting(null); setError(''); setMessage('') } }, t.edit),
          h('button', { type: 'button', style: styles.ghostBtn, disabled: busy || !writable || conflict, 'data-codex-source-delete': source.id, onClick: () => { setDeleting(source.id); setDraft(null) } }, t.remove))),
        deleting ? h('div', { role: 'alert', style: { padding: '12px', border: '1px solid var(--dsw-alias-border-l2)', borderRadius: '8px' } }, h('p', null, t.confirm), h('button', { type: 'button', style: styles.ghostBtn, disabled: busy, onClick: () => setDeleting(null) }, t.cancel), h('button', { type: 'button', style: styles.primaryBtn, disabled: busy || conflict, 'data-codex-source-confirm-delete': '', onClick: () => { void call({ action: 'delete', id: deleting, revision: data.revision }) } }, t.remove)) : null,
        draft ? h('form', { onSubmit: e => { e.preventDefault(); if (!busy && writable && !conflict) submit('save') }, 'data-codex-source-form': '', style: { display: 'flex', flexDirection: 'column', gap: '14px', borderTop: '1px solid var(--dsw-alias-border-l1)', paddingTop: '14px' } },
          h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: '12px' } }, field('id', t.id), field('label', t.label), field('host', t.host), h('label', { style: { display: 'flex', flexDirection: 'column', gap: '5px' } }, t.platform, h('select', { 'aria-label': t.platform, value: draft.platform, disabled: busy, onChange: e => update('platform', e.target.value), style: fieldStyle }, h('option', { value: 'posix' }, 'POSIX (Linux / macOS)'), h('option', { value: 'windows' }, 'Windows OpenSSH'))), field('codexHome', t.home), field('port', t.port, { type: 'number', min: 1, max: 65535 })),
          h('p', { style: { margin: 0, color: 'var(--dsw-alias-label-secondary)', lineHeight: 1.6 } }, t.stable),
          h('fieldset', { style: { border: '1px solid var(--dsw-alias-border-l1)', borderRadius: '8px', display: 'flex', flexDirection: 'column', gap: '8px' } }, h('legend', null, t.mappings), draft.cwdMappings.map((m, i) => h('div', { key: i, style: { display: 'flex', gap: '6px', flexWrap: 'wrap' } }, ...['from', 'to'].map(key => h('input', { key, value: m[key], 'aria-label': t[key] + ' ' + (i + 1), placeholder: t[key], disabled: busy, style: Object.assign({}, fieldStyle, { flex: '1 1 190px', width: 'auto' }), onChange: e => update('cwdMappings', draft.cwdMappings.map((row, index) => index === i ? { ...row, [key]: e.target.value } : row)) })), h('button', { type: 'button', style: styles.ghostBtn, disabled: busy, 'aria-label': t.removeMapping + ' ' + (i + 1), onClick: () => update('cwdMappings', draft.cwdMappings.filter((_, index) => i !== index)) }, '×'))), h('button', { type: 'button', style: styles.ghostBtn, disabled: busy, onClick: () => update('cwdMappings', [...draft.cwdMappings, { from: '', to: '' }]) }, t.addMapping)),
          h('details', null, h('summary', { style: { cursor: 'pointer', marginBottom: '10px' } }, t.advanced), h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: '10px' } }, field('timeoutSeconds', t.seconds, { type: 'number', min: 1, max: 300 }), field('maxFiles', t.files, { type: 'number', min: 1 }), field('totalMiB', t.total, { type: 'number', min: 1 }), field('sessionMiB', t.session, { type: 'number', min: 1 }))),
          h('p', { style: { margin: 0, color: 'var(--dsw-alias-label-secondary)', lineHeight: 1.6 } }, t.testNote),
          h('div', { style: { display: 'flex', justifyContent: 'flex-end', gap: '8px', flexWrap: 'wrap' } }, h('button', { type: 'button', style: styles.ghostBtn, disabled: busy, onClick: () => { setDraft(null); setError('') } }, t.cancel), h('button', { type: 'button', style: styles.ghostBtn, disabled: busy, 'data-codex-source-test': '', onClick: () => submit('test') }, t.test), h('button', { type: 'submit', style: styles.primaryBtn, disabled: busy || !writable || conflict, 'data-codex-source-save': '' }, t.save))) : null)))
}

function ImportPicker({ lang, runCommand, onClose, mode = 'import' }) {
  const t = labels(lang)
  const isExport = mode === 'export'
  const [hideSub, setHideSub] = useState(true)
  const [showCodex, setShowCodex] = useState(false)
  const [query, setQuery] = useState('')
  const [catalog, setCatalog] = useState(null)
  const [error, setError] = useState(null)
  const [selected, setSelected] = useState({})
  const [expanded, setExpanded] = useState({})
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [sources, setSources] = useState([])
  const [sourcesLoading, setSourcesLoading] = useState(!isExport)
  const [sourcesError, setSourcesError] = useState(false)
  const [sourceId, setSourceId] = useState('')
  const [preview, setPreview] = useState(null)
  const [confirmingExport, setConfirmingExport] = useState(false)
  const [done, setDone] = useState(false)
  const reloadTimer = useRef(null)
  const active = useRef(true)
  const catalogRequest = useRef(null)
  const sourcesRequest = useRef(null)
  const actionRequest = useRef(null)
  const [showSourceManager, setShowSourceManager] = useState(false)
  const [sourceGeneration, setSourceGeneration] = useState(0)
  const isRemote = !isExport && sourceId !== ''

  const cancelRequest = (ref) => {
    const request = ref.current
    ref.current = null
    request?.controller?.abort()
  }
  const makeRequest = (ref) => {
    cancelRequest(ref)
    const request = { controller: typeof AbortController === 'function' ? new AbortController() : null }
    ref.current = request
    return request
  }
  const isCurrent = (ref, request) => active.current && ref.current === request
  const closePicker = () => {
    active.current = false
    cancelRequest(catalogRequest)
    cancelRequest(sourcesRequest)
    cancelRequest(actionRequest)
    if (reloadTimer.current) clearTimeout(reloadTimer.current)
    onClose()
  }

  useEffect(() => {
    active.current = true
    return () => {
      active.current = false
      cancelRequest(catalogRequest)
      cancelRequest(sourcesRequest)
      cancelRequest(actionRequest)
      if (reloadTimer.current) clearTimeout(reloadTimer.current)
    }
  }, [])

  // Independent of the catalog request: a missing sources route must not break local/export.
  useEffect(() => {
    if (isExport) return
    const request = makeRequest(sourcesRequest)
    setSourcesLoading(true)
    setSourcesError(false)
    void (async () => {
      try {
        const res = await fetch('/dsh-codex-sync/sources', { credentials: 'same-origin', signal: request.controller?.signal })
        const data = await res.json().catch(() => null)
        if (!res.ok || !Array.isArray(data?.sources)) throw new Error('sources unavailable')
        if (isCurrent(sourcesRequest, request)) setSources(configuredImportSources(data))
      } catch {
        if (isCurrent(sourcesRequest, request)) setSourcesError(true)
      } finally {
        if (isCurrent(sourcesRequest, request)) setSourcesLoading(false)
      }
    })()
    return () => cancelRequest(sourcesRequest)
  }, [isExport, sourceGeneration])

  useEffect(() => {
    const request = makeRequest(catalogRequest)
    setLoading(true)
    setCatalog(null)
    setError(null)
    setPreview(null)
    void (async () => {
      try {
        const url = importCatalogUrl(isExport, !hideSub, showCodex, sourceId)
        const res = await fetch(url, { credentials: 'same-origin', signal: request.controller?.signal })
        const data = await res.json().catch(() => null)
        if (!res.ok || !Array.isArray(data?.projects)) throw new Error(data?.error || String(res.status))
        if (isRemote && (data.source?.id !== sourceId || data.source?.kind !== 'ssh')) throw new Error(t.sourceMismatch)
        if (!isCurrent(catalogRequest, request)) return
        setCatalog(data)
        const validSelectable = new Set(collectSelectable(data.projects, isExport))
        setSelected((prev) => {
          const next = {}
          for (const id of Object.keys(prev)) {
            if (prev[id] && validSelectable.has(id)) next[id] = true
          }
          return next
        })
      } catch (e) {
        if (isCurrent(catalogRequest, request)) setError(isRemote ? `${t.remoteError} ${e?.message || ''}` : t.error)
      } finally {
        if (isCurrent(catalogRequest, request)) setLoading(false)
      }
    })()
    return () => cancelRequest(catalogRequest)
  }, [hideSub, showCodex, isExport, sourceId, sourceGeneration])

  const resetCatalog = () => {
    cancelRequest(catalogRequest)
    cancelRequest(actionRequest)
    setCatalog(null)
    setLoading(true)
    setBusy(false)
    setError(null)
    setPreview(null)
  }
  const changeSource = (id) => {
    if (busy || id === sourceId || (id && !sources.some((source) => source.id === id))) return
    resetCatalog()
    setSelected({})
    setExpanded({})
    setQuery('')
    setSourceId(id)
  }
  const changeQuery = (value) => {
    if (busy) return
    setPreview(null)
    setQuery(value)
  }

  const projects = filterCatalog(catalog?.projects, query)
  const selectable = collectSelectable(projects, isExport)
  const selectedIds = selectable.filter((id) => selected[id])
  const selectedCount = selectedIds.length
  const allState = triState(selectedCount, selectable.length)
  const previewKey = importPreviewKey(sourceId, selectedIds, !hideSub, query)
  const previewValid = isRemote && preview?.key === previewKey
  const actionsDisabled = busy || loading || catalog === null

  const toggleTree = (nodes, on) => {
    if (actionsDisabled) return
    setPreview(null)
    setSelected((prev) => {
      const next = Object.assign({}, prev)
      walkSessions(nodes, (n) => {
        if (isNodeSelectable(n, isExport)) next[n.id] = on
      })
      return next
    })
  }
  const toggleId = (id, on) => {
    if (actionsDisabled) return
    setPreview(null)
    setSelected((prev) => Object.assign({}, prev, { [id]: on }))
  }

  const executeExport = async () => {
    const ids = selectedIds
    if (ids.length === 0 || actionsDisabled || actionRequest.current) return
    const request = makeRequest(actionRequest)
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/dsh-codex-sync/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, dryRun: false }),
        credentials: 'same-origin',
        signal: request.controller?.signal,
      })
      const data = await res.json().catch(() => null)
      if (!res.ok || !data?.ok) throw new Error(data?.error || String(res.status))
      if (!isCurrent(actionRequest, request)) return
      setConfirmingExport(false)
      setDone(true)
    } catch (e) {
      if (!isCurrent(actionRequest, request)) return
      try {
        if (typeof runCommand !== 'function') throw e
        const result = await runCommand('/export-codex --ids ' + ids.join(','))
        if (!isCurrent(actionRequest, request)) return
        if (result && result.ok === false) throw new Error(result.text || t.error)
        setDone(true)
      } catch (fallbackError) {
        if (isCurrent(actionRequest, request)) setError(fallbackError?.message || t.error)
      }
      if (isCurrent(actionRequest, request)) setConfirmingExport(false)
    } finally {
      if (isCurrent(actionRequest, request)) {
        actionRequest.current = null
        setBusy(false)
      }
    }
  }

  const executeImport = async (ids, dryRun = false) => {
    if (ids.length === 0 || actionsDisabled || actionRequest.current) return
    if (isRemote && !dryRun && !previewValid) return
    const request = makeRequest(actionRequest)
    setBusy(true)
    setError(null)
    setPreview(null)
    const finishImport = () => {
      setDone(true)
      reloadTimer.current = setTimeout(() => { if (active.current) window.location.reload() }, 2500)
    }
    try {
      const res = await fetch('/dsh-codex-sync/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(Object.assign({ ids, includeSubagents: !hideSub, dryRun }, isRemote ? { source: sourceId } : {})),
        credentials: 'same-origin',
        signal: request.controller?.signal,
      })
      const data = await res.json().catch(() => null)
      if (!res.ok || !data?.ok) throw new Error(data?.error || String(res.status))
      if (!isCurrent(actionRequest, request)) return
      if (dryRun) setPreview({ key: previewKey, text: typeof data.text === 'string' ? data.text : '' })
      else finishImport()
    } catch (e) {
      if (!isCurrent(actionRequest, request)) return
      // A failed SSH request must never execute the local /import-codex command.
      if (isRemote || dryRun) {
        setError(`${t.remoteError} ${e?.message || ''}`)
      } else {
        try {
          if (typeof runCommand !== 'function') throw e
          const result = await runCommand('/import-codex --ids ' + ids.join(',') + (hideSub ? '' : ' --include-subagents'))
          if (!isCurrent(actionRequest, request)) return
          if (result && result.ok === false) throw new Error(result.text || t.error)
          finishImport()
        } catch (fallbackError) {
          if (isCurrent(actionRequest, request)) setError(fallbackError?.message || t.error)
        }
      }
    } finally {
      if (isCurrent(actionRequest, request)) {
        actionRequest.current = null
        setBusy(false)
      }
    }
  }

  const onConfirmClick = () => {
    if (selectedCount === 0 || actionsDisabled) return
    if (isExport) {
      setConfirmingExport(true)
      return
    }
    if (!isRemote || previewValid) void executeImport(selectedIds)
  }

  const renderNodes = (nodes, depth) => nodes.map((n) => {
    const hasKids = (n.children || []).length > 0
    const open = expanded[n.id] === true
    const selfSelectable = isNodeSelectable(n, isExport)
    const kidSelectable = []
    walkSessions(n.children, (c) => {
      if (isNodeSelectable(c, isExport)) kidSelectable.push(c.id)
    })
    const totalSelectable = (selfSelectable ? 1 : 0) + kidSelectable.length
    const selfOn = selfSelectable && !!selected[n.id]
    const kidOn = kidSelectable.filter((id) => selected[id]).length
    const totalOn = (selfOn ? 1 : 0) + kidOn

    const locked = !selfSelectable
    let boxState
    if (!isExport && n.mappingChanged) {
      boxState = 'empty'
    } else if (totalSelectable === 0) {
      boxState = (!isExport && n.imported && !n.stale) ? 'checked' : 'empty'
    } else {
      boxState = triState(totalOn, totalSelectable)
    }
    const boxDisabled = actionsDisabled || totalSelectable === 0 || (!isExport && n.mappingChanged)

    const isCodexOrigin = n.alreadyCodex || n.fromCodex
    const tags = []
    if (isExport) {
      if (isCodexOrigin) {
        if (n.dshUpdated) {
          tags.push(h('span', { key: 'status', style: styles.updatedTag, title: t.tipDshUpdated }, t.tagDshUpdated))
        } else if (n.sourceMissing) {
          tags.push(h('span', { key: 'status', style: styles.importedTag, title: t.tagCodexSourceMissing }, t.tagCodexSourceMissing))
        } else {
          tags.push(h('span', { key: 'status', style: styles.importedTag, title: t.tagCodexUnchanged }, t.tagCodexUnchanged))
        }
      }
      if (n.isSubagent) {
        tags.push(h('span', { key: 'sub', style: styles.importedTag, title: t.tipSubagent }, t.tagSubagent))
      }
    } else {
      if (n.mappingChanged) {
        tags.push(h('span', { key: 'mapping', style: styles.importedTag, title: t.mappingChangedHint }, t.mappingChanged))
      }
      if (n.alreadyCodex) {
        tags.push(h('span', { key: 'status', style: styles.importedTag }, 'Codex'))
      } else if (n.stale) {
        tags.push(h('span', { key: 'status', style: styles.updatedTag }, t.updated))
      } else if (n.imported) {
        tags.push(h('span', { key: 'status', style: styles.importedTag }, t.imported))
      }
      if (n.isSubagent) {
        tags.push(h('span', { key: 'sub', style: styles.importedTag, title: t.tagSubagent }, t.tagSubagent))
      }
    }

    const rowTooltip = (isExport && isCodexOrigin && n.dshUpdated)
      ? `${n.title} — ${t.tipDshUpdated}`
      : (isExport && n.isSubagent)
        ? `${n.title} — ${t.tipSubagent}`
        : n.title

    return h('div', { key: n.id, style: { width: '100%', maxWidth: '100%', boxSizing: 'border-box' } },
      h('div', {
        style: Object.assign({}, styles.treeRow, locked ? styles.muted : {}, { paddingLeft: 8 + depth * 16 }),
      },
        h('button', {
          type: 'button',
          style: { border: 'none', background: 'transparent', cursor: hasKids ? 'pointer' : 'default', color: 'var(--dsw-alias-label-tertiary)', width: 14, height: 14, padding: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
          disabled: busy,
          onClick: () => !busy && hasKids && setExpanded((p) => Object.assign({}, p, { [n.id]: !open })),
        }, hasKids ? (open ? Icons.chevronDown() : Icons.chevronRight()) : null),
        h('button', {
          type: 'button',
          disabled: boxDisabled,
          style: { border: 'none', background: 'transparent', padding: 0, cursor: boxDisabled ? 'default' : 'pointer', display: 'inline-flex', flexShrink: 0 },
          onClick: () => {
            if (boxDisabled) return
            const on = boxState !== 'checked'
            if (selfSelectable) toggleId(n.id, on)
            toggleTree(n.children, on)
          },
        }, h(TriBox, { state: boxState, disabled: boxDisabled })),
        h('span', { style: { color: 'var(--dsw-alias-label-tertiary)', display: 'inline-flex', alignItems: 'center', flexShrink: 0 } }, Icons.chat()),
        h('span', {
          style: { flex: '1 1 auto', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: hasKids ? 'pointer' : 'default' },
          title: rowTooltip,
          onClick: () => !busy && hasKids && setExpanded((p) => Object.assign({}, p, { [n.id]: !open })),
        }, n.title),
        tags.length > 0 ? h('div', { style: styles.tagsContainer }, tags) : null,
      ),
      isRemote ? h(ImportDirectoryMapping, { lang, original: n.sourceCwd, mapped: n.cwd, configured: n.configuredCwd, mappingChanged: n.mappingChanged, style: { padding: '0 8px 5px', paddingLeft: 45 + depth * 16 } }) : null,
      open && hasKids ? renderNodes(n.children, depth + 1) : null,
    )
  })

  const body = error
    ? h('div', { style: { padding: '24px 16px', color: 'var(--dsw-alias-state-error-primary)', textAlign: 'center', fontSize: '13px' } }, error)
    : catalog === null
      ? h('div', { style: { padding: '32px 16px', color: 'var(--dsw-alias-label-tertiary)', textAlign: 'center', fontSize: '13px' } }, t.loading)
      : projects.length === 0
        ? h('div', { style: { padding: '32px 16px', color: 'var(--dsw-alias-label-tertiary)', textAlign: 'center', fontSize: '13px' } }, t.empty)
        : projects.map((p) => {
          const ids = collectSelectable([p], isExport)
          const projectSelectedCount = ids.filter((id) => selected[id]).length
          let hasMappingChanged = false
          if (isRemote) walkSessions(p.sessions, (node) => { if (node.mappingChanged) hasMappingChanged = true })
          const st = ids.length === 0
            ? ((p.sessions || []).length ? (!isExport && !hasMappingChanged ? 'checked' : 'empty') : 'empty')
            : triState(projectSelectedCount, ids.length)
          const projectDisabled = actionsDisabled || ids.length === 0
          const projectKey = p.sourceCwd || p.cwd || p.label
          const open = expanded['p:' + projectKey] === true
          return h('div', { key: projectKey },
            h('div', { style: styles.treeRow },
              h('button', {
                type: 'button',
                style: { border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--dsw-alias-label-secondary)', width: 14, height: 14, padding: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' },
                disabled: busy,
                onClick: () => !busy && setExpanded((prev) => Object.assign({}, prev, { ['p:' + projectKey]: !open })),
              }, open ? Icons.chevronDown() : Icons.chevronRight()),
              h('button', {
                type: 'button',
                disabled: projectDisabled,
                style: { border: 'none', background: 'transparent', padding: 0, cursor: projectDisabled ? 'default' : 'pointer', display: 'inline-flex' },
                onClick: () => {
                  if (projectDisabled) return
                  toggleTree(p.sessions, st !== 'checked')
                },
              }, h(TriBox, { state: st, disabled: projectDisabled })),
              h('span', { style: { color: 'var(--dsw-alias-label-secondary)', display: 'inline-flex', alignItems: 'center' } },
                open ? Icons.folderOpen() : Icons.folder()
              ),
              h('span', {
                style: { fontWeight: 600, flex: '1 1 auto', minWidth: 0, cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
                title: p.sourceCwd || p.cwd || '',
                onClick: () => !busy && setExpanded((prev) => Object.assign({}, prev, { ['p:' + projectKey]: !open })),
              }, p.label),
              isExport && p.isCodexWorkspace === false ? h('span', { style: styles.importedTag, title: t.tipNotInCodex }, t.tagNotInCodex) : null,
              hasMappingChanged ? h('span', { style: styles.importedTag, title: t.projectMappingHint }, t.mappingChanged) : null,
              h('span', { style: styles.projectCount }, (p.sessions || []).length),
            ),
            isRemote ? (hasMappingChanged
              ? h('div', { style: { padding: '0 8px 6px 43px', fontSize: '10.5px', lineHeight: '1.5', color: 'var(--dsw-alias-state-warning-primary, #b67d17)', overflowWrap: 'anywhere' } },
                h('div', null, t.originalDirectory + ': ', p.sourceCwd || p.cwd || t.unknownDirectory),
                h('div', null, t.projectMappingHint),
              )
              : h(ImportDirectoryMapping, { lang, original: p.sourceCwd || p.cwd, mapped: p.mappedCwd, style: { padding: '0 8px 6px 43px' } })) : null,
            open ? renderNodes(p.sessions, 1) : null,
          )
        })

  if (showSourceManager) return h(SshSourceManager, { lang, onClose: () => {
    setShowSourceManager(false); setSourceGeneration(value => value + 1)
    setSourceId(''); setSelected({}); setPreview(null); setCatalog(null)
  } })

  if (done) {
    return h('div', { style: styles.overlay },
      h('div', { style: Object.assign({}, styles.dialog, { maxHeight: 'none', width: 'min(400px, 90vw)', textAlign: 'center', padding: '20px' }) },
        h('div', { style: { display: 'flex', justifyContent: 'center', marginBottom: '10px' } }, Icons.checkCircle()),
        h('div', { style: { fontSize: '15px', fontWeight: 600, color: 'var(--dsw-alias-label-primary)', marginBottom: '8px' } }, isExport ? t.exportedOk : t.importedOk),
        h('div', { style: { fontSize: '12px', color: 'var(--dsw-alias-label-secondary)', lineHeight: '1.5', marginBottom: '18px' } }, isExport ? t.exportHint : t.reloadHint),
        h('div', { style: { display: 'flex', justifyContent: 'center', gap: '10px' } },
          isExport
            ? h('button', { type: 'button', style: styles.primaryBtn, onClick: closePicker }, t.done)
            : [
              h('button', { key: 'later', type: 'button', style: styles.ghostBtn, onClick: () => {
                closePicker()
              } }, t.reloadLater),
              h('button', {
                key: 'now',
                type: 'button',
                style: styles.primaryBtn,
                onClick: () => { window.location.reload() },
              }, t.reloadNow),
            ],
        ),
      ),
    )
  }

  if (confirmingExport) {
    return h('div', {
      style: styles.overlay,
      onMouseDown: (e) => { if (e.target === e.currentTarget && !busy) setConfirmingExport(false) },
    },
      h('div', {
        style: Object.assign({}, styles.dialog, { maxHeight: 'none', width: 'min(440px, 90vw)', padding: '20px' }),
        onKeyDown: (e) => { if (e.key === 'Escape' && !busy) setConfirmingExport(false) },
      },
        h('div', { style: { fontSize: '15px', fontWeight: 600, color: 'var(--dsw-alias-label-primary)', marginBottom: '10px' } }, t.confirmExportTitle),
        h('div', { style: { fontSize: '12px', color: 'var(--dsw-alias-label-secondary)', lineHeight: '1.6', marginBottom: '18px' } },
          typeof t.confirmExportBody === 'function' ? t.confirmExportBody(selectedCount) : t.confirmExportBody
        ),
        h('div', { style: { display: 'flex', justifyContent: 'flex-end', gap: '8px' } },
          h('button', {
            type: 'button',
            style: styles.ghostBtn,
            disabled: busy,
            onClick: () => setConfirmingExport(false),
          }, t.cancel),
          h('button', {
            type: 'button',
            style: Object.assign({}, styles.primaryBtn, busy ? { opacity: 0.5, cursor: 'not-allowed', boxShadow: 'none' } : {}),
            disabled: busy,
            onClick: () => { void executeExport() },
          }, busy ? t.loading : t.confirmExportBtn),
        ),
      ),
    )
  }

  return h('div', {
    style: styles.overlay,
    onMouseDown: (e) => { if (e.target === e.currentTarget && !busy) closePicker() },
  },
    h('div', {
      style: styles.dialog,
      onKeyDown: (e) => { if (e.key === 'Escape' && !busy) closePicker() },
    },
      !isExport ? h('div', { style: { padding: '11px 16px', borderBottom: '1px solid var(--dsw-alias-border-l1)', display: 'flex', flexDirection: 'column', gap: '7px' } },
        h(ImportSourceSelect, { lang, sources, sourceId, disabled: busy || sourcesLoading, onChange: changeSource }),
        h('button', { type: 'button', style: styles.ghostBtn, disabled: busy, 'data-codex-source-open': 'picker', onClick: () => { cancelRequest(catalogRequest); setPreview(null); setShowSourceManager(true) } }, sources.length ? sshLabels(lang).title : sshLabels(lang).add),
        h('div', { style: { fontSize: '10.5px', lineHeight: '1.5', color: 'var(--dsw-alias-label-tertiary)' } }, sourcesError ? t.sourcesError : (sources.length ? t.configuredSourcesOnly : sshLabels(lang).empty)),
        isRemote ? h('div', { style: { fontSize: '11px', lineHeight: '1.5', color: 'var(--dsw-alias-state-warning-primary, #b67d17)' } }, t.remoteReadOnly) : null,
      ) : null,
      h('div', { style: styles.dialogHead },
        h('button', {
          type: 'button',
          style: Object.assign({}, styles.filterBtn, { border: 'none', padding: '0 6px', background: 'transparent' }),
          disabled: actionsDisabled,
          onClick: () => {
            if (actionsDisabled) return
            setPreview(null)
            const on = allState !== 'checked'
            const next = Object.assign({}, selected)
            selectable.forEach((id) => { next[id] = on })
            setSelected(next)
          },
        }, h(TriBox, { state: allState }), h('span', { style: { marginLeft: '4px' } }, t.selectAll)),
        h('div', { style: styles.searchWrap },
          h('span', { style: styles.searchIcon }, Icons.search()),
          h('input', {
            style: styles.search,
            placeholder: t.search,
            value: query,
            disabled: busy,
            onChange: (e) => changeQuery(e.target.value),
          }),
          query.length > 0
            ? h('button', {
              type: 'button',
              style: styles.searchClear,
              title: 'Clear',
              disabled: busy,
              onClick: () => changeQuery(''),
            }, Icons.clear())
            : null,
        ),
        isExport ? h('button', {
          type: 'button',
          style: Object.assign({}, styles.filterBtn, showCodex ? { color: 'var(--dsw-alias-label-primary)', borderColor: 'var(--dsw-alias-border-l3)' } : {}),
          disabled: busy,
          onClick: () => { if (!busy) { resetCatalog(); setShowCodex(!showCodex) } },
        },
          h('span', {
            style: {
              display: 'inline-block',
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              backgroundColor: showCodex ? 'var(--dsw-alias-state-success-primary, #22c55e)' : 'var(--dsw-alias-border-l3, #888)',
            }
          }),
          t.fromCodex,
        ) : null,
        h('button', {
          type: 'button',
          style: Object.assign({}, styles.filterBtn, hideSub ? { color: 'var(--dsw-alias-label-primary)', borderColor: 'var(--dsw-alias-border-l3)' } : {}),
          disabled: busy,
          onClick: () => { if (!busy) { resetCatalog(); setHideSub(!hideSub) } },
        },
          h('span', {
            style: {
              display: 'inline-block',
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              backgroundColor: hideSub ? 'var(--dsw-alias-state-success-primary, #22c55e)' : 'var(--dsw-alias-border-l3, #888)',
            }
          }),
          t.hideSub,
        ),
      ),
      h('div', { style: styles.dialogBody },
        isRemote && catalog && (catalog.skippedBig || catalog.unreadable) ? h('div', { style: { padding: '4px 8px 8px', fontSize: '11px', color: 'var(--dsw-alias-label-secondary)' } }, t.catalogWarnings(catalog.skippedBig || 0, catalog.unreadable || 0)) : null,
        body,
        isRemote ? h('div', { style: { padding: '10px 8px 4px', fontSize: '11px', lineHeight: '1.5', color: 'var(--dsw-alias-label-secondary)' }, role: 'status' },
          previewValid ? t.previewReady : t.previewRequired,
          previewValid && preview.text ? h('pre', { style: { whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', fontSize: '10.5px', maxHeight: '140px', overflowY: 'auto', margin: '6px 0 0' } }, preview.text) : null,
        ) : null,
      ),
      h('div', { style: Object.assign({}, styles.dialogFoot, { flexWrap: 'wrap' }) },
        h('button', { type: 'button', style: styles.ghostBtn, disabled: busy, onClick: closePicker }, t.cancel),
        isRemote ? h('button', {
          type: 'button',
          style: Object.assign({}, styles.ghostBtn, (actionsDisabled || selectedCount === 0) ? styles.muted : {}),
          disabled: actionsDisabled || selectedCount === 0,
          onClick: () => { void executeImport(selectedIds, true) },
        }, t.preview) : null,
        h('button', {
          type: 'button',
          style: Object.assign({}, styles.primaryBtn, (actionsDisabled || selectedCount === 0 || (isRemote && !previewValid)) ? { opacity: 0.5, cursor: 'not-allowed', boxShadow: 'none' } : {}),
          disabled: actionsDisabled || selectedCount === 0 || (isRemote && !previewValid),
          onClick: onConfirmClick,
        }, (isExport ? t.exportN : t.importN) + ' ' + selectedCount),
      ),
    ),
  )
}

function StatusModal({ lang, onClose }) {
  const t = labels(lang)
  const [loading, setLoading] = useState(true)
  const [statusText, setStatusText] = useState('')
  const [copied, setCopied] = useState(false)

  const fetchStatus = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/dsh-codex-sync/mcp-status', { credentials: 'same-origin' })
      const data = await res.json().catch(() => null)
      if (res.ok && data && data.text) {
        setStatusText(data.text + (data.autoImport !== undefined ? `\nautoImport: ${data.autoImport ? 'on' : 'off'}` : ''))
      } else {
        setStatusText(lang === 'zh' ? 'MCP 镜像未启用或服务离线' : 'MCP mirror not active or service offline')
      }
    } catch {
      setStatusText(lang === 'zh' ? '无法获取 MCP 状态' : 'Failed to fetch MCP status')
    } finally {
      setLoading(false)
    }
  }, [lang])

  useEffect(() => {
    void fetchStatus()
  }, [fetchStatus])

  const copyStatus = () => {
    if (!statusText) return
    try {
      if (navigator.clipboard) {
        navigator.clipboard.writeText(statusText).then(() => {
          setCopied(true)
          setTimeout(() => setCopied(false), 1500)
        })
      }
    } catch {}
  }

  return h('div', {
    style: styles.overlay,
    onMouseDown: (e) => { if (e.target === e.currentTarget) onClose() },
  },
    h('div', {
      style: Object.assign({}, styles.dialog, { maxWidth: '540px', width: '90vw' }),
      onKeyDown: (e) => { if (e.key === 'Escape') onClose() },
    },
      h('div', { style: styles.dialogHead },
        h('span', { style: { display: 'inline-flex', alignItems: 'center', gap: '8px', fontWeight: 600, fontSize: '14px', color: 'var(--dsw-alias-label-primary)' } },
          Icons.status(),
          lang === 'zh' ? 'MCP 镜像状态' : 'MCP Mirror Status'
        ),
        h('span', { style: styles.spacer }),
        h('button', {
          type: 'button',
          style: styles.modalCloseBtn,
          title: t.close,
          'aria-label': t.close,
          onClick: onClose,
        }, Icons.clear())
      ),
      h('div', { style: Object.assign({}, styles.dialogBody, { padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: '12px' }) },
        loading
          ? h('div', { style: { padding: '32px 16px', color: 'var(--dsw-alias-label-tertiary)', textAlign: 'center', fontSize: '13px' } }, t.loading)
          : h('pre', {
            style: {
              margin: 0,
              padding: '14px',
              borderRadius: '8px',
              background: 'var(--dsw-alias-bg-layer-1, rgba(127,127,127,0.08))',
              border: '1px solid var(--dsw-alias-border-l1, rgba(127,127,127,0.16))',
              color: 'var(--dsw-alias-label-primary)',
              fontFamily: 'var(--dsw-font-mono, monospace)',
              fontSize: '12px',
              lineHeight: '1.6',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              maxHeight: '380px',
              overflowY: 'auto',
            }
          }, statusText)
      ),
      h('div', { style: styles.dialogFoot },
        h('button', {
          type: 'button',
          style: styles.ghostBtn,
          onClick: copyStatus,
          disabled: loading || !statusText,
        }, copied ? (lang === 'zh' ? '已复制 ✓' : 'Copied ✓') : (lang === 'zh' ? '复制文本' : 'Copy Text')),
        h('button', {
          type: 'button',
          style: styles.ghostBtn,
          onClick: fetchStatus,
          disabled: loading,
        }, lang === 'zh' ? '重新检测' : 'Re-check'),
        h('button', {
          type: 'button',
          style: styles.primaryBtn,
          onClick: onClose,
        }, t.done || t.close)
      )
    )
  )
}

function renderSwitch(isOn, t) {
  const bg = isOn === true
    ? 'var(--dsw-alias-state-success-primary, var(--dsw-static-green-500, #22c55e))'
    : isOn === false
      ? 'var(--dsw-alias-border-l3, rgba(127,127,127,0.28))'
      : 'var(--dsw-alias-border-l1, rgba(127,127,127,0.16))'
  return h('span', {
    style: Object.assign({}, styles.switchTrack, { backgroundColor: bg }),
    title: isOn === true ? t?.on : isOn === false ? t?.off : t?.unknown
  },
    h('span', {
      style: Object.assign({}, styles.switchThumb, {
        left: isOn === true ? '14px' : '2px',
        opacity: isOn === undefined ? 0.6 : 1,
      })
    })
  )
}

/** Ask the host to reveal a whitelisted config file/folder in Finder/editor. */
async function openConfigPath(target) {
  try {
    const res = await fetch('/dsh-codex-sync/open-path', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target }),
      credentials: 'same-origin',
    })
    return res.ok
  } catch {
    return false
  }
}

/**
 * Second-level management page (inside the settings dialog): a location banner,
 * then a search box, then ItemSyncPanel. The feature master switch lives
 * OUTSIDE (on the manager button in the Actions grid).
 */
function ItemsManagerPage({ lang, kind, itemsData, itemsLoading, onToggleItem, onSetAll }) {
  const t = labels(lang)
  const [query, setQuery] = useState('')
  const group = itemsData?.[kind]
  const allItems = group?.items ?? {}
  const filteredItems = Object.fromEntries(
    Object.entries(allItems).filter(([name]) => name.toLowerCase().includes(query.trim().toLowerCase()))
  )
  if (itemsLoading && itemsData === null) {
    return h('div', { style: styles.subpageBody, className: 'codex-sync-subpage-animate' }, h('span', { style: styles.settingName }, t.loading))
  }
  const isSkill = kind === 'skill'
  const pathLabel = isSkill ? '~/.codex/skills' : '~/.codex/config.toml'

  return h('div', { style: styles.subpageBody, className: 'codex-sync-subpage-animate' },
    // Location / Config header banner
    h('div', {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        padding: '10px 13px',
        borderRadius: '10px',
        background: 'var(--dsw-alias-bg-layer-1, rgba(127,127,127,0.04))',
        border: '1px solid var(--dsw-alias-border-l1, rgba(127,127,127,0.16))',
      },
    },
      h('span', { style: { color: 'var(--dsw-alias-label-secondary)', display: 'inline-flex', flexShrink: 0 } },
        isSkill ? Icons.folderOpen(16) : Icons.server(16)
      ),
      h('div', { style: { flex: 1, minWidth: 0 } },
        h('div', {
          style: {
            fontSize: '12px',
            fontWeight: 600,
            color: 'var(--dsw-alias-label-primary)',
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          },
        },
          pathLabel,
        ),
        h('div', { style: styles.settingDesc }, isSkill ? t.descSkills : t.descMcpMirror)
      ),
      configOpener(isSkill ? 'skills' : 'config', t)
    ),

    // Search bar with magnifier icon
    h('div', { style: styles.searchWrap },
      h('span', { style: styles.searchIcon }, Icons.search(13)),
      h('input', {
        type: 'search',
        placeholder: t.searchItems,
        value: query,
        onInput: (e) => setQuery(e.target.value),
        style: styles.search,
      })
    ),

    h(ItemSyncPanel, {
      lang,
      kind,
      items: filteredItems,
      groupDefault: group?.default !== false,
      mirrorStatus: itemsData?.mirrorStatus ?? null,
      hardDeny: itemsData?.hardDenyMcp ?? [],
      onToggleItem,
      onSetAll,
    })
  )
}

/** Small ↗ button that asks the host to open a whitelisted config target. */
function configOpener(target, t) {
  return h('button', {
    type: 'button',
    className: 'codex-sync-open-cfg',
    'data-codex-sync-open': target,
    style: styles.openCfgBtn,
    title: t.openCfgTitle,
    onClick: (e) => {
      e.stopPropagation()
      try { window.__dshCodexSyncOpenPath?.(target) } catch {}
    },
  }, Icons.externalLink(12))
}

/** One settings row with title, plain description, optional open-config icon and switch. */
function SettingRow({ lang, icon, nameKey, descKey, configTarget, isOn, tooltipId, setTooltipId, onToggleSetting, onOpenPath }) {
  const t = labels(lang)
  const info = SETTING_INFO[nameKey]?.[lang]
  return h('div', { className: 'codex-sync-row', style: styles.settingRowFull },
    h('div', { style: { display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 } },
      icon ? h('span', { style: { display: 'inline-flex', color: 'var(--dsw-alias-label-secondary)' } }, icon) : null,
      h('div', { style: { minWidth: 0 } },
        h('div', { style: styles.settingName }, t.settingNames[nameKey]),
        h('div', { style: styles.settingDesc }, t[descKey]),
        info ? h('span', {
          style: styles.infoIconWrapper,
          onMouseEnter: (e) => { e.stopPropagation(); setTooltipId(nameKey) },
          onMouseLeave: (e) => { e.stopPropagation(); setTooltipId(null) },
          onClick: (e) => { e.stopPropagation(); e.preventDefault() },
        }, Icons.info()) : null
      )
    ),
    h('span', { style: styles.spacer }),
    configTarget ? h('button', {
      type: 'button',
      className: 'codex-sync-open-cfg',
      style: styles.openCfgBtn,
      title: t.openCfgTitle,
      onClick: () => onOpenPath(configTarget),
    }, Icons.externalLink(12)) : null,
    renderSwitch(isOn, t),
    tooltipId === nameKey && info ? h('div', { style: styles.modalTooltip }, info) : null
  )
}

/**
 * Per-item sync panel shown under an expandable settings row.
 * kind: 'skill' | 'mcp'; data comes from GET /dsh-codex-sync/items.
 */
function ItemSyncPanel({ lang, kind, items, groupDefault, mirrorStatus, hardDeny, onToggleItem, onSetAll }) {
  const t = labels(lang)
  const names = Object.keys(items).sort((a, b) => a.localeCompare(b))
  if (names.length === 0) {
    return h('div', { style: styles.itemListPanel }, h('span', { style: Object.assign({}, styles.itemName, { color: 'var(--dsw-alias-label-tertiary)' }) }, t.itemsEmpty))
  }
  const statusByName = {}
  for (const s of mirrorStatus?.servers ?? []) statusByName[s.name] = s
  return h('div', { style: styles.itemListPanel },
    // Toolbar: select-all (left) + new-item default (right)
    h('div', { style: styles.itemToolbar },
      h('button', {
        type: 'button',
        className: 'codex-sync-pill-btn',
        style: styles.itemToolbarBtn,
        onClick: () => onSetAll(kind, true),
      }, t.selectAllShort),
      h('button', {
        type: 'button',
        className: 'codex-sync-pill-btn',
        style: styles.itemToolbarBtn,
        onClick: () => onSetAll(kind, false),
      }, t.deselectAllShort),
      h('span', { style: { flex: 1 } }),
      h('span', { style: { fontSize: '11px', color: 'var(--dsw-alias-label-secondary)', fontWeight: 500 } }, t.defaultSyncLabel),
      h('span', {
        style: { display: 'inline-flex', cursor: 'pointer', marginLeft: '6px' },
        onClick: () => onToggleItem('__default__', !groupDefault),
        role: 'switch',
        'aria-checked': groupDefault,
      }, renderSwitch(groupDefault === true, t))
    ),
    ...names.map((name) => {
      const entry = items[name] || { on: groupDefault, override: null }
      const denied = kind === 'mcp' && hardDeny.includes(name)
      const srv = kind === 'mcp' ? statusByName[name] : undefined
      let badge = null
      let dotColor = null
      if (denied) {
        badge = t.itemBadgeDenied
      } else if (srv?.reason === 'mounted') {
        badge = t.itemBadgeMounted
        dotColor = '#22c55e'
      } else if (srv?.reason === 'failed') {
        badge = t.itemBadgeFailed
        dotColor = '#ef4444'
      } else if (!entry.on && entry.override === false) {
        badge = t.itemBadgeUserOff
        dotColor = 'rgba(127,127,127,0.4)'
      } else if (entry.override === null) {
        badge = t.itemBadgeOverrideDefault
        dotColor = groupDefault ? '#22c55e' : 'rgba(127,127,127,0.4)'
      }
      return h('div', {
        key: name,
        className: 'codex-sync-item-row',
        'data-codex-sync-item': `${kind}:${name}`,
        style: Object.assign({}, styles.itemRow, denied ? styles.itemRowDisabled : {}),
      },
        // Leading indicator icon / dot
        denied
          ? h('span', { style: { display: 'inline-flex', color: 'var(--dsw-alias-label-tertiary)', flexShrink: 0 } }, Icons.lock(12))
          : dotColor
            ? h('span', {
                style: {
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  backgroundColor: dotColor,
                  boxShadow: dotColor === '#22c55e' ? '0 0 6px rgba(34,197,94,0.6)' : 'none',
                  flexShrink: 0,
                }
              })
            : h('span', { style: { width: '6px', height: '6px', flexShrink: 0 } }),
        h('span', { style: Object.assign({}, styles.itemName, { flex: 1 }), title: name }, name),
        badge !== null
          ? h('span', { style: styles.itemBadge }, badge)
          : null,
        denied
          ? renderSwitch(false, t)
          : h('span', {
              style: { display: 'inline-flex', cursor: 'pointer' },
              onClick: () => onToggleItem(name, !entry.on),
              role: 'switch',
              'aria-checked': entry.on,
            }, renderSwitch(entry.on, t))
      )
    })
  )
}

function SyncSettingsModal({ lang, setLang, settings, toggleSetting, itemsData, itemsLoading, onToggleItem, onSetAll, onOpenImport, onOpenExport, onShowStatus, onOpenManage, onOpenPath, onRefresh, onClose }) {
  const t = labels(lang)
  // Second-level navigation: null = main page; 'skill' | 'mcp' = manager page.
  const [subpage, setSubpage] = useState(null)
  const [tooltipId, setTooltipId] = useState(null)
  const [refreshState, setRefreshState] = useState(null) // null | 'loading' | 'done'

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'Escape') {
        if (subpage !== null) setSubpage(null)
        else onClose()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
    }
  }, [onClose, subpage])

  // Lazily load item data when entering a manager page.
  useEffect(() => {
    if (subpage !== null && typeof onOpenManage === 'function') onOpenManage()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subpage])

  // Expose the open-config handler for nested rows that reach it via the
  // configOpener helper (window.__dshCodexSyncOpenPath).
  useEffect(() => {
    if (typeof onOpenPath === 'function') {
      window.__dshCodexSyncOpenPath = onOpenPath
      return () => { try { delete window.__dshCodexSyncOpenPath } catch {} }
    }
  }, [onOpenPath])

  const handleRefreshClick = async () => {
    if (refreshState === 'loading') return
    setRefreshState('loading')
    try {
      if (typeof onRefresh === 'function') {
        await onRefresh()
      }
      setRefreshState('done')
      setTimeout(() => setRefreshState(null), 1800)
    } catch {
      setRefreshState(null)
    }
  }

  if (subpage === 'ssh') return h(SshSourceManager, { lang, onClose: () => setSubpage(null) })

  return h('div', {
    style: styles.overlay,
    onMouseDown: (e) => { if (e.target === e.currentTarget) onClose() },
  },
    h('div', {
      className: 'codex-sync-dialog-animate',
      style: styles.settingsDialog,
      onKeyDown: (e) => { if (e.key === 'Escape') onClose() },
    },
      // Header: (Back ← when in a subpage) Title + Close button (×)
      h('div', { style: styles.dialogHead },
        subpage !== null
          ? h('button', {
              type: 'button',
              className: 'codex-sync-back',
              'data-codex-sync-back': '',
              style: styles.backBtn,
              title: t.back,
              'aria-label': t.back,
              onClick: () => setSubpage(null),
            }, Icons.arrowLeft(14))
          : null,
        h('span', { style: { display: 'inline-flex', alignItems: 'center', gap: '8px', fontWeight: 600, fontSize: '14px', color: 'var(--dsw-alias-label-primary)' } },
          subpage === 'skill'
            ? t.skillsPageTitle
            : subpage === 'mcp'
              ? t.mcpsPageTitle
              : h(React.Fragment || 'span', null, Icons.codex(16), t.settingsModalTitle || (lang === 'zh' ? 'Codex 同步设置' : 'Codex Sync Settings'))
        ),
        h('span', { style: styles.spacer }),
        h('button', {
          type: 'button',
          style: styles.modalCloseBtn,
          title: t.close,
          'aria-label': t.close,
          onClick: onClose,
        }, Icons.clear())
      ),

      // Subpage body: skill / MCP manager replaces the whole main content.
      ...(subpage !== null
        ? [
            h('div', { key: 'sub', style: styles.subpageBody },
              h(ItemsManagerPage, {
                lang,
                kind: subpage,
                itemsData,
                itemsLoading,
                onToggleItem,
                onSetAll,
              })
            ),
          ]
        : [
      // Body: 3 Sections
      h('div', { key: 'main', style: Object.assign({}, styles.dialogBody, { padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: '16px' }) },
        // Section 1: Actions. Row 1: import/export. Row 2: managers
        // (技能管理 / MCP 管理, gated by their master switch). Row 3: status/refresh.
        h('div', { style: styles.modalSection },
          h('div', { style: styles.modalSectionTitle }, t.actions),
          h('div', { style: styles.actionGrid },
            h('div', { style: { position: 'relative' } },
              h('button', {
                type: 'button',
                className: 'codex-sync-card',
                style: Object.assign({}, styles.actionCard, { width: '100%' }),
                onClick: onOpenImport,
              },
                h('span', { style: styles.actionCardIcon }, Icons.import(15)),
                h('span', { style: styles.actionCardLabel }, t.importNow),
                h('span', {
                  style: Object.assign({}, styles.infoIconWrapper, { marginLeft: 'auto' }),
                  onMouseEnter: (e) => { e.stopPropagation(); setTooltipId('action_import') },
                  onMouseLeave: (e) => { e.stopPropagation(); setTooltipId(null) },
                  onClick: (e) => { e.stopPropagation(); e.preventDefault() },
                }, Icons.info(12))
              ),
              tooltipId === 'action_import' && ACTION_INFO.importNow?.[lang]
                ? h('div', { style: Object.assign({}, styles.modalTooltip, { top: 'calc(100% + 4px)', left: '0', right: '0', zIndex: 1500 }) }, ACTION_INFO.importNow[lang])
                : null
            ),
            h('div', { style: { position: 'relative' } },
              h('button', {
                type: 'button',
                className: 'codex-sync-card',
                style: Object.assign({}, styles.actionCard, { width: '100%' }),
                onClick: onOpenExport,
              },
                h('span', { style: styles.actionCardIcon }, Icons.export(15)),
                h('span', { style: styles.actionCardLabel }, t.exportNow),
                h('span', {
                  style: Object.assign({}, styles.infoIconWrapper, { marginLeft: 'auto' }),
                  onMouseEnter: (e) => { e.stopPropagation(); setTooltipId('action_export') },
                  onMouseLeave: (e) => { e.stopPropagation(); setTooltipId(null) },
                  onClick: (e) => { e.stopPropagation(); e.preventDefault() },
                }, Icons.info(12))
              ),
              tooltipId === 'action_export' && ACTION_INFO.exportNow?.[lang]
                ? h('div', { style: Object.assign({}, styles.modalTooltip, { top: 'calc(100% + 4px)', left: '0', right: '0', zIndex: 1500 }) }, ACTION_INFO.exportNow[lang])
                : null
            ),
            h('button', { type: 'button', className: 'codex-sync-card', style: styles.actionCard, 'data-codex-source-open': 'settings', onClick: () => setSubpage('ssh') }, h('span', { style: styles.actionCardIcon }, Icons.server(15)), h('span', { style: styles.actionCardLabel }, sshLabels(lang).title)),
            // Manager buttons (row 2 of the grid): label + count badge + the
            // master switch rendered OUTSIDE, same visual as other switches.
            // Master off → button is disabled and cannot enter the subpage;
            // toggling the switch works regardless (it's on the switch itself).
            ...[['skill', 'enableSkills', Icons.sparkles(15), t.skillsPageTitle],
                ['mcp', 'mcpMirror', Icons.server(15), t.mcpsPageTitle]].map(([kindKey, masterKey, icon, title]) => {
              const masterOn = settings?.[masterKey] === true
              const count = itemsData
                ? Object.keys((kindKey === 'skill' ? itemsData.skills : itemsData.mcps)?.items ?? {}).length
                : null
              return h('div', { key: `mgr-${kindKey}`, style: { position: 'relative' } },
                h('button', {
                  type: 'button',
                  className: 'codex-sync-card',
                  style: Object.assign({}, styles.actionCard, { width: '100%' }, !masterOn ? { opacity: 0.5, cursor: 'not-allowed' } : {}),
                  onClick: () => { if (masterOn) setSubpage(kindKey) },
                },
                  h('span', { style: styles.actionCardIcon }, icon),
                  h('span', { style: Object.assign({}, styles.actionCardLabel, { flex: '0 1 auto' }) }, title),
                  h('span', { style: styles.spacer }),
                  typeof count === 'number' && count > 0
                    ? h('span', { style: Object.assign({}, styles.itemBadge, { marginRight: '8px' }) }, t.expandHint(count))
                    : null,
                  h('span', {
                    style: { display: 'inline-flex', cursor: 'pointer', flexShrink: 0 },
                    onClick: (e) => { e.stopPropagation(); toggleSetting(masterKey) },
                  }, renderSwitch(masterOn, t))
                )
              )
            }),

            h('div', { style: { position: 'relative' } },
              h('button', {
                type: 'button',
                className: 'codex-sync-card',
                style: Object.assign({}, styles.actionCard, { width: '100%' }),
                onClick: onShowStatus,
              },
                h('span', { style: styles.actionCardIcon }, Icons.status(15)),
                h('span', { style: styles.actionCardLabel }, t.status),
                h('span', {
                  style: Object.assign({}, styles.infoIconWrapper, { marginLeft: 'auto' }),
                  onMouseEnter: (e) => { e.stopPropagation(); setTooltipId('action_status') },
                  onMouseLeave: (e) => { e.stopPropagation(); setTooltipId(null) },
                  onClick: (e) => { e.stopPropagation(); e.preventDefault() },
                }, Icons.info(12))
              ),
              tooltipId === 'action_status' && ACTION_INFO.status?.[lang]
                ? h('div', { style: Object.assign({}, styles.modalTooltip, { top: 'calc(100% + 4px)', left: '0', right: '0', zIndex: 1500 }) }, ACTION_INFO.status[lang])
                : null
            ),
            h('div', { style: { position: 'relative' } },
              h('button', {
                type: 'button',
                className: 'codex-sync-card',
                style: Object.assign({}, styles.actionCard, { width: '100%' }, refreshState === 'done' ? { borderColor: 'rgba(34,197,94,0.4)', color: 'var(--dsw-alias-state-success-primary, #22c55e)' } : {}),
                onClick: handleRefreshClick,
              },
                h('span', { style: styles.actionCardIcon }, refreshState === 'done' ? Icons.checkCircle(15) : Icons.refresh(15)),
                h('span', { style: styles.actionCardLabel }, refreshState === 'done' ? (lang === 'zh' ? '已刷新 ✓' : 'Refreshed ✓') : (refreshState === 'loading' ? t.loading : t.refresh)),
                h('span', {
                  style: Object.assign({}, styles.infoIconWrapper, { marginLeft: 'auto' }),
                  onMouseEnter: (e) => { e.stopPropagation(); setTooltipId('action_refresh') },
                  onMouseLeave: (e) => { e.stopPropagation(); setTooltipId(null) },
                  onClick: (e) => { e.stopPropagation(); e.preventDefault() },
                }, Icons.info(12))
              ),
              tooltipId === 'action_refresh' && ACTION_INFO.refresh?.[lang]
                ? h('div', { style: Object.assign({}, styles.modalTooltip, { top: 'calc(100% + 4px)', left: '0', right: '0', zIndex: 1500 }) }, ACTION_INFO.refresh[lang])
                : null
            ),
          )
        ),

        // 左下角小提醒：导入的对话若报 token meter / step-start 类错误，
        // 用 /repair-sessions --fix 一键修复。弱化样式、不抢操作区视觉。
        h('div', { style: Object.assign({}, styles.repairHint) },
          h('span', { style: { flexShrink: 0, marginTop: '1px' } }, Icons.info(12)),
          h('div', { style: { minWidth: 0 } },
            h('div', { style: styles.repairHintTitle }, t.repairHintTitle),
            h('div', null,
              t.repairHintBody.split('/repair-sessions --fix').map((part, i, arr) =>
                i < arr.length - 1
                  ? h('span', { key: `p${i}` }, part,
                      h('code', { style: styles.repairHintCode }, '/repair-sessions --fix'))
                  : h('span', { key: `p${i}` }, part)
              )
            )
          )
        ),

        // Section 2: Features (功能开关) — single-line rows:
        // Left: Name + ⓘ icon tightly grouped
        // Right: [↗] open-config micro-button + Switch
        h('div', { style: styles.modalSection },
          h('div', { style: styles.modalSectionTitle }, t.switches),
          h('div', { style: styles.settingsGroup },
            ...SETTING_KEYS.map((key, index) => {
              const isOn = settings[key]
              const info = SETTING_INFO[key]?.[lang]
              const descKey = {
                enableImport: 'descEnableImport',
                autoImport: 'descAutoImport',
                enableInstructions: 'descInstructions',
                enableConfig: 'descConfig',
              }[key]
              // Whitelisted config targets for the ↗ open-config button.
              const configTarget = {
                enableInstructions: 'instructions',
                enableConfig: 'config',
              }[key] ?? null
              return h('div', { key, style: { position: 'relative' } },
                h('div', {
                  className: 'codex-sync-row',
                  style: Object.assign(
                    {},
                    styles.settingRowFull,
                    index < SETTING_KEYS.length - 1 ? styles.settingRowBorder : {}
                  ),
                  onClick: () => toggleSetting(key),
                },
                  // Left side: Title + ⓘ info trigger
                  h('div', { style: { display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 } },
                    h('span', { style: styles.settingName }, t.settingNames[key]),
                    h('span', {
                      style: styles.infoIconWrapper,
                      onMouseEnter: (e) => { e.stopPropagation(); setTooltipId(key) },
                      onMouseLeave: (e) => { e.stopPropagation(); setTooltipId(null) },
                      onClick: (e) => { e.stopPropagation(); e.preventDefault() },
                    }, Icons.info(12))
                  ),
                  h('span', { style: styles.spacer }),
                  // Right side: [↗] button (if applicable) + Switch
                  h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 } },
                    configTarget ? h('button', {
                      type: 'button',
                      className: 'codex-sync-open-cfg',
                      'data-codex-sync-open': configTarget,
                      style: styles.openCfgBtn,
                      title: t.openCfgTitle,
                      onClick: (e) => { e.stopPropagation(); onOpenPath(configTarget) },
                    }, Icons.externalLink(12)) : null,
                    renderSwitch(isOn, t)
                  )
                ),
                tooltipId === key && (info || t[descKey])
                  ? h('div', { style: Object.assign({}, styles.modalTooltip, { top: 'calc(100% - 2px)', left: '12px', right: '12px', zIndex: 1500, whiteSpace: 'normal' }) }, info || t[descKey])
                  : null
              )
            })
          )
        ),

        // Section 3: Language switcher
        h('div', { style: styles.modalSection },
          h('div', { style: styles.modalSectionTitle }, t.language),
          h('div', { style: styles.settingsGroup },
            h('div', {
              className: 'codex-sync-row',
              style: styles.settingRow,
              onClick: setLang,
            },
              h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
                h('span', { style: { color: 'var(--dsw-alias-label-secondary)', display: 'inline-flex' } }, Icons.globe(15)),
                h('span', { style: styles.settingName }, t.language)
              ),
              h('span', { style: styles.spacer }),
              h('span', { style: styles.tagPill }, t.langBadge)
            )
          )
        )
      ),
          ]
        ),

      // Footer with Close / Done button
      h('div', { style: styles.dialogFoot },
        h('button', {
          type: 'button',
          style: styles.primaryBtn,
          onClick: onClose,
        }, t.done || t.close)
      )
    )
  )
}

function SyncMenu({ runCommand, wide }) {
  const [lang, setLang] = useState(readLang)
  const t = labels(lang)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerMode, setPickerMode] = useState('import')
  const [statusOpen, setStatusOpen] = useState(false)
  const [busy, setBusy] = useState(null)
  const [placement, setPlacement] = useState(() => ({
    mode: wide ? 'wide' : 'rail',
    sectionHeader: null,
    left: 0,
    top: 0,
    size: wide ? 28 : 36,
    visible: false,
  }))
  const [settings, setSettings] = useState(() => (
    Object.fromEntries(SETTING_KEYS.map((k) => [k, readBadge(k)]))
  ))
  // Per-item sync data (skills/mcps groups + mirror status), loaded lazily
  // when a row is first expanded; null = not yet fetched.
  const [itemsData, setItemsData] = useState(null)
  const [itemsLoading, setItemsLoading] = useState(false)

  const fetchItemsData = async () => {
    setItemsLoading(true)
    try {
      const res = await fetch('/dsh-codex-sync/items', { credentials: 'same-origin' })
      const data = await res.json().catch(() => null)
      if (res.ok && data && (data.skills || data.mcps)) {
        // Normalize API keys (skills/mcps) to the internal kind keys
        // ('skill'/'mcp') so UI lookups by kind always hit.
        setItemsData({
          skills: data.skills,
          mcps: data.mcps,
          skill: data.skills,
          mcp: data.mcps,
          hardDenyMcp: data.hardDenyMcp ?? [],
          mirrorStatus: data.mirrorStatus ?? null,
        })
        return true
      }
    } catch { /* host unreachable */ }
    finally { setItemsLoading(false) }
    return false
  }

  // Enter a manager page: ensure item data is loaded (idempotent refresh).
  const openManage = async () => {
    void fetchItemsData()
  }

  /** Reveal a whitelisted config file/folder via the host. */
  const handleOpenPath = async (target) => {
    const ok = await openConfigPath(target)
    if (!ok) {
      const t = labels(lang)
      // Surface the failure instead of failing silently (e.g. file missing).
      try { window.alert(`${t.openCfgFailed}\n(target: ${target})`) } catch {}
    }
  }

  const toggleItem = async (name, value) => {
    // The toolbar's group-default switch uses the reserved __default__ name;
    // the panel knows its kind, so resolve it from itemsData membership.
    if (name === '__default__') {
      const kindDefault = itemsData?.skill ? 'skill' : 'mcp'
      void applyDefaultToggle(kindDefault, value)
      return
    }
    let kind = null
    for (const k of ['skill', 'mcp']) {
      if (itemsData?.[k]?.items && name in itemsData[k].items) { kind = k; break }
    }
    if (!kind) return
    // Optimistic update, then reconcile with the server answer.
    setItemsData((prev) => prev && ({
      ...prev,
      [kind]: {
        ...prev[kind],
        items: { ...prev[kind].items, [name]: { on: value, override: value } },
      },
    }))
    try {
      const res = await fetch('/dsh-codex-sync/item', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, name, value: value ? 'on' : 'off' }),
        credentials: 'same-origin',
      })
      if (!res.ok) throw new Error('item toggle failed')
      const data = await res.json().catch(() => null)
      if (data?.ok) {
        setItemsData((prev) => prev && ({
          ...prev,
          [kind]: { ...prev[kind], items: { ...prev[kind].items, [name]: { on: data.effective, override: value } } },
          ...(kind === 'mcp' && typeof prev.mirrorStatus?.enabled === 'boolean' ? {} : {}),
        }))
        if (kind === 'mcp') void fetchItemsData() // refresh mount badges after hot reload
      }
    } catch {
      void fetchItemsData()
    }
  }

  const applyDefaultToggle = async (kind, value) => {
    setItemsData((prev) => prev && ({ ...prev, [kind]: { ...prev[kind], default: value } }))
    try {
      const key = kind === 'skill' ? 'skillSyncDefault' : 'mcpSyncDefault'
      const res = await fetch('/dsh-codex-sync/setting', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, value }),
        credentials: 'same-origin',
      })
      if (!res.ok) throw new Error('default toggle failed')
      setSettings((prev) => ({ ...prev, [key]: value }))
    } catch {
      void fetchItemsData()
    }
  }

  const setAllItems = async (kind, value) => {
    setItemsData((prev) => {
      if (!prev?.[kind]) return prev
      const items = {}
      for (const [name, entry] of Object.entries(prev[kind].items)) {
        items[name] = prev.mirrorStatus && kind === 'mcp' && (prev.hardDenyMcp ?? []).includes(name)
          ? entry
          : { on: value, override: value }
      }
      return { ...prev, [kind]: { ...prev[kind], items } }
    })
    try {
      const res = await fetch('/dsh-codex-sync/item-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, value }),
        credentials: 'same-origin',
      })
      if (!res.ok) throw new Error('select-all failed')
      if (kind === 'mcp') void fetchItemsData()
    } catch {
      void fetchItemsData()
    }
  }

  useEffect(() => {
    ensureStylesInjected()
  }, [])

  const syncSettingsFromHost = async () => {
    try {
      const res = await fetch('/dsh-codex-sync/settings', { credentials: 'same-origin' })
      const data = await res.json().catch(() => null)
      if (res.ok && data && data.settings) {
        setSettings(data.settings)
        for (const [k, v] of Object.entries(data.settings)) {
          writeBadge(k, v)
        }
        writeSeeded()
        return true
      }
    } catch {}
    return false
  }

  const run = async (kind, line) => {
    if (busy !== null) return
    setBusy(kind)
    try {
      if (typeof runCommand === 'function') {
        const outcome = await runCommand(line)
        if (kind === 'seed' || kind === 'refresh' || kind === 'toggle') {
          applyParsed(outcome.text)
        }
      }
    } catch {
      /* command errors */
    } finally {
      setBusy(null)
    }
  }

  const applyParsed = (text) => {
    const parsed = parseStateLines(text)
    let any = false
    for (const k of SETTING_KEYS) {
      if (parsed[k] !== undefined) {
        any = true
        setSettings((prev) => ({ ...prev, [k]: parsed[k] }))
        writeBadge(k, parsed[k])
      }
    }
    if (any) {
      writeSeeded()
    }
    return any
  }

  useEffect(() => {
    void (async () => {
      const ok = await syncSettingsFromHost()
      if (!ok && !readSeeded()) void run('seed', '/codex-settings')
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Keep registration in shell.overlay, but move the one trigger to its native visual home:
  // a normal flex child appended to sectionHeader when expanded, fixed in the final 56px rail.
  useEffect(() => {
    if (typeof document === 'undefined') return

    const RAIL_WIDTH = 56
    let lastCollapsed = null
    let lockedRailPlacement = null
    let lastRailSize = null

    const updatePlacement = (next) => {
      setPlacement((prev) => {
        if (
          prev &&
          prev.mode === next.mode &&
          prev.sectionHeader === next.sectionHeader &&
          prev.visible === next.visible &&
          Math.abs(prev.left - next.left) < 0.5 &&
          Math.abs(prev.top - next.top) < 0.5 &&
          prev.size === next.size
        ) {
          return prev
        }
        return next
      })
    }

    const findSectionHeader = () => document.querySelector(
      'aside [class*="sectionHeader"], [class*="sidebar"] [class*="sectionHeader"], [class*="sectionHeader"]'
    )

    const findAppFrame = () => {
      const overlay = document.querySelector('[data-shell-overlay]')
      return overlay?.parentElement || document.querySelector('[data-sidebar-collapsed]')
    }

    const findRailSearchButton = () => Array.from(document.querySelectorAll(
      'aside button[class*="searchButton"], [class*="sidebar"] button[class*="searchButton"], button[class*="searchButton"]'
    )).find((button) => {
      if (button.closest('[class*="sectionHeader"]')) return false
      const rect = button.getBoundingClientRect()
      return rect.width > 0 && rect.height > 0
    })

    const detect = (reason = 'mutation') => {
      const isMaid = !!document.body?.hasAttribute('data-dsh-maid-atelier')
      const size = isMaid ? 38 : 36
      const appFrame = findAppFrame()
      const isCollapsed = appFrame
        ? appFrame.hasAttribute('data-sidebar-collapsed')
        : !!document.querySelector('aside[class*="rail"], aside [class*="rail"], [class*="sidebar"] [class*="rail"], nav[class*="rail"], nav [class*="rail"]')
      const startedCollapse = isCollapsed && lastCollapsed !== true
      const sizeChanged = isCollapsed && lastRailSize !== null && lastRailSize !== size

      if (!isCollapsed) {
        lastCollapsed = false
        lockedRailPlacement = null
        lastRailSize = null
        const sectionHeader = findSectionHeader()
        if (sectionHeader) {
          const rect = sectionHeader.getBoundingClientRect()
          if (rect.width > 60 && rect.height > 0) {
            updatePlacement({
              mode: 'wide',
              sectionHeader,
              left: 0,
              top: 0,
              size: 28,
              visible: true,
            })
            return
          }
        }
        updatePlacement({ mode: 'wide', sectionHeader: null, left: 0, top: 0, size: 28, visible: false })
        return
      }

      lastCollapsed = true
      if (startedCollapse || sizeChanged || reason === 'resize') lockedRailPlacement = null
      lastRailSize = size

      // Once acquired, rail coordinates are immutable for this collapse. Mutations emitted by
      // the sidebar grid animation must never make the overlay chase intermediate geometry.
      if (lockedRailPlacement) {
        updatePlacement(lockedRailPlacement)
        return
      }

      const railSearchButton = findRailSearchButton()
      if (!railSearchButton || !appFrame) {
        updatePlacement({ mode: 'rail', sectionHeader: null, left: 0, top: 0, size, visible: false })
        return
      }

      const railFrame = appFrame.querySelector(':scope > [class*="sidebarCol"]') || appFrame
      const railLeft = railFrame.getBoundingClientRect().left
      const searchRect = railSearchButton.getBoundingClientRect()
      lockedRailPlacement = {
        mode: 'rail',
        sectionHeader: null,
        left: railLeft + (RAIL_WIDTH - size) / 2,
        top: searchRect.bottom + (isMaid ? 6 : 4),
        size,
        visible: true,
      }
      updatePlacement(lockedRailPlacement)
    }

    detect('initial')

    const observer = new MutationObserver(() => detect('mutation'))
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'style', 'data-sidebar-collapsed', 'data-dsh-maid-atelier'],
    })

    const onResize = () => detect('resize')
    window.addEventListener('resize', onResize)

    return () => {
      observer.disconnect()
      window.removeEventListener('resize', onResize)
    }
  }, [])

  const toggleModal = () => {
    if (busy !== null) return
    const next = !settingsOpen
    setSettingsOpen(next)
    if (next && !readSeeded()) {
      void (async () => {
        const ok = await syncSettingsFromHost()
        if (!ok) void run('seed', '/codex-settings')
      })()
    }
  }

  const toggleSetting = async (key) => {
    const next = !(settings[key] === true)
    setSettings((prev) => ({ ...prev, [key]: next }))
    writeBadge(key, next)
    try {
      const res = await fetch('/dsh-codex-sync/setting', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, value: next }),
        credentials: 'same-origin',
      })
      const data = await res.json().catch(() => null)
      if (res.ok && data?.ok) return
      throw new Error(data?.error || 'setting update failed')
    } catch {
      void run('toggle', `/codex-setting ${key} ${next ? 'on' : 'off'}`)
    }
  }

  const showStatus = () => {
    setSettingsOpen(false)
    setStatusOpen(true)
  }

  const refreshAll = async () => {
    const ok = await syncSettingsFromHost()
    if (!ok) void run('refresh', '/codex-settings')
  }

  const switchLang = () => {
    const next = lang === 'zh' ? 'en' : 'zh'
    setLang(next)
    writeLang(next)
  }

  const isWide = placement.mode === 'wide'
  const iconSize = isWide ? 16 : 18
  const sharedTriggerStyle = {
    display: placement.visible ? 'inline-flex' : 'none',
    alignItems: 'center',
    justifyContent: 'center',
    width: `${placement.size}px`,
    height: `${placement.size}px`,
    minWidth: `${placement.size}px`,
    minHeight: `${placement.size}px`,
    borderRadius: '50%',
    border: 'none',
    background: 'transparent',
    color: 'var(--dsw-alias-label-secondary, var(--dsw-text-secondary, currentColor))',
    cursor: 'pointer',
    padding: 0,
    margin: 0,
    flex: '0 0 auto',
    pointerEvents: 'auto',
  }
  const triggerStyle = isWide
    ? Object.assign({}, sharedTriggerStyle, {
        position: 'relative',
        left: 'auto',
        top: 'auto',
        width: '28px',
        height: '28px',
        minWidth: '28px',
        minHeight: '28px',
      })
    : Object.assign({}, sharedTriggerStyle, {
        position: 'fixed',
        left: `${placement.left}px`,
        top: `${placement.top}px`,
        zIndex: 25,
      })

  const triggerButton = h('button', {
    key: isWide ? 'codex-sync-wide-trigger' : 'codex-sync-rail-trigger',
    type: 'button',
    title: t.button,
    'aria-label': t.button,
    'aria-expanded': settingsOpen,
    'data-codex-sync-trigger': '',
    'data-mode': placement.mode,
    className: `codex-sync-trigger ${isWide ? 'codex-sync-trigger-wide' : 'codex-sync-trigger-rail'}`,
    style: triggerStyle,
    onClick: toggleModal,
    disabled: busy !== null,
  }, Icons.codex(iconSize))

  const canPortalBody = typeof document !== 'undefined' && document.body && typeof ReactDOM !== 'undefined' && ReactDOM.createPortal

  const modals = h(React.Fragment || 'div', null,
    settingsOpen
      ? h(SyncSettingsModal, {
          lang,
          setLang: switchLang,
          settings,
          toggleSetting,
          itemsData,
          itemsLoading,
          onToggleItem: toggleItem,
          onSetAll: setAllItems,
          onOpenImport: () => { setSettingsOpen(false); setPickerMode('import'); setPickerOpen(true) },
          onOpenExport: () => { setSettingsOpen(false); setPickerMode('export'); setPickerOpen(true) },
          onShowStatus: showStatus,
          onOpenManage: openManage,
          onOpenPath: handleOpenPath,
          onRefresh: refreshAll,
          onClose: () => setSettingsOpen(false),
        })
      : null,
    pickerOpen
      ? h(ImportPicker, {
          lang,
          runCommand,
          mode: pickerMode,
          onClose: () => {
            setPickerOpen(false)
            setSettingsOpen(true)
          }
        })
      : null,
    statusOpen
      ? h(StatusModal, {
          lang,
          onClose: () => {
            setStatusOpen(false)
            setSettingsOpen(true)
          }
        })
      : null,
  )

  const wideTrigger = isWide && placement.sectionHeader && typeof ReactDOM !== 'undefined' && ReactDOM.createPortal
    ? ReactDOM.createPortal(triggerButton, placement.sectionHeader, 'codex-sync-trigger')
    : null
  const railTrigger = !isWide || !placement.sectionHeader ? triggerButton : null

  return h(React.Fragment || 'div', null,
    wideTrigger,
    railTrigger,
    canPortalBody
      ? ReactDOM.createPortal(modals, document.body)
      : modals,
  )
}

/** This client plugin's entry name. */
exports.name = 'dsh-codex-sync'
/** Slot registry surface. */
exports.inject = ['slots']

/**
 * Mount the Sync settings trigger through the official additive `shell.overlay` slot.
 * Expanded view portals it into the workspace section header as a normal flex child;
 * only the 56px collapsed rail uses fixed positioning below the native search button.
 */
exports.apply = function apply(ctx) {
  ctx.slots.inject('shell.overlay', () => ctx.slots.register(
    {
      name: 'shell.overlay',
      id: 'codex-sync',
      order: 100,
      label: 'Codex Sync',
    },
    SyncMenu,
  ))
}

return module.exports; } });
