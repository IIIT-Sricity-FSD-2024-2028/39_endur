/**
 * ENDUR Central API Client
 * All backend calls go through here — reads session role automatically.
 */
import { API_BASE } from './config.js';

/**
 * Make an authenticated API request.
 * @param {'GET'|'POST'|'PATCH'|'DELETE'} method
 * @param {string} path - e.g. '/users' or '/auth/login'
 * @param {object|null} body - Request body (for POST/PATCH)
 * @param {string|null} roleOverride - Override role header (uses session role by default)
 */
export async function api(method, path, body = null, roleOverride = null) {
    const session = getSession();
    const role = roleOverride || session?.role || '';

    const headers = {
        'Content-Type': 'application/json',
        'X-Role': role,
        'X-User-Id': session?.id || '',
        'X-User-Name': session?.name || '',
    };

    const options = { method, headers };
    if (body && method !== 'GET') {
        options.body = JSON.stringify(body);
    }

    const res = await fetch(`${API_BASE}${path}`, options);

    if (!res.ok) {
        const err = await res.json().catch(() => ({ message: res.statusText }));
        let msg = err.message || 'Request failed';
        if (Array.isArray(msg)) {
            msg = msg.slice(0, 2).join(', ') + (msg.length > 2 ? ` (and ${msg.length - 2} more errors)` : '');
        } else if (typeof msg === 'string' && msg.split(',').length > 5) {
            const parts = msg.split(',');
            msg = parts.slice(0, 2).join(',') + ` (and ${parts.length - 2} more errors)`;
        } else if (typeof msg === 'string' && msg.length > 150) {
            msg = msg.substring(0, 150) + '...';
        }
        throw new ApiError(msg, res.status, err);
    }

    // 204 No Content
    if (res.status === 204) return null;
    return res.json();
}

// ─── Convenience Wrappers ─────────────────────────────────────────────────────

export const GET    = (path, role) => api('GET',    path, null, role);
export const POST   = (path, body, role) => api('POST',   path, body, role);
export const PATCH  = (path, body, role) => api('PATCH',  path, body, role);
export const DELETE = (path, role) => api('DELETE', path, null, role);

// ─── Error Class ─────────────────────────────────────────────────────────────

export class ApiError extends Error {
    constructor(message, status, data) {
        super(message);
        this.status = status;
        this.data = data;
    }
}

// ─── Session Helpers ──────────────────────────────────────────────────────────

export function getSession() {
    try { return JSON.parse(localStorage.getItem('endurSession')); }
    catch { return null; }
}

export function setSession(user) {
    localStorage.setItem('endurSession', JSON.stringify(user));
}

export async function refreshSession() {
    try {
        const user = await GET('/users/profile/me');
        if (user) setSession(user);
        return user;
    } catch (e) {
        console.error('Failed to refresh session:', e);
        return getSession();
    }
}

export function clearSession() {
    localStorage.removeItem('endurSession');
}
