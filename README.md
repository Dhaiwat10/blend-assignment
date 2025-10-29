# Blend Risk Monitoring & Rebalancing Simulator (Bun + Hono)

Focused simulation of a risk engine that monitors vault health during a market crash and produces an atomic-style rebalancing plan suitable for on-chain execution.

Please see [plan.md](./plan.md) for my thought process around the problem, and my initial planning to solve it.

## Quick Start

Docker (one command):
```bash
docker compose up --build
```
This starts Postgres and the engine server.

## API

- `GET /vaults`: list current vaults
- `GET /vaults/:id`: get a specific vault
- `POST /simulate`: run/restart the crash simulation
- `GET /rebalances`: list persisted `RebalanceEvent`s
- `GET /health`: summary of current health factors
- `GET /ws`: server-sent events stream (simulation ticks, snapshots, rebalances)

## Simulation

- Every 2–3s, randomly drops wstETH or weETH by 5–15%.
- Stops once any vault breaches HF < 1.15.
- Persists a `RebalanceEvent` with an execution plan to storage.

## How to evaluate (demo flow)

1) Start the server (Bun):
```bash
docker compose up --build
```

2) Simulate the crash (stops at first breach, HF < 1.15):
```bash
curl -s -X POST 'http://localhost:3000/simulate?pretty=1'
```
This generates a rebalancing plan (if needed).

> You can optionally start the simulation with a specified number of extra ticks after breach. By default, the crash simulation will stop at the first breach so that you can inspect the rebalancing plan.
```bash
curl -s -X POST 'http://localhost:3000/simulate?extraTicks=5&pretty=1'
```

3) Inspect generated plans:
```bash
curl -s 'http://localhost:3000/rebalances?pretty=1'
```

4) Optionally apply the plan (simulate execution) to vault state:
```bash
# Choose the vaultId reported in step 2/3, e.g. VAULT-B-WEETH-BETH
curl -s -X POST 'http://localhost:3000/execute?pretty=1' \
  -H 'content-type: application/json' \
  -d '{"vaultId":"VAULT-B-WEETH-BETH"}'
```
This mutates in-memory state using the plan’s projected outcome.

5) Verify vault health after execution:
```bash
curl -s 'http://localhost:3000/vaults?pretty=1'
curl -s 'http://localhost:3000/health?pretty=1'
```
You should see HF ≈ 1.25 (healthy) for the rebalanced vault.

Bonus: execute all latest plans at once
```bash
curl -s -X POST 'http://localhost:3000/execute?pretty=1' \
  -H 'content-type: application/json' \
  -d '{"applyAll":true}'
```

## Health Factor

Let collateral amount be $C$, collateral price $P_c$, debt amount $D$, debt token price $P_d$, and liquidation threshold $L$.

$$\mathrm{HF} = \frac{C\,P_c\,L}{D\,P_d}$$

- $L = 0.85$
- Trigger threshold: $\mathrm{HF} < 1.15$
- Target after rebalance: $\mathrm{HF} \approx 1.25$

## Rebalancing Algorithm (Math)

We solve for the collateral to sell $x$ to reach a target HF $T$, while incorporating slippage $s$ (default 0.5%).

Target condition:
$$ T = \frac{(C - x)\,P_c\,L}{D\,P_d - x\,P_c\,(1 - s)} $$

Solve for $x$:
$$ x = \frac{C\,P_c\,L - T\,D\,P_d}{P_c\,\bigl(L - T\,(1 - s)\bigr)} $$

Constraints and guards:
- Clamp to $0 < x < C$
- Avoid over-repay: ensure $D' = D - \tfrac{x\,P_c\,(1-s)}{P_d} \ge 0$
- Prices must exist for all symbols, precision handled via Decimal arithmetic

## Execution Plan & Atomicity

Planned actions:
- withdrawCollateral
- swap (wstETH → WETH → USDC) or (weETH → WETH)
- repayDebt (bUSDC or bETH)

In this simulation, bUSDC and bETH are ERC-4626 vault shares. To actually repay, we: withdraw user collateral, swap to the underlying asset of the debt market (e.g., WETH/USDC), deposit that underlying into the ERC-4626 vault to mint loan shares, then repay using those shares. The plan we generate encodes this flow as a single atomic multicall.

Atomic execution is represented as a bundler-compatible multicall metadata object with encoded calls, designed to run on-chain in one transaction. For gas robustness the plan encodes an exact-output swap (cap input via `amountInMaximum`) and deposits underlying directly to mint bTokens to the repay target, avoiding an extra transfer.

Potential production refinements:
- Permit/Permit2 to reduce approvals
- Quote across venues/paths (or an aggregator) and prefer exact-output for predictable repayment
- MEV protection and replacement tx strategy near threshold

## Mock Environment & Execution Rationale

- **DEX routing simplification**: This mock sim focuses on core risk logic and plan structure, so it does not fetch or compare routes across multiple exchanges/paths. We use a Uniswap V3-style swap as the canonical example. In production, we would source quotes and routes across multiple venues and paths (and potentially an aggregator), selecting the best route under latency and reliability constraints.
- **Why a separate execute step?** The assessment emphasizes that the main output is the structured execution plan itself, not the live execution. Therefore, the demo exposes an explicit execute step to apply the projected outcome to state. In production, an automated executor would submit the plan as soon as a vault is at risk, with guardrails (slippage bounds, replacement transactions, MEV protection) and observability.

## SSE (real-time monitoring during crash sim)

Endpoint: `GET /ws` (Server-Sent Events)

Message schema (examples):

```json
{ "type": "simulationStart", "timestamp": "...", "data": { "prices": {"weETH": 3600} } }
{ "type": "tick", "timestamp": "...", "data": { "at": "...", "changed": { "symbol": "weETH", "old": 3600, "new": 3181, "dropPct": 11.64 } } }
{ "type": "rebalance", "timestamp": "...", "data": { /* RebalanceEvent */ } }
```

This is functionally the "dashboard feed" an on-call risk engineer or automation bot would watch.

## Assumptions

- bETH priced as WETH, bUSDC priced as USDC.
- ERC-4626 share = 1 underlying asset (no yield accrual in sim).
- Gas shown as an estimate in plan metadata.

## DEX routing assumptions

- Vault A (wstETH / bUSDC): wstETH → WETH → USDC, repay bUSDC.
- Vault B (weETH / bETH): weETH → WETH, repay bETH.
- Assume bUSDC ≈ $1 and bETH ≈ WETH.

## Tests

```bash
bun test
```

Unit tests cover: health factor calculation, rebalancing calculation (HF_after ≥ 1.25), slippage guard, and clamping so we don’t oversell or repay below zero.

## Limitations / Future Work

- No real on-chain calls or quotes; prices and slippage are mocked.
- Assumes immediate liquidity at stated prices.
- Liquidation bots and race conditions are not modeled (we act as if we win first).


## Time Spent

- Roughly: 4 hours