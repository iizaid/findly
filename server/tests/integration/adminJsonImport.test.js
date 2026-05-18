import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import path from 'node:path';
import fs from 'node:fs/promises';

process.env.NODE_ENV = 'test';
process.env.PORT ??= '4118';
process.env.SESSION_SECRET ??= 'test-session-secret-that-is-long-enough-for-findly';
process.env.COOKIE_NAME ??= 'findly_test_session';
process.env.CSRF_COOKIE_NAME ??= 'findly_test_csrf';

let createApp;
let prisma;
let agent;
let csrfToken;
let uploadDir;
let userId;

const unique = Date.now().toString(36);
const adminEmail = `admin.json.${unique}@findly.local`;

const getCsrfToken = async (reqAgent) => {
  const response = await reqAgent.get('/api/csrf-token').expect(200);
  return response.body.data.csrfToken;
};

const writeTempJson = async (name, data) => {
  const filePath = path.join(uploadDir, `test-json-import-${unique}-${name}.json`);
  await fs.writeFile(filePath, typeof data === 'string' ? data : JSON.stringify(data));
  return filePath;
};

const uploadJson = async (name, data) => {
  const filePath = await writeTempJson(name, data);
  const response = await agent.post('/api/admin/imports/parse')
    .set('X-CSRF-Token', csrfToken)
    .attach('file', filePath)
    .expect(200);
  await fs.unlink(filePath).catch(() => {});
  return response.body.data;
};

beforeAll(async () => {
  ({ createApp } = await import('../../src/app.js'));
  ({ prisma } = await import('../../src/db/prisma.js'));
  const { getAdminUploadDir } = await import('../../src/modules/admin/uploadCleanup.service.js');
  uploadDir = getAdminUploadDir();
  await fs.mkdir(uploadDir, { recursive: true });

  agent = request.agent(createApp());
  await prisma.user.deleteMany({ where: { email: adminEmail } }).catch(() => {});
  await agent.post('/api/auth/register').send({
    name: 'Admin JSON Import Test',
    email: adminEmail,
    password: 'Secure12345@#$',
  });
  const user = await prisma.user.update({
    where: { email: adminEmail },
    data: { emailVerified: true, role: 'ADMIN' },
  });
  userId = user.id;
  await agent.post('/api/auth/login').send({ email: adminEmail, password: 'Secure12345@#$' });
  csrfToken = await getCsrfToken(agent);
});

afterAll(async () => {
  await prisma.leadEvidence.deleteMany({
    where: { title: { contains: unique } },
  }).catch(() => {});
  await prisma.leadCatalog.deleteMany({
    where: {
      OR: [
        { businessName: { contains: unique } },
        { sourceId: { contains: unique } },
        { normalizedFingerprint: { contains: unique } },
      ],
    },
  }).catch(() => {});
  await prisma.datasetImport.deleteMany({
    where: { fileName: { contains: unique } },
  }).catch(() => {});
  await prisma.user.delete({ where: { email: adminEmail } }).catch(() => {});
  await prisma.$disconnect();
});

describe('Admin JSON import', () => {
  it('parses JSON imports and reports detected file type', async () => {
    const parsed = await uploadJson('parse', {
      businesses: [{ name: `Parse Cafe ${unique}`, city: 'Amman', country: 'Jordan' }],
    });

    expect(parsed.detectedFileType).toBe('json');
    expect(parsed.sheets[0].name).toBe('Sheet1');
    expect(parsed.sheets[0].headers).toEqual(expect.arrayContaining(['name', 'city', 'country']));
  });

  it('commits JSON import with metadata and creates linked evidence', async () => {
    const parsed = await uploadJson('commit', [
      {
        businessName: `JSON Cafe ${unique}`,
        city: 'Amman',
        country: 'Jordan',
        website: `https://json-cafe-${unique}.example.com`,
        instagramUsername: `json_cafe_${unique}`,
      },
    ]);

    const response = await agent.post('/api/admin/imports/commit')
      .set('X-CSRF-Token', csrfToken)
      .send({
        fileKey: parsed.fileKey,
        sourceType: 'DATASET_IMPORT',
        importMetadata: {
          sourceName: 'Controlled JSON Test',
          sourcePolicyKey: 'JSON_IMPORT',
          acquisitionMethod: 'JSON_UPLOAD',
          commercialUseAllowed: true,
          attributionRequired: false,
          riskLevel: 'MEDIUM',
          requiresManualReview: false,
          importPreset: 'generic_json',
          evidenceCreationMode: 'CREATE_EVIDENCE_AND_CATALOG',
          promoteToCatalogMode: 'ALL_VALID_ROWS',
        },
      })
      .expect(200);

    const summary = response.body.data.summary;
    expect(summary.importedRows).toBe(1);
    expect(summary.catalogCreatedRows).toBe(1);
    expect(summary.evidenceCreatedRows).toBe(1);
    expect(summary.importMetadata.sourcePolicyKey).toBe('JSON_IMPORT');
    expect(summary.policyDecision).toMatchObject({ allowed: true, stage: 'ADMIN_IMPORT' });

    const imported = await prisma.leadCatalog.findFirst({
      where: { businessName: `JSON Cafe ${unique}` },
    });
    expect(imported).toBeTruthy();

    const evidence = await prisma.leadEvidence.findFirst({
      where: { catalogLeadId: imported.id, discoveryMethod: 'JSON_IMPORT' },
    });
    expect(evidence).toBeTruthy();
    expect(evidence.title).toBe(`JSON Cafe ${unique}`);

    const datasetImport = await prisma.datasetImport.findUnique({ where: { id: summary.importId } });
    expect(datasetImport.summary.importMetadata.sourcePolicyKey).toBe('JSON_IMPORT');
    expect(datasetImport.mapping.importMetadata.sourcePolicyKey).toBe('JSON_IMPORT');
  });

  it('does not create evidence for CATALOG_ONLY mode', async () => {
    const businessName = `Catalog Only JSON Cafe ${unique}`;
    const parsed = await uploadJson('catalog-only', [{ businessName, city: 'Irbid', country: 'Jordan' }]);

    const response = await agent.post('/api/admin/imports/commit')
      .set('X-CSRF-Token', csrfToken)
      .send({
        fileKey: parsed.fileKey,
        importMetadata: {
          sourcePolicyKey: 'JSON_IMPORT',
          acquisitionMethod: 'JSON_UPLOAD',
          commercialUseAllowed: true,
          riskLevel: 'LOW',
          evidenceCreationMode: 'CATALOG_ONLY',
        },
      })
      .expect(200);

    expect(response.body.data.summary.importedRows).toBe(1);
    expect(response.body.data.summary.evidenceCreatedRows).toBe(0);
    const imported = await prisma.leadCatalog.findFirst({ where: { businessName } });
    const evidence = await prisma.leadEvidence.findFirst({ where: { catalogLeadId: imported.id } });
    expect(evidence).toBeNull();
  });

  it('links duplicate JSON import evidence to the existing catalog lead without duplicating catalog rows', async () => {
    const businessName = `Duplicate JSON Cafe ${unique}`;
    const payload = [{
      businessName,
      city: 'Aqaba',
      country: 'Jordan',
      websiteUrl: `https://duplicate-json-${unique}.example.com`,
    }];

    const first = await uploadJson('duplicate-first', payload);
    await agent.post('/api/admin/imports/commit')
      .set('X-CSRF-Token', csrfToken)
      .send({
        fileKey: first.fileKey,
        importMetadata: {
          sourcePolicyKey: 'JSON_IMPORT',
          acquisitionMethod: 'JSON_UPLOAD',
          commercialUseAllowed: true,
          riskLevel: 'LOW',
          evidenceCreationMode: 'CREATE_EVIDENCE_AND_CATALOG',
        },
      })
      .expect(200);

    const second = await uploadJson('duplicate-second', payload);
    const response = await agent.post('/api/admin/imports/commit')
      .set('X-CSRF-Token', csrfToken)
      .send({
        fileKey: second.fileKey,
        importMetadata: {
          sourcePolicyKey: 'JSON_IMPORT',
          acquisitionMethod: 'JSON_UPLOAD',
          commercialUseAllowed: true,
          riskLevel: 'LOW',
          evidenceCreationMode: 'CREATE_EVIDENCE_AND_CATALOG',
        },
      })
      .expect(200);

    expect(response.body.data.summary.importedRows).toBe(0);
    expect(response.body.data.summary.duplicateRows).toBe(1);
    expect(response.body.data.summary.evidenceCreatedRows).toBe(1);
    const leads = await prisma.leadCatalog.findMany({ where: { businessName } });
    expect(leads).toHaveLength(1);
    const evidenceCount = await prisma.leadEvidence.count({ where: { catalogLeadId: leads[0].id } });
    expect(evidenceCount).toBeGreaterThanOrEqual(2);
  });

  it('rejects unsafe source policy and manual review metadata combinations', async () => {
    const parsedSpiderfoot = await uploadJson('spiderfoot', [{ businessName: `SpiderFoot Cafe ${unique}`, city: 'Amman' }]);
    await agent.post('/api/admin/imports/commit')
      .set('X-CSRF-Token', csrfToken)
      .send({
        fileKey: parsedSpiderfoot.fileKey,
        importMetadata: {
          sourcePolicyKey: 'SPIDERFOOT',
          acquisitionMethod: 'INTERNAL_RESEARCH',
          riskLevel: 'HIGH',
          requiresManualReview: true,
        },
      })
      .expect(400);

    const parsedHighRisk = await uploadJson('high-risk', [{ businessName: `High Risk Cafe ${unique}`, city: 'Amman' }]);
    await agent.post('/api/admin/imports/commit')
      .set('X-CSRF-Token', csrfToken)
      .send({
        fileKey: parsedHighRisk.fileKey,
        importMetadata: {
          sourcePolicyKey: 'GOOGLE_MAPS_SCRAPER_OUTPUT',
          acquisitionMethod: 'OFFLINE_TOOL_EXPORT',
          riskLevel: 'HIGH',
          requiresManualReview: false,
        },
      })
      .expect(400);

    const parsedLicense = await uploadJson('license', [{ businessName: `License Cafe ${unique}`, city: 'Amman' }]);
    await agent.post('/api/admin/imports/commit')
      .set('X-CSRF-Token', csrfToken)
      .send({
        fileKey: parsedLicense.fileKey,
        importMetadata: {
          sourcePolicyKey: 'HUGGING_FACE_DATASETS',
          acquisitionMethod: 'LICENSED_DATASET_EXPORT',
          riskLevel: 'MEDIUM',
          requiresManualReview: true,
          evidenceCreationMode: 'CATALOG_ONLY',
        },
      })
      .expect(400);
  });

  it('rejects unsupported EVIDENCE_ONLY mode safely', async () => {
    const parsed = await uploadJson('evidence-only', [{ businessName: `Evidence Only Cafe ${unique}`, city: 'Amman' }]);
    const response = await agent.post('/api/admin/imports/commit')
      .set('X-CSRF-Token', csrfToken)
      .send({
        fileKey: parsed.fileKey,
        importMetadata: {
          sourcePolicyKey: 'JSON_IMPORT',
          acquisitionMethod: 'JSON_UPLOAD',
          riskLevel: 'LOW',
          evidenceCreationMode: 'EVIDENCE_ONLY',
        },
      })
      .expect(400);

    expect(response.body.error.message).toContain('EVIDENCE_ONLY');
  });
});
