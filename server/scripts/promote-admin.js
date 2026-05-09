#!/usr/bin/env node
import { prisma } from '../src/db/prisma.js';

const emailArg = process.argv.find((arg) => arg.startsWith('--email='));
const email = emailArg?.split('=')?.[1]?.trim()?.toLowerCase();

if (!email) {
  console.error('Usage: npm run admin:promote -- --email=user@example.com');
  process.exitCode = 1;
} else {
  try {
    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, emailVerified: true, role: true },
    });

    if (!user) {
      console.error(`No existing user found for ${email}.`);
      process.exitCode = 1;
    } else if (!user.emailVerified) {
      console.error(`User ${email} must verify email before becoming admin.`);
      process.exitCode = 1;
    } else {
      const updated = await prisma.user.update({
        where: { id: user.id },
        data: { role: 'ADMIN' },
        select: { id: true, email: true, role: true },
      });

      await prisma.auditLog.create({
        data: {
          userId: updated.id,
          action: 'ADMIN_PROMOTED',
          entityType: 'User',
          entityId: updated.id,
          metadata: { promotedBy: 'server-cli' },
        },
      }).catch(() => {});

      console.log(`Promoted ${updated.email} to ${updated.role}.`);
    }
  } catch (error) {
    console.error('Admin promotion failed.');
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}
