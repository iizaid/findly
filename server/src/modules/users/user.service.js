import { prisma } from '../../db/prisma.js';
import { toSafeUser } from './user.mapper.js';

export const findUserByEmail = (email) =>
  prisma.user.findUnique({
    where: { email },
  });

export const findUserById = (id) =>
  prisma.user.findUnique({
    where: { id },
  });

export const getSafeUserById = async (id) => {
  const user = await findUserById(id);
  return user ? toSafeUser(user) : null;
};
