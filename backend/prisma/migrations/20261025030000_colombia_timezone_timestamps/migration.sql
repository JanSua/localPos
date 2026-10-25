-- Existing timestamp-without-time-zone values were written as UTC wall time.
-- Preserve that instant when upgrading columns to timezone-aware timestamps.
ALTER TABLE "User"
  ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ(3) USING "createdAt" AT TIME ZONE 'UTC';

ALTER TABLE "Product"
  ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ(3) USING "createdAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "updatedAt" TYPE TIMESTAMPTZ(3) USING "updatedAt" AT TIME ZONE 'UTC';

ALTER TABLE "Customer"
  ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ(3) USING "createdAt" AT TIME ZONE 'UTC';

ALTER TABLE "CustomerDuePayment"
  ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ(3) USING "createdAt" AT TIME ZONE 'UTC';

ALTER TABLE "Invoice"
  ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ(3) USING "createdAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "voidedAt" TYPE TIMESTAMPTZ(3) USING "voidedAt" AT TIME ZONE 'UTC';

ALTER TABLE "Return"
  ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ(3) USING "createdAt" AT TIME ZONE 'UTC';

ALTER TABLE "ApiKey"
  ALTER COLUMN "lastUsedAt" TYPE TIMESTAMPTZ(3) USING "lastUsedAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ(3) USING "createdAt" AT TIME ZONE 'UTC';
