import { prisma } from '../../db/prisma.js';
import { env } from '../../config/env.js';

const activeCacheWhere = () => ({
  OR: [
    { expiresAt: null },
    { expiresAt: { gt: new Date() } },
  ],
});

export const getCachedGeoResult = async ({ sourceHash, provider = null }) => {
  return prisma.geoLocationCache.findFirst({
    where: {
      sourceHash,
      ...(provider ? { provider } : {}),
      ...activeCacheWhere(),
    },
    orderBy: [
      { confidence: 'desc' },
      { updatedAt: 'desc' },
    ],
  });
};

export const saveGeoCacheResult = async ({
  sourceHash,
  normalizedQuery,
  normalizedCountry,
  normalizedCity,
  provider,
  providerPlaceId,
  latitude,
  longitude,
  confidence,
  accuracy,
  resultType,
  normalizedAddress,
}) => {
  const expiresAt = new Date(Date.now() + env.GEO_CACHE_TTL_DAYS * 24 * 60 * 60 * 1000);
  const cacheRow = await prisma.geoLocationCache.upsert({
    where: {
      provider_sourceHash: {
        provider,
        sourceHash,
      },
    },
    create: {
      sourceHash,
      provider,
      providerPlaceId,
      normalizedQuery,
      normalizedCountry,
      normalizedCity,
      latitude,
      longitude,
      confidence,
      accuracy,
      resultType,
      normalizedAddress,
      expiresAt,
    },
    update: {
      providerPlaceId,
      normalizedQuery,
      normalizedCountry,
      normalizedCity,
      latitude,
      longitude,
      confidence,
      accuracy,
      resultType,
      normalizedAddress,
      expiresAt,
    },
  });

  await prisma.$executeRaw`
    UPDATE "GeoLocationCache"
    SET "geoPoint" = ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326)::geography
    WHERE "id" = ${cacheRow.id}
  `;

  return prisma.geoLocationCache.findUnique({ where: { id: cacheRow.id } });
};
