# DOF USA HUB

Internal portal starter app for DOF LAB USA.

## Features included

- Admin login structure with Supabase Auth
- Attendance clock in / clock out
- Timezone and location fields
- Task creation and assignment
- Calendar event creation
- Field work record
- Admin-only attendance CSV export
- Ready for future employee accounts

## Local setup

1. Install Node.js
2. Run:

```bash
npm install
npm run dev
```

## Supabase setup

Create a Supabase project, then copy `.env.example` to `.env` and fill in:

```bash
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_ADMIN_EMAIL=smyoo@doflab.com
```

Run the SQL in `supabase_schema.sql` inside Supabase SQL Editor.

## Deploy

Push this folder to GitHub and connect it to Netlify or Vercel.

Build command:

```bash
npm run build
```

Publish directory:

```bash
dist
```
