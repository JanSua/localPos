ALTER TABLE "ShopSettings"
ADD COLUMN "nit" TEXT;

ALTER TABLE "ShopSettings"
ALTER COLUMN "allowNegativeStock" SET DEFAULT true;
