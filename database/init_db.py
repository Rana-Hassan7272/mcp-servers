"""
Database Initialization Script
Creates and initializes the SQLite database for the Forex Trading Assistant
Uses aiosqlite for async compatibility with FastMCP and Streamlit
"""

import aiosqlite
import asyncio
import os
from pathlib import Path

# Get the directory where this script is located
DB_DIR = Path(__file__).parent
SCHEMA_PATH = DB_DIR / "schema.sql"

# Get database path from environment variable, or use fallback
# FastMCP Cloud: Use /tmp directory (writable) or environment variable
DATABASE_PATH_ENV = os.getenv("DATABASE_PATH")

if DATABASE_PATH_ENV:
    # Use environment variable if set
    DB_PATH = Path(DATABASE_PATH_ENV)
else:
    # Try writable locations in order:
    # 1. /tmp (usually writable on cloud platforms)
    # 2. Current directory (fallback)
    tmp_path = Path("/tmp/forex_trading.db")
    local_path = DB_DIR / "forex_trading.db"
    
    # Prefer /tmp if it exists and is writable, otherwise use local
    try:
        # Test if /tmp is writable
        test_file = Path("/tmp/.test_write")
        test_file.touch()
        test_file.unlink()
        DB_PATH = tmp_path
    except (PermissionError, OSError):
        # /tmp not writable, use local directory
        DB_PATH = local_path


async def init_database():
    """
    Initialize the database by creating tables from schema.sql
    Async function for compatibility with FastMCP and Streamlit
    """
    # Check if schema file exists
    if not SCHEMA_PATH.exists():
        raise FileNotFoundError(f"Schema file not found: {SCHEMA_PATH}")
    
    # Read schema SQL
    with open(SCHEMA_PATH, 'r', encoding='utf-8') as f:
        schema_sql = f.read()
    
    # Connect to database (creates it if it doesn't exist)
    async with aiosqlite.connect(DB_PATH) as conn:
        try:
            # Execute schema SQL
            await conn.executescript(schema_sql)
            await conn.commit()
            print(f"✅ Database initialized successfully at: {DB_PATH}")
            print(f"✅ Tables created: trade_tracker, trade_results, analytics, risk_monitor")
            
            # Verify tables were created
            async with conn.execute("SELECT name FROM sqlite_master WHERE type='table'") as cursor:
                tables = await cursor.fetchall()
                print(f"✅ Verified {len(tables)} tables exist")
                
        except aiosqlite.Error as e:
            print(f"❌ Error initializing database: {e}")
            await conn.rollback()
            raise


async def ensure_database():
    """
    Ensure database exists and is initialized
    """
    if not DB_PATH.exists():
        print("⚠️  Database not found. Initializing...")
        await init_database()


def get_db_connection():
    """
    Get an async database connection context manager
    Returns: aiosqlite.Connection context manager
    
    Usage:
        # First ensure DB exists
        await ensure_database()
        # Then use connection
        async with get_db_connection() as conn:
            await conn.execute(...)
    """
    return aiosqlite.connect(DB_PATH)


if __name__ == "__main__":
    # Run initialization when script is executed directly
    asyncio.run(init_database())

