import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

// --- ANSI Color Codes for effective warnings ---
const RED = '\x1b[31m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';
const YELLOW = '\x1b[33m';

// Seed database from INSERT statements (for Prisma exports)
// Run: npm run db:seed:inserts

import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const prisma = new PrismaClient();

async function clearTables() {
    console.log('Clearing existing data...\n');

    // Delete in reverse dependency order
    const tablesToClear = [
        'audit_logs',
        'role_permissions',
        'user_roles',
        '"StudentStudyPlannerAmmendments"',
        '"UnitInSemesterStudyPlanner"',
        '"UnitHistory"',
        '"UnitRequisiteRelationship"',
        '"UnitTermOffered"',
    
        '"user_profiles"',
        '"users"',
        '"Student"',
        '"SemesterInStudyPlannerYear"',
        '"MasterStudyPlanner"',
        '"CourseIntake"',
        '"Major"',
    
        'permissions',
        'roles',
        '"Unit"',
        '"UnitType"',
        '"Term"',
        '"Course"',
        'user_group_access',
    ];

    for (const table of tablesToClear) {
        try {
            await prisma.$executeRawUnsafe(`DELETE FROM ${table};`);
            console.log(`   Cleared ${table}`);
        } catch (error) {
            console.log(`   Could not clear ${table}: ${error.message}`);
        }
    }
    console.log();
}

async function seedFromInserts() {
    try {
        console.log('Starting seeder from INSERT statements...\n');

        // Clear existing data first
        await clearTables();

        // Read the SQL file
        const dumpPath = join(__dirname, '..', 'supabase_dump.sql');
        console.log(`Reading dump file: ${dumpPath}`);
        const sqlContent = readFileSync(dumpPath, 'utf-8');
        console.log('Dump file loaded successfully\n');

        // Split into individual INSERT statements
        const insertStatements = sqlContent
            .split('\n')
            .filter(line => line.trim().startsWith('INSERT INTO'))
            .map(line => line.trim());

        console.log(`Found ${insertStatements.length} INSERT statements\n`);

        if (insertStatements.length === 0) {
            console.log('No INSERT statements found in the file.');
            return;
        }

        // Execute INSERT statements
        console.log('Executing INSERT statements...\n');

        let successCount = 0;
        let errorCount = 0;

        for (let i = 0; i < insertStatements.length; i++) {
            const statement = insertStatements[i];

            try {
                await prisma.$executeRawUnsafe(statement);
                successCount++;

                // Show progress every 100 statements
                if ((i + 1) % 100 === 0) {
                    console.log(`   Processed ${i + 1}/${insertStatements.length} statements...`);
                }
            } catch (error) {
                errorCount++;
                console.error(`   Error in statement ${i + 1}: ${error.message}`);
                console.error(`   Statement: ${statement.substring(0, 100)}...`);

                // Continue with other statements
            }
        }

        console.log('\nSeeding completed!');
        console.log(`   Successful: ${successCount}`);
        console.log(`   Errors: ${errorCount}`);
        console.log(`   Total: ${insertStatements.length}`);

        if (errorCount > 0) {
            console.log('\nSome statements failed. This might be due to:');
            console.log('1. Foreign key constraints');
            console.log('2. Duplicate data');
            console.log('3. Data type mismatches');
            console.log('\nThe successful statements have been inserted.');
        }

    } catch (error) {
        console.error('\nSeeding failed:', error);
        throw error;
    } finally {
        await prisma.$disconnect();
    }
}

async function runSafeSeed() {
    const rl = createInterface({ input, output });

    // The clear and concise warning message
    console.log(`\n${BOLD}${RED}!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!${RESET}`);
    console.log(`${BOLD}${RED}!!! DANGER: IMMINENT DATA LOSS WARNING                    !!!${RESET}`);
    console.log(`${BOLD}${RED}!!!                                                       !!!${RESET}`);
    console.log(`${BOLD}${RED}!!! This command will WIPE SOME DATA from the database.   !!!${RESET}`);
    console.log(`${BOLD}${RED}!!! This action is IRREVERSIBLE.                          !!!${RESET}`);
    console.log(`${BOLD}${RED}!!!                                                       !!!${RESET}`);
    console.log(`${BOLD}${RED}!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!${RESET}\n`);

    const answer = await rl.question(
        `${BOLD}To proceed and destroy all current data, please type "YES" exactly: ${RESET}`
    );

    rl.close();

    if (answer.trim() === 'YES') {
        console.log(`\n${YELLOW}Confirmation received. Proceeding with seed...${RESET}`);
        // Now call the actual seeding logic
        await seedFromInserts();
    } else {
        console.log(`\n${BOLD}${YELLOW}Operation cancelled.${RESET} Database remains untouched.`);
    }
}

// Execute the safe seed wrapper, which includes the prompt.
runSafeSeed();