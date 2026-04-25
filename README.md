# Student Study Planner System
[Website Documentation](https://student-study-planner-docs.netlify.app)

## Description

This is a centralized Student Study Planner System designed to streamline unit planning and management for university students. It is built using **Next.js**, **Supabase**, **Prisma**, and containerized using **Docker** for local Supabase development.

---

## Prerequisites

Ensure the following are ready on your system/accounts:

- [Docker](https://docs.docker.com/get-docker/) – for local Supabase instance (optional)
- [Node.js and npm](https://nodejs.org/) – for running the application
- [Supabase](https://supabase.com/) Project – to obtain Project URL and Anon Key, and host your Postgres database
- [Microsoft Entra ID (Azure AD)](https://entra.microsoft.com/) Application – to obtain OAuth `clientId` and `authority`
  - Register an app, enable Accounts in your tenant, and collect:
    - Application (client) ID → `NEXT_PUBLIC_CLIENT_ID`
    - Directory (tenant) ID → used in `NEXT_PUBLIC_AUTHORITY` (e.g. `https://login.microsoftonline.com/<tenant_id>`)
    - Add Redirect URIs (Web): `http://localhost:3000` (dev) and your production origin
    - Add Logout Redirect URIs accordingly
- A Gmail account with App Password – to send emails via SMTP
  - Gmail address → `GMAIL_EMAIL`
  - App password (16 characters) → `GMAIL_APP_PW`

Install Supabase CLI (optional for local dev):
```bash
npm install -g supabase
```
## Clone the Repository:
 ```bash
git clone https://github.com/hamm0208/student_study_planner
cd student-study-planner-system
```
Install Dependencies:
 ```bash
npm install
```
## Start Local Supabase Instance:
 ```bash
npx supabase start
```
## Push Prisma Schema to Database:
 ```bash
npx prisma db push
```
## Generate Prisma Client:
 ```bash
npx prisma generate
```
## Environment Variables (.env)
Create a `.env` file in your project root. Below is a complete example:
```cmd title="student-study-planner-system/.env"
NEXT_PUBLIC_SERVER_URL = http://localhost:3000

#Connection to Local Supabase (Docker)
DATABASE_URL = postgresql://postgres:postgres@127.0.0.1:54322/postgres
DIRECT_URL = ""

# Connection to Cloud Supabase (Session Poller)
# DATABASE_URL="postgres://postgres.<project-ref>:<password>@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true"
# DIRECT_URL="postgres://postgres.<project-ref>:<password>@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres"
  
# Connection to Cloud Supabase (Dedicated Pooler)
# DATABASE_URL="postgres://postgres:<password>@db.<project-ref>.supabase.co:6543/postgres?pgbouncer=true"
# DIRECT_URL="postgres://postgres:<password>@db.<project-ref>.supabase.co:5432/postgres"

#MODE OF THE PROGRAM
NEXT_PUBLIC_MODE = "DEV" OR "PROD"

# AZURE SETTINGS
# OAUTH CONFIGURATION
NEXT_PUBLIC_CLIENT_ID = <your-client-id>
NEXT_PUBLIC_AUTHORITY = <your-authority-key>

# LOCAL REDIRECT URI
NEXT_PUBLIC_REDIRECTURI = http://localhost:3000/view/dashboard
NEXT_PUBLIC_POSTLOGOUTREDIRECTURI = http://localhost:3000
  
# NODEMAILER SETTINGS
#GMAIL CREDENTIALS FOR NODEMAILER
GMAIL_EMAIL= <your-gmail-address>
GMAIL_APP_PW = <your-gmail-app-password>

# Default User Group ID for new users
DEFAULT_USER_GROUP_ID="1"
DEFAULT_USER_ROLE="Viewer"
  
# Turn whitelist on or off
WHITELIST_MODE = "false"

# For JWT Token
SESSION_SECRET = GENERATE-ANY-32-RANDOM-CHARACTERS

# Optional
NEXT_PUBLIC_DB_URL = "https://<project-ref>.supabase.co"
NEXT_PUBLIC_ANON_KEY = <your-anon-key> 
NEXT_PUBLIC_SUPABASE_STORAGE_NAME = "students-study-planners"

```

Notes:
- Replace placeholders with your actual values.
- For production, set `NEXT_PUBLIC_SERVER_URL` to your deployed origin and update MSAL redirect/logout URIs accordingly.
- `NEXT_PUBLIC_DB_URL` and `NEXT_PUBLIC_ANON_KEY` come from your Supabase project settings.
- If you run Supabase locally via CLI, ensure `DATABASE_URL` matches the local instance.

## Database Setup and Seeding

### Quick Setup (New Installation)

After setting up your `.env` file and running migrations, seed your database:

```bash
# Complete database setup (migrations + seed)
npm run db:setup

# Or step by step:
npx prisma migrate deploy
npm run db:seed
```

### Exporting Your Data

After you've inserted all required data into the database:

```bash
# Export to SQL file (optional)
npm run db:export

# This creates supabase_dump.sql that you can commit to git (optional)
git add supabase_dump.sql
git commit -m "Add database seed data"
```

### Available Database Commands

| Command | Description |
|---------|-------------|
| `npm run db:setup` | Complete setup: migrations + seed |
| `npm run db:export` | Export current database to SQL file |
| `npm run db:seed` | Import data from SQL file |
| `npx prisma studio` | Open database GUI |

---

## Running the Application

```bash
npm run dev
```

The application will be available at `http://localhost:3000`
