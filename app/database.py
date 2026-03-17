from sqlalchemy import create_engine, or_, and_
from sqlalchemy.orm import sessionmaker
from .models import Message, User, Room, DirectMessage, Base

from contextlib import contextmanager
import os

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./chat.db")

engine = create_engine(
    DATABASE_URL, 
    connect_args={"check_same_thread": False}
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def create_tables():
    Base.metadata.create_all(bind=engine)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

@contextmanager
def get_db_session():
    """Context manager for database sessions, useful outside FastAPI dependencies (e.g., in WebSockets)"""
    db = SessionLocal()
    try:
        yield db
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()

# Message operations
def save_message(db, user_id: int, username: str, content: str, room_id: int = None):
    message = Message(user_id=user_id, username=username, content=content, room_id=room_id)
    db.add(message)
    db.commit()
    db.refresh(message)
    return message

def get_recent_messages(db, limit: int = 50, room_id: int = None):
    query = db.query(Message).filter(Message.room_id == room_id)
    return query.order_by(Message.timestamp.desc()).limit(limit).all()

def search_messages(db, query_str: str, limit: int = 50):
    return db.query(Message).filter(Message.content.contains(query_str)).order_by(Message.timestamp.desc()).limit(limit).all()

def update_message(db, message_id: int, content: str):
    message = db.query(Message).filter(Message.id == message_id).first()
    if message:
        message.content = content
        message.is_edited = True
        db.commit()
        db.refresh(message)
    return message

def delete_message(db, message_id: int):
    message = db.query(Message).filter(Message.id == message_id).first()
    if message:
        message.is_deleted = True
        db.commit()
        db.refresh(message)
    return message

# Room operations
def create_room(db, name: str, description: str = None):
    room = Room(name=name, description=description)
    db.add(room)
    db.commit()
    db.refresh(room)
    return room

def get_all_rooms(db):
    return db.query(Room).all()

def get_room_by_id(db, room_id: int):
    return db.query(Room).filter(Room.id == room_id).first()

# Direct Message operations
def save_direct_message(db, sender_id: int, receiver_id: int, content: str):
    dm = DirectMessage(sender_id=sender_id, receiver_id=receiver_id, content=content)
    db.add(dm)
    db.commit()
    db.refresh(dm)
    return dm

def get_direct_messages(db, user_id1: int, user_id2: int, limit: int = 50):
    return db.query(DirectMessage).filter(
        or_(
            and_(DirectMessage.sender_id == user_id1, DirectMessage.receiver_id == user_id2),
            and_(DirectMessage.sender_id == user_id2, DirectMessage.receiver_id == user_id1)
        )
    ).order_by(DirectMessage.timestamp.desc()).limit(limit).all()

# User operations
def create_user(db, username: str, email: str, hashed_password: str, full_name: str = None):
    user = User(
        username=username,
        email=email,
        hashed_password=hashed_password,
        full_name=full_name
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user

def get_user_by_username(db, username: str):
    return db.query(User).filter(User.username == username).first()

def get_user_by_email(db, email: str):
    return db.query(User).filter(User.email == email).first()

def get_user_by_id(db, user_id: int):
    return db.query(User).filter(User.id == user_id).first()

def update_last_login(db, user_id: int):
    user = db.query(User).filter(User.id == user_id).first()
    if user:
        from datetime import datetime
        user.last_login = datetime.utcnow()
        db.commit()
    return user
