"""
Database module for Forex Trading Assistant
Provides async database initialization and connection utilities
Uses aiosqlite for async compatibility with FastMCP and Streamlit
"""

from .init_db import init_database, get_db_connection, ensure_database

__all__ = ['init_database', 'get_db_connection', 'ensure_database']

