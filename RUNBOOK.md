# 🔴 RUNBOOK.md — Based Intern Live Operations

Operations guide for monitoring and managing the live Based Intern agent deployment on Railway.

**Last updated:** 2026-02-08 (post first autonomous on-chain transaction)

---

## 📋 What to Watch Checklist

### 1. First Loop Execution
- [x] Check Railway logs for successful agent startup
- [x] Verify loop timer initialized (30-minute intervals)
- [x] Confirm wallet connection to Base mainnet
- [x] Check initial balance read (ETH + INTERN)
- [x] Look for any startup errors in the first tick
- [x] Verify redeploy protection (`redeploy_protection: skipping tick` if restarted quickly)

**Log markers to search for:**
```
"based-intern starting"
"tick triggered, evaluating trade"
"redeploy_protection: skipping tick"
```

### 2. On-Chain Transaction Execution
- [x] First LP seed executed: 0.005 ETH + 177,944 INTERN (2026-02-08)
- [x] Local account signing working (no `eth_sendTransaction` errors)
- [x] ERC20 approvals confirmed before dependent transactions
- [ ] Monitor for first autonomous trade (BUY or SELL)
- [ ] Verify trade passes all guardrails (daily cap, interval, spend limits)
- [ ] Check trade execution on BaseScan
- [ ] Confirm receipt posted to social channels
- [ ] Validate slippage protection applied (500 BPS)
- [ ] **Verify trade announcement posted** (community hype)

**Key addresses to monitor:**
- Agent Wallet: [`0x4Ba6B07626E6dF28120b04f772C4a89CC984Cc80`](https://basescan.org/address/0x4Ba6B07626E6dF28120b04f772C4a89CC984Cc80)
- Pool: [`0x4dd4e1bf48e9ee219a6d431c84482ad0e5cf9ccc`](https://basescan.org/address/0x4dd4e1bf48e9ee219a6d431c84482ad0e5cf9ccc)
- Router: [`0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43`](https://basescan.org/address/0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43)
- Factory: [`0x420DD381b31aEf6683db6B902084cB0FFECe40Da`](https://basescan.org/address/0x420DD381b31aEf6683db6B902084cB0FFECe40Da)
- Token: [`0xd530521Ca9cb47FFd4E851F1Fe2E448527010B11`](https://basescan.org/address/0xd530521Ca9cb47FFd4E851F1Fe2E448527010B11)

**First successful TX:**
- LP Seed: [`0x99a0995d...bae85d8`](https://basescan.org/tx/0x99a0995d92eca6b6d36c76f79faf7352dc0f0d7328c2a95798702ec53bae85d8)

### 3. Trading Execution Flow
The trading deadlock has been fixed. Every tick (heartbeat or activity-detected) now evaluates trades:

```
tick() → watchForActivity() → proposeAction() → enforceGuardrails() → executeBuy/Sell()
```

**Key log lines:**
```
"tick triggered, evaluating trade"     → trading logic is running
"trade execution failed"               → swap reverted (check gas, slippage)
"trade announcement posted"            → trade went through + announced
"trade announcement skipped"           → dedup caught similar recent post
"guardrails blocked trade"             → check blockedReason field
```

**Trading probability (Tier 4 fallback):**
- 35% BUY / 30% SELL / 35% HOLD
- Varies by UTC hour + 10-minute bucket (not frozen)

### 4. LP Auto-Seed Behavior
- [x] Auto-seed triggers when pool TVL < 1 ETH
- [x] ERC20 approval confirmed before addLiquidityETH
- [x] First LP add transaction succeeded
- [ ] Monitor pool TVL growth
- [ ] Check for gauge staking opportunities (when gauge is live)

**LP Log Lines:**
```
"lp.autoSeed.propose"                 → evaluating LP add
"lp.allowance.sufficient"             → approval already set
"lp.allowance.approving"              → sending approval tx (waits for confirmation)
"lp.addLiquidityETH.submitted"        → LP add tx sent (check txHash)
"lp.autoSeed.failed"                  → check error field
"lp.autoSeed.skip"                    → check reason field
```

**Common skip reasons:**
| Reason | Meaning |
|--------|---------|
| `pool_tvl_above_threshold` | Pool TVL > 1 ETH, no seeding needed |
| `insufficient_eth` | Wallet ETH too low (need > 0.001 ETH for gas reserve) |
| `insufficient_token` | No INTERN tokens available |

### 5. Content Deduplication
- [ ] Verify no duplicate news opinion posts from same source within 4 hours
- [ ] Verify no cross-pipeline similar content
- [ ] Verify trade announcement templates rotate
- [ ] Check `news.opinion.skip.source_cooldown` logs (source dedup working)
- [ ] Check `news.opinion.skip.cross_pipeline_similar` logs (cross-pipeline dedup working)
- [ ] Check `trade announcement skipped (too similar)` logs (trade dedup working)

**Dedup Log Lines:**
```
"news.opinion.skip.source_cooldown"         → same domain posted < 4h ago
"news.opinion.skip.cross_pipeline_similar"  → too similar to recent post from any pipeline
"news.opinion.skip.duplicate_id"            → exact article already posted
"news.opinion.skip.duplicate_url"           → same URL (different provider ID)
"trade announcement skipped"                → trade hype too similar to recent post
```

### 6. Redeploy Protection
- [ ] Verify `redeploy_protection: skipping tick` appears after Railway deploys
- [ ] Confirm engagement indices persist across restarts (no repeated hooks/CTAs)
- [ ] Check `lastTickCompletedAtMs` in state.json updates every tick

**Log Lines:**
```
"redeploy_protection: skipping tick, last tick too recent"  → working correctly
"tick triggered, evaluating trade"                          → tick ran normally
```

### 7. Social Posting
- [ ] Verify posts appear on X (Twitter)
- [ ] Verify posts appear on Moltbook
- [ ] Check engagement system responding to mentions (X)
- [ ] Check threaded replies working on Moltbook
- [ ] Confirm no duplicate posts (5-layer deduplication working)
- [ ] **Verify trade announcements fire after trades**

### 8. News Opinion Pipeline
- [ ] Check X timeline fetching (watches @base, @buildonbase, @openclaw)
- [ ] Verify opinion generation triggers on relevant news
- [ ] Confirm posts include source URLs (safety requirement)
- [ ] Check circuit breaker opens after 3 consecutive failures
- [ ] Monitor source cooldown preventing same-domain spam
- [ ] Monitor `NEWS_ENABLED` and `OPENAI_API_KEY` config

### 9. Mini App Monitoring
- [ ] Verify mini app loads at [basedintern.vercel.app](https://basedintern.vercel.app)
- [ ] Check stats endpoint responding: `GET /api/stats`
- [ ] Verify pool data endpoint: `GET /api/pool`
- [ ] Confirm action feed showing recent trades/LP/social
- [ ] Test swap component loads (requires CDP API key)
- [ ] Pool/deposit links point to BaseScan (Aerodrome frontend doesn't support unverified tokens)

**Mini App Health Checks:**
```bash
# Test agent API endpoints
curl https://basedintern.vercel.app/api/stats
curl https://basedintern.vercel.app/api/pool
curl https://basedintern.vercel.app/api/feed
```

### 10. Error Monitoring

**Critical errors to watch for:**
```
"trade execution failed"
"lp.autoSeed.failed"
"lp.addLiquidityETH" + error
"Unsupported method: eth_sendTransaction"   → signing bug (should be fixed)
"aerodrome_factory_query_failed"            → pool discovery issue (should be fixed)
"state file corrupted"                      → auto-recovery from .bak
```

**Warning patterns:**
```
"guardrails blocked trade"                  → check blockedReason
"lp.autoSeed.skip"                         → check reason
"news.opinion.skip"                        → check reason
"redeploy_protection: skipping tick"       → normal after deploy
"trade announcement skipped"               → dedup working
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
"KILL_SWITCH=true" in guardrails blocked reason
```

---

## 📊 Key Metrics to Track

### Pool Health
| Metric | Target | Where to Check |
|--------|--------|----------------|
| Pool TVL | > 0.01 ETH (bootstrapping) | Aerodrome UI, BaseScan |
| Price stability | Low volatility | Pool reserves ratio |
| Volume | Growing | Aerodrome analytics |

### Agent Performance
| Metric | Target | Source |
|--------|--------|--------|
| Trades/day | ≤ 3 | Agent receipts |
| Trade success rate | > 95% | BaseScan tx history |
| LP position | Growing | Agent state / Aerodrome |
| Social posts | Regular, non-repetitive | X + Moltbook feeds |
| Engagement replies | All mentions | X mentions tab |
| News opinions | 1-6/day, no source repeats | Agent logs |

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
| ETH balance | > 0.005 ETH | [BaseScan](https://basescan.org/address/0x4Ba6B07626E6dF28120b04f772C4a89CC984Cc80) |
| INTERN balance | > 0 | Agent state / BaseScan |
| Gas reserves | Always > 0.001 ETH | Wallet |
| Nonce | Incrementing | BaseScan |

---

## 🔧 Recent Critical Fixes (2026-02-08)

### Fix 1: Trading Deadlock (CRITICAL)
**Problem:** Trading only ran when wallet activity was detected, but activity can't happen if the agent never trades. Heartbeat ticks hardcoded HOLD.
**Fix:** Merged heartbeat and activity branches — every tick evaluates `proposeAction()` + `enforceGuardrails()`.
**Monitor:** Look for `"tick triggered, evaluating trade"` in logs.

### Fix 2: Local Account Signing (CRITICAL)
**Problem:** All `writeContract`/`sendTransaction` calls passed `walletClient.account.address` (string) instead of `walletClient.account` (full object). Caused `"Unsupported method: eth_sendTransaction"` on Alchemy.
**Fix:** Pass full account object so viem signs locally via `eth_sendRawTransaction`.
**Monitor:** Should never see `"Unsupported method: eth_sendTransaction"` again.

### Fix 3: Approval Race Condition (CRITICAL)
**Problem:** `approveToken()` returned tx hash without waiting for confirmation. Dependent transactions (LP add, swap) simulated against stale state and reverted.
**Fix:** Added `waitForTransactionReceipt()` after approval.
**Monitor:** `"lp.allowance.approving"` should be followed by `"lp.addLiquidityETH.submitted"` (no revert).

### Fix 4: Aerodrome v2 Compatibility
**Problem:** Wrong factory address + `getPair` function (v1 API). Aerodrome v2 uses `getPool`.
**Fix:** Corrected factory to `0x420DD381b31aEf6683db6B902084cB0FFECe40Da`, function to `getPool`.
**Monitor:** Should never see `"aerodrome_factory_query_failed"` again.

### Fix 5: Frozen Trade Probabilities
**Problem:** Tier 4 hash used wallet address + token balance string length — both constant — producing the same BUY/SELL/HOLD every tick.
**Fix:** Added hour + minute-bucket seeds. Shifted from 16/16/68 to 35/30/35.
**Monitor:** Trades should vary across ticks, not repeat the same decision.

### Fix 6: 5-Layer Content Deduplication
**Problem:** Agent reposting same news sources, repeating similar content across pipelines.
**Fix:** Added source domain cooldown (4h), cross-pipeline Jaccard similarity (0.65), persistent trade template rotation, topic extraction.
**Monitor:** Check for `source_cooldown` and `cross_pipeline_similar` skip logs.

### Fix 7: Redeploy Protection
**Problem:** Railway zero-downtime deploys could fire duplicate posts (in-memory state reset).
**Fix:** Startup cooldown (skip tick if last tick < half loop interval ago), persisted engagement indices.
**Monitor:** `"redeploy_protection: skipping tick"` after deploys.

---

## ⚙️ When to Adjust Settings

### Increase Trade Caps
**Consider when:**
- Trade success rate > 95% over 1 week
- Pool TVL > 1 ETH
- ETH balance > 0.05 ETH

**How to adjust:**
```bash
# Current: 3 trades/day, 0.0002 ETH max
DAILY_TRADE_CAP=5
MAX_SPEND_ETH_PER_TRADE=0.001
```

### Increase LP Amounts
**Consider when:**
- Auto-seed triggers frequently (pool needs depth)
- Agent has excess ETH (> 0.05 ETH)
- Token price is stable

**How to adjust:**
```bash
# Current: max 0.005 ETH per add
LP_MAX_ETH_PER_ADD=0.01
```

### Adjust Slippage
**Consider when:**
- Trades failing due to slippage (price moving fast)
- Pool liquidity is thin
- High volatility periods

**How to adjust:**
```bash
# Current: 500 BPS (5%)
SLIPPAGE_BPS=800
LP_SLIPPAGE_BPS=800
```

### News Source Cooldown
**Adjust when:**
- Too many posts from same news source
- Not enough variety in news opinions

```bash
# Current: 4 hours
NEWS_SOURCE_COOLDOWN_HOURS=6
```

### News Opinion Settings
**Adjust when:**
- Too many/few opinion posts
- Relevance threshold too strict/loose
- Circuit breaker triggering too often

```bash
NEWS_MAX_POSTS_PER_DAY=6
NEWS_MIN_RELEVANCE_SCORE=0.6
NEWS_OPINION_CIRCUIT_BREAKER_FAILS=3
NEWS_OPINION_CIRCUIT_BREAKER_MINUTES=30
```

---

## 🎯 Gauge Staking (AERO Rewards)

When the INTERN/WETH gauge goes live on Aerodrome:

### Setup
1. Identify gauge contract address from Aerodrome
2. Add to environment:
```bash
GAUGE_ADDRESS_WETH=<gauge_contract_address>
```
3. Agent will auto-stake LP tokens for AERO rewards

### Monitoring
- Check gauge rewards accrual
- Monitor AERO claim transactions
- Track total AERO earned vs gas costs

---

## 📱 Mini App Operations

### Deployment
- **Production URL**: [basedintern.vercel.app](https://basedintern.vercel.app)
- **Hosting**: Vercel (auto-deploys on push to main)
- **Framework**: Next.js 15 + MiniKit
- **Pool/Deposit Links**: Point to BaseScan (Aerodrome frontend crashes on unverified tokens)

### Environment Variables (Vercel)
```bash
NEXT_PUBLIC_CDP_CLIENT_API_KEY=<coinbase_developer_platform_key>
NEXT_PUBLIC_AGENT_API_URL=https://basedintern.railway.internal:8080
NEXT_PUBLIC_URL=https://basedintern.vercel.app
```

### Troubleshooting Mini App
```bash
# Check if API is responding
curl -v https://basedintern.vercel.app/api/stats

# Check agent directly (if on same network)
curl http://basedintern.railway.internal:8080/api/stats

# Restart Vercel deployment
vercel --prod
```

### Aerodrome Token Listing
To restore direct Aerodrome links (currently BaseScan):
1. Submit PR to [aerodrome-finance/token-list](https://github.com/aerodrome-finance/token-list) to add INTERN
2. Ask in Aerodrome Discord for token listing
3. Once listed, update `miniapp/src/lib/constants.ts` to use Aerodrome URLs again

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

### Check Wallet on BaseScan
```bash
open https://basescan.org/address/0x4Ba6B07626E6dF28120b04f772C4a89CC984Cc80
```

---

## 📞 Escalation

| Issue | Action |
|-------|--------|
| Trading halted unexpectedly | Check KILL_SWITCH, wallet balance, RPC status |
| `eth_sendTransaction` error | Signing bug — check `walletClient.account` usage |
| LP operations failing | Check approval flow, pool existence, slippage |
| Social posts stopped | Check API credentials, rate limits, circuit breaker |
| Duplicate posts appearing | Check dedup logs, state.json integrity |
| Agent unresponsive | Check Railway service status, restart if needed |
| Suspicious transactions | Immediately trigger kill switch, investigate wallet |
| Mini app not loading | Check Vercel status, API endpoint health |
| State corruption detected | Auto-recovers from .bak; check disk space |
| News opinions stopped | Check OPENAI_API_KEY, circuit breaker status |

---

## 🔄 Deployment Checklist

Before deploying new code:

- [ ] All 218 tests passing
- [ ] TypeScript typecheck clean (`npx tsc --noEmit`)
- [ ] Mini app builds successfully (`cd miniapp && npx next build`)
- [ ] No new environment variables required (or documented)
- [ ] State migration version bumped if schema changed (currently v18)
- [ ] README updated if features changed
- [ ] RUNBOOK updated if ops procedures changed
- [ ] Check that state.json schema migration handles the new fields
