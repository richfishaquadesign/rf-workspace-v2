/** Compatibility for an already-installed Apps Script trigger after retirement.
 * No AI calls, email scanning, stock changes, or payroll updates are performed.
 * The old trigger can be removed in Apps Script after deployment.
 */
function rfEnterpriseHeartbeatHandler() {
  return { success: true, retired: true };
}
