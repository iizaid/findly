export const toSafeUser = (user) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  role: user.role,
  plan: user.plan,
  creditsBalance: user.creditsBalance,
  emailVerified: user.emailVerified,
  emailVerifiedAt: user.emailVerifiedAt,
  initialCreditsGrantedAt: user.initialCreditsGrantedAt,
  createdAt: user.createdAt,
  updatedAt: user.updatedAt,
});
