/**
 * TypeScript types for the Economic Analyst system
 */

// ============================================================================
// API Response Types (matching backend)
// ============================================================================

export interface RunSummary {
  runId: number;
  seed: number;
  duration: number;
  totalTrades: number;
  profitableTradeRatio: number;
  totalTradeValue: number;
  agentROI: number;
  avgPriceVolatility: Record<string, number>;
  priceConvergence: number;
  ecosystemHealthTrend: 'improving' | 'stable' | 'declining' | 'critical';
  avgFishStockRatio: number;
  avgForestRatio: number;
  populationTrend: 'growing' | 'stable' | 'declining';
  avgPopulationHealth: number;
  totalPopulationChange: number;
  anomalies: string[];
  config: {
    maxGrowthRate: number;
    fishMigrationConfig?: { migrationRate: number };
    transactionTaxRate: number;
    baseVoyageCost: number;
  };
}

export interface EcosystemReport {
  islandId: string;
  islandName: string;
  fishStock: {
    start: number;
    end: number;
    capacityRatio: number;
    trend: 'recovering' | 'stable' | 'depleting' | 'collapsed';
  };
  forest: {
    start: number;
    end: number;
    capacityRatio: number;
    trend: 'recovering' | 'stable' | 'depleting' | 'collapsed';
  };
  sustainability: 'sustainable' | 'marginal' | 'unsustainable';
}

export interface MarketEfficiencyMetrics {
  avgSpread: number;
  avgMargin: number;
  priceConvergenceByGood: Record<string, number>;
  arbitrageOpportunities: number;
  tradeFriction: number;
}

export interface RouteAnalysis {
  fromIsland: string;
  toIsland: string;
  goodId: string;
  tradeCount: number;
  avgQuantity: number;
  avgBuyPrice: number;
  avgSellPrice: number;
  avgMargin: number;
  profitable: boolean;
}

// ============================================================================
// Analysis Types
// ============================================================================

export interface AnalysisIssue {
  severity: 'critical' | 'warning' | 'info';
  category: string;
  description: string;
  evidence: string[];
}

export interface AnalysisRecommendation {
  type: 'config';
  title: string;
  configPath: string;
  currentValue: unknown;
  suggestedValue: unknown;
  rationale: string;
  expectedImpact: string;
  confidence: number;
}

export interface RunAnalysis {
  runId: number;
  analyzedAt: string;
  healthScore: number;
  issues: AnalysisIssue[];
  recommendations: AnalysisRecommendation[];
  summary: string;
}

// ============================================================================
// Chat Types
// ============================================================================

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

// ============================================================================
// Improvement Types
// ============================================================================

export interface Improvement {
  id: string;
  analysisId?: number;
  type: 'config' | 'code';
  title: string;
  description: string;
  rationale: string;
  configPath?: string;
  currentValue?: unknown;
  suggestedValue?: unknown;
  filePath?: string;
  diff?: string;
  status: 'pending' | 'applying' | 'applied' | 'rejected';
  appliedAt?: string;
  confidence: number;
}

// ============================================================================
// Run List Types
// ============================================================================

export interface RunListItem {
  id: number;
  seed: number;
  startedAt: string;
  endedAt: string | null;
  duration: number;
}

// ============================================================================
// Full Run Data (combined endpoint response)
// ============================================================================

export interface FullRunData {
  summary: RunSummary;
  ecosystem: EcosystemReport[];
  market: MarketEfficiencyMetrics;
  routes: RouteAnalysis[];
}

// ============================================================================
// Analyst State
// ============================================================================

export interface AnalystState {
  // Run selection
  runs: RunListItem[];
  selectedRunId: number | null;
  runData: FullRunData | null;

  // Analysis
  analysis: RunAnalysis | null;
  isAnalyzing: boolean;

  // Chat
  chatMessages: ChatMessage[];
  isChatting: boolean;

  // Improvements
  improvements: Improvement[];

  // Errors
  error: string | null;
}
