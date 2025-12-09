// Temporary helper to force Prisma to use DATABASE_URL from .env
// Usage: node scripts/force-push.cjs

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function loadDatabaseUrl() {
  const envPath = path.resolve(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) {
    throw new Error(`.env file not found at ${envPath}`);
  }

  const content = fs.readFileSync(envPath, 'utf8');
  const lines = content.split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    if (trimmed.startsWith('DATABASE_URL=')) {
      // Support values with = inside by splitting only on first =
      const [, ...rest] = trimmed.split('=');
      const value = rest.join('=');
      if (!value) {
        throw new Error('DATABASE_URL is empty in .env');
      }
      return value.replace(/^"|"$/g, '');
    }
  }

  throw new Error('DATABASE_URL not found in .env');
}

function main() {
  const dbUrl = loadDatabaseUrl();
  console.log('Using DATABASE_URL from .env:', dbUrl.replace(/:[^:@]*@/, ':****@'));

  try {
    execSync('npx prisma db push', {
      stdio: 'inherit',
      env: { ...process.env, DATABASE_URL: dbUrl },
    });
    console.log('Prisma db push completed successfully.');
  } catch (err) {
    console.error('Prisma db push failed:', err.message || err);
    process.exit(1);
  }
}

main();
