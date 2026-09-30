# Agent Note: Workbench preferences in General settings

Status: implemented

The integrated sidebar engine returns its preference store, feature registry and revision-protected API to DSH App. It no longer registers the predecessor's Side card settings section or navigation icon. DSH App contributes owned rows to the released `settings.general.item` root slot after composer preferences and before the version row; the original General section, transport and appearance controls retain their owners.

The owned settings use the live tab/viewer declarations and preserve top-level toggles, plugin-owned fields, custom render callbacks and title-bar compatibility preferences. Writes serialize against the latest preference snapshot and revision, adopting canonical replies into the workbench store. External settings events refresh the same values; disposal prevents queued work or late replies from updating an unmounted owner. Failed custom extension rendering remains contained within its settings row.

The UI groups ordinary behavior into compact rows and feature preferences into expandable sections. Shell compatibility and mobile-specific fields stay in Advanced. The predecessor's brand and version cards do not appear in product settings; source versions and licensing remain in provenance documentation. Focused checks cover the owned settings UI, feature controls, concurrent edits, revision conflicts, external changes and cleanup.
