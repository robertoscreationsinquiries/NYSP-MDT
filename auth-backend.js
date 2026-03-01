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
        department: "EGPD",
        password: "MySecurePassword123",  // ← SET A SECURE PASSWORD
        banned: false,
        bannedReason: "Sharing access to unauthorized users."
    },

    "Alp_hah": {
        robloxUsername: "Alp_hah",
        patrolZone: "00",
        firstName: "Travis",
        lastName: "Norman",
        badgeId: "00601",
        department: "NYSP",
        password: "F::|hA26Jt/6",
        banned: false,
        bannedReason: ""
    },
    
    "kingitegg": {
        robloxUsername: "kingitegg",
        patrolZone: "0S",
        firstName: "Hayden",
        lastName: "Chen",
        badgeId: "00302",
        department: "NYSP",
        password: "gumball",
        banned: false,
        bannedReason: ""
    },

    "ransomperspective": {
        robloxUsername: "ransomperspective",
        patrolZone: "00",
        firstName: "Kenny",
        lastName: "Thompson",
        badgeId: "00503",
        department: "EGPD",
        password: "ayy5fords",
        banned: false,
        bannedReason: ""
    },

    "Leonardothey": {
        robloxUsername: "Leonardothey",
        patrolZone: "00",
        firstName: "Mark",
        lastName: "Daniel",
        badgeId: "00604",
        department: "EGPD",
        password: "142919",
        banned: false,
        bannedReason: ""
    },

    "Plsqeoi": {
        robloxUsername: "Plsqeoi",
        patrolZone: "00",
        firstName: "Elijah",
        lastName: "Russo",
        badgeId: "00705",
        department: "EGPD",
        password: "ORCRCAD07005EGPD",
        banned: false,
        bannedReason: ""
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

    "KilonovaMT": {
        robloxUsername: "KilonovaMT",
        patrolZone: "0G",
        firstName: "Lawerence",
        lastName: "DeWolf",
        badgeId: "00611",
        department: "NYSP",
        password: "GoORCRNYSP",
        banned: false,
        bannedReason: ""
    },

    "d_vrango": {
        robloxUsername: "d_vrango",
        patrolZone: "00",
        firstName: "Jake",
        lastName: "Lawrence",
        badgeId: "00703",
        department: "EGPD",
        password: "orcrcad2025",
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
