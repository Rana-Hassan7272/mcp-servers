"""
FastMCP Server for Forex Trading Assistant
Provides tools for trade tracking, results logging, analytics, and risk monitoring
"""

import sys
from pathlib import Path

# Add parent directory to path for imports
# This ensures imports work when running directly or as a module
parent_dir = Path(__file__).parent.parent
if str(parent_dir) not in sys.path:
    sys.path.insert(0, str(parent_dir))

from fastmcp import FastMCP
from database import get_db_connection, ensure_database
from typing import Literal
import os
from dotenv import load_dotenv
from datetime import datetime, timedelta
import aiosqlite

# Load environment variables
load_dotenv()

# Create FastMCP server instance
mcp = FastMCP(name="Forex Trading Assistant")


@mcp.tool()
async def save_trade(
    user_id: str,
    entry_price: float,
    take_profit: float | None,
    stop_loss: float | None,
    lot_size: float,
    balance: float,
    trade_type: Literal["BUY", "SELL"],
    currency_pair: str = "XAU/USD",
    timeframe: Literal["1m", "3m", "5m", "10m", "15m", "30m", "1h", "2h", "4h", "1d"] | None = None,
    trade_style: Literal["swing", "day trade", "scalp"] | None = None,
    strategy: str | None = None,
    notes: str | None = None
) -> dict:
    """
    Save a new trade entry to the trade tracker.
    
    IMPORTANT LOT SIZE CALCULATION FOR XAU/USD:
    - Lot size determines profit per $1 price move
    - 0.01 lot = $1 profit per $1 move (1 oz of gold)
    - 0.02 lot = $2 profit per $1 move (2 oz of gold)
    - 0.1 lot = $10 profit per $1 move (10 oz of gold)
    - Formula: Profit = (Price Move) × (Lot Size × 100)
    - Example: Entry 2000, TP 2010, Lot 0.03 → Profit = (2010-2000) × (0.03×100) = 10 × 3 = $30
    
    Args:
        entry_price: The entry price of the trade
        take_profit: Take profit price (optional)
        stop_loss: Stop loss price (optional)
        lot_size: Lot size of the trade (any positive number)
        balance: Current account balance at the time of trade
        trade_type: Type of trade - either "BUY" or "SELL"
        currency_pair: Currency pair being traded (default: "XAU/USD")
        timeframe: Chart timeframe - "1m", "3m", "5m", "10m", "15m", "30m", "1h", "2h", "4h", or "1d" (optional)
        trade_style: Trading style - "swing", "day trade", or "scalp" (optional)
        strategy: Trading strategy/technique - any text description (optional)
        notes: Optional notes about the trade
    
    Returns:
        Dictionary with complete trade details including trade_id, all parameters, and calculated potential profit/loss
    """
    # Validate lot size (any positive number)
    if lot_size <= 0:
        return {
            "error": f"Lot size must be a positive number. Provided: {lot_size}",
            "lot_size": lot_size
        }
    
    await ensure_database()
    async with get_db_connection() as conn:
        # Calculate risk:reward ratio
        risk_reward_ratio = None
        if take_profit and stop_loss and entry_price:
            if trade_type == "BUY":
                profit_distance = abs(take_profit - entry_price)
                risk_distance = abs(entry_price - stop_loss)
            else:  # SELL
                profit_distance = abs(entry_price - take_profit)
                risk_distance = abs(stop_loss - entry_price)
            
            if risk_distance > 0:
                ratio = profit_distance / risk_distance
                risk_reward_ratio = f"1:{ratio:.2f}"
        
        # Ensure user exists
        await conn.execute(
            "INSERT OR IGNORE INTO users (user_id, username) VALUES (?, ?)",
            (user_id, user_id)
        )
        
        cursor = await conn.execute(
            """
            INSERT INTO trade_tracker 
            (user_id, entry_price, take_profit, stop_loss, lot_size, balance, trade_type, currency_pair, timeframe, trade_style, strategy, risk_reward_ratio, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (user_id, entry_price, take_profit, stop_loss, lot_size, balance, trade_type, currency_pair, timeframe, trade_style, strategy, risk_reward_ratio, notes)
        )
        await conn.commit()
        trade_id = cursor.lastrowid
        
        # Calculate potential profit/loss if TP/SL provided
        potential_profit = None
        potential_loss = None
        if take_profit and entry_price:
            price_move = abs(take_profit - entry_price)
            potential_profit = price_move * (lot_size * 100)
        if stop_loss and entry_price:
            price_move = abs(entry_price - stop_loss)
            potential_loss = price_move * (lot_size * 100)
        
        return {
            "trade_id": trade_id,
            "message": f"Trade #{trade_id} saved successfully",
            "status": "OPEN",
            "entry_price": entry_price,
            "take_profit": take_profit,
            "stop_loss": stop_loss,
            "lot_size": lot_size,
            "balance": balance,
            "trade_type": trade_type,
            "currency_pair": currency_pair,
            "timeframe": timeframe,
            "trade_style": trade_style,
            "strategy": strategy,
            "risk_reward_ratio": risk_reward_ratio,
            "potential_profit": potential_profit,
            "potential_loss": potential_loss,
            "notes": notes
        }


@mcp.tool()
async def log_trade_result(
    user_id: str,
    trade_id: int,
    result: Literal["WIN", "LOSS"],
    notes: str | None = None
) -> dict:
    """
    Log the result of a completed trade (win or loss) and automatically calculate profit/loss.
    The system calculates P/L based on the saved trade's entry price, TP/SL, and lot size.
    You only need to specify WIN or LOSS - the profit/loss amount is calculated automatically.
    
    CALCULATION LOGIC:
    - For WIN: Uses take_profit price if available, otherwise asks for exit price
    - For LOSS: Uses stop_loss price if available, otherwise asks for exit price
    - Formula: P/L = (Price Difference) × (Lot Size × 100)
    - Example: Entry 2000, TP 2010, Lot 0.03, WIN → Profit = (2010-2000) × (0.03×100) = $30
    
    Args:
        trade_id: The ID of the trade to log the result for
        result: The outcome of the trade - either "WIN" or "LOSS"
        notes: Optional notes about the trade result
    
    Returns:
        Dictionary with result_id, calculated profit/loss, confirmation message, and updated trade status
    """
    await ensure_database()
    async with get_db_connection() as conn:
        # Get full trade details including balance (verify user_id matches)
        async with conn.execute(
            """
            SELECT id, entry_price, take_profit, stop_loss, lot_size, balance, status, trade_type
            FROM trade_tracker WHERE id = ? AND user_id = ?
            """,
            (trade_id, user_id)
        ) as cursor:
            trade = await cursor.fetchone()
            if not trade:
                return {
                    "error": f"Trade #{trade_id} not found",
                    "trade_id": trade_id
                }
            
            trade_id_db, entry_price, take_profit, stop_loss, lot_size, balance, status, trade_type = trade
            
            if status == "CLOSED":
                return {
                    "warning": f"Trade #{trade_id} is already closed",
                    "trade_id": trade_id,
                    "status": "CLOSED"
                }
        
        # Calculate profit/loss based on result
        profit_loss = None
        exit_price = None
        
        if result == "WIN":
            if take_profit:
                exit_price = take_profit
                if trade_type == "BUY":
                    price_move = take_profit - entry_price
                else:  # SELL
                    price_move = entry_price - take_profit
                profit_loss = price_move * (lot_size * 100)
            else:
                return {
                    "error": f"Trade #{trade_id} has no take_profit set. Cannot calculate WIN profit automatically.",
                    "trade_id": trade_id,
                    "suggestion": "Please provide exit_price manually or set take_profit when saving the trade."
                }
        else:  # LOSS
            if stop_loss:
                exit_price = stop_loss
                if trade_type == "BUY":
                    price_move = entry_price - stop_loss
                else:  # SELL
                    price_move = stop_loss - entry_price
                profit_loss = -abs(price_move * (lot_size * 100))  # Negative for loss
            else:
                return {
                    "error": f"Trade #{trade_id} has no stop_loss set. Cannot calculate LOSS automatically.",
                    "trade_id": trade_id,
                    "suggestion": "Please provide exit_price manually or set stop_loss when saving the trade."
                }
        
        # Insert into trade_results table
        result_cursor = await conn.execute(
            """
            INSERT INTO trade_results (user_id, trade_id, result, profit_loss, notes)
            VALUES (?, ?, ?, ?, ?)
            """,
            (user_id, trade_id, result, profit_loss, notes)
        )
        await conn.commit()
        result_id = result_cursor.lastrowid
        
        # Calculate new balance
        new_balance = balance + profit_loss
        
        # Update trade_tracker to mark as CLOSED
        await conn.execute(
            "UPDATE trade_tracker SET status = 'CLOSED' WHERE id = ?",
            (trade_id,)
        )
        await conn.commit()
        
        return {
            "result_id": result_id,
            "trade_id": trade_id,
            "message": f"Trade #{trade_id} logged as {result} with P/L: ${profit_loss:.2f}. New balance: ${new_balance:.2f}",
            "result": result,
            "profit_loss": profit_loss,
            "previous_balance": balance,
            "new_balance": new_balance,
            "entry_price": entry_price,
            "exit_price": exit_price,
            "lot_size": lot_size,
            "status": "CLOSED",
            "notes": notes
        }


@mcp.tool()
async def get_trade_insights(
    user_id: str,
    currency_pair: str | None = None,
    timeframe: str | None = None,
    strategy: str | None = None,
    date_filter: str | None = None
) -> dict:
    """
    Get comprehensive analytics and insights from all saved trades.
    Provides performance metrics, win rates, best performing combinations, and trading statistics.
    
    Args:
        currency_pair: Filter by currency pair (optional, e.g., "XAU/USD")
        timeframe: Filter by timeframe (optional, e.g., "1h")
        strategy: Filter by strategy (optional, e.g., "smc")
    
    Returns:
        Dictionary with comprehensive trading analytics including:
        - Trade counts (total, open, closed)
        - Win rate and performance metrics
        - Best performing side (BUY vs SELL)
        - Lot size impact analysis
        - Total profit/loss
        - Average profit/loss per trade
        - Best timeframe performance
        - Best strategy performance
        - Risk:reward ratio analysis
        - Combined best performance (timeframe + strategy)
    """
    await ensure_database()
    async with get_db_connection() as conn:
        # Build filter conditions
        filters = []
        params = []
        if currency_pair:
            filters.append("currency_pair = ?")
            params.append(currency_pair)
        if timeframe:
            filters.append("timeframe = ?")
            params.append(timeframe)
        if strategy:
            filters.append("strategy = ?")
            params.append(strategy)
        
        filter_clause = "WHERE " + " AND ".join(filters) if filters else ""
        
        # 1. Total trades count
        async with conn.execute(
            f"""
            SELECT 
                COUNT(*) as total_trades,
                SUM(CASE WHEN status = 'OPEN' THEN 1 ELSE 0 END) as open_trades,
                SUM(CASE WHEN status = 'CLOSED' THEN 1 ELSE 0 END) as closed_trades
            FROM trade_tracker
            {filter_clause}
            """,
            params
        ) as cursor:
            counts = await cursor.fetchone()
            total_trades, open_trades, closed_trades = counts or (0, 0, 0)
        
        # 2. Win rate and performance metrics
        async with conn.execute(
            f"""
            SELECT 
                COUNT(*) as total_closed,
                SUM(CASE WHEN tr.result = 'WIN' THEN 1 ELSE 0 END) as wins,
                SUM(CASE WHEN tr.result = 'LOSS' THEN 1 ELSE 0 END) as losses,
                SUM(tr.profit_loss) as total_pl,
                AVG(CASE WHEN tr.result = 'WIN' THEN tr.profit_loss ELSE NULL END) as avg_win,
                AVG(CASE WHEN tr.result = 'LOSS' THEN tr.profit_loss ELSE NULL END) as avg_loss
            FROM trade_tracker tt
            INNER JOIN trade_results tr ON tt.id = tr.trade_id
            WHERE tt.status = 'CLOSED' AND tt.user_id = ? {'AND ' + ' AND '.join([f for f in filters if f != 'user_id = ?']) if filters else ''}
            """,
            [user_id] + [p for p in params if p != user_id]
        ) as cursor:
            perf = await cursor.fetchone()
            if perf and perf[0]:
                total_closed, wins, losses, total_pl, avg_win, avg_loss = perf
                win_rate = (wins / total_closed * 100) if total_closed > 0 else 0
            else:
                total_closed, wins, losses, total_pl, avg_win, avg_loss = 0, 0, 0, 0, 0, 0
                win_rate = 0
        
        # 3. Best performing side (BUY vs SELL)
        async with conn.execute(
            f"""
            SELECT 
                tt.trade_type,
                COUNT(*) as total,
                SUM(CASE WHEN tr.result = 'WIN' THEN 1 ELSE 0 END) as wins,
                SUM(tr.profit_loss) as total_pl
            FROM trade_tracker tt
            INNER JOIN trade_results tr ON tt.id = tr.trade_id
            WHERE tt.status = 'CLOSED' {'AND ' + ' AND '.join(filters) if filters else ''}
            GROUP BY tt.trade_type
            """,
            params
        ) as cursor:
            side_perf = await cursor.fetchall()
            buy_stats = {"total": 0, "wins": 0, "win_rate": 0, "total_pl": 0}
            sell_stats = {"total": 0, "wins": 0, "win_rate": 0, "total_pl": 0}
            
            for row in side_perf:
                side, total, wins, total_pl = row
                win_rate_side = (wins / total * 100) if total > 0 else 0
                if side == "BUY":
                    buy_stats = {"total": total, "wins": wins, "win_rate": win_rate_side, "total_pl": total_pl or 0}
                else:
                    sell_stats = {"total": total, "wins": wins, "win_rate": win_rate_side, "total_pl": total_pl or 0}
            
            best_side = "BUY" if buy_stats["win_rate"] > sell_stats["win_rate"] else "SELL" if sell_stats["win_rate"] > buy_stats["win_rate"] else "TIE"
        
        # 4. Lot size impact
        async with conn.execute(
            f"""
            SELECT 
                AVG(CASE WHEN tr.result = 'WIN' THEN tt.lot_size ELSE NULL END) as avg_lot_win,
                AVG(CASE WHEN tr.result = 'LOSS' THEN tt.lot_size ELSE NULL END) as avg_lot_loss
            FROM trade_tracker tt
            INNER JOIN trade_results tr ON tt.id = tr.trade_id
            WHERE tt.status = 'CLOSED' AND tt.user_id = ? {'AND ' + ' AND '.join([f for f in filters if f != 'user_id = ?']) if filters else ''}
            """,
            [user_id] + [p for p in params if p != user_id]
        ) as cursor:
            lot_impact = await cursor.fetchone()
            avg_lot_win = lot_impact[0] if lot_impact and lot_impact[0] else 0
            avg_lot_loss = lot_impact[1] if lot_impact and lot_impact[1] else 0
        
        # 5. Total profit/loss (already calculated above)
        
        # 7. Best timeframe performance
        async with conn.execute(
            f"""
            SELECT 
                tt.timeframe,
                COUNT(*) as total,
                SUM(CASE WHEN tr.result = 'WIN' THEN 1 ELSE 0 END) as wins,
                SUM(tr.profit_loss) as total_pl
            FROM trade_tracker tt
            INNER JOIN trade_results tr ON tt.id = tr.trade_id
            WHERE tt.status = 'CLOSED' AND tt.timeframe IS NOT NULL {'AND ' + ' AND '.join([f for f in filters if 'timeframe' not in f]) if filters and any('timeframe' not in f for f in filters) else '' if not any('timeframe' in f for f in filters) else ''}
            GROUP BY tt.timeframe
            ORDER BY (SUM(CASE WHEN tr.result = 'WIN' THEN 1 ELSE 0 END) * 1.0 / COUNT(*)) DESC, SUM(tr.profit_loss) DESC
            """,
            [p for i, p in enumerate(params) if not (filters[i] if i < len(filters) else '').startswith('timeframe')] if filters else []
        ) as cursor:
            timeframe_perf = await cursor.fetchall()
            best_timeframe = None
            timeframe_stats = []
            for row in timeframe_perf:
                tf, total, wins, total_pl = row
                win_rate_tf = (wins / total * 100) if total > 0 else 0
                timeframe_stats.append({
                    "timeframe": tf,
                    "total_trades": total,
                    "wins": wins,
                    "win_rate": round(win_rate_tf, 2),
                    "total_pl": round(total_pl or 0, 2)
                })
            if timeframe_stats:
                best_timeframe = timeframe_stats[0]["timeframe"]
        
        # 8. Best strategy performance
        async with conn.execute(
            f"""
            SELECT 
                tt.strategy,
                COUNT(*) as total,
                SUM(CASE WHEN tr.result = 'WIN' THEN 1 ELSE 0 END) as wins,
                SUM(tr.profit_loss) as total_pl
            FROM trade_tracker tt
            INNER JOIN trade_results tr ON tt.id = tr.trade_id
            WHERE tt.status = 'CLOSED' AND tt.strategy IS NOT NULL AND tt.strategy != '' {'AND ' + ' AND '.join([f for f in filters if 'strategy' not in f]) if filters and any('strategy' not in f for f in filters) else '' if not any('strategy' in f for f in filters) else ''}
            GROUP BY tt.strategy
            ORDER BY (SUM(CASE WHEN tr.result = 'WIN' THEN 1 ELSE 0 END) * 1.0 / COUNT(*)) DESC, SUM(tr.profit_loss) DESC
            """,
            [p for i, p in enumerate(params) if not (filters[i] if i < len(filters) else '').startswith('strategy')] if filters else []
        ) as cursor:
            strategy_perf = await cursor.fetchall()
            best_strategy = None
            strategy_stats = []
            for row in strategy_perf:
                strat, total, wins, total_pl = row
                win_rate_strat = (wins / total * 100) if total > 0 else 0
                strategy_stats.append({
                    "strategy": strat,
                    "total_trades": total,
                    "wins": wins,
                    "win_rate": round(win_rate_strat, 2),
                    "total_pl": round(total_pl or 0, 2)
                })
            if strategy_stats:
                best_strategy = strategy_stats[0]["strategy"]
        
        # 9. Risk:reward ratio analysis
        async with conn.execute(
            f"""
            SELECT 
                AVG(CASE WHEN tr.result = 'WIN' THEN CAST(REPLACE(tt.risk_reward_ratio, '1:', '') AS REAL) ELSE NULL END) as avg_rr_win,
                AVG(CASE WHEN tr.result = 'LOSS' THEN CAST(REPLACE(tt.risk_reward_ratio, '1:', '') AS REAL) ELSE NULL END) as avg_rr_loss
            FROM trade_tracker tt
            INNER JOIN trade_results tr ON tt.id = tr.trade_id
            WHERE tt.status = 'CLOSED' AND tt.risk_reward_ratio IS NOT NULL {'AND ' + ' AND '.join(filters) if filters else ''}
            """,
            params
        ) as cursor:
            rr_analysis = await cursor.fetchone()
            avg_rr_win = rr_analysis[0] if rr_analysis and rr_analysis[0] else None
            avg_rr_loss = rr_analysis[1] if rr_analysis and rr_analysis[1] else None
        
        # 10. Combined best performance (timeframe + strategy)
        async with conn.execute(
            f"""
            SELECT 
                tt.timeframe,
                tt.strategy,
                COUNT(*) as total,
                SUM(CASE WHEN tr.result = 'WIN' THEN 1 ELSE 0 END) as wins,
                SUM(tr.profit_loss) as total_pl
            FROM trade_tracker tt
            INNER JOIN trade_results tr ON tt.id = tr.trade_id
            WHERE tt.status = 'CLOSED' AND tt.timeframe IS NOT NULL AND tt.strategy IS NOT NULL AND tt.strategy != '' {'AND ' + ' AND '.join([f for f in filters if 'timeframe' not in f and 'strategy' not in f]) if filters and any('timeframe' not in f and 'strategy' not in f for f in filters) else '' if not any('timeframe' in f or 'strategy' in f for f in filters) else ''}
            GROUP BY tt.timeframe, tt.strategy
            ORDER BY (SUM(CASE WHEN tr.result = 'WIN' THEN 1 ELSE 0 END) * 1.0 / COUNT(*)) DESC, SUM(tr.profit_loss) DESC
            LIMIT 5
            """,
            [p for i, p in enumerate(params) if not (filters[i] if i < len(filters) else '').startswith(('timeframe', 'strategy'))] if filters else []
        ) as cursor:
            combined_perf = await cursor.fetchall()
            best_combinations = []
            for row in combined_perf:
                tf, strat, total, wins, total_pl = row
                win_rate_comb = (wins / total * 100) if total > 0 else 0
                best_combinations.append({
                    "timeframe": tf,
                    "strategy": strat,
                    "total_trades": total,
                    "wins": wins,
                    "win_rate": round(win_rate_comb, 2),
                    "total_pl": round(total_pl or 0, 2)
                })
        
        return {
            "summary": {
                "total_trades": total_trades,
                "open_trades": open_trades,
                "closed_trades": closed_trades,
                "total_profit_loss": round(total_pl or 0, 2),
                "win_rate": round(win_rate, 2),
                "wins": wins,
                "losses": losses
            },
            "performance_metrics": {
                "average_profit_per_win": round(avg_win or 0, 2),
                "average_loss_per_loss": round(avg_loss or 0, 2),
                "profit_factor": round(abs(avg_win / avg_loss), 2) if avg_loss and avg_loss != 0 else None
            },
            "best_performing_side": {
                "side": best_side,
                "buy_stats": buy_stats,
                "sell_stats": sell_stats
            },
            "lot_size_impact": {
                "average_lot_size_wins": round(avg_lot_win, 2),
                "average_lot_size_losses": round(avg_lot_loss, 2),
                "difference": round(avg_lot_win - avg_lot_loss, 2)
            },
            "timeframe_performance": {
                "best_timeframe": best_timeframe,
                "all_timeframes": timeframe_stats
            },
            "strategy_performance": {
                "best_strategy": best_strategy,
                "all_strategies": strategy_stats
            },
            "risk_reward_analysis": {
                "average_rr_winning_trades": round(avg_rr_win, 2) if avg_rr_win else None,
                "average_rr_losing_trades": round(avg_rr_loss, 2) if avg_rr_loss else None
            },
            "best_combinations": {
                "top_5_timeframe_strategy_combos": best_combinations
            }
        }


@mcp.tool()
async def check_risk_alerts(
    user_id: str,
    recent_trades_count: int = 10,
    consecutive_loss_threshold: int = 3,
    max_trades_per_hour: int = 5,
    max_risk_per_trade_percent: float = 2.0,
    drawdown_threshold_percent: float = 10.0
) -> dict:
    """
    Monitor trading patterns and generate risk alerts to prevent emotional trading mistakes.
    Analyzes recent trades and detects 10 different risk patterns.
    
    Args:
        recent_trades_count: Number of recent trades to analyze (default: 10)
        consecutive_loss_threshold: Number of consecutive losses to trigger alert (default: 3)
        max_trades_per_hour: Maximum trades per hour before overtrading alert (default: 5)
        max_risk_per_trade_percent: Maximum risk percentage per trade (default: 2.0%)
        drawdown_threshold_percent: Drawdown percentage to trigger alert (default: 10.0%)
    
    Returns:
        Dictionary with all detected risk alerts, their severity levels, and recommendations
    """
    await ensure_database()
    async with get_db_connection() as conn:
        alerts = []
        
        # Get recent closed trades with results (filtered by user_id)
        async with conn.execute(
            """
            SELECT 
                tt.id, tt.entry_price, tt.take_profit, tt.stop_loss, tt.lot_size, 
                tt.balance, tt.trade_type, tt.timestamp, tt.risk_reward_ratio,
                tr.result, tr.profit_loss, tr.timestamp as result_timestamp
            FROM trade_tracker tt
            LEFT JOIN trade_results tr ON tt.id = tr.trade_id
            WHERE tt.status = 'CLOSED' AND tt.user_id = ?
            ORDER BY tt.timestamp DESC
            LIMIT ?
            """,
            (user_id, recent_trades_count * 2)  # Get more to analyze patterns
        ) as cursor:
            recent_trades = await cursor.fetchall()
        
        # Get all open trades (filtered by user_id)
        async with conn.execute(
            """
            SELECT id, entry_price, take_profit, stop_loss, lot_size, balance, 
                   trade_type, timestamp, risk_reward_ratio
            FROM trade_tracker
            WHERE status = 'OPEN' AND user_id = ?
            ORDER BY timestamp DESC
            """
        ) as cursor:
            open_trades = await cursor.fetchall()
        
        if not recent_trades and not open_trades:
            return {
                "alerts": [],
                "message": "No trades found to analyze",
                "total_alerts": 0
            }
        
        # 1. Check for consecutive losses
        consecutive_losses = 0
        for trade in recent_trades[:recent_trades_count]:
            if trade[9] == "LOSS":  # result column
                consecutive_losses += 1
            else:
                break
        
        if consecutive_losses >= consecutive_loss_threshold:
            risk_level = "CRITICAL" if consecutive_losses >= 5 else "HIGH"
            alerts.append({
                "alert_type": "CONSECUTIVE_LOSSES",
                "risk_level": risk_level,
                "message": f"⚠️ {consecutive_losses} consecutive losses detected. Consider taking a break and reviewing your strategy.",
                "details": {"consecutive_losses": consecutive_losses, "threshold": consecutive_loss_threshold}
            })
        
        # 2. Check for revenge trading (multiple trades quickly after a loss)
        if len(recent_trades) >= 2:
            for i in range(len(recent_trades) - 1):
                current_trade = recent_trades[i]
                previous_trade = recent_trades[i + 1]
                
                if previous_trade[9] == "LOSS":  # Previous was a loss
                    # Check if current trade was opened within 1 hour of previous loss
                    try:
                        prev_time = datetime.fromisoformat(previous_trade[11].replace(' ', 'T'))
                        curr_time = datetime.fromisoformat(current_trade[7].replace(' ', 'T'))
                        time_diff = (curr_time - prev_time).total_seconds() / 3600  # hours
                        
                        if time_diff < 1.0:  # Within 1 hour
                            alerts.append({
                                "alert_type": "REVENGE_TRADING",
                                "risk_level": "HIGH",
                                "message": f"⚠️ Revenge trading detected: New trade opened within {time_diff:.1f} hours after a loss. Wait and analyze before trading again.",
                                "details": {"time_since_loss_hours": round(time_diff, 2)}
                            })
                            break
                    except:
                        pass
        
        # 3. Check for overconfidence (winning streak with increasing lot sizes)
        if len(recent_trades) >= 3:
            wins = [t for t in recent_trades[:5] if t[9] == "WIN"]
            if len(wins) >= 3:
                lot_sizes = [w[4] for w in wins]  # lot_size column
                if len(lot_sizes) >= 2 and lot_sizes[0] > lot_sizes[-1] * 1.2:  # 20% increase
                    alerts.append({
                        "alert_type": "OVERCONFIDENCE",
                        "risk_level": "MEDIUM",
                        "message": "⚠️ Overconfidence detected: Winning streak with increasing lot sizes. Maintain consistent position sizing.",
                        "details": {"win_streak": len(wins), "lot_size_increase": f"{(lot_sizes[0]/lot_sizes[-1]-1)*100:.1f}%"}
                    })
        
        # 4. Check for overtrading (too many trades in short period)
        if len(recent_trades) >= max_trades_per_hour:
            try:
                latest_time = datetime.fromisoformat(recent_trades[0][7].replace(' ', 'T'))
                oldest_time = datetime.fromisoformat(recent_trades[max_trades_per_hour-1][7].replace(' ', 'T'))
                time_span = (latest_time - oldest_time).total_seconds() / 3600  # hours
                
                if time_span <= 1.0:  # Within 1 hour
                    alerts.append({
                        "alert_type": "OVERTRADING",
                        "risk_level": "HIGH",
                        "message": f"⚠️ Overtrading detected: {max_trades_per_hour}+ trades within {time_span:.1f} hours. Slow down and be more selective.",
                        "details": {"trades_count": max_trades_per_hour, "time_span_hours": round(time_span, 2)}
                    })
            except:
                pass
        
        # 5. Check risk per trade (lot size vs balance ratio)
        for trade in list(recent_trades[:5]) + list(open_trades[:3]):
            if trade[5] and trade[4]:  # balance and lot_size
                # Calculate risk: assume stop loss distance
                entry = trade[1]
                stop_loss = trade[3]
                lot_size = trade[4]
                balance = trade[5]
                
                if stop_loss and entry:
                    if trade[6] == "BUY":  # trade_type
                        risk_distance = abs(entry - stop_loss)
                    else:
                        risk_distance = abs(stop_loss - entry)
                    
                    risk_amount = risk_distance * (lot_size * 100)
                    risk_percent = (risk_amount / balance * 100) if balance > 0 else 0
                    
                    if risk_percent > max_risk_per_trade_percent:
                        risk_level = "CRITICAL" if risk_percent > 5.0 else "HIGH"
                        alerts.append({
                            "alert_type": "HIGH_RISK_PER_TRADE",
                            "risk_level": risk_level,
                            "message": f"⚠️ High risk per trade: {risk_percent:.2f}% of balance at risk (limit: {max_risk_per_trade_percent}%). Reduce lot size or widen stop loss.",
                            "details": {"risk_percent": round(risk_percent, 2), "risk_amount": round(risk_amount, 2), "trade_id": trade[0]}
                        })
                        break
        
        # 6. Check for drawdown (balance dropping significantly)
        if len(recent_trades) >= 3:
            balances = [t[5] for t in recent_trades if t[5]]  # balance column
            if len(balances) >= 2:
                highest_balance = max(balances)
                current_balance = balances[0]
                drawdown_percent = ((highest_balance - current_balance) / highest_balance * 100) if highest_balance > 0 else 0
                
                if drawdown_percent >= drawdown_threshold_percent:
                    risk_level = "CRITICAL" if drawdown_percent > 20.0 else "HIGH"
                    alerts.append({
                        "alert_type": "DRAWDOWN",
                        "risk_level": risk_level,
                        "message": f"⚠️ Significant drawdown detected: {drawdown_percent:.2f}% from peak balance. Consider reducing risk or taking a break.",
                        "details": {"drawdown_percent": round(drawdown_percent, 2), "peak_balance": highest_balance, "current_balance": current_balance}
                    })
        
        # 7. Emotional state indicators (based on trading patterns)
        if len(recent_trades) >= 5:
            loss_count = sum(1 for t in recent_trades[:5] if t[9] == "LOSS")
            win_count = sum(1 for t in recent_trades[:5] if t[9] == "WIN")
            
            if loss_count >= 4:
                alerts.append({
                    "alert_type": "EMOTIONAL",
                    "risk_level": "HIGH",
                    "message": "⚠️ Emotional trading detected: High loss rate in recent trades. Consider pausing and reviewing your emotional state.",
                    "details": {"recent_losses": loss_count, "recent_wins": win_count}
                })
        
        # 8. Poor risk:reward ratio trades
        poor_rr_trades = []
        for trade in list(recent_trades[:5]) + list(open_trades[:3]):
            rr_ratio = trade[8]  # risk_reward_ratio
            if rr_ratio:
                try:
                    rr_value = float(rr_ratio.replace('1:', ''))
                    if rr_value < 1.0:  # Worse than 1:1
                        poor_rr_trades.append({"trade_id": trade[0], "rr_ratio": rr_ratio, "rr_value": rr_value})
                except:
                    pass
        
        if poor_rr_trades:
            alerts.append({
                "alert_type": "POOR_RISK_REWARD",
                "risk_level": "MEDIUM",
                "message": f"⚠️ Poor risk:reward ratios detected: {len(poor_rr_trades)} trade(s) with R:R worse than 1:1. Aim for at least 1:2.",
                "details": {"poor_rr_trades": poor_rr_trades}
            })
        
        # 9. Missing stop loss
        missing_sl_trades = []
        for trade in list(recent_trades[:5]) + list(open_trades[:3]):
            if not trade[3]:  # stop_loss is None
                missing_sl_trades.append(trade[0])
        
        if missing_sl_trades:
            alerts.append({
                "alert_type": "MISSING_STOP_LOSS",
                "risk_level": "CRITICAL",
                "message": f"⚠️ CRITICAL: {len(missing_sl_trades)} trade(s) without stop loss. Always use stop loss to protect your capital.",
                "details": {"trade_ids": missing_sl_trades}
            })
        
        # 10. Account risk percentage (total open risk vs balance)
        if open_trades:
            total_risk = 0
            current_balance = open_trades[0][5] if open_trades[0][5] else 0
            
            for trade in open_trades:
                entry = trade[1]
                stop_loss = trade[3]
                lot_size = trade[4]
                
                if stop_loss and entry and lot_size:
                    if trade[6] == "BUY":
                        risk_distance = abs(entry - stop_loss)
                    else:
                        risk_distance = abs(stop_loss - entry)
                    
                    risk_amount = risk_distance * (lot_size * 100)
                    total_risk += risk_amount
            
            if current_balance > 0:
                total_risk_percent = (total_risk / current_balance * 100)
                if total_risk_percent > 10.0:  # More than 10% of account at risk
                    risk_level = "CRITICAL" if total_risk_percent > 20.0 else "HIGH"
                    alerts.append({
                        "alert_type": "ACCOUNT_RISK_PERCENTAGE",
                        "risk_level": risk_level,
                        "message": f"⚠️ High total account risk: {total_risk_percent:.2f}% of balance at risk across all open trades. Consider reducing positions.",
                        "details": {"total_risk_percent": round(total_risk_percent, 2), "total_risk_amount": round(total_risk, 2), "open_trades": len(open_trades)}
                    })
        
        # Save alerts to risk_monitor table (skip if database is read-only)
        try:
            for alert in alerts:
                await conn.execute(
                    """
                    INSERT INTO risk_monitor (user_id, alert_type, risk_level, message, acknowledged)
                    VALUES (?, ?, ?, ?, 0)
                    """,
                    (user_id, alert["alert_type"], alert["risk_level"], alert["message"])
                )
            await conn.commit()
        except aiosqlite.OperationalError as e:
            # Database might be read-only in cloud deployments - that's okay
            # We'll still return the alerts, just not save them
            if "readonly" in str(e).lower() or "read-only" in str(e).lower():
                pass  # Silently skip saving if database is read-only
            else:
                raise  # Re-raise if it's a different error
        
        # Sort alerts by risk level (CRITICAL > HIGH > MEDIUM > LOW)
        risk_order = {"CRITICAL": 4, "HIGH": 3, "MEDIUM": 2, "LOW": 1}
        alerts.sort(key=lambda x: risk_order.get(x["risk_level"], 0), reverse=True)
        
        return {
            "alerts": alerts,
            "total_alerts": len(alerts),
            "critical_alerts": sum(1 for a in alerts if a["risk_level"] == "CRITICAL"),
            "high_alerts": sum(1 for a in alerts if a["risk_level"] == "HIGH"),
            "medium_alerts": sum(1 for a in alerts if a["risk_level"] == "MEDIUM"),
            "low_alerts": sum(1 for a in alerts if a["risk_level"] == "LOW"),
            "message": f"Risk analysis complete. Found {len(alerts)} alert(s)."
        }


if __name__ == "__main__":
    # Run the FastMCP server with HTTP transport for remote deployment
    # Compatible with FastMCP cloud and remote servers
    import sys
    
    # Get configuration from environment variables (for FastMCP cloud deployment)
    # or use defaults for local testing
    host = os.getenv("MCP_HOST", "0.0.0.0")  # 0.0.0.0 for remote access
    port = int(os.getenv("MCP_PORT", "8000"))
    path = os.getenv("MCP_PATH", "/mcp")
    
    # Allow override via command line for local testing
    if len(sys.argv) > 1:
        if sys.argv[1] == "--stdio":
            # STDIO mode for local MCP clients
            mcp.run()
        elif sys.argv[1] == "--local":
            # Local HTTP mode (127.0.0.1)
            mcp.run(transport="http", host="127.0.0.1", port=port, path=path)
        else:
            # Custom host:port
            parts = sys.argv[1].split(":")
            if len(parts) == 2:
                host = parts[0]
                port = int(parts[1])
            mcp.run(transport="http", host=host, port=port, path=path)
    else:
        # Default: HTTP transport for remote deployment
        print(f"🚀 Starting FastMCP server on http://{host}:{port}{path}")
        mcp.run(transport="http", host=host, port=port, path=path)

