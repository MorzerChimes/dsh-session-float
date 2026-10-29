/** Minimal Cordis Context surface used by this plugin (provided by the Web shell at runtime). */
export interface Context {
  effect(execute: () => () => void, label?: string): void
}
