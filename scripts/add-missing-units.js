import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const missingUnits = [
    { code: 'COS10009', name: 'Fundamentals of Computing' },
    { code: 'COS10011', name: 'Web Development Fundamentals' },
    { code: 'COS10003', name: 'Computer Architecture' },
    { code: 'TNE10006', name: 'Technical Communication' },
    { code: 'COS20007', name: 'Database Design and Implementation' },
    { code: 'COS30015', name: 'Advanced Algorithms' },
    { code: 'SWE30011', name: 'Software Quality Assurance' },
    { code: 'COS20015', name: 'Web Application Development' },
    { code: 'COS30017', name: 'Machine Learning' },
    { code: 'SWE20001', name: 'Managing Software Projects' },
    { code: 'TNE30009', name: 'Professional Ethics' },
    { code: 'COS10004', name: 'Discrete Mathematics' },
    { code: 'COS20030', name: 'Operating Systems' },
    { code: 'COS30019', name: 'Cloud Computing' },
    { code: 'COS10022', name: 'Digital Systems' },
    { code: 'COS10082', name: 'Introduction to Cybersecurity' },
    { code: 'COS20083', name: 'Network Security' },
    { code: 'COS20028', name: 'Software Development Methodologies' },
    { code: 'SWE40001', name: 'Software Engineering Project A' },
    { code: 'COS20019', name: 'Mobile Application Development' },
    { code: 'SWE40002', name: 'Software Engineering Project B' },
    { code: 'ICT30005', name: 'Enterprise Systems' },
    { code: 'SWE30012', name: 'Software Architecture' },
];

async function addUnits() {
    try {
        console.log('Adding missing units to database...\n');

        for (const unit of missingUnits) {
            const existing = await prisma.unit.findFirst({
                where: { UnitCode: unit.code },
            });

            if (existing) {
                console.log(`✓ Unit ${unit.code} already exists`);
            } else {
                await prisma.unit.create({
                    data: {
                        UnitCode: unit.code,
                        Name: unit.name,
                        CreditPoints: 12.5,
                        Availability: 'published',
                    },
                });
                console.log(`✓ Added unit: ${unit.code} - ${unit.name}`);
            }
        }

        console.log('\n✅ All missing units have been added successfully!');
    } catch (error) {
        console.error('Error adding units:', error);
    } finally {
        await prisma.$disconnect();
    }
}

addUnits();
