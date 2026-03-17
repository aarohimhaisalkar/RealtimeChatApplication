from app.database import get_db_session, save_message, create_tables, engine
from app.models import Base, User
import uuid

create_tables()

with get_db_session() as db:
    uid = str(uuid.uuid4())[:8]
    user = User(username=f"test_{uid}", email=f"{uid}@test.com", hashed_password="X")
    db.add(user)
    db.commit()
    db.refresh(user)
    
    try:
        msg = save_message(db, user.id, user.username, "Test message")
        print(f"Success! Message saved with ID {msg.id}")
    except Exception as e:
        print(f"Error saving message: {type(e).__name__}: {e}")
