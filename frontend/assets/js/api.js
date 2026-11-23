/**
 * api.js — every call to the backend goes through Api.request().
 *
 * It:
 *  - prefixes CONFIG.API_BASE
 *  - attaches "Authorization: Bearer <token>" when signed in
 *  - sends JSON, or multipart/form-data when given a FormData (file uploads)
 *  - reports upload progress through opts.onProgress(percent)
 *  - turns failures into one shape: { status, message, errors }
 *  - 401 on a protected route -> signs out and returns to login ("session expired")
 *  - 403 -> friendly "no permission" message (the backend's role check said no)
 *
 * All methods return native Promises, so pages can use async/await.
 */
const Api = (function () {

  function request(method, path, data, opts) {
    opts = opts || {};
    const isForm = (typeof FormData !== 'undefined') && data instanceof FormData;

    const settings = {
      url: CONFIG.API_BASE + path,
      method: method,
      headers: {},
      dataType: 'json',
      timeout: opts.timeout || (isForm ? 120000 : 20000)
    };

    const token = Auth.getToken();
    if (token) settings.headers.Authorization = 'Bearer ' + token;

    if (data !== undefined && data !== null) {
      if (isForm) {
        settings.data = data;
        settings.processData = false;
        settings.contentType = false; // browser sets the multipart boundary
      } else if (method === 'GET') {
        settings.data = data; // becomes ?query=string
      } else {
        settings.data = JSON.stringify(data);
        settings.contentType = 'application/json';
      }
    }

    if (isForm && typeof opts.onProgress === 'function') {
      settings.xhr = function () {
        const xhr = $.ajaxSettings.xhr();
        if (xhr.upload) {
          xhr.upload.addEventListener('progress', function (e) {
            if (e.lengthComputable) opts.onProgress(Math.round((e.loaded / e.total) * 100));
          });
        }
        return xhr;
      };
    }

    return new Promise(function (resolve, reject) {
      $.ajax(settings)
        .done(function (res) { resolve(res || {}); })
        .fail(function (xhr, textStatus) { reject(toError(xhr, textStatus, path)); });
    });
  }

  function toError(xhr, textStatus, path) {
    const status = xhr.status;
    const body = xhr.responseJSON || {};
    const errors = Array.isArray(body.errors) ? body.errors.map(function (e) { return e.message || e.msg; }) : [];

    if (status === 0) {
      return {
        status: 0,
        network: true,
        message: textStatus === 'timeout'
          ? 'The server took too long to respond. Try again.'
          : 'Can\'t reach the server. Check your connection and that the backend is running.',
        errors: []
      };
    }

    // Expired or invalid token on a protected route -> back to login.
    // (Login itself also returns 401 for wrong passwords, so skip /auth/ routes.)
    if (status === 401 && path.indexOf('/auth/') !== 0) {
      Auth.logout('expired');
    }

    let message = body.message || 'Something went wrong (error ' + status + ').';
    if (status === 403) {
      message = 'You don\'t have permission to do that. Contact an administrator if you need access.';
    } else if (status >= 500) {
      message = 'The server had a problem handling that request. Try again in a moment.';
    } else if (errors.length) {
      message = errors.join(' ');
    }

    return { status: status, message: message, errors: errors };
  }

  // ---------------------------------------------------------------------
  // Endpoint map (matches backend/src/routes). Notes on backend behaviour
  // the UI has to work around are written next to each group.
  // ---------------------------------------------------------------------
  const get = function (p, q) { return request('GET', p, q); };
  const post = function (p, d, o) { return request('POST', p, d, o); };
  const put = function (p, d, o) { return request('PUT', p, d, o); };
  const patch = function (p, d) { return request('PATCH', p, d); };
  const del = function (p) { return request('DELETE', p); };

  return {
    request: request,

    auth: {
      signup: function (d) { return post('/auth/signup', d); },
      login: function (d) { return post('/auth/login', d); }
    },

    // Admin-only except profile/me. Note: backend doesn't block disabled
    // accounts at login, so login.js checks is_active itself.
    users: {
      list: function (q) { return get('/users', q); },
      get: function (id) { return get('/users/' + id); },
      enable: function (id) { return patch('/users/' + id + '/enable'); },
      disable: function (id) { return patch('/users/' + id + '/disable'); },
      me: function () { return get('/users/profile/me'); },
      updateMe: function (d) { return patch('/users/profile/me', d); }
    },

    // GET returns ALL events (no paging/filtering), so pages filter client-side.
    events: {
      list: function () { return get('/events'); },
      get: function (id) { return get('/events/' + id); },
      create: function (formData, opts) { return post('/events', formData, opts); },
      update: function (id, formData, opts) { return put('/events/' + id, formData, opts); },
      remove: function (id) { return del('/events/' + id); }
    },

    // Cancelling sets status='cancelled'; the backend then refuses a new
    // registration for the same event (409), so the UI explains that.
    registrations: {
      register: function (eventId) { return post('/event-registrations/register', { event_id: eventId }); },
      cancel: function (eventId) { return post('/event-registrations/cancel', { event_id: eventId }); },
      mine: function () { return get('/event-registrations/my-registrations'); },
      attendees: function (eventId) { return get('/event-registrations/event/' + eventId + '/attendees'); }
    },

    // forEvent() is admin-only on the backend. Duplicate feedback -> 409.
    feedback: {
      create: function (d) { return post('/event-feedback', d); },
      update: function (id, d) { return put('/event-feedback/' + id, d); },
      mine: function () { return get('/event-feedback/my-feedback'); },
      forEvent: function (eventId) { return get('/event-feedback/event/' + eventId); }
    },

    // List includes unpublished items; pages hide them from normal users.
    announcements: {
      list: function (q) { return get('/announcements', q || { limit: 100 }); },
      get: function (id) { return get('/announcements/' + id); },
      create: function (formData, opts) { return post('/announcements', formData, opts); },
      update: function (id, formData, opts) { return put('/announcements/' + id, formData, opts); },
      publish: function (id) { return patch('/announcements/' + id + '/publish'); },
      unpublish: function (id) { return patch('/announcements/' + id + '/unpublish'); },
      remove: function (id) { return del('/announcements/' + id); }
    },

    // caption_text is plain text (no caption file), so the promo page
    // builds a WebVTT track from it in the browser.
    promos: {
      list: function (q) { return get('/promos', q || { limit: 100 }); },
      get: function (id) { return get('/promos/' + id); },
      create: function (formData, opts) { return post('/promos', formData, opts); },
      update: function (id, formData, opts) { return put('/promos/' + id, formData, opts); },
      publish: function (id) { return patch('/promos/' + id + '/publish'); },
      unpublish: function (id) { return patch('/promos/' + id + '/unpublish'); },
      remove: function (id) { return del('/promos/' + id); }
    },

    // Returns broadcast + targeted notifications. There is no "mark as read"
    // endpoint, so read state is tracked per user in the browser (layout.js).
    notifications: {
      list: function () { return get('/notifications'); },
      get: function (id) { return get('/notifications/' + id); },
      remove: function (id) { return del('/notifications/' + id); }
    },

    dashboard: {
      admin: function () { return get('/dashboard/admin'); },
      me: function () { return get('/dashboard/me'); }
    }
  };
})();
