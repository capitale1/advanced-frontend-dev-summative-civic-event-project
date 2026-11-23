/**
 * auth.js — the app's global "auth context".
 *
 * Holds the JWT and the signed-in user { id, full_name, email, role }.
 *
 * Storage rules:
 *  - "Keep me signed in" unchecked -> sessionStorage (cleared when the tab closes).
 *  - "Keep me signed in" checked   -> localStorage (survives restarts).
 *    Trade-off: anything in localStorage can be read by any script running on the
 *    page, so an XSS bug would expose the token. We reduce that risk by escaping
 *    all API data before inserting it into the DOM (see UI.esc).
 *
 * ---------------------------------------------------------------------------
 * ROLE-BASED ACCESS GUARDS (client side)
 * ---------------------------------------------------------------------------
 * Search the codebase for "ROLE GUARD" to find every place access is restricted.
 *  1. Page guards:  Auth.requireAuth() / Auth.requireAdmin() run first on each page.
 *  2. Element guards: data-requires="admin" | "user" attributes, applied by
 *     Auth.applyRoleVisibility(), hide controls the current role can't use.
 *  3. Render guards: page scripts check Auth.isAdmin() before building
 *     admin-only buttons (Edit / Delete / Publish) into the HTML at all.
 * These are for UX only. Real security is enforced by the backend's
 * authenticate + authorize(['admin']) middleware, which returns 401/403.
 * ---------------------------------------------------------------------------
 */
const Auth = (function () {
  const { TOKEN_KEY, USER_KEY } = CONFIG;
  let expiryTimer = null;

  // Whichever storage currently holds the session
  function activeStore() {
    return localStorage.getItem(TOKEN_KEY) ? localStorage : sessionStorage;
  }

  function save(token, user, remember) {
    clear();
    const store = remember ? localStorage : sessionStorage;
    store.setItem(TOKEN_KEY, token);
    store.setItem(USER_KEY, JSON.stringify(user));
  }

  function clear() {
    [localStorage, sessionStorage].forEach(function (s) {
      s.removeItem(TOKEN_KEY);
      s.removeItem(USER_KEY);
    });
  }

  function getToken() {
    return localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY);
  }

  function getUser() {
    try { return JSON.parse(activeStore().getItem(USER_KEY)); } catch (e) { return null; }
  }

  // Merge changes into the stored user (e.g. after a profile update)
  function updateUser(patch) {
    const user = Object.assign({}, getUser(), patch);
    activeStore().setItem(USER_KEY, JSON.stringify(user));
    return user;
  }

  // Read the JWT payload ({ id, role, exp }) without verifying it.
  // Verification is the backend's job; we only use exp to sign out on time.
  function decode(token) {
    try {
      const part = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      return JSON.parse(atob(part));
    } catch (e) { return null; }
  }

  function isExpired(token) {
    const payload = decode(token);
    if (!payload || !payload.exp) return true;
    return Date.now() >= payload.exp * 1000;
  }

  function isLoggedIn() {
    const token = getToken();
    return !!token && !isExpired(token);
  }

  // ROLE GUARD: single source of truth for "is this user an admin?" in the UI.
  function isAdmin() {
    const user = getUser();
    return isLoggedIn() && !!user && user.role === 'admin';
  }

  function logout(reason) {
    clear();
    clearTimeout(expiryTimer);
    const query = reason ? '?reason=' + encodeURIComponent(reason) : '';
    window.location.href = 'login.html' + query;
  }

  // Tokens last 1 hour (JWT_EXPIRES_IN in auth.controller.js).
  // Sign the user out with a message the moment it expires.
  function scheduleExpiry() {
    const payload = decode(getToken());
    if (!payload || !payload.exp) return;
    const ms = payload.exp * 1000 - Date.now();
    clearTimeout(expiryTimer);
    if (ms > 0 && ms < 2147483647) {
      expiryTimer = setTimeout(function () { logout('expired'); }, ms);
    }
  }

  // ROLE GUARD (page level): call first on every page that needs a signed-in user.
  function requireAuth() {
    const token = getToken();
    if (!token) { logout(); return false; }
    if (isExpired(token)) { logout('expired'); return false; }
    scheduleExpiry();
    return true;
  }

  // ROLE GUARD (page level): call first on admin-only pages (dashboard, user management,
  // create/edit forms). Normal users are sent to the "no access" page.
  function requireAdmin() {
    if (!requireAuth()) return false;
    if (!isAdmin()) {
      window.location.replace('forbidden.html');
      return false;
    }
    return true;
  }

  // Login/signup pages: skip the form if already signed in
  function redirectIfLoggedIn() {
    if (isLoggedIn()) window.location.replace('events.html');
  }

  // ROLE GUARD (element level): show/hide anything marked with data-requires.
  //   data-requires="admin" -> visible to admins only
  //   data-requires="user"  -> visible to normal users only (e.g. Register buttons)
  function applyRoleVisibility(root) {
    const admin = isAdmin();
    $('[data-requires="admin"]', root || document).toggleClass('hidden', !admin);
    $('[data-requires="user"]', root || document).toggleClass('hidden', admin);
  }

  return {
    save, clear, getToken, getUser, updateUser, isLoggedIn, isAdmin,
    logout, requireAuth, requireAdmin, redirectIfLoggedIn, applyRoleVisibility
  };
})();
