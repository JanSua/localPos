ALTER TABLE "InvoiceItem" DROP CONSTRAINT "InvoiceItem_productId_fkey";
ALTER TABLE "InvoiceItem" ALTER COLUMN "productId" DROP NOT NULL;
ALTER TABLE "InvoiceItem"
ADD CONSTRAINT "InvoiceItem_productId_fkey"
FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ReturnItem" DROP CONSTRAINT "ReturnItem_productId_fkey";
ALTER TABLE "ReturnItem" ALTER COLUMN "productId" DROP NOT NULL;
ALTER TABLE "ReturnItem"
ADD CONSTRAINT "ReturnItem_productId_fkey"
FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
