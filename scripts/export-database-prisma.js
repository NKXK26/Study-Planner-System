// Export database using Prisma (backup method when pg_dump fails)
// Run: npm run db:export:prisma

import { PrismaClient } from '@prisma/client';
import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const prisma = new PrismaClient();

// Define the order of tables based on foreign key dependencies
const TABLE_ORDER = [
    // Level 1: No dependencies
    'user_group_access',
    'Term',
    'UnitType',
    'Course',
    'Unit',
    'roles',
    'permissions',

    // Level 2: Depends on Level 1
    'Major',
    'UnitTermOffered',
    'UnitRequisiteRelationship',
    'role_permissions',

    // Level 3: Depends on Level 2
    'CourseIntake',

    // Level 4: Depends on Level 3
    'MasterStudyPlanner',
    'Student',
    'users',

    // Level 5: Depends on Level 4
    'SemesterInStudyPlannerYear',
    'UnitHistory',
    'user_profiles',

    // Level 6: Depends on Level 5
    'UnitInSemesterStudyPlanner',
    'StudentStudyPlannerAmmendments',
    'user_roles',
    'audit_logs'
];

function generateInsertSQL(tableName, data) {
    if (!data || data.length === 0) return '';

    const sqlStatements = [];

    for (const record of data) {
        const columns = Object.keys(record);
        const values = Object.values(record).map(val => {
            if (val === null) return 'NULL';
            if (typeof val === 'string') return `'${val.replace(/'/g, "''")}'`;
            if (val instanceof Date) return `'${val.toISOString()}'`;
            return val;
        });

        const columnsStr = columns.map(col => `"${col}"`).join(', ');
        const valuesStr = values.join(', ');

        sqlStatements.push(`INSERT INTO "${tableName}" (${columnsStr}) VALUES (${valuesStr});`);
    }

    return sqlStatements.join('\n');
}

async function exportDatabasePrisma() {
    try {
        console.log('Starting Prisma-based database export...\n');

        const outputPath = join(__dirname, '..', 'supabase_dump.sql');
        let sqlContent = '-- Database export via Prisma\n-- Generated on: ' + new Date().toISOString() + '\n\n';

        console.log('Exporting data from each table...\n');

        for (const tableName of TABLE_ORDER) {
            try {
                console.log(`Exporting ${tableName}...`);

                let data = [];

                // Map table names to Prisma model names
                const modelMap = {
                    'user_group_access': 'user_group_access',
                    'Term': 'term',
                    'UnitType': 'unitType',
                    'Course': 'course',
                    'Unit': 'unit',
                    'roles': 'role',
                    'permissions': 'permission',
                    'Major': 'major',
                    'UnitTermOffered': 'unitTermOffered',
                    'UnitRequisiteRelationship': 'unitRequisiteRelationship',
                    'role_permissions': 'rolePermission',
                    'CourseIntake': 'courseIntake',
                    'MasterStudyPlanner': 'masterStudyPlanner',
                    'Student': 'student',
                    'users': 'users',
                    'SemesterInStudyPlannerYear': 'semesterInStudyPlannerYear',
                    'UnitHistory': 'unitHistory',
                    'user_profiles': 'userProfile',
                    'UnitInSemesterStudyPlanner': 'unitInSemesterStudyPlanner',
                    'StudentStudyPlannerAmmendments': 'studentStudyPlannerAmmendments',
                    'user_roles': 'userRole',
                    'audit_logs': 'auditLog'
                };

                const modelName = modelMap[tableName];
                if (modelName && prisma[modelName]) {
                    data = await prisma[modelName].findMany();
                    console.log(`   Found ${data.length} records`);
                } else {
                    console.log(`   Skipping ${tableName} (no Prisma model found)`);
                    continue;
                }

                if (data.length > 0) {
                    sqlContent += `-- Data for table: ${tableName}\n`;
                    sqlContent += generateInsertSQL(tableName, data);
                    sqlContent += '\n\n';
                }

            } catch (error) {
                console.log(`   Error exporting ${tableName}: ${error.message}`);
                // Continue with other tables
            }
        }

        // Write to file
        writeFileSync(outputPath, sqlContent, 'utf-8');

        console.log('\n✅ Database exported successfully!');
        console.log(`   File: ${outputPath}`);
        console.log(`\nYou can now use this file to seed your database by running:`);
        console.log(`   npm run db:seed`);

        // Show summary
        const lines = sqlContent.split('\n').filter(line => line.startsWith('INSERT INTO'));
        console.log(`\nSummary:`);
        console.log(`   Total INSERT statements: ${lines.length}`);

    } catch (error) {
        console.error('\n❌ Export failed:', error.message);
        console.error('\nMake sure:');
        console.error('1. Your DATABASE_URL in .env is correct');
        console.error('2. You have access to the database');
        console.error('3. Prisma can connect to the database');
        process.exit(1);
    } finally {
        await prisma.$disconnect();
    }
}

exportDatabasePrisma();
