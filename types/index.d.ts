/** One rate-limit window as the band shows it. */
export type UsagePulseWindow = { percent: number; resetsAt?: string }

/** What the band draws: the last reading of `$.session.usage()`. */
export type UsagePulseSnapshot = {
  fiveHour?: UsagePulseWindow
  sevenDay?: UsagePulseWindow
  /** True when the last refresh failed and these figures are older. */
  isStale?: boolean
}

declare module 'claude-code' {
  interface PluginState {
    'usage-pulse': { snapshot: UsagePulseSnapshot | null }
  }
}
