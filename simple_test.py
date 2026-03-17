#!/usr/bin/env python3

import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.models import User, Base

def simple_test():
    """Simple test without bcrypt"""
    print("Testing database connection...")
    
    # Create database connection
    engine = create_engine("sqlite:///./chat.db", connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=engine)
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    db = SessionLocal()
    
    try:
        # Check if users exist
        users = db.query(User).all()
        print(f"Current users in database: {len(users)}")
        for user in users:
            print(f"  - {user.username} ({user.email}) - Active: {user.is_active}")
        
        # Test finding a user
        print("\nTesting user lookup...")
        test_user = db.query(User).filter(User.username == "testuser").first()
        if test_user:
            print(f"✅ Found user: {test_user.username}")
            print(f"  Email: {test_user.email}")
            print(f"  Created: {test_user.created_at}")
            print(f"  Active: {test_user.is_active}")
        else:
            print("❌ User not found")
        
    finally:
        db.close()

if __name__ == "__main__":
    simple_test()
