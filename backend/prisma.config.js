// Prisma 7 keeps the Migrate/CLI connection URL here; the PrismaClient
// constructor uses its own PostgreSQL adapter (see src/lib/prisma.js).
require('dotenv').config();

const { defineConfig } = require('prisma/config');

module.exports = defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    url: process.env.DATABASE_URL,
  },
});
