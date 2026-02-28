package com.digitalasset.quickstart.umbra;

import com.daml.ledger.api.v2.ValueOuterClass;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.*;
import java.util.concurrent.CompletableFuture;

import static com.digitalasset.quickstart.umbra.ProtoHelper.*;

/**
 * REST API controller for Umbra dark pool and lending protocol.
 */
@RestController
@RequestMapping("/api")
public class UmbraController {

    private static final Logger logger = LoggerFactory.getLogger(UmbraController.class);

    private final UmbraRepository repo;
    private final UmbraLedgerClient ledger;
    private final UmbraConfig config;

    @Autowired
    public UmbraController(UmbraRepository repo, UmbraLedgerClient ledger, UmbraConfig config) {
        this.repo = repo;
        this.ledger = ledger;
        this.config = config;
    }

    // ── Dark Pool Endpoints ────────────────────────────────

    /**
     * GET /api/orderbook → Aggregated order book (no trader info exposed)
     */
    @GetMapping("/orderbook")
    public ResponseEntity<Map<String, Object>> getOrderBook() {
        try {
            return ResponseEntity.ok(repo.getOrderBook());
        } catch (Exception e) {
            logger.error("Failed to get orderbook", e);
            return ResponseEntity.internalServerError().body(Map.<String, Object>of("error", e.getMessage()));
        }
    }

    /**
     * POST /api/orders → Create a new SpotOrder
     * Body: { trader, baseAsset, quoteAsset, side, price, quantity }
     */
    @PostMapping("/orders")
    public CompletableFuture<ResponseEntity<Map<String, Object>>> createOrder(@RequestBody Map<String, Object> body) {
        String trader = (String) body.get("trader");
        String baseAsset = (String) body.get("baseAsset");
        String quoteAsset = (String) body.get("quoteAsset");
        String side = (String) body.get("side");
        double price = Double.parseDouble(String.valueOf(body.get("price")));
        double quantity = Double.parseDouble(String.valueOf(body.get("quantity")));

        // Exercise CreateOrder on the DarkPoolOperator
        return repo.getDarkPoolOperator()
                .map(op -> {
                    String opContractId = (String) op.get("contractId");
                    ValueOuterClass.Value choiceArg = recordVal(
                            field("trader", partyVal(trader)),
                            field("baseAsset", textVal(baseAsset)),
                            field("quoteAsset", textVal(quoteAsset)),
                            field("side", enumVal(side)),
                            field("price", numericVal(price)),
                            field("quantity", numericVal(quantity))
                    );

                    return ledger.exerciseChoiceMulti(
                            opContractId,
                            "Umbra.DarkPool", "DarkPoolOperator",
                            "CreateOrder",
                            choiceArg,
                            List.of(config.getOperatorParty(), trader)
                    ).thenApply(tx -> ResponseEntity.ok(Map.<String, Object>of(
                            "status", "created",
                            "transactionId", tx.getUpdateId()
                    ))).exceptionally(e -> {
                        logger.error("Failed to create order", e);
                        return ResponseEntity.internalServerError()
                                .body(Map.<String, Object>of("error", e.getMessage()));
                    });
                })
                .orElse(CompletableFuture.completedFuture(
                        ResponseEntity.badRequest().body(Map.<String, Object>of("error", "DarkPoolOperator not found"))
                ));
    }

    /**
     * DELETE /api/orders/:id → Cancel a SpotOrder
     */
    @DeleteMapping("/orders/{contractId}")
    public CompletableFuture<ResponseEntity<Map<String, Object>>> cancelOrder(
            @PathVariable String contractId,
            @RequestParam String trader
    ) {
        ValueOuterClass.Value choiceArg = unitVal();

        return ledger.exerciseChoice(
                contractId,
                "Umbra.DarkPool", "SpotOrder",
                "CancelOrder",
                choiceArg,
                trader
        ).thenApply(tx -> ResponseEntity.ok(Map.<String, Object>of(
                "status", "cancelled",
                "transactionId", tx.getUpdateId()
        ))).exceptionally(e -> {
            logger.error("Failed to cancel order", e);
            return ResponseEntity.internalServerError()
                    .body(Map.<String, Object>of("error", e.getMessage()));
        });
    }

    /**
     * GET /api/trades/:trader → Trade confirms for a specific trader
     */
    @GetMapping("/trades/{trader}")
    public ResponseEntity<List<Map<String, Object>>> getTrades(@PathVariable String trader) {
        try {
            return ResponseEntity.ok(repo.getTradesForTrader(trader));
        } catch (Exception e) {
            logger.error("Failed to get trades", e);
            return ResponseEntity.internalServerError().build();
        }
    }

    // ── Lending Endpoints ──────────────────────────────────

    /**
     * GET /api/pool → LendingPool stats
     */
    @GetMapping("/pool")
    public ResponseEntity<Map<String, Object>> getPool() {
        try {
            return repo.getLendingPool()
                    .map(pool -> {
                        @SuppressWarnings("unchecked")
                        Map<String, Object> payload = (Map<String, Object>) pool.get("payload");
                        double totalSupply = Double.parseDouble(String.valueOf(payload.get("totalSupply")));
                        double totalBorrows = Double.parseDouble(String.valueOf(payload.get("totalBorrows")));
                        double utilization = totalSupply == 0 ? 0 : totalBorrows / totalSupply;

                        Map<String, Object> stats = new LinkedHashMap<>();
                        stats.put("contractId", pool.get("contractId"));
                        stats.put("asset", payload.get("asset"));
                        stats.put("totalSupply", totalSupply);
                        stats.put("totalBorrows", totalBorrows);
                        stats.put("utilization", utilization);
                        stats.put("tvl", totalSupply - totalBorrows);
                        stats.put("rateModel", payload.get("rateModel"));
                        stats.put("accumulatedIndex", payload.get("accumulatedIndex"));
                        return ResponseEntity.ok(stats);
                    })
                    .orElse(ResponseEntity.ok(Map.<String, Object>of("error", "No lending pool found")));
        } catch (Exception e) {
            logger.error("Failed to get pool", e);
            return ResponseEntity.internalServerError().body(Map.<String, Object>of("error", e.getMessage()));
        }
    }

    /**
     * POST /api/pool/supply → Supply assets to the lending pool
     * Body: { supplier, amount }
     */
    @PostMapping("/pool/supply")
    public CompletableFuture<ResponseEntity<Map<String, Object>>> supply(@RequestBody Map<String, Object> body) {
        String supplier = (String) body.get("supplier");
        double amount = Double.parseDouble(String.valueOf(body.get("amount")));

        return repo.getLendingPool()
                .map(pool -> {
                    String poolCid = (String) pool.get("contractId");
                    ValueOuterClass.Value choiceArg = recordVal(
                            field("supplier", partyVal(supplier)),
                            field("amount", numericVal(amount))
                    );
                    return ledger.exerciseChoiceMulti(
                            poolCid,
                            "Umbra.Lending", "LendingPool",
                            "Supply",
                            choiceArg,
                            List.of(config.getOperatorParty(), supplier)
                    ).thenApply(tx -> ResponseEntity.ok(Map.<String, Object>of(
                            "status", "supplied",
                            "transactionId", tx.getUpdateId()
                    ))).exceptionally(e -> {
                        logger.error("Supply failed", e);
                        return ResponseEntity.internalServerError()
                                .body(Map.<String, Object>of("error", e.getMessage()));
                    });
                })
                .orElse(CompletableFuture.completedFuture(
                        ResponseEntity.badRequest().body(Map.<String, Object>of("error", "LendingPool not found"))
                ));
    }

    /**
     * POST /api/pool/borrow → Borrow from the lending pool
     * Body: { borrower, borrowAmount, collateralAmount, oracleCid, collateralOracleCid }
     */
    @PostMapping("/pool/borrow")
    public CompletableFuture<ResponseEntity<Map<String, Object>>> borrow(@RequestBody Map<String, Object> body) {
        String borrower = (String) body.get("borrower");
        double borrowAmount = Double.parseDouble(String.valueOf(body.get("borrowAmount")));
        double collateralAmount = Double.parseDouble(String.valueOf(body.get("collateralAmount")));
        String oracleCid = (String) body.get("oracleCid");
        String collateralOracleCid = (String) body.get("collateralOracleCid");

        return repo.getLendingPool()
                .map(pool -> {
                    String poolCid = (String) pool.get("contractId");
                    ValueOuterClass.Value choiceArg = recordVal(
                            field("borrower", partyVal(borrower)),
                            field("borrowAmount", numericVal(borrowAmount)),
                            field("collateralAmount", numericVal(collateralAmount)),
                            field("oracleCid", contractIdVal(oracleCid)),
                            field("collateralOracleCid", contractIdVal(collateralOracleCid))
                    );
                    return ledger.exerciseChoiceMulti(
                            poolCid,
                            "Umbra.Lending", "LendingPool",
                            "Borrow",
                            choiceArg,
                            List.of(config.getOperatorParty(), borrower)
                    ).thenApply(tx -> ResponseEntity.ok(Map.<String, Object>of(
                            "status", "borrowed",
                            "transactionId", tx.getUpdateId()
                    ))).exceptionally(e -> {
                        logger.error("Borrow failed", e);
                        return ResponseEntity.internalServerError()
                                .body(Map.<String, Object>of("error", e.getMessage()));
                    });
                })
                .orElse(CompletableFuture.completedFuture(
                        ResponseEntity.badRequest().body(Map.<String, Object>of("error", "LendingPool not found"))
                ));
    }

    /**
     * POST /api/pool/repay → Repay a borrow position
     * Body: { contractId, repayAmount }
     */
    @PostMapping("/pool/repay")
    public CompletableFuture<ResponseEntity<Map<String, Object>>> repay(@RequestBody Map<String, Object> body) {
        String contractId = (String) body.get("contractId");
        double repayAmount = Double.parseDouble(String.valueOf(body.get("repayAmount")));
        String borrower = (String) body.get("borrower");

        ValueOuterClass.Value choiceArg = recordVal(
                field("repayAmount", numericVal(repayAmount))
        );

        return ledger.exerciseChoice(
                contractId,
                "Umbra.Lending", "BorrowPosition",
                "Repay",
                choiceArg,
                borrower
        ).thenApply(tx -> ResponseEntity.ok(Map.<String, Object>of(
                "status", "repaid",
                "transactionId", tx.getUpdateId()
        ))).exceptionally(e -> {
            logger.error("Repay failed", e);
            return ResponseEntity.internalServerError()
                    .body(Map.<String, Object>of("error", e.getMessage()));
        });
    }

    /**
     * GET /api/positions/:trader → Supply + Borrow positions for trader
     */
    @GetMapping("/positions/{trader}")
    public ResponseEntity<Map<String, Object>> getPositions(@PathVariable String trader) {
        try {
            return ResponseEntity.ok(Map.<String, Object>of(
                    "supply", repo.getSupplyPositions(trader),
                    "borrow", repo.getBorrowPositions(trader)
            ));
        } catch (Exception e) {
            logger.error("Failed to get positions", e);
            return ResponseEntity.internalServerError().body(Map.<String, Object>of("error", e.getMessage()));
        }
    }

    /**
     * GET /api/oracle → Current CC/USD oracle price
     */
    @GetMapping("/oracle")
    public ResponseEntity<Object> getOraclePrice() {
        try {
            var prices = repo.getAllOraclePrices();
            return ResponseEntity.ok(prices);
        } catch (Exception e) {
            logger.error("Failed to get oracle price", e);
            return ResponseEntity.internalServerError().build();
        }
    }
}
