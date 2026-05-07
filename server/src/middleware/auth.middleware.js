import { env } from '../config/env.js';
import { getActiveSessionByToken } from '../modules/sessions/session.service.js';
import { toSafeUser } from '../modules/users/user.mapper.js';
import { AppError, errorCodes } from '../utils/AppError.js';

export const requireAuth = async (req, _res, next) => {
  try {
    const token = req.cookies?.[env.COOKIE_NAME];

    if (!token) {
      throw new AppError(errorCodes.UNAUTHORIZED, 'Authentication required.', 401);
    }

    const session = await getActiveSessionByToken(token);

    if (!session) {
      throw new AppError(errorCodes.UNAUTHORIZED, 'Authentication required.', 401);
    }

    req.session = {
      id: session.id,
      expiresAt: session.expiresAt,
      createdAt: session.createdAt,
    };
    req.user = toSafeUser(session.user);
    req.userRecord = session.user;

    return next();
  } catch (error) {
    return next(error);
  }
};
