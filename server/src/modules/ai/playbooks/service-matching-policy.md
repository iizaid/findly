# Service Matching Policy

## Purpose
This policy tells the AI how to evaluate whether a lead matches specific service types. The `serviceFit` dimension score depends heavily on this matching.

## Service-Specific Rules

### 1. Website Development
**Good leads:**
- Businesses with NO website but strong local presence (reviews, map listing, social)
- Businesses relying solely on social media with no owned web presence
- Restaurants, cafes, clinics, salons, gyms, real estate, stores, hotels, agencies
- High review count + no website = strong signal

**Weak/bad leads:**
- No contact path at all (can't reach them)
- Irrelevant category (ATMs, kiosks, utility services)
- Already has a strong modern website (unless redesign is the goal)

### 2. Website Redesign
**Good leads:**
- Has a website URL but site is likely outdated, slow, or missing key user flows
- Website exists but business still lacks strong online conversion path

**Weak leads:**
- No website at all → that's "Website Development", not redesign
- Website looks modern and functional based on available signals

### 3. Digital Menu
**Good leads:**
- Restaurants, cafes, bakeries, dessert shops, food trucks
- Instagram-first food businesses with no website/menu link
- High review food businesses that clearly have customers but no digital menu

**Weak leads:**
- Non-food businesses
- Food businesses that already link to delivery apps (Talabat, UberEats) and appear digitally integrated

### 4. Booking System
**Good leads:**
- Clinics, dental offices, salons, gyms, spas, yoga studios, coaches, hotels
- Appointment-based services with phone-only booking

**Weak leads:**
- Retail stores with no appointment need
- Fast food restaurants (walk-in, not appointment)

### 5. E-commerce Store
**Good leads:**
- Clothing, cosmetics, perfume, electronics, home supplies, accessories shops
- Product-based stores with social presence but no online ordering
- Retail businesses that post products on Instagram but have no shop

**Weak leads:**
- Pure service businesses with no products to sell
- Businesses already on established e-commerce platforms

### 6. Automation / CRM
**Good leads:**
- Service businesses with repeated inquiries, bookings, follow-ups
- Real estate agencies, clinics, repair services, consulting firms
- Evidence of high volume (many reviews, multiple locations)

**Weak leads:**
- Very small businesses with no evidence of process volume
- Single-person operations with minimal customer interaction

### 7. SEO
**Good leads:**
- Businesses with a website but likely weak search visibility
- Competitive local categories (clinics, services, agencies, hotels)
- Has website but low/no reviews, suggesting poor discoverability

**Weak leads:**
- No website at all (need website first)
- Categories with minimal search competition

### 8. Social Media Management
**Good leads:**
- Consumer-facing businesses with weak or inactive social profiles
- Restaurants, cafes, salons, retail, tourism
- Has Instagram/Facebook but posts are old or engagement seems low

**Weak leads:**
- B2B businesses with minimal social need
- No social channels exist at all (hard to manage what doesn't exist)

### 9. Branding / Design
**Good leads:**
- Visually driven businesses (salons, restaurants, boutiques, studios)
- New businesses or those with inconsistent visual identity
- Multiple social presences with no unified look

**Weak leads:**
- No evidence of design or branding need
- Established franchises with corporate branding

### 10. Landing Page
**Good leads:**
- Businesses running campaigns or promotions needing a focused page
- Service businesses with a general website but no specific service landing pages
- Event venues, course providers, product launches

**Weak leads:**
- Businesses already with well-structured websites
- No web presence at all (need full website first)

### 11. YouTube Thumbnail Design
**Good leads:**
- Content creators, YouTube channels, media brands
- Educational content providers, podcasters, video-heavy businesses
- Evidence of video/content creation activity

**Weak leads:**
- Local businesses with no video or content evidence
- Random cafes/stores with no media presence

### 12. Digital Presence Improvement (General)
**Good leads:**
- Use a balanced mix of: website gap, contactability, social presence, and reputation gaps
- Any business with multiple digital deficiencies

**Weak leads:**
- Businesses with strong existing digital presence across channels

## Critical Rule
The model MUST explicitly lower `serviceFit` when the user's service does not match the lead's business type or evident needs. A great restaurant is a poor lead for "YouTube Thumbnail Design".
