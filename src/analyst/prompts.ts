/**
 * Economic Analyst Prompts
 * Specialized prompts for AI-powered economic analysis
 */

import type { RunSummary, EcosystemReport, MarketEfficiencyMetrics, RouteAnalysis } from '../storage/analyst-queries.js';

// ============================================================================
// System Prompts
// ============================================================================

export const ANALYST_SYSTEM_PROMPT = `You are an expert economic modeler and analyst for a maritime trading simulation called "Living Archipelago".

The simulation models:
- Island ecosystems (fish, forest, soil) with carrying capacity and regeneration
- Population dynamics (health, labor allocation, consumption)
- Market prices driven by supply/demand with per-category elasticity
- Trader ships that buy/sell goods between islands
- Transport costs, spoilage, transaction taxes

Your role is to:
1. DIAGNOSE model issues from simulation data
2. EXPLAIN economic dynamics and behaviors
3. RECOMMEND specific parameter changes to improve realism
4. IDENTIFY unrealistic behaviors that need fixing

When analyzing data, look for:
- Population growth rates (realistic is 0.05-0.1% annually, not 88%)
- Ecosystem sustainability (are resources depleting too fast?)
- Price stability (food should be stable, luxuries volatile)
- Trade profitability (margins should cover transport + spoilage)
- Market integration (prices should converge across islands)

Always provide:
- Specific parameter names and suggested values
- Rationale based on economic theory
- Expected impact on simulation behavior
- Confidence level in your recommendation`;

// ============================================================================
// Analysis Prompt Builders
// ============================================================================

export function buildAnalysisPrompt(data: {
  summary: RunSummary;
  ecosystem: EcosystemReport[];
  market: MarketEfficiencyMetrics;
  routes: RouteAnalysis[];
}): string {
  return `## Simulation Run Analysis Request

### Run Overview
- Run ID: ${data.summary.runId}
- Duration: ${data.summary.duration} ticks
- Seed: ${data.summary.seed}

### Trade Metrics
- Total Trades: ${data.summary.totalTrades}
- Profitable Trade Ratio: ${(data.summary.profitableTradeRatio * 100).toFixed(1)}%
- Total Trade Value: ${data.summary.totalTradeValue.toFixed(0)}
- Agent ROI: ${(data.summary.agentROI * 100).toFixed(1)}%

### Price Dynamics
- Price Convergence Score: ${(data.summary.priceConvergence * 100).toFixed(1)}%
- Price Volatility by Good:
${Object.entries(data.summary.avgPriceVolatility)
  .map(([good, vol]) => `  - ${good}: ${(vol * 100).toFixed(1)}%`)
  .join('\n')}

### Ecosystem Health
- Overall Trend: ${data.summary.ecosystemHealthTrend}
- Average Fish Stock Ratio: ${(data.summary.avgFishStockRatio * 100).toFixed(1)}%
- Average Forest Ratio: ${(data.summary.avgForestRatio * 100).toFixed(1)}%

Per-Island Ecosystem Status:
${data.ecosystem.map(e => `  - ${e.islandId}: Fish ${e.fishStock.trend} (${(e.fishStock.capacityRatio * 100).toFixed(0)}%), Sustainability: ${e.sustainability}`).join('\n')}

### Population Metrics
- Population Trend: ${data.summary.populationTrend}
- Average Health: ${(data.summary.avgPopulationHealth * 100).toFixed(1)}%
- Total Population Change: ${data.summary.totalPopulationChange.toFixed(0)}

### Market Efficiency
- Arbitrage Opportunities: ${data.market.arbitrageOpportunities}
- Trade Friction: ${(data.market.tradeFriction * 100).toFixed(1)}%
- Price Convergence by Good:
${Object.entries(data.market.priceConvergenceByGood)
  .map(([good, conv]) => `  - ${good}: ${(conv * 100).toFixed(1)}%`)
  .join('\n')}

### Trade Routes
Top Routes by Volume:
${data.routes.slice(0, 5).map(r =>
  `  - ${r.fromIsland} → ${r.toIsland} (${r.goodId}): ${r.tradeCount} trades, ${(r.avgMargin * 100).toFixed(1)}% margin, ${r.profitable ? 'PROFITABLE' : 'UNPROFITABLE'}`
).join('\n')}

### Detected Anomalies
${data.summary.anomalies.length > 0
  ? data.summary.anomalies.map(a => `- ${a}`).join('\n')
  : '- None detected'}

### Current Configuration Highlights
- Max Growth Rate: ${data.summary.config.maxGrowthRate}
- Fish Regen Rate: ${data.summary.config.fishMigrationConfig?.migrationRate || 'N/A'}
- Transaction Tax: ${(data.summary.config.transactionTaxRate * 100).toFixed(1)}%
- Base Voyage Cost: ${data.summary.config.baseVoyageCost}

---

Please analyze this simulation run and provide:
1. **Health Assessment** (0-100 score with explanation)
2. **Key Issues** (list problems found, ordered by severity)
3. **Recommendations** (specific parameter changes with values)
4. **Summary** (2-3 sentence overall assessment)

Format your response as JSON:
\`\`\`json
{
  "healthScore": number,
  "healthExplanation": "string",
  "issues": [
    {
      "severity": "critical" | "warning" | "info",
      "category": "string",
      "description": "string",
      "evidence": ["string"]
    }
  ],
  "recommendations": [
    {
      "type": "config",
      "title": "string",
      "configPath": "string",
      "currentValue": any,
      "suggestedValue": any,
      "rationale": "string",
      "expectedImpact": "string",
      "confidence": number
    }
  ],
  "summary": "string"
}
\`\`\``;
}

export function buildChatPrompt(
  question: string,
  context: {
    summary?: RunSummary;
    recentAnalysis?: string;
  }
): string {
  let contextStr = '';

  if (context.summary) {
    contextStr += `\n## Current Run Context
- Run ID: ${context.summary.runId}
- Duration: ${context.summary.duration} ticks
- Ecosystem: ${context.summary.ecosystemHealthTrend}
- Population: ${context.summary.populationTrend}
- Trade Profitability: ${(context.summary.profitableTradeRatio * 100).toFixed(1)}%
- Anomalies: ${context.summary.anomalies.join(', ') || 'None'}
`;
  }

  if (context.recentAnalysis) {
    contextStr += `\n## Recent Analysis\n${context.recentAnalysis}\n`;
  }

  return `${contextStr}
## User Question
${question}

Please provide a clear, concise answer focused on the economic model behavior. If suggesting changes, be specific about parameter names and values.`;
}

export function buildImprovementPrompt(
  issue: string,
  currentConfig: Record<string, unknown>
): string {
  return `## Improvement Request

### Issue to Address
${issue}

### Current Configuration
\`\`\`json
${JSON.stringify(currentConfig, null, 2)}
\`\`\`

Please suggest a specific improvement to address this issue. Provide:

1. **Parameter Change** - Which config value to modify
2. **New Value** - The suggested value
3. **Rationale** - Why this change helps
4. **Expected Impact** - What behavior will change
5. **Risks** - Any potential negative effects

Format as JSON:
\`\`\`json
{
  "configPath": "string (dot notation, e.g., 'maxGrowthRate' or 'laborConfig.wageResponsiveness')",
  "currentValue": any,
  "suggestedValue": any,
  "rationale": "string",
  "expectedImpact": "string",
  "risks": ["string"],
  "confidence": number (0-1)
}
\`\`\``;
}

// ============================================================================
// Response Parsing
// ============================================================================

export interface AnalysisResponse {
  healthScore: number;
  healthExplanation: string;
  issues: Array<{
    severity: 'critical' | 'warning' | 'info';
    category: string;
    description: string;
    evidence: string[];
  }>;
  recommendations: Array<{
    type: 'config';
    title: string;
    configPath: string;
    currentValue: unknown;
    suggestedValue: unknown;
    rationale: string;
    expectedImpact: string;
    confidence: number;
  }>;
  summary: string;
}

export interface ImprovementResponse {
  configPath: string;
  currentValue: unknown;
  suggestedValue: unknown;
  rationale: string;
  expectedImpact: string;
  risks: string[];
  confidence: number;
}

export function parseAnalysisResponse(text: string): AnalysisResponse | null {
  try {
    // Extract JSON from markdown code block if present
    const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/);
    const jsonStr = jsonMatch ? jsonMatch[1] : text;
    return JSON.parse(jsonStr);
  } catch {
    console.error('Failed to parse analysis response');
    return null;
  }
}

export function parseImprovementResponse(text: string): ImprovementResponse | null {
  try {
    const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/);
    const jsonStr = jsonMatch ? jsonMatch[1] : text;
    return JSON.parse(jsonStr);
  } catch {
    console.error('Failed to parse improvement response');
    return null;
  }
}
