// Complete database setup script
// Run: npm run db:setup
// This script runs migrations and seeds the database

import { exec } from 'child_process';
import { promisify } from 'util';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const execAsync = promisify(exec);

async function runCommand(command, description) {
    console.log(`\n${description}...`);
    try {
        const { stdout, stderr } = await execAsync(command);
        if (stdout) console.log(stdout);
        if (stderr) console.log(stderr);
        console.log(`✅ ${description} completed`);
        return true;
    } catch (error) {
        console.error(`❌ ${description} failed:`, error.message);
        return false;
    }
}

async function setupDatabase() {
    console.log('🚀 Starting Complete Database Setup\n');
    console.log('This will:');
    console.log('  1. Generate Prisma Client');
    console.log('  2. Run database migrations');
    console.log('  3. Seed the database with data\n');

    // Check if dump file exists
    const dumpPath = join(__dirname, '..', 'supabase_dump.sql');
    if (!existsSync(dumpPath)) {
        console.error('❌ Error: supabase_dump.sql not found!');
        console.error('\nPlease export your database first:');
        console.error('   npm run db:export');
        console.error('\nOr if you\'re setting up from a repository, make sure');
        console.error('the seed file has been committed and pulled.\n');
        process.exit(1);
    }

    console.log('✓ Seed file found\n');

    try {
        // Step 1: Generate Prisma Client
        const step1 = await runCommand('npx prisma generate', '📦 Generating Prisma Client');
        if (!step1) {
            console.error('\n⚠️  Failed to generate Prisma Client. Continuing anyway...');
        }

        // Step 2: Run Migrations
        const step2 = await runCommand('npx prisma migrate deploy', '🔄 Running database migrations');
        if (!step2) {
            console.error('\n❌ Migration failed. Cannot continue.');
            console.error('Please check your DATABASE_URL in .env file.');
            process.exit(1);
        }

        // Step 3: Seed Database
        const step3 = await runCommand('node scripts/seed-from-inserts.js', '🌱 Seeding database');
        if (!step3) {
            console.error('\n❌ Seeding failed. Please check the error above.');
            process.exit(1);
        }

        console.log('\n' + '='.repeat(60));
        console.log('🎉 Database Setup Complete!');
        console.log('='.repeat(60));
        console.log('\nYour database is now ready to use.');
        console.log('\nNext steps:');
        console.log('  1. Start the development server:');
        console.log('     npm run dev');
        console.log('\n  2. Open your browser to:');
        console.log('     http://localhost:3000\n');

    } catch (error) {
        console.error('\n❌ Setup failed:', error.message);
        process.exit(1);
    }
}

setupDatabase();

