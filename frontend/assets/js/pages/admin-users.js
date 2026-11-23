/**
 * admin-users.js — User management (admin)
 *  GET   /api/users?page&limit     list (no total count, so "Next" is enabled
 *                                  while a full page comes back)
 *  GET   /api/users/:id            view one user
 *  PATCH /api/users/:id/enable     enable
 *  PATCH /api/users/:id/disable    disable
 * Roles are shown but can never be changed from the UI (project rule).
 */
$(function () {
  // ROLE GUARD (page): admins only. The API also returns 403 for non-admins.
  if (!Auth.requireAdmin()) return;
  Layout.init('admin');
  $('#admin-sidebar').html(Layout.adminSidebar('users'));

  const LIMIT = 10;
  const me = Auth.getUser();
  const $wrap = $('#users');
  const $count = $('#results-count');
  const $pager = $('#pager');
  let page = 1;
  let users = [];
  let query = '';
  let status = 'all';

  load();

  async function load() {
    UI.skeletonRows($wrap, 5);
    $count.text('Loading users…');
    try {
      const res = await Api.users.list({ page: page, limit: LIMIT });
      users = res.data || [];
      if (!users.length && page > 1) { page--; return load(); } // went past the last page
      render();
    } catch (err) {
      $count.text('');
      UI.errorState($wrap, err.message, load);
    }
  }

  function filtered() {
    const q = query.trim().toLowerCase();
    return users.filter(function (u) {
      if (status === 'active' && u.is_active === false) return false;
      if (status === 'disabled' && u.is_active !== false) return false;
      return !q || [u.full_name, u.email].some(function (v) { return (v || '').toLowerCase().indexOf(q) !== -1; });
    });
  }

  function row(u) {
    const isMe = me && u.id === me.id;
    const active = u.is_active !== false;
    const name = UI.esc(u.full_name);
    let action;
    if (isMe) {
      action = '<span class="text-xs text-muted">You can\'t disable your own account</span>';
    } else if (active) {
      action = '<button type="button" class="btn btn-danger py-1.5" data-disable="' + UI.esc(u.id) + '" aria-label="Disable ' + name + '">Disable</button>';
    } else {
      action = '<button type="button" class="btn btn-primary py-1.5" data-enable="' + UI.esc(u.id) + '" aria-label="Enable ' + name + '">Enable</button>';
    }
    return '<tr class="border-t border-ink/10">' +
      '<td class="px-4 py-3"><button type="button" class="font-semibold text-left hover:underline text-civic-dark" data-view="' + UI.esc(u.id) + '">' + name + '</button>' +
        (isMe ? ' <span class="badge bg-paper text-muted">You</span>' : '') + '</td>' +
      '<td class="px-4 py-3 break-all">' + UI.esc(u.email) + '</td>' +
      '<td class="px-4 py-3">' + (u.role === 'admin' ? '<span class="badge bg-signal/30 text-ink">Admin</span>' : '<span class="badge bg-civic-light text-civic-dark">Member</span>') + '</td>' +
      '<td class="px-4 py-3">' + (active ? '<span class="badge bg-civic-light text-civic-dark">Active</span>' : '<span class="badge bg-red-50 text-danger">Disabled</span>') + '</td>' +
      '<td class="px-4 py-3 text-muted whitespace-nowrap">' + UI.esc(UI.formatDate(u.created_at, false)) + '</td>' +
      '<td class="px-4 py-3">' + action + '</td>' +
    '</tr>';
  }

  function render() {
    const list = filtered();
    $wrap.attr('aria-busy', 'false');
    const from = (page - 1) * LIMIT + 1;
    $count.text(users.length
      ? 'Page ' + page + ': showing ' + list.length + ' of ' + users.length + ' users on this page (users ' + from + '–' + (from + users.length - 1) + ')'
      : 'No users found.');

    if (!list.length) {
      UI.emptyState($wrap, { title: users.length ? 'No users match' : 'No users yet', text: users.length ? 'Try another search or status on this page.' : '' });
    } else {
      $wrap.html(
        '<div class="card overflow-x-auto">' +
          '<table class="w-full text-sm text-left">' +
            '<caption class="sr-only">Users, page ' + page + '</caption>' +
            '<thead class="bg-paper"><tr>' +
              ['Name', 'Email', 'Role', 'Status', 'Joined', 'Action'].map(function (h) { return '<th scope="col" class="px-4 py-3 font-semibold whitespace-nowrap">' + h + '</th>'; }).join('') +
            '</tr></thead>' +
            '<tbody>' + list.map(row).join('') + '</tbody>' +
          '</table>' +
        '</div>'
      );
    }

    const hasNext = users.length === LIMIT;
    $pager.html(
      '<button type="button" class="btn btn-secondary" data-page="prev"' + (page === 1 ? ' disabled' : '') + '>Previous page</button>' +
      '<span class="text-sm text-muted">Page ' + page + '</span>' +
      '<button type="button" class="btn btn-secondary" data-page="next"' + (hasNext ? '' : ' disabled') + '>Next page</button>'
    );
  }

  $('#search').on('input', UI.debounce(function () { query = $(this).val(); render(); }, 200));
  $('#status').on('change', function () { status = $(this).val(); render(); });
  $pager.on('click', '[data-page]', function () {
    page += $(this).data('page') === 'next' ? 1 : -1;
    load();
    $count.trigger('focus');
  });

  // ---------- Enable / disable ----------
  function findUser(id) { return users.find(function (u) { return u.id === id; }); }

  async function setActive(id, active, $btn) {
    const u = findUser(id);
    if (!active) {
      const ok = await UI.confirm({
        title: 'Disable ' + u.full_name + '?',
        message: 'They\'ll be signed out the next time they use the app and won\'t be able to sign back in until you enable the account.',
        confirmLabel: 'Disable account',
        danger: true
      });
      if (!ok) return;
    }
    UI.setBusy($btn, true, active ? 'Enabling…' : 'Disabling…');
    try {
      const res = await (active ? Api.users.enable(id) : Api.users.disable(id));
      Object.assign(u, res.data || { is_active: active });
      render();
      UI.toast((active ? 'Enabled ' : 'Disabled ') + u.full_name + '.', 'success');
      $wrap.find('[data-view="' + id + '"]').trigger('focus');
    } catch (err) {
      UI.setBusy($btn, false);
      UI.toast(err.message, 'error');
    }
  }
  $wrap.on('click', '[data-disable]', function () { setActive(String($(this).data('disable')), false, $(this)); });
  $wrap.on('click', '[data-enable]', function () { setActive(String($(this).data('enable')), true, $(this)); });

  // ---------- View user (dialog) ----------
  $wrap.on('click', '[data-view]', async function () {
    const opener = this;
    const id = String($(this).data('view'));
    const $modal = $(
      '<div class="fixed inset-0 z-[80] flex items-center justify-center p-4">' +
        '<div class="absolute inset-0 bg-ink/50" data-close></div>' +
        '<div role="dialog" aria-modal="true" aria-labelledby="uv-title" class="relative card shadow-2xl w-full max-w-md p-6">' +
          '<div class="flex items-start justify-between gap-4">' +
            '<h2 id="uv-title" class="text-lg font-bold">User details</h2>' +
            '<button type="button" class="btn btn-secondary px-3 py-1" data-close>Close</button>' +
          '</div>' +
          '<div id="uv-body" class="mt-4"><div class="skeleton h-4 w-2/3"></div><div class="skeleton h-4 w-1/2 mt-3"></div></div>' +
        '</div>' +
      '</div>'
    ).appendTo('body');

    function close() { $modal.remove(); $(document).off('keydown.uv'); opener.focus(); }
    $modal.on('click', '[data-close]', close);
    $(document).on('keydown.uv', function (e) {
      if (e.key === 'Escape') close();
      if (e.key === 'Tab') { e.preventDefault(); $modal.find('button[data-close]').trigger('focus'); } // only one control
    });
    $modal.find('button[data-close]').trigger('focus');

    try {
      const u = (await Api.users.get(id)).data;
      const item = function (label, value) { return '<div class="py-2 border-b border-ink/10"><dt class="text-xs font-semibold text-muted">' + label + '</dt><dd class="mt-0.5 break-all">' + value + '</dd></div>'; };
      $modal.find('#uv-body').html('<dl>' +
        item('Full name', UI.esc(u.full_name)) +
        item('Email', UI.esc(u.email)) +
        item('Role', u.role === 'admin' ? 'Administrator' : 'Member') +
        item('Status', u.is_active === false ? 'Disabled' : 'Active') +
        item('Joined', UI.esc(UI.formatDate(u.created_at))) +
        item('Last updated', UI.esc(UI.formatDate(u.updated_at))) +
        item('User ID', '<code class="text-xs">' + UI.esc(u.id) + '</code>') +
      '</dl><p class="text-xs text-muted mt-3">Roles can\'t be changed from the app.</p>');
    } catch (err) {
      $modal.find('#uv-body').html('<p class="text-danger" role="alert">' + UI.esc(err.message) + '</p>');
    }
  });
});
