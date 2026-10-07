const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');

const adapter = new PrismaPg({
  host: process.env.POSTGRES_HOST || 'localhost',
  port: Number(process.env.POSTGRES_PORT || 5432),
  database: process.env.POSTGRES_DB || 'nodedrpos',
  user: process.env.POSTGRES_USER || 'nodedr',
  password: process.env.POSTGRES_PASSWORD,
}, { schema: 'public' });

const prisma = new PrismaClient({ adapter });

module.exports = prisma;
