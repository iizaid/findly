import { prisma } from '../../db/prisma.js';
import { AppError, errorCodes } from '../../utils/AppError.js';

const GEO_SETUP_STATUS_TTL_MS = 30_000;

let cachedStatus = null;
let cachedAt = 0;

const readExistsFlag = (rows, key) => Boolean(rows?.[0]?.[key]);

export const getGeoRuntimeStatus = async ({ forceRefresh = false } = {}) => {
  if (!forceRefresh && cachedStatus && (Date.now() - cachedAt) < GEO_SETUP_STATUS_TTL_MS) {
    return cachedStatus;
  }

  const [availableRows, installedRows, leadColumnRows, catalogColumnRows, cacheTableRows] = await Promise.all([
    prisma.$queryRaw`SELECT EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'postgis') AS available`,
    prisma.$queryRaw`SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'postgis') AS installed`,
    prisma.$queryRaw`
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'Lead'
          AND column_name = 'geoStatus'
      ) AS has_column
    `,
    prisma.$queryRaw`
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'LeadCatalog'
          AND column_name = 'geoStatus'
      ) AS has_column
    `,
    prisma.$queryRaw`
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = 'GeoLocationCache'
      ) AS has_table
    `,
  ]);

  cachedStatus = {
    postgisAvailable: readExistsFlag(availableRows, 'available'),
    postgisInstalled: readExistsFlag(installedRows, 'installed'),
    leadGeoColumnsReady: readExistsFlag(leadColumnRows, 'has_column'),
    catalogGeoColumnsReady: readExistsFlag(catalogColumnRows, 'has_column'),
    cacheTableReady: readExistsFlag(cacheTableRows, 'has_table'),
  };
  cachedAt = Date.now();
  return cachedStatus;
};

export const assertGeoRuntimeReady = async () => {
  const status = await getGeoRuntimeStatus();

  if (!status.postgisAvailable) {
    throw new AppError(
      errorCodes.CONFIGURATION_ERROR,
      'Lead Map requires a PostGIS-capable database runtime. Run `npm run check:postgis` and switch DATABASE_URL to a PostGIS-enabled database.',
      503,
      status,
    );
  }

  if (!status.postgisInstalled || !status.leadGeoColumnsReady || !status.catalogGeoColumnsReady || !status.cacheTableReady) {
    throw new AppError(
      errorCodes.CONFIGURATION_ERROR,
      'Lead Map is not ready on this database yet. Apply the geo migration on a PostGIS-capable database, then retry.',
      503,
      status,
    );
  }

  return status;
};

export const resetGeoRuntimeStatusCache = () => {
  cachedStatus = null;
  cachedAt = 0;
};
