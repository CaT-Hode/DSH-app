/** Project the owned sidebar's preferences from its parent plugin settings row.
 * @param descriptor DSH settings descriptor for the DSH App row, if registered.
 * @returns Descriptor whose value and user fields contain only sidebar preferences.
 */
export function sidebarDescriptor(descriptor) {
  if (descriptor === undefined) return undefined
  return { ...descriptor, value: descriptor.value?.sidebar, user: descriptor.user?.sidebar }
}

/** Update sidebar preferences through the owning DSH App form and its revision.
 * @param settings Official SettingsForms service.
 * @param namespace Parent plugin's Loader entry id.
 * @param patch Sidebar preference fields to change.
 * @param expectedRevision Optional revision from the caller's prior read.
 * @returns Official update completion; unrelated DSH App settings stay untouched.
 */
export function updateSidebarPrefs(settings, namespace, patch, expectedRevision) {
  const descriptor = settings.describe().find(row => row.ns === namespace)
  const existing = descriptor?.value?.sidebar ?? {}
  return settings.update(namespace, { sidebar: { ...existing, ...patch } }, expectedRevision)
}
