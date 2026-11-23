/**
 * event-form.js — Create (POST /api/events) or edit (PUT /api/events/:id).
 * Sent as multipart/form-data: text fields + optional file under the key "image"
 * (the backend uses uploadEventImage.single('image')). The backend stores the
 * public image URL in metadata.image_url.
 */
$(function () {
  // ROLE GUARD (page): only admins can create or edit events.
  // Normal users are redirected to forbidden.html. The backend also returns 403.
  if (!Auth.requireAdmin()) return;
  Layout.init('events');

  const id = UI.param('id');
  const editing = !!id;
  const $form = $('#event-form');
  const $btn = $('#save-btn');
  let event = null;
  let selectedFile = null;
  let previewUrl = null;
  let dirty = false;

  if (editing) {
    document.title = 'Edit event | CivicEvents';
    $('#form-title').text('Edit event');
    $btn.text('Save changes');
    $('#back-link, #cancel-link').attr('href', 'event.html?id=' + encodeURIComponent(id));
    $('#back-link').html('&larr; Back to event');
    loadEvent();
  }

  // ---------- Load existing event ----------
  async function loadEvent() {
    $form.attr('aria-busy', 'true').find('input, textarea, button[type="submit"]').prop('disabled', true);
    try {
      const res = await Api.events.get(id);
      event = res.data;
      $('#title').val(event.title);
      $('#description').val(event.description || '');
      $('#location').val(event.location || '');
      $('#starts_at').val(UI.toDateTimeInput(event.starts_at));
      $('#ends_at').val(UI.toDateTimeInput(event.ends_at));
      showImage(event.metadata && event.metadata.image_url, 'Current image');
      $form.attr('aria-busy', 'false').find('input, textarea, button[type="submit"]').prop('disabled', false);
      $('#title').trigger('focus');
    } catch (err) {
      const $wrap = $('<div class="mt-6"></div>');
      $form.replaceWith($wrap);
      if (err.status === 404) {
        UI.emptyState($wrap, { title: 'Event not found', text: 'It may have been deleted.', actionHtml: '<a href="events.html" class="btn btn-primary">Back to events</a>' });
      } else {
        UI.errorState($wrap, err.message, function () { window.location.reload(); });
      }
    }
  }

  // ---------- Image preview ----------
  function showImage(src, caption) {
    const $p = $('#image-preview');
    if (src) {
      $p.removeClass('border-dashed p-2').html('<img src="' + UI.esc(src) + '" alt="' + UI.esc(caption || 'Selected image preview') + '" class="h-full w-full object-cover">');
    } else {
      $p.addClass('border-dashed p-2').text('No image selected');
    }
  }

  $('#image').on('change', function () {
    const file = this.files && this.files[0];
    $('#image-error').addClass('hidden').text('');
    $(this).removeAttr('aria-invalid');
    if (!file) return;

    // Check type and size before uploading (backend limit: 2 MB, jpg/png/gif)
    const problem = UI.checkFile(file, 'image');
    if (problem) {
      $(this).val('').attr('aria-invalid', 'true');
      $('#image-error').text(problem).removeClass('hidden');
      return;
    }
    selectedFile = file;
    dirty = true;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = URL.createObjectURL(file);
    showImage(previewUrl, 'Preview of ' + file.name);
    $('#image-name').text(file.name + ' (' + (file.size / 1024).toFixed(0) + ' KB)');
    $('#image-clear').removeClass('hidden');
  });

  $('#image-clear').on('click', function () {
    selectedFile = null;
    $('#image').val('');
    if (previewUrl) { URL.revokeObjectURL(previewUrl); previewUrl = null; }
    showImage(event && event.metadata && event.metadata.image_url, 'Current image');
    $('#image-name').text('');
    $(this).addClass('hidden');
    $('label[for="image"]').trigger('focus');
  });

  // ---------- Unsaved changes warning ----------
  $form.on('input change', 'input, textarea', function () { dirty = true; });
  $(window).on('beforeunload', function (e) {
    if (dirty) { e.preventDefault(); return ''; }
  });

  // ---------- Validation ----------
  function validate() {
    let valid = true;
    const title = $('#title').val().trim();
    const location = $('#location').val().trim();
    const starts = $('#starts_at').val();
    const ends = $('#ends_at').val();

    if (!title) { UI.fieldError('title', 'Enter a title.'); valid = false; }
    if (!location) { UI.fieldError('location', 'Enter where the event takes place.'); valid = false; }
    if (!starts) { UI.fieldError('starts_at', 'Choose a start date and time.'); valid = false; }
    else if (!editing && new Date(starts).getTime() < Date.now()) { UI.fieldError('starts_at', 'Choose a start time in the future.'); valid = false; }
    if (!ends) { UI.fieldError('ends_at', 'Choose an end date and time.'); valid = false; }
    else if (starts && new Date(ends) <= new Date(starts)) { UI.fieldError('ends_at', 'The end must be after the start.'); valid = false; }
    return valid;
  }

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
    if (!validate()) { $form.find('[aria-invalid="true"]').first().trigger('focus'); return; }

    const fd = new FormData();
    fd.append('title', $('#title').val().trim());
    fd.append('description', $('#description').val().trim());
    fd.append('location', $('#location').val().trim());
    // datetime-local has no timezone; convert to ISO so the server stores the right moment
    fd.append('starts_at', new Date($('#starts_at').val()).toISOString());
    fd.append('ends_at', new Date($('#ends_at').val()).toISOString());
    if (selectedFile) fd.append('image', selectedFile);

    UI.setBusy($btn, true, editing ? 'Saving…' : 'Creating…');
    const opts = selectedFile ? { onProgress: setProgress } : {};
    if (selectedFile) setProgress(0);

    try {
      const res = editing ? await Api.events.update(id, fd, opts) : await Api.events.create(fd, opts);
      dirty = false;
      UI.flash(editing ? 'Changes saved.' : 'Event created. Everyone has been notified.', 'success');
      window.location.href = 'event.html?id=' + encodeURIComponent((res.data && res.data.id) || id);
    } catch (err) {
      UI.setBusy($btn, false);
      $('#progress-wrap').addClass('hidden');
      UI.formAlert($form, err.message);
      $form.find('[data-form-alert]')[0].scrollIntoView({ block: 'center' });
    }
  });
});
