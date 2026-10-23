/**
 * This plugin is client-only. DSH still loads this no-op Cordis entry for the
 * `insert` row in cordis.patch.yml, which is what makes the browser half known
 * to the loader.
 */
export const name = 'markdown-viewer'

export function apply(): void {}
