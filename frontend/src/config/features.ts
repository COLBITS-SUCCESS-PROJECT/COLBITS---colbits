/** Feature flags — all false until the story enters the active sprint. */
export const FEATURES = {
  REALTIME_UPDATES: false,
  ALERT_SOUNDS: false,
  EXPORT_PDF: false,
  DARK_MODE: false,
  /** SCRUM-115: Inactive devices tab with sample data, until the backend lists inactive devices. */
  INACTIVE_DEVICES_SAMPLE_DATA: false,
} as const
