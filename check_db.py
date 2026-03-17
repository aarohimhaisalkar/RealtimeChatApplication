#!/usr/bin/env python3

import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from sqlalchemy import create_engine, inspect
from sqlalchemy.orm import sessionmaker
from app.models import User, Message, Base

def check_database():
    """Check database structure"""
    print("Checking database structure...")
    
    # Create database connection
    engine = create_engine("sqlite:///./chat.db", connect_args={"check_same_thread": False})
    
    # Create tables
    Base.metadata.create_all(bind=engine)
    
    # Check tables
    inspector = inspect(engine)
    tables = inspector.get_table_names()
    
    print(f"Tables in database: {tables}")
    
    # Check table structures
    for table_name in tables:
        print(f"\nTable: {table_name}")
        columns = inspector.get_columns(table_name)
        for column in columns:
            print(f"  - {column['name']}: {column['type']}")

if __name__ == "__main__":
    check_database()
