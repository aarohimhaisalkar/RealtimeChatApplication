from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request, Depends, HTTPException, status, Form
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.responses import HTMLResponse, RedirectResponse, FileResponse
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from datetime import timedelta
import json
import asyncio
import os
import uuid
from pathlib import Path

from .database import get_db, create_tables, get_recent_messages, save_message, create_user, get_user_by_username, get_user_by_email, update_last_login
from .websocket_manager import manager
from .models import Message, User
from .auth import authenticate_user, create_access_token, get_password_hash, validate_password, validate_username, validate_email, ACCESS_TOKEN_EXPIRE_MINUTES

app = FastAPI(title="Real-Time Chat Application")

# OAuth2 scheme for token authentication
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="api/login")

# Mount static files and templates
app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")

# Create database tables on startup
@app.on_event("startup")
async def startup_event():
    create_tables()

# Basic test endpoint - FIRST THING TO TEST
@app.get("/")
async def root():
    return {"message": "Chat app is running"}

@app.get("/api/test")
async def test_endpoint():
    return {"message": "API is working", "status": "ok"}

@app.post("/api/upload")
async def upload_file():
    try:
        return {
            "message": "File upload endpoint working",
            "test": True,
            "file_url": "/uploads/test.txt",
            "file_size": 1024
        }
    except Exception as e:
        return {"error": str(e)}

# Authentication dependency
async def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    from .auth import verify_token
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = verify_token(token)
        username: str = payload.get("sub")
        if username is None:
            raise credentials_exception
    except:
        raise credentials_exception
    
    user = get_user_by_username(db, username=username)
    if user is None:
        raise credentials_exception
    return user

# Routes
@app.get("/", response_class=HTMLResponse)
async def get_login_page(request: Request):
    return templates.TemplateResponse("login.html", {"request": request})

@app.get("/register", response_class=HTMLResponse)
async def get_register_page(request: Request):
    return templates.TemplateResponse("register.html", {"request": request})

@app.post("/api/register")
async def register_user(
    username: str = Form(...),
    email: str = Form(...),
    password: str = Form(...),
    full_name: str = Form(None),
    db: Session = Depends(get_db)
):
    # Validate input
    username_valid, username_msg = validate_username(username)
    if not username_valid:
        raise HTTPException(status_code=400, detail=username_msg)
    
    email_valid, email_msg = validate_email(email)
    if not email_valid:
        raise HTTPException(status_code=400, detail=email_msg)
    
    password_valid, password_msg = validate_password(password)
    if not password_valid:
        raise HTTPException(status_code=400, detail=password_msg)
    
    # Check if user already exists
    if get_user_by_username(db, username):
        raise HTTPException(status_code=400, detail="Username already registered")
    
    if get_user_by_email(db, email):
        raise HTTPException(status_code=400, detail="Email already registered")
    
    # Create new user
    hashed_password = get_password_hash(password)
    user = create_user(db, username, email, hashed_password, full_name)
    
    return {"message": "User created successfully", "user_id": user.id}

@app.post("/api/login")
async def login_user(
    username: str = Form(...),
    password: str = Form(...),
    db: Session = Depends(get_db)
):
    # Try to authenticate user
    user = authenticate_user(db, username, password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # Update last login
    update_last_login(db, user.id)
    
    # Create access token
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.username}, expires_delta=access_token_expires
    )
    
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": user.to_dict()
    }

@app.get("/chat", response_class=HTMLResponse)
async def get_chat_page(request: Request):
    # Allow access to chat page - authentication handled on client side
    return templates.TemplateResponse("chat.html", {"request": request})

@app.websocket("/ws/{token}")
async def websocket_endpoint(websocket: WebSocket, token: str, t: str = None):
    print(f"WebSocket connection attempt with token: {token[:20]}...")
    
    # Remove cache busting parameter if present
    if '?' in token:
        token = token.split('?')[0]
    
    # Verify token
    try:
        from .auth import verify_token
        payload = verify_token(token)
        username = payload.get("sub")
        print(f"Token verified for user: {username}")
        
        if not username:
            print("No username in token payload")
            await websocket.close(code=4001)
            return
        
        # Get user from database
        db = next(get_db())
        user = get_user_by_username(db, username)
        if not user:
            print(f"User not found: {username}")
            await websocket.close(code=4001)
            return
        
    except Exception as e:
        print(f"WebSocket authentication error: {e}")
        await websocket.close(code=4001)
        return
    
    await manager.connect(websocket, username)
    
    try:
        # Send recent messages to the new user
        db = next(get_db())
        try:
            recent_messages = get_recent_messages(db, limit=50)
            
            # Send message history
            for message in reversed(recent_messages):
                message_data = {
                    "type": "message",
                    "username": message.username,
                    "content": message.content,
                    "timestamp": message.timestamp.strftime("%H:%M") if message.timestamp else "00:00"
                }
                await manager.send_personal_message(json.dumps(message_data), websocket)
            
            # Send current online users
            await manager.update_online_users()
        finally:
            db.close()
        
        while True:
            # Receive message from client
            data = await websocket.receive_text()
            message_data = json.loads(data)
            
            if message_data.get("type") == "message":
                content = message_data.get("content", "").strip()
                
                if content:  # Only save and broadcast non-empty messages
                    # Save message to database
                    db = next(get_db())
                    try:
                        save_message(db, user.id, username, content)
                    finally:
                        db.close()
                    
                    # Broadcast message to all users
                    await manager.broadcast_message(username, content)
            
            elif message_data.get("type") == "file":
                # Handle file message
                filename = message_data.get("filename", "")
                file_url = message_data.get("file_url", "")
                file_size = message_data.get("file_size", 0)
                
                # Broadcast file message to all users
                file_message = {
                    "type": "file",
                    "username": username,
                    "filename": filename,
                    "file_url": file_url,
                    "file_size": file_size,
                    "timestamp": message_data.get("timestamp", "")
                }
                
                await manager.broadcast_file_message(file_message)
                    
    except WebSocketDisconnect:
        disconnected_username = manager.disconnect(websocket)
        await manager.broadcast_system_message(f"{disconnected_username} left the chat")
        await manager.update_online_users()
    except Exception as e:
        print(f"WebSocket error: {e}")
        manager.disconnect(websocket)
        await manager.update_online_users()

# Test endpoint to verify API is working
@app.get("/api/test")
async def test_endpoint():
    return {"message": "API is working", "status": "ok"}

# Simple file upload test (without file handling)
@app.post("/api/upload")
async def upload_file():
    try:
        return {
            "message": "File upload endpoint working",
            "test": True,
            "file_url": "/uploads/test.txt",
            "file_size": 1024
        }
    except Exception as e:
        return {"error": str(e)}

# Serve uploaded files
@app.get("/uploads/{filename}")
async def serve_file(filename: str):
    file_path = Path("uploads") / filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found")
    
    return FileResponse(file_path)

@app.get("/health")
async def health_check():
    return {"status": "healthy"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
