// ═══════════════════════════════════════════════════════════════════════════
// LIVE ANNOUNCEMENTS - Edit this file to push announcements to all users
// Updates check every 15 seconds
// ═══════════════════════════════════════════════════════════════════════════

const LIVEANNOUNCEMENTS = {
    // Example format:
    // "announcement_id": "Your message here"
    
    // ACTIVE ANNOUNCEMENTS:
    "maint_2025_02_26_0000001": "System maintenance scheduled at 11PM GMT+1 time. Expect 15 minutes of downtime to migrate all data."
};

// Export for use in the application
if (typeof window !== 'undefined') {
    window.LIVEANNOUNCEMENTS = LIVEANNOUNCEMENTS;
    console.log('[ANNOUNCEMENTS] ✅ Live announcements loaded:', Object.keys(LIVEANNOUNCEMENTS).length, 'active');
}
