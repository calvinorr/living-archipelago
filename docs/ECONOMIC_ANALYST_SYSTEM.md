# Economic Analyst System

An AI-powered economic modeling expert that analyzes simulation data, identifies model weaknesses, and suggests improvements that can be applied to the game logic.

## Status: Planning Complete

**Created**: 2026-01-19
**Last Updated**: 2026-01-19

## Overview

The Economic Analyst is a Gemini-powered system that:
1. Runs analysis on completed simulation runs (on-demand)
2. Identifies model weaknesses and unrealistic behaviors
3. Suggests parameter and code improvements
4. Allows preview and direct application of changes
5. Tracks improvement effectiveness over time

## Architecture

```
User clicks "Analyze"
         │
         ▼
┌─────────────────┐     ┌──────────────────┐
│  Analyst Page   │────►│  Analyst API     │
│  (React)        │     │  (Express)       │
└─────────────────┘     └────────┬─────────┘
         │                       │
         │              ┌────────▼─────────┐
         │              │  Analytics DB    │
         │              │  (SQLite)        │
         │              └────────┬─────────┘
         │                       │
         │              ┌────────▼─────────┐
         │              │  AI Analyst      │
         │              │  (Gemini)        │
         │              └────────┬─────────┘
         │                       │
         ▼                       ▼
┌─────────────────┐     ┌──────────────────┐
│  Analysis UI    │◄────│  Improvements    │
│  Chat + Reports │     │  Config/Code     │
└─────────────────┘     └──────────────────┘
```

## Implementation Phases

### Phase 1: Data Aggregation & API
- [ ] Create `src/storage/analyst-queries.ts` - Advanced analytics queries
- [ ] Create `src/server/analyst-api.ts` - REST endpoints
- [ ] Add analyst database tables (analyses, issues, improvements)
- [ ] Implement `getRunSummary()` aggregation

**Key metrics to aggregate:**
- Trade profitability by route
- Price convergence over time
- Ecosystem sustainability scores
- Population health trends
- Agent ROI

### Phase 2: AI Analyst Backend
- [ ] Create `src/analyst/analyst-agent.ts` - Main analysis logic
- [ ] Create `src/analyst/prompts.ts` - Specialized prompts
- [ ] Create `src/analyst/improvement-generator.ts` - Generate changes
- [ ] Implement diagnosis, explanation, recommendation capabilities

**Analysis capabilities:**
1. **Diagnose** - Identify model issues from data patterns
2. **Explain** - Answer questions about simulation behavior
3. **Recommend** - Suggest specific parameter changes
4. **Generate** - Create config patches or code diffs

### Phase 3: Frontend Analyst Page
- [ ] Create `/analyst` route and page
- [ ] Create `AnalystChat.tsx` - Chat interface
- [ ] Create `AnalysisReport.tsx` - Results display
- [ ] Create `ImprovementQueue.tsx` - Pending changes
- [ ] Create `useAnalyst.ts` - State management

**UI Components:**
- Run selector (list completed runs)
- Analysis results with health score
- Issues list with severity
- Recommendations with apply buttons
- Chat interface for questions
- Improvement preview with diff view

### Phase 4: Improvement Application
- [ ] Create `src/analyst/config-patcher.ts` - Apply config changes
- [ ] Implement diff preview for changes
- [ ] Add version tracking for iterations
- [ ] Track effectiveness across runs

**Change types:**
1. **Config changes** - Modify SimulationConfig values (safe to auto-apply)
2. **Code suggestions** - Logic changes (require review, shown as diff)

### Phase 5: Integration & Polish
- [ ] Add analyst button to main dashboard
- [ ] Export analysis reports as markdown
- [ ] Track improvement history
- [ ] Add effectiveness metrics (before/after comparison)

## API Endpoints

```
GET  /api/analyst/runs                    # List runs available for analysis
GET  /api/analyst/runs/:id/summary        # Quick run summary (no LLM)
POST /api/analyst/runs/:id/analyze        # Trigger full AI analysis
GET  /api/analyst/analyses/:id            # Get analysis results
POST /api/analyst/chat                    # Chat with analyst
GET  /api/analyst/improvements            # List pending improvements
POST /api/analyst/improvements/:id/apply  # Apply an improvement
GET  /api/analyst/improvements/:id/preview # Preview change diff
```

## Database Schema

```sql
-- Analyses table
analyses (id, run_id, analyzed_at, health_score, summary, raw_response)

-- Issues found in analysis
analysis_issues (id, analysis_id, severity, category, description, evidence)

-- Suggested improvements
improvements (id, analysis_id, type, title, description, rationale,
              config_path, current_value, suggested_value,
              file_path, diff, status, applied_at, applied_in_run_id)

-- Track improvement effectiveness
improvement_outcomes (id, improvement_id, before_run_id, after_run_id,
                      metric_name, before_value, after_value, improvement_pct)
```

## Known Model Weaknesses (To Detect)

From previous analysis, the analyst should identify:

| Issue | Current Behavior | Realistic | Detection |
|-------|-----------------|-----------|-----------|
| Population growth too fast | 88%/year | 0.05-0.1%/year | Check population doubling time |
| Spoilage vs margin imbalance | Fish loses 36%/24h | Margin must exceed spoilage | Check fish trade ROI |
| Labor ignores wages | Follows ecosystem | Should follow prices | Compare sector wages vs allocation |
| Ecosystem floor too high | 20% at zero stock | ~0% production | Check production at depleted islands |
| No currency sinks | Money accumulates | Should drain via costs | Check money supply trend |

## Example Analysis Output

```typescript
{
  runId: 1,
  healthScore: 65,
  issues: [
    {
      severity: 'warning',
      category: 'population',
      description: 'Population growing faster than realistic rates',
      evidence: ['Island A: +12% in 100 ticks', 'Doubling time: ~800 ticks']
    },
    {
      severity: 'critical',
      category: 'ecosystem',
      description: 'Fish stocks depleting to collapse on 2 of 3 islands',
      evidence: ['Greenbarrow: 8% capacity', 'Timberwake: 12% capacity']
    }
  ],
  recommendations: [
    {
      type: 'config',
      title: 'Reduce population growth rate',
      configPath: 'maxGrowthRate',
      currentValue: 0.01,
      suggestedValue: 0.002,
      rationale: 'Current rate produces 88% annual growth, historically unrealistic'
    }
  ]
}
```

## Files to Create

### Backend
| File | Description |
|------|-------------|
| `src/analyst/analyst-agent.ts` | Main analyst LLM logic |
| `src/analyst/prompts.ts` | Analysis prompt templates |
| `src/analyst/improvement-generator.ts` | Generate config/code changes |
| `src/analyst/config-patcher.ts` | Apply config changes safely |
| `src/storage/analyst-queries.ts` | Advanced analytics SQL |
| `src/server/analyst-api.ts` | REST API endpoints |

### Frontend
| File | Description |
|------|-------------|
| `packages/web/src/app/analyst/page.tsx` | Analyst page |
| `packages/web/src/components/analyst/AnalystChat.tsx` | Chat interface |
| `packages/web/src/components/analyst/AnalysisReport.tsx` | Results display |
| `packages/web/src/components/analyst/ImprovementQueue.tsx` | Changes list |
| `packages/web/src/components/analyst/DiffPreview.tsx` | Change preview |
| `packages/web/src/hooks/useAnalyst.ts` | State management |
| `packages/web/src/lib/analyst-types.ts` | TypeScript types |

## Success Criteria

1. Analyst identifies known model weaknesses automatically
2. Suggested improvements are valid and actionable
3. Applied improvements measurably change simulation behavior
4. Chat provides useful explanations of economic dynamics
5. Improvement effectiveness is tracked over time
6. System respects LLM rate limits and costs

## Related Documents

- `docs/ECONOMIC_RESEARCH_DEEP_DIVE.md` - Economic model research
- `docs/ECONOMIC_MODEL_REVIEW.md` - Previous model review
- `docs/implementation-plans/` - Track implementation specs
