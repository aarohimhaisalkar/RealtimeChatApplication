#!/usr/bin/env python3

import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.database import get_db, create_user, get_user_by_username, get_password_hash
from app.models import User, Base
from app.auth import authenticate_user, verify_password
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

def create_tables():
    """Create database tables"""
    engine = create_engine("sqlite:///./chat.db", connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=engine)
    
    # Get database session
    db = next(get_db())
    
    try:
        # Check if users exist
        users = db.query(User).all()
        print(f"Current users in database: {len(users)}")
        for user in users:
            print(f"  - {user.username} ({user.email})")
        
        # Test user creation
        print("\nTesting user creation...")
        test_username = "testuser"
        test_email = "test@example.com"
        test_password = "TestPass123!"
        
        # Check if user already exists
        existing_user = get_user_by_username(db, test_username)
        if existing_user:
            print(f"User {test_username} already exists")
        else:
            # Create test user
            hashed_password = get_password_hash(test_password)
            new_user = create_user(db, test_username, test_email, hashed_password, "Test User")
            print(f"Created user: {new_user.username}")
            
            # Test authentication
            print("\nTesting authentication...")
            auth_user = authenticate_user(db, test_username, test_password)
            if auth_user:
                print(f"✅ Authentication successful for {auth_user.username}")
                
                # Test password verification
                if verify_password(test_password, auth_user.hashed_password):
                    print("✅ Password verification works")
                else:
                    print("❌ Password verification failed")
            else:
                print(f"❌ Authentication failed for {test_username}")
        
    finally:
        db.close()

if __name__ == "__main__":
    test_auth()
