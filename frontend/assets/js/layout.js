/**
 * layout.js — renders the shared header, notification drawer and footer
 * into <div id="app-header"> and <div id="app-footer"> on every signed-in page.
 *
 * Usage (at the top of a page script, after the auth guard):
 *   Layout.init('events');   // the key marks the active nav link
 */
const Layout = (function () {

  // ROLE GUARD (navigation): `requires` controls who sees each link.
  const NAV = [
    { href: 'events.html', label: 'Events', page: 'events' },
    { href: 'announcements.html', label: 'Announcements', page: 'announcements' },
    { href: 'promos.html', label: 'Promos', page: 'promos' },
    { href: 'my-registrations.html', label: 'My registrations', page: 'my-registrations', requires: 'user' },
    { href: 'dashboard.html', label: 'Dashboard', page: 'dashboard', requires: 'admin' },
    { href: 'admin-users.html', label: 'Admin', page: 'admin', requires: 'admin' }
  ];

  const ICONS = {
    logo: '<svg aria-hidden="true" viewBox="0 0 32 32" class="h-8 w-8"><rect width="32" height="32" rx="6" fill="#F2C14E"/><path d="M15 6h2v20h-2z" fill="#1B2A41"/><path d="M8 9h13l3 3-3 3H8z" fill="#1B2A41"/><path d="M24 17H11l-3 3 3 3h13z" fill="#1F6F5C"/></svg>',
    bell: '<svg aria-hidden="true" viewBox="0 0 24 24" class="h-6 w-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>',
    menu: '<svg aria-hidden="true" viewBox="0 0 24 24" class="h-6 w-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 6h16M4 12h16M4 18h16"/></svg>',
    close: '<svg aria-hidden="true" viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>',
    chevron: '<svg aria-hidden="true" viewBox="0 0 20 20" class="h-4 w-4" fill="currentColor"><path d="M5.3 7.3a1 1 0 0 1 1.4 0L10 10.6l3.3-3.3a1 1 0 1 1 1.4 1.4l-4 4a1 1 0 0 1-1.4 0l-4-4a1 1 0 0 1 0-1.4z"/></svg>'
  };

  let notifications = [];
  let pollTimer = null;
  let lastFocus = null;

  function visible(item) {
    if (!item.requires) return true;
    if (item.requires === 'admin') return Auth.isAdmin();
    if (item.requires === 'user') return !Auth.isAdmin();
    return false;
  }

  function initials(name) {
    return (name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(function (p) { return p[0].toUpperCase(); }).join('');
  }

  // ---------- Header ----------
  function headerHtml(page) {
    const user = Auth.getUser() || {};
    const link = function (n, extra) {
      const active = n.page === page;
      return '<a href="' + n.href + '" class="nav-link ' + (active ? 'is-active ' : '') + (extra || '') + '"' + (active ? ' aria-current="page"' : '') + '>' + n.label + '</a>';
    };
    const desktopLinks = NAV.filter(visible).map(function (n) { return link(n); }).join('');
    const mobileLinks = NAV.filter(visible).map(function (n) { return link(n, 'block'); }).join('');
    const searchForm = function (id) {
      return '<form role="search" action="search.html" method="get">' +
        '<label for="' + id + '" class="sr-only">Search events, announcements and promos</label>' +
        '<input id="' + id + '" name="q" type="search" placeholder="Search CivicEvents" value="' + UI.esc(page === 'search' ? (UI.param('q') || '') : '') + '" ' +
        'class="w-full rounded-md bg-white/10 border border-white/25 px-3 py-1.5 text-sm text-white placeholder:text-white/60 focus:bg-white focus:text-ink focus:placeholder:text-muted">' +
      '</form>';
    };

    return '' +
      '<header class="bg-ink text-white border-t-4 border-signal">' +
        '<div class="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center gap-3">' +
          '<a href="events.html" class="flex items-center gap-2 font-extrabold text-lg shrink-0">' + ICONS.logo + '<span>CivicEvents</span></a>' +
          '<nav aria-label="Main" class="hidden lg:flex items-center gap-1 ml-4">' + desktopLinks + '</nav>' +
          '<div class="hidden md:block flex-1 max-w-xs ml-auto">' + searchForm('global-search') + '</div>' +
          '<div class="flex items-center gap-1 ml-auto md:ml-2">' +
            '<button id="notif-btn" type="button" class="relative p-2 rounded-md hover:bg-white/10" aria-haspopup="dialog" aria-controls="notif-drawer" aria-label="Notifications">' +
              ICONS.bell +
              '<span id="notif-count" class="hidden absolute -top-0.5 -right-0.5 min-w-[1.25rem] h-5 px-1 rounded-full bg-signal text-ink text-xs font-bold leading-5 text-center" aria-hidden="true"></span>' +
            '</button>' +
            '<div class="relative">' +
              '<button id="profile-btn" type="button" class="flex items-center gap-1 p-1.5 rounded-md hover:bg-white/10" aria-haspopup="menu" aria-expanded="false" aria-controls="profile-menu">' +
                '<span id="hdr-initials" class="h-8 w-8 rounded-full bg-signal text-ink grid place-items-center font-bold text-sm" aria-hidden="true">' + UI.esc(initials(user.full_name)) + '</span>' +
                ICONS.chevron +
                '<span id="hdr-sr-name" class="sr-only">Account menu for ' + UI.esc(user.full_name) + '</span>' +
              '</button>' +
              '<div id="profile-menu" role="menu" aria-labelledby="profile-btn" class="hidden absolute right-0 mt-2 w-60 bg-white text-ink rounded-md shadow-xl border border-ink/10 py-1 z-40">' +
                '<div class="px-4 py-3 border-b border-ink/10">' +
                  '<p id="hdr-name" class="font-semibold truncate">' + UI.esc(user.full_name) + '</p>' +
                  '<p id="hdr-email" class="text-xs text-muted truncate">' + UI.esc(user.email) + '</p>' +
                  (user.role === 'admin' ? '<span class="badge bg-signal/30 text-ink mt-2">Administrator</span>' : '') +
                '</div>' +
                '<a role="menuitem" tabindex="-1" href="profile.html" class="block px-4 py-2 text-sm hover:bg-paper focus:bg-paper">My profile</a>' +
                (Auth.isAdmin() ? '' : '<a role="menuitem" tabindex="-1" href="my-registrations.html" class="block px-4 py-2 text-sm hover:bg-paper focus:bg-paper">My registrations</a>') +
                '<button role="menuitem" tabindex="-1" id="logout-btn" type="button" class="block w-full text-left px-4 py-2 text-sm text-danger hover:bg-paper focus:bg-paper">Sign out</button>' +
              '</div>' +
            '</div>' +
            '<button id="menu-btn" type="button" class="lg:hidden p-2 rounded-md hover:bg-white/10" aria-expanded="false" aria-controls="mobile-nav" aria-label="Open main menu">' + ICONS.menu + '</button>' +
          '</div>' +
        '</div>' +
        '<div id="mobile-nav" class="hidden lg:hidden border-t border-white/10 px-4 pb-4 pt-3 space-y-2">' +
          '<div class="md:hidden">' + searchForm('mobile-search') + '</div>' +
          '<nav aria-label="Main (mobile)">' + mobileLinks + '</nav>' +
        '</div>' +
      '</header>' +
      drawerHtml();
  }

  // ---------- Notification drawer ----------
  function drawerHtml() {
    return '' +
      '<div id="notif-overlay" class="hidden fixed inset-0 bg-ink/40 z-40"></div>' +
      '<aside id="notif-drawer" role="dialog" aria-modal="true" aria-labelledby="notif-title" class="hidden fixed top-0 right-0 h-full w-full sm:max-w-md bg-white text-ink z-50 shadow-2xl translate-x-full flex flex-col">' +
        '<div class="flex items-center justify-between gap-2 px-5 h-16 border-b border-ink/10 border-t-4 border-t-signal">' +
          '<h2 id="notif-title" class="text-lg font-bold">Notifications</h2>' +
          '<div class="flex items-center gap-1">' +
            '<button id="notif-markall" type="button" class="text-sm font-semibold text-civic hover:underline px-2 py-1">Mark all as read</button>' +
            '<button id="notif-close" type="button" class="p-2 rounded-md hover:bg-paper" aria-label="Close notifications">' + ICONS.close + '</button>' +
          '</div>' +
        '</div>' +
        '<div id="notif-body" class="flex-1 overflow-y-auto"></div>' +
      '</aside>';
  }

  // No "mark as read" endpoint exists, and the DB `read` column is shared by
  // all users, so each user's read IDs are kept in this browser instead.
  function readKey() {
    const u = Auth.getUser();
    return 'ce_read_' + (u ? u.id : 'anon');
  }
  function getReadIds() {
    try { return new Set(JSON.parse(localStorage.getItem(readKey())) || []); } catch (e) { return new Set(); }
  }
  function saveReadIds(set) {
    try { localStorage.setItem(readKey(), JSON.stringify(Array.from(set))); } catch (e) { /* storage full or blocked */ }
  }
  function isUnread(n) { return !getReadIds().has(n.id); }

  function markRead(ids) {
    const set = getReadIds();
    ids.forEach(function (id) { set.add(id); });
    saveReadIds(set);
    updateBadge();
  }

  function updateBadge() {
    const count = notifications.filter(isUnread).length;
    const $count = $('#notif-count');
    $count.text(count > 99 ? '99+' : count).toggleClass('hidden', count === 0);
    $('#notif-btn').attr('aria-label', count ? 'Notifications, ' + count + ' unread' : 'Notifications');
  }

  // Link to the thing a notification is about, using its metadata
  function relatedLink(n) {
    const m = n.metadata || {};
    if (m.event_id) return { href: 'event.html?id=' + encodeURIComponent(m.event_id), label: 'Open event' };
    if (m.announcement_id) return { href: 'announcement.html?id=' + encodeURIComponent(m.announcement_id), label: 'Listen to announcement' };
    if (m.promo_id) return { href: 'promo.html?id=' + encodeURIComponent(m.promo_id), label: 'Watch promo' };
    return null;
  }

  function typeBadge(type) {
    const styles = {
      event: 'bg-civic-light text-civic-dark',
      announcement: 'bg-signal/30 text-ink',
      promo: 'bg-ink/10 text-ink'
    };
    const label = (type || 'system').charAt(0).toUpperCase() + (type || 'system').slice(1);
    return '<span class="badge ' + (styles[type] || 'bg-paper text-muted') + '">' + UI.esc(label) + '</span>';
  }

  function renderList() {
    const $body = $('#notif-body').attr('aria-busy', 'false');
    if (!notifications.length) {
      $body.html('<div class="p-10 text-center"><p class="font-bold">You\'re all caught up</p><p class="text-muted text-sm mt-1">New events, announcements and promos will show up here.</p></div>');
      return;
    }
    const admin = Auth.isAdmin();
    const items = notifications.map(function (n) {
      const unread = isUnread(n);
      return '<li class="relative border-b border-ink/10 group">' +
        '<button type="button" data-notif-open="' + UI.esc(n.id) + '" class="w-full text-left px-5 py-4 flex gap-3 hover:bg-paper ' + (admin ? 'pr-14' : '') + '">' +
          '<span class="mt-2 h-2.5 w-2.5 rounded-full shrink-0 ' + (unread ? 'bg-civic' : 'bg-transparent') + '" aria-hidden="true"></span>' +
          '<span class="flex-1 min-w-0">' +
            '<span class="flex items-baseline justify-between gap-2">' +
              '<span class="' + (unread ? 'font-bold' : 'font-medium') + ' truncate">' + UI.esc(n.title) + '</span>' +
              '<time class="text-xs text-muted shrink-0" datetime="' + UI.esc(n.created_at) + '">' + UI.esc(UI.timeAgo(n.created_at)) + '</time>' +
            '</span>' +
            '<span class="block text-sm text-muted mt-0.5 line-clamp-2">' + UI.esc(n.message) + '</span>' +
            '<span class="block mt-2">' + typeBadge(n.type) + (unread ? '<span class="sr-only"> (unread)</span>' : '') + '</span>' +
          '</span>' +
        '</button>' +
        // ROLE GUARD (render): delete control is only built for admins
        (admin ? '<button type="button" data-notif-delete="' + UI.esc(n.id) + '" class="absolute right-3 top-4 p-2 rounded-md text-muted hover:text-danger hover:bg-red-50" aria-label="Delete notification: ' + UI.esc(n.title) + '">' + ICONS.close + '</button>' : '') +
      '</li>';
    }).join('');
    $body.html('<ul>' + items + '</ul>');
  }

  function renderDetail(n) {
    const link = relatedLink(n);
    $('#notif-body').html(
      '<div class="p-5">' +
        '<button type="button" data-notif-back class="text-sm font-semibold text-civic hover:underline">&larr; All notifications</button>' +
        '<div class="mt-4">' + typeBadge(n.type) + '</div>' +
        '<h3 id="notif-detail-title" tabindex="-1" class="text-xl font-bold mt-2">' + UI.esc(n.title) + '</h3>' +
        '<p class="text-sm text-muted mt-1"><time datetime="' + UI.esc(n.created_at) + '">' + UI.esc(UI.formatDate(n.created_at)) + '</time></p>' +
        '<p class="mt-4 leading-relaxed">' + UI.esc(n.message) + '</p>' +
        '<div class="mt-6 flex flex-wrap gap-2">' +
          (link ? '<a href="' + link.href + '" class="btn btn-primary">' + link.label + '</a>' : '') +
          (Auth.isAdmin() ? '<button type="button" data-notif-delete="' + UI.esc(n.id) + '" class="btn btn-danger">Delete notification</button>' : '') +
        '</div>' +
      '</div>'
    );
    $('#notif-detail-title').trigger('focus');
  }

  async function loadNotifications(showSkeleton) {
    if (showSkeleton) UI.skeletonRows($('#notif-body').addClass('px-5'), 5);
    try {
      const res = await Api.notifications.list();
      notifications = res.data || [];
      $('#notif-body').removeClass('px-5');
      updateBadge();
      if (showSkeleton || $('#notif-body ul').length) renderList();
    } catch (err) {
      if (showSkeleton) {
        $('#notif-body').removeClass('px-5');
        UI.errorState($('#notif-body'), err.message, function () { loadNotifications(true); });
      }
    }
  }

  function openDrawer() {
    lastFocus = document.activeElement;
    $('#notif-overlay').removeClass('hidden');
    const $d = $('#notif-drawer').removeClass('hidden');
    requestAnimationFrame(function () { $d.removeClass('translate-x-full'); });
    $('#notif-close').trigger('focus');
    loadNotifications(true);
  }

  function closeDrawer() {
    const $d = $('#notif-drawer').addClass('translate-x-full');
    $('#notif-overlay').addClass('hidden');
    setTimeout(function () { $d.addClass('hidden'); }, 200);
    if (lastFocus) lastFocus.focus();
  }

  // Optimistic delete: remove now, put it back if the API call fails
  async function deleteNotification(id) {
    const n = notifications.find(function (x) { return x.id === id; });
    if (!n) return;
    const ok = await UI.confirm({
      title: 'Delete this notification?',
      message: '"' + n.title + '" will be removed for every user.',
      confirmLabel: 'Delete notification',
      danger: true
    });
    if (!ok) return;
    const index = notifications.indexOf(n);
    notifications.splice(index, 1);
    renderList(); updateBadge();
    try {
      await Api.notifications.remove(id);
      UI.toast('Notification deleted.', 'success');
    } catch (err) {
      notifications.splice(index, 0, n);
      renderList(); updateBadge();
      UI.toast(err.message, 'error');
    }
  }

  function bindDrawer() {
    $('#notif-btn').on('click', openDrawer);
    $('#notif-close, #notif-overlay').on('click', closeDrawer);
    $('#notif-markall').on('click', function () {
      markRead(notifications.map(function (n) { return n.id; }));
      if ($('#notif-body ul').length) renderList();
    });
    $('#notif-body')
      .on('click', '[data-notif-open]', function () {
        const id = $(this).data('notif-open');
        const n = notifications.find(function (x) { return x.id === id; });
        if (!n) return;
        markRead([id]); // optimistic: local only, nothing to revert
        renderDetail(n);
      })
      .on('click', '[data-notif-back]', function () { renderList(); })
      .on('click', '[data-notif-delete]', function (e) {
        e.stopPropagation();
        deleteNotification($(this).data('notif-delete'));
      });

    $(document).on('keydown', function (e) {
      const $d = $('#notif-drawer');
      if ($d.hasClass('hidden')) return;
      if (e.key === 'Escape') closeDrawer();
      if (e.key === 'Tab') { // keep focus inside the drawer
        const $f = $d.find('a[href], button:not([disabled]), [tabindex="-1"]').filter(':visible');
        const first = $f.first()[0], last = $f.last()[0];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    });
  }

  // ---------- Profile menu + mobile nav ----------
  function bindMenus() {
    const $btn = $('#profile-btn'), $menu = $('#profile-menu');
    function openMenu() {
      $menu.removeClass('hidden'); $btn.attr('aria-expanded', 'true');
      $menu.find('[role="menuitem"]').first().trigger('focus');
    }
    function closeMenu(returnFocus) {
      $menu.addClass('hidden'); $btn.attr('aria-expanded', 'false');
      if (returnFocus) $btn.trigger('focus');
    }
    $btn.on('click', function (e) {
      e.stopPropagation();
      $menu.hasClass('hidden') ? openMenu() : closeMenu();
    });
    $menu.on('keydown', function (e) {
      const $items = $menu.find('[role="menuitem"]');
      const i = $items.index(document.activeElement);
      if (e.key === 'ArrowDown') { e.preventDefault(); $items.eq((i + 1) % $items.length).trigger('focus'); }
      if (e.key === 'ArrowUp') { e.preventDefault(); $items.eq((i - 1 + $items.length) % $items.length).trigger('focus'); }
      if (e.key === 'Escape') closeMenu(true);
      if (e.key === 'Tab') closeMenu();
    });
    $(document).on('click', function (e) {
      if (!$(e.target).closest('#profile-menu').length) closeMenu();
    });

    $('#logout-btn').on('click', function () {
      Auth.clear();
      UI.flash('You\'re signed out.', 'info');
      window.location.href = 'login.html';
    });

    $('#menu-btn').on('click', function () {
      const open = $(this).attr('aria-expanded') === 'true';
      $(this).attr('aria-expanded', String(!open)).attr('aria-label', open ? 'Open main menu' : 'Close main menu');
      $('#mobile-nav').toggleClass('hidden', open);
    });
  }

  // ---------- Footer ----------
  function footerHtml() {
    const year = new Date().getFullYear();
    return '' +
      '<footer class="bg-ink text-white/80 mt-16">' +
        '<div class="max-w-6xl mx-auto px-4 sm:px-6 py-10 grid gap-8 sm:grid-cols-3 text-sm">' +
          '<div>' +
            '<p class="flex items-center gap-2 font-extrabold text-white text-lg">' + ICONS.logo + 'CivicEvents</p>' +
            '<p class="mt-3 max-w-xs">Find city events, listen to public announcements and watch community promos in one place.</p>' +
          '</div>' +
          '<div>' +
            '<h2 class="text-white font-semibold mb-3">Help and contact</h2>' +
            '<ul class="space-y-2">' +
              '<li>Email: <a class="underline hover:text-white" href="mailto:help@civicevents.example">help@civicevents.example</a></li>' +
              '<li>Phone: +000 000 000 000</li>' +
              '<li>Help desk hours: Mon–Fri, 8:00–17:00</li>' +
            '</ul>' +
          '</div>' +
          '<div>' +
            '<h2 class="text-white font-semibold mb-3">Accessibility</h2>' +
            '<p>Every page works with a keyboard and screen reader. Announcements include an audio player with keyboard controls and promos play with captions on.</p>' +
            '<p class="mt-2">Found a barrier? <a class="underline hover:text-white" href="mailto:help@civicevents.example?subject=Accessibility%20issue">Tell us</a>.</p>' +
          '</div>' +
        '</div>' +
        '<div class="border-t border-white/10 py-4 text-center text-xs text-white/60">&copy; ' + year + ' CivicEvents</div>' +
      '</footer>';
  }

  // ROLE GUARD (account status): the backend doesn't block disabled accounts,
  // so every page checks is_active and signs a disabled user out.
  async function checkStillActive() {
    try {
      const res = await Api.users.me();
      if (res.data && res.data.is_active === false) Auth.logout('disabled');
    } catch (e) { /* 401 is handled in api.js; other errors are ignored here */ }
  }

  // Update the header after the user edits their profile
  function refreshUser() {
    const user = Auth.getUser() || {};
    $('#hdr-initials').text(initials(user.full_name));
    $('#hdr-sr-name').text('Account menu for ' + user.full_name);
    $('#hdr-name').text(user.full_name);
    $('#hdr-email').text(user.email);
  }

  // ---------- Admin sidebar (dashboard pages) ----------
  // ROLE GUARD (navigation): only rendered on admin pages, after requireAdmin().
  const ADMIN_NAV = [
    { href: 'dashboard.html', label: 'Overview', key: 'overview' },
    { href: 'admin-users.html', label: 'Users', key: 'users' },
    { href: 'admin-notifications.html', label: 'Notifications', key: 'notifications' }
  ];
  const ADMIN_CREATE = [
    { href: 'event-form.html', label: 'New event' },
    { href: 'announcement-form.html', label: 'New announcement' },
    { href: 'promo-form.html', label: 'New promo' }
  ];
  function adminSidebar(active) {
    const link = function (n) {
      const on = n.key === active;
      return '<a href="' + n.href + '" class="block whitespace-nowrap rounded-md px-3 py-2 text-sm font-semibold ' +
        (on ? 'bg-ink text-white' : 'text-ink hover:bg-white') + '"' + (on ? ' aria-current="page"' : '') + '>' + n.label + '</a>';
    };
    return '<nav aria-label="Admin" class="lg:sticky lg:top-6">' +
      '<p class="hidden lg:block px-3 text-xs font-semibold text-muted mb-2">Admin</p>' +
      '<div class="flex lg:flex-col gap-1 overflow-x-auto pb-2 lg:pb-0">' + ADMIN_NAV.map(link).join('') + '</div>' +
      '<p class="hidden lg:block px-3 text-xs font-semibold text-muted mt-6 mb-2">Create</p>' +
      '<div class="hidden lg:flex flex-col gap-1">' + ADMIN_CREATE.map(link).join('') + '</div>' +
    '</nav>';
  }

  function init(page) {
    $('#app-header').html(headerHtml(page));
    $('#app-footer').html(footerHtml());
    bindMenus();
    bindDrawer();
    Auth.applyRoleVisibility();
    UI.showFlash();
    loadNotifications(false);
    checkStillActive();
    clearInterval(pollTimer);
    pollTimer = setInterval(function () { loadNotifications(false); }, 60000);
  }

  return {
    init: init,
    refreshUser: refreshUser,
    adminSidebar: adminSidebar,
    refreshNotifications: function () { loadNotifications(false); },
    getReadIds: getReadIds,
    getNotifications: function () { return notifications.slice(); }
  };
})();
