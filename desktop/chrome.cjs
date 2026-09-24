const HEIGHT = 38

const labels = {
  zh: {
    back: '返回上一个任务', forward: '前进到下一个任务', search: '搜索会话', more: '更多桌面操作',
    new: '新建任务', sidebar: '切换侧边栏', settings: 'DSH 设置', web: '在浏览器打开',
    restart: '重启共享服务', reload: '刷新界面', full: '切换全屏', devtools: '开发者工具',
    quit: '退出 DSH App', plugins: '插件', experts: '专家', skills: '技能', connector: '连接器',
    schedule: '定时任务', im: 'IM 助理', prev: '上一个任务', next: '下一个任务',
    zoomIn: '放大', zoomOut: '缩小', zoomReset: '实际大小', about: '关于 DSH',
    coreUpdate: '更新 DSH', coreUpdateBusy: '正在处理更新…',
  },
  en: {
    back: 'Back to previous task', forward: 'Forward to next task', search: 'Search sessions', more: 'More desktop actions',
    new: 'New task', sidebar: 'Toggle sidebar', settings: 'DSH settings', web: 'Open in browser',
    restart: 'Restart shared service', reload: 'Refresh view', full: 'Toggle full screen', devtools: 'Developer tools',
    quit: 'Quit DSH App', plugins: 'Plugins', experts: 'Experts', skills: 'Skills', connector: 'Connectors',
    schedule: 'Scheduled tasks', im: 'IM assistant', prev: 'Previous task', next: 'Next task',
    zoomIn: 'Zoom in', zoomOut: 'Zoom out', zoomReset: 'Actual size', about: 'About DSH',
    coreUpdate: 'Update DSH', coreUpdateBusy: 'Processing update…',
  },
}

const icons = {
  back: '<path d="m14 5-7 7 7 7"/><path d="M7 12h14"/>',
  forward: '<path d="m10 5 7 7-7 7"/><path d="M17 12H3"/>',
  search: '<circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 4.4 4.4"/>',
  more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
  new: '<path d="M12 5v14M5 12h14"/>',
  coreUpdate: '<path d="M12 3v12m0 0-4-4m4 4 4-4"/><path d="M4 17v3h16v-3"/>',
}

const style = `
html[data-dsh-desktop-chrome] #root { height: calc(100vh - ${HEIGHT}px) !important; margin-top: ${HEIGHT}px !important; }
html[data-dsh-desktop-chrome] body:has(.dcu-settings-page) .dcu-settings-page { top: ${HEIGHT}px !important; }
#dsh-desktop-chrome {
  --dsh-chrome-side: #f3fbfb; --dsh-chrome-main: #fff; --dsh-chrome-text: #253039;
  --dsh-chrome-muted: #69747c; --dsh-chrome-hover: #e8eff0; --dsh-chrome-width: 240px;
  --dsh-chrome-border: rgba(0, 0, 0, .12); --dsh-chrome-border-width: 1px;
  position: fixed; inset: 0 0 auto; height: ${HEIGHT}px; z-index: 2147483647;
  display: grid; grid-template-columns: var(--dsh-chrome-width) minmax(0, 1fr);
  color: var(--dsh-chrome-text); font: 12px/1.2 "Segoe UI", "Microsoft YaHei UI", system-ui, sans-serif;
  user-select: none; -webkit-app-region: drag;
}
#dsh-desktop-chrome * { box-sizing: border-box; }
#dsh-desktop-chrome button { -webkit-app-region: no-drag; border: 0; color: inherit; font: inherit; cursor: pointer; }
#dsh-desktop-chrome .dsh-chrome-left, #dsh-desktop-chrome .dsh-chrome-main {
  display: flex; align-items: center; min-width: 0; height: ${HEIGHT}px;
}
#dsh-desktop-chrome .dsh-chrome-left { gap: 3px; padding: 0 7px; background: var(--dsh-chrome-side); border-right: var(--dsh-chrome-border-width) solid var(--dsh-chrome-border); }
#dsh-desktop-chrome[data-compact="true"] .dsh-chrome-left { justify-content: center; padding: 0; }
#dsh-desktop-chrome[data-compact="true"] .dsh-chrome-left button:not([data-action="more"]),
#dsh-desktop-chrome[data-compact="true"] .dsh-chrome-divider { display: none; }
#dsh-desktop-chrome .dsh-chrome-main { gap: 8px; padding: 0 146px 0 14px; background: var(--dsh-chrome-main); }
#dsh-desktop-chrome .dsh-chrome-icon { width: 29px; height: 29px; flex: none; border-radius: 7px; display: grid; place-items: center; background: transparent; }
#dsh-desktop-chrome .dsh-chrome-icon:hover:not(:disabled), #dsh-desktop-chrome .dsh-chrome-icon[aria-expanded="true"] { background: var(--dsh-chrome-hover); }
#dsh-desktop-chrome .dsh-chrome-icon:disabled { opacity: .34; cursor: default; }
#dsh-desktop-chrome .dsh-chrome-icon svg { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 1.65; stroke-linecap: round; stroke-linejoin: round; }
#dsh-desktop-chrome .dsh-chrome-divider { height: 16px; width: 1px; margin: 0 4px; background: var(--dsh-chrome-muted); opacity: .25; }
#dsh-desktop-chrome .dsh-chrome-title { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--dsh-chrome-muted); }
#dsh-desktop-chrome .dsh-chrome-spacer { flex: 1; }
#dsh-desktop-chrome .dsh-chrome-update { display: flex; align-items: center; gap: 5px; flex: none; min-height: 26px; padding: 0 9px; border-radius: 6px; background: #e7efff; color: #315cba; font-weight: 600; }
#dsh-desktop-chrome .dsh-chrome-update:hover:not(:disabled) { background: #d9e6ff; }
#dsh-desktop-chrome .dsh-chrome-update:disabled { opacity: .65; cursor: default; }
#dsh-desktop-chrome .dsh-chrome-update[hidden] { display: none; }
#dsh-desktop-chrome .dsh-chrome-update svg { width: 14px; height: 14px; fill: none; stroke: currentColor; stroke-width: 1.7; stroke-linecap: round; stroke-linejoin: round; }
#dsh-desktop-chrome .dsh-chrome-menu {
  position: fixed; top: 35px; left: var(--dsh-chrome-menu-left, 108px); width: 244px; max-height: min(650px, calc(100vh - 46px)); overflow: auto;
  padding: 6px; border-radius: 10px; background: var(--dsh-chrome-main); color: var(--dsh-chrome-text);
  box-shadow: 0 8px 30px #0002, 0 0 0 1px #0002; -webkit-app-region: no-drag;
}
#dsh-desktop-chrome .dsh-chrome-menu[hidden] { display: none; }
#dsh-desktop-chrome .dsh-chrome-menu button { width: 100%; min-height: 29px; display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 5px 9px; border-radius: 6px; background: transparent; text-align: left; }
#dsh-desktop-chrome .dsh-chrome-menu button:hover, #dsh-desktop-chrome .dsh-chrome-menu button:focus-visible { background: var(--dsh-chrome-hover); }
#dsh-desktop-chrome .dsh-chrome-menu small { color: var(--dsh-chrome-muted); white-space: nowrap; }
#dsh-desktop-chrome .dsh-chrome-rule { height: 1px; margin: 5px 4px; background: var(--dsh-chrome-muted); opacity: .17; }
#dsh-desktop-chrome button:focus-visible { outline: 2px solid #4c79da; outline-offset: 1px; }
html[data-dsh-desktop-theme="dark"] #dsh-desktop-chrome {
  --dsh-chrome-side: #1f2221; --dsh-chrome-main: #191919; --dsh-chrome-text: #dce0df;
  --dsh-chrome-muted: #9aa2a0; --dsh-chrome-hover: #303634; --dsh-chrome-border: #404040;
}
html[data-dsh-desktop-theme="dark"] #dsh-desktop-chrome .dsh-chrome-update { background: #25395e; color: #b9d0ff; }
html[data-dsh-desktop-theme="dark"] #dsh-desktop-chrome .dsh-chrome-update:hover:not(:disabled) { background: #2e4877; }
@media (prefers-reduced-motion: no-preference) { #dsh-desktop-chrome .dsh-chrome-icon { transition: background .12s ease; } }
`

const groups = [
  [['new', 'Ctrl+N'], ['search', 'Ctrl+F'], ['sidebar', 'Ctrl+B'], ['back', 'Ctrl+['], ['forward', 'Ctrl+]'], ['prev', 'Ctrl+Shift+['], ['next', 'Ctrl+Shift+]']],
  [['plugins'], ['experts'], ['skills'], ['connector'], ['schedule'], ['im'], ['settings']],
  [['web', 'Ctrl+Shift+B'], ['reload', 'Ctrl+R'], ['restart'], ['zoomIn', 'Ctrl++'], ['zoomOut', 'Ctrl+-'], ['zoomReset', 'Ctrl+0'], ['full', 'F11'], ['devtools', 'F12']],
  [['about'], ['quit', 'Ctrl+Q']],
]

function mountDesktopChrome(ipcRenderer) {
  if (location.protocol !== 'http:' || location.hostname !== '127.0.0.1') return
  if (document.getElementById('dsh-desktop-chrome')) return

  document.documentElement.dataset.dshDesktopChrome = 'true'
  const sheet = document.createElement('style')
  sheet.textContent = style
  document.head.append(sheet)

  const bar = document.createElement('header')
  bar.id = 'dsh-desktop-chrome'
  bar.setAttribute('aria-label', 'DSH Desktop')
  const left = document.createElement('div')
  left.className = 'dsh-chrome-left'
  const main = document.createElement('div')
  main.className = 'dsh-chrome-main'
  bar.append(left, main)
  document.body.append(bar)

  const locale = () => document.documentElement.lang.toLowerCase().startsWith('en') ? labels.en : labels.zh
  const button = (id, icon, host) => {
    const element = document.createElement('button')
    element.type = 'button'
    element.className = 'dsh-chrome-icon'
    element.dataset.action = id
    element.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${icons[icon]}</svg>`
    element.title = element.ariaLabel = locale()[id]
    host.append(element)
    return element
  }
  const back = button('back', 'back', left)
  const forward = button('forward', 'forward', left)
  const divider = document.createElement('span')
  divider.className = 'dsh-chrome-divider'
  left.append(divider)
  button('search', 'search', left)
  const more = button('more', 'more', left)
  more.setAttribute('aria-haspopup', 'menu')
  more.setAttribute('aria-expanded', 'false')
  const title = document.createElement('span')
  title.className = 'dsh-chrome-title'
  main.append(title)
  const spacer = document.createElement('span')
  spacer.className = 'dsh-chrome-spacer'
  main.append(spacer)
  const coreUpdate = document.createElement('button')
  coreUpdate.type = 'button'
  coreUpdate.className = 'dsh-chrome-update'
  coreUpdate.dataset.action = 'coreUpdate'
  coreUpdate.hidden = true
  coreUpdate.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${icons.coreUpdate}</svg><span></span>`
  main.append(coreUpdate)

  let coreUpdateVersion = ''
  let coreUpdateBusy = false
  let coreUpdateRevision = -1
  const renderCoreUpdate = () => {
    const text = locale()
    const version = coreUpdateVersion.replace(/^v/i, '')
    const label = version ? (text === labels.en ? `Update DSH to v${version}` : `更新 DSH 至 v${version}`) : text.coreUpdate
    coreUpdate.disabled = coreUpdateBusy
    coreUpdate.querySelector('span').textContent = coreUpdateBusy ? text.coreUpdateBusy : label
    coreUpdate.title = coreUpdate.ariaLabel = coreUpdate.querySelector('span').textContent
  }
  const acceptCoreUpdateState = state => {
    if (!Number.isSafeInteger(state?.revision) || state.revision < coreUpdateRevision) return
    coreUpdateRevision = state.revision
    coreUpdateVersion = state?.phase === 'available' && typeof state.version === 'string' ? state.version : ''
    coreUpdate.hidden = state?.phase !== 'available'
    renderCoreUpdate()
  }
  ipcRenderer.on('dsh:core-update-state', (_event, state) => acceptCoreUpdateState(state))
  void ipcRenderer.invoke('dsh:core-update-state').then(acceptCoreUpdateState).catch(error => {
    console.error('DSH update state failed:', error)
  })

  const menu = document.createElement('div')
  menu.className = 'dsh-chrome-menu'
  menu.setAttribute('role', 'menu')
  menu.hidden = true
  bar.append(menu)
  const menuButtons = new Map()
  groups.forEach((group, index) => {
    if (index > 0) {
      const rule = document.createElement('div')
      rule.className = 'dsh-chrome-rule'
      rule.setAttribute('role', 'separator')
      menu.append(rule)
    }
    group.forEach(([id, shortcut]) => {
      const item = document.createElement('button')
      item.type = 'button'
      item.setAttribute('role', 'menuitem')
      item.dataset.action = id
      const name = document.createElement('span')
      const hint = document.createElement('small')
      hint.textContent = shortcut ?? ''
      item.append(name, hint)
      menu.append(item)
      menuButtons.set(id, name)
    })
  })

  let history = []
  let index = -1
  const rowFor = id => [...document.querySelectorAll('.dcu-wb-session[data-dcu-session]')]
    .find(row => row.dataset.dcuSession === id && row.getBoundingClientRect().height > 0)
  const selected = () => [...document.querySelectorAll('.dcu-wb-session[aria-selected="true"][data-dcu-session]')]
    .find(row => row.getBoundingClientRect().height > 0)
  const updateNavigation = () => {
    const current = selected()?.dataset.dcuSession
    if (current && history[index] !== current) {
      history = history.slice(0, index + 1)
      history.push(current)
      if (history.length > 100) history = history.slice(-100)
      index = history.length - 1
    }
    back.disabled = index <= 0
    forward.disabled = index < 0 || index >= history.length - 1
    const heading = document.title.replace(/\s*[—-]\s*DeepSeek Harness$/, '').trim()
    title.textContent = heading && heading !== 'DeepSeek Harness' ? heading : 'DeepSeek Harness'
  }
  const visible = element => element.getBoundingClientRect().width > 0 && element.getBoundingClientRect().height > 0
  const clickMatching = patterns => {
    const candidates = [...document.querySelectorAll('button,[role="button"],[role="menuitem"]')]
      .filter(element => !bar.contains(element) && visible(element))
    const target = candidates.find(element => patterns.some(pattern => pattern.test(`${element.getAttribute('aria-label') ?? ''} ${element.textContent ?? ''}`.trim())))
    target?.click()
    return !!target
  }
  const chooseSession = offset => {
    const rows = [...document.querySelectorAll('.dcu-wb-session[data-dcu-session]')].filter(visible)
    const current = selected()
    const next = rows[rows.indexOf(current) + offset]
    next?.click()
    setTimeout(updateNavigation, 100)
  }
  const openHistory = offset => {
    const next = index + offset
    const row = rowFor(history[next])
    if (!row) return
    index = next
    row.click()
    setTimeout(updateNavigation, 100)
  }
  const privileged = id => void ipcRenderer.invoke('dsh:desktop-action', id).catch(error => console.error('DSH desktop action failed:', error))
  const run = id => {
    if (id === 'more') { menu.hidden = !menu.hidden; more.setAttribute('aria-expanded', String(!menu.hidden)); if (!menu.hidden) menu.querySelector('button')?.focus(); return }
    menu.hidden = true
    more.setAttribute('aria-expanded', 'false')
    if (id === 'back') openHistory(-1)
    else if (id === 'forward') openHistory(1)
    else if (id === 'prev') chooseSession(-1)
    else if (id === 'next') chooseSession(1)
    else if (id === 'new') clickMatching([/^新建任务$|^new task$/i, /^新聊天$|^new chat$/i])
    else if (id === 'sidebar') clickMatching([/收缩侧边栏|展开侧边栏|收起侧边栏|toggle sidebar|collapse sidebar|expand sidebar/i])
    else if (id === 'search') {
      if (clickMatching([/搜索会话|search sessions/i])) setTimeout(() => {
        const input = document.querySelector('input[placeholder*="搜索会话"],input[placeholder*="Search sessions"]')
        input?.focus()
        input?.select()
      }, 100)
    } else if (id === 'settings') clickMatching([/^设置$|^settings$/i])
    else if (id === 'plugins') clickMatching([/^插件$|^plugins$/i])
    else if (id === 'experts') clickMatching([/^专家$|^experts$/i])
    else if (id === 'skills') clickMatching([/^技能$|^skills$/i])
    else if (id === 'connector') clickMatching([/^连接器$|^connectors$/i])
    else if (id === 'schedule') clickMatching([/^定时任务$|^scheduled tasks$/i])
    else if (id === 'im') clickMatching([/^IM助理$|^IM assistant$/i])
    else if (id === 'coreUpdate') {
      if (coreUpdate.hidden || coreUpdateBusy) return
      coreUpdateBusy = true
      renderCoreUpdate()
      void ipcRenderer.invoke('dsh:core-update-action').catch(error => console.error('DSH update action failed:', error))
        .finally(() => { coreUpdateBusy = false; renderCoreUpdate() })
    } else privileged(id)
  }
  bar.addEventListener('click', event => {
    const target = event.target.closest('button[data-action]')
    if (target && bar.contains(target)) run(target.dataset.action)
  })
  // The settings portal isolates body siblings. Keep the desktop frame accessible above it.
  document.addEventListener('focusin', event => {
    if (bar.contains(event.target)) event.stopImmediatePropagation()
  }, true)
  document.addEventListener('pointerdown', event => {
    if (!menu.hidden && !bar.contains(event.target)) { menu.hidden = true; more.setAttribute('aria-expanded', 'false') }
  }, true)
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !menu.hidden) { event.preventDefault(); menu.hidden = true; more.setAttribute('aria-expanded', 'false'); more.focus(); return }
    if (event.altKey || event.metaKey || !event.ctrlKey) {
      if (event.key === 'F11') { event.preventDefault(); run('full') }
      else if (event.key === 'F12') { event.preventDefault(); run('devtools') }
      return
    }
    const key = event.key.toLowerCase()
    const action = event.shiftKey
      ? ({ '[': 'prev', ']': 'next', b: 'web' })[key]
      : ({ n: 'new', b: 'sidebar', f: 'search', '[': 'back', ']': 'forward', q: 'quit', '0': 'zoomReset', '-': 'zoomOut', '=': 'zoomIn', '+': 'zoomIn' })[key]
    if (!action) return
    event.preventDefault()
    event.stopImmediatePropagation()
    run(action)
  }, true)

  const updateLocale = () => {
    const text = locale()
    for (const element of bar.querySelectorAll('button[data-action]')) element.title = element.ariaLabel = text[element.dataset.action]
    for (const [id, element] of menuButtons) element.textContent = text[id]
    renderCoreUpdate()
  }
  let sidebarObserved
  let lastScheme
  const sidebarResize = new ResizeObserver(() => syncAppearance())
  const syncAppearance = () => {
    const frame = document.querySelector('[data-shell-overlay]')?.parentElement
    const sidebar = document.querySelector('.dcu-settings-page .dcu-settings-nav') ?? frame?.firstElementChild
    if (sidebar && sidebar !== sidebarObserved) {
      sidebarResize.disconnect()
      sidebarResize.observe(sidebar)
      sidebarObserved = sidebar
    }
    if (sidebar) {
      const width = Math.round(sidebar.getBoundingClientRect().width)
      bar.style.setProperty('--dsh-chrome-width', `${width}px`)
      bar.style.setProperty('--dsh-chrome-menu-left', `${width < 170 ? 8 : 108}px`)
      bar.dataset.compact = String(width < 170)
      const sidebarStyle = getComputedStyle(sidebar)
      if (parseFloat(sidebarStyle.borderRightWidth) > 0) {
        bar.style.setProperty('--dsh-chrome-border', sidebarStyle.borderRightColor)
        bar.style.setProperty('--dsh-chrome-border-width', sidebarStyle.borderRightWidth)
      }
    }
    const scheme = getComputedStyle(document.documentElement).colorScheme.includes('dark') ? 'dark' : 'light'
    document.documentElement.dataset.dshDesktopTheme = scheme
    const aside = sidebar?.querySelector('.dcu-root') ?? sidebar
    const color = aside && getComputedStyle(aside).backgroundColor
    if (color && color !== 'rgba(0, 0, 0, 0)') bar.style.setProperty('--dsh-chrome-side', color)
    if (scheme !== lastScheme) { lastScheme = scheme; ipcRenderer.send('dsh:desktop-theme', scheme) }
  }
  let syncQueued = false
  const scheduleSync = () => {
    if (syncQueued) return
    syncQueued = true
    requestAnimationFrame(() => { syncQueued = false; updateNavigation(); syncAppearance() })
  }
  new MutationObserver(scheduleSync).observe(document.getElementById('root') ?? document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['aria-selected'] })
  const restoreChromeAccess = () => {
    scheduleSync()
    if (!document.querySelector('.dcu-settings-page')) return
    if (bar.inert) bar.inert = false
    if (bar.hasAttribute('data-dcu-settings-isolated')) bar.removeAttribute('data-dcu-settings-isolated')
  }
  new MutationObserver(restoreChromeAccess).observe(document.body, {
    childList: true, subtree: false, attributes: true,
    attributeFilter: ['inert', 'data-dcu-settings-isolated'],
  })
  new MutationObserver(restoreChromeAccess).observe(bar, {
    attributes: true, attributeFilter: ['inert', 'data-dcu-settings-isolated'],
  })
  new MutationObserver(() => { updateLocale(); scheduleSync() }).observe(document.documentElement, { attributes: true, attributeFilter: ['lang', 'class', 'style', 'data-theme'] })
  document.addEventListener('click', () => setTimeout(scheduleSync, 60), true)
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', scheduleSync)
  updateLocale()
  scheduleSync()
}

if (document.readyState === 'loading') window.addEventListener('DOMContentLoaded', () => mountDesktopChrome(ipcRenderer), { once: true })
else mountDesktopChrome(ipcRenderer)
