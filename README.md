# Trainee Recruitment Platform — React + Node/Express + PostgreSQL

Same Week 1 scope as before (public application form -> database -> basic
admin list), rebuilt on a plain, explicit stack: React talks to Express over
HTTP, Express talks to Postgres with SQL. No framework magic hiding the
wiring between them.

## Project structure

```
server/              <- Node/Express API
  index.js            <- app entry point, middleware, route mounting
  db/
    pool.js           <- the one shared Postgres connection
    schema.sql        <- run this once to create the applicants table
  routes/
    applicants.js      <- POST (submit) and GET (list) endpoints

client/               <- React app (Vite)
  src/
    main.jsx           <- mounts React onto the page, sets up routing
    App.jsx             <- route definitions (/,/apply,/admin)
    pages/
      HomePage.jsx
      ApplyPage.jsx      <- the form: useState + fetch()
      AdminPage.jsx       <- useEffect + fetch() to list applicants
```

Two separate apps, two separate `npm install` steps, and you'll run them in
two separate terminal windows. That's normal for this architecture — it's
the explicit version of what Next.js was doing in one process.

## Setup (MySQL version)

### 1. Use your existing MySQL database
You already created a database in MySQL Workbench — no new provider needed.
Just confirm you know its host, port, username, password, and database name.

### 2. Create the table
Open a SQL tab in MySQL Workbench connected to your database, paste in the
contents of `server/db/schema.sql`, and run it (the lightning bolt icon).

### 3. Set up and run the server
```bash
cd server
cp .env.example .env
# edit .env with your real MySQL host/user/password/database name
npm install
npm run dev
```
You should see `Server running on http://localhost:4000`. Test it's alive:
```bash
curl http://localhost:4000/api/health
```

### 4. Set up and run the client (in a NEW terminal, leave the server running)
```bash
cd client
cp .env.example .env
npm install
npm run dev
```
Open the URL Vite prints (usually http://localhost:5173).

## Try this to understand the pieces

1. Submit an application through the UI, then check the `/admin` page shows it.
2. Stop the server (Ctrl+C in its terminal) and try submitting the form again
   — you should see "Could not reach the server." That's the `catch` block
   in `ApplyPage.jsx` doing its job, and it's a good way to *feel* the
   client/server boundary that Next.js used to hide from you.
3. Use `curl` to hit the API directly, bypassing React entirely, and notice
   validation still runs:
   ```bash
   curl -X POST http://localhost:4000/api/applicants \
     -H "Content-Type: application/json" \
     -d '{"fullName":"Test","phoneNumber":"0700000000","age":15,"idNumber":"123"}'
   ```
   You should get back a 400 with an age validation error — proof that
   validation lives on the server, not just in the React form.
4. Open `server/routes/applicants.js` and find the duplicate-ID handling
   (MySQL error code `ER_DUP_ENTRY`). Submit the same ID number twice and
   watch it trigger.

## What's still missing (Week 2+)

- Authentication on `/admin` and the `GET /api/applicants` route — right now
  anyone who finds the URL can see applicant data. Don't deploy this
  publicly yet.
- `companies` / `batches` tables so applicants are matched to a specific
  company's request rather than one flat list.
- Document upload (ID copy, photo, personal accident cover).
- SMS notifications on status changes.

Refer back to the original project spec document for the full roadmap — the
data model and phases are unchanged, only the implementation stack is
different.
