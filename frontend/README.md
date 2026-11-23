# CivicEvents frontend

An accessible, responsive frontend for the CivicEvents+ API, built with HTML, Tailwind CSS (play CDN) and jQuery. No build step.

## 1. Run the backend

You need Node.js 18+ and PostgreSQL 15+.

1. Create the database. The name has a hyphen, so it must be in double quotes:
   ```sql
   CREATE DATABASE "civic-events-db";
   ```
2. Create the tables from the `backend` folder:
   ```bash
   psql -U postgres -d civic-events-db -h localhost -p 5432 -f ./migrations/001_create_tables.sql
   ```
3. Edit `backend/.env` with your PostgreSQL credentials. The password variable is `DB_PASS`:
   ```
   DB_USER=postgres
   DB_PASS=your-postgres-password
   DB_HOST=localhost
   DB_PORT=5432
   DB_NAME=civic-events-db
   JWT_SECRET=...
   ```
4. Install and start:
   ```bash
   cd backend
   npm install
   npm run dev
   ```
   The API runs at `http://localhost:4000` (check `http://localhost:4000/health`).

> `npm run db:seed` and `db:reset` fail because `002_seed_data.sql` is not in the repo. Use the `psql` command above instead.

### Creating an admin account

Sign-up through the UI always creates normal users. To make an admin, either:

- send `POST http://localhost:4000/api/auth/signup` from Postman with
  `{ "full_name": "Admin", "email": "admin@example.com", "password": "Admin@1234", "role": "admin" }`, or
- promote an existing user in psql:
  ```sql
  UPDATE users SET role = 'admin' WHERE email = 'admin@example.com';
  ```

## 2. Run the frontend

The frontend is static files. Serve the `frontend` folder with any local server, for example:

- VS Code **Live Server**: right-click `frontend/index.html` → Open with Live Server, or
- `npx http-server frontend -p 5500` from the repository root, then open `http://localhost:5500`.

### Backend URL

The API base URL lives in one place, `frontend/assets/js/config.js`:

```js
API_BASE: 'http://localhost:4000/api'
```

Change it if your backend runs on another host or port. No other environment variables are needed.

## 3. Project structure

```
frontend/
  index.html              entry: sends you to events or login
  login.html, signup.html auth pages
  events.html             events list (search, filters, pagination)
  event.html              event detail: register, feedback, attendees (admin)
  event-form.html         create / edit event with image upload (admin)
  announcements.html      announcements list with inline play
  announcement.html       accessible audio player (keyboard shortcuts, speed, download)
  announcement-form.html  upload / edit announcement (admin)
  promos.html             promos list (cached, lazy-loaded video thumbnails)
  promo.html              video with captions generated from caption_text, transcript
  promo-form.html         upload / edit promo (admin)
  search.html             global search across events, announcements and promos
  my-registrations.html   upcoming / past / cancelled registrations (tabs)
  profile.html            account details, activity, edit name and email
  dashboard.html          admin overview: stats + charts, auto-refresh
  admin-users.html        admin: list, view, enable / disable users
  admin-notifications.html admin: delete notifications (one or many)
  forbidden.html          shown when a normal user opens an admin page
  assets/
    css/app.css           focus styles, skeletons, date sign
    js/config.js          API base URL and upload limits
    js/tailwind.config.js theme colors, fonts, shared button/input classes
    js/auth.js            auth context, token storage, ROLE GUARDS
    js/api.js             one request wrapper + every endpoint
    js/ui.js              toasts, dialogs, loading/empty/error states, validation
    js/layout.js          header, nav, profile menu, notification drawer, footer
    js/pages/*.js         one script per page
```

## 4. Where role-based access is enforced

Search the code for `ROLE GUARD`. There are four kinds:

1. **Page guards** in `auth.js`: `Auth.requireAuth()` and `Auth.requireAdmin()` run first on every page. Admin pages send normal users to `forbidden.html`.
2. **Element guards**: elements with `data-requires="admin"` or `data-requires="user"` are shown or hidden by `Auth.applyRoleVisibility()`.
3. **Render guards**: page scripts only build Edit, Delete and Publish buttons when `Auth.isAdmin()` is true.
4. **Navigation guards** in `layout.js`: nav links have a `requires` field.

These guards are for user experience. The backend's `authenticate` and `authorize(['admin'])` middleware is the real security; the frontend handles its 401 (sign out) and 403 (no permission message) responses in `api.js`.

## 5. Token handling

- "Keep me signed in" off → token in `sessionStorage` (cleared when the tab closes).
- "Keep me signed in" on → token in `localStorage`. This survives restarts but any script on the page can read it, so all API data is escaped before display to reduce XSS risk.
- Tokens expire after 1 hour. The app signs you out at that moment and shows "Your session expired".
- Any 401 from a protected endpoint also signs you out.

## 6. Backend behaviours the UI works around

| Backend behaviour | How the frontend handles it |
|---|---|
| `GET /events` and `GET /announcements` return everything, including unpublished, with no filters | Search, filters, pagination and hiding unpublished items happen in the browser |
| No "mark as read" endpoint for notifications | Read state is stored per user in the browser; the unread badge uses it |
| Cancelled registrations can't be re-registered (returns 409) | The UI warns before cancelling and explains the 409 |
| Promos store captions as plain text (`caption_text`), not a caption file | The promo page builds a WebVTT file in the browser, timed across the video's length, and attaches it as a `<track kind="captions">` that is on by default |
| Announcements have no duration or transcript fields | Length is read from the audio file's metadata; the detail page says when no transcript exists |
| Announcement PUT ignores a new audio file | The edit form only changes the title and published state |
| Create promo always publishes | Saving a promo as a draft creates it, then calls `/unpublish` |
| Event feedback list is admin-only | Admins see the average rating and all feedback; users see and edit their own |
| Events have no `published` field on create/update | The form shows the published switch as always on, with an explanation |
| Deleting an event with registrations fails (no `ON DELETE CASCADE`) | The UI explains the likely cause |
| Disabled users can still log in and use the API | After login, and on every page load, the app checks `is_active` and signs disabled users out |
| No endpoint to create a custom notification | Notifications are created automatically when content is published; admins can delete them on the Notifications admin page |
| `GET /users` has no total count | User pages use Previous / Next, with Next enabled while a full page comes back |
| No search endpoint | The global search loads events, announcements and promos and matches in the browser |
| Signup accepts a `role` field | The signup form never sends it |
