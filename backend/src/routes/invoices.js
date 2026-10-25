const express = require('express');
const { z } = require('zod');
const prisma = require('../lib/prisma');
const { requireAuth, requireAdmin, verifyPassword } = require('../middleware/auth');
const { computeSale, round2 } = require('../lib/pricing');
const { notifyStockChange } = require('../lib/webhooks');

const router = express.Router();
const { addDays, bogotaDayStart, dateKeyInBogota, parseBogotaDate } = require('../lib/colombia-time');
router.use(requireAuth);

const checkoutSchema = z
  .object({
    customerName: z.string().trim().max(200).optional().or(z.literal('')),
    customerPhone: z.string().trim().max(30).optional().or(z.literal('')),
    items: z
      .array(
        z.object({
          productId: z.number().int().positive(),
          quantity: z.number().int().positive(),
        })
      )
      .default([]),
    discountType: z.enum(['percent', 'amount']).nullish(),
    discountValue: z.number().min(0).default(0),
    pointsRedeemed: z.number().int().min(0).default(0),
    paymentMethod: z.enum(['CASH', 'UPI', 'TRANSFER', 'CARD']).default('CASH'),
    amountPaid: z.number().min(0).default(0),
    // Old outstanding due the customer chooses to clear as part of this bill.
    // Added on top of the goods total for what the cashier collects.
    duePaid: z.number().min(0).default(0),
    // Items being returned on this bill, grouped by the original invoice they
    // were sold on. refundAmount is optional per line (defaults to the price
    // originally charged for that quantity) so the cashier can refund less.
    returns: z
      .array(
        z.object({
          invoiceId: z.number().int().positive(),
          items: z
            .array(
              z.object({
                invoiceItemId: z.number().int().positive(),
                quantity: z.number().int().positive(),
                refundAmount: z.number().min(0).optional(),
              })
            )
            .min(1),
        })
      )
      .default([]),
    // How to settle a refund that exceeds the purchase: pay it out in cash or
    // keep it as reusable store credit on the customer.
    refundMode: z.enum(['CASH', 'CREDIT']).default('CASH'),
    // Existing store credit the customer spends on this bill.
    creditApplied: z.number().min(0).default(0),
  })
  .refine((d) => d.items.length > 0 || d.returns.length > 0 || d.duePaid > 0, {
    message: 'Add an item to sell, a return, or a previous due to collect',
  });

async function nextInvoiceNumber(tx) {
  const count = await tx.invoice.count();
  const year = dateKeyInBogota().slice(0, 4);
  return `INV-${year}-${String(count + 1).padStart(5, '0')}`;
}

// POST /api/invoices — finalize a sale. Everything money-related (prices,
// tax, discount caps, loyalty value) is computed server-side from the
// catalog and settings; the client only sends product ids, quantities, and
// intent (discount/points/payment). Fully transactional.
router.post('/', async (req, res) => {
  const parsed = checkoutSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Los datos enviados no son válidos.', details: parsed.error.flatten() });
  }
  const body = parsed.data;

  // Step-up re-auth: only a bill that actually returns/refunds something
  // needs the password re-confirmed — the overwhelming majority of
  // checkouts are plain sales and must not be interrupted by this.
  if (body.returns.length > 0) {
    const ok = await verifyPassword(req.user.id, req.body?.confirmPassword);
    if (!ok) {
      return res.status(401).json({ error: 'Confirma tu contraseña para procesar este reembolso.', code: 'PASSWORD_CONFIRM_REQUIRED' });
    }
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const settings = await tx.shopSettings.findFirst();
      if (!settings) throw Object.assign(new Error('La configuración de la tienda no está disponible.'), { status: 400 });

      const productIds = body.items.map((i) => i.productId);
      const products = await tx.product.findMany({ where: { id: { in: productIds } } });
      const productMap = new Map(products.map((p) => [p.id, p]));

      const lines = [];
      for (const item of body.items) {
        const product = productMap.get(item.productId);
        if (!product) throw Object.assign(new Error(`No se encontró el producto ${item.productId}.`), { status: 404 });
        if (!settings.allowNegativeStock && product.stock < item.quantity) {
          throw Object.assign(
            new Error(`Existencias insuficientes para "${product.name}" (disponibles: ${product.stock}; solicitadas: ${item.quantity}).`),
            { status: 409 }
          );
        }
        lines.push({ product, quantity: item.quantity });
      }

      // Resolve customer (needed for loyalty). Match by phone; create if new
      // and a name was given. Cap redeemable points at the customer's balance.
      let customer = null;
      if (body.customerPhone) {
        customer = await tx.customer.findUnique({ where: { phone: body.customerPhone } });
        if (!customer && body.customerName) {
          customer = await tx.customer.create({
            data: { name: body.customerName, phone: body.customerPhone },
          });
        }
      }

      let pointsRedeemed = body.pointsRedeemed;
      if (!settings.loyaltyEnabled || !customer) pointsRedeemed = 0;
      if (customer && pointsRedeemed > customer.loyaltyPoints) pointsRedeemed = customer.loyaltyPoints;

      const computed = computeSale(lines, {
        discountType: body.discountType || null,
        discountValue: body.discountValue,
        pointsRedeemed,
        settings,
      });

      const saleTotal = computed.totalAmount;

      // --- Returns processed as part of this bill --------------------------
      // Each returned line is validated against its ORIGINAL invoice: the item
      // must belong to that invoice and the quantity can't exceed what's still
      // returnable (sold minus already returned). The refund defaults to what
      // was originally charged for that quantity and can only be lowered, never
      // raised above it — you can't refund more than the customer paid.
      let returnValue = 0;
      const restock = new Map();
      const returnRecords = [];
      for (const grp of body.returns) {
        const original = await tx.invoice.findUnique({ where: { id: grp.invoiceId }, include: { items: true } });
        if (!original) throw Object.assign(new Error(`No se encontró la factura ${grp.invoiceId} para la devolución.`), { status: 404 });
        const itemMap = new Map(original.items.map((it) => [it.id, it]));
        const lines = [];
        let groupRefund = 0;
        for (const rl of grp.items) {
          const invItem = itemMap.get(rl.invoiceItemId);
          if (!invItem) throw Object.assign(new Error('No se encontró el artículo devuelto en esa factura.'), { status: 404 });
          const already = await tx.returnItem.aggregate({
            where: { invoiceItemId: invItem.id },
            _sum: { quantity: true },
          });
          const returnable = invItem.quantity - (already._sum.quantity || 0);
          if (rl.quantity > returnable) {
            throw Object.assign(            new Error(`Solo se pueden devolver ${returnable} unidades de "${invItem.name}".`), { status: 409 });
          }
          const maxRefund = round2((invItem.total / invItem.quantity) * rl.quantity);
          const refund = rl.refundAmount != null ? round2(Math.min(Math.max(0, rl.refundAmount), maxRefund)) : maxRefund;
          groupRefund = round2(groupRefund + refund);
          returnValue = round2(returnValue + refund);
          if (invItem.productId != null) {
            restock.set(invItem.productId, (restock.get(invItem.productId) || 0) + rl.quantity);
          }
          lines.push({
            invoiceItemId: invItem.id,
            productId: invItem.productId,
            name: invItem.name,
            quantity: rl.quantity,
            refundAmount: refund,
          });
        }
        returnRecords.push({ invoiceId: original.id, customerId: original.customerId, groupRefund, lines });
      }

      // --- Store credit the customer spends on this bill -------------------
      // Capped at the balance AND at what's still owed after returns, so
      // credit only ever reduces the payable — it can never be cashed out by
      // "spending" more of it than the purchase is worth.
      let creditApplied = 0;
      if (body.creditApplied > 0) {
        if (!customer) throw Object.assign(new Error('Se requiere un cliente para usar el saldo a favor.'), { status: 400 });
        creditApplied = round2(Math.min(body.creditApplied, customer.creditBalance, Math.max(0, saleTotal - returnValue)));
      }

      // Net the returns and any spent credit against the sale. A positive net
      // is what the customer still pays; a negative net is money owed back.
      const netBill = round2(saleTotal - returnValue - creditApplied);
      const payable = round2(Math.max(0, netBill));
      const grossRefund = round2(Math.max(0, -netBill));
      let refundMode = null;
      if (grossRefund > 0) {
        refundMode = body.refundMode;
        if (refundMode === 'CREDIT' && !customer) {
          throw Object.assign(new Error('Se requiere un cliente para conservar el reembolso como saldo a favor.'), { status: 400 });
        }
      }

      // Old due the customer wants cleared on this bill, capped at what they
      // actually owe (never raised by anything the client sends).
      let duePaidIntent = 0;
      if (body.duePaid > 0) {
        if (!customer) {
          throw Object.assign(new Error('Se requiere un cliente con teléfono para pagar un saldo pendiente anterior.'), { status: 400 });
        }
        duePaidIntent = round2(Math.min(body.duePaid, customer.totalDue));
      }

      // Every source of money on this bill goes into ONE pool before being
      // allocated, in order: goods first, then the old due, then whatever's
      // left goes back to the customer as change/refund. Pooling the gross
      // refund together with tendered cash is the key fix here — a customer
      // returning something worth more than what they're buying can have
      // that refund fund an old-due clearance directly, with no fresh cash
      // changing hands. The previous version only pulled from tendered cash,
      // so a due-clear requested on a pure-return bill (nothing to "tender")
      // silently never applied — the balance just sat there unchanged.
      const tenderedCash = body.paymentMethod === 'CASH' ? body.amountPaid : payable + duePaidIntent;
      const pool = round2(tenderedCash + grossRefund);
      const amountPaid = round2(Math.min(pool, payable));
      const afterGoods = round2(Math.max(0, pool - amountPaid));
      const previousDuePaid = round2(Math.min(duePaidIntent, afterGoods));
      const leftover = round2(Math.max(0, afterGoods - previousDuePaid));
      // Only ever one of these is nonzero: a change-y "leftover" reads as
      // GST/receipt "Change" on an ordinary purchase, and as "Refund" on a
      // bill whose net was a return/credit overage.
      const changeDue = grossRefund > 0 ? 0 : leftover;
      const refundValue = grossRefund > 0 ? leftover : 0;

      // Paying short of the net payable becomes a new due — needs a customer.
      const dueAmount = round2(Math.max(0, payable - amountPaid));
      if (dueAmount > 0 && !customer) {
        throw Object.assign(
          new Error('Se requiere un cliente con teléfono para registrar un pago parcial o un saldo pendiente.'),
          { status: 400 }
        );
      }

      const invoiceNumber = await nextInvoiceNumber(tx);
      const created = await tx.invoice.create({
        data: {
          invoiceNumber,
          customerId: customer?.id ?? null,
          customerName: body.customerName || customer?.name || 'Walk-in Customer',
          customerPhone: body.customerPhone || null,
          subtotal: computed.subtotal,
          discountType: computed.discountType,
          discountValue: computed.discountValue,
          discountAmount: computed.discountAmount,
          taxAmount: computed.taxAmount,
          loyaltyDiscount: computed.loyaltyDiscount,
          totalAmount: computed.totalAmount,
          paymentMethod: body.paymentMethod,
          amountPaid,
          changeDue,
          dueAmount,
          previousDuePaid,
          returnValue,
          creditApplied,
          refundValue,
          refundMode,
          pointsRedeemed: computed.pointsRedeemed,
          pointsEarned: computed.pointsEarned,
          items: { create: computed.items },
        },
        include: { items: true },
      });

      if (previousDuePaid > 0) {
        await tx.customerDuePayment.create({
          data: { customerId: customer.id, amount: previousDuePaid, note: `Bill ${invoiceNumber}` },
        });
      }

      // Persist the returns (audit trail) and restock the returned units.
      for (const rr of returnRecords) {
        await tx.return.create({
          data: {
            invoiceId: rr.invoiceId,
            customerId: rr.customerId,
            totalRefund: rr.groupRefund,
            refundMethod: refundValue > 0 ? refundMode : 'BILL_OFFSET',
            note: `Bill ${invoiceNumber}`,
            items: { create: rr.lines },
          },
        });
      }
      for (const [productId, qty] of restock) {
        await tx.product.update({ where: { id: productId }, data: { stock: { increment: qty } } });
      }

      for (const item of body.items) {
        await tx.product.update({
          where: { id: item.productId },
          data: { stock: { decrement: item.quantity } },
        });
      }

      if (customer) {
        // totalDue ("udhaar") and creditBalance are the running balances the
        // POS reads back on the customer's next visit. They used to be kept
        // with Prisma `increment`, which performs the addition in a floating-
        // point column — so tiny binary rounding residue accumulated
        // across many bills and a fully-paid customer could keep showing e.g.
        // Rs. 0.00…03 still owing that never cleared, and reappeared on the
        // next bill. Compute the new balances in JS and round to paise so the
        // stored value is always clean (round2 collapses sub-paise noise to
        // exactly 0). Safe read-modify-write: we're inside the checkout
        // $transaction and already hold this customer row.
        const newTotalDue = round2(customer.totalDue + dueAmount - previousDuePaid);
        const creditDelta = (refundMode === 'CREDIT' ? refundValue : 0) - creditApplied;
        const newCredit = round2(customer.creditBalance + creditDelta);
        await tx.customer.update({
          where: { id: customer.id },
          data: {
            loyaltyPoints: { increment: computed.pointsEarned - computed.pointsRedeemed },
            totalSpent: round2(customer.totalSpent + computed.totalAmount),
            totalDue: newTotalDue,
            creditBalance: newCredit,
            visits: { increment: 1 },
          },
        });
      }

      return { created, restockProductIds: [...restock.keys()] };
    });

    const { created: invoice, restockProductIds } = result;

    // Notify any linked external integration (e.g. a storefront) that stock
    // just changed here, for every product this bill touched (sold and/or
    // restocked via a return) that has a SKU linked. Deliberately outside
    // the transaction (a webhook call is a network operation, not a DB
    // write) and never awaited into the response — see lib/webhooks.js.
    const touchedProductIds = [...new Set([...body.items.map((i) => i.productId), ...restockProductIds])];
    if (touchedProductIds.length > 0) {
      prisma.product
        .findMany({ where: { id: { in: touchedProductIds }, sku: { not: null } } })
        .then((products) => notifyStockChange(products.map((p) => ({ sku: p.sku, stock: p.stock }))))
        .catch((err) => console.error('post-checkout stock webhook lookup failed', err));
    }

    res.status(201).json(invoice);
  } catch (err) {
    const status = err.status || 500;
    if (status === 500) console.error(err);
    res.status(status).json({ error: err.message || 'No se pudo completar la venta.' });
  }
});

const voidInvoiceSchema = z.object({
  reason: z.string().trim().max(200).optional().default(''),
});

router.post('/:id/void', requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'El identificador de la venta no es válido.' });
  const parsed = voidInvoiceSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Datos de anulación no válidos.', details: parsed.error.flatten() });
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const claimed = await tx.invoice.updateMany({
        where: { id, status: 'COMPLETED' },
        data: { status: 'COMPLETED' },
      });
      if (claimed.count !== 1) {
        const existing = await tx.invoice.findUnique({ where: { id }, select: { id: true } });
        if (!existing) throw Object.assign(new Error('No se encontró la venta.'), { status: 404 });
        throw Object.assign(new Error('Esta venta ya fue anulada.'), { status: 409 });
      }

      const invoice = await tx.invoice.findUnique({
        where: { id },
        include: { items: true, returns: { include: { items: true } } },
      });
      if (!invoice) throw Object.assign(new Error('No se encontró la venta.'), { status: 404 });
      const blockingMovements = [];
      if (invoice.returnValue > 0.01 || invoice.refundValue > 0.01) {
        blockingMovements.push('una devolución o reembolso registrados en esta misma venta');
      }
      if (invoice.dueAmount > 0.01) blockingMovements.push('saldo pendiente');
      if (invoice.previousDuePaid > 0.01) blockingMovements.push('pago de un saldo anterior');
      if (invoice.creditApplied > 0.01) blockingMovements.push('uso de crédito');
      if (blockingMovements.length > 0) {
        throw Object.assign(
          new Error(`No se puede anular esta venta porque registra ${blockingMovements.join(', ')}.`),
          { status: 409 },
        );
      }

      const returnedQuantities = new Map();
      for (const record of invoice.returns) {
        for (const item of record.items) {
          returnedQuantities.set(
            item.invoiceItemId,
            (returnedQuantities.get(item.invoiceItemId) || 0) + item.quantity,
          );
        }
      }
      const hasReturns = invoice.returns.length > 0;
      const isFullyReturned =
        hasReturns &&
        invoice.items.every(
          (item) => (returnedQuantities.get(item.id) || 0) === item.quantity,
        );
      if (hasReturns && !isFullyReturned) {
        throw Object.assign(
          new Error('No se puede anular una venta con devoluciones parciales. Completa o resuelve primero esas devoluciones.'),
          { status: 409 },
        );
      }

      let customerUpdate = null;
      if (invoice.customerId != null) {
        const customer = await tx.customer.findUnique({ where: { id: invoice.customerId } });
        if (customer) {
          const totalSpent = round2(customer.totalSpent - invoice.totalAmount);
          const loyaltyPoints = customer.loyaltyPoints - invoice.pointsEarned + invoice.pointsRedeemed;
          if (totalSpent < 0 || loyaltyPoints < 0) {
            throw Object.assign(
              new Error('No se puede anular: el cliente ya usó el saldo generado por esta venta.'),
              { status: 409 },
            );
          }
          customerUpdate = {
            id: customer.id,
            totalSpent,
            loyaltyPoints,
            visits: Math.max(0, customer.visits - 1),
          };
        }
      }

      await tx.invoice.update({
        where: { id },
        data: {
          status: 'VOIDED',
          voidedAt: new Date(),
          voidReason: parsed.data.reason || null,
        },
      });

      for (const item of invoice.items) {
        const quantityToRestock = item.quantity - (returnedQuantities.get(item.id) || 0);
        if (quantityToRestock <= 0 || item.productId == null) continue;
        await tx.product.update({
          where: { id: item.productId },
          data: { stock: { increment: quantityToRestock } },
        });
      }
      if (customerUpdate) {
        await tx.customer.update({
          where: { id: customerUpdate.id },
          data: {
            totalSpent: customerUpdate.totalSpent,
            loyaltyPoints: customerUpdate.loyaltyPoints,
            visits: customerUpdate.visits,
          },
        });
      }

      return invoice.items
        .filter((item) => item.productId != null && item.quantity > (returnedQuantities.get(item.id) || 0))
        .map((item) => item.productId);
    });

    if (result.length > 0) {
      prisma.product
        .findMany({ where: { id: { in: [...new Set(result)] }, sku: { not: null } } })
        .then((products) => notifyStockChange(products.map((product) => ({ sku: product.sku, stock: product.stock }))))
        .catch((err) => console.error('post-void stock webhook lookup failed', err));
    }
    res.json({ message: 'Venta anulada y existencias repuestas.' });
  } catch (err) {
    const status = err.status || 500;
    if (status === 500) console.error(err);
    res.status(status).json({ error: err.message || 'No se pudo anular la venta.' });
  }
});

// GET /api/invoices?q=&from=&to=
router.get('/', async (req, res) => {
  const q = (req.query.q || '').toString().trim();
  const where = q
    ? { OR: [{ invoiceNumber: { contains: q } }, { customerName: { contains: q } }, { customerPhone: { contains: q } }] }
    : undefined;
  const invoices = await prisma.invoice.findMany({ where, orderBy: { createdAt: 'desc' }, take: 300 });
  res.json(invoices);
});

// GET /api/invoices/summary — dashboard totals for today
router.get('/summary', async (req, res) => {
  const start = bogotaDayStart();
  const end = addDays(start, 1);
  const [todays, all] = await Promise.all([
    prisma.invoice.findMany({ where: { status: 'COMPLETED', createdAt: { gte: start, lt: end } } }),
    prisma.invoice.aggregate({ where: { status: 'COMPLETED' }, _sum: { totalAmount: true }, _count: true }),
  ]);
  const todaysRevenue = round2(todays.reduce((s, i) => s + i.totalAmount, 0));
  res.json({
    todaysCount: todays.length,
    todaysRevenue,
    totalSales: all._count,
    totalRevenue: round2(all._sum.totalAmount || 0),
  });
});

// GET /api/invoices/analytics — sales trend, top products, and payment mix
// for a selected date range. Without dates, retains the previous 14-day view.
router.get('/analytics', async (req, res) => {
  const hasFrom = req.query.from != null;
  const hasTo = req.query.to != null;
  if (hasFrom !== hasTo) {
    return res.status(400).json({ error: 'Debes indicar las fechas inicial y final.' });
  }

  let start;
  let end;
  if (hasFrom) {
    start = parseBogotaDate(req.query.from);
    const lastDay = parseBogotaDate(req.query.to);
    if (!start || !lastDay || start > lastDay) {
      return res.status(400).json({ error: 'El rango de fechas no es válido.' });
    }
    end = addDays(lastDay, 1);
  } else {
    const today = bogotaDayStart();
    start = addDays(today, -13);
    end = addDays(today, 1);
  }

  const dateFilter = { gte: start, lt: end };
  const [recent, topItems, byMethod] = await Promise.all([
    prisma.invoice.findMany({
      where: { status: 'COMPLETED', createdAt: dateFilter },
      select: { createdAt: true, totalAmount: true, paymentMethod: true },
    }),
    prisma.invoiceItem.groupBy({
      by: ['productId', 'name'],
      where: { invoice: { is: { status: 'COMPLETED', createdAt: dateFilter } } },
      _sum: { quantity: true, total: true },
      orderBy: { _sum: { quantity: 'desc' } },
      take: 10,
    }),
    prisma.invoice.groupBy({
      by: ['paymentMethod'],
      where: { status: 'COMPLETED', createdAt: dateFilter },
      _sum: { totalAmount: true },
      _count: true,
    }),
  ]);

  const firstDay = new Date(start);
  const lastDay = addDays(end, -1);
  const firstKey = dateKeyInBogota(firstDay);
  const lastKey = dateKeyInBogota(lastDay);
  const [firstYear, firstMonth, firstDate] = firstKey.split('-').map(Number);
  const [lastYear, lastMonth, lastDate] = lastKey.split('-').map(Number);
  const dayCount =
    Math.round(
      (Date.UTC(lastYear, lastMonth - 1, lastDate) -
        Date.UTC(firstYear, firstMonth - 1, firstDate)) /
        86_400_000,
    ) + 1;
  const monthly = dayCount > 90;
  const trendMap = new Map();
  const bucketDate = new Date(firstDay);
  while (bucketDate <= lastDay) {
    const key = dateKeyInBogota(bucketDate);
    const bucketKey = monthly ? `${key.slice(0, 7)}-01` : key;
    if (!trendMap.has(bucketKey)) {
      trendMap.set(bucketKey, { date: bucketKey, revenue: 0, count: 0 });
    }
    if (monthly) bucketDate.setUTCMonth(bucketDate.getUTCMonth() + 1, 1);
    else bucketDate.setUTCDate(bucketDate.getUTCDate() + 1);
  }
  for (const inv of recent) {
    const key = dateKeyInBogota(inv.createdAt);
    const bucketKey = monthly ? `${key.slice(0, 7)}-01` : key;
    const bucket = trendMap.get(bucketKey);
    if (bucket) {
      bucket.revenue = round2(bucket.revenue + inv.totalAmount);
      bucket.count += 1;
    }
  }

  res.json({
    trend: Array.from(trendMap.values()),
    topProducts: topItems.map((t) => ({
      name: t.name,
      quantity: t._sum.quantity || 0,
      revenue: round2(t._sum.total || 0),
    })),
    paymentMethods: byMethod.map((m) => ({
      method: m.paymentMethod,
      count: m._count,
      revenue: round2(m._sum.totalAmount || 0),
    })),
    granularity: monthly ? 'month' : 'day',
  });
});

// Minimal CSV cell escaping: wrap in quotes and double up any embedded
// quotes if the value contains a comma, quote, or newline.
function csvCell(value) {
  const s = String(value ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// GET /api/invoices/export.csv?from=&to= — one row per invoice. Defaults to
// all invoices; from/to (ISO dates) narrow the range for a period report.
router.get('/export.csv', async (req, res) => {
  const where = {};
  if (req.query.from || req.query.to) {
    where.createdAt = {};
    if (req.query.from) where.createdAt.gte = new Date(req.query.from);
    if (req.query.to) where.createdAt.lte = new Date(req.query.to);
  }
  const invoices = await prisma.invoice.findMany({ where, orderBy: { createdAt: 'desc' } });

  const header = [
    'Invoice Number',
    'Date',
    'Customer',
    'Phone',
    'Payment Method',
    'Subtotal',
    'Discount',
    'Tax',
    'Loyalty Discount',
    'Total',
    'Amount Paid',
    'Change Due',
    'Status',
  ];
  const rows = invoices.map((inv) => [
    inv.invoiceNumber,
    new Date(inv.createdAt).toISOString(),
    inv.customerName,
    inv.customerPhone || '',
    inv.paymentMethod,
    inv.subtotal,
    inv.discountAmount,
    inv.taxAmount,
    inv.loyaltyDiscount,
    inv.totalAmount,
    inv.amountPaid,
    inv.changeDue,
    inv.status,
  ]);
  const csv = [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n');

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="sales-export-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send(csv);
});

router.get('/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'El identificador de la factura no es válido.' });
  const invoice = await prisma.invoice.findUnique({ where: { id }, include: { items: true } });
  if (!invoice) return res.status(404).json({ error: 'No se encontró la factura.' });
  res.json(invoice);
});

module.exports = router;
