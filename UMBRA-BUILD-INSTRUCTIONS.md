# UMBRA: Dark Pool + Lending Protocol for Canton Network

## Build Instructions for OpenClaw Agent

You are building **Umbra**, a combined dark pool trading and overcollateralized lending application on the Canton Network. This is a DevNet-ready MVP. Follow these phases in order. Do NOT skip steps. After each phase, confirm completion before moving to the next.

---

## PHASE 0: Environment Setup

### 0.1 Prerequisites
```bash
# Check if these are installed
java --version    # Need JDK 17+
node --version    # Need Node.js 18+
npm --version
docker --version  # Need Docker Desktop running
docker compose version
```

If any are missing, install them:
```bash
# macOS (Homebrew)
brew install openjdk@17 node docker
```

### 0.2 Install Daml SDK
```bash
curl -sSL https://get.daml.com/ | sh
daml version  # Confirm installation
```

### 0.3 Clone the Canton Quickstart
```bash
cd ~/projects
git clone https://github.com/digital-asset/cn-quickstart.git umbra
cd umbra
```

### 0.4 Run Quickstart Setup
```bash
make install-daml-sdk  # Installs the correct Daml SDK version
make setup             # Configures local Canton sandbox
make build             # Compiles everything
make start             # Starts local Canton network + sample app
```

Wait for all services to come up (can take 2-5 minutes). Verify with:
```bash
docker ps  # Should see multiple Canton containers running
```

Visit http://localhost:3000 to confirm the sample app loads. Then stop it:
```bash
make stop
```

### 0.5 Understand the Project Structure
The quickstart gives you this structure. Read these files to understand the patterns:
```
umbra/
├── daml/                    # Daml smart contracts (THIS IS WHERE WE BUILD)
│   ├── daml.yaml           # Daml project config
│   └── src/                # Contract source files
├── frontend/               # React frontend
│   └── src/
├── backend/                # Node.js backend (Ledger API client)
├── docker-compose.yml      # Local Canton sandbox config
└── Makefile
```

Study the existing sample app's Daml contracts in `daml/src/` to understand:
- Template structure (signatories, observers, choices)
- CIP-56 token transfer patterns
- Activity marker creation patterns

**IMPORTANT**: Do NOT delete the existing quickstart code yet. Build alongside it first, then replace.

---

## PHASE 1: Daml Smart Contracts

This is the hardest and most critical phase. Daml is a Haskell-derived language for smart contracts. Key concepts:
- **Templates** = smart contract definitions (like classes)
- **Contracts** = instances of templates (like objects)  
- **Signatories** = parties who must authorize contract creation
- **Observers** = parties who can see the contract
- **Controllers** = parties who can execute choices
- **Choices** = actions that can be taken on a contract (consuming or non-consuming)

### Daml Language Basics
```daml
-- Daml uses Haskell syntax
-- Types are capitalized: Party, Int, Decimal, Text, Time, Bool
-- Functions use pattern matching and type signatures
-- Records use curly braces: MyRecord { field1 = value1, field2 = value2 }
-- Lists use square brackets: [1, 2, 3]
-- Optional values: Some x, None
-- Comments use -- for single line, {- -} for multi-line
```

### 1.1 Create Shared Types Module

Create file: `daml/src/Umbra/Types.daml`

```daml
module Umbra.Types where

-- Asset identifiers
data Asset = CC | USDCx
  deriving (Eq, Show, Ord)

-- Order side for dark pool
data Side = Buy | Sell
  deriving (Eq, Show, Ord)

-- Order status
data OrderStatus = Open | Filled | Cancelled | PartiallyFilled
  deriving (Eq, Show, Ord)

-- Price as a decimal (CC per USDCx)
type Price = Decimal

-- Quantity as a decimal
type Quantity = Decimal

-- Unique order identifier
type OrderId = Text

-- Unique position identifier  
type PositionId = Text

-- Interest rate model parameters
data RateModelParams = RateModelParams
  with
    baseRate : Decimal        -- Base interest rate (e.g., 0.02 = 2%)
    multiplierPerUtil : Decimal  -- Rate increase per unit utilization below kink
    kinkUtilization : Decimal    -- Utilization threshold (e.g., 0.80 = 80%)
    jumpMultiplier : Decimal     -- Rate increase per unit utilization above kink
  deriving (Eq, Show)

-- Default rate model (similar to Aave's)
defaultRateModel : RateModelParams
defaultRateModel = RateModelParams
  with
    baseRate = 0.02
    multiplierPerUtil = 0.10
    kinkUtilization = 0.80
    jumpMultiplier = 0.75
```

### 1.2 Create Dark Pool Module

Create file: `daml/src/Umbra/DarkPool.daml`

This is a private orderbook. Only the operator and the individual trader can see each order. When two orders cross (buy price >= sell price), they match atomically.

```daml
module Umbra.DarkPool where

import Umbra.Types
import DA.Time
import DA.Optional
import DA.List

-- The operator (you) who runs the matching engine
template DarkPoolOperator
  with
    operator : Party
  where
    signatory operator

    -- Create a new spot order
    nonconsuming choice CreateOrder : ContractId SpotOrder
      with
        trader : Party
        orderId : OrderId
        side : Side
        price : Price       -- Price in USDCx per CC
        quantity : Quantity  -- Amount of CC
        expiry : Optional Time
      controller operator, trader
      do
        now <- getTime
        create SpotOrder with
          operator
          trader
          orderId
          side
          price
          quantity
          remainingQty = quantity
          status = Open
          createdAt = now
          expiry

-- Individual spot order - only visible to operator + trader
template SpotOrder
  with
    operator : Party
    trader : Party
    orderId : OrderId
    side : Side
    price : Price
    quantity : Quantity
    remainingQty : Quantity
    status : OrderStatus
    createdAt : Time
    expiry : Optional Time
  where
    signatory operator, trader
    observer operator

    -- Cancel an order
    choice CancelOrder : ContractId SpotOrder
      controller trader
      do
        create this with
          status = Cancelled
          remainingQty = 0.0

    -- Match two crossing orders (operator executes the match)
    -- This is a consuming choice - the old order is archived
    choice FillOrder : ContractId TradeConfirm
      with
        fillQty : Quantity
        fillPrice : Price
        counterpartyOrderId : OrderId
      controller operator
      do
        -- Validate fill
        assertMsg "Fill quantity must be positive" (fillQty > 0.0)
        assertMsg "Fill quantity exceeds remaining" (fillQty <= remainingQty)
        
        let newRemaining = remainingQty - fillQty
        let newStatus = if newRemaining == 0.0 then Filled else PartiallyFilled
        
        -- If partially filled, create residual order
        when (newRemaining > 0.0) do
          create this with
            remainingQty = newRemaining
            status = PartiallyFilled
          pure ()
        
        -- Create trade confirmation (private to this trader)
        now <- getTime
        create TradeConfirm with
          operator
          trader
          orderId
          counterpartyOrderId
          side
          fillPrice
          fillQty
          timestamp = now

-- Post-trade confirmation receipt
template TradeConfirm
  with
    operator : Party
    trader : Party
    orderId : OrderId
    counterpartyOrderId : OrderId
    side : Side
    fillPrice : Price
    fillQty : Quantity
    timestamp : Time
  where
    signatory operator, trader
    observer operator

    -- Acknowledge and archive
    choice AcknowledgeTrade : ()
      controller trader
      do pure ()
```

**IMPORTANT NOTES FOR DAML:**
- Every `create` returns a `ContractId`. If you don't need it, use `_ <-` or wrap in `do` block.
- `assertMsg` is for validation. It takes a message and a Bool.
- `getTime` gets the ledger time.
- `when` is conditional execution that returns `Update ()`.
- Signatories MUST authorize contract creation. Both operator and trader sign orders.
- The privacy model means only signatories and observers see the contract.

### 1.3 Create Lending Pool Module

Create file: `daml/src/Umbra/Lending.daml`

This implements a pool-based lending market. Users supply USDCx to earn interest. Users deposit CC as collateral to borrow USDCx.

```daml
module Umbra.Lending where

import Umbra.Types
import DA.Time

-- The lending pool tracks aggregate state
template LendingPool
  with
    operator : Party
    totalSupplied : Decimal      -- Total USDCx supplied
    totalBorrowed : Decimal      -- Total USDCx borrowed
    interestIndex : Decimal      -- Cumulative interest index (starts at 1.0)
    lastUpdateTime : Time        -- Last time interest was accrued
    rateParams : RateModelParams -- Interest rate curve parameters
    reserveFactor : Decimal      -- Protocol fee on interest (e.g., 0.10 = 10%)
    reserveBalance : Decimal     -- Accumulated protocol fees
  where
    signatory operator

    -- Calculate current utilization rate
    nonconsuming choice GetUtilization : Decimal
      controller operator
      do
        if totalSupplied == 0.0
          then pure 0.0
          else pure (totalBorrowed / totalSupplied)

    -- Calculate current borrow rate based on utilization
    nonconsuming choice GetBorrowRate : Decimal
      controller operator
      do
        util <- exercise self GetUtilization
        let params = rateParams
        if util <= params.kinkUtilization
          then pure (params.baseRate + util * params.multiplierPerUtil)
          else do
            let normalRate = params.baseRate + params.kinkUtilization * params.multiplierPerUtil
            let excessUtil = util - params.kinkUtilization
            pure (normalRate + excessUtil * params.jumpMultiplier)

    -- Accrue interest (should be called before any state change)
    choice AccrueInterest : ContractId LendingPool
      controller operator
      do
        now <- getTime
        borrowRate <- exercise self GetBorrowRate
        
        -- Calculate time elapsed in years (approximate)
        let elapsedMicros = convertRelTimeToMicroseconds (now `subTime` lastUpdateTime)
        let elapsedYears = intToDecimal elapsedMicros / (365.25 * 24.0 * 3600.0 * 1000000.0)
        
        -- Simple interest accrual
        let interestAccrued = totalBorrowed * borrowRate * elapsedYears
        let reserveShare = interestAccrued * reserveFactor
        
        create this with
          totalSupplied = totalSupplied + interestAccrued - reserveShare
          interestIndex = interestIndex * (1.0 + borrowRate * elapsedYears)
          lastUpdateTime = now
          reserveBalance = reserveBalance + reserveShare

    -- Supply USDCx to the pool
    choice Supply : (ContractId LendingPool, ContractId SupplyPosition)
      with
        supplier : Party
        amount : Decimal
      controller operator, supplier
      do
        assertMsg "Supply amount must be positive" (amount > 0.0)
        
        -- Accrue interest first
        updatedPool <- exercise self AccrueInterest
        poolData <- fetch updatedPool
        
        now <- getTime
        position <- create SupplyPosition with
          operator
          supplier
          amount
          entryIndex = poolData.interestIndex
          depositTime = now
        
        newPool <- create poolData with
          totalSupplied = poolData.totalSupplied + amount
        
        pure (newPool, position)

    -- Borrow USDCx against CC collateral
    choice Borrow : (ContractId LendingPool, ContractId BorrowPosition)
      with
        borrower : Party
        collateralAmountCC : Decimal  -- CC deposited as collateral
        borrowAmountUSDCx : Decimal   -- USDCx to borrow
        ccPriceUSD : Decimal          -- Current CC price from oracle
      controller operator, borrower
      do
        assertMsg "Borrow amount must be positive" (borrowAmountUSDCx > 0.0)
        assertMsg "Collateral must be positive" (collateralAmountCC > 0.0)
        
        -- Check collateralization: collateral value * max LTV >= borrow amount
        -- Max LTV = 55% for CC collateral
        let collateralValueUSD = collateralAmountCC * ccPriceUSD
        let maxBorrow = collateralValueUSD * 0.55
        assertMsg "Insufficient collateral (need 55% LTV)" (borrowAmountUSDCx <= maxBorrow)
        
        -- Check pool has enough liquidity
        updatedPool <- exercise self AccrueInterest
        poolData <- fetch updatedPool
        let availableLiquidity = poolData.totalSupplied - poolData.totalBorrowed
        assertMsg "Insufficient pool liquidity" (borrowAmountUSDCx <= availableLiquidity)
        
        now <- getTime
        position <- create BorrowPosition with
          operator
          borrower
          collateralCC = collateralAmountCC
          debtUSDCx = borrowAmountUSDCx
          entryIndex = poolData.interestIndex
          liquidationThreshold = 0.65  -- Liquidate if LTV exceeds 65%
          borrowTime = now
        
        newPool <- create poolData with
          totalBorrowed = poolData.totalBorrowed + borrowAmountUSDCx
        
        pure (newPool, position)

-- Tracks a supplier's deposit
template SupplyPosition
  with
    operator : Party
    supplier : Party
    amount : Decimal
    entryIndex : Decimal    -- Index at time of deposit (for interest calc)
    depositTime : Time
  where
    signatory operator, supplier

    -- Withdraw (partial or full)
    choice Withdraw : Optional (ContractId SupplyPosition)
      with
        withdrawAmount : Decimal
      controller operator, supplier
      do
        assertMsg "Withdraw amount must be positive" (withdrawAmount > 0.0)
        assertMsg "Cannot withdraw more than deposited" (withdrawAmount <= amount)
        
        let remaining = amount - withdrawAmount
        if remaining > 0.0
          then do
            pos <- create this with amount = remaining
            pure (Some pos)
          else pure None

-- Tracks a borrower's loan
template BorrowPosition
  with
    operator : Party
    borrower : Party
    collateralCC : Decimal
    debtUSDCx : Decimal
    entryIndex : Decimal
    liquidationThreshold : Decimal
    borrowTime : Time
  where
    signatory operator, borrower

    -- Calculate health factor
    nonconsuming choice GetHealthFactor : Decimal
      with
        currentCCPrice : Decimal
        currentIndex : Decimal
      controller operator
      do
        -- Debt grows with interest index
        let currentDebt = debtUSDCx * (currentIndex / entryIndex)
        let collateralValue = collateralCC * currentCCPrice
        if currentDebt == 0.0
          then pure 999.0  -- No debt = healthy
          else pure (collateralValue * liquidationThreshold / currentDebt)

    -- Repay loan (partial or full)
    choice Repay : Optional (ContractId BorrowPosition)
      with
        repayAmount : Decimal
        currentIndex : Decimal
      controller operator, borrower
      do
        let currentDebt = debtUSDCx * (currentIndex / entryIndex)
        assertMsg "Repay exceeds debt" (repayAmount <= currentDebt)
        
        let remainingDebt = currentDebt - repayAmount
        if remainingDebt > 0.001  -- Dust threshold
          then do
            pos <- create this with
              debtUSDCx = remainingDebt
              entryIndex = currentIndex
            pure (Some pos)
          else pure None  -- Loan fully repaid, release collateral

    -- Liquidation (when health factor < 1.0)
    choice Liquidate : ()
      with
        liquidator : Party
        currentCCPrice : Decimal
        currentIndex : Decimal
      controller operator
      do
        healthFactor <- exercise self GetHealthFactor with
          currentCCPrice
          currentIndex
        assertMsg "Position is healthy, cannot liquidate" (healthFactor < 1.0)
        
        -- In production: transfer collateral to liquidator with discount
        -- For MVP: just archive the position (operator handles settlement off-chain)
        pure ()
```

### 1.4 Create Oracle Module

Create file: `daml/src/Umbra/Oracle.daml`

```daml
module Umbra.Oracle where

import DA.Time

-- Oracle price feed for CC/USD
template OraclePrice
  with
    operator : Party
    ccPriceUSD : Decimal    -- e.g., 0.16 = $0.16 per CC
    lastUpdate : Time
    source : Text           -- e.g., "chainlink" or "redstone"
  where
    signatory operator

    -- Update price (operator-only, consumes old price)
    choice UpdatePrice : ContractId OraclePrice
      with
        newPrice : Decimal
      controller operator
      do
        now <- getTime
        assertMsg "Price must be positive" (newPrice > 0.0)
        create this with
          ccPriceUSD = newPrice
          lastUpdate = now
```

### 1.5 Create Activity Marker Module

Create file: `daml/src/Umbra/ActivityMarker.daml`

This is how you earn CC rewards from the Canton Network. Every meaningful transaction should create an activity marker.

```daml
module Umbra.ActivityMarker where

import DA.Time

-- Wraps Canton's FeaturedAppActivityMarker pattern
-- In production, this would integrate with the actual CIP activity marker interface
-- For DevNet MVP, we create our own tracking template
template ActivityRecord
  with
    operator : Party
    user : Party
    action : Text           -- e.g., "spot_order", "supply", "borrow", "match"
    weight : Decimal        -- Activity weight for reward calculation
    timestamp : Time
  where
    signatory operator
    observer user

    -- Auto-archive after processing
    choice ProcessMarker : ()
      controller operator
      do pure ()
```

### 1.6 Update daml.yaml

Edit the `daml/daml.yaml` file to include your new modules. The exact format depends on what the quickstart generated, but ensure the `source` directory includes your new files and the module list includes:
- Umbra.Types
- Umbra.DarkPool
- Umbra.Lending
- Umbra.Oracle
- Umbra.ActivityMarker

### 1.7 Compile and Test

```bash
cd daml/
daml build
```

Fix any compilation errors. Common issues:
- Missing imports (add `import DA.Optional`, `import DA.Time`, etc.)
- Type mismatches (Daml is strictly typed)
- Missing `do` blocks in choices
- Indentation errors (Daml uses significant whitespace like Haskell)

Then write Daml Script tests:

Create file: `daml/src/Umbra/Test.daml`

```daml
module Umbra.Test where

import Umbra.Types
import Umbra.DarkPool
import Umbra.Lending
import Umbra.Oracle
import DA.Time
import Daml.Script

-- Test dark pool order creation and matching
testDarkPool : Script ()
testDarkPool = script do
  operator <- allocateParty "Operator"
  alice <- allocateParty "Alice"
  bob <- allocateParty "Bob"
  
  -- Create dark pool operator
  poolOp <- submit operator do
    createCmd DarkPoolOperator with operator
  
  -- Alice places a buy order: 100 CC at $0.15
  aliceOrder <- submitMulti [operator, alice] [] do
    exerciseCmd poolOp CreateOrder with
      trader = alice
      orderId = "order-001"
      side = Buy
      price = 0.15
      quantity = 100.0
      expiry = None
  
  -- Bob places a sell order: 100 CC at $0.14 (crosses with Alice's buy)
  bobOrder <- submitMulti [operator, bob] [] do
    exerciseCmd poolOp CreateOrder with
      trader = bob
      orderId = "order-002"
      side = Sell
      price = 0.14
      quantity = 100.0
      expiry = None
  
  -- Operator matches at midpoint $0.145
  aliceTrade <- submit operator do
    exerciseCmd aliceOrder FillOrder with
      fillQty = 100.0
      fillPrice = 0.145
      counterpartyOrderId = "order-002"
  
  bobTrade <- submit operator do
    exerciseCmd bobOrder FillOrder with
      fillQty = 100.0
      fillPrice = 0.145
      counterpartyOrderId = "order-001"
  
  pure ()

-- Test lending pool supply and borrow
testLending : Script ()
testLending = script do
  operator <- allocateParty "Operator"
  alice <- allocateParty "Alice"    -- Supplier
  bob <- allocateParty "Bob"        -- Borrower
  
  now <- getTime
  
  -- Create lending pool
  pool <- submit operator do
    createCmd LendingPool with
      operator
      totalSupplied = 0.0
      totalBorrowed = 0.0
      interestIndex = 1.0
      lastUpdateTime = now
      rateParams = defaultRateModel
      reserveFactor = 0.10
      reserveBalance = 0.0
  
  -- Create oracle price
  oracle <- submit operator do
    createCmd OraclePrice with
      operator
      ccPriceUSD = 0.16
      lastUpdate = now
      source = "test"
  
  -- Alice supplies 10,000 USDCx
  (pool2, alicePosition) <- submitMulti [operator, alice] [] do
    exerciseCmd pool Supply with
      supplier = alice
      amount = 10000.0
  
  -- Bob borrows 500 USDCx with 5000 CC collateral
  -- Collateral value: 5000 * 0.16 = $800
  -- Max borrow at 55% LTV: $800 * 0.55 = $440
  -- Wait - 500 > 440, this should fail. Let's use more collateral.
  -- Need: 500 / 0.55 / 0.16 = 5681.82 CC minimum
  (pool3, bobPosition) <- submitMulti [operator, bob] [] do
    exerciseCmd pool2 Borrow with
      borrower = bob
      collateralAmountCC = 6000.0
      borrowAmountUSDCx = 500.0
      ccPriceUSD = 0.16
  
  -- Check Bob's health factor
  healthFactor <- submit operator do
    exerciseCmd bobPosition GetHealthFactor with
      currentCCPrice = 0.16
      currentIndex = 1.0
  
  -- Health factor should be > 1.0 (healthy)
  assertMsg "Bob should be healthy" (healthFactor > 1.0)
  
  pure ()
```

Run tests:
```bash
daml test
```

All tests must pass before moving to Phase 2.

---

## PHASE 2: Backend (Node.js / Python)

The backend connects to the Canton Ledger API via gRPC and handles:
- Order matching engine (polls orders, finds crosses, executes matches)
- Oracle price updates (polls external price feed, updates on-chain oracle)
- Liquidation monitor (checks health factors, triggers liquidations)
- REST API for the frontend

### 2.1 Backend Architecture

Create the backend in the `backend/` directory. Use the quickstart's existing backend as a starting point.

The key integration point is the **Ledger API**. The quickstart already has a gRPC client configured. You need to:

1. **Submit commands** to create/exercise contracts (create orders, match orders, supply, borrow)
2. **Read active contracts** by template type (get all open orders, all positions)
3. **Subscribe to transaction events** for real-time updates

### 2.2 Oracle Price Service

Create a script that runs every 5 minutes to update the on-chain CC price:

```javascript
// backend/src/oracle.js
// Polls CoinGecko or similar for CC/USD price
// Submits UpdatePrice choice to OraclePrice contract

const PRICE_UPDATE_INTERVAL = 5 * 60 * 1000; // 5 minutes

async function fetchCCPrice() {
  // For DevNet: Use a mock price or poll from Canton's own price feed
  // For MainNet: Use Chainlink or RedStone oracle
  // CC is listed on some exchanges - check CoinGecko API
  
  // DevNet mock: fluctuate around $0.16
  const basePrice = 0.16;
  const noise = (Math.random() - 0.5) * 0.02; // +/- 1 cent
  return basePrice + noise;
}

async function updateOraclePrice(ledgerClient, operatorParty, oracleContractId) {
  const newPrice = await fetchCCPrice();
  
  await ledgerClient.exercise(
    oracleContractId,
    'UpdatePrice',
    { newPrice: newPrice.toString() },
    operatorParty
  );
  
  console.log(`Oracle updated: CC = $${newPrice.toFixed(4)}`);
}

// Run on interval
setInterval(() => updateOraclePrice(client, operator, oracleCid), PRICE_UPDATE_INTERVAL);
```

### 2.3 Matching Engine

The dark pool matching engine runs as a backend service:

```javascript
// backend/src/matcher.js
// Pseudocode - adapt to actual Ledger API client

async function runMatchingEngine(ledgerClient, operatorParty) {
  // 1. Fetch all active SpotOrder contracts
  const orders = await ledgerClient.getActiveContracts('Umbra.DarkPool:SpotOrder');
  
  // 2. Separate buys and sells
  const buys = orders.filter(o => o.payload.side === 'Buy').sort((a, b) => b.payload.price - a.payload.price);   // Highest first
  const sells = orders.filter(o => o.payload.side === 'Sell').sort((a, b) => a.payload.price - b.payload.price);  // Lowest first
  
  // 3. Find crossing orders (buy price >= sell price)
  for (const buy of buys) {
    for (const sell of sells) {
      if (buy.payload.price >= sell.payload.price && buy.payload.remainingQty > 0 && sell.payload.remainingQty > 0) {
        // Match at midpoint
        const matchPrice = (parseFloat(buy.payload.price) + parseFloat(sell.payload.price)) / 2;
        const matchQty = Math.min(parseFloat(buy.payload.remainingQty), parseFloat(sell.payload.remainingQty));
        
        // Execute FillOrder on both sides
        await ledgerClient.exercise(buy.contractId, 'FillOrder', {
          fillQty: matchQty.toString(),
          fillPrice: matchPrice.toString(),
          counterpartyOrderId: sell.payload.orderId
        }, operatorParty);
        
        await ledgerClient.exercise(sell.contractId, 'FillOrder', {
          fillQty: matchQty.toString(),
          fillPrice: matchPrice.toString(),
          counterpartyOrderId: buy.payload.orderId
        }, operatorParty);
        
        console.log(`Matched: ${matchQty} CC @ $${matchPrice}`);
      }
    }
  }
}

// Run every 2 seconds
setInterval(() => runMatchingEngine(client, operator), 2000);
```

### 2.4 Liquidation Monitor

```javascript
// backend/src/liquidator.js

async function checkLiquidations(ledgerClient, operatorParty, currentCCPrice, currentIndex) {
  const positions = await ledgerClient.getActiveContracts('Umbra.Lending:BorrowPosition');
  
  for (const pos of positions) {
    const healthFactor = await ledgerClient.exercise(
      pos.contractId,
      'GetHealthFactor',
      { currentCCPrice: currentCCPrice.toString(), currentIndex: currentIndex.toString() },
      operatorParty
    );
    
    if (parseFloat(healthFactor) < 1.0) {
      console.log(`LIQUIDATING position: ${pos.contractId}`);
      await ledgerClient.exercise(
        pos.contractId,
        'Liquidate',
        {
          liquidator: operatorParty,
          currentCCPrice: currentCCPrice.toString(),
          currentIndex: currentIndex.toString()
        },
        operatorParty
      );
    }
  }
}

// Run every 30 seconds
setInterval(() => checkLiquidations(client, operator, ccPrice, poolIndex), 30000);
```

### 2.5 REST API

Create Express.js endpoints for the frontend:

```
GET  /api/orderbook          → Active SpotOrders (aggregated by price level, no trader info exposed)
POST /api/orders             → Create new SpotOrder
DEL  /api/orders/:id         → Cancel SpotOrder
GET  /api/trades/:trader     → TradeConfirms for a specific trader
GET  /api/pool               → LendingPool stats (utilization, rates, TVL)
POST /api/pool/supply        → Supply USDCx
POST /api/pool/borrow        → Borrow USDCx against CC
POST /api/pool/repay         → Repay loan
GET  /api/positions/:trader  → SupplyPositions + BorrowPositions for trader
GET  /api/oracle             → Current CC/USD price
```

---

## PHASE 3: React Frontend

### 3.1 App Structure

Two main tabs/pages:
1. **Trade** — Dark pool orderbook + order entry
2. **Lend** — Supply/borrow dashboard

### 3.2 Trade Page

Components needed:
- **Orderbook Display**: Aggregated price levels (buy side green, sell side red). Show depth at each level. Do NOT show individual trader identities.
- **Order Entry Form**: Side (Buy/Sell toggle), Price input, Quantity input, Submit button
- **My Orders**: List of user's active orders with cancel buttons
- **Recent Trades**: List of user's filled trades
- **Price Chart**: Simple line chart of recent match prices (use Recharts)

### 3.3 Lend Page

Components needed:
- **Pool Stats Dashboard**: 
  - Total USDCx Supplied
  - Total USDCx Borrowed
  - Utilization Rate (% bar)
  - Current Supply APY
  - Current Borrow APY
  - CC Price (from oracle)
- **Supply Section**: Amount input, Supply button, current user's supply positions with withdraw buttons
- **Borrow Section**: CC collateral input, USDCx borrow amount input, shows max borrowable, health factor preview, Borrow button
- **My Positions**: Active supply and borrow positions with health factors

### 3.4 Design Guidelines

- Dark theme (fits "Umbra" shadow branding)
- Color palette: Deep navy (#0a0e1a), purple accents (#7c3aed), green for buys/healthy (#22c55e), red for sells/danger (#ef4444)
- Clean, minimal UI — institutional feel, not DeFi-degen
- Use the quickstart's existing React setup (likely Vite + React)
- Use Tailwind CSS for styling
- Use Recharts for charts

### 3.5 Auth Integration

The quickstart uses OIDC auth (likely Auth0 or similar). Each user authenticates and gets a Canton party ID. Use the existing auth flow — don't rebuild it.

---

## PHASE 4: Integration & Testing

### 4.1 Local Testing Checklist

Run through each scenario on LocalNet:

**Dark Pool Tests:**
- [ ] Create a buy order → appears in orderbook
- [ ] Create a sell order → appears in orderbook
- [ ] Orders that cross → auto-matched by engine, trade confirms generated
- [ ] Cancel an order → removed from orderbook
- [ ] Partial fills → residual order remains active
- [ ] Expired orders → handled gracefully

**Lending Tests:**
- [ ] Supply USDCx → position created, pool stats updated
- [ ] Borrow against CC → position created, health factor shown
- [ ] Interest accrues over time → supply position value increases
- [ ] Repay partial loan → debt decreases
- [ ] Repay full loan → position closed, collateral released
- [ ] Price drops → health factor decreases
- [ ] Health factor < 1.0 → liquidation triggered

**Integration Tests:**
- [ ] User borrows CC from (future feature) → sells in dark pool → "short" workflow
- [ ] Activity markers created for every transaction
- [ ] Frontend shows real-time updates (WebSocket or polling)

### 4.2 Fix Common Issues

- **Daml authorization errors**: Make sure the right parties are submitting commands. Signatories must sign.
- **Contract not found**: Contract was consumed (archived) by a previous choice. Re-fetch active contracts.
- **Time-related errors**: Ledger time might not advance in sandbox. Use `advanceTime` in tests.

---

## PHASE 5: DevNet Preparation

### 5.1 Pre-DevNet Checklist

- [ ] All Daml contracts compile cleanly (`daml build`)
- [ ] All Daml Script tests pass (`daml test`)
- [ ] Backend starts without errors
- [ ] Frontend renders and connects to backend
- [ ] Matching engine processes orders correctly
- [ ] Oracle price updates work
- [ ] Liquidation monitor triggers correctly

### 5.2 Configuration for DevNet

When ready for DevNet deployment (Wilson's validator friend handles network access):

1. **Get a fixed egress IP** — use a cloud VM (DigitalOcean $5/month) or validator friend's VPN
2. **Validator friend submits IP** for Super Validator whitelisting (2-7 day wait)
3. **Set up OIDC auth** — Auth0 free tier (dev-xxxx.us.auth0.com)
4. **Get onboarding secret** — auto-generated on DevNet via POST to SV endpoint
5. **Deploy** — Docker compose from Splice, install compiled DARs
6. **Test on DevNet** — real Canton infrastructure, free tap-able CC

### 5.3 Compile DARs for Deployment

```bash
cd daml/
daml build
# Output: .daml/dist/umbra-0.1.0.dar
```

This `.dar` file is what gets deployed to DevNet.

### 5.4 Environment Variables for DevNet

Create a `.env.devnet` file:
```
CANTON_LEDGER_HOST=<devnet-sv-endpoint>
CANTON_LEDGER_PORT=443
CANTON_AUTH_URL=https://dev-xxxx.us.auth0.com
CANTON_AUTH_CLIENT_ID=<from-auth0>
ORACLE_PRICE_SOURCE=coingecko  # or redstone
MATCHING_ENGINE_INTERVAL_MS=2000
LIQUIDATION_CHECK_INTERVAL_MS=30000
```

---

## KEY REFERENCES

- **Canton Quickstart**: https://github.com/digital-asset/cn-quickstart
- **Daml Documentation**: https://docs.daml.com
- **Daml Standard Library**: https://docs.daml.com/daml/stdlib/index.html
- **Canton Ledger API**: https://docs.daml.com/app-dev/grpc/index.html
- **CIP-56 Token Standard**: Search Canton docs for "CIP-56" transfer patterns
- **Canton DevNet Onboarding**: https://docs.dev.sync.global/validator_operator/validator_onboarding.html
- **Featured App Activity Markers**: Reference cn-quickstart sample app's implementation
- **Canton Core Academy**: https://earn.stackup.dev/learn/pathways/canton-and-daml-fundamentals-328a

---

## IMPORTANT NOTES

1. **Daml is the bottleneck.** It's a niche language and LLMs have limited training data on it. Compile frequently (`daml build`) and paste errors back to iterate. Use tight feedback loops.

2. **Don't rebuild infrastructure.** The cn-quickstart gives you Docker configs, Canton sandbox, auth setup, and Ledger API clients. Use them. Only replace the business logic (Daml contracts) and frontend.

3. **CIP-56 token transfers** are how actual CC and USDCx move on Canton. The contracts above track positions logically, but actual token settlement requires integrating with Canton's CIP-56 Offer-Accept pattern. For DevNet MVP, you can track positions in contracts and handle actual token movement as a Phase 2 enhancement.

4. **Privacy is automatic.** Canton's sub-transaction privacy model means only signatories and observers see each contract. You don't need to build privacy — it's built into the platform. This is the dark pool's competitive advantage.

5. **Activity markers = revenue.** Every transaction that creates an ActivityRecord contributes to the app's weight in the Featured App reward pool. More transactions = more CC rewards. The matching engine running every 2 seconds + oracle updates every 5 minutes + lending interactions = high transaction density.

6. **Zero trading fees** is the competitive moat. Revenue comes from Featured App CC rewards, not from charging users. This makes Umbra attractive vs every other Canton exchange that charges fees.

7. **Start with Daml Core Academy** if you haven't already. Even 5-10 hours of the StackUp quests will make the Daml code above much more comprehensible: https://earn.stackup.dev/learn/pathways/canton-and-daml-fundamentals-328a
