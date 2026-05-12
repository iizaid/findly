import { prisma } from '../db/prisma.js';
import { AppError, errorCodes } from '../utils/AppError.js';
import { deductCredits, WEBSITE_ENRICHMENT_CREDITS } from '../modules/credits/credit.service.js';

export const chargeWebsiteEnrichment = async (req, _res, next) => {
  try {
    const leadId = req.validated?.params?.id || req.params?.id;

    const lead = await prisma.lead.findFirst({
      where: {
        id: leadId,
        userId: req.user.id,
      },
      select: {
        id: true,
        businessName: true,
        workspaceId: true,
        websiteUrl: true,
      },
    });

    if (!lead) {
      throw new AppError(errorCodes.NOT_FOUND, 'Lead not found.', 404);
    }

    if (!lead.websiteUrl) {
      throw new AppError(errorCodes.VALIDATION_ERROR, 'Lead does not have a website URL to enrich.', 400);
    }

    const creditResult = await deductCredits({
      userId: req.user.id,
      workspaceId: lead.workspaceId,
      amount: WEBSITE_ENRICHMENT_CREDITS,
      type: 'CREDIT_USED',
      reason: `Website enrichment: ${lead.businessName}`,
      referenceType: 'Lead',
      referenceId: lead.id,
    });

    req.billing = {
      ...(req.billing || {}),
      websiteEnrichment: {
        creditsUsed: WEBSITE_ENRICHMENT_CREDITS,
        balanceAfter: creditResult.balanceAfter,
      },
    };

    return next();
  } catch (error) {
    return next(error);
  }
};
