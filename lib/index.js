/**
 * Host side is a no-op: everything this plugin does happens in the browser.
 * The export exists so the bundle has a well-formed Node half.
 */
export const name = 'dsh-sidebar-view-density'

export function apply() {
  // nothing to do on the host
}
