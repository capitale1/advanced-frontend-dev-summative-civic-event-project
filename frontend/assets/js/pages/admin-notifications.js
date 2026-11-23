/**
 * admin-notifications.js — Manage notifications (admin)
 *  GET    /api/notifications       broadcast notifications + ones sent to this admin
 *  DELETE /api/notifications/:id   admin only
 * A form with checkboxes lets admins delete one or many at once.
 */
$(function () {
  // ROLE GUARD (page): admins only. DELETE also returns 403 for non-admins.
  if (!Auth.requireAdmin()) return;
  Layout.init('admin');
  $('#admin-sidebar').html(Layout.adminSidebar('notifications'));

  const $form = $('#notif-form');
  const $wrap = $('#notifs');
  const $count = $('#results-count');
  const $del = $('#delete-selected');
  let items = [];
  let type = 'all';
  const selected = new Set();

  load();

  async function load() {
    UI.skeletonRows($wrap, 5);
    try {
      const res = await Api.notifications.list();
      items = res.data || [];
      render();
    } catch (err) {
      UI.errorState($wrap, err.message, load);
    }
  }

  function visible() {
    return items.filter(function (n) { return type === 'all' || n.type === type; });
  }

  function link(n) {
    const m = n.metadata || {};
    if (m.event_id) return 'event.html?id=' + encodeURIComponent(m.event_id);
    if (m.announcement_id) return 'announcement.html?id=' + encodeURIComponent(m.announcement_id);
    if (m.promo_id) return 'promo.html?id=' + encodeURIComponent(m.promo_id);
    return null;
  }

  function render() {
    const list = visible();
    // Drop selections that are no longer shown
    Array.from(selected).forEach(function (id) { if (!list.some(function (n) { return n.id === id; })) selected.delete(id); });

    $wrap.attr('aria-busy', 'false');
    $count.text(list.length + ' notification' + (list.length === 1 ? '' : 's') + (type === 'all' ? '' : ' of this type'));
    if (!list.length) {
      UI.emptyState($wrap, { title: 'No notifications', text: type === 'all' ? 'Publishing an event, announcement or promo sends one automatically.' : 'Try another type.' });
      updateButton();
      return;
    }

    const rows = list.map(function (n) {
      const id = UI.esc(n.id);
      const href = link(n);
      return '<tr class="border-t border-ink/10 align-top">' +
        '<td class="px-4 py-3"><input type="checkbox" class="h-4 w-4 accent-civic mt-1" data-select="' + id + '" id="sel-' + id + '"' + (selected.has(n.id) ? ' checked' : '') + '>' +
          '<label for="sel-' + id + '" class="sr-only">Select ' + UI.esc(n.title) + '</label></td>' +
        '<td class="px-4 py-3"><p class="font-semibold">' + UI.esc(n.title) + '</p><p class="text-muted mt-0.5">' + UI.esc(n.message) + '</p>' +
          (href ? '<a class="text-civic underline text-xs font-semibold" href="' + href + '">Open related item</a>' : '') + '</td>' +
        '<td class="px-4 py-3 capitalize">' + UI.esc(n.type) + '</td>' +
        '<td class="px-4 py-3">' + (n.recipient_id ? 'One user' : 'Everyone') + '</td>' +
        '<td class="px-4 py-3 text-muted whitespace-nowrap"><time datetime="' + UI.esc(n.created_at) + '">' + UI.esc(UI.formatDate(n.created_at)) + '</time></td>' +
        '<td class="px-4 py-3"><button type="button" class="btn btn-danger py-1.5" data-delete="' + id + '" aria-label="Delete ' + UI.esc(n.title) + '">Delete</button></td>' +
      '</tr>';
    }).join('');

    $wrap.html(
      '<div class="card overflow-x-auto">' +
        '<table class="w-full text-sm text-left">' +
          '<caption class="sr-only">Notifications</caption>' +
          '<thead class="bg-paper"><tr>' +
            '<th scope="col" class="px-4 py-3 w-10"><input type="checkbox" id="select-all" class="h-4 w-4 accent-civic"><label for="select-all" class="sr-only">Select all shown</label></th>' +
            '<th scope="col" class="px-4 py-3 font-semibold">Notification</th>' +
            '<th scope="col" class="px-4 py-3 font-semibold">Type</th>' +
            '<th scope="col" class="px-4 py-3 font-semibold">Sent to</th>' +
            '<th scope="col" class="px-4 py-3 font-semibold">Sent</th>' +
            '<th scope="col" class="px-4 py-3"><span class="sr-only">Actions</span></th>' +
          '</tr></thead><tbody>' + rows + '</tbody>' +
        '</table>' +
      '</div>'
    );
    updateButton();
  }

  function updateButton() {
    const n = selected.size;
    $del.prop('disabled', n === 0).text(n ? 'Delete selected (' + n + ')' : 'Delete selected');
    const shown = visible().length;
    const $all = $('#select-all');
    $all.prop('checked', n > 0 && n === shown).prop('indeterminate', n > 0 && n < shown);
  }

  $('#type').on('change', function () { type = $(this).val(); render(); });

  $wrap.on('change', '[data-select]', function () {
    const id = String($(this).data('select'));
    this.checked ? selected.add(id) : selected.delete(id);
    updateButton();
  });
  $wrap.on('change', '#select-all', function () {
    const on = this.checked;
    visible().forEach(function (n) { on ? selected.add(n.id) : selected.delete(n.id); });
    $wrap.find('[data-select]').prop('checked', on);
    updateButton();
  });

  // Delete a list of ids one by one; report how many failed
  async function deleteIds(ids) {
    let failed = 0;
    for (let i = 0; i < ids.length; i++) {
      $count.text('Deleting ' + (i + 1) + ' of ' + ids.length + '…');
      try {
        await Api.notifications.remove(ids[i]);
        items = items.filter(function (n) { return n.id !== ids[i]; });
        selected.delete(ids[i]);
      } catch (err) {
        failed++;
        if (err.status === 401) return;
      }
    }
    render();
    Layout.refreshNotifications();
    const done = ids.length - failed;
    if (done) UI.toast('Deleted ' + done + ' notification' + (done === 1 ? '' : 's') + '.', 'success');
    if (failed) UI.toast(failed + ' couldn\'t be deleted. Try again.', 'error');
    $count.trigger('focus');
  }

  $form.on('submit', async function (e) {
    e.preventDefault();
    const ids = Array.from(selected);
    if (!ids.length) return;
    const ok = await UI.confirm({
      title: 'Delete ' + ids.length + ' notification' + (ids.length === 1 ? '' : 's') + '?',
      message: 'They\'ll be removed for every user. This can\'t be undone.',
      confirmLabel: 'Delete',
      danger: true
    });
    if (!ok) return;
    UI.setBusy($del, true, 'Deleting…');
    await deleteIds(ids);
    UI.setBusy($del, false);
    updateButton();
  });

  $wrap.on('click', '[data-delete]', async function () {
    const id = String($(this).data('delete'));
    const n = items.find(function (x) { return x.id === id; });
    const ok = await UI.confirm({ title: 'Delete this notification?', message: '"' + n.title + '" will be removed for every user.', confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    UI.setBusy($(this), true, 'Deleting…');
    await deleteIds([id]);
  });
});
