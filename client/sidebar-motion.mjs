/** Keep the right workbench integrated with the Codex shell without taking over
 * native tabs, focus, fullscreen or floating-window ownership. The idle summary
 * floats over the full conversation canvas; only the message and composer
 * content consume its inset. Native widths remain available for pane resizing.
 */
export default function createSidebarMotionClient() {
  function install(ctx) {
    if (typeof document === 'undefined') return
    ctx.effect(() => {
      const view = document.defaultView
      if (!view?.MutationObserver || !view.requestAnimationFrame) return () => {}
      const html = document.documentElement
      const flags = ['data-dsh-app-panel-resizing']
      const previousFlags = new Map(flags.map(name => [name, html.getAttribute(name)]))
      const panels = new Map()
      const shellSelector = '[data-dsh-app-frame], [data-shell-overlay], [data-sidebar-right-panel]'
      const contentSelector = '[data-sidebar-right-guide], [data-dsh-app-summary], [data-dockkit-content], [data-dockkit-host]'
      let frame, frameObserver, previousFrame
      let queued, resizeFirst, resizeSecond, modeTimer
      let resizing = false, disposed = false
      const restoreAttribute = (element, name, value) => {
        if (value === null) element.removeAttribute(name)
        else element.setAttribute(name, value)
      }
      const mark = (element, name, active) => {
        if (active) { if (!element.hasAttribute(name)) element.setAttribute(name, '') }
        else if (element.hasAttribute(name)) element.removeAttribute(name)
      }
      const relevantNodes = (records, selector) => records.some(record => record.type === 'attributes' || [...record.addedNodes, ...record.removedNodes].some(node => node.nodeType === 1 && (node.matches(selector) || node.querySelector(selector))))
      const schedule = () => {
        if (!disposed && queued === undefined) queued = view.requestAnimationFrame(() => { queued = undefined; sync() })
      }
      const restoreFrame = () => {
        if (!frame || !previousFrame) return
        frameObserver?.disconnect()
        if (previousFrame.tracks) frame.style.setProperty('--dsh-app-overlay-tracks', previousFrame.tracks, previousFrame.priority)
        else frame.style.removeProperty('--dsh-app-overlay-tracks')
        if (previousFrame.inset) frame.style.setProperty('--dsh-app-chat-inset', previousFrame.inset, previousFrame.insetPriority)
        else frame.style.removeProperty('--dsh-app-chat-inset')
        restoreAttribute(frame, 'data-dsh-app-right-summary', previousFrame.summary)
        restoreAttribute(frame, 'data-dsh-app-right-overlay', previousFrame.overlay)
        restoreAttribute(frame, 'data-dsh-app-right-mode-changing', previousFrame.changing)
        previousFrame = undefined
        if (modeTimer !== undefined) { view.clearTimeout(modeTimer); modeTimer = undefined }
      }
      const sync = () => {
        if (disposed) return
        const nextFrame = document.querySelector('[data-dsh-app-frame]') ?? document.querySelector('[data-shell-overlay]')?.parentElement
        if (nextFrame !== frame) {
          restoreFrame()
          frame = nextFrame
          if (frame) {
            previousFrame = {
              tracks: frame.style.getPropertyValue('--dsh-app-overlay-tracks'), priority: frame.style.getPropertyPriority('--dsh-app-overlay-tracks'),
              inset: frame.style.getPropertyValue('--dsh-app-chat-inset'), insetPriority: frame.style.getPropertyPriority('--dsh-app-chat-inset'),
              summary: frame.getAttribute('data-dsh-app-right-summary'), overlay: frame.getAttribute('data-dsh-app-right-overlay'), changing: frame.getAttribute('data-dsh-app-right-mode-changing'), initialized: false,
            }
            frameObserver = new view.MutationObserver(schedule)
            frameObserver.observe(frame, { attributes: true, attributeFilter: ['data-rightbar-instant', 'data-dragging', 'data-dsh-app-frame', 'style'] })
          }
        }
        const active = html.hasAttribute('data-dsh-app-ui')
        const instant = active && (frame?.hasAttribute('data-rightbar-instant') || frame?.hasAttribute('data-dragging'))
        mark(html, 'data-dsh-app-panel-resizing', active && resizing)
        for (const [panel, entry] of panels) if (!active || !panel.isConnected) {
          entry.observer.disconnect(); restoreAttribute(panel, 'data-dsh-app-panel-summary', entry.summary); panels.delete(panel)
        }
        let summaryOpen = false, overlay = false, inset = 0
        if (active) for (const panel of document.querySelectorAll('[data-sidebar-right-panel]')) {
          if (!panels.has(panel)) {
            const observer = new view.MutationObserver(records => {
              // Native pane sizing lives on the panel itself. Syntax spans,
              // editor cursors and floating windows also stream style changes.
              const layoutRecords = records.filter(record => record.type !== 'attributes' || record.attributeName !== 'style' || record.target === panel)
              if (relevantNodes(layoutRecords, contentSelector)) schedule()
            })
            panels.set(panel, { observer, summary: panel.getAttribute('data-dsh-app-panel-summary') })
            observer.observe(panel, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-sidebar-right-open', 'data-sidebar-right-panel', 'hidden', 'style'] })
          }
          const hosts = [...panel.querySelectorAll('[data-dockkit-host="dock"]:not([hidden])')]
          const summary = hosts.length > 0 && hosts.every(host => host.querySelector('[data-sidebar-right-guide], [data-dsh-app-summary]'))
          mark(panel, 'data-dsh-app-panel-summary', summary)
          if (!panel.closest('[hidden]')) {
            overlay = true
            if (panel.hasAttribute('data-sidebar-right-open') && panel.getAttribute('data-sidebar-right-panel') !== 'fullscreen') {
              summaryOpen ||= summary
              const width = panel.getBoundingClientRect().width || Number.parseFloat(view.getComputedStyle(panel).width) || 0
              inset = Math.max(inset, Math.round(width * 100) / 100 + 32)
            }
          }
        }
        if (!frame || !previousFrame) return
        if (!active) {
          if (previousFrame.tracks) frame.style.setProperty('--dsh-app-overlay-tracks', previousFrame.tracks, previousFrame.priority)
          else frame.style.removeProperty('--dsh-app-overlay-tracks')
          if (previousFrame.inset) frame.style.setProperty('--dsh-app-chat-inset', previousFrame.inset, previousFrame.insetPriority)
          else frame.style.removeProperty('--dsh-app-chat-inset')
          restoreAttribute(frame, 'data-dsh-app-right-summary', previousFrame.summary)
          restoreAttribute(frame, 'data-dsh-app-right-overlay', previousFrame.overlay)
          restoreAttribute(frame, 'data-dsh-app-right-mode-changing', previousFrame.changing)
          if (modeTimer !== undefined) { view.clearTimeout(modeTimer); modeTimer = undefined }
          previousFrame.initialized = false
          return
        }
        const nextInset = `${inset}px`
        const changed = frame.hasAttribute('data-dsh-app-right-summary') !== summaryOpen || frame.style.getPropertyValue('--dsh-app-chat-inset') !== nextInset
        if (changed && previousFrame.initialized && !instant && !resizing) {
          frame.setAttribute('data-dsh-app-right-mode-changing', '')
          if (modeTimer !== undefined) view.clearTimeout(modeTimer)
          modeTimer = view.setTimeout(() => { modeTimer = undefined; if (!disposed) frame?.removeAttribute('data-dsh-app-right-mode-changing') }, 220)
        }
        previousFrame.initialized = true
        mark(frame, 'data-dsh-app-right-summary', summaryOpen)
        mark(frame, 'data-dsh-app-right-overlay', overlay)
        const left = frame.style.gridTemplateColumns.match(/^([^\s]+)\s+/)?.[1] ?? '0px'
        const tracks = `${left} minmax(0px, 1fr) minmax(0px, 0px)`
        if (frame.style.getPropertyValue('--dsh-app-overlay-tracks') !== tracks) frame.style.setProperty('--dsh-app-overlay-tracks', tracks)
        if (frame.style.getPropertyValue('--dsh-app-chat-inset') !== nextInset) frame.style.setProperty('--dsh-app-chat-inset', nextInset)
      }
      const onResize = () => {
        resizing = true; mark(html, 'data-dsh-app-panel-resizing', html.hasAttribute('data-dsh-app-ui')); sync()
        if (resizeFirst !== undefined) view.cancelAnimationFrame(resizeFirst)
        if (resizeSecond !== undefined) view.cancelAnimationFrame(resizeSecond)
        resizeFirst = view.requestAnimationFrame(() => {
          resizeFirst = undefined
          resizeSecond = view.requestAnimationFrame(() => { resizeSecond = undefined; resizing = false; sync() })
        })
      }
      const discovery = new view.MutationObserver(records => {
        if (records.some(record => record.type === 'attributes' && record.target.matches('[data-sidebar-right-session]')) || relevantNodes(records.filter(record => record.type === 'childList'), shellSelector)) schedule()
      })
      discovery.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden'] })
      const uiObserver = new view.MutationObserver(schedule)
      uiObserver.observe(html, { attributes: true, attributeFilter: ['data-dsh-app-ui'] })
      view.addEventListener('resize', onResize)
      view.visualViewport?.addEventListener('resize', onResize)
      sync()
      return () => {
        disposed = true
        discovery.disconnect(); uiObserver.disconnect(); restoreFrame()
        view.removeEventListener('resize', onResize); view.visualViewport?.removeEventListener('resize', onResize)
        for (const id of [queued, resizeFirst, resizeSecond]) if (id !== undefined) view.cancelAnimationFrame(id)
        for (const [panel, entry] of panels) { entry.observer.disconnect(); restoreAttribute(panel, 'data-dsh-app-panel-summary', entry.summary) }
        panels.clear()
        for (const [name, value] of previousFlags) restoreAttribute(html, name, value)
      }
    }, 'dsh-app: integrated right sidebar motion')
  }
  return { install }
}
