# 🔴 RUNBOOK.md — Based Intern Live Operations

Operations guide for monitoring and managing the live Based Intern agent deployment on Railway.

---

## 📋 What to Watch Checklist

### 1. First Loop Execution
- [ ] Check Railway logs for successful agent startup
- [ ] Verify loop timer initialized (30-minute intervals)
- [ ] Confirm wallet connection to Base mainnet
- [ ] Check initial balance read (ETH + INTERN)
- [ ] Look for any startup errors in the first tick

**Log markers to search for:**
```
[INIT] Based Intern agent starting...
[LOOP] Timer initialized: 30 minutes
[WALLET] Connected: 0x...
[TICK] Cycle completed successfully
```

### 2. First Trade Execution
- [ ] Monitor for first trade proposal generation
- [ ] Verify trade passes all guardrails (daily cap, interval, spend limits)
- [ ] Check trade execution on Basescan
- [ ] Confirm receipt posted to social channels
- [ ] Validate slippage protection applied (300 BPS)
- [ ] **Verify trade announcement posted** (community hype)

**Key addresses to monitor:**
- Pool: [`0x4dd4e1bf48e9ee219a6d431c84482ad0e5cf9ccc`](https://basescan.org/address/0x4dd4e1bf48e9ee219a6d431c84482ad0e5cf9ccc)
- Router: [`0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43`](https://basescan.org/address/0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43)
- Token: [`0xd530521Ca9cb47FFd4E851F1Fe2E448527010B11`](https://basescan.org/address/0xd530521Ca9cb47FFd4E851F1Fe2E448527010B11)

### 3. LP Auto-Seed Behavior
- [ ] Monitor pool TVL via Aerodrome or Basescan
- [ ] Check if auto-seed triggers when TVL < 1 ETH
- [ ] Verify LP add transaction succeeded
- [ ] Confirm LP position is reflected in agent state
- [ ] Check for gauge staking opportunities (when gauge is live)

**LP Guardrails:**
- Max 0.001 ETH per add
- Max 1000 BPS token fraction
- Slippage: 300 BPS

### 4. Social Posting
- [ ] Verify first post appears on X (Twitter)
- [ ] Verify first post appears on Moltbook
- [ ] Check engagement system responding to mentions (X)
- [ ] Check threaded replies working on Moltbook
- [ ] Confirm no duplicate posts (deduplication working)
- [ ] **Verify trade announcements fire after trades**

### 5. News Opinion Pipeline
- [ ] Check X timeline fetching (watches @base, @buildonbase, @openclaw)
- [ ] Verify opinion generation triggers on relevant news
- [ ] Confirm posts include source URLs (safety requirement)
- [ ] Check circuit breaker opens after 3 consecutive failures
- [ ] Monitor `NEWS_ENABLED` and `OPENAI_API_KEY` config

### 6. Mini App Monitoring
- [ ] Verify mini app loads at [basedintern.vercel.app](https://basedintern.vercel.app)
- [ ] Check stats endpoint responding: `GET /api/stats`
- [ ] Verify pool data endpoint: `GET /api/pool`
- [ ] Confirm action feed showing recent trades/LP/social
- [ ] Test swap component loads (requires CDP API key)
- [ ] Monitor Vercel deployment status

**Mini App Health Checks:**
```bash
# Test agent API endpoints
curl https://basedintern.vercel.app/api/stats
curl https://basedintern.vercel.app/api/pool
curl https://basedintern.vercel.app/api/feed
```

### 7. Error Monitoring

**Critical errors to watch for:**
```
[ERROR] Trade execution failed
[ERROR] LP add/remove failed
[ERROR] Social post failed (both platforms)
[ERROR] Wallet connection lost
[ERROR] Rate limit hit on X API
[ERROR] Moltbook API errors (4xx/5xx)
[ERROR] LLM/AI service unavailable
[ERROR] Router/pool contract errors
[ERROR] State file corruption detected
[ERROR] Atomic state write failed
```

**Warning patterns:**
```
[WARN] Daily trade cap reached
[WARN] Insufficient ETH for trade
[WARN] Slippage exceeded, trade rejected
[WARN] Cooldown active, skipping engagement
[WARN] Duplicate content detected
[WARN] News opinion circuit breaker opened
[WARN] Mini app API cache stale
```

---

## 🚨 Kill Switch Procedure (Emergency Stop)

If you need to immediately halt all trading and LP operations:

### Option 1: Environment Variable (Fastest)
Set via Railway dashboard or CLI:
```bash
KILL_SWITCH=true
```
Then redeploy the service.

### Option 2: Control Endpoint
If you have access to the control server:
```bash
curl -X POST http://basedintern.railway.internal:8080/tick \
  -H "Authorization: Bearer $CONTROL_TOKEN" \
  -d "reason=emergency_stop"
```

### Option 3: Railway Dashboard
1. Go to Railway project dashboard
2. Select the basedintern service
3. Click "Stop" or "Restart"

### Post-Kill Verification
Check logs for:
```
[KILL SWITCH] ENABLED — All trading/LP operations halted
```

---

## 📊 Key Metrics to Track

### Pool Health
| Metric | Target | Where to Check |
|--------|--------|----------------|
| Pool TVL | > 1 ETH | Aerodrome UI, Basescan |
| Price stability | Low volatility | Pool reserves ratio |
| Volume | Growing | Aerodrome analytics |

### Agent Performance
| Metric | Target | Source |
|--------|--------|--------|
| Trades/day | ≤ 1 | Agent receipts |
| Trade success rate | > 95% | Basescan tx history |
| LP position | Growing | Agent state / Aerodrome |
| Social posts | Regular | X + Moltbook feeds |
| Engagement replies | All mentions | X mentions tab |
| News opinions | 1-6/day | Agent logs |

### Mini App Health
| Metric | Target | Check |
|--------|--------|-------|
| Uptime | > 99% | Vercel dashboard |
| API response time | < 500ms | Mini app network tab |
| Cache hit rate | > 80% | Agent logs |
| Feed freshness | < 5 min | Action feed timestamps |

### Wallet Status
| Metric | Healthy Range | Check |
|--------|---------------|-------|
| ETH balance | > 0.01 ETH | Agent state / Basescan |
| INTERN balance | > 0 | Agent state / Basescan |
| Gas reserves | Always funded | Wallet |

---

## ⚙️ Recent Optimizations (Monitor These)

### 1. TTL Caching on API Endpoints
Mini app API responses are now cached for 30 seconds to reduce RPC load.

**What to monitor:**
- Cache hit rates in logs
- RPC call frequency
- API response times

**Troubleshooting:**
```bash
# If cache is stale, check for errors in:
# - src/control/server.ts (getPoolData, getTokenData)
# - TTLCache implementation in src/utils.ts
```

### 2. Atomic State Writes with Backup Recovery
State updates now use atomic write-to-temp + rename pattern. Automatic backup recovery on corruption.

**What to monitor:**
- State file integrity in `data/state.json`
- Backup files: `data/state.json.tmp`, `data/state.json.bak`
- Log entries: `state write successful`, `state recovered from backup`

**Troubleshooting:**
```bash
# Check for state corruption logs
railway logs --service basedintern | grep -i "state\|backup\|corruption"

# Manual recovery from backup
cp data/state.json.bak data/state.json
```

### 3. Persistent Action Log
Action feed now persists to `data/action-log.json` and survives restarts.

**What to monitor:**
- Action log file size (should be bounded)
- Feed endpoint returning data after restart
- Ring buffer not exceeding 50 entries

**Troubleshooting:**
```bash
# Check action log persistence
curl http://basedintern.railway.internal:8080/api/feed

# Verify log file exists
ls -la data/action-log.json
```

### 4. Shared Utilities Module
All `sleep()` functions consolidated to `src/utils.ts`. No more duplicates.

**What to monitor:**
- No "sleep is not defined" errors
- Interruptible sleep working (manual tick wakes loop)
- TTLCache functioning correctly

---

## ⚙️ When to Adjust Settings

### Increase Trade Caps
**Consider when:**
- Trade success rate > 95% over 1 week
- Pool TVL > 5 ETH
- ETH balance > 0.1 ETH

**How to adjust:**
```bash
# Current: 1 trade/day, 0.0005 ETH max
# Proposed: 2 trades/day, 0.001 ETH max
DAILY_TRADE_CAP=2
MAX_SPEND_ETH_PER_TRADE=0.001
```

### Increase LP Amounts
**Consider when:**
- Auto-seed triggers frequently (pool needs depth)
- Agent has excess ETH (> 0.05 ETH)
- Token price is stable

**How to adjust:**
```bash
# Current: max 0.001 ETH per add
# Proposed: max 0.005 ETH per add
LP_MAX_ETH_PER_ADD=0.005
```

### Adjust Slippage
**Consider when:**
- Trades failing due to slippage (price moving fast)
- Pool liquidity is thin
- High volatility periods

**How to adjust:**
```bash
# Current: 300 BPS (3%)
# Proposed: 500 BPS (5%) for volatile periods
SLIPPAGE_BPS=500
LP_SLIPPAGE_BPS=500
```

### News Opinion Settings
**Adjust when:**
- Too many/few opinion posts
- Relevance threshold too strict/loose
- Circuit breaker triggering too often

```bash
# Daily post cap (default: 6)
NEWS_MAX_POSTS_PER_DAY=6

# Relevance threshold 0-1 (default: 0.5)
NEWS_MIN_RELEVANCE_SCORE=0.6

# Circuit breaker after N fails (default: 3)
NEWS_OPINION_CIRCUIT_BREAKER_FAILS=3

# Circuit breaker duration minutes (default: 30)
NEWS_OPINION_CIRCUIT_BREAKER_MINUTES=30
```

---

## 🎯 Gauge Staking (AERO Rewards)

When the INTERN/WETH gauge goes live on Aerodrome:

### Setup
1. Identify gauge contract address from Aerodrome
2. Add to environment:
```bash
GAUGE_ADDRESS=<gauge_contract_address>
```
3. Agent will auto-stake LP tokens for AERO rewards

### Monitoring
- Check gauge rewards accrual
- Monitor AERO claim transactions
- Track total AERO earned vs gas costs

### Claim Strategy
Agent auto-claims when:
- Rewards exceed gas costs
- LP position is removed
- Configured claim interval reached

---

## 📱 Mini App Operations

### Deployment
- **Production URL**: [basedintern.vercel.app](https://basedintern.vercel.app)
- **Hosting**: Vercel (auto-deploys on push to main)
- **Framework**: Next.js 15 + MiniKit
- **Build Command**: `npx next build`

### Environment Variables (Vercel)
```bash
NEXT_PUBLIC_CDP_CLIENT_API_KEY=<coinbase_developer_platform_key>
NEXT_PUBLIC_AGENT_API_URL=https://basedintern.railway.internal:8080
NEXT_PUBLIC_URL=https://basedintern.vercel.app
```

### Monitoring Checklist
- [ ] Mini app loads in Coinbase Wallet
- [ ] Swap component accessible
- [ ] Stats update within 30 seconds
- [ ] Feed shows recent actions
- [ ] No 5xx errors from API endpoints

### Troubleshooting Mini App
```bash
# Check if API is responding
curl -v https://basedintern.vercel.app/api/stats

# Check agent directly (if on same network)
curl http://basedintern.railway.internal:8080/api/stats \
  -H "Authorization: Bearer $CONTROL_TOKEN"

# Restart Vercel deployment
vercel --prod
```

---

## 🔍 Quick Diagnostic Commands

### Check Agent Health
```bash
curl http://basedintern.railway.internal:8080/healthz
```

### Get Full Status
```bash
curl http://basedintern.railway.internal:8080/status \
  -H "Authorization: Bearer $CONTROL_TOKEN"
```

### Get Live Stats (Mini App API)
```bash
curl http://basedintern.railway.internal:8080/api/stats
curl http://basedintern.railway.internal:8080/api/pool
curl http://basedintern.railway.internal:8080/api/feed
```

### Trigger Manual Tick
```bash
curl -X POST http://basedintern.railway.internal:8080/tick \
  -H "Authorization: Bearer $CONTROL_TOKEN" \
  -d "reason=manual_check"
```

### View Recent Railway Logs
```bash
railway logs --service basedintern --tail 100
```

### Check State File
```bash
railway ssh --service basedintern
cat data/state.json | jq .lastExecutedTradeAtMs
cat data/action-log.json | jq '. | length'
```

---

## 📞 Escalation

| Issue | Action |
|-------|--------|
| Trading halted unexpectedly | Check KILL_SWITCH, wallet balance, RPC status |
| Social posts stopped | Check API credentials, rate limits, circuit breaker |
| LP operations failing | Check pool health, token approvals, slippage |
| Agent unresponsive | Check Railway service status, restart if needed |
| Suspicious transactions | Immediately trigger kill switch, investigate wallet |
| Mini app not loading | Check Vercel status, API endpoint health |
| State corruption detected | Restore from backup, investigate disk space |
| News opinions stopped | Check OPENAI_API_KEY, circuit breaker status |

---

## 🔄 Deployment Checklist

Before deploying new code:

- [ ] All 218 tests passing
- [ ] TypeScript typecheck clean
- [ ] Mini app builds successfully
- [ ] No new environment variables required
- [ ] State migration version bumped if needed
- [ ] README updated if features changed
- [ ] RUNBOOK updated if ops procedures changed

---

Last updated: Post-optimization deployment (shared utils, TTL caching, atomic state writes, persistent action log)
