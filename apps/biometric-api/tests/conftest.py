"""
Root conftest for the biometric-api test suite.

Sets the DATABASE_URL environment variable before any module is imported so
that HexCore's LazyConfig (which reads config.py at import time) does not
raise a ValidationError in unit tests that don't need a real database.
"""
import os

os.environ.setdefault(
    "DATABASE_URL",
    "postgresql://test:test@127.0.0.1:1/none",
)
