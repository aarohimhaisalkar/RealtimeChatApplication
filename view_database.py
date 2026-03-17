#!/usr/bin/env python3

import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from app.models import User, Message, Base

def view_database():
    """View all data in the database"""
    print("🗄️  REAL-TIME CHAT DATABASE VIEWER")
    print("=" * 50)
    
    # Create database connection
    engine = create_engine("sqlite:///./chat.db", connect_args={"check_same_thread": False})
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    db = SessionLocal()
    
    try:
        # View Users
        print("\n👥 USERS TABLE:")
        print("-" * 30)
        users = db.query(User).all()
        print(f"Total Users: {len(users)}")
        for i, user in enumerate(users, 1):
            print(f"{i}. {user.username}")
            print(f"   Email: {user.email}")
            print(f"   Name: {user.full_name or 'Not provided'}")
            print(f"   Active: {'✅' if user.is_active else '❌'}")
            print(f"   Created: {user.created_at}")
            print(f"   Last Login: {user.last_login or 'Never'}")
            print()
        
        # View Messages
        print("\n💬 MESSAGES TABLE:")
        print("-" * 30)
        messages = db.query(Message).all()
        print(f"Total Messages: {len(messages)}")
        for i, message in enumerate(messages, 1):
            print(f"{i}. From: {message.username}")
            print(f"   Content: {message.content}")
            print(f"   Time: {message.timestamp}")
            print()
        
        # Database Statistics
        print("\n📊 DATABASE STATISTICS:")
        print("-" * 30)
        print(f"Database File: chat.db")
        print(f"File Size: {os.path.getsize('chat.db')} bytes")
        print(f"Total Users: {len(users)}")
        print(f"Total Messages: {len(messages)}")
        
        # Show table structure
        print("\n🏗️  TABLE STRUCTURES:")
        print("-" * 30)
        inspector = engine.inspect()
        for table_name in inspector.get_table_names():
            print(f"\n📋 Table: {table_name}")
            columns = inspector.get_columns(table_name)
            for column in columns:
                print(f"   - {column['name']}: {column['type']}")
        
    finally:
        db.close()

if __name__ == "__main__":
    view_database()
