/** Build the local startup document; backend output is inserted only through textContent. */
export function startupPage(whale) {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'">
  <title>DSH</title>
  <style>
    :root { color-scheme: light; font-family: "Segoe UI", "Microsoft YaHei", sans-serif; color: #242735; background: #f7f8fc; }
    * { box-sizing: border-box; }
    body { margin: 0; height: 100vh; padding: 40px 48px; display: flex; align-items: center; justify-content: center; }
    main { width: min(1120px, 100%); height: min(760px, 100%); display: flex; flex-direction: column; gap: 25px; }
    .brand { display: flex; align-items: center; gap: 13px; font-size: 21px; font-weight: 650; letter-spacing: .2px; }
    .brand img { width: 44px; height: 44px; object-fit: contain; }
    .intro { display: flex; align-items: center; justify-content: space-between; gap: 28px; }
    h1 { display: flex; align-items: center; gap: 12px; margin: 0 0 10px; font-size: 26px; font-weight: 650; letter-spacing: -.4px; }
    .indicator { width: 17px; height: 17px; border: 2px solid #dbe1ff; border-top-color: #4d6bfe; border-radius: 50%; animation: spin 1s linear infinite; }
    body[data-phase="error"] .indicator, body[data-phase="stopped"] .indicator { animation: none; border: 0; background: #d76b50; width: 10px; height: 10px; margin: 0 4px; }
    #message { margin: 0; color: #707789; font-size: 14px; line-height: 1.6; }
    #elapsed { flex-shrink: 0; color: #707789; font-size: 13px; font-variant-numeric: tabular-nums; }
    .console { flex: 1; min-height: 160px; display: flex; flex-direction: column; overflow: hidden; border: 1px solid #283146; border-radius: 13px; background: #10151f; box-shadow: 0 9px 24px #1d294012; }
    .toolbar { display: flex; align-items: center; justify-content: space-between; gap: 20px; padding: 13px 18px; background: #192130; border-bottom: 1px solid #293245; }
    .console-label { display: flex; align-items: center; gap: 10px; color: #e2e8f4; font-size: 13px; font-weight: 550; }
    .console-label svg { width: 17px; height: 17px; color: #8796b3; }
    .actions { display: flex; gap: 8px; }
    button { cursor: pointer; font: inherit; font-size: 12px; border: 1px solid #3a455b; border-radius: 6px; color: #d6deec; background: transparent; padding: 6px 11px; }
    button:hover { color: #fff; background: #27334a; }
    button:focus-visible { outline: 2px solid #8296ff; outline-offset: 3px; }
    button:disabled { cursor: default; opacity: .5; }
    #terminal { flex: 1; min-height: 0; overflow: auto; padding: 17px 18px; scrollbar-color: #42506a #10151f; }
    #lines, #empty { margin: 0; font: 12px/1.85 "Cascadia Mono", Consolas, "Microsoft YaHei", monospace; color: #cbd5e5; }
    #empty { color: #718099; }
    .line { display: grid; grid-template-columns: 67px 64px minmax(0, 1fr); gap: 11px; }
    .time { color: #65758e; user-select: none; font-variant-numeric: tabular-nums; }
    .stream { color: #7c91b7; user-select: none; }
    .content { white-space: pre-wrap; overflow-wrap: anywhere; }
    .stderr .stream { color: #e3b66c; }
    .system .stream, .system .content { color: #97aaff; }
    .error .stream, .error .content { color: #ffa497; }
    .console-footer { display: flex; align-items: center; justify-content: space-between; gap: 20px; padding: 10px 18px; border-top: 1px solid #232c3d; color: #8291aa; font-size: 11px; }
    .live { display: flex; align-items: center; gap: 7px; }
    .live::before { content: ''; width: 5px; height: 5px; background: #8da2ff; border-radius: 50%; }
    footer { display: flex; align-items: center; justify-content: space-between; gap: 20px; min-height: 37px; }
    #hint { font-size: 12px; color: #858c9b; margin: 0; }
    #restart { background: #4d6bfe; border: 0; color: white; padding: 10px 24px; font-size: 13px; font-weight: 600; border-radius: 8px; }
    #restart:hover { background: #3f5be0; }
    #recover { color: #525d75; border-color: #c8cedc; font-size: 13px; padding: 9px 18px; border-radius: 8px; }
    #recover:hover { background: #e9ecf5; }
    [hidden] { display: none !important; }
    @keyframes spin { to { transform: rotate(360deg); } }
    @media (prefers-reduced-motion: reduce) { .indicator { animation: none; } }
  </style>
</head>
<body data-phase="loading">
  <main>
    <div class="brand"><img src="data:image/png;base64,${whale}" alt=""><span>DSH</span></div>
    <div class="intro">
      <div><h1><span class="indicator" aria-hidden="true"></span><span id="title"></span></h1><p id="message" role="status"></p></div>
      <span id="elapsed"></span>
    </div>
    <section class="console" aria-labelledby="log-title">
      <div class="toolbar">
        <div class="console-label"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="m4 5 4 5-4 5m7 0h5"/></svg><span id="log-title"></span></div>
        <div class="actions"><button id="follow" type="button"></button><button id="copy" type="button" disabled></button></div>
      </div>
      <div id="terminal" tabindex="0"><p id="empty"></p><div id="lines" role="log" aria-live="off"></div></div>
      <div class="console-footer"><span class="live" id="live"></span><span id="count"></span></div>
    </section>
    <footer><p id="hint"></p><div class="actions"><button id="recover" type="button" hidden>恢复更新前版本</button><button id="restart" type="button" hidden></button></div></footer>
  </main>
  <script>
    const copy = {
      title: '正在启动 DSH', error: '启动失败', stopped: '共享服务已停止',
      loading: '正在加载插件与会话…', logTitle: '后端启动日志',
      elapsed: '已用时', seconds: '秒', waiting: '等待后端输出…', live: '实时输出', retained: '日志已保留',
      pause: '暂停滚动', follow: '继续滚动', copy: '复制日志', copied: '已复制', copyFailed: '复制失败，请重试',
      lines: '行', omitted: '较早的日志已省略', restart: '重新启动', restarting: '正在重新启动…',
      hint: '服务就绪后将自动进入 DSH', failedHint: '可复制日志排查问题，或重新启动。',
    }
    const get = id => document.getElementById(id)
    const terminal = get('terminal')
    const lines = get('lines')
    let state
    let revision = -1
    let run = -1
    let lastId = 0
    let following = true
    let retrying = false
    get('title').textContent = copy.title
    get('message').textContent = copy.loading
    get('log-title').textContent = copy.logTitle
    get('empty').textContent = copy.waiting
    get('copy').textContent = copy.copy
    get('hint').textContent = copy.hint
    get('restart').textContent = copy.restart
    const updateFollow = () => { get('follow').textContent = following ? copy.pause : copy.follow }
    const scrollToEnd = () => { terminal.scrollTop = terminal.scrollHeight }
    function elapsed() {
      if (state) get('elapsed').textContent = copy.elapsed + ' ' + (Math.max(0, (state.finishedAt ?? Date.now()) - state.startedAt) / 1000).toFixed(1) + ' ' + copy.seconds
    }
    function render(next) {
      if (next.revision < revision) return
      revision = next.revision
      state = next
      if (run !== next.run) {
        run = next.run
        lastId = 0
        lines.replaceChildren()
        following = true
      }
      const firstId = next.entries[0]?.id ?? Infinity
      while (lines.firstChild && Number(lines.firstChild.dataset.id) < firstId) lines.firstChild.remove()
      const fragment = document.createDocumentFragment()
      for (const entry of next.entries) {
        if (entry.id <= lastId) continue
        const row = document.createElement('div')
        row.className = 'line ' + entry.stream
        row.dataset.id = entry.id
        for (const [className, value] of [['time', (entry.elapsed / 1000).toFixed(3)], ['stream', entry.stream], ['content', entry.text]]) {
          const span = document.createElement('span')
          span.className = className
          span.textContent = value
          row.append(span)
        }
        fragment.append(row)
        lastId = entry.id
      }
      lines.append(fragment)
      get('empty').hidden = next.entries.length > 0
      get('copy').disabled = next.entries.length === 0
      get('count').textContent = next.entries.length + ' ' + copy.lines + (next.omitted ? ' · ' + copy.omitted : '')
      document.body.dataset.phase = next.phase
      get('title').textContent = next.phase === 'loading' ? copy.title : copy[next.phase]
      get('message').textContent = next.message || copy.loading
      get('live').textContent = next.phase === 'loading' ? copy.live : copy.retained
      get('hint').textContent = next.phase === 'loading' ? copy.hint : copy.failedHint
      get('restart').hidden = next.phase === 'loading'
      get('restart').disabled = retrying
      get('recover').hidden = next.phase === 'loading' || !next.recoveryAvailable
      get('recover').disabled = retrying
      updateFollow()
      elapsed()
      if (following) scrollToEnd()
    }
    terminal.addEventListener('scroll', () => {
      following = terminal.scrollHeight - terminal.clientHeight - terminal.scrollTop < 24
      updateFollow()
    })
    get('follow').addEventListener('click', () => {
      following = !following
      updateFollow()
      if (following) scrollToEnd()
    })
    get('copy').addEventListener('click', async () => {
      try {
        await window.dshDesktop.copyStartupLog()
        get('copy').textContent = copy.copied
      } catch { get('copy').textContent = copy.copyFailed }
      setTimeout(() => { get('copy').textContent = copy.copy }, 1800)
    })
    async function restart(recover = false) {
      retrying = true
      get('restart').disabled = true
      get('recover').disabled = true
      get('restart').textContent = copy.restarting
      try { await (recover ? window.dshDesktop.recoverPluginUpdate() : window.dshDesktop.restart()) }
      catch (error) { get('message').textContent = String(error.message || error) }
      finally {
        retrying = false
        get('restart').disabled = false
        get('recover').disabled = false
        get('restart').textContent = copy.restart
      }
    }
    get('restart').addEventListener('click', () => restart())
    get('recover').addEventListener('click', () => restart(true))
    updateFollow()
    const unsubscribe = window.dshDesktop.onStartupState(render)
    window.dshDesktop.startupState().then(render).catch(error => { get('message').textContent = String(error.message || error) })
    const timer = setInterval(elapsed, 100)
    window.addEventListener('pagehide', () => { clearInterval(timer); unsubscribe() }, { once: true })
  </script>
</body>
</html>`
}
