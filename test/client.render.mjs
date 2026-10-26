/**
 * Client-bundle render test: loads lib/client.js through a mocked
 * `window.__ModuleLoader__`, applies the plugin against a fake slots ctx,
 * and server-renders the SyncMenu component with the real React from the
 * dsh installation. Skips (not fails) when React is unavailable.
 *
 * Run: `node --test test/client.render.mjs`
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { dshDep } from './_env.mjs'

const PROJECT = join(import.meta.dirname, '..')
const require = createRequire(import.meta.url)

function loadImportTests(React, globals = {}) {
  const source = readFileSync(join(PROJECT, 'lib', 'client.js'), 'utf8')
  const patched = source.replace('return module.exports; } });',
    'module.exports.__cxTest = { SshSourceManager, sshDraft, sshPayload, sshLabels, ImportPicker, ImportSourceSelect, ImportDirectoryMapping, configuredImportSources, importCatalogUrl, importPreviewKey, isNodeSelectable, collectSelectable, labels }; return module.exports; } });')
  assert.notEqual(patched, source)
  let factory
  const windowMock = { __ModuleLoader__: { load: (entry) => { factory = entry.factory } }, location: { reload: () => {} } }
  new Function('window', 'fetch', 'AbortController', 'setTimeout', 'clearTimeout', patched)(
    windowMock, globals.fetch, AbortController, globals.setTimeout || (() => 1), () => {},
  )
  return factory((id) => {
    if (id === 'react') return React
    if (id === 'react-dom') return {}
    throw new Error(`unexpected require: ${id}`)
  }).__cxTest
}

// A small deterministic hook harness exercises request ownership and event handlers
// without adding a DOM/test-renderer dependency to this hand-authored CJS bundle.
function importPickerHarness(props = {}) {
  const hooks = []
  const requests = []
  const commands = []
  const timers = []
  let cursor = 0
  let dirty = true
  let tree
  let effects = []
  let closed = false
  const React = {
    createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
    useState(initial) {
      const index = cursor++
      if (!hooks[index]) hooks[index] = { value: typeof initial === 'function' ? initial() : initial }
      return [hooks[index].value, (value) => {
        hooks[index].value = typeof value === 'function' ? value(hooks[index].value) : value
        dirty = true
      }]
    },
    useRef(value) {
      const index = cursor++
      if (!hooks[index]) hooks[index] = { current: value }
      return hooks[index]
    },
    useEffect(effect, deps) {
      const index = cursor++
      const previous = hooks[index]
      if (!previous || deps.some((value, i) => !Object.is(value, previous.deps[i]))) {
        effects.push(() => {
          previous?.cleanup?.()
          hooks[index] = { deps, cleanup: effect() }
        })
      }
    },
    useCallback: (fn) => fn,
  }
  const exports = loadImportTests(React, {
    fetch: (url, options) => new Promise((resolve, reject) => {
      requests.push({ url, options, resolve: (data, ok = true, status = ok ? 200 : 500) => resolve({ ok, status, json: async () => data }), reject })
    }),
    setTimeout: (fn) => { timers.push(fn); return timers.length },
  })
  function render() {
    while (dirty) {
      dirty = false
      cursor = 0
      tree = exports[props.component || 'ImportPicker']({ lang: 'en', onClose: () => { closed = true }, runCommand: async (command) => { commands.push(command); return { ok: true } }, ...props })
      const pending = effects
      effects = []
      pending.forEach((effect) => effect())
    }
  }
  function nodes() {
    const found = []
    const visit = (node) => {
      if (Array.isArray(node)) return node.forEach(visit)
      if (!node || typeof node !== 'object') return
      found.push(node)
      visit(node.props?.children)
    }
    visit(tree)
    return found
  }
  const text = (node) => {
    if (Array.isArray(node)) return node.map(text).join('')
    return node && typeof node === 'object' ? text(node.props?.children) : String(node ?? '')
  }
  const find = (predicate) => {
    const node = nodes().find(predicate)
    assert.ok(node, 'expected picker element')
    return node
  }
  render()
  return {
    requests, commands, timers, text, nodes, find,
    get closed() { return closed },
    button: (label) => find((node) => node.type === 'button' && text(node) === label),
    source: () => find((node) => node.type?.name === 'ImportSourceSelect'),
    async flush() { for (let i = 0; i < 12; i++) { await Promise.resolve(); render() } },
    unmount() { hooks.forEach((hook) => hook?.cleanup?.()) },
  }
}

test('SSH manager: explicit save/test/delete and revision conflict have separate effects', async () => {
  const ui = importPickerHarness({ component: 'SshSourceManager' })
  const data = { revision: 'r0', writable: true, sources: [] }
  assert.equal(ui.requests.length, 1)
  ui.requests[0].resolve(data); await ui.flush()
  ui.button('Add SSH source').props.onClick(); await ui.flush()
  const change = async (key, value) => { ui.find(n => n.props?.['data-codex-source-field'] === key).props.onChange({ target: { value } }); await ui.flush() }
  await change('id', 'lab'); await change('host', 'fixture.invalid')
  assert.equal(ui.requests.length, 1, 'editing never connects')
  ui.button('Test connection').props.onClick(); await ui.flush()
  assert.equal(JSON.parse(ui.requests.at(-1).options.body).action, 'test')
  assert.equal(JSON.parse(ui.requests.at(-1).options.body).revision, undefined)
  ui.requests.at(-1).resolve({ ok: true, platform: 'posix', sessionRoot: true }); await ui.flush()
  assert.ok(ui.nodes().some(n => n.props?.role === 'status' && ui.text(n).includes('No conversations')))
  ui.find(n => n.type === 'form').props.onSubmit({ preventDefault() {} }); await ui.flush()
  const save = JSON.parse(ui.requests.at(-1).options.body)
  assert.equal(save.action, 'save'); assert.equal(save.revision, 'r0'); assert.equal(save.source.host, 'fixture.invalid')
  const source = { ...save.source, id: 'lab' }
  ui.requests.at(-1).resolve({ revision: 'r1', writable: true, sources: [source] }); await ui.flush()
  ui.button('Delete').props.onClick(); await ui.flush()
  assert.equal(ui.requests.length, 3, 'delete requires a confirmation')
  ui.find(n => n.props?.['data-codex-source-confirm-delete'] !== undefined).props.onClick(); await ui.flush()
  assert.deepEqual(JSON.parse(ui.requests.at(-1).options.body), { action: 'delete', id: 'lab', revision: 'r1' })
  ui.requests.at(-1).resolve({ error: 'stale', code: 'SOURCE_CONFLICT' }, false, 409); await ui.flush()
  assert.ok(ui.nodes().some(n => n.props?.role === 'alert' && ui.text(n).includes('another window')))
  assert.equal(ui.find(n => n.props?.['data-codex-source-confirm-delete'] !== undefined).props.disabled, true)
  ui.unmount()
})

test('SSH manager: unmount cancels load and stale replies do not update state', async () => {
  const ui = importPickerHarness({ component: 'SshSourceManager' })
  const request = ui.requests[0]; ui.unmount()
  assert.equal(request.options.signal.aborted, true)
  request.resolve({ revision: 'late', writable: true, sources: [] }); await ui.flush()
  assert.equal(ui.button('Add SSH source').props.disabled, true)
})

const remoteSource = { id: 'server &/一', label: 'Configured server', kind: 'ssh' }
function remoteCatalog(source = remoteSource, ids = ['remote-one']) {
  return {
    source, skippedBig: 2, unreadable: 1,
    projects: [{ label: 'Remote project', cwd: '/srv/project', sourceCwd: '/srv/project', mappedCwd: 'C:\\project',
      sessions: ids.map((id) => ({ id, title: id, sourceCwd: '/srv/project', cwd: 'C:\\project' })) }],
  }
}
async function readyRemotePicker(props) {
  const ui = importPickerHarness(props)
  ui.requests.find((request) => request.url.endsWith('/sources')).resolve({ sources: [remoteSource, { id: 'second', label: 'Second', kind: 'ssh' }] })
  ui.requests.find((request) => request.url.includes('/catalog?')).resolve({ projects: [] })
  await ui.flush()
  ui.source().props.onChange(remoteSource.id)
  await ui.flush()
  ui.requests.at(-1).resolve(remoteCatalog())
  await ui.flush()
  ui.button('Select all').props.onClick()
  await ui.flush()
  return ui
}

test('client bundle: loads, applies, renders SyncMenu without throwing', async (t) => {
  const reactDir = dshDep('react')
  const reactDomDir = dshDep('react-dom')
  if (!reactDir || !reactDomDir) {
    t.skip('react/react-dom not found in the dsh installation')
    return
  }

  const source = readFileSync(join(PROJECT, 'lib', 'client.js'), 'utf8')
  let loaded
  const windowMock = {
    __ModuleLoader__: {
      load: ({ factory }) => { loaded = factory },
    },
  }
  const moduleFn = new Function('window', 'require', source)
  moduleFn(windowMock, () => { throw new Error('bundle must not require at top level') })
  assert.ok(loaded, 'bundle must call __ModuleLoader__.load')

  // the factory signature is factory(require) → module.exports
  const plugin = loaded((id) => {
    if (id === 'react') return require(join(reactDir, 'index.js'))
    if (id === 'react-dom') return require(join(reactDomDir, 'index.js'))
    throw new Error(`unexpected require: ${id}`)
  })
  assert.equal(typeof plugin.apply, 'function', 'factory must return the plugin')

  // apply the client plugin against a fake slots ctx and capture the component
  let capturedComponent
  let capturedDef
  const slots = {
    inject(name, cb) { assert.equal(name, 'shell.overlay'); cb() },
    register(def, component) { capturedDef = def; capturedComponent = component },
  }
  plugin.apply({
    slots,
  })
  assert.ok(capturedComponent, 'register must be called with a component')
  assert.equal(capturedDef.name, 'shell.overlay')
  assert.equal(capturedDef.id, 'codex-sync')

  // SSR render the closed state: must produce the button without touching
  // document/window layout APIs (effects don't run in SSR)
  const React = require(join(reactDir, 'index.js'))
  const { renderToStaticMarkup } = require(join(reactDomDir, 'server.js'))
  // shell.overlay passes no props at mount
  const html = renderToStaticMarkup(React.createElement(capturedComponent))
  assert.match(html, /Sync|同步设置/, 'button title must render')
  assert.match(html, /M8\.086\.457/, 'Codex SVG path must render')
  assert.match(html, /data-codex-sync-trigger/, 'trigger attribute must be present')
  assert.match(html, /data-mode="rail"/, 'data-mode attribute must default to rail when unpositioned')
  assert.match(html, /display:\s*none/, 'initial position must be hidden in SSR to prevent fixed 0,0 frame flash')
  // closed menu must not render its items (the badge lives inside it;
  // settings sync happens in a client effect, which SSR does not run)
  assert.doesNotMatch(html, /从 Codex 导入/, 'modal must stay closed in the idle render')
})

test('client bundle: settings modal renders open without throwing (regression)', () => {
  const source = readFileSync(join(PROJECT, 'lib', 'client.js'), 'utf8')
  // Inject a test export just before the factory's final return so the closure
  // hands us the internal SyncSettingsModal component.
  const hook = 'module.exports.__cxTest = { SyncSettingsModal }; '
  const patched = source.replace(
    'return module.exports; } });',
    hook + 'return module.exports; } });'
  )
  assert.notEqual(patched, source, 'tail hook must be injectable')

  let loaded
  const windowMock = { __ModuleLoader__: { load: ({ factory }) => { loaded = factory } } }
  const req = (id) => {
    const reactDir2 = dshDep('react')
    const reactDomDir2 = dshDep('react-dom')
    if (!reactDir2 || !reactDomDir2) throw new Error('react not installed')
    if (id === 'react') return require(join(reactDir2, 'index.js'))
    if (id === 'react-dom') return require(join(reactDomDir2, 'index.js'))
    throw new Error(`unexpected require: ${id}`)
  }
  new Function('window', 'require', patched)(windowMock, req)
  // Invoke the captured factory to obtain the exports (with __cxTest attached).
  const pluginExports = loaded(req)
  assert.ok(pluginExports && pluginExports.__cxTest, 'factory must expose __cxTest hook')
  const React = require(join(dshDep('react'), 'index.js'))
  const { renderToStaticMarkup } = require(join(dshDep('react-dom'), 'server.js'))

  const noop = () => {}
  const item = { on: true, override: null }
  const group = { default: true, items: { pdf: item } }
  const html = renderToStaticMarkup(React.createElement(pluginExports.__cxTest.SyncSettingsModal, {
    lang: 'zh',
    setLang: noop,
    settings: { enableImport: true, autoImport: false, enableInstructions: false, enableConfig: true, enableSkills: true, mcpMirror: true },
    toggleSetting: noop,
    itemsData: {
      skills: group, mcps: group, skill: group, mcp: group,
      hardDenyMcp: ['dsh-plugins'],
      mirrorStatus: null,
    },
    itemsLoading: false,
    onToggleItem: noop,
    onSetAll: noop,
    onOpenImport: noop,
    onOpenExport: noop,
    onShowStatus: noop,
    onOpenManage: noop,
    onOpenPath: noop,
    onRefresh: noop,
    onClose: noop,
  }))
  assert.match(html, /从 Codex 导入/, 'open modal must render action cards')
  assert.match(html, /技能管理/, 'manager buttons must render')
  assert.match(html, /功能开关/, 'switch section must render')
})

test('client bundle: overlay registration, data attributes, maid-atelier styling, and stable DOM detection', () => {
  const source = readFileSync(join(PROJECT, 'lib', 'client.js'), 'utf8')

  // Official additive shell.overlay slot registration
  assert.match(source, /ctx\.slots\.inject\(['"]shell\.overlay['"]/)
  assert.match(source, /name:\s*['"]shell\.overlay['"]/)
  assert.match(source, /id:\s*['"]codex-sync['"]/)
  assert.doesNotMatch(source, /sidebar\.footer\.action/)

  // Trigger attributes
  assert.match(source, /data-codex-sync-trigger/)
  assert.match(source, /data-mode/)

  // Stable DOM evidence and getBoundingClientRect
  assert.match(source, /data-sidebar-collapsed/)
  assert.match(source, /searchButton/)
  assert.match(source, /sectionHeader/)
  assert.match(source, /getBoundingClientRect/)

  // Expanded mode appends one normal 28px flex child to the live sectionHeader.
  assert.match(source, /ReactDOM\.createPortal\(triggerButton,\s*placement\.sectionHeader/)
  assert.match(source, /position:\s*'relative'/)
  assert.match(source, /width:\s*'28px'/)
  assert.match(source, /height:\s*'28px'/)
  assert.doesNotMatch(source, /searchSlot/, 'native search must not be a wide positioning target')

  // Collapsed mode is fixed at the final centered position in the 56px rail.
  assert.match(source, /const\s+RAIL_WIDTH\s*=\s*56/)
  assert.match(source, /position:\s*'fixed'/)
  assert.match(source, /left:\s*railLeft\s*\+\s*\(RAIL_WIDTH\s*-\s*size\)\s*\/\s*2/)
  assert.match(source, /top:\s*searchRect\.bottom\s*\+/)
  assert.doesNotMatch(source, /searchRect\.left/, 'collapsed left must never follow transitional search x coordinates')

  // Rail entry has a dedicated opacity-only keyframe; layout and transforms never animate.
  assert.doesNotMatch(source, /transition:\s*all/)
  assert.match(source, /transition:\s*background-color[^\n]*color[^\n]*border-color[^\n]*box-shadow/)
  assert.match(source, /animation:\s*codex-sync-rail-fade-in\s+160ms/)
  const railKeyframes = source.slice(
    source.indexOf('@keyframes codex-sync-rail-fade-in'),
    source.indexOf('.codex-sync-trigger-rail:hover')
  )
  assert.match(railKeyframes, /from\s*\{\s*opacity:\s*0/)
  assert.match(railKeyframes, /to\s*\{\s*opacity:\s*1/)
  assert.doesNotMatch(railKeyframes, /\b(?:transform|left|top|width|height)\s*:/)

  // Wide and rail modes use distinct React keys so rail entry remounts and restarts the fade.
  assert.match(source, /key:\s*isWide\s*\?\s*'codex-sync-wide-trigger'\s*:\s*'codex-sync-rail-trigger'/)

  // Scoped collapsed rail detection without global [class*=root][class*=rail]
  assert.doesNotMatch(source, /\[class\*="root"\]\[class\*="rail"\]/)
  assert.match(source, /findRailSearchButton/)

  // Placement is locked once per collapse; no polling or transition-driven resize/scroll tracking.
  assert.match(source, /lockedRailPlacement/)
  assert.match(source, /startedCollapse/)
  assert.doesNotMatch(source, /setInterval\(/)
  assert.doesNotMatch(source, /ResizeObserver/)
  assert.doesNotMatch(source, /addEventListener\(['"]scroll['"]/)

  // Maid-atelier gold and hover styling matching native workspace icon buttons
  assert.match(source, /body\[data-dsh-maid-atelier\]/)
  assert.match(source, /#dfbf7c/)
  assert.match(source, /#fff1ce/)
  assert.match(source, /38px/)
  assert.match(source, /rgba\(225,\s*191,\s*124,\s*0?\.68\)/)
  assert.match(source, /rgba\(87,\s*117,\s*190,\s*0?\.28\)/)
})

test('client bundle: contains modal structure, tag layout, and picker settings', () => {
  const source = readFileSync(join(PROJECT, 'lib', 'client.js'), 'utf8')

  // Modal titles & structure
  assert.match(source, /settingsModalTitle:\s*'Codex 同步设置'/)
  assert.match(source, /settingsModalTitle:\s*'Codex Sync Settings'/)
  assert.match(source, /function SyncSettingsModal\(/)
  assert.match(source, /settingsDialog/)
  assert.match(source, /modalCloseBtn/)
  assert.match(source, /modalSection/)
  assert.match(source, /actionGrid/)
  assert.match(source, /actionCard/)
  assert.match(source, /settingsGroup/)
  assert.match(source, /modalTooltip/)

  // Picker dialog width min(640px, 95vw)
  assert.match(source, /width:\s*'min\(640px,\s*95vw\)'/)

  // Tag wrapping container & no-wrap styles
  assert.match(source, /tagsContainer/)
  assert.match(source, /display:\s*'inline-flex'/)
  assert.match(source, /paddingLeft:\s*'10px'/)
  assert.match(source, /whiteSpace:\s*'nowrap'/)

  // Project count with marginLeft: auto and flexShrink: 0
  assert.match(source, /projectCount:\s*\{[^}]*marginLeft:\s*'auto'/)
  assert.match(source, /projectCount:\s*\{[^}]*flexShrink:\s*0/)
})

test('client bundle: contains export labels, URL parameters, and selectable logic', () => {
  const source = readFileSync(join(PROJECT, 'lib', 'client.js'), 'utf8')

  // Menu action labels (bilingual)
  assert.match(source, /importNow:\s*'从 Codex 导入'/)
  assert.match(source, /importNow:\s*'Import from Codex'/)

  // Localized tags & tooltips
  assert.match(source, /DSH 已续聊/)
  assert.match(source, /Updated in DSH/)
  assert.match(source, /Codex · 未更新/)
  assert.match(source, /Codex · unchanged/)
  assert.match(source, /Codex · 源缺失/)
  assert.match(source, /Codex · source missing/)
  assert.match(source, /来自 Codex/)
  assert.match(source, /From Codex/)
  assert.match(source, /子代理/)
  assert.match(source, /Sub-agent/)

  // Export confirmation modal state & text with "无法" and final sentence
  assert.match(source, /confirmingExport/)
  assert.match(source, /confirmExportTitle/)
  assert.match(source, /confirmExportBody/)
  assert.match(source, /confirmExportBtn/)
  assert.match(source, /由于插件无法覆盖或追加原 Codex 对话/)
  assert.match(source, /无法与父会话合并/)
  assert.match(source, /导出的对话重启 Codex 可见。/)
  assert.match(source, /Confirm export/)
  assert.match(source, /cannot merge into parent sessions/)
  assert.match(source, /Exported conversations will be visible after restarting Codex/)

  // Post-export success hint is concise without "绝不会/never overwrites"
  assert.match(source, /exportHint:\s*'导出完成。对话重启 Codex 可见。'/)
  assert.match(source, /exportHint:\s*'Export complete\. Conversations will be visible after restarting Codex\.'/)
  assert.doesNotMatch(source, /绝不会/)
  assert.doesNotMatch(source, /never overwrites/)

  // Empty default selection (does not auto-select all selectable IDs on catalog load)
  assert.doesNotMatch(source, /collectSelectable\([^)]+\)\.forEach\(\(id\) => \{ next\[id\] = true \}\)/)
  assert.match(source, /validSelectable\.has\(id\)/)

  // Export catalog URL with includeCodex & includeSubagents
  assert.match(source, /\/dsh-codex-sync\/export-catalog\?includeCodex=/)
  assert.match(source, /includeSubagents=/)

  // Selectable rule
  assert.match(source, /dshUpdated === true/)
})

test('import picker: SSR keeps local/export and renders configured sources and mappings bilingually', (t) => {
  const reactDir = dshDep('react')
  const reactDomDir = dshDep('react-dom')
  if (!reactDir || !reactDomDir) return t.skip('react/react-dom unavailable')
  const React = require(join(reactDir, 'index.js'))
  const { renderToStaticMarkup } = require(join(reactDomDir, 'server.js'))
  const ui = loadImportTests(React, { fetch: () => { throw new Error('SSR must not fetch') } })
  for (const lang of ['en', 'zh']) {
    const render = (component, props) => renderToStaticMarkup(React.createElement(component, { lang, ...props }))
    const local = render(ui.ImportPicker, { onClose: () => {} })
    assert.match(local, /<select[^>]+disabled/)
    assert.match(local, /<option value="" selected="">(?:Local|本地)<\/option>/)
    assert.doesNotMatch(local, /type="password"|placeholder="(?:host|password)/i)
    const exported = render(ui.ImportPicker, { onClose: () => {}, mode: 'export' })
    assert.doesNotMatch(exported, /<select|SSH|Preview import|预览导入/)
    const selector = render(ui.ImportSourceSelect, { sources: [remoteSource], sourceId: remoteSource.id, onChange: () => {} })
    assert.match(selector, /Configured server \(SSH\)/)
    assert.match(selector, /value="server &amp;\/一" selected=""/)
    assert.match(render(ui.ImportDirectoryMapping, { original: '/srv/project', mapped: 'C:\\project' }), /\/srv\/project/)
    assert.match(render(ui.ImportDirectoryMapping, { original: '/srv/project', mapped: 'C:\\project' }), /C:\\project/)
    assert.match(render(ui.ImportDirectoryMapping, { original: '/srv/project', mapped: null }), lang === 'en' ? /not mapped; history only/ : /未映射；仅导入历史/)
    const drift = render(ui.ImportDirectoryMapping, { original: '/srv/project', mapped: 'C:\\saved', configured: 'D:\\configured', mappingChanged: true })
    assert.match(drift, lang === 'en' ? /Saved directory: C:\\saved/ : /已保存目录: C:\\saved/)
    assert.match(drift, lang === 'en' ? /Configured directory: D:\\configured/ : /当前配置目录: D:\\configured/)
    assert.match(drift, lang === 'en' ? /Selection is blocked/ : /已禁止选择/)
    assert.match(render(ui.ImportDirectoryMapping, { original: '/srv/project', mapped: null, configured: 'D:\\configured', mappingChanged: true }), lang === 'en' ? /Saved directory: not mapped; history only/ : /已保存目录: 未映射；仅导入历史/)
    assert.match(ui.labels(lang).remoteReadOnly, lang === 'en' ? /read-only.*NOT automatically run through SSH/ : /只读.*不会自动通过 SSH 执行/)
  }
})

test('import source helpers: only configured SSH options, encoded URL, exact preview identity', () => {
  const helpers = loadImportTests({ createElement: () => {} })
  assert.deepEqual(helpers.configuredImportSources({ sources: [remoteSource, remoteSource, { id: '', kind: 'ssh' }, { id: 'other', kind: 'local' }, null] }), [remoteSource])
  assert.equal(helpers.importCatalogUrl(false, true, false, remoteSource.id), '/dsh-codex-sync/catalog?includeSubagents=1&source=' + encodeURIComponent(remoteSource.id))
  assert.equal(helpers.importCatalogUrl(false, false, false, ''), '/dsh-codex-sync/catalog?includeSubagents=0')
  assert.equal(helpers.importCatalogUrl(true, false, true, remoteSource.id), '/dsh-codex-sync/export-catalog?includeCodex=1&includeSubagents=0')
  const key = helpers.importPreviewKey(remoteSource.id, ['two', 'one'], false, '')
  assert.equal(key, helpers.importPreviewKey(remoteSource.id, ['one', 'two'], false, ''))
  assert.notEqual(key, helpers.importPreviewKey('second', ['one', 'two'], false, ''))
  assert.notEqual(key, helpers.importPreviewKey(remoteSource.id, ['one', 'three'], false, ''))
  assert.notEqual(key, helpers.importPreviewKey(remoteSource.id, ['one', 'two'], true, ''))
  assert.notEqual(key, helpers.importPreviewKey(remoteSource.id, ['one', 'two'], false, 'filter'))
})

test('import picker: remote import requires successful exact preview and posts source, ids, filter, dryRun', async () => {
  const ui = await readyRemotePicker()
  assert.equal(ui.button('Import 1').props.disabled, true)
  const before = ui.requests.length
  ui.button('Import 1').props.onClick()
  await ui.flush()
  assert.equal(ui.requests.length, before, 'handler also enforces preview')
  ui.button('Preview import').props.onClick()
  await ui.flush()
  const previewRequest = ui.requests.at(-1)
  assert.deepEqual(JSON.parse(previewRequest.options.body), { source: remoteSource.id, ids: ['remote-one'], includeSubagents: false, dryRun: true })
  assert.equal(ui.button('Preview import').props.disabled, true)
  assert.equal(ui.source().props.disabled, true)
  assert.equal(ui.button('Cancel').props.disabled, true)
  previewRequest.resolve({ ok: true, text: 'Would import 1 history' })
  await ui.flush()
  assert.equal(ui.timers.length, 0, 'preview must not reload or show success completion')
  assert.equal(ui.button('Import 1').props.disabled, false)
  assert.ok(ui.nodes().some((node) => ui.text(node).includes('Would import 1 history')))
  ui.button('Import 1').props.onClick()
  await ui.flush()
  assert.deepEqual(JSON.parse(ui.requests.at(-1).options.body), { source: remoteSource.id, ids: ['remote-one'], includeSubagents: false, dryRun: false })
  ui.requests.at(-1).resolve({ ok: true, text: 'Imported 1' })
  await ui.flush()
  assert.equal(ui.timers.length, 1)
  assert.equal(ui.commands.length, 0)
  ui.unmount()
})

test('import picker: selection/search/subagent/source changes invalidate remote preview', async () => {
  const ui = await readyRemotePicker()
  const preview = async () => {
    ui.button('Preview import').props.onClick()
    await ui.flush()
    ui.requests.at(-1).resolve({ ok: true, text: 'Previewed' })
    await ui.flush()
    assert.equal(ui.button('Import 1').props.disabled, false)
  }
  await preview()
  ui.button('Select all').props.onClick()
  await ui.flush()
  ui.button('Select all').props.onClick()
  await ui.flush()
  assert.equal(ui.button('Import 1').props.disabled, true, 'same IDs selected again still need fresh preview')
  await preview()
  const search = () => ui.find((node) => node.type === 'input')
  search().props.onChange({ target: { value: 'remote' } })
  await ui.flush()
  search().props.onChange({ target: { value: '' } })
  await ui.flush()
  assert.equal(ui.button('Import 1').props.disabled, true, 'changing then restoring a search must invalidate preview')
  await preview()
  ui.button('Hide sub-agents').props.onClick()
  await ui.flush()
  assert.equal(ui.button('Import 0').props.disabled, true)
  assert.match(ui.requests.at(-1).url, /includeSubagents=1/)
  ui.requests.at(-1).resolve(remoteCatalog())
  await ui.flush()
  assert.equal(ui.button('Import 1').props.disabled, true)
  await preview()
  ui.source().props.onChange('second')
  await ui.flush()
  assert.equal(ui.button('Import 0').props.disabled, true)
  ui.requests.at(-1).resolve(remoteCatalog({ id: 'second', kind: 'ssh', label: 'Second' }))
  await ui.flush()
  assert.equal(ui.button('Import 0').props.disabled, true, 'source change clears selection')
  ui.unmount()
})

test('import picker: SSH failures never fall back to local command or retain preview approval', async () => {
  const ui = await readyRemotePicker()
  ui.button('Preview import').props.onClick()
  await ui.flush()
  ui.requests.at(-1).resolve({ error: 'ssh unavailable' }, false)
  await ui.flush()
  assert.equal(ui.commands.length, 0)
  assert.equal(ui.button('Import 1').props.disabled, true)
  ui.button('Preview import').props.onClick()
  await ui.flush()
  ui.requests.at(-1).resolve({ ok: true, text: 'Previewed' })
  await ui.flush()
  ui.button('Import 1').props.onClick()
  await ui.flush()
  ui.requests.at(-1).reject(new Error('SSH disconnected'))
  await ui.flush()
  assert.equal(ui.commands.length, 0)
  assert.equal(ui.button('Import 1').props.disabled, true)
  assert.ok(ui.nodes().some((node) => ui.text(node).includes('no local import fallback')))
  ui.unmount()
})

test('import picker: stale source, failed catalog, close and unmount responses are ignored and aborted', async () => {
  const ui = importPickerHarness()
  const localRequest = ui.requests.find((request) => request.url.includes('/catalog?'))
  ui.requests.find((request) => request.url.endsWith('/sources')).resolve({ sources: [remoteSource, { id: 'second', kind: 'ssh' }] })
  await ui.flush()
  ui.source().props.onChange(remoteSource.id)
  await ui.flush()
  const firstRemote = ui.requests.at(-1)
  assert.equal(localRequest.options.signal.aborted, true)
  ui.source().props.onChange('second')
  await ui.flush()
  const secondRemote = ui.requests.at(-1)
  assert.equal(firstRemote.options.signal.aborted, true)
  secondRemote.resolve(remoteCatalog({ id: 'second', label: 'Second', kind: 'ssh' }, ['second-session']))
  await ui.flush()
  firstRemote.resolve(remoteCatalog())
  localRequest.resolve({ error: 'stale failure' }, false)
  await ui.flush()
  ui.button('Select all').props.onClick()
  await ui.flush()
  ui.button('Preview import').props.onClick()
  await ui.flush()
  const pendingPreview = ui.requests.at(-1)
  assert.deepEqual(JSON.parse(pendingPreview.options.body).ids, ['second-session'])
  ui.unmount()
  assert.equal(pendingPreview.options.signal.aborted, true)
  pendingPreview.resolve({ ok: true, text: 'stale preview' })
  await ui.flush()
  assert.equal(ui.timers.length, 0)

  const closing = importPickerHarness()
  closing.button('Cancel').props.onClick()
  assert.equal(closing.closed, true)
  assert.ok(closing.requests.every((request) => request.options.signal.aborted))
  closing.requests.forEach((request) => request.resolve({ projects: [], sources: [] }))
  await closing.flush()
  closing.unmount()
})

test('import picker: mapping drift blocks affected selection and shows saved versus configured cwd', async () => {
  const helpers = loadImportTests({ createElement: () => {} })
  const blockedId = 'ssh-codex-4-home-rollout'
  const changed = { id: blockedId, title: 'Drifted session', sourceCwd: '/srv/project', cwd: 'C:\\saved', configuredCwd: 'D:\\configured', mappingChanged: true, imported: true, stale: true }
  assert.equal(helpers.isNodeSelectable(changed, false), false)
  assert.equal(helpers.isNodeSelectable({ ...changed, fromCodex: true, dshUpdated: true }, true), true, 'export rules remain unchanged')
  assert.deepEqual(helpers.collectSelectable([{ sessions: [changed, { id: 'safe', title: 'Safe' }] }]), ['safe'])
  const ui = importPickerHarness()
  ui.requests.find((request) => request.url.endsWith('/sources')).resolve({ sources: [remoteSource] })
  ui.requests.find((request) => request.url.includes('/catalog?')).resolve({ projects: [] })
  await ui.flush()
  ui.source().props.onChange(remoteSource.id)
  await ui.flush()
  const catalog = remoteCatalog()
  catalog.projects[0].mappedCwd = 'D:\\configured'
  catalog.projects[0].sessions = [changed]
  ui.requests.at(-1).resolve(catalog)
  await ui.flush()
  assert.equal(ui.button('Preview import').props.disabled, true)
  assert.ok(ui.nodes().some((node) => ui.text(node).includes('Mapping changed')))
  assert.equal(ui.nodes().some((node) => node.type?.name === 'ImportDirectoryMapping'), false, 'collapsed drift project must not present configured cwd as the actual mapping')
  ui.find((node) => node.type === 'span' && ui.text(node) === 'Remote project').props.onClick()
  await ui.flush()
  const mapping = ui.find((node) => node.type?.name === 'ImportDirectoryMapping')
  assert.equal(mapping.props.mapped, 'C:\\saved')
  assert.equal(mapping.props.configured, 'D:\\configured')
  assert.equal(mapping.props.mappingChanged, true)
  const row = ui.find((node) => node.type === 'div' && node.props.children.some?.((child) => child?.type === 'span' && ui.text(child) === 'Drifted session'))
  assert.equal(row.props.children[1].props.disabled, true)
  ui.button('Select all').props.onClick()
  await ui.flush()
  assert.equal(ui.button('Import 0').props.disabled, true)
  const before = ui.requests.length
  ui.button('Preview import').props.onClick()
  await ui.flush()
  assert.equal(ui.requests.length, before)
  ui.unmount()
})

test('import picker: rejects unconfigured source/catalog mismatch; local and export command fallbacks stay local', async () => {
  const ui = await readyRemotePicker()
  const before = ui.requests.length
  ui.source().props.onChange('unconfigured')
  await ui.flush()
  assert.equal(ui.requests.length, before)
  ui.source().props.onChange('second')
  await ui.flush()
  ui.requests.at(-1).resolve(remoteCatalog())
  await ui.flush()
  assert.ok(ui.nodes().some((node) => ui.text(node).includes('does not match')))
  assert.equal(ui.button('Import 0').props.disabled, true)
  ui.unmount()

  const local = importPickerHarness()
  local.requests.find((request) => request.url.endsWith('/sources')).resolve({ error: 'old host' }, false)
  local.requests.find((request) => request.url.includes('/catalog?')).resolve({ projects: [{ label: 'Local', cwd: 'C:\\local', sessions: [{ id: 'local-one', title: 'Local session' }] }] })
  await local.flush()
  local.button('Select all').props.onClick()
  await local.flush()
  assert.equal(local.button('Import 1').props.disabled, false)
  local.button('Import 1').props.onClick()
  await local.flush()
  assert.deepEqual(JSON.parse(local.requests.at(-1).options.body), { ids: ['local-one'], includeSubagents: false, dryRun: false })
  local.requests.at(-1).reject(new Error('HTTP unavailable'))
  await local.flush()
  assert.deepEqual(local.commands, ['/import-codex --ids local-one'])
  local.unmount()

  const exported = importPickerHarness({ mode: 'export' })
  assert.equal(exported.requests.length, 1, 'export must not fetch SSH sources')
  exported.requests[0].resolve({ projects: [{ label: 'Local', cwd: 'C:\\local', sessions: [{ id: 'dsh-one', title: 'DSH session' }] }] })
  await exported.flush()
  exported.button('Select all').props.onClick()
  await exported.flush()
  exported.button('Export 1').props.onClick()
  await exported.flush()
  exported.button('Confirm export').props.onClick()
  await exported.flush()
  exported.requests.at(-1).reject(new Error('HTTP unavailable'))
  await exported.flush()
  assert.deepEqual(exported.commands, ['/export-codex --ids dsh-one'])
  exported.unmount()
})
