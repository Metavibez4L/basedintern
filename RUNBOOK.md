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

### 5. Error Monitoring

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
```

**Warning patterns:**
```
[WARN] Daily trade cap reached
[WARN] Insufficient ETH for trade
[WARN] Slippage exceeded, trade rejected
[WARN] Cooldown active, skipping engagement
[WARN] Duplicate content detected
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
curl -X POST http://basedintern.railway.internal:8080/kill \
  -H "Authorization: Bearer $CONTROL_TOKEN"
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

### Wallet Status
| Metric | Healthy Range | Check |
|--------|---------------|-------|
| ETH balance | > 0.01 ETH | Agent state / Basescan |
| INTERN balance | > 0 | Agent state / Basescan |
| Gas reserves | Always funded | Wallet |

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

### Trigger Manual Tick
```bash
curl -X POST http://basedintern.railway.internal:8080/tick \
  -H "Authorization: Bearer $CONTROL_TOKEN"
```

### View Recent Railway Logs
```bash
railway logs --service basedintern --tail 100
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

---

Last updated: Live deployment activation
