import { applyTestDatabaseUrlOverride } from '../config/env.js';
import { PrismaClient } from '@prisma/client';

applyTestDatabaseUrlOverride(process.env);

export const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
});

export const closePrisma = () => prisma.$disconnect();
