/**
 * announcement-form.js — Create (POST /api/announcements, multipart, file key "audio")
 * or edit (PUT /api/announcements/:id).
 *
 * Backend notes:
 *  - On create the backend also sends a broadcast notification.
 *  - PUT only updates title/published; it ignores a new audio file, so the
 *    edit form doesn't offer one. Publishing uses PATCH /publish and /unpublish.
 */
$(function () {
  // ROLE GUARD (page): admins only. Normal users go to forbidden.html.
  if (!Auth.requireAdmin()) return;
  Layout.init('announcements');

  const id = UI.param('id');
  const editing = !!id;
  const $form = $('#media-form');
  const $btn = $('#save-btn');
  const $switch = $('#published');
  let item = null;
  let file = null;
  let previewUrl = null;
  let dirty = false;

  if (editing) {
    document.title = 'Edit announcement | CivicEvents';
    $('#form-title').text('Edit announcement');
    $btn.text('Save changes');
    $('#back-link, #cancel-link').attr('href', 'announcement.html?id=' + encodeURIComponent(id));
    $('#back-link').html('&larr; Back to announcement');
    $('#file-required, label[for="file"], #file-clear').addClass('hidden');
    $('#file').prop('disabled', true);
    $('#file-help').text('The audio of an existing announcement can\'t be replaced. To use a different recording, create a new announcement.');
    load();
  }

  async function load() {
    $form.find('input, button').prop('disabled', true);
    try {
      const res = await Api.announcements.get(id);
      item = res.data;
      $('#title').val(item.title);
      UI.setSwitch($switch, item.published !== false);
      $('#file-preview').removeClass('border-dashed text-center').html(
        '<p class="text-ink font-semibold mb-2">Current recording</p>' +
        '<audio controls preload="metadata" class="w-full" src="' + UI.esc(item.audio_url) + '">Your browser can\'t play this audio.</audio>'
      );
      $form.find('input:not(#file), button').prop('disabled', false);
      $('#title').trigger('focus');
    } catch (err) {
      const $wrap = $('<div class="mt-6"></div>');
      $form.replaceWith($wrap);
      if (err.status === 404) UI.emptyState($wrap, { title: 'Announcement not found', actionHtml: '<a href="announcements.html" class="btn btn-primary">All announcements</a>' });
      else UI.errorState($wrap, err.message, function () { window.location.reload(); });
    }
  }

  // ---------- Published switch ----------
  $switch.on('click', function () {
    UI.setSwitch($switch, $switch.attr('aria-checked') !== 'true');
    dirty = true;
  });

  // ---------- File choose / preview ----------
  $('#file').on('change', function () {
    const f = this.files && this.files[0];
    $('#file-error').addClass('hidden').text('');
    $(this).removeAttr('aria-invalid');
    if (!f) return;
    const problem = UI.checkFile(f, 'audio');
    if (problem) {
      $(this).val('').attr('aria-invalid', 'true');
      $('#file-error').text(problem).removeClass('hidden');
      return;
    }
    file = f;
    dirty = true;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = URL.createObjectURL(f);
    $('#file-preview').removeClass('border-dashed text-center').html(
      '<p class="text-ink font-semibold break-all">' + UI.esc(f.name) + '</p>' +
      '<p class="text-xs text-muted mb-2">' + (f.size / 1024 / 1024).toFixed(2) + ' MB <span id="file-length"></span></p>' +
      '<audio id="preview-audio" controls preload="metadata" class="w-full" src="' + previewUrl + '">Your browser can\'t preview this file, but it can still be uploaded.</audio>'
    );
    $('#preview-audio').on('loadedmetadata', function () {
      if (isFinite(this.duration)) $('#file-length').text(', ' + UI.formatDuration(this.duration) + ' long');
    });
    $('#file-clear').removeClass('hidden');
  });

  $('#file-clear').on('click', function () {
    file = null;
    $('#file').val('');
    if (previewUrl) { URL.revokeObjectURL(previewUrl); previewUrl = null; }
    $('#file-preview').addClass('border-dashed text-center').text('No file selected');
    $(this).addClass('hidden');
    $('label[for="file"]').trigger('focus');
  });

  $form.on('input', 'input', function () { dirty = true; });
  $(window).on('beforeunload', function (e) { if (dirty) { e.preventDefault(); return ''; } });

  function setProgress(pct) {
    $('#progress-wrap').removeClass('hidden');
    $('#progress-fill').css('width', pct + '%');
    $('#progress-text').text(pct + '%');
    $('#progress-bar').attr('aria-valuenow', pct);
  }

  // ---------- Submit ----------
  $form.on('submit', async function (e) {
    e.preventDefault();
    UI.clearErrors($form);
    const title = $('#title').val().trim();
    const published = $switch.attr('aria-checked') === 'true';
    let valid = true;
    if (!title) { UI.fieldError('title', 'Enter a title.'); valid = false; }
    if (!editing && !file) {
      $('#file').attr('aria-invalid', 'true');
      $('#file-error').text('Choose an audio file to upload.').removeClass('hidden');
      valid = false;
    }
    if (!valid) {
      const $first = $form.find('[aria-invalid="true"]').first();
      ($first.is('#file') ? $('label[for="file"]') : $first).trigger('focus');
      return;
    }

    UI.setBusy($btn, true, editing ? 'Saving…' : 'Uploading…');
    try {
      let savedId = id;
      if (editing) {
        const fd = new FormData();
        fd.append('title', title);
        await Api.announcements.update(id, fd);
        // Publishing has its own endpoints (publish also notifies users)
        if (published !== (item.published !== false)) {
          await (published ? Api.announcements.publish(id) : Api.announcements.unpublish(id));
        }
      } else {
        const fd = new FormData();
        fd.append('title', title);
        fd.append('published', published ? 'true' : 'false');
        fd.append('audio', file);
        setProgress(0);
        const res = await Api.announcements.create(fd, { onProgress: setProgress });
        savedId = res.data.id;
      }
      dirty = false;
      UI.flash(editing ? 'Changes saved.' : (published ? 'Announcement published. Everyone has been notified.' : 'Announcement saved as a draft.'), 'success');
      window.location.href = 'announcement.html?id=' + encodeURIComponent(savedId);
    } catch (err) {
      UI.setBusy($btn, false);
      $('#progress-wrap').addClass('hidden');
      UI.formAlert($form, err.message);
      $form.find('[data-form-alert]')[0].scrollIntoView({ block: 'center' });
    }
  });
});
