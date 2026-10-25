const express = require('express');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const { z } = require('zod');
const prisma = require('../lib/prisma');
const {
  issueToken,
  setSessionCookie,
  clearSessionCookie,
  requireAuth,
  requireAdmin,
  requirePasswordConfirm,
  verifyPassword,
} = require('../middleware/auth');

const router = express.Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos de inicio de sesión. Inténtalo más tarde.' },
});

const registerSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.string().trim().toLowerCase().email().max(200),
  password: z.string().min(8).max(200),
});

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
});

const publicUser = (u) => ({ id: u.id, name: u.name, email: u.email, role: u.role, active: u.active });

// GET /api/auth/status — used by the frontend to decide onboarding vs login vs app
router.get('/status', async (req, res) => {
  const adminCount = await prisma.user.count();
  res.json({ onboarded: adminCount > 0 });
});

// POST /api/auth/register — only allowed once, during onboarding Step 1 (creates the admin)
router.post('/register', async (req, res) => {
  const existing = await prisma.user.count();
  if (existing > 0) {
    return res.status(403).json({ error: 'Ya existe una cuenta de administrador.' });
  }

  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Los datos enviados no son válidos.', details: parsed.error.flatten() });
  }
  const { name, email, password } = parsed.data;

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.user.create({
    data: { name, email, password: passwordHash, role: 'admin' },
  });

  const token = issueToken(user);
  setSessionCookie(res, token);
  res.status(201).json(publicUser(user));
});

router.post('/login', loginLimiter, async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Correo o contraseña no válidos.' });
  }
  const { email, password } = parsed.data;

  const user = await prisma.user.findUnique({ where: { email } });
  const genericError = { error: 'Correo electrónico o contraseña incorrectos.' };
  // Always run a hash comparison to keep response timing uniform whether or
  // not the account exists, and never reveal which of the two was wrong.
  const hash = user?.password || '$2a$12$0000000000000000000000000000000000000000000000000000';
  const ok = await bcrypt.compare(password, hash);
  if (!user || !user.active || !ok) return res.status(401).json(genericError);

  const token = issueToken(user);
  setSessionCookie(res, token);
  res.json(publicUser(user));
});

router.post('/logout', (req, res) => {
  clearSessionCookie(res);
  res.status(204).end();
});

router.get('/me', requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user.id } });
  if (!user) return res.status(401).json({ error: 'Debes iniciar sesión para continuar.' });
  res.json(publicUser(user));
});

// POST /api/auth/change-password — any logged-in user changes their own password
const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(200),
});
router.post('/change-password', requireAuth, async (req, res) => {
  const parsed = changePasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 8 caracteres.' });
  }
  const ok = await verifyPassword(req.user.id, parsed.data.currentPassword);
  if (!ok) return res.status(401).json({ error: 'La contraseña actual es incorrecta.' });

  const passwordHash = await bcrypt.hash(parsed.data.newPassword, 12);
  await prisma.user.update({ where: { id: req.user.id }, data: { password: passwordHash } });
  res.status(204).end();
});

// --- Staff user management (admin only) ------------------------------------

router.get('/users', requireAuth, requireAdmin, async (req, res) => {
  const users = await prisma.user.findMany({ orderBy: { createdAt: 'asc' } });
  res.json(users.map(publicUser));
});

const createUserSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.string().trim().toLowerCase().email().max(200),
  password: z.string().min(8).max(200),
  role: z.enum(['admin', 'cashier']).default('cashier'),
});
router.post('/users', requireAuth, requireAdmin, requirePasswordConfirm, async (req, res) => {
  const parsed = createUserSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Los datos del usuario no son válidos.', details: parsed.error.flatten() });
  }
  const exists = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  if (exists) return res.status(409).json({ error: 'Ya existe un usuario con ese correo electrónico.' });

  const passwordHash = await bcrypt.hash(parsed.data.password, 12);
  const user = await prisma.user.create({
    data: { ...parsed.data, password: passwordHash },
  });
  res.status(201).json(publicUser(user));
});

const updateUserSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  role: z.enum(['admin', 'cashier']).optional(),
  active: z.boolean().optional(),
  password: z.string().min(8).max(200).optional(),
});
router.put('/users/:id', requireAuth, requireAdmin, requirePasswordConfirm, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'El identificador del usuario no es válido.' });

  const parsed = updateUserSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Los datos del usuario no son válidos.', details: parsed.error.flatten() });
  }

  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) return res.status(404).json({ error: 'No se encontró el usuario.' });

  // Guard against locking yourself out or removing the last admin.
  if (target.role === 'admin' && (parsed.data.role === 'cashier' || parsed.data.active === false)) {
    const adminCount = await prisma.user.count({ where: { role: 'admin', active: true } });
    if (adminCount <= 1) {
      return res.status(400).json({ error: 'No puedes cambiar el rol ni desactivar la última cuenta de administrador activa.' });
    }
  }

  const data = { ...parsed.data };
  if (data.password) data.password = await bcrypt.hash(data.password, 12);

  const updated = await prisma.user.update({ where: { id }, data });
  res.json(publicUser(updated));
});

module.exports = router;
