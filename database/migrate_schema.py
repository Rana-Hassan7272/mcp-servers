"""
Migration script to add new columns to existing trade_tracker table
Run this once to update existing databases
"""
import asyncio
import aiosqlite
from pathlib import Path

DB_DIR = Path(__file__).parent
DB_PATH = DB_DIR / "forex_trading.db"


async def migrate_schema():
    """Add new columns to trade_tracker table if they don't exist"""
    if not DB_PATH.exists():
        print("⚠️  Database not found. Run init_db.py first.")
        return
    
    async with aiosqlite.connect(DB_PATH) as conn:
        # Check which columns exist
        async with conn.execute("PRAGMA table_info(trade_tracker)") as cursor:
            columns = await cursor.fetchall()
            existing_columns = [col[1] for col in columns]
        
        # Add new columns if they don't exist
        migrations = []
        
        if 'timeframe' not in existing_columns:
            migrations.append("ALTER TABLE trade_tracker ADD COLUMN timeframe TEXT CHECK(timeframe IN ('1m', '3m', '5m', '10m', '15m', '30m', '1h', '2h', '4h', '1d'))")
        
        if 'trade_style' not in existing_columns:
            migrations.append("ALTER TABLE trade_tracker ADD COLUMN trade_style TEXT CHECK(trade_style IN ('swing', 'day trade', 'scalp'))")
        
        if 'strategy' not in existing_columns:
            migrations.append("ALTER TABLE trade_tracker ADD COLUMN strategy TEXT")
        
        if 'risk_reward_ratio' not in existing_columns:
            migrations.append("ALTER TABLE trade_tracker ADD COLUMN risk_reward_ratio TEXT")
        
        # Update risk_monitor table to include new alert types
        # SQLite doesn't support modifying CHECK constraints, so we recreate the table
        async with conn.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='risk_monitor'") as cursor:
            risk_monitor_exists = await cursor.fetchone()
        
        if risk_monitor_exists:
            # Backup existing data
            async with conn.execute("SELECT * FROM risk_monitor") as cursor:
                existing_alerts = await cursor.fetchall()
            
            # Drop old table
            await conn.execute("DROP TABLE IF EXISTS risk_monitor")
            
            # Create new table with updated CHECK constraint
            await conn.execute("""
                CREATE TABLE IF NOT EXISTS risk_monitor (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    alert_type TEXT NOT NULL CHECK(alert_type IN ('EMOTIONAL', 'RISK', 'OVERCONFIDENCE', 'REVENGE_TRADING', 'OVERTRADING', 'CONSECUTIVE_LOSSES', 'HIGH_RISK_PER_TRADE', 'DRAWDOWN', 'POOR_RISK_REWARD', 'MISSING_STOP_LOSS', 'ACCOUNT_RISK_PERCENTAGE', 'OTHER')),
                    risk_level TEXT NOT NULL CHECK(risk_level IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
                    message TEXT NOT NULL,
                    timestamp TEXT DEFAULT (datetime('now', 'localtime')),
                    acknowledged INTEGER DEFAULT 0 CHECK(acknowledged IN (0, 1))
                )
            """)
            
            # Restore data (only if alert_type is valid)
            valid_alert_types = ['EMOTIONAL', 'RISK', 'OVERCONFIDENCE', 'REVENGE_TRADING', 'OVERTRADING', 'OTHER']
            for alert in existing_alerts:
                if alert[1] in valid_alert_types:  # alert_type column
                    await conn.execute(
                        "INSERT INTO risk_monitor (alert_type, risk_level, message, timestamp, acknowledged) VALUES (?, ?, ?, ?, ?)",
                        alert[1:]  # Skip id column
                    )
            
            print("✅ Updated risk_monitor table with new alert types")
        
        if migrations:
            print(f"🔄 Running {len(migrations)} migration(s)...")
            for migration in migrations:
                await conn.execute(migration)
                print(f"✅ Executed: {migration[:50]}...")
            await conn.commit()
            print("✅ Migration complete!")
        else:
            print("✅ Database is already up to date.")


if __name__ == "__main__":
    asyncio.run(migrate_schema())

