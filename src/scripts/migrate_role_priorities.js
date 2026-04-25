import prisma from '../utils/db/db.js';

/**
 * Migration script to set role priorities based on default order
 * Default order: Superadmin (1), Administrator (2), Course Coordinator (3), Student (4), Viewer (5)
 * Other roles will be assigned incrementing priorities starting from 6
 */
async function migrateRolePriorities() {
    try {
        console.log('Starting role priority migration...');

        // Define default role order
        const defaultRoleOrder = [
            'Superadmin',
            'Administrator',
            'Course Coordinator',
            'Student',
            'Viewer'
        ];

        // Fetch all roles
        const allRoles = await prisma.Role.findMany({
            orderBy: { ID: 'asc' }
        });

        if (allRoles.length === 0) {
            console.log('No roles found in database.');
            return;
        }

        console.log(`Found ${allRoles.length} roles to update.`);

        // Separate roles into default and others
        const defaultRoles = [];
        const otherRoles = [];

        for (const role of allRoles) {
            const defaultIndex = defaultRoleOrder.indexOf(role.Name);
            if (defaultIndex !== -1) {
                defaultRoles.push({ role, priority: defaultIndex + 1 });
            } else {
                otherRoles.push(role);
            }
        }

        // Sort default roles by their priority
        defaultRoles.sort((a, b) => a.priority - b.priority);

        // Assign priorities to other roles starting from 6
        let nextPriority = 6;
        const otherRolesWithPriority = otherRoles.map(role => ({
            role,
            priority: nextPriority++
        }));

        // Combine all roles with their priorities
        const allRolesWithPriorities = [...defaultRoles, ...otherRolesWithPriority];

        // Update roles in database
        console.log('Updating role priorities...');
        for (const { role, priority } of allRolesWithPriorities) {
            await prisma.Role.update({
                where: { ID: role.ID },
                data: { Priority: priority }
            });
            console.log(`  - ${role.Name}: Priority ${priority}`);
        }

        console.log('✓ Role priority migration completed successfully!');
        console.log(`  Total roles updated: ${allRolesWithPriorities.length}`);

    } catch (error) {
        console.error('Error during role priority migration:', error);
        throw error;
    } finally {
        await prisma.$disconnect();
    }
}

// Run the migration
migrateRolePriorities()
    .then(() => {
        console.log('Migration script finished.');
        process.exit(0);
    })
    .catch((error) => {
        console.error('Migration script failed:', error);
        process.exit(1);
    });

