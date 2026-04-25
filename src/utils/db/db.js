// lib/prisma.js
import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis

const prisma = globalForPrisma.prisma || new PrismaClient({
  log: ['error', 'warn'], // optional
  transactionOptions: {
    maxWait: 10000, // Maximum time to wait for a transaction slot (10s)
    timeout: 30000, // Maximum time a transaction can run (30s)
  },
})

if (process.env.NEXT_PUBLIC_MODE !== 'PROD') {
  globalForPrisma.prisma = prisma
}

export default prisma
