#!/usr/bin/env python3

import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.models import User, Base
from app.auth import get_password_hash, verify_password

def test_auth():
    """Test authentication system"""
    print("Testing authentication system...")
    
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
            print(f"  - {user.username} ({user.email})")
        
        # Test user creation
        print("\nTesting user creation...")
        test_username = "testuser"
        test_password = "TestPass123!"
        
        # Check if user already exists
        existing_user = db.query(User).filter(User.username == test_username).first()
        if existing_user:
            print(f"User {test_username} already exists")
            print(f"Stored hash: {existing_user.hashed_password}")
        else:
            # Create test user
            hashed_password = get_password_hash(test_password)
            print(f"Generated hash: {hashed_password}")
            
            new_user = User(
                username=test_username,
                email="test@example.com",
                hashed_password=hashed_password,
                full_name="Test User"
            )
            db.add(new_user)
            db.commit()
            db.refresh(new_user)
            print(f"Created user: {new_user.username}")
            
            # Test authentication
            print("\nTesting authentication...")
            if verify_password(test_password, new_user.hashed_password):
                print("✅ Password verification works")
            else:
                print("❌ Password verification failed")
        
    finally:
        db.close()

if __name__ == "__main__":
    test_auth()
