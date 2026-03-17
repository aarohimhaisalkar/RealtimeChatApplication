#!/usr/bin/env python3

import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.models import User, Base

def test_register():
    """Test user registration without bcrypt"""
    print("Testing user registration...")
    
    # Create database connection
    engine = create_engine("sqlite:///./chat.db", connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=engine)
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    db = SessionLocal()
    
    try:
        # Test user creation
        test_username = "testuser"
        test_email = "test@example.com"
        test_password = "TestPass123!"  # Simple hash for testing
        
        # Check if user already exists
        existing_user = db.query(User).filter(User.username == test_username).first()
        if existing_user:
            print(f"User {test_username} already exists")
        else:
            # Create test user with simple hash (temporary bypass)
            new_user = User(
                username=test_username,
                email=test_email,
                hashed_password="temp_hash_" + test_password,  # Temporary simple hash
                full_name="Test User"
            )
            db.add(new_user)
            db.commit()
            db.refresh(new_user)
            print(f"✅ Created user: {new_user.username}")
            
            # Verify user was saved
            saved_user = db.query(User).filter(User.username == test_username).first()
            if saved_user:
                print(f"✅ Verified user in database: {saved_user.username}")
            else:
                print("❌ User not found after creation")
        
    finally:
        db.close()

if __name__ == "__main__":
    test_register()
