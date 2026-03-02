// ═══════════════════════════════════════════════════════════════════════════
// MAINTENANCE CODE
// Updates check every 15 seconds
// ═══════════════════════════════════════════════════════════════════════════

const activeMaintenance = true


// Export for use in the application
if (typeof window !== 'undefined') {
    window.MAINTENANCE = activeMaintenance;
    console.log('[Maintenance Check] ✅ loaded:');
}
