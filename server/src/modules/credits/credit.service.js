import { prisma } from '../../db/prisma.js';
import { toPagination } from '../../utils/pagination.js';

export const getCreditsSummary = async (userId) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      creditsBalance: true,
      plan: true,
    },
  });

  return {
    balance: user?.creditsBalance ?? 0,
    plan: user?.plan,
  };
};

export const getCreditHistory = async (userId, query) => {
  const pagination = toPagination(query);

  const [items, total] = await prisma.$transaction([
    prisma.creditLedger.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      skip: pagination.skip,
      take: pagination.take,
      select: {
        id: true,
        workspaceId: true,
        type: true,
        amount: true,
        balanceAfter: true,
        reason: true,
        referenceType: true,
        referenceId: true,
        createdAt: true,
      },
    }),
    prisma.creditLedger.count({
      where: { userId },
    }),
  ]);

  return {
    items,
    pagination: {
      page: pagination.page,
      limit: pagination.limit,
      total,
    },
  };
};
