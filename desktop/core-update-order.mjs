/** A slow network response may only publish for the runtime it inspected. */
export function isCurrentCoreUpdateCheck(startRevision, startVersion, currentRevision, currentVersion, updatingCore) {
  return !updatingCore && startRevision === currentRevision && startVersion === currentVersion
}
