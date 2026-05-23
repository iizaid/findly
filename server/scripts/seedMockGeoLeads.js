import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const USER_EMAIL = 'testuser@findly.com';

const main = async () => {
  try {
    let user = await prisma.user.findUnique({
      where: { email: USER_EMAIL },
      include: { ownedWorkspaces: true },
    });

    if (!user) {
      console.log(`User ${USER_EMAIL} not found. Creating...`);
      user = await prisma.user.create({
        data: {
          email: USER_EMAIL,
          name: 'Test User',
          passwordHash: '$2b$12$YnN/knIWpA3j/EdtdiMUEeXue45MmK1C67LixHAFU9BZCkyK6g81S', // TestPassword123!
          emailVerified: true,
          emailVerifiedAt: new Date(),
          creditsBalance: 100,
          ownedWorkspaces: {
            create: {
              name: "Test User's workspace"
            }
          }
        },
        include: { ownedWorkspaces: true }
      });
    } else {
      await prisma.user.update({
        where: { id: user.id },
        data: { creditsBalance: 100 }
      });
    }

    const workspace = user.ownedWorkspaces[0];
    if (!workspace) {
      console.error(`Workspace for user ${USER_EMAIL} not found.`);
      process.exit(1);
    }

    console.log(`Creating mock geocoded leads for user ${USER_EMAIL} in workspace ${workspace.name} (${workspace.id})...`);

    // 1. Create a Lead List
    const leadList = await prisma.leadList.create({
      data: {
        userId: user.id,
        workspaceId: workspace.id,
        name: 'Amman Business Hub',
        sourceRequested: 'GOOGLE_MAPS',
        sourceUsed: 'GOOGLE_MAPS',
        resultCount: 3,
      },
    });

    console.log(`Created LeadList: ${leadList.name} (${leadList.id})`);

    const mockLeadsData = [
      {
        businessName: 'Amman Premium Spa',
        category: 'Spa',
        city: 'Amman',
        country: 'Jordan',
        address: 'Madina Al Munawwara St, Amman, Jordan',
        phone: '+96265551122',
        websiteUrl: 'https://ammanpremiumspa.local',
        rating: 4.8,
        reviewCount: 142,
        latitude: 31.9830,
        longitude: 35.8672,
        geoStatus: 'RESOLVED',
        geoConfidence: 95,
        geoAccuracy: 'address',
        opportunityScore: 92,
        scoreLevel: 'GOLD',
        detectedSignals: ['NO_WEBSITE', 'HIGH_RATING', 'HAS_PHONE'],
        suggestedService: 'Website Development & Booking Systems',
        outreachAngle: 'Offer a clean, fully-automated reservation flow to capitalize on their outstanding 4.8-star review ranking.',
        reasons: ['No active official website discovered', 'Exceptional review reputation (4.8 stars)', 'Direct phone contact available for instant follow-up'],
      },
      {
        businessName: 'Sweifiyeh Fitness Elite',
        category: 'Gym',
        city: 'Amman',
        country: 'Jordan',
        address: 'Sweifiyeh Center, Amman, Jordan',
        phone: '+96264448899',
        websiteUrl: '',
        rating: 3.9,
        reviewCount: 38,
        latitude: 31.9545,
        longitude: 35.8590,
        geoStatus: 'RESOLVED',
        geoConfidence: 90,
        geoAccuracy: 'business',
        opportunityScore: 78,
        scoreLevel: 'HIGH',
        detectedSignals: ['NEEDS_WEBSITE_DEVELOPMENT', 'LOW_REVIEW_COUNT'],
        suggestedService: 'SEO Optimization & Local Google Maps Listing Boost',
        outreachAngle: 'Help them build local organic presence and reviews to outpace surrounding athletic gyms.',
        reasons: ['Weak digital footprint with extremely low review density', 'High potential category with massive search competition in Sweifiyeh area'],
      },
      {
        businessName: 'Al-Abdali Gourmet Cafe',
        category: 'Cafe',
        city: 'Amman',
        country: 'Jordan',
        address: 'Abdali Boulevard, Amman, Jordan',
        phone: '+962799988776',
        websiteUrl: 'https://abdaligourmet.local',
        rating: 4.5,
        reviewCount: 220,
        latitude: 31.9620,
        longitude: 35.9080,
        geoStatus: 'RESOLVED',
        geoConfidence: 88,
        geoAccuracy: 'street',
        opportunityScore: 45,
        scoreLevel: 'MEDIUM',
        detectedSignals: ['HAS_WEBSITE', 'HIGH_REVIEW_COUNT', 'NEEDS_DIGITAL_MENU_POSSIBLE'],
        suggestedService: 'Digital Interactive Menu Integration',
        outreachAngle: 'Provide a sleek interactive dynamic QR menu matching their beautiful boulevard upscale vibe.',
        reasons: ['Has solid review rating and website', 'Lacks optimized reservation forms or digital menu interaction flow'],
      },
    ];

    for (const data of mockLeadsData) {
      const { opportunityScore, scoreLevel, detectedSignals, suggestedService, outreachAngle, reasons, ...leadFields } = data;

      // Create Lead
      const lead = await prisma.lead.create({
        data: {
          ...leadFields,
          userId: user.id,
          workspaceId: workspace.id,
          leadListId: leadList.id,
          status: 'NEW',
        },
      });

      // Create LeadListLead association
      const lll = await prisma.leadListLead.create({
        data: {
          leadListId: leadList.id,
          leadId: lead.id,
          status: 'NEW',
        },
      });

      // Create LeadAnalysis
      await prisma.leadAnalysis.create({
        data: {
          userId: user.id,
          workspaceId: workspace.id,
          leadId: lead.id,
          leadListLeadId: lll.id,
          opportunityScore,
          scoreLevel,
          detectedSignals,
          suggestedService,
          outreachAngle,
          reasons,
        },
      });

      console.log(`Seeded Lead & Analysis: ${lead.businessName} (Lat: ${lead.latitude}, Lon: ${lead.longitude})`);
    }

    console.log('All mock leads successfully seeded!');
  } catch (error) {
    console.error('Error seeding leads:', error);
  } finally {
    await prisma.$disconnect();
  }
};

main();
