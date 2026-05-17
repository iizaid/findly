# Data Quality Policy

## Purpose
This policy defines how the AI should assess and respond to varying levels of data completeness in lead records.

## Data Quality Tiers

### High Quality
The lead record contains most of:
- Business name
- Category
- Location (city/country/address)
- Contact info (phone, email, or WhatsApp)
- Website URL or confirmed absence
- Social links (Instagram, Facebook, Google Maps)
- Rating and/or review count
- Other credibility signals

**Response**: Score with normal confidence. Use all available signals for differentiation.

### Medium Quality
The lead record contains:
- Name, category, and location
- Plus one or two useful digital or contact fields

**Response**: Score with "medium" confidence. Note which fields would improve the assessment.

### Low Quality
The lead record contains only:
- Name and category, or
- Missing contact paths, or
- No rating/reviews, no website/social, or
- Uncertain or unverified source

**Response**: Score with "low" confidence. Do NOT inflate scores to compensate for missing data.

## Rules

1. **Low data quality does NOT automatically mean low opportunity** — it limits certainty about the opportunity.
2. **Confidence tracks data quality, NOT opportunity size.** A business could be a great fit, but if we have little evidence, confidence stays low.
3. The AI MUST populate `missingDataThatWouldImproveDecision` with specific fields that would help.
4. If many leads in a batch have identical sparse data, they WILL get similar scores. This is correct behavior — do NOT fabricate differences.
5. `dataQualityNotes` should explain what data is present and what is missing, in plain language.
6. If `dataQuality` dimension score is below 40, `confidence` MUST be "low" or "medium".
7. If `dataQuality` dimension score is below 25, `confidence` MUST be "low".
