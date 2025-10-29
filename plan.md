# Design & Implementation Plan

This document outlines the problem analysis, rebalancing strategy, and implementation approach for the Blend risk monitoring simulator.

---

## Problem Statement

During a market crash, asset prices drop rapidly. For leveraged positions:

- **Collateral value decreases** as prices fall
- **Debt remains constant** (denominated in USD or stable tokens)
- **Health Factor drops** proportionally: $\mathrm{HF} = \frac{\text{Collateral Value} \times L}{\text{Debt Value}}$

If HF drops below 1.0, the position becomes liquidatable, resulting in:
- Forced liquidation with penalties
- Loss of user capital
- Potential bad debt for the protocol

**Our goal:** Detect risk early and rebalance *before* liquidation.

---

## Trigger Threshold

We define a **rebalance trigger threshold** to act proactively:

- **Trigger:** HF < 1.15
- **Rationale:** Provides safety buffer above liquidation threshold (HF = 1.0)
- **Action:** Generate and execute rebalancing plan immediately

This 15% cushion accounts for:
- Execution delay and gas
- Further price slippage during execution
- Market volatility spikes

---

## Objective

**Primary Goal:** Restore HF to **1.25** (target safety level)

---

## Rebalancing Strategy

### Constraints

We **cannot assume**:
- Fresh collateral deposits from users (they may be unavailable during crash)
- External capital injection
- Ability to pause market activity

### Approach

The only reliable tool during a crash is **debt reduction via collateral liquidation**:

1. **Sell a portion of existing collateral** (amount $x$ to be determined)
2. **Swap to debt asset** (accounting for DEX slippage)
3. **Repay debt** with swap proceeds

**Effect:** Debt decreases → HF increases (collateral value matters less when debt is lower)

### Mathematical Solution

We solve for collateral amount $x$ to sell:

**Target condition:**
$$T = \frac{(C - x) \cdot P_c \cdot L}{D \cdot P_d - x \cdot P_c \cdot (1 - s)}$$

**Algebraic solution:**
$$x = \frac{C \cdot P_c \cdot L - T \cdot D \cdot P_d}{P_c \cdot (L - T \cdot (1 - s))}$$

Where:
- $C$ = current collateral amount
- $P_c$ = collateral price
- $D$ = current debt amount
- $P_d$ = debt token price
- $L$ = liquidation threshold (0.85)
- $T$ = target HF (1.25)
- $s$ = slippage (0.005 = 0.5%)

### Constraints & Validation

- Clamp: $0 < x < C$ (cannot sell more than we have)
- No over-repayment: $D' = D - \frac{x \cdot P_c \cdot (1-s)}{P_d} \geq 0$
- Precision: Use Decimal.js for financial arithmetic

---

## Execution Plan Output

For any vault below threshold, generate a structured execution plan:

### Actions (Sequential)

1. **withdrawCollateral($x$)**
   - Remove calculated collateral amount from vault
   - Must be exact to achieve target HF

2. **swap($x$ collateral → debt asset)**
   - Use exact-output swap for predictability
   - Apply 0.5% slippage protection
   - Route through optimal DEX path (Uniswap V3 in mock)

3. **repayDebt(swap output)**
   - Reduce debt by exact amount received
   - Update vault state

### Atomicity Requirement

**Critical:** All three steps must execute in **one transaction**.

Why?
- Partial execution leaves vault in worse state (collateral withdrawn but debt not repaid)
- Market can move between steps
- Gas failures mid-execution are catastrophic

**Implementation:** Multicall/bundler pattern with ABI-encoded calls

### Plan Metadata

Each plan includes:
- Current state (collateral, debt, HF)
- Step-by-step actions with amounts
- Slippage protection (min amounts)
- Projected outcome (new collateral, debt, HF)
- Gas estimate
- Atomic execution calldata

---

## Implementation Notes

### Gas Optimizations

- Use exact-output swap (cap input, guarantee output)
- Deposit underlying directly to mint bTokens to repay target (save transfer)
- Production: Permit2 to batch approvals

### Testing Strategy

Focus on core correctness:
- Health factor calculation accuracy
- Rebalancing math hits target (1.25)
- Slippage protection prevents over-repayment
- Simulation triggers at correct threshold

---

## Production Considerations

This mock demonstrates the core algorithm. Production would add:

- **Real price feeds:** Chainlink oracles, TWAP
- **Multi-DEX routing:** Aggregators for best execution
- **MEV protection:** Flashbots, private mempools
- **Monitoring:** Alerts, metrics, observability
- **Fallbacks:** Multiple RPC endpoints, retry logic
- **Authorization:** Multi-sig, timelock for critical actions
- **Dynamic Slippage:** Adjust slippage based on market conditions

---

## Summary

**Problem:** Market crashes threaten vault liquidation  
**Solution:** Proactive rebalancing via collateral sale  
**Approach:** Mathematical derivation + atomic execution  
**Output:** Production-ready execution plans with full context  