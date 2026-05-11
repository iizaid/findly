import { prisma } from '../../db/prisma.js';
import { AppError, errorCodes } from '../../utils/AppError.js';
import { toPagination } from '../../utils/pagination.js';

export const INITIAL_CREDITS = 50;
export const SEARCH_BASE_CREDITS = 5;
export const SEARCH_PER_RETURNED_LEAD_CREDITS = 1;
export const ANALYSIS_CREDITS = 1;
export const WEBSITE_ENRICHMENT_CREDITS = 1;

export const calculateSearchCreditCost = ({ returnedLeadsCount = 0 } = {}) => {
  const normalizedReturnedLeads = Math.max(0, Number(returnedLeadsCount) || 0);
  return SEARCH_BASE_CREDITS + (normalizedReturnedLeads * SEARCH_PER_RETURNED_LEAD_CREDITS);
};

export const estimateSearchCreditReservation = ({ requestedLimit = 20 } = {}) => {
  const normalizedLimit = Math.max(1, Math.min(Number(requestedLimit) || 20, 100));
  return calculateSearchCreditCost({ returnedLeadsCount: normalizedLimit });
};

export const addCredits = async ({ tx = prisma, userId, workspaceId = null, amount, type = 'CREDIT_GRANTED', reason, referenceType = null, referenceId = null }) => {
  if (!Number.isInteger(amount) || amount <= 0) throw new AppError(errorCodes.VALIDATION_ERROR, 'Credit amount must be a positive integer.', 400);
  const user = await tx.user.update({ where: { id: userId }, data: { creditsBalance: { increment: amount } }, select: { creditsBalance: true } });
  const ledger = await tx.creditLedger.create({ data: { userId, workspaceId, type, amount, balanceAfter: user.creditsBalance, reason, referenceType, referenceId } });
  return { balanceAfter: user.creditsBalance, ledger };
};

export const deductCredits = async ({ tx = prisma, userId, workspaceId = null, amount, type = 'CREDIT_USED', reason, referenceType = null, referenceId = null }) => {
  if (!Number.isInteger(amount) || amount <= 0) throw new AppError(errorCodes.VALIDATION_ERROR, 'Deduction amount must be a positive integer.', 400);
  const updated = await tx.user.updateMany({ where: { id: userId, creditsBalance: { gte: amount } }, data: { creditsBalance: { decrement: amount } } });
  if (updated.count !== 1) throw new AppError(errorCodes.INSUFFICIENT_FUNDS, 'Insufficient credits.', 402);
  const user = await tx.user.findUnique({ where: { id: userId }, select: { creditsBalance: true } });
  const ledger = await tx.creditLedger.create({ data: { userId, workspaceId, type, amount: -amount, balanceAfter: user.creditsBalance, reason, referenceType, referenceId } });
  return { balanceAfter: user.creditsBalance, ledger };
};

export const reserveCredits = (args) => deductCredits({ ...args, type: 'CREDIT_USED', reason: `Reserved credits: ${args.reason}` });
export const refundCredits = (args) => addCredits({ ...args, type: 'CREDIT_REFUNDED' });

export const grantInitialCreditsIfEligible = async ({ tx = prisma, userId, workspaceId, context }) => {
  const user = await tx.user.findUnique({ where: { id: userId }, select: { id: true, emailVerified: true, initialCreditsGrantedAt: true } });
  if (!user) throw new AppError(errorCodes.NOT_FOUND, 'User not found.', 404);
  if (!user.emailVerified) throw new AppError(errorCodes.EMAIL_NOT_VERIFIED, 'Email verification is required before credits are granted.', 403);
  if (user.initialCreditsGrantedAt) return { granted: false };
  const updated = await tx.user.updateMany({ where: { id: userId, emailVerified: true, initialCreditsGrantedAt: null }, data: { initialCreditsGrantedAt: new Date() } });
  if (updated.count === 0) return { granted: false };
  const creditResult = await addCredits({ tx, userId, workspaceId, amount: INITIAL_CREDITS, reason: 'Initial Opportunity Credits after email verification' });
  await tx.auditLog.create({ data: { userId, action: 'INITIAL_CREDITS_GRANTED', entityType: 'CreditLedger', entityId: creditResult.ledger.id, metadata: { amount: INITIAL_CREDITS, balanceAfter: creditResult.balanceAfter, workspaceId }, ipAddress: context?.ipAddress, userAgent: context?.userAgent } });
  return { granted: true, amount: INITIAL_CREDITS, balanceAfter: creditResult.balanceAfter, ledger: creditResult.ledger };
};

export const getCreditsSummary = async (userId) => {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { creditsBalance: true, plan: true } });
  return { balance: user?.creditsBalance ?? 0, plan: user?.plan };
};

export const getCreditHistory = async (userId, query) => {
  const pagination = toPagination(query);
  const [items, total] = await prisma.$transaction([
    prisma.creditLedger.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, skip: pagination.skip, take: pagination.take, select: { id: true, workspaceId: true, type: true, amount: true, balanceAfter: true, reason: true, referenceType: true, referenceId: true, createdAt: true } }),
    prisma.creditLedger.count({ where: { userId } }),
  ]);
  return { items, pagination: { page: pagination.page, limit: pagination.limit, total } };
};
