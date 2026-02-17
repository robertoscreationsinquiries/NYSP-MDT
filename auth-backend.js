const AUTHORIZED_USERS = {
    "testuser": {
        robloxUsername: "testuser",
        patrolZone: "patrolzone",
        firstName: "firsttroopername",
        lastName: "lasttroopername",
        badgeId: "000000",
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
        password: "secure123",
        banned: false,
        bannedReason: ""
    }
};

// Export for use in index.html
if (typeof window !== 'undefined') {
    window.AUTHORIZED_USERS = AUTHORIZED_USERS;
}
