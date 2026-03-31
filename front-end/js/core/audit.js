import { getSession } from './session.js';

/**
 * Logs a system action to localStorage for audit purposes.
 * @param {string} action - CREATE, UPDATE, DELETE, APPROVE, LOGIN, etc.
 * @param {string} module - The feature area (e.g., "Settings", "Feedback", "Profile")
 * @param {string} details - Human-readable details
 */
export function logAction(action, module, details) {
    const user = getSession();
    if (!user) return;

    const logs = JSON.parse(localStorage.getItem("systemLogs")) || [];
    
    const newEntry = {
        timestamp: new Date().toISOString(),
        actor: user.id || user.email,
        actorName: user.name,
        actorRole: user.role,
        action: action.toUpperCase(),
        module: module,
        details: details
    };

    logs.unshift(newEntry);
    
    // Keep internal limit of 500 logs locally
    localStorage.setItem("systemLogs", JSON.stringify(logs.slice(0, 500)));
    
    console.log(`[AUDIT] ${newEntry.action} in ${newEntry.module}: ${newEntry.details}`);
}
