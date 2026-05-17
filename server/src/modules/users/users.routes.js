import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { env } from '../../config/env.js';
import { prisma } from '../../db/prisma.js';
import { requireAuth, requireVerifiedEmail } from '../../middleware/auth.middleware.js';
import { validate } from '../../middleware/validate.middleware.js';
import { clearCookieOptions } from '../sessions/session.service.js';
import { toSafeUser } from './user.mapper.js';
import { AppError, errorCodes } from '../../utils/AppError.js';
import { successResponse } from '../../utils/apiResponse.js';
import { verifyPassword } from '../../utils/crypto.js';

const router = Router();

const uploadDir = path.join(process.cwd(), 'public', 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: 2 * 1024 * 1024,
    files: 1,
  },
});

const profileUpdateSchema = z.object({
  body: z
    .object({
      name: z.string().trim().min(2).max(80).optional(),
      notifyReports: z.boolean().optional(),
      notifySecurity: z.boolean().optional(),
      notifyMarketing: z.boolean().optional(),
      twoFactorEnabled: z.never().optional(),
    })
    .strict()
    .refine((value) => Object.keys(value).length > 0, {
      message: 'At least one profile field is required.',
    }),
  params: z.object({}).optional(),
  query: z.object({}).optional(),
});

const deleteAccountSchema = z.object({
  body: z.object({
    password: z.string().min(1).max(128),
  }),
  params: z.object({}).optional(),
  query: z.object({}).optional(),
});

const getImageType = (buffer) => {
  if (!buffer || buffer.length < 12) return null;
  const firstFour = buffer.toString('hex', 0, 4).toUpperCase();

  if (firstFour.startsWith('FFD8FF')) return 'jpeg';
  if (firstFour === '89504E47') return 'png';
  if (
    firstFour === '52494646' &&
    buffer.toString('ascii', 8, 12).toUpperCase() === 'WEBP'
  ) {
    return 'webp';
  }

  return null;
};

const safeDeleteUploadedFile = async (avatarUrl) => {
  if (!avatarUrl?.startsWith('/uploads/')) return;
  const filename = path.basename(avatarUrl);
  const uploadRoot = path.resolve(uploadDir);
  const target = path.resolve(uploadRoot, filename);

  if (!target.startsWith(uploadRoot + path.sep)) return;
  await fs.promises.unlink(target).catch(() => {});
};

router.use(requireAuth, requireVerifiedEmail);

router.patch('/me', validate(profileUpdateSchema), async (req, res, next) => {
  try {
    const { name, notifyReports, notifySecurity, notifyMarketing } = req.validated.body;
    const updateData = {};

    if (name !== undefined) updateData.name = name;
    if (notifyReports !== undefined) updateData.notifyReports = notifyReports;
    if (notifySecurity !== undefined) updateData.notifySecurity = notifySecurity;
    if (notifyMarketing !== undefined) updateData.notifyMarketing = notifyMarketing;

    const user = await prisma.user.update({
      where: { id: req.user.id },
      data: updateData,
    });

    await prisma.auditLog.create({
      data: {
        userId: req.user.id,
        action: 'USER_SETTINGS_UPDATED',
        entityType: 'User',
        entityId: req.user.id,
        metadata: { fields: Object.keys(updateData) },
        ipAddress: req.ip,
        userAgent: req.get('user-agent') || null,
      },
    }).catch(() => {});

    return successResponse(res, { user: toSafeUser(user) }, 'Profile updated successfully.');
  } catch (error) {
    return next(error);
  }
});

router.post('/me/avatar', upload.single('avatar'), async (req, res, next) => {
  try {
    if (!req.file) {
      throw new AppError(errorCodes.VALIDATION_ERROR, 'No image provided.', 400);
    }

    const fileType = getImageType(req.file.buffer);
    if (!fileType) {
      throw new AppError(
        errorCodes.VALIDATION_ERROR,
        'Invalid image type. Use JPG, PNG, or WebP.',
        400,
      );
    }

    const safeExtension = fileType === 'jpeg' ? '.jpg' : `.${fileType}`;
    const filename = `${crypto.randomBytes(24).toString('hex')}${safeExtension}`;
    const finalPath = path.join(uploadDir, filename);
    let processedBuffer = req.file.buffer;

    try {
      const sharp = (await import('sharp')).default;
      const pipeline = sharp(req.file.buffer).resize(400, 400, {
        fit: 'cover',
        withoutEnlargement: true,
      });

      if (fileType === 'png') {
        processedBuffer = await pipeline.png({ compressionLevel: 9 }).toBuffer();
      } else if (fileType === 'webp') {
        processedBuffer = await pipeline.webp({ quality: 85 }).toBuffer();
      } else {
        processedBuffer = await pipeline.jpeg({ quality: 85 }).toBuffer();
      }
    } catch {
      // Magic-number validation and random filenames still prevent executable uploads.
    }

    await fs.promises.writeFile(finalPath, processedBuffer, { flag: 'wx' });

    const previous = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { avatarUrl: true },
    });

    const user = await prisma.user.update({
      where: { id: req.user.id },
      data: { avatarUrl: `/uploads/${filename}` },
    });

    await safeDeleteUploadedFile(previous?.avatarUrl);

    return successResponse(
      res,
      { user: toSafeUser(user) },
      'Profile picture securely updated.',
    );
  } catch (error) {
    return next(error);
  }
});

router.delete('/me/avatar', async (req, res, next) => {
  try {
    const previous = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { avatarUrl: true },
    });

    const user = await prisma.user.update({
      where: { id: req.user.id },
      data: { avatarUrl: null },
    });

    await safeDeleteUploadedFile(previous?.avatarUrl);

    return successResponse(res, { user: toSafeUser(user) }, 'Profile picture removed.');
  } catch (error) {
    return next(error);
  }
});

router.delete('/me', validate(deleteAccountSchema), async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user) {
      throw new AppError(errorCodes.NOT_FOUND, 'User not found.', 404);
    }

    const passwordMatches = await verifyPassword(req.validated.body.password, user.passwordHash);
    if (!passwordMatches) {
      throw new AppError(errorCodes.FORBIDDEN, 'Incorrect password. Account deletion aborted.', 403);
    }

    await prisma.$transaction(async (tx) => {
      await tx.auditLog.create({
        data: {
          userId: user.id,
          action: 'USER_ACCOUNT_DELETED',
          entityType: 'User',
          entityId: user.id,
          ipAddress: req.ip,
          userAgent: req.get('user-agent') || null,
        },
      });

      await tx.user.delete({ where: { id: user.id } });
    });

    await safeDeleteUploadedFile(user.avatarUrl);
    res.clearCookie(env.COOKIE_NAME, clearCookieOptions);

    return successResponse(res, {}, 'Account permanently deleted.');
  } catch (error) {
    return next(error);
  }
});

export default router;
