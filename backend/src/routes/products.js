const express = require('express');
const { z } = require('zod');
const prisma = require('../lib/prisma');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { notifyStockChange } = require('../lib/webhooks');

const router = express.Router();
router.use(requireAuth);

function presentProduct(product, user) {
  if (user.role === 'admin') return product;
  const { purchasePrice, ...visibleProduct } = product;
  void purchasePrice;
  return visibleProduct;
}

// No `.default()` here on purpose — see settings.js for why. `.default()`
// fires whenever a key is absent, which would make `productSchema.partial()`
// silently reset taxRate/discountValue/stock to 0 on any partial update
// that omits them (e.g. the Inventory "adjust stock" quick action, which
// only ever sends `{ stock }`). `createSchema` adds the defaults back for
// the POST (create) route, where every field really is required-or-defaulted.
const fields = {
  barcode: z.string().trim().min(1).max(64),
  // Optional key used only to link this product to an external system over
  // the External Stock API (see routes/external.js) — most products never
  // set this. Empty string normalizes to null (Prisma's unique index on a
  // nullable column allows any number of nulls, but not two empty strings).
  sku: z
    .string()
    .trim()
    .max(64)
    .optional()
    .or(z.literal(''))
    .transform((v) => (v ? v : null)),
  name: z.string().trim().min(1).max(200),
  category: z.string().trim().max(80).optional().or(z.literal('')),
  hsn: z.string().trim().max(20).optional().or(z.literal('')),
  unit: z.string().trim().max(10).optional().or(z.literal('')),
  purchasePrice: z.number().min(0),
  sellingPrice: z.number().min(0),
  taxRate: z.number().min(0).max(100),
  // A standing per-product discount — either a percent (capped at 100) or a
  // flat currency amount (capped against sellingPrice, checked in the
  // route below since that needs both fields together, not just one).
  discountType: z.enum(['percent', 'amount']).nullish(),
  discountValue: z.number().min(0),
  stock: z.number().int().min(0),
};
const createSchema = z.object({
  ...fields,
  taxRate: fields.taxRate.default(0),
  discountValue: fields.discountValue.default(0),
  stock: fields.stock.default(0),
});
const updateSchema = z.object(fields).partial();

function normalizeDiscount(data) {
  // A discountType with no value (or vice versa) doesn't make sense —
  // treat "no type" as "no discount" regardless of what discountValue holds.
  if (!data.discountType) {
    if ('discountType' in data || 'discountValue' in data) {
      data.discountType = null;
      data.discountValue = 0;
    }
    return data;
  }
  if (data.discountType === 'percent' && data.discountValue > 100) {
    throw Object.assign(new Error('El descuento porcentual no puede superar el 100 %.'), { status: 400 });
  }
  if (data.discountType === 'amount' && data.sellingPrice != null && data.discountValue > data.sellingPrice) {
    throw Object.assign(new Error('El descuento fijo no puede superar el precio de venta.'), { status: 400 });
  }
  return data;
}

// GET /api/products?q=search
router.get('/', async (req, res) => {
  const q = (req.query.q || '').toString().trim();
  const products = await prisma.product.findMany({
    where: q
      ? { OR: [{ name: { contains: q } }, { barcode: { contains: q } }, { category: { contains: q } }] }
      : undefined,
    orderBy: { name: 'asc' },
  });
  res.json(products.map((product) => presentProduct(product, req.user)));
});

// GET /api/products/low-stock — dashboard widget
router.get('/low-stock', async (req, res) => {
  const settings = await prisma.shopSettings.findFirst();
  const threshold = settings?.lowStockAlert ?? 5;
  const products = await prisma.product.findMany({
    where: { stock: { lte: threshold } },
    orderBy: { stock: 'asc' },
  });
  res.json({ threshold, products: products.map((product) => presentProduct(product, req.user)) });
});

// GET /api/products/barcode/:barcode — scanner lookup
router.get('/barcode/:barcode', async (req, res) => {
  const product = await prisma.product.findUnique({ where: { barcode: req.params.barcode } });
  if (!product) return res.status(404).json({ error: 'No se encontró el producto.' });
  res.json(presentProduct(product, req.user));
});

router.post('/', requireAdmin, async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Los datos del producto no son válidos.', details: parsed.error.flatten() });
  }
  const existing = await prisma.product.findUnique({ where: { barcode: parsed.data.barcode } });
  if (existing) return res.status(409).json({ error: 'Ya existe un producto con ese código de barras.', product: existing });
  if (parsed.data.sku) {
    const existingSku = await prisma.product.findUnique({ where: { sku: parsed.data.sku } });
    if (existingSku) return res.status(409).json({ error: 'El SKU ya está vinculado a otro producto.', product: existingSku });
  }

  let data;
  try {
    data = normalizeDiscount(parsed.data);
  } catch (err) {
    return res.status(err.status || 400).json({ error: err.message });
  }
  const product = await prisma.product.create({ data });
  res.status(201).json(product);
});

router.put('/:id', requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'El identificador del producto no es válido.' });

  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Los datos del producto no son válidos.', details: parsed.error.flatten() });
  }
  let data;
  try {
    data = normalizeDiscount(parsed.data);
  } catch (err) {
    return res.status(err.status || 400).json({ error: err.message });
  }
  try {
    const product = await prisma.product.update({ where: { id }, data });
    if ('stock' in data && product.sku) {
      notifyStockChange([{ sku: product.sku, stock: product.stock }]);
    }
    res.json(product);
  } catch (err) {
    if (err.code === 'P2002') {
      return res.status(409).json({ error: 'El SKU ya está vinculado a otro producto.' });
    }
    if (err.code === 'P2025') return res.status(404).json({ error: 'No se encontró el producto.' });
    console.error(err);
    res.status(500).json({ error: 'No se pudo actualizar el producto.' });
  }
});

router.delete('/:id', requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'El identificador del producto no es válido.' });
  try {
    await prisma.product.delete({ where: { id } });
    res.status(204).end();
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'No se encontró el producto.' });
    console.error(err);
    res.status(500).json({ error: 'No se pudo eliminar el producto.' });
  }
});

module.exports = router;
