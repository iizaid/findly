import { getTwoFactorStatus } from './twoFactor.service.js';

export const repairTwoFactorStateForCurrentUser = async (req, _res, next) => {
  try {
    if (req.user?.id) {
      await getTwoFactorStatus(req.user.id);
    }
    next();
  } catch (error) {
    next(error);
  }
};
