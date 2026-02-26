// ═══════════════════════════════════════════════════════════════════════════
// LIVE ANNOUNCEMENTS - Edit this file to push announcements to all users
// Updates check every 15 seconds
// ═══════════════════════════════════════════════════════════════════════════

const LIVEANNOUNCEMENTS = {
    // Example format:
    // "announcement_id": "Your message here"
    
    // ACTIVE ANNOUNCEMENTS:
    "maint_2025_02_26": "⚠️ System maintenance scheduled for tonight at 11 PM EST. Expect 15 minutes of downtime."
};

// Export for use in the application
if (typeof window !== 'undefined') {
    window.LIVEANNOUNCEMENTS = LIVEANNOUNCEMENTS;
    console.log('[ANNOUNCEMENTS] ✅ Live announcements loaded:', Object.keys(LIVEANNOUNCEMENTS).length, 'active');
}
