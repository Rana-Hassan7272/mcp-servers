"""
Migration script to add user_id column to all tables
Run this after updating schema.sql
"""

import asyncio
import aiosqlite
from pathlib import Path

DB_DIR = Path(__file__).parent
DB_PATH = DB_DIR / "forex_trading.db"

async def migrate_add_user_id():
    """Add user_id column to all tables"""
    if not DB_PATH.exists():
        print("⚠️  Database not found. Run init_db.py first.")
        return

    async with aiosqlite.connect(DB_PATH) as conn:
        print("🔄 Adding user_id column to tables...")
        
        try:
            # Add user_id to trade_tracker (default to 'default' for existing records)
            await conn.execute("ALTER TABLE trade_tracker ADD COLUMN user_id TEXT DEFAULT 'default'")
            await conn.execute("UPDATE trade_tracker SET user_id = 'default' WHERE user_id IS NULL")
            await conn.execute("CREATE INDEX IF NOT EXISTS idx_trade_tracker_user_id ON trade_tracker(user_id)")
            print("✅ Added user_id to trade_tracker")
        except aiosqlite.OperationalError as e:
            if "duplicate column" in str(e).lower():
                print("✅ user_id already exists in trade_tracker")
            else:
                raise
        
        try:
            # Add user_id to trade_results
            await conn.execute("ALTER TABLE trade_results ADD COLUMN user_id TEXT")
            # Set user_id based on trade_tracker
            await conn.execute("""
                UPDATE trade_results 
                SET user_id = (SELECT user_id FROM trade_tracker WHERE trade_tracker.id = trade_results.trade_id)
                WHERE user_id IS NULL
            """)
            await conn.execute("UPDATE trade_results SET user_id = 'default' WHERE user_id IS NULL")
            await conn.execute("CREATE INDEX IF NOT EXISTS idx_trade_results_user_id ON trade_results(user_id)")
            print("✅ Added user_id to trade_results")
        except aiosqlite.OperationalError as e:
            if "duplicate column" in str(e).lower():
                print("✅ user_id already exists in trade_results")
            else:
                raise
        
        try:
            # Add user_id to analytics
            await conn.execute("ALTER TABLE analytics ADD COLUMN user_id TEXT DEFAULT 'default'")
            await conn.execute("UPDATE analytics SET user_id = 'default' WHERE user_id IS NULL")
            print("✅ Added user_id to analytics")
        except aiosqlite.OperationalError as e:
            if "duplicate column" in str(e).lower():
                print("✅ user_id already exists in analytics")
            else:
                raise
        
        try:
            # Add user_id to risk_monitor
            await conn.execute("ALTER TABLE risk_monitor ADD COLUMN user_id TEXT DEFAULT 'default'")
            await conn.execute("UPDATE risk_monitor SET user_id = 'default' WHERE user_id IS NULL")
            await conn.execute("CREATE INDEX IF NOT EXISTS idx_risk_monitor_user_id ON risk_monitor(user_id)")
            print("✅ Added user_id to risk_monitor")
        except aiosqlite.OperationalError as e:
            if "duplicate column" in str(e).lower():
                print("✅ user_id already exists in risk_monitor")
            else:
                raise
        
        # Create users table if it doesn't exist
        try:
            await conn.execute("""
                CREATE TABLE IF NOT EXISTS users (
                    user_id TEXT PRIMARY KEY,
                    username TEXT NOT NULL UNIQUE,
                    password_hash TEXT NOT NULL,
                    created_at TEXT DEFAULT (datetime('now', 'localtime'))
                )
            """)
            print("✅ Created users table")
        except aiosqlite.OperationalError as e:
            if "already exists" in str(e).lower():
                print("✅ users table already exists")
                # Check if password_hash column exists, if not add it
                try:
                    await conn.execute("ALTER TABLE users ADD COLUMN password_hash TEXT")
                    # For existing users without password, set a default (they'll need to reset)
                    await conn.execute("UPDATE users SET password_hash = 'MIGRATION_NEEDED' WHERE password_hash IS NULL")
                    print("✅ Added password_hash column to users table")
                except aiosqlite.OperationalError as e2:
                    if "duplicate column" in str(e2).lower():
                        print("✅ password_hash column already exists")
                    else:
                        raise
            else:
                raise
        
        await conn.commit()
        print("✅ Migration completed successfully!")

if __name__ == "__main__":
    asyncio.run(migrate_add_user_id())

