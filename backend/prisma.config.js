// Prisma 7 keeps the Migrate/CLI connection URL here; the PrismaClient
// constructor uses its own PostgreSQL adapter (see src/lib/prisma.js).
require('dotenv').config();

const { defineConfig } = require('prisma/config');

const connectionUrl = new URL('postgresql://localhost');
connectionUrl.hostname = process.env.POSTGRES_HOST || 'localhost';
connectionUrl.port = process.env.POSTGRES_PORT || '5432';
connectionUrl.username = process.env.POSTGRES_USER || 'nodedr';
connectionUrl.password = process.env.POSTGRES_PASSWORD || '';
connectionUrl.pathname = `/${process.env.POSTGRES_DB || 'nodedrpos'}`;
connectionUrl.searchParams.set('schema', 'public');

module.exports = defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    url: connectionUrl.toString(),
  },
});
