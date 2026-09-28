import { setTimeout as delay } from 'node:timers/promises'

const FATAL_RENDER = /Minified React error|Element type is invalid|slot entry crashed|Invalid hook call|gateway\/definition-unavailable|Rendered (?:more|fewer) hooks|Cannot read properties of (?:undefined|null) \(reading '(?:createElement|useState|useEffect)'\)|web boot:.*(?:[1-9]\d* entr(?:y|ies) did not activate|failed|error)/i

// Check the application root only: the native title bar or a loading page cannot satisfy readiness.
const PROBE = `(() => {
  const root = document.querySelector('#root')
  const visible = element => { const box = element.getBoundingClientRect(); const style = getComputedStyle(element); return box.width > 0 && box.height > 0 && style.visibility !== 'hidden' && style.display !== 'none' }
  const text = root?.innerText.trim() || ''
  const controls = root ? [...root.querySelectorAll('button, input, textarea, [role="button"], [contenteditable="true"], a[href]')].filter(visible).length : 0
  return { origin: location.origin, ready: !!root && visible(root) && text.length >= 40 && controls >= 2,
    overlay: !!document.querySelector('vite-error-overlay, nextjs-portal'), textLength: text.length, controls }
})()`

/** Identify renderer errors that prevent the DSH application tree from mounting. */
export function isFatalRendererMessage(message) {
  return typeof message === 'string' && FATAL_RENDER.test(message)
}

/** Read the DSH application root without waiting for the full update stability window. */
export async function inspectRenderer(contents, timeout = 3000) {
  let timer
  try {
    return await Promise.race([
      contents.executeJavaScript(PROBE),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('DSH 前端检查超时。')), timeout) }),
    ])
  } finally { clearTimeout(timer) }
}

/** Observe before navigation, then require a responsive, stable application render before committing an update. */
export function observeRendererHealth(contents) {
  let failure
  const onConsole = (...args) => {
    const details = args.find(value => value && typeof value.message === 'string')
    const message = details?.message ?? args[2]
    if (isFatalRendererMessage(message)) failure = '新版前端发生组件或核心接口错误，已取消更新。'
  }
  const onGone = () => { failure = '新版前端进程意外退出，已取消更新。' }
  contents.on('console-message', onConsole)
  contents.on('render-process-gone', onGone)
  return {
    dispose() {
      contents.removeListener('console-message', onConsole)
      contents.removeListener('render-process-gone', onGone)
    },
    async verify(origin, { timeout = 20000, stable = 1500, poll = 200 } = {}) {
      const deadline = Date.now() + timeout
      let readySince
      while (Date.now() < deadline) {
        if (failure) throw new Error(failure)
        if (contents.isDestroyed()) throw new Error('新版前端窗口已关闭。')
        let timer
        let state
        try {
          state = await Promise.race([
            contents.executeJavaScript(PROBE),
            new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('新版前端无响应，已取消更新。')), Math.min(3000, Math.max(1, deadline - Date.now()))) }),
          ])
        } finally { clearTimeout(timer) }
        if (failure) throw new Error(failure)
        if (state.overlay) throw new Error('新版前端显示错误页面，已取消更新。')
        if (state.origin === origin && state.ready) {
          readySince ??= Date.now()
          if (Date.now() - readySince >= stable) return state
        } else readySince = undefined
        await delay(poll)
      }
      throw new Error('新版前端未能完成渲染，已取消更新。')
    },
  }
}
