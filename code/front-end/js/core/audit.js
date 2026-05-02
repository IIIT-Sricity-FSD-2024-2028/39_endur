import { POST } from './api.js';
import { getSession } from './session.js';

/**
 * Logs a system action to the backend audit-logs endpoint.
 * @param {string} action - CREATE, UPDATE, DELETE, APPROVE, LOGIN, etc.
 * @param {string} module - The feature area (e.g., "Settings", "Feedback", "Profile")
 * @param {string} details - Human-readable details
 */
export function logAction(action, module, details) {
    const user = getSession();
    if (!user) return;

    const entry = {
        actor: user.id || user.email,
        actorName: user.name,
        actorRole: user.role,
        action: action.toUpperCase(),
        module: module,
        target: module,
        details: details
    };

    // Fire-and-forget POST to backend; don't block callers
    POST('/audit-logs', entry).catch(() => {
        console.warn(`[AUDIT] Failed to persist: ${entry.action} in ${entry.module}`);
    });

    console.log(`[AUDIT] ${entry.action} in ${entry.module}: ${entry.details}`);
}
