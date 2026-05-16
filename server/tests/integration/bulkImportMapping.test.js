import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import path from 'node:path';
import fs from 'node:fs/promises';

process.env.NODE_ENV = 'test';
process.env.PORT ??= '4101';
process.env.SESSION_SECRET ??= 'test-session-secret-that-is-long-enough-for-findly';
process.env.COOKIE_NAME ??= 'findly_test_session';
process.env.CSRF_COOKIE_NAME ??= 'findly_test_csrf';
process.env.SESSION_TTL_DAYS ??= '30';

let createApp;
let prisma;
let agent;
let csrfToken;
let testFileKey;

const unique = Date.now().toString(36);
const adminEmail = `admin.mapping.${unique}@findly.local`;

const getCsrfToken = async (reqAgent) => {
  const response = await reqAgent.get('/api/csrf-token').expect(200);
  return response.body.data.csrfToken;
};

beforeAll(async () => {
  ({ createApp } = await import('../../src/app.js'));
  ({ prisma } = await import('../../src/db/prisma.js'));

  const app = createApp();
  agent = request.agent(app);

  // Login as admin
  await prisma.user.deleteMany({ where: { email: adminEmail } }).catch(() => {});
  
  await agent.post('/api/auth/register').send({
    name: 'Admin Mapping Test',
    email: adminEmail,
    password: 'Secure12345@#$',
  });

  await prisma.user.update({
    where: { email: adminEmail },
    data: { emailVerified: true, role: 'ADMIN' },
  });

  await agent.post('/api/auth/login').send({
    email: adminEmail,
    password: 'Secure12345@#$',
  });

  csrfToken = await getCsrfToken(agent);

  // Upload a test CSV file to get a fileKey
  const uniquePhone1 = '079' + Date.now().toString().slice(-7);
  const uniquePhone2 = '078' + Date.now().toString().slice(-7);
  
  const csvContent = `Account,IG,Mobile,Area,Website
Cafe One ${unique},cafe_one_${unique},${uniquePhone1},Amman,https://cafeone${unique}.com
Cafe Two ${unique},cafe_two_${unique},${uniquePhone2},Zarqa,`;

  const { getAdminUploadDir } = await import('../../src/modules/admin/uploadCleanup.service.js');
  const uploadDir = getAdminUploadDir();
  await fs.mkdir(uploadDir, { recursive: true });
  const testCsvPath = path.join(uploadDir, `test-mapping-${unique}.csv`);
  await fs.writeFile(testCsvPath, csvContent);

  const uploadRes = await agent.post('/api/admin/imports/parse')
    .set('X-CSRF-Token', csrfToken)
    .attach('file', testCsvPath);

  testFileKey = uploadRes.body.data.fileKey;
});

afterAll(async () => {
  if (testFileKey) {
    await prisma.leadCatalog.deleteMany({
      where: { sourceFile: testFileKey }
    }).catch(() => {});
    
    await prisma.datasetImport.deleteMany({
      where: { fileName: testFileKey }
    }).catch(() => {});

    const { removeAdminUploadFile } = await import('../../src/modules/admin/uploadCleanup.service.js');
    await removeAdminUploadFile(testFileKey);
  }
  
  await prisma.user.delete({ where: { email: adminEmail } }).catch(() => {});
  await prisma.$disconnect();
});

describe('Bulk Import Mapping Validation', () => {
  it('rejects missing businessName mapping', async () => {
    const response = await agent.post('/api/admin/imports/commit')
      .set('X-CSRF-Token', csrfToken)
      .send({
        fileKey: testFileKey,
        mappingConfig: {
          sheets: [
            {
              sheetName: 'CSV',
              columns: [
                { sourceHeader: 'IG', targetField: 'instagramUsername' }
              ]
            }
          ]
        }
      })
      .expect(400);

    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(response.body.error.message).toContain('businessName');
  });

  it('rejects duplicate target fields except ignore', async () => {
    const response = await agent.post('/api/admin/imports/commit')
      .set('X-CSRF-Token', csrfToken)
      .send({
        fileKey: testFileKey,
        mappingConfig: {
          sheets: [
            {
              sheetName: 'CSV',
              columns: [
                { sourceHeader: 'Account', targetField: 'businessName' },
                { sourceHeader: 'IG', targetField: 'instagramUsername' },
                { sourceHeader: 'Website', targetField: 'instagramUsername' }, // duplicate
              ]
            }
          ]
        }
      })
      .expect(400);

    expect(response.body.error.message).toContain('Duplicate mapping');
  });

  it('rejects unknown target fields', async () => {
    const response = await agent.post('/api/admin/imports/commit')
      .set('X-CSRF-Token', csrfToken)
      .send({
        fileKey: testFileKey,
        mappingConfig: {
          sheets: [
            {
              sheetName: 'CSV',
              columns: [
                { sourceHeader: 'Account', targetField: 'businessName' },
                { sourceHeader: 'IG', targetField: 'unknownField123' },
              ]
            }
          ]
        }
      })
      .expect(400);

    expect(response.body.error.message).toContain('Unknown target field');
  });

  it('rejects unknown source headers', async () => {
    const response = await agent.post('/api/admin/imports/commit')
      .set('X-CSRF-Token', csrfToken)
      .send({
        fileKey: testFileKey,
        mappingConfig: {
          sheets: [
            {
              sheetName: 'CSV',
              columns: [
                { sourceHeader: 'Account', targetField: 'businessName' },
                { sourceHeader: 'NonExistentColumn', targetField: 'ignore' },
              ]
            }
          ]
        }
      })
      .expect(400);

    expect(response.body.error.message).toContain('not found in sheet');
  });

  it('commits successfully with valid custom mapping', async () => {
    // Re-upload test file to get a fresh key since the previous tests might have somehow cleaned it up if they failed in certain ways
    // (Wait, 400 validation error does NOT clean up the file, only successful commit does).
    
    const response = await agent.post('/api/admin/imports/commit')
      .set('X-CSRF-Token', csrfToken)
      .send({
        fileKey: testFileKey,
        mappingConfig: {
          sheets: [
            {
              sheetName: 'CSV',
              columns: [
                { sourceHeader: 'Account', targetField: 'businessName' },
                { sourceHeader: 'IG', targetField: 'instagramUsername' },
                { sourceHeader: 'Mobile', targetField: 'phone' },
                { sourceHeader: 'Area', targetField: 'city' },
                { sourceHeader: 'Website', targetField: 'websiteUrl' },
              ]
            }
          ]
        }
      })
      .expect(200);

    console.log('SUMMARY:', response.body.data.summary);
    expect(response.body.data.summary.importedRows).toBe(2);
    // Verify imported data mapped correctly
    const importedLead = await prisma.leadCatalog.findFirst({
      where: { businessName: `Cafe One ${unique}` }
    });

    expect(importedLead).toBeTruthy();
    expect(importedLead.instagramUsername).toBe(`cafe_one_${unique}`);
    expect(importedLead.phone).toMatch(/^079/); // Starts with 079
    expect(importedLead.city).toBe('Amman');
    expect(importedLead.websiteUrl).toBe(`https://cafeone${unique}.com/`);
  });
});
