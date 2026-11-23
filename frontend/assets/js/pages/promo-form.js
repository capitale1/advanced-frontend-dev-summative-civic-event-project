/**
 * promo-form.js — Create (POST /api/promos) or edit (PUT /api/promos/:id).
 * multipart/form-data with the file under the key "video"
 * (backend: uploadPromoVideo.single('video')). title, description and
 * caption_text are all required by the backend.
 *
 * The create endpoint always publishes, so a promo saved with the switch off
 * is created and then moved to drafts with PATCH /unpublish.
 */
$(function () {
  // ROLE GUARD (page): admins only. Normal users go to forbidden.html.
  if (!Auth.requireAdmin()) return;
  Layout.init('promos');

  const id = UI.param('id');
  const editing = !!id;
  const $form = $('#media-form');
  const $btn = $('#save-btn');
  const $switch = $('#published');
  let promo = null;
  let file = null;
  let previewUrl = null;
  let dirty = false;

  if (editing) {
    document.title = 'Edit promo | CivicEvents';
    $('#form-title').text('Edit promo');
    $btn.text('Save changes');
    $('#back-link, #cancel-link').attr('href', 'promo.html?id=' + encodeURIComponent(id));
    $('#back-link').html('&larr; Back to promo');
    $('#file-required').addClass('hidden');
    $('label[for="file"]').text('Replace video');
    load();
  }

  async function load() {
    $form.find('input, textarea, button').prop('disabled', true);
    try {
      const res = await Api.promos.get(id);
      promo = res.data;
      $('#title').val(promo.title);
      $('#description').val(promo.description || '');
      $('#caption_text').val(promo.caption_text || '');
      UI.setSwitch($switch, promo.published !== false);
      showCurrent();
      $form.find('input, textarea, button').prop('disabled', false);
      $('#title').trigger('focus');
    } catch (err) {
      const $wrap = $('<div class="mt-6"></div>');
      $form.replaceWith($wrap);
      if (err.status === 404) UI.emptyState($wrap, { title: 'Promo not found', actionHtml: '<a href="promos.html" class="btn btn-primary">All promos</a>' });
      else UI.errorState($wrap, err.message, function () { window.location.reload(); });
    }
  }

  function showCurrent() {
    if (!promo) { $('#file-preview').addClass('border-dashed text-center').text('No file selected'); return; }
    $('#file-preview').removeClass('border-dashed text-center').html(
      '<p class="text-ink font-semibold mb-2">Current video</p>' +
      '<video controls preload="metadata" playsinline class="w-full rounded bg-ink aspect-video" src="' + UI.esc(promo.video_url) + '">Your browser can\'t play this video.</video>'
    );
  }

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
    const problem = UI.checkFile(f, 'video');
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
      '<p class="text-xs text-muted mb-2">' + (f.size / 1024 / 1024).toFixed(2) + ' MB<span id="file-length"></span></p>' +
      '<video id="preview-video" controls muted playsinline preload="metadata" class="w-full rounded bg-ink aspect-video" src="' + previewUrl + '">Preview not available, but the file can still be uploaded.</video>'
    );
    $('#preview-video').on('loadedmetadata', function () {
      if (isFinite(this.duration)) $('#file-length').text(', ' + UI.formatDuration(this.duration) + ' long');
    }).on('error', function () {
      $(this).replaceWith('<p class="text-sm text-muted">This browser can\'t preview this format. MP4 is recommended so everyone can watch it.</p>');
    });
    $('#file-clear').removeClass('hidden');
  });

  $('#file-clear').on('click', function () {
    file = null;
    $('#file').val('');
    if (previewUrl) { URL.revokeObjectURL(previewUrl); previewUrl = null; }
    showCurrent();
    $(this).addClass('hidden');
    $('label[for="file"]').trigger('focus');
  });

  $form.on('input', 'input, textarea', function () { dirty = true; });
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
    const data = {
      title: $('#title').val().trim(),
      description: $('#description').val().trim(),
      caption_text: $('#caption_text').val().trim()
    };
    const published = $switch.attr('aria-checked') === 'true';

    let valid = true;
    if (!data.title) { UI.fieldError('title', 'Enter a title.'); valid = false; }
    if (!data.description) { UI.fieldError('description', 'Enter a short description.'); valid = false; }
    if (!data.caption_text) { UI.fieldError('caption_text', 'Add captions so people who can\'t hear the video can follow it.'); valid = false; }
    if (!editing && !file) {
      $('#file').attr('aria-invalid', 'true');
      $('#file-error').text('Choose a video file to upload.').removeClass('hidden');
      valid = false;
    }
    if (!valid) {
      const $first = $form.find('[aria-invalid="true"]').first();
      ($first.is('#file') ? $('label[for="file"]') : $first).trigger('focus');
      return;
    }

    const fd = new FormData();
    fd.append('title', data.title);
    fd.append('description', data.description);
    fd.append('caption_text', data.caption_text);
    if (file) fd.append('video', file);

    UI.setBusy($btn, true, file ? 'Uploading…' : 'Saving…');
    const opts = file ? { onProgress: setProgress } : {};
    if (file) setProgress(0);

    try {
      let saved;
      if (editing) {
        saved = (await Api.promos.update(id, fd, opts)).data;
        if (published !== (promo.published !== false)) {
          await (published ? Api.promos.publish(id) : Api.promos.unpublish(id));
        }
      } else {
        saved = (await Api.promos.create(fd, opts)).data;
        if (!published) await Api.promos.unpublish(saved.id);
      }
      UI.cache.clear('promos'); // invalidate the cached list
      dirty = false;
      UI.flash(editing ? 'Changes saved.' : (published ? 'Promo published. Everyone has been notified.' : 'Promo saved as a draft.'), 'success');
      window.location.href = 'promo.html?id=' + encodeURIComponent((saved && saved.id) || id);
    } catch (err) {
      UI.setBusy($btn, false);
      $('#progress-wrap').addClass('hidden');
      UI.formAlert($form, err.message);
      $form.find('[data-form-alert]')[0].scrollIntoView({ block: 'center' });
    }
  });
});
