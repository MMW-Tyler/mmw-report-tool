require('dotenv').config();
const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');
const path = require('path');
const { generateReport: generateDocxReport } = require('./generate-docx');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
const AL_KEY = process.env.ADVICE_LOCAL_API_KEY;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const DATAFORSEO_LOGIN = process.env.DATAFORSEO_LOGIN;
const DATAFORSEO_PASSWORD = process.env.DATAFORSEO_PASSWORD;
const AL_BASE = 'https://p.lssdev.com';

// ─────────────────────────────────────────────
// SUGGESTED KEYWORD SETS BY NICHE
// [city] and [state] are replaced at runtime with the prospect's location
// ─────────────────────────────────────────────
const NICHE_KEYWORDS = {
  medical_spa: [
    'botox [city]', 'lip filler [city]', 'medical spa [city]',
    'botox near me', 'best medical spa [city]', 'dermal fillers [city]',
    'coolsculpting [city]', 'laser hair removal [city]'
  ],
  hormone_therapy: [
    'hormone therapy [city]', 'bioidentical hormones [city]',
    'testosterone replacement [city]', 'functional medicine doctor [city]',
    'hormone doctor near me', 'low testosterone treatment [city]',
    'menopause doctor [city]', 'thyroid doctor [city]'
  ],
  weight_loss: [
    'weight loss clinic [city]', 'medical weight loss [city]',
    'semaglutide [city]', 'glp-1 [city]',
    'weight loss doctor near me', 'wegovy [city]',
    'tirzepatide [city]', 'weight loss program [city]'
  ],
  womens_health: [
    'gynecologist [city]', "women's health clinic [city]",
    'obgyn near me', 'vaginal rejuvenation [city]',
    'pelvic floor therapy [city]', 'menopause specialist [city]',
    "women's wellness [city]", 'hormone therapy for women [city]'
  ],
  chiropractic: [
    'chiropractor [city]', 'chiropractic care [city]',
    'back pain relief [city]', 'chiropractor near me',
    'best chiropractor [city]', 'spinal decompression [city]',
    'neck pain chiropractor [city]', 'sports chiropractor [city]'
  ],
  dermatology: [
    'dermatologist [city]', 'skin care clinic [city]',
    'acne treatment [city]', 'dermatologist near me',
    'best dermatologist [city]', 'mole removal [city]',
    'skin cancer screening [city]', 'eczema treatment [city]'
  ],
  concierge_medicine: [
    'concierge medicine [city]', 'direct primary care [city]',
    'concierge doctor near me', 'primary care physician [city]',
    'annual physical [city]', 'family doctor [city]',
    'executive health [city]', 'preventive medicine [city]'
  ],
  integrative_wellness: [
    'integrative medicine [city]', 'wellness center [city]',
    'holistic doctor [city]', 'naturopathic doctor [city]',
    'alternative medicine [city]', 'IV therapy [city]',
    'functional wellness [city]', 'holistic health [city]'
  ],
  aesthetics_skincare: [
    'skin care clinic [city]', 'facial near me',
    'chemical peel [city]', 'microneedling [city]',
    'hydrafacial [city]', 'esthetician [city]',
    'anti-aging facial [city]', 'skin rejuvenation [city]'
  ],
  // Fallback for unrecognized niches
  general_medical: [
    'medical clinic [city]', 'doctor near me',
    'best doctor [city]', 'health clinic [city]',
    'medical practice [city]', 'patient care [city]'
  ]
};

// Map specialty/category strings to niche keys
function detectNiche(specialty, googleCategory, services) {
  const text = [specialty, googleCategory, ...(services||[])].join(' ').toLowerCase();

  if (/spa|botox|filler|coolsculpt|aesthetic|medspa|med spa/.test(text)) return 'medical_spa';
  if (/hormone|testosterone|bioidentical|menopause|thyroid|functional medicine/.test(text)) return 'hormone_therapy';
  if (/weight loss|bariatric|semaglutide|glp|wegovy|tirzepatide|obesity/.test(text)) return 'weight_loss';
  if (/gynecol|obgyn|ob-gyn|women.s health|pelvic|vaginal|urogyn/.test(text)) return 'womens_health';
  if (/chiropractic|chiropractor|spine|spinal|decompression/.test(text)) return 'chiropractic';
  if (/dermatol|skin cancer|acne|eczema|psoriasis/.test(text)) return 'dermatology';
  if (/concierge|direct primary|executive health|preventive/.test(text)) return 'concierge_medicine';
  if (/integrative|holistic|naturopath|wellness|alternative medicine|iv therapy/.test(text)) return 'integrative_wellness';
  if (/esthetician|facial|peel|microneedl|hydrafacial|skin care/.test(text)) return 'aesthetics_skincare';

  return 'general_medical';
}

function buildSuggestedKeywords(niche, city) {
  const templates = NICHE_KEYWORDS[niche] || NICHE_KEYWORDS.general_medical;
  const cityLower = (city || '').toLowerCase();
  return templates.map(kw => kw.replace(/\[city\]/g, cityLower).replace(/\[state\]/g, ''));
}

// ─────────────────────────────────────────────
// HEALTH CHECK
// ─────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    keys: {
      google: !!GOOGLE_API_KEY,
      adviceLocal: !!AL_KEY,
      anthropic: !!ANTHROPIC_KEY,
      dataForSeo: !!(DATAFORSEO_LOGIN && DATAFORSEO_PASSWORD),
    }
  });
});

// ─────────────────────────────────────────────
// GOOGLE PLACES — find business + get details
// ─────────────────────────────────────────────
app.post('/api/places', async (req, res) => {
  const { businessName, city, state } = req.body;
  if (!businessName || !city || !state) {
    return res.status(400).json({ error: 'businessName, city, state required' });
  }

  try {
    const query = `${businessName} ${city} ${state}`;

    // Step 1: Find place_id
    const findUrl = `https://maps.googleapis.com/maps/api/place/findplacefromtext/json?input=${encodeURIComponent(query)}&inputtype=textquery&fields=place_id,name,formatted_address&key=${GOOGLE_API_KEY}`;
    const findRes = await fetch(findUrl);
    const findData = await findRes.json();

    if (!findData.candidates || findData.candidates.length === 0) {
      return res.status(404).json({ error: 'No business found', query, raw: findData });
    }

    const placeId = findData.candidates[0].place_id;

    // Step 2: Get full details
    const fields = [
      'place_id', 'name', 'formatted_address', 'formatted_phone_number',
      'rating', 'user_ratings_total', 'business_status', 'types',
      'website', 'opening_hours', 'geometry', 'address_components'
    ].join(',');

    const detailUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=${fields}&key=${GOOGLE_API_KEY}`;
    const detailRes = await fetch(detailUrl);
    const detailData = await detailRes.json();

    if (!detailData.result) {
      return res.status(500).json({ error: 'Failed to get place details', raw: detailData });
    }

    const p = detailData.result;

    // Parse address components into parts
    const components = p.address_components || [];
    const getComponent = (type) => {
      const c = components.find(c => c.types.includes(type));
      return c ? c.long_name : '';
    };
    const getShortComponent = (type) => {
      const c = components.find(c => c.types.includes(type));
      return c ? c.short_name : '';
    };

    const streetNumber = getComponent('street_number');
    const streetName = getComponent('route');
    const suite = getComponent('subpremise');
    const city_parsed = getComponent('locality') || getComponent('sublocality');
    const state_parsed = getShortComponent('administrative_area_level_1');
    const zip = getComponent('postal_code');

    res.json({
      placeId,
      name: p.name,
      formattedAddress: p.formatted_address,
      phone: p.formatted_phone_number || '',
      street: streetNumber && streetName ? `${streetNumber} ${streetName}` : '',
      suite: suite || '',
      city: city_parsed,
      state: state_parsed,
      zip,
      website: p.website || '',
      rating: p.rating || null,
      reviewCount: p.user_ratings_total || 0,
      businessStatus: p.business_status || '',
      types: p.types || [],
      hasHours: !!(p.opening_hours),
      lat: p.geometry?.location?.lat || null,
      lng: p.geometry?.location?.lng || null,
    });

  } catch (err) {
    console.error('Places error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────
// PAGESPEED INSIGHTS
// ─────────────────────────────────────────────
app.post('/api/pagespeed', async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'url required' });

  try {
    const [mobileRes, desktopRes] = await Promise.all([
      fetch(`https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(url)}&strategy=mobile&key=${GOOGLE_API_KEY}`),
      fetch(`https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(url)}&strategy=desktop&key=${GOOGLE_API_KEY}`)
    ]);

    const [mobile, desktop] = await Promise.all([mobileRes.json(), desktopRes.json()]);

    const extractMetrics = (data) => {
      const lhr = data.lighthouseResult;
      if (!lhr) return null;
      const audits = lhr.audits || {};
      const categories = lhr.categories || {};
      return {
        performanceScore: categories.performance ? Math.round(categories.performance.score * 100) : null,
        fcp: audits['first-contentful-paint']?.displayValue || null,
        lcp: audits['largest-contentful-paint']?.displayValue || null,
        tbt: audits['total-blocking-time']?.displayValue || null,
        cls: audits['cumulative-layout-shift']?.displayValue || null,
        speedIndex: audits['speed-index']?.displayValue || null,
        tti: audits['interactive']?.displayValue || null,
        pageSize: audits['total-byte-weight']?.displayValue || null,
        requests: audits['network-requests']?.details?.items?.length || null,
        // Mobile specific checks
        tapTargets: audits['tap-targets']?.score === 1,
        viewport: audits['viewport']?.score === 1,
        fontSizes: audits['font-size']?.score === 1,
        // Opportunities
        opportunities: Object.values(audits)
          .filter(a => a.details?.type === 'opportunity' && a.score !== null && a.score < 0.9)
          .slice(0, 8)
          .map(a => ({ title: a.title, savings: a.displayValue, score: a.score })),
        // Diagnostics (failed audits that aren't opportunities)
        diagnostics: Object.values(audits)
          .filter(a => a.details?.type === 'table' && a.score !== null && a.score < 1 && a.score >= 0)
          .slice(0, 6)
          .map(a => ({ title: a.title, description: a.description, score: a.score })),
        // Category scores
        accessibilityScore: categories.accessibility ? Math.round(categories.accessibility.score * 100) : null,
        bestPracticesScore: categories['best-practices'] ? Math.round(categories['best-practices'].score * 100) : null,
        seoScore: categories.seo ? Math.round(categories.seo.score * 100) : null,
        // Passing audits count
        passingAudits: Object.values(audits).filter(a => a.score === 1).length,
        failingAudits: Object.values(audits).filter(a => a.score !== null && a.score < 0.9).length,
      };
    };

    res.json({
      mobile: extractMetrics(mobile),
      desktop: extractMetrics(desktop),
      url,
    });

  } catch (err) {
    console.error('PageSpeed error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────
// WEBSITE CONTENT FETCH + CLAUDE EXTRACTION
// ─────────────────────────────────────────────
app.post('/api/extract-website', async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'url required' });

  try {
    // Fetch website HTML
    const siteRes = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MMWBot/1.0)' },
      timeout: 10000
    });
    const html = await siteRes.text();

    // Strip HTML tags for cleaner text
    const text = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 4000); // Keep first 4000 chars — enough for Claude

    // Send to Claude for extraction
    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 500,
        messages: [{
          role: 'user',
          content: `Extract key business information from this website text. Return ONLY valid JSON, no markdown, no explanation.

Website text:
${text}

Return this exact JSON structure:
{
  "specialty": "primary specialty or service type (e.g. Medical Aesthetics, Hormone Therapy, Medical Spa)",
  "description": "1-2 sentence business description suitable for directory listings",
  "services": ["service1", "service2", "service3"],
  "googleCategory": "best matching Google Business category slug (e.g. skin_care_clinic, medical_spa, wellness_center)",
  "practitionerType": "e.g. Nurse Practitioner, MD, Esthetician, etc if found"
}`
        }]
      })
    });

    const claudeData = await claudeRes.json();
    const text_response = claudeData.content?.[0]?.text || '{}';
    const cleaned = text_response.replace(/```json|```/g, '').trim();
    const extracted = JSON.parse(cleaned);

    res.json(extracted);

  } catch (err) {
    console.error('Website extraction error:', err);
    // Return empty object rather than failing — website extraction is best-effort
    res.json({ specialty: '', description: '', services: [], googleCategory: '', practitionerType: '' });
  }
});

// ─────────────────────────────────────────────
// WEBSITE AUDIT — SEO/content analysis via Claude
// ─────────────────────────────────────────────
app.post('/api/website-audit', async (req, res) => {
  const { url, businessName, specialty, services } = req.body;
  if (!url) return res.json({ error: 'no url', scores: {}, issues: [], positives: [] });

  try {
    // Fetch raw HTML
    const siteRes = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MMWBot/1.0)' },
      timeout: 12000
    });
    const html = await siteRes.text();

    // Keep more HTML for audit — strip scripts/styles but preserve structure
    const stripped = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 6000);

    // Also extract structural signals from raw HTML before stripping
    const hasH1 = /<h1[\s>]/i.test(html);
    const h1Count = (html.match(/<h1[\s>]/gi) || []).length;
    const hasH2 = /<h2[\s>]/i.test(html);
    const hasMetaDesc = /<meta[^>]+name=["']description["'][^>]*content=["'][^"']{10,}/i.test(html);
    const hasOpenGraph = /<meta[^>]+property=["']og:/i.test(html);
    const hasSchema = /application\/ld\+json/i.test(html);
    const hasFAQ = /faq|frequently asked|questions/i.test(html);
    const hasTestimonials = /testimonial|review|what (our|my|clients|patients) say/i.test(html);
    const hasBeforeAfter = /before.{0,10}after|before &amp; after|before &amp;amp; after/i.test(html);
    const hasBooking = /book (now|appointment|online|a consultation)|schedule (now|online|appointment|a consultation)|request appointment/i.test(html);
    const hasPhone = /\(?\d{3}\)?[\s\-\.]\d{3}[\s\-\.]\d{4}/.test(html);
    const hasWordPress = /wp-content|wp-includes|wordpress/i.test(html);
    const hasSSL = url.startsWith('https');
    const hasCreds = /md|np|pa-c|rn|esthetician|licensed|board.certified|certified|credentials|fellowship/i.test(html);
    const hasPricing = /pricing|packages|\$\d{2,4}|starting (at|from)/i.test(html);
    const hasVideo = /<video|youtube\.com|vimeo\.com|youtu\.be/i.test(html);
    const hasBlog = /blog|articles?|resources?|news/i.test(html);
    const internalLinks = (html.match(/<a[^>]+href=["'][^"'#]*["']/gi) || []).length;
    const imgCount = (html.match(/<img[^>]+>/gi) || []).length;
    const imgWithAlt = (html.match(/<img[^>]+alt=["'][^"']{3,}["']/gi) || []).length;

    const structuralSignals = {
      hasH1, h1Count, hasH2, hasMetaDesc, hasOpenGraph, hasSchema, hasFAQ,
      hasTestimonials, hasBeforeAfter, hasBooking, hasPhone, hasWordPress,
      hasSSL, hasCreds, hasPricing, hasVideo, hasBlog, internalLinks,
      imgCount, imgWithAlt, altTextRate: imgCount > 0 ? Math.round(imgWithAlt/imgCount*100) : null
    };

    // Send to Claude for deeper content analysis
    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1200,
        messages: [{
          role: 'user',
          content: `You are auditing a medical aesthetics or healthcare practice website for a marketing sales presentation. Be direct, specific, and actionable. This is for a sales rep to show a prospect what's wrong with their site.

Business: ${businessName}
Specialty: ${specialty || 'medical aesthetics'}
Services listed on site: ${(services || []).join(', ')}
URL: ${url}

Website text (first 6000 chars):
${stripped}

Structural signals already detected:
- H1 present: ${hasH1} (count: ${h1Count})
- Meta description: ${hasMetaDesc}
- Schema markup: ${hasSchema}
- FAQ section: ${hasFAQ}
- Testimonials/reviews: ${hasTestimonials}
- Before/after photos: ${hasBeforeAfter}
- Booking/scheduling CTA: ${hasBooking}
- Phone number visible: ${hasPhone}
- WordPress: ${hasWordPress}
- SSL (HTTPS): ${hasSSL}
- Credentials mentioned: ${hasCreds}
- Blog/content section: ${hasBlog}
- Images with alt text: ${imgWithAlt} of ${imgCount}

Evaluate the website across these 5 areas and return a score (0-100) and specific findings for each:

1. SEO Foundation — title tags, meta descriptions, H1 usage, schema, internal linking
2. Content Depth & Quality — service descriptions, educational content, blogs, FAQs
3. Trust & Credibility — credentials, testimonials, before/after, awards, team photos
4. Conversion Optimization — CTAs, booking, phone visibility, contact forms, urgency
5. Service Coverage — are services clearly described with dedicated sections or pages?

Return ONLY this JSON, no markdown:
{
  "overallScore": 42,
  "seo": { "score": 35, "issues": ["No meta description found", "Only one H1 tag across entire site"], "positives": ["SSL enabled", "Mobile responsive"] },
  "content": { "score": 40, "issues": ["Service descriptions are 1-2 sentences each — not enough for SEO", "No blog or educational content"], "positives": ["9 services listed"] },
  "trust": { "score": 55, "issues": ["No before/after photos visible", "Credentials not prominently displayed"], "positives": ["Testimonials section present"] },
  "conversion": { "score": 50, "issues": ["No online booking system found", "CTA buttons not visible above the fold"], "positives": ["Phone number in header"] },
  "services": { "score": 30, "issues": ["All services on one page with minimal description", "No dedicated service pages for SEO"], "positives": ["Service list is comprehensive"] },
  "topFindings": ["No dedicated service pages — each service needs its own page for Google to rank it", "Content is too thin for SEO — Google wants 300+ words per service", "Missing schema markup — AI search engines can't properly categorize this site"]
}`
        }]
      })
    });

    const claudeData = await claudeRes.json();
    const rawText = claudeData.content?.[0]?.text || '{}';
    const cleanedText = rawText.replace(/```json|```/g, '').trim();
    const audit = JSON.parse(cleanedText);

    res.json({ ...audit, structuralSignals, url });

  } catch (err) {
    console.error('Website audit error:', err);
    res.json({
      overallScore: null,
      error: err.message,
      structuralSignals: {},
      seo: { score: null, issues: ['Audit could not be completed'], positives: [] },
      content: { score: null, issues: [], positives: [] },
      trust: { score: null, issues: [], positives: [] },
      conversion: { score: null, issues: [], positives: [] },
      services: { score: null, issues: [], positives: [] },
      topFindings: []
    });
  }
});

// ─────────────────────────────────────────────
// ADVICE LOCAL — create client, get report, delete
// ─────────────────────────────────────────────
app.post('/api/advice-local/scan', async (req, res) => {
  const { name, phone, street, suite, city, state, zip, website, description, category } = req.body;
  if (!name || !phone || !street || !city || !state || !zip) {
    return res.status(400).json({ error: 'Missing required business fields' });
  }

  let clientId = null;

  try {
    // Create client
    const params = new URLSearchParams();
    params.append('name', name);
    params.append('phone', phone);
    params.append('street', street);
    params.append('city', city);
    params.append('state', state);
    params.append('zipcode', zip);
    if (suite) params.append('suite', suite);
    if (website) params.append('website', website);
    if (description) params.append('description', description);
    if (category) params.append('categoryGoogle', category);

    const createRes = await fetch(`${AL_BASE}/legacyclients`, {
      method: 'POST',
      headers: { 'x-api-token': AL_KEY, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString()
    });
    const createData = await createRes.json();

    if (!createData.success || !createData.data?.id) {
      throw new Error('Advice Local create failed: ' + JSON.stringify(createData.error || createData));
    }

    clientId = createData.data.id;

    // Pull report with retry logic — Advice Local's scanner needs time to check
    // each directory. 2s is often not enough; we now wait 6s then retry once
    // if the directory count looks suspiciously low (under 5 found).
    const pullReport = async () => {
      const r = await fetch(`${AL_BASE}/legacyclients/${clientId}/report`, {
        headers: { 'x-api-token': AL_KEY, 'Content-Type': 'application/json' }
      });
      return r.json();
    };

    await new Promise(r => setTimeout(r, 6000));
    let reportData = await pullReport();

    // Check if scan looks incomplete — retry once after another 5s if so
    const dirCount = reportData?.data?.overview?.baselineOverview?.directoriesFound ?? -1;
    const dirsChecked = reportData?.data?.data?.baseline?.directories?.length ?? 0;
    if (dirCount < 0 || dirsChecked < 10) {
      console.log(`Advice Local: scan looks incomplete (${dirsChecked} dirs checked), retrying in 5s...`);
      await new Promise(r => setTimeout(r, 5000));
      reportData = await pullReport();
    }

    // Delete client (always, even on error)
    await fetch(`${AL_BASE}/legacyclients/${clientId}`, {
      method: 'DELETE',
      headers: { 'x-api-token': AL_KEY, 'Content-Type': 'application/json' }
    });

    res.json({ success: true, clientId, report: reportData });

  } catch (err) {
    // Attempt cleanup
    if (clientId) {
      try {
        await fetch(`${AL_BASE}/legacyclients/${clientId}`, {
          method: 'DELETE',
          headers: { 'x-api-token': AL_KEY, 'Content-Type': 'application/json' }
        });
      } catch(e) {}
    }
    console.error('Advice Local error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────
// DATAFORSEO — keyword rankings + backlinks + domain overview
// ─────────────────────────────────────────────
app.post('/api/dataforseo', async (req, res) => {
  const { domain, targetKeywords, city, state, zip, phone } = req.body;
  if (!domain) return res.status(400).json({ error: 'domain required' });

  if (!DATAFORSEO_LOGIN || !DATAFORSEO_PASSWORD) {
    return res.json({
      stub: true,
      message: 'DataForSEO credentials not configured',
      keywords: [],
      backlinks: {},
      domainOverview: {}
    });
  }

  // Clean domain — strip protocol and trailing slash
  const cleanDomain = domain.replace(/https?:\/\//, '').replace(/\/$/, '').replace(/^www\./, '');
  const auth = Buffer.from(`${DATAFORSEO_LOGIN}:${DATAFORSEO_PASSWORD}`).toString('base64');
  const headers = { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/json' };
  const DFS_BASE = 'https://api.dataforseo.com/v3';

  try {
    // Run all three calls in parallel to save time
    const [keywordsRes, backlinkRes, domainOverviewRes] = await Promise.all([

      // 1. Ranked Keywords — what keywords does this domain rank for organically
      fetch(`${DFS_BASE}/dataforseo_labs/google/ranked_keywords/live`, {
        method: 'POST', headers,
        body: JSON.stringify([{
          target: cleanDomain,
          language_code: 'en',
          location_code: 2840,       // United States
          limit: 20,                 // Top 20 keywords
          order_by: ['ranked_serp_element.serp_item.rank_absolute,asc'],
          filters: [
            ['ranked_serp_element.serp_item.type', '<>', 'paid'],
            'and',
            ['keyword_data.keyword_info.search_volume', '>', 0]
          ]
        }])
      }),

      // 2. Backlinks Summary — total backlinks, referring domains, domain rank, spam score
      fetch(`${DFS_BASE}/backlinks/summary/live`, {
        method: 'POST', headers,
        body: JSON.stringify([{
          target: cleanDomain,
          include_subdomains: true,
          backlinks_status_type: 'live'
        }])
      }),

      // 3. Domain Rank Overview — organic traffic distribution across position buckets
      fetch(`${DFS_BASE}/dataforseo_labs/google/domain_rank_overview/live`, {
        method: 'POST', headers,
        body: JSON.stringify([{
          target: cleanDomain,
          language_code: 'en',
          location_code: 2840
        }])
      })
    ]);

    const [keywordsData, backlinkData, domainOverviewData] = await Promise.all([
      keywordsRes.json(),
      backlinkRes.json(),
      domainOverviewRes.json()
    ]);

    // Parse keywords into clean array
    const rawKeywords = keywordsData?.tasks?.[0]?.result?.[0]?.items || [];
    const keywords = rawKeywords.map(item => ({
      keyword: item.keyword_data?.keyword || '',
      position: item.ranked_serp_element?.serp_item?.rank_absolute || null,
      searchVolume: item.keyword_data?.keyword_info?.search_volume || 0,
      cpc: item.keyword_data?.keyword_info?.cpc || 0,
      keywordDifficulty: item.keyword_data?.keyword_properties?.keyword_difficulty || null,
      url: item.ranked_serp_element?.serp_item?.url || '',
      isPage1: (item.ranked_serp_element?.serp_item?.rank_absolute || 99) <= 10,
      isTop3: (item.ranked_serp_element?.serp_item?.rank_absolute || 99) <= 3,
    }));

    // Parse backlink summary
    const backlinkResult = backlinkData?.tasks?.[0]?.result?.[0] || {};
    const backlinks = {
      total: backlinkResult.backlinks || 0,
      referringDomains: backlinkResult.referring_domains || 0,
      referringMainDomains: backlinkResult.referring_main_domains || 0,
      domainRank: backlinkResult.rank || 0,
      spamScore: backlinkResult.backlinks_spam_score || 0,
      firstSeen: backlinkResult.first_seen || null,
    };

    // Parse domain rank overview
    const domainResult = domainOverviewData?.tasks?.[0]?.result?.[0]?.items?.[0] || {};
    const organic = domainResult.metrics?.organic || {};
    const domainOverview = {
      pos1: organic.pos_1 || 0,
      pos2_3: organic.pos_2_3 || 0,
      pos4_10: organic.pos_4_10 || 0,
      pos11_20: organic.pos_11_20 || 0,
      pos21_100: (organic.pos_21_30 || 0) + (organic.pos_31_40 || 0) +
                 (organic.pos_41_50 || 0) + (organic.pos_51_60 || 0) +
                 (organic.pos_61_70 || 0) + (organic.pos_71_80 || 0) +
                 (organic.pos_81_90 || 0) + (organic.pos_91_100 || 0),
      totalKeywords: (organic.pos_1 || 0) + (organic.pos_2_3 || 0) +
                     (organic.pos_4_10 || 0) + (organic.pos_11_20 || 0),
      etv: organic.etv || 0, // estimated traffic value
    };

    // State abbreviation -> full name for DataForSEO location_name
  const STATE_NAMES = {
    AL:'Alabama',AK:'Alaska',AZ:'Arizona',AR:'Arkansas',CA:'California',
    CO:'Colorado',CT:'Connecticut',DE:'Delaware',FL:'Florida',GA:'Georgia',
    HI:'Hawaii',ID:'Idaho',IL:'Illinois',IN:'Indiana',IA:'Iowa',
    KS:'Kansas',KY:'Kentucky',LA:'Louisiana',ME:'Maine',MD:'Maryland',
    MA:'Massachusetts',MI:'Michigan',MN:'Minnesota',MS:'Mississippi',MO:'Missouri',
    MT:'Montana',NE:'Nebraska',NV:'Nevada',NH:'New Hampshire',NJ:'New Jersey',
    NM:'New Mexico',NY:'New York',NC:'North Carolina',ND:'North Dakota',OH:'Ohio',
    OK:'Oklahoma',OR:'Oregon',PA:'Pennsylvania',RI:'Rhode Island',SC:'South Carolina',
    SD:'South Dakota',TN:'Tennessee',TX:'Texas',UT:'Utah',VT:'Vermont',
    VA:'Virginia',WA:'Washington',WV:'West Virginia',WI:'Wisconsin',WY:'Wyoming',
    DC:'District of Columbia'
  };

  // Target keywords — localized SERP lookup with Map Pack detection
    let targetKeywordData = [];
    const cleanTargets = (targetKeywords || []).map(k => k.trim().toLowerCase()).filter(Boolean).slice(0, 10);

    if (cleanTargets.length > 0) {
      // Build location string — DataForSEO requires full state name, not abbreviation
      // e.g. "Gainesville,Florida,United States" not "Gainesville,FL,United States"
      const stateAbbr = (state || '').trim().toUpperCase();
      const stateFull = STATE_NAMES[stateAbbr] || state || '';
      const locationName = city && stateFull
        ? `${city.trim()},${stateFull},United States`
        : 'United States';
      console.log(`[DataForSEO SERP] location_name: "${locationName}"`);

      // Auto-append city to keywords that don't already contain it
      // so "nucca chiropractic" becomes "nucca chiropractic gainesville"
      const cityLower = (city || '').toLowerCase();
      const localizedTargets = cleanTargets.map(kw => {
        const hasCity = cityLower && kw.includes(cityLower);
        const hasState = state && kw.toLowerCase().includes(state.toLowerCase());
        return {
          original: kw,
          localized: (!hasCity && !hasState && cityLower) ? `${kw} ${cityLower}` : kw
        };
      });

      // Clean the prospect's phone for map pack matching (digits only)
      const cleanPhone = (phone || '').replace(/\D/g, '');

      try {
        // Run SERP lookups in parallel — two calls per keyword:
        // 1. organic/live/advanced  → organic rank_group position
        // 2. maps/live/advanced     → Map Pack position (purpose-built, reliable structured data)
        const serpPromises = localizedTargets.map(async ({ original, localized }) => {
          try {
            // Fire both calls in parallel
            const [organicRes, mapsRes] = await Promise.all([

              // Organic rankings
              fetch(`${DFS_BASE}/serp/google/organic/live/advanced`, {
                method: 'POST', headers,
                body: JSON.stringify([{
                  keyword: localized,
                  language_code: 'en',
                  location_name: locationName,
                  depth: 100,
                  calculate_rectangles: false
                }])
              }),

              // Google Maps — returns Map Pack listings with name, phone, address, position
              fetch(`${DFS_BASE}/serp/google/maps/live/advanced`, {
                method: 'POST', headers,
                body: JSON.stringify([{
                  keyword: localized,
                  language_code: 'en',
                  location_name: locationName,
                  depth: 20 // top 20 map results is plenty — we care about top 3
                }])
              })
            ]);

            const [organicData, mapsData] = await Promise.all([
              organicRes.json(),
              mapsRes.json()
            ]);

            // ── ORGANIC POSITION ──
            const organicItems = organicData?.tasks?.[0]?.result?.[0]?.items || [];
            let organicPos = null;
            let organicUrl = '';
            const organicItem = organicItems.find(i =>
              i.type === 'organic' &&
              i.domain && (i.domain.includes(cleanDomain) || cleanDomain.includes(i.domain.replace(/^www\./,'')))
            );
            if (organicItem) {
              organicPos = organicItem.rank_group; // organic-only position, excludes local pack slots
              organicUrl = organicItem.url || '';
            }

            // ── MAP PACK POSITION via Maps API ──
            // Maps results are purpose-built — always return name, phone, address cleanly
            let mapPackPos = null;
            const mapsItems = mapsData?.tasks?.[0]?.result?.[0]?.items || [];
            const businessName = (mapsData?.tasks?.[0]?.result?.[0]?.check_url || '');

            for (const item of mapsItems) {
              if (item.type !== 'maps_search') continue;
              const itemPhone = (item.phone || '').replace(/\D/g, '');
              const itemDomain = (item.domain || item.url || '').toLowerCase().replace(/^www\./, '').replace(/\/.*$/, '');

              const phoneMatch = cleanPhone && itemPhone && cleanPhone === itemPhone;
              const domainMatch = itemDomain && (itemDomain.includes(cleanDomain) || cleanDomain.includes(itemDomain));

              if (phoneMatch || domainMatch) {
                mapPackPos = item.rank_group;
                break;
              }
            }

            return {
              keyword: original,
              localizedKeyword: localized !== original ? localized : null,
              isTarget: true,
              position: organicPos,
              url: organicUrl,
              mapPackPos,
              searchVolume: 0, cpc: 0, keywordDifficulty: null,
              isPage1: organicPos !== null && organicPos <= 10,
              isTop3: organicPos !== null && organicPos <= 3,
            };
          } catch(e) {
            console.error(`[DataForSEO] keyword lookup error for "${original}":`, e.message);
            return { keyword: original, localizedKeyword: null, isTarget: true, position: null, url: '', mapPackPos: null, searchVolume: 0, cpc: 0, keywordDifficulty: null, isPage1: false, isTop3: false };
          }
        });

        const serpResults = await Promise.all(serpPromises);

        // Now get volume/difficulty for all target keywords in one overview call
        try {
          const overviewRes = await fetch(`${DFS_BASE}/dataforseo_labs/google/keyword_overview/live`, {
            method: 'POST', headers,
            body: JSON.stringify([{
              keywords: cleanTargets,
              language_code: 'en',
              location_code: 2840
            }])
          });
          const overviewData = await overviewRes.json();
          const overviewItems = overviewData?.tasks?.[0]?.result?.[0]?.items || [];

          targetKeywordData = serpResults.map(r => {
            const ov = overviewItems.find(i => i.keyword?.toLowerCase() === r.keyword) || {};
            return {
              ...r,
              searchVolume: ov.keyword_info?.search_volume || 0,
              cpc: ov.keyword_info?.cpc || 0,
              keywordDifficulty: ov.keyword_properties?.keyword_difficulty || null,
            };
          });
        } catch(e) {
          targetKeywordData = serpResults;
        }

      } catch(e) {
        console.error('Target keyword SERP lookup error:', e.message);
        targetKeywordData = cleanTargets.map(kw => ({
          keyword: kw, localizedKeyword: null, isTarget: true, position: null, url: '',
          mapPackPos: null, searchVolume: 0, cpc: 0, keywordDifficulty: null,
          isPage1: false, isTop3: false
        }));
      }
    }

    res.json({
      stub: false,
      domain: cleanDomain,
      keywords,
      targetKeywords: targetKeywordData,
      backlinks,
      domainOverview,
      summary: {
        totalKeywords: keywords.length,
        page1Keywords: keywords.filter(k => k.isPage1).length,
        top3Keywords: keywords.filter(k => k.isTop3).length,
        totalBacklinks: backlinks.total,
        referringDomains: backlinks.referringDomains,
        domainRank: backlinks.domainRank,
        spamScore: backlinks.spamScore,
      }
    });

  } catch (err) {
    console.error('DataForSEO error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────
// CLAUDE — AI visibility check
// ─────────────────────────────────────────────
app.post('/api/ai-visibility', async (req, res) => {
  const { businessName, city, state, specialty, website } = req.body;
  const spec = specialty || 'medical aesthetics';

  // Build 3 realistic queries a patient might ask
  const queries = [
    `Who offers the best ${spec} in ${city}, ${state}?`,
    `Top ${spec} providers near ${city}, ${state}`,
    `Best ${spec} reviews ${city} ${state}`
  ];

  try {
    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1200,
        messages: [{
          role: 'user',
          content: `You are simulating what ChatGPT would actually return when asked about local medical/aesthetics providers. This is for a marketing sales presentation showing a prospect their AI visibility.

Business we are analyzing: ${businessName}
Location: ${city}, ${state}
Specialty: ${spec}
Website: ${website || 'unknown'}

For each of the 3 queries below, simulate what ChatGPT would realistically return — name 2-3 actual types of businesses or well-known local providers that WOULD appear (use realistic placeholder names if needed, like "Newton Dermatology Associates" or "Boston MedSpa Group"), and state clearly whether ${businessName} appears or not. Be specific and realistic — this should feel like an actual AI search result, not a generic disclaimer.

Query 1: "${queries[0]}"
Query 2: "${queries[1]}"
Query 3: "${queries[2]}"

Then provide 2-3 specific reasons why ${businessName} is NOT appearing in AI results based on their digital footprint.

Return ONLY this JSON, no markdown:
{
  "queries": [
    { "q": "${queries[0]}", "result": "2-3 sentence simulation of what ChatGPT would actually say, naming who DOES appear and noting ${businessName} is not among them", "appears": false },
    { "q": "${queries[1]}", "result": "realistic AI result simulation", "appears": false },
    { "q": "${queries[2]}", "result": "realistic AI result simulation", "appears": false }
  ],
  "appears": false,
  "reasons": "2-3 specific reasons why this business is not appearing in AI results"
}`
        }]
      })
    });

    const data = await claudeRes.json();
    const text = data.content?.[0]?.text || '{}';
    const cleaned = text.replace(/```json|```/g, '').trim();
    res.json(JSON.parse(cleaned));

  } catch (err) {
    console.error('AI visibility error:', err);
    res.json({
      queries: queries.map(q => ({
        q,
        result: `${businessName} does not appear in results for this query. Established practices with strong review profiles and citation presence dominate these results.`,
        appears: false
      })),
      appears: false,
      reasons: 'Low domain authority, missing directory citations, and lack of structured FAQ content are the primary factors limiting AI search visibility.'
    });
  }
});

// ─────────────────────────────────────────────
// CLAUDE — Program recommendation
// ─────────────────────────────────────────────
app.post('/api/recommendation', async (req, res) => {
  const { businessName, city, state, specialty, scores } = req.body;

  try {
    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 600,
        messages: [{
          role: 'user',
          content: `You are a marketing strategist at Medical Marketing Whiz recommending a program tier to a prospect based on their digital presence analysis.

Prospect: ${businessName}, ${city} ${state}
Specialty: ${specialty || 'medical aesthetics'}

Analysis scores:
- Visibility: ${scores.visibility ?? 'unknown'}%
- NAP consistency: ${scores.nap ?? 'unknown'}%
- Directories found: ${scores.dirsFound ?? 0} of ${scores.dirsTotal ?? 27}
- Google reviews: ${scores.reviewCount ?? 'unknown'}
- Star rating: ${scores.rating ?? 'unknown'}
- PageSpeed mobile: ${scores.mobileScore ?? 'unknown'}/100
- Domain rank: ${scores.domainRank ?? 'unknown'}
- Keywords on page 1: ${scores.page1Keywords ?? 'unknown'}
- Total backlinks: ${scores.totalBacklinks ?? 'unknown'}
- Referring domains: ${scores.referringDomains ?? 'unknown'}

Programs:
- Smart Start: $1,997/mo — SEO/AEO, website, GBP optimization, 40+ citations, review generation. Foundation only — no ads.
- Practice Pro: $2,997/mo — Everything in Smart Start PLUS ads management, reputation management, events/webinars, email newsletter, social platform.
- Whiz Works: $4,497/mo — Everything in Practice Pro PLUS photo/video package, monthly press releases, additional ad campaigns, Top Doctor Magazine feature.

CRITICAL RECOMMENDATION LOGIC — follow this exactly:
The default recommendation for most practices should be Practice Pro, not Smart Start. Here is the reasoning you must apply:

1. Practices with weak digital presence (low visibility, few keywords, low domain rank) will struggle to generate meaningful ROI from SEO/citations alone. SEO takes 6-12 months to show results.
2. Practice Pro includes ads management, which turns on a "leads faucet" immediately — generating patient inquiries while the organic SEO foundation is being built. This creates early wins that keep clients happy and retained.
3. Clients on Practice Pro and Whiz Works have significantly better retention and satisfaction than Smart Start clients because they see faster, more tangible results.
4. Therefore: a practice with LOW presence scores should typically be recommended Practice Pro — not Smart Start — because they need the ads component most urgently to bridge the gap while SEO builds.
5. Only recommend Smart Start if the practice has budget constraints that make Practice Pro genuinely out of reach, OR if they already have strong ads running independently and only need the organic/citation foundation.
6. Only recommend Whiz Works if the practice has moderate-to-strong existing presence AND wants to aggressively dominate their local market, OR if they have a larger budget and want the full suite from day one.

Based on this logic and the scores above, recommend the appropriate program. In your main_reason, explain why Practice Pro is the right fit emphasizing the ads + SEO combination benefit. Always include a note that Smart Start is available if Practice Pro is not within budget, but make clear why Practice Pro is the recommended path.

Return ONLY this JSON, no markdown:
{
  "recommended": "Practice Pro",
  "fit_score": 78,
  "smart_start_reason": "one sentence explaining Smart Start is available as a budget option but lacks the ads component needed for early ROI",
  "practice_pro_reason": "one sentence on why this is the right fit",
  "whiz_works_reason": "one sentence on why Whiz Works may be premature or appropriate",
  "main_reason": "2-3 sentences explaining why Practice Pro is recommended — emphasize the ads + SEO combination, early lead generation while organic builds, and better client outcomes. End with: 'Smart Start is a reasonable alternative if Practice Pro is not within budget, but the ads component in Practice Pro is what drives early ROI for practices at this stage.'"
}`
        }]
      })
    });

    const data = await claudeRes.json();
    const text = data.content?.[0]?.text || '{}';
    const cleaned = text.replace(/```json|```/g, '').trim();
    res.json(JSON.parse(cleaned));

  } catch (err) {
    console.error('Recommendation error:', err);
    res.json({
      recommended: 'Practice Pro',
      fit_score: 75,
      smart_start_reason: 'Foundation plan may not provide enough acceleration given current gaps.',
      practice_pro_reason: 'Combines all necessary services to address citation, reputation, and visibility gaps simultaneously.',
      whiz_works_reason: 'Full suite available once core foundation is established.',
      main_reason: 'Based on the analysis, Practice Pro best addresses the current gaps while providing the tools needed for sustainable growth.'
    });
  }
});


// ─────────────────────────────────────────────
// COMPETITIVE ANALYSIS
// ─────────────────────────────────────────────
app.post('/api/competitive-analysis', async (req, res) => {
  const { domain, manualCompetitors, targetKeywords, prospectKeywords } = req.body;
  if (!domain) return res.status(400).json({ error: 'domain required' });

  if (!DATAFORSEO_LOGIN || !DATAFORSEO_PASSWORD) {
    return res.json({ stub: true, competitors: [], keywordBattle: [], targetKeywordData: [] });
  }

  const cleanDomain = domain.replace(/https?:\/\//, '').replace(/\/$/, '').replace(/^www\./, '');
  const auth = Buffer.from(`${DATAFORSEO_LOGIN}:${DATAFORSEO_PASSWORD}`).toString('base64');
  const headers = { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/json' };
  const DFS_BASE = 'https://api.dataforseo.com/v3';

  try {
    // Step 1: Get top competitors (manual first, then auto-detect to fill gaps)
    let competitorDomains = [];
    let insufficientKeywords = false;

    if (manualCompetitors && manualCompetitors.length > 0) {
      competitorDomains = manualCompetitors
        .map(c => c.replace(/https?:\/\//, '').replace(/\/$/, '').replace(/^www\./, '').trim())
        .filter(Boolean)
        .slice(0, 3);
    }

    // Only attempt auto-detection if the prospect has enough keyword presence.
    // With fewer than 10 ranked keywords, serp_competitors returns irrelevant
    // high-authority domains (YouTube, MapQuest, etc.) that share generic terms
    // but are not real local competitors.
    const kwCount = (prospectKeywords || []).length;
    const hasEnoughKeywords = kwCount >= 10;

    if (competitorDomains.length < 3 && hasEnoughKeywords) {
      try {
        const seedKeywords = (prospectKeywords || [])
          .map(k => k.keyword)
          .filter(Boolean)
          .slice(0, 10);

        if (seedKeywords.length > 0) {
          const compDetectRes = await fetch(`${DFS_BASE}/dataforseo_labs/google/serp_competitors/live`, {
            method: 'POST', headers,
            body: JSON.stringify([{
              keywords: seedKeywords,
              language_code: 'en',
              location_code: 2840,
              limit: 20,
              filters: [
                ['relevant_serp_items', '>', 0]
              ]
            }])
          });
          const compDetectData = await compDetectRes.json();

          // Pull domain rank overview for each candidate to filter out large sites.
          // Real local competitors will have a domain rank well under 500.
          // MapQuest, YouTube, Yelp etc. have ranks in the thousands.
          const candidates = (compDetectData?.tasks?.[0]?.result?.[0]?.items || [])
            .map(item => ({ domain: item.domain, avgPos: item.avg_position || 99 }))
            .filter(c => c.domain && c.domain !== cleanDomain && !competitorDomains.includes(c.domain))
            // Block known aggregators / mega-sites by domain pattern
            .filter(c => ![
              'google.','yelp.','facebook.','instagram.','wikipedia.','healthgrades.',
              'webmd.','zocdoc.','youtube.','mapquest.','tripadvisor.','yellowpages.',
              'bbb.org','angieslist.','thumbtack.','homeadvisor.','houzz.','angi.',
              'vitals.com','ratemds.','doximity.','practo.','zocdoc.','bark.com'
            ].some(x => c.domain.includes(x)));

          // For remaining candidates, do a quick domain rank check in parallel (up to 8)
          const topCandidates = candidates.slice(0, 8);
          const rankChecks = await Promise.all(topCandidates.map(async c => {
            try {
              const r = await fetch(`${DFS_BASE}/backlinks/summary/live`, {
                method: 'POST', headers,
                body: JSON.stringify([{ target: c.domain, include_subdomains: false, backlinks_status_type: 'live' }])
              });
              const rd = await r.json();
              const rank = rd?.tasks?.[0]?.result?.[0]?.rank || 9999;
              return { domain: c.domain, rank };
            } catch(e) {
              return { domain: c.domain, rank: 9999 };
            }
          }));

          // Keep only domains with domain rank under 500 — these are realistic local sites
          const localCompetitors = rankChecks
            .filter(c => c.rank < 500)
            .sort((a, b) => a.rank - b.rank)
            .map(c => c.domain);

          const needed = 3 - competitorDomains.length;
          competitorDomains = [...competitorDomains, ...localCompetitors.slice(0, needed)];
        }
      } catch(e) {
        console.error('Competitor detection error:', e.message);
      }
    } else if (competitorDomains.length < 3 && !hasEnoughKeywords) {
      insufficientKeywords = true;
    }

    competitorDomains = competitorDomains.slice(0, 3);

    // If no competitors found and keyword presence is too low, return early with explanation
    if (competitorDomains.length === 0) {
      return res.json({
        stub: false,
        insufficientKeywords,
        prospectDomain: cleanDomain,
        competitors: [],
        keywordBattle: [],
        targetKeywordData: [],
        message: insufficientKeywords
          ? `${cleanDomain} does not yet rank for enough keywords to auto-detect local competitors. This is actually a key insight — the practice has very limited organic search presence. To run a competitor comparison, enter 1–3 known competitor domains manually and re-run the report with competitive analysis enabled.`
          : 'No local competitors could be identified for this domain. Try entering known competitors manually.'
      });
    }

    // Step 2: Pull ranked keywords for each competitor in parallel
    const competitorKeywordPromises = competitorDomains.map(async (compDomain) => {
      try {
        const kwRes = await fetch(`${DFS_BASE}/dataforseo_labs/google/ranked_keywords/live`, {
          method: 'POST', headers,
          body: JSON.stringify([{
            target: compDomain,
            language_code: 'en',
            location_code: 2840,
            limit: 50,
            order_by: ['ranked_serp_element.serp_item.rank_absolute,asc'],
            filters: [
              ['ranked_serp_element.serp_item.type', '<>', 'paid'],
              'and',
              ['keyword_data.keyword_info.search_volume', '>', 0]
            ]
          }])
        });
        const kwData = await kwRes.json();

        // Also get domain overview for this competitor
        const overviewRes = await fetch(`${DFS_BASE}/dataforseo_labs/google/domain_rank_overview/live`, {
          method: 'POST', headers,
          body: JSON.stringify([{ target: compDomain, language_code: 'en', location_code: 2840 }])
        });
        const overviewData = await overviewRes.json();
        const organic = overviewData?.tasks?.[0]?.result?.[0]?.items?.[0]?.metrics?.organic || {};

        const rawKws = kwData?.tasks?.[0]?.result?.[0]?.items || [];
        return {
          domain: compDomain,
          totalKeywords: organic.count || rawKws.length || 0,
          etv: organic.etv || 0,
          pos1: organic.pos_1 || 0,
          pos1_3: (organic.pos_1 || 0) + (organic.pos_2_3 || 0),
          pos1_10: (organic.pos_1 || 0) + (organic.pos_2_3 || 0) + (organic.pos_4_10 || 0),
          keywords: rawKws.map(item => ({
            keyword: item.keyword_data?.keyword || '',
            position: item.ranked_serp_element?.serp_item?.rank_absolute || null,
            searchVolume: item.keyword_data?.keyword_info?.search_volume || 0,
          }))
        };
      } catch(e) {
        return { domain: compDomain, totalKeywords: 0, etv: 0, pos1: 0, pos1_3: 0, pos1_10: 0, keywords: [] };
      }
    });

    const competitors = await Promise.all(competitorKeywordPromises);

    // Step 3: Build keyword battle — keywords where prospect OR competitors rank
    // Use prospect's existing keywords as the base set
    const prospectKwMap = {};
    (prospectKeywords || []).forEach(k => { prospectKwMap[k.keyword] = k.position; });

    // Build battle rows for prospect's keywords
    const keywordBattle = (prospectKeywords || []).map(pk => {
      const row = {
        keyword: pk.keyword,
        searchVolume: pk.searchVolume,
        prospectPosition: pk.position,
        competitorPositions: {}
      };
      competitors.forEach(comp => {
        const match = comp.keywords.find(ck => ck.keyword === pk.keyword);
        row.competitorPositions[comp.domain] = match ? match.position : null;
      });
      return row;
    });

    // Step 4: Handle target keywords (from rep input)
    const targetKeywordData = [];
    if (targetKeywords && targetKeywords.length > 0) {
      for (const kw of targetKeywords.slice(0, 5)) {
        const row = {
          keyword: kw,
          prospectPosition: prospectKwMap[kw] || null,
          competitorPositions: {}
        };
        competitors.forEach(comp => {
          const match = comp.keywords.find(ck => ck.keyword.toLowerCase() === kw.toLowerCase());
          row.competitorPositions[comp.domain] = match ? match.position : null;
        });
        targetKeywordData.push(row);
      }
    }

    res.json({
      stub: false,
      prospectDomain: cleanDomain,
      competitors: competitors.map(c => ({ domain: c.domain, totalKeywords: c.totalKeywords, etv: c.etv, pos1: c.pos1, pos1_3: c.pos1_3, pos1_10: c.pos1_10 })),
      keywordBattle,
      targetKeywordData
    });

  } catch (err) {
    console.error('Competitive analysis error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────
// MAIN REPORT — orchestrates all API calls
// ─────────────────────────────────────────────
app.post('/api/generate-report', async (req, res) => {
  const { businessName, city, state, website, emailList, targetKeywords, manualCompetitors, runCompetitive, forcedNiches } = req.body;
  if (!businessName || !city || !state) {
    return res.status(400).json({ error: 'businessName, city, state required' });
  }

  const results = {
    businessName, city, state, website, emailList: emailList || null,
    targetKeywords: targetKeywords || [], manualCompetitors: manualCompetitors || [], runCompetitive: !!runCompetitive,
    websiteAudit: null,
    places: null,
    websiteExtract: null,
    pagespeed: null,
    adviceLocal: null,
    dataForSeo: null,
    aiVisibility: null,
    recommendation: null,
    errors: []
  };

  try {
    // ── STEP 1: Google Places ──
    try {
      const placesRes = await fetch(`http://localhost:${PORT}/api/places`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ businessName, city, state })
      });
      results.places = await placesRes.json();
    } catch(e) { results.errors.push({ step: 'places', error: e.message }); }

    const resolvedWebsite = website || results.places?.website || '';
    const resolvedPhone = results.places?.phone || '';
    const resolvedStreet = results.places?.street || '';
    const resolvedSuite = results.places?.suite || '';
    const resolvedCity = results.places?.city || city;
    const resolvedState = results.places?.state || state;
    const resolvedZip = results.places?.zip || '';

    // ── STEP 2: Website extraction ──
    if (resolvedWebsite) {
      try {
        const extractRes = await fetch(`http://localhost:${PORT}/api/extract-website`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: resolvedWebsite })
        });
        results.websiteExtract = await extractRes.json();
      } catch(e) { results.errors.push({ step: 'websiteExtract', error: e.message }); }
    }

    const specialty = results.websiteExtract?.specialty || '';
    const description = results.websiteExtract?.description || '';
    const category = results.websiteExtract?.googleCategory || '';
    const services = results.websiteExtract?.services || [];

    // Auto-suggest target keywords based on niche
    // Priority: rep-entered keywords > forced niches > auto-detected niche
    const detectedNiche = detectNiche(specialty, category, services);
    let effectiveTargetKeywords;
    let effectiveNiches;

    if (targetKeywords && targetKeywords.length > 0) {
      // Rep typed their own keywords — use as-is
      effectiveTargetKeywords = targetKeywords;
      effectiveNiches = [detectedNiche];
    } else if (forcedNiches && forcedNiches.length > 0) {
      // Rep selected specific niches — merge keyword sets, dedupe
      effectiveNiches = forcedNiches.slice(0, 3);
      const mergedKws = [];
      const seen = new Set();
      effectiveNiches.forEach(niche => {
        buildSuggestedKeywords(niche, resolvedCity || city).forEach(kw => {
          if (!seen.has(kw)) { seen.add(kw); mergedKws.push(kw); }
        });
      });
      effectiveTargetKeywords = mergedKws;
    } else {
      // Auto-detect
      effectiveNiches = [detectedNiche];
      effectiveTargetKeywords = buildSuggestedKeywords(detectedNiche, resolvedCity || city);
    }

    results.detectedNiche = detectedNiche;
    results.effectiveNiches = effectiveNiches;
    results.suggestedKeywords = effectiveTargetKeywords;

    // ── STEP 2b: Website Audit (runs after extract, uses same URL) ──
    if (resolvedWebsite) {
      try {
        const auditRes = await fetch(`http://localhost:${PORT}/api/website-audit`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url: resolvedWebsite,
            businessName,
            specialty,
            services
          })
        });
        results.websiteAudit = await auditRes.json();
      } catch(e) { results.errors.push({ step: 'websiteAudit', error: e.message }); }
    }

    // ── STEP 3: Advice Local scan ──
    // If Places found the business, use its verified canonical NAP (name, address, phone)
    // as the matching signal for Advice Local - this dramatically improves match accuracy.
    // If Places didn't find anything, fall back to user-provided inputs.
    const placesFound = !!(results.places?.placeId);
    const alName   = placesFound ? results.places.name   : businessName;
    const alPhone  = placesFound ? results.places.phone  : resolvedPhone;
    const alStreet = placesFound ? results.places.street : resolvedStreet;
    const alSuite  = placesFound ? results.places.suite  : resolvedSuite;
    const alCity   = placesFound ? results.places.city   : resolvedCity;
    const alState  = placesFound ? results.places.state  : resolvedState;
    const alZip    = placesFound ? results.places.zip    : resolvedZip;

    if (alPhone && alStreet && alZip) {
      try {
        const alRes = await fetch(`http://localhost:${PORT}/api/advice-local/scan`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name:        alName,
            phone:       alPhone,
            street:      alStreet,
            suite:       alSuite,
            city:        alCity,
            state:       alState,
            zip:         alZip,
            website:     resolvedWebsite,
            description,
            category
          })
        });
        results.adviceLocal = await alRes.json();
      } catch(e) { results.errors.push({ step: 'adviceLocal', error: e.message }); }
    } else {
      results.errors.push({ step: 'adviceLocal', error: 'Missing phone/street/zip — could not run citation scan' });
    }

    // ── STEP 4: PageSpeed (parallel with DataForSEO) ──
    const parallelPromises = [];

    if (resolvedWebsite) {
      parallelPromises.push(
        fetch(`http://localhost:${PORT}/api/pagespeed`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: resolvedWebsite })
        }).then(r => r.json()).then(d => { results.pagespeed = d; })
        .catch(e => results.errors.push({ step: 'pagespeed', error: e.message }))
      );

      // ── STEP 5: DataForSEO ──
      parallelPromises.push(
        fetch(`http://localhost:${PORT}/api/dataforseo`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ domain: resolvedWebsite, city: resolvedCity || city, state: resolvedState || state, zip: resolvedZip, phone: resolvedPhone, targetKeywords: effectiveTargetKeywords })
        }).then(r => r.json()).then(d => { results.dataForSeo = d; })
        .catch(e => results.errors.push({ step: 'dataForSeo', error: e.message }))
      );
    }

    await Promise.all(parallelPromises);

    // ── STEP 6: AI Visibility ──
    try {
      const aiRes = await fetch(`http://localhost:${PORT}/api/ai-visibility`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ businessName, city, state, specialty, website: resolvedWebsite })
      });
      results.aiVisibility = await aiRes.json();
    } catch(e) { results.errors.push({ step: 'aiVisibility', error: e.message }); }

    // ── STEP 7: Program recommendation ──
    const overview = results.adviceLocal?.report?.data?.overview?.baselineOverview;
    try {
      const recRes = await fetch(`http://localhost:${PORT}/api/recommendation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessName, city, state, specialty,
          scores: {
            visibility: overview?.visibilityScore ?? null,
            nap: overview?.napScore ?? null,
            dirsFound: overview?.directoriesFound ?? null,
            dirsTotal: overview?.directoriesTotal ?? null,
            reviewCount: results.places?.reviewCount ?? null,
            rating: results.places?.rating ?? null,
            mobileScore: results.pagespeed?.mobile?.performanceScore ?? null,
            domainRank: results.dataForSeo?.summary?.domainRank ?? null,
            page1Keywords: results.dataForSeo?.summary?.page1Keywords ?? null,
            totalBacklinks: results.dataForSeo?.summary?.totalBacklinks ?? null,
            referringDomains: results.dataForSeo?.summary?.referringDomains ?? null,
            totalKeywords: results.dataForSeo?.summary?.totalKeywords ?? null,
          }
        })
      });
      results.recommendation = await recRes.json();
    } catch(e) { results.errors.push({ step: 'recommendation', error: e.message }); }

    // ── STEP 8: Competitive Analysis (optional) ──
    if (runCompetitive && resolvedWebsite) {
      try {
        const compRes = await fetch(`http://localhost:${PORT}/api/competitive-analysis`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            domain: resolvedWebsite,
            manualCompetitors: manualCompetitors || [],
            targetKeywords: targetKeywords || [],
            prospectKeywords: results.dataForSeo?.keywords || []
          })
        });
        results.competitive = await compRes.json();
      } catch(e) { results.errors.push({ step: 'competitive', error: e.message }); }
    }

    res.json(results);

  } catch (err) {
    console.error('Report generation error:', err);
    res.status(500).json({ error: err.message, partial: results });
  }
});

// ─────────────────────────────────────────────
// DOCX REPORT GENERATION
// ─────────────────────────────────────────────
app.post('/api/generate-docx', async (req, res) => {
  const data = req.body;
  if (!data || !data.businessName) {
    return res.status(400).json({ error: 'Report data required' });
  }
  try {
    console.log(`[DOCX] Generating report for: ${data.businessName}`);
    const buffer = await generateDocxReport(data);
    const safeName = (data.businessName || 'report').replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '_');
    const filename = `MMW_Marketing_Analysis_${safeName}.docx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', buffer.length);
    res.send(buffer);
    console.log(`[DOCX] Sent ${buffer.length} bytes for ${data.businessName}`);
  } catch (err) {
    console.error('[DOCX] Generation error:', err);
    res.status(500).json({ error: 'Failed to generate report: ' + err.message });
  }
});

// ── EMAIL REPORT via Resend ──────────────────────────────────────────────────
app.post('/api/send-report', async (req, res) => {
  const { to, cc = [], reportData } = req.body;
  if (!to || !reportData || !reportData.businessName) {
    return res.status(400).json({ error: 'Recipient email and report data required' });
  }

  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  if (!RESEND_API_KEY) {
    return res.status(500).json({ error: 'Email service not configured. Add RESEND_API_KEY to environment variables.' });
  }

  try {
    console.log(`[EMAIL] Generating DOCX for ${reportData.businessName}...`);
    const docxBuffer = await generateDocxReport(reportData);
    const safeName = (reportData.businessName || 'report').replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '_');
    const filename = `MMW_Marketing_Analysis_${safeName}.docx`;
    const docxBase64 = docxBuffer.toString('base64');

    const businessName = reportData.businessName;
    const p = reportData.places || {};
    const cityState = [p.city, p.state].filter(Boolean).join(', ');
    const date = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    const vis = reportData.adviceLocal?.report?.data?.overview?.baselineOverview?.visibilityScore ?? null;
    const reviews = p.reviewCount ?? 0;
    const rating = p.rating ?? null;
    const mobile = reportData.pagespeed?.mobile?.performanceScore ?? null;
    const rec = reportData.recommendation?.recommended || 'Practice Pro';

    function scoreColor(v) {
      if (v === null || v === undefined) return '#C97D10';
      return v >= 65 ? '#28AB83' : v >= 35 ? '#C97D10' : '#E05454';
    }

    const emailHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Marketing Analysis Report — ${businessName}</title>
</head>
<body style="margin:0;padding:0;background:#F7FAF9;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F7FAF9;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

        <!-- HEADER -->
        <tr><td style="background:#323547;border-radius:12px 12px 0 0;padding:28px 36px;text-align:center;">
          <img src="https://i0.wp.com/medicalmarketingwhiz.com/wp-content/uploads/2025/01/Medical-Marketing-Whiz-LogoWhite.png?w=400&ssl=1" alt="Medical Marketing Whiz" width="180" style="display:block;margin:0 auto 16px;" />
          <div style="font-size:11px;font-weight:600;letter-spacing:0.2em;text-transform:uppercase;color:#28AB83;background:rgba(40,171,131,0.15);border:1px solid rgba(40,171,131,0.3);display:inline-block;padding:5px 16px;border-radius:100px;margin-bottom:14px;">Marketing Analysis Report</div>
          <div style="font-size:28px;font-weight:800;color:#ffffff;letter-spacing:-0.02em;margin-bottom:4px;">${businessName}</div>
          ${cityState ? `<div style="font-size:14px;color:rgba(255,255,255,0.45);">${cityState}</div>` : ''}
          <div style="font-size:11px;color:rgba(255,255,255,0.25);margin-top:12px;letter-spacing:0.1em;text-transform:uppercase;">${date}</div>
        </td></tr>

        <!-- BODY -->
        <tr><td style="background:#ffffff;padding:32px 36px;">
          <p style="font-size:15px;color:#4f5d6a;line-height:1.7;margin:0 0 24px;">Hi,</p>
          <p style="font-size:15px;color:#4f5d6a;line-height:1.7;margin:0 0 24px;">
            Please find attached your <strong style="color:#323547;">personalized Marketing Analysis Report</strong> from Medical Marketing Whiz. This report provides a comprehensive review of your current digital presence across Google search, website performance, AI visibility, online reputation, and local directory listings.
          </p>

          <!-- SNAPSHOT CARDS -->
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
            <tr>
              <td width="32%" style="padding-right:8px;">
                <table width="100%" cellpadding="0" cellspacing="0">
                  <tr><td style="background:#F7FAF9;border-radius:10px;padding:16px;border-top:3px solid ${scoreColor(vis)};text-align:center;">
                    <div style="font-size:9px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:#7a8a9a;margin-bottom:6px;">Visibility Score</div>
                    <div style="font-size:28px;font-weight:800;color:${scoreColor(vis)};line-height:1;">${vis !== null ? vis + '%' : 'N/A'}</div>
                  </td></tr>
                </table>
              </td>
              <td width="32%" style="padding-right:8px;">
                <table width="100%" cellpadding="0" cellspacing="0">
                  <tr><td style="background:#F7FAF9;border-radius:10px;padding:16px;border-top:3px solid ${scoreColor(reviews >= 100 ? 75 : reviews >= 30 ? 45 : 20)};text-align:center;">
                    <div style="font-size:9px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:#7a8a9a;margin-bottom:6px;">Google Reviews</div>
                    <div style="font-size:28px;font-weight:800;color:${scoreColor(reviews >= 100 ? 75 : reviews >= 30 ? 45 : 20)};line-height:1;">${reviews}${rating ? ' · ' + rating + '★' : ''}</div>
                  </td></tr>
                </table>
              </td>
              <td width="32%">
                <table width="100%" cellpadding="0" cellspacing="0">
                  <tr><td style="background:#F7FAF9;border-radius:10px;padding:16px;border-top:3px solid ${scoreColor(mobile)};text-align:center;">
                    <div style="font-size:9px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:#7a8a9a;margin-bottom:6px;">Mobile Speed</div>
                    <div style="font-size:28px;font-weight:800;color:${scoreColor(mobile)};line-height:1;">${mobile !== null ? mobile + '/100' : 'N/A'}</div>
                  </td></tr>
                </table>
              </td>
            </tr>
          </table>

          <!-- RECOMMENDATION -->
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
            <tr><td style="background:#E5F5F0;border-radius:10px;padding:20px 24px;border:1px solid #D9EDE7;">
              <div style="font-size:11px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:#28AB83;margin-bottom:6px;">Our Recommendation</div>
              <div style="font-size:20px;font-weight:800;color:#323547;margin-bottom:6px;">${rec}</div>
              ${reportData.recommendation?.main_reason ? `<div style="font-size:13px;color:#4f5d6a;line-height:1.65;">${reportData.recommendation.main_reason}</div>` : ''}
            </td></tr>
          </table>

          <p style="font-size:15px;color:#4f5d6a;line-height:1.7;margin:0 0 20px;">
            The full report is attached as a Word document. Please review it at your convenience, and don't hesitate to reach out with any questions.
          </p>

          <!-- CTA -->
          <table cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
            <tr><td style="background:#28AB83;border-radius:9px;padding:12px 28px;">
              <a href="https://medmarketingwhiz.com/meet-with-lori" style="font-size:14px;font-weight:700;color:#ffffff;text-decoration:none;display:block;">📅 Schedule a Call with Lori</a>
            </td></tr>
          </table>

          <p style="font-size:13px;color:#7a8a9a;line-height:1.7;margin:0;">
            Questions? Call us at <strong style="color:#323547;">(888) 418-8065</strong> or reply to this email.<br>
            We look forward to working with you!
          </p>
        </td></tr>

        <!-- FOOTER -->
        <tr><td style="background:#323547;border-radius:0 0 12px 12px;padding:20px 36px;text-align:center;">
          <div style="font-size:11px;color:rgba(255,255,255,0.3);line-height:1.6;">
            Medical Marketing Whiz · <a href="https://medmarketingwhiz.com" style="color:rgba(255,255,255,0.3);text-decoration:none;">medmarketingwhiz.com</a><br>
            (888) 418-8065 · lori@medicalmarketingwhiz.com
          </div>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

    const emailPayload = {
      from: 'Medical Marketing Whiz <reports@medmarketingwhiz.com>',
      to: [to],
      cc: cc.length > 0 ? cc : undefined,
      subject: `Your Marketing Analysis Report — ${businessName}`,
      html: emailHtml,
      attachments: [{
        filename,
        content: docxBase64,
      }],
    };

    console.log(`[EMAIL] Sending to ${to}${cc.length ? ', CC: ' + cc.join(', ') : ''}...`);
    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(emailPayload),
    });

    const resendData = await resendRes.json();

    if (!resendRes.ok) {
      console.error('[EMAIL] Resend error:', resendData);
      return res.status(500).json({ error: resendData.message || 'Email send failed' });
    }

    console.log(`[EMAIL] Sent successfully. ID: ${resendData.id}`);
    res.json({ success: true, id: resendData.id });

  } catch (err) {
    console.error('[EMAIL] Error:', err);
    res.status(500).json({ error: 'Failed to send email: ' + err.message });
  }
});


app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`MMW Report Tool running on port ${PORT}`);
});
