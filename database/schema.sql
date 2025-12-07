-- Forex Trading Assistant Database Schema
-- SQLite Database for trade tracking, results, analytics, and risk monitoring

-- Table 0: users
-- Stores user accounts with password authentication
CREATE TABLE IF NOT EXISTS users (
    user_id TEXT PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now', 'localtime'))
);

-- Table 1: trade_tracker
-- Stores all trade entries with entry, TP, SL, lot size, balance, and trade type
CREATE TABLE IF NOT EXISTS trade_tracker (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    entry_price REAL NOT NULL,
    take_profit REAL,
    stop_loss REAL,
    lot_size REAL NOT NULL CHECK(lot_size >= 0.01 AND lot_size <= 0.6),
    balance REAL NOT NULL,
    trade_type TEXT NOT NULL CHECK(trade_type IN ('BUY', 'SELL')),
    currency_pair TEXT DEFAULT 'XAU/USD',
    timeframe TEXT CHECK(timeframe IN ('1m', '3m', '5m', '10m', '15m', '30m', '1h', '2h', '4h', '1d')),
    trade_style TEXT CHECK(trade_style IN ('swing', 'day trade', 'scalp')),
    strategy TEXT,
    risk_reward_ratio TEXT,
    status TEXT DEFAULT 'OPEN' CHECK(status IN ('OPEN', 'CLOSED')),
    timestamp TEXT DEFAULT (datetime('now', 'localtime')),
    notes TEXT
);

-- Table 2: trade_results
-- Stores the outcome of each trade (win/loss) and P/L amount
CREATE TABLE IF NOT EXISTS trade_results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    trade_id INTEGER NOT NULL,
    result TEXT NOT NULL CHECK(result IN ('WIN', 'LOSS')),
    profit_loss REAL NOT NULL,
    timestamp TEXT DEFAULT (datetime('now', 'localtime')),
    notes TEXT,
    FOREIGN KEY (trade_id) REFERENCES trade_tracker(id) ON DELETE CASCADE
);

-- Table 3: analytics
-- Stores precomputed analytics and insights
CREATE TABLE IF NOT EXISTS analytics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    metric_name TEXT NOT NULL,
    metric_value TEXT NOT NULL,
    calculated_at TEXT DEFAULT (datetime('now', 'localtime')),
    period_start TEXT,
    period_end TEXT,
    metadata TEXT
);

-- Table 4: risk_monitor
-- Stores emotional and risk alerts
CREATE TABLE IF NOT EXISTS risk_monitor (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    alert_type TEXT NOT NULL CHECK(alert_type IN ('EMOTIONAL', 'RISK', 'OVERCONFIDENCE', 'REVENGE_TRADING', 'OVERTRADING', 'CONSECUTIVE_LOSSES', 'HIGH_RISK_PER_TRADE', 'DRAWDOWN', 'POOR_RISK_REWARD', 'MISSING_STOP_LOSS', 'ACCOUNT_RISK_PERCENTAGE', 'OTHER')),
    risk_level TEXT NOT NULL CHECK(risk_level IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
    message TEXT NOT NULL,
    timestamp TEXT DEFAULT (datetime('now', 'localtime')),
    acknowledged INTEGER DEFAULT 0 CHECK(acknowledged IN (0, 1))
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_trade_tracker_user_id ON trade_tracker(user_id);
CREATE INDEX IF NOT EXISTS idx_trade_tracker_timestamp ON trade_tracker(timestamp);
CREATE INDEX IF NOT EXISTS idx_trade_tracker_status ON trade_tracker(status);
CREATE INDEX IF NOT EXISTS idx_trade_results_user_id ON trade_results(user_id);
CREATE INDEX IF NOT EXISTS idx_trade_results_trade_id ON trade_results(trade_id);
CREATE INDEX IF NOT EXISTS idx_trade_results_timestamp ON trade_results(timestamp);
CREATE INDEX IF NOT EXISTS idx_risk_monitor_user_id ON risk_monitor(user_id);
CREATE INDEX IF NOT EXISTS idx_risk_monitor_timestamp ON risk_monitor(timestamp);
CREATE INDEX IF NOT EXISTS idx_risk_monitor_acknowledged ON risk_monitor(acknowledged);

