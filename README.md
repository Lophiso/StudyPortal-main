# StudyPortal
 
 ## Development
 
 - **Install**: `npm install`
 - **Run**: `npm run dev`
 - **Build**: `npm run build`
 
 ## Database (Supabase)
 
 This repo contains SQL migrations under `supabase/migrations/`.
 
 Latest PhD schema additions:
 - `department` (text)
 - `funding_status` (text)
 - `full_title` (text)
 
 Apply the migration in your Supabase project (via Supabase CLI or the SQL editor).
 
 ## Automation (GitHub Actions)
 
 The PhD ingestion cron is triggered by the GitHub Actions workflow:
 - `.github/workflows/daily-hunt.yml`
 
 Required GitHub Secrets:
 - **`APP_BASE_URL`**: Your deployed app base URL (example: `https://your-domain.com`)
 - **`CRON_SECRET`**: Must match `process.env.CRON_SECRET` used by `/api/cron/phd-hunt`
