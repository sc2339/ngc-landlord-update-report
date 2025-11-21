import Anthropic from '@anthropic-ai/sdk';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { city, state, address } = req.body;

  if (!city || !state) {
    return res.status(400).json({ error: 'City and state are required' });
  }

  try {
    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });

    const location = address || `${city}, ${state}`;
    
    const prompt = `You are a senior commercial real estate market analyst preparing a comprehensive retail market report for ${location}. This report will be read by sophisticated commercial property owners and requires deep, hyperlocalized research.

CRITICAL INSTRUCTIONS:
1. Search the web extensively for CURRENT information (last 60 days) about this specific market
2. Find REAL tenant names, ACTUAL lease transactions, SPECIFIC developments
3. Look within 10-mile radius of ${location}
4. Write in an original, analytical voice - NOT a template

REQUIRED RESEARCH (search multiple times if needed):
- Recent retail lease signings: Who signed leases? What square footage? Where specifically?
- Tenant departures/closures: Which retailers left? Why?
- New retail developments: What's under construction? Who's developing it?
- Rent comparables: What are ACTUAL asking rents per SF in recent deals?
- Vacancy data: Current vacancy rates for this specific submarket
- Investment sales: Any retail properties sold recently? At what cap rates?
- Notable retailers expanding or contracting in this market
- Local economic drivers affecting retail (employment, demographics, infrastructure)

OUTPUT FORMAT - Write 2 substantive paragraphs:

Paragraph 1 (Leasing Activity & Market Dynamics):
Write 6-8 sentences covering recent leasing velocity, specific tenant activity (name actual retailers), current rent levels with data points, vacancy trends, and what's driving demand. Include specific street names, shopping centers, or developments you find. Use varied sentence structure and analytical language - this should read like a professional market report, not a template.

Paragraph 2 (Investment Activity & Market Outlook):
Write 6-8 sentences covering investment sales activity, new development pipeline with specific project names, market fundamentals,
