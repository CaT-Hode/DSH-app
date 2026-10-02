import assert from 'node:assert/strict'
import test from 'node:test'
import { installRailNestedSettings } from '../client/rail-nested-settings.mjs'

test('native nested plugin settings retain injection, avoid duplicate pages, follow unloading and restore core tabs', () => {
  const ledger = new Map([['settings.plugins.tab', []], ['settings.section', []]])
  const subscriptions = new Map()
  const notify = key => { for (const fn of subscriptions.get(key) ?? []) fn() }
  const slots = {
    entriesOfSlot: key => ledger.get(key) ?? [],
    subscribe: (key, fn) => { const set = subscriptions.get(key) ?? new Set(); subscriptions.set(key, set); set.add(fn); return () => set.delete(fn) },
    register: (options, component) => {
      const entry = { options, component, registrant: options.registrant, inject: options.inject, locale: options.locale, store: options.store }
      ledger.get(options.name).push(entry); notify(options.name)
      return () => { ledger.set(options.name, ledger.get(options.name).filter(value => value !== entry)); notify(options.name) }
    },
  }
  const nativeCore = props => props.useTabs(rows => rows)
  const core = { options: { id: 'plugins' }, registrant: 'mf', component: nativeCore }
  ledger.get('settings.section').push(core)
  const component = () => 'Original form', inject = () => ({ credentials: 'native authority' })
  const external = { options: { id: 'gallery', label: () => '图像生成' }, registrant: 'different-package/client', component, inject, store: { native: true }, locale: 'gallery' }
  const official = { options: { id: 'all' }, registrant: 'mf', component: () => 'core' }
  ledger.set('settings.plugins.tab', [official, external])
  const dispose = installRailNestedSettings({ slots }, { useMemo: fn => fn() })
  const alias = ledger.get('settings.section').find(entry => entry.options.id === 'dsh-app-extension-tab:gallery')
  assert.equal(alias.component, component)
  assert.equal(alias.inject, inject)
  assert.equal(alias.store, external.store)
  assert.equal(alias.registrant, external.registrant)
  const rows = [{ id: 'all' }, { id: 'gallery' }]
  assert.deepEqual(core.component({ useTabs: selector => selector(rows) }), [{ id: 'all' }])
  notify('settings.plugins.tab')
  assert.equal(ledger.get('settings.section').length, 2, 'repeated updates do not duplicate the alias')
  const nativeSection = { options: { id: 'own-settings' }, registrant: external.registrant, component }
  ledger.get('settings.section').push(nativeSection); notify('settings.section')
  assert.equal(ledger.get('settings.section').length, 2, 'a native page for the same form takes precedence')
  ledger.set('settings.section', [core]); notify('settings.section')
  assert.equal(ledger.get('settings.section').length, 2, 'removing the native page restores the nested entry')
  ledger.set('settings.plugins.tab', [official]); notify('settings.plugins.tab')
  assert.equal(ledger.get('settings.section').length, 1, 'unloading removes the promoted page')
  dispose()
  assert.equal(core.component, nativeCore)
  assert.equal([...subscriptions.values()].reduce((sum, set) => sum + set.size, 0), 0)
})
