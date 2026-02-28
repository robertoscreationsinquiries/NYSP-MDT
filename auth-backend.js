// ═══════════════════════════════════════════════════════════════════════════
//  NYSP MDT — AUTHENTICATION BACKEND
//  This file contains the authorized user database
// ═══════════════════════════════════════════════════════════════════════════

const AUTHORIZED_USERS = {
    // Example user 1
    "testuser": {
        robloxUsername: "testuser",
        patrolZone: "patrolzone",
        firstName: "firsttroopername",
        lastName: "lasttroopername",
        badgeId: "000000",
        department: "NYSP",
        password: "testhere",
        banned: false,
        bannedReason: ""
    },

    "DAREALROBZ": {
        robloxUsername: "DAREALROBZ",
        patrolZone: "0G",
        firstName: "Robert",
        lastName: "Mendoza",
        badgeId: "00706",
        department: "NYSP",
        password: "MySecurePassword123",  // ← SET A SECURE PASSWORD
        banned: true,
        bannedReason: "Sharing access to unauthorized users."
    },

    "vectra_rb": {
        robloxUsername: "VECTRA_RB",
        patrolZone: "0G",
        firstName: "Victor",
        lastName: "Mendoza",
        badgeId: "00201",
        department: "NYSP",
        password: "Bajojajo575",
        banned: false,
        bannedReason: ""
    },

    "JellyBirds80": {
        robloxUsername: "JellyBirds80",
        patrolZone: "00",
        firstName: "Jackson",
        lastName: "West",
        badgeId: "00101",
        department: "EGPD",
        password: "JBORCR",
        banned: false,
        bannedReason: ""
    },

    "ProBBLOKA": {
        robloxUsername: "ProBBLOKA",
        patrolZone: "0S",
        firstName: "Oscar",
        lastName: "Bateson",
        badgeId: "00506",
        department: "NYSP",
        password: "00506",
        banned: false,
        bannedReason: ""
    },

    "Pigscheme12345": {
        robloxUsername: "PIGSCHEME12345",
        patrolZone: "0G",
        firstName: "Tim",
        lastName: "Bradford",
        badgeId: "00404",
        department: "NYSP",
        password: "Raf88",  // ← SET A SECURE PASSWORD
        banned: false,
        bannedReason: ""
    },

    "ProBBLOKA": {
        robloxUsername: "ProBBLOKA",
        patrolZone: "0G",
        firstName: "Tim",
        lastName: "Bradford",
        badgeId: "00404",
        department: "NYSP",
        password: "PRO4040GBATESON",  // ← SET A SECURE PASSWORD
        banned: false,
        bannedReason: ""
    },
    
    // Example banned user
    "banneduser": {
        robloxUsername: "banneduser",
        patrolZone: "1A",
        firstName: "John",
        lastName: "Doe",
        badgeId: "99999",
        department: "NYSP",
        password: "password",
        banned: true,
        bannedReason: "You have been banned from the NYSP app for violating department policy."
    },
    
    // Add more users here following the same pattern
    // "username": {
    //     robloxUsername: "username",
    //     patrolZone: "XX",
    //     firstName: "FirstName",
    //     lastName: "LastName",
    //     badgeId: "XXXXX",
    //     password: "password",
    //     banned: false,
    //     bannedReason: ""
    // },
};

// Export for use in the application
if (typeof window !== 'undefined') {
    window.AUTHORIZED_USERS = AUTHORIZED_USERS;
    console.log('[AUTH] ✅ User database loaded:', Object.keys(AUTHORIZED_USERS).length, 'users');
}
