from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request, Depends, HTTPException, status, Form, File, UploadFile
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
import time
from pathlib import Path

from .database import get_db, create_tables, get_recent_messages, save_message, create_user, get_user_by_username, get_user_by_email, update_last_login, get_all_rooms, create_room, search_messages, update_message, delete_message, get_direct_messages, clear_all_messages, delete_room
from .websocket_manager import manager
from .models import Message, User
from .auth import authenticate_user, create_access_token, get_password_hash, validate_password, validate_username, validate_email, create_refresh_token, ACCESS_TOKEN_EXPIRE_MINUTES

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

@app.get("/login", response_class=HTMLResponse)
async def get_login_page(request: Request):
    return templates.TemplateResponse("login.html", {"request": request})

@app.get("/", response_class=HTMLResponse)
async def get_home_page(request: Request):
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
    
    # Create refresh token
    refresh_token = create_refresh_token(
        data={"sub": user.username}
    )
    
    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
        "expires_in": ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        "user": user.to_dict()
    }

@app.post("/api/refresh")
async def refresh_token(
    refresh_token: str = Form(...),
    db: Session = Depends(get_db)
):
    try:
        from .auth import verify_token
        payload = verify_token(refresh_token)
        
        if payload.get("type") != "refresh":
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid refresh token"
            )
        
        username = payload.get("sub")
        if not username:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid refresh token"
            )
        
        # Get user
        user = get_user_by_username(db, username)
        if not user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="User not found"
            )
        
        # Create new access token
        access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
        access_token = create_access_token(
            data={"sub": user.username}, expires_delta=access_token_expires
        )
        
        return {
            "access_token": access_token,
            "token_type": "bearer",
            "expires_in": ACCESS_TOKEN_EXPIRE_MINUTES * 60
        }
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid refresh token"
        )

@app.get("/chat", response_class=HTMLResponse)
async def get_chat_page(request: Request):
    # Allow access to chat page - authentication handled on client side
    # Pass invite parameters if present
    room_id = request.query_params.get("room")
    room_name = request.query_params.get("name")
    
    return templates.TemplateResponse("chat.html", {
        "request": request,
        "invite_room_id": room_id,
        "invite_room_name": room_name
    })

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
        # Only clear chat history if this is the first user connecting
        current_users = manager.get_online_users()
        is_first_user = len(current_users) == 1
        
        if is_first_user:
            # Clear all chat history when first user connects
            db = next(get_db())
            try:
                deleted_count = clear_all_messages(db)
                print(f"Auto-cleared {deleted_count} messages on first user connect: {username}")
                
                # Broadcast clear chat to all users
                clear_chat_message = {
                    "type": "chat_cleared",
                    "username": "System",
                    "room_id": None,
                    "timestamp": manager.get_timestamp()
                }
                
                await manager.broadcast_chat_clear(clear_chat_message)
            finally:
                db.close()
            
            # Send welcome message instead of history
            welcome_message = {
                "type": "system",
                "content": f"{username} joined the chat. Chat history has been cleared for a fresh start.",
                "timestamp": manager.get_timestamp()
            }
            await manager.send_personal_message(json.dumps(welcome_message), websocket)
        else:
            # For additional users, don't clear history, just send welcome
            welcome_message = {
                "type": "system",
                "content": f"{username} joined the chat.",
                "timestamp": manager.get_timestamp()
            }
            await manager.send_personal_message(json.dumps(welcome_message), websocket)
        
        # Send current online users
        await manager.update_online_users()
        
        while True:
            # Receive message from client
            data = await websocket.receive_text()
            message_data = json.loads(data)
            
            if message_data.get("type") == "message":
                content = message_data.get("content", "").strip()
                
                if content:  # Only save and broadcast non-empty messages
                    # Use client timestamp if provided, otherwise use server timestamp
                    timestamp = message_data.get("timestamp") or manager.get_timestamp()
                    
                    # Save message to database and get ID
                    db = next(get_db())
                    try:
                        message = save_message(db, user.id, username, content)
                        message_id = message.id if message else None
                    finally:
                        db.close()
                    
                    # Broadcast message to all users with ID and timestamp
                    await manager.broadcast_message(username, content, message_id, timestamp=timestamp)
            
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
            
            elif message_data.get("type") == "image":
                # Handle image message
                filename = message_data.get("content", "")
                image_url = message_data.get("image_url", "")
                file_size = message_data.get("file_size", 0)
                
                # Broadcast image message to all users
                image_message = {
                    "type": "image",
                    "username": username,
                    "content": filename,
                    "image_url": image_url,
                    "file_size": file_size,
                    "timestamp": message_data.get("timestamp", "")
                }
                
                await manager.broadcast_image_message(image_message)
            
            elif message_data.get("type") == "delete_message":
                # Handle message deletion
                message_id = message_data.get("message_id")
                if message_id:
                    # Update message in database
                    db = next(get_db())
                    try:
                        update_message(db, message_id, is_deleted=True)
                    finally:
                        db.close()
                    
                    # Broadcast deletion to all users
                    delete_message = {
                        "type": "message_deleted",
                        "message_id": message_id,
                        "username": username,
                        "timestamp": message_data.get("timestamp", "")
                    }
                    
                    await manager.broadcast_message_deletion(delete_message)
            
            elif message_data.get("type") == "clear_chat":
                # Handle clear chat request
                room_id = message_data.get("room_id")
                
                # Clear messages from database
                db = next(get_db())
                try:
                    deleted_count = clear_all_messages(db, room_id)
                    print(f"Cleared {deleted_count} messages from database")
                finally:
                    db.close()
                
                # Broadcast clear chat to all users
                clear_chat_message = {
                    "type": "chat_cleared",
                    "username": username,
                    "room_id": room_id,
                    "timestamp": message_data.get("timestamp", "")
                }
                
                await manager.broadcast_chat_clear(clear_chat_message)
            
            elif message_data.get("type") == "create_room":
                # Handle create room request
                room_name = message_data.get("room_name", "").strip()
                room_description = message_data.get("room_description", "").strip()
                
                print(f"Room creation request: name='{room_name}', desc='{room_description}'")
                
                if room_name:
                    db = next(get_db())
                    try:
                        room = create_room(db, room_name, room_description)
                        print(f"Room created successfully: {room}")
                        await manager.update_rooms()
                        
                        # Send confirmation to user
                        response = {
                            "type": "room_created",
                            "room_id": room.id,
                            "room_name": room.name,
                            "room_description": room.description,
                            "timestamp": manager.get_timestamp()
                        }
                        await manager.send_personal_message(json.dumps(response), websocket)
                        
                        success_message = {
                            "type": "system",
                            "content": f"Room '{room_name}' created successfully!",
                            "timestamp": manager.get_timestamp()
                        }
                        await manager.send_personal_message(json.dumps(success_message), websocket)
                    except Exception as e:
                        print(f"Room creation error: {e}")
                        error_response = {
                            "type": "error",
                            "message": f"Failed to create room: {str(e)}",
                            "timestamp": manager.get_timestamp()
                        }
                        await manager.send_personal_message(json.dumps(error_response), websocket)
                    finally:
                        db.close()
                else:
                    print("Room creation failed: empty room name")
            
            elif message_data.get("type") == "join_room":
                # Handle join room request
                room_code = message_data.get("room_code", "").strip()
                
                # For now, we'll simulate room joining (you can enhance this with actual room codes)
                if room_code:
                    response = {
                        "type": "room_joined",
                        "message": f"Joined room with code: {room_code}",
                        "timestamp": manager.get_timestamp()
                    }
                    await manager.send_personal_message(json.dumps(response), websocket)
                    
                    success_message = {
                        "type": "system",
                        "content": f"Joined room successfully!",
                        "timestamp": manager.get_timestamp()
                    }
                    await manager.send_personal_message(json.dumps(success_message), websocket)
            
            elif message_data.get("type") == "browse_rooms":
                # Handle browse rooms request
                db = next(get_db())
                try:
                    rooms = get_all_rooms(db)
                    rooms_data = [
                        {
                            "id": room.id,
                            "name": room.name,
                            "description": room.description or "No description"
                        }
                        for room in rooms
                    ]
                    
                    response = {
                        "type": "rooms_list",
                        "rooms": rooms_data,
                        "timestamp": manager.get_timestamp()
                    }
                    await manager.send_personal_message(json.dumps(response), websocket)
                finally:
                    db.close()
            
            elif message_data.get("type") == "invite_room":
                # Handle invite room request (frontend handles this)
                pass
            
            elif message_data.get("type") == "delete_room":
                # Handle delete room request
                room_id = message_data.get("room_id")
                
                if room_id:
                    db = next(get_db())
                    try:
                        success = delete_room(db, room_id)
                        if success:
                            await manager.update_rooms()
                            
                            # Send confirmation to user
                            response = {
                                "type": "room_deleted",
                                "room_id": room_id,
                                "timestamp": manager.get_timestamp()
                            }
                            await manager.send_personal_message(json.dumps(response), websocket)
                            
                            success_message = {
                                "type": "system",
                                "content": f"Room deleted successfully!",
                                "timestamp": manager.get_timestamp()
                            }
                            await manager.send_personal_message(json.dumps(success_message), websocket)
                            
                            print(f"Room deleted successfully: {room_id}")
                        else:
                            error_response = {
                                "type": "error",
                                "message": "Room not found or could not be deleted",
                                "timestamp": manager.get_timestamp()
                            }
                            await manager.send_personal_message(json.dumps(error_response), websocket)
                    except Exception as e:
                        print(f"Room deletion error: {e}")
                        error_response = {
                            "type": "error",
                            "message": f"Failed to delete room: {str(e)}",
                            "timestamp": manager.get_timestamp()
                        }
                        await manager.send_personal_message(json.dumps(error_response), websocket)
                    finally:
                        db.close()
            
            elif message_data.get("type") == "private_message":
                # Handle private message
                recipient = message_data.get("recipient")
                content = message_data.get("content")
                room_id = message_data.get("room_id")
                
                if recipient and content:
                    private_msg = {
                        "type": "private_message",
                        "sender": username,
                        "recipient": recipient,
                        "content": content,
                        "room_id": room_id,
                        "timestamp": manager.get_timestamp()
                    }
                    
                    # Send to recipient
                    recipient_received = await manager.send_private_message(json.dumps(private_msg), recipient)
                    
                    # Also send to sender for confirmation
                    await manager.send_personal_message(json.dumps(private_msg), websocket)
                    
                    if recipient_received:
                        print(f"Private message from {username} to {recipient}")
                    else:
                        # Recipient not found, send error to sender
                        error_msg = {
                            "type": "error",
                            "message": f"User {recipient} is not online",
                            "timestamp": manager.get_timestamp()
                        }
                        await manager.send_personal_message(json.dumps(error_msg), websocket)
            
            elif message_data.get("type") == "get_online_users":
                # Handle get online users request
                online_users = manager.get_online_users()
                response = {
                    "type": "online_users_list",
                    "users": online_users,
                    "timestamp": manager.get_timestamp()
                }
                await manager.send_personal_message(json.dumps(response), websocket)
                print(f"Online users list sent: {len(online_users)} users")
            
            elif message_data.get("type") == "search_users":
                # Handle search users request
                query = message_data.get("query", "").strip().lower()
                if query:
                    db = next(get_db())
                    try:
                        # Search users by username or email
                        users = db.query(User).filter(
                            (User.username.ilike(f"%{query}%")) | 
                            (User.email.ilike(f"%{query}%"))
                        ).limit(10).all()
                        
                        users_data = [
                            {
                                "id": user.id,
                                "username": user.username,
                                "email": user.email,
                                "full_name": user.full_name
                            }
                            for user in users
                        ]
                        
                        response = {
                            "type": "search_users_results",
                            "query": query,
                            "users": users_data,
                            "timestamp": manager.get_timestamp()
                        }
                        await manager.send_personal_message(json.dumps(response), websocket)
                        print(f"User search results sent for '{query}': {len(users_data)} results")
                    finally:
                        db.close()
                    
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

# Document upload endpoint
@app.post("/api/upload")
async def upload_file(file: UploadFile = File(...)):
    try:
        # Create uploads directory if it doesn't exist
        upload_dir = Path("uploads")
        upload_dir.mkdir(exist_ok=True)
        
        # Generate unique filename
        file_extension = Path(file.filename).suffix
        unique_filename = f"doc_{int(time.time())}_{file.filename}"
        file_path = upload_dir / unique_filename
        
        # Save the file
        with open(file_path, "wb") as buffer:
            content = await file.read()
            buffer.write(content)
        
        # Return success response
        return {
            "message": "Document uploaded successfully",
            "file_url": f"/uploads/{unique_filename}",
            "file_size": len(content),
            "filename": file.filename
        }
    except Exception as e:
        print(f"Document upload error: {e}")
        return {"error": str(e)}

# Image upload endpoint
@app.post("/api/upload-image")
async def upload_image(file: UploadFile = File(...)):
    try:
        # Create uploads directory if it doesn't exist
        upload_dir = Path("uploads")
        upload_dir.mkdir(exist_ok=True)
        
        # Generate unique filename
        file_extension = Path(file.filename).suffix
        unique_filename = f"image_{int(time.time())}_{file.filename}"
        file_path = upload_dir / unique_filename
        
        # Save the file
        with open(file_path, "wb") as buffer:
            content = await file.read()
            buffer.write(content)
        
        # Return success response
        return {
            "message": "Image uploaded successfully",
            "image_url": f"/uploads/{unique_filename}",
            "file_size": len(content),
            "filename": file.filename
        }
    except Exception as e:
        print(f"Image upload error: {e}")
        return {"error": str(e)}

# Serve uploaded files
@app.get("/uploads/{filename}")
async def serve_file(filename: str):
    file_path = Path("uploads") / filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found")
    
    # Determine media type for proper download behavior
    media_type = None
    filename_lower = filename.lower()
    
    # Image types - display in browser
    if any(filename_lower.endswith(ext) for ext in ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp']):
        media_type = f"image/{filename_lower.split('.')[-1]}"
    # PDF - display in browser
    elif filename_lower.endswith('.pdf'):
        media_type = "application/pdf"
    # Text files - display in browser
    elif any(filename_lower.endswith(ext) for ext in ['.txt', '.md']):
        media_type = "text/plain"
    # Documents - force download
    elif any(filename_lower.endswith(ext) for ext in ['.doc', '.docx']):
        media_type = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    elif any(filename_lower.endswith(ext) for ext in ['.xls', '.xlsx']):
        media_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    elif any(filename_lower.endswith(ext) for ext in ['.ppt', '.pptx']):
        media_type = "application/vnd.openxmlformats-officedocument.presentationml.presentation"
    
    return FileResponse(
        file_path, 
        media_type=media_type,
        filename=filename
    )

@app.get("/health")
async def health_check():
    return {"status": "healthy"}

@app.get("/test-chat", response_class=HTMLResponse)
async def get_test_chat_page(request: Request):
    return FileResponse("static/test_chat.html")

@app.get("/invite", response_class=HTMLResponse)
async def invite_page(request: Request, room: str = None):
    """Handle invite page with room parameter"""
    if not room:
        return templates.TemplateResponse("login.html", {"request": request})
    
    # For now, redirect to login with room info
    # You can enhance this with a proper invite page later
    return templates.TemplateResponse("login.html", {
        "request": request,
        "invite_room": room
    })

@app.get("/fix-auth", response_class=HTMLResponse)
async def get_fix_auth_page(request: Request):
    return FileResponse("static/fix_auth.html")

@app.get("/quick-fix", response_class=HTMLResponse)
async def get_quick_fix_page(request: Request):
    return FileResponse("static/quick_fix.html")

@app.get("/emoji-test", response_class=HTMLResponse)
async def get_emoji_test_page(request: Request):
    return FileResponse("static/emoji_test.html")

@app.get("/simple-emoji", response_class=HTMLResponse)
async def get_simple_emoji_page(request: Request):
    return FileResponse("static/simple_emoji.html")

@app.get("/login-solutions", response_class=HTMLResponse)
async def get_login_solutions_page(request: Request):
    return FileResponse("static/login_solutions.html")

@app.get("/emoji-success", response_class=HTMLResponse)
async def get_emoji_success_page(request: Request):
    return FileResponse("static/emoji_success.html")

@app.get("/working-emoji", response_class=HTMLResponse)
async def get_working_emoji_page(request: Request):
    return FileResponse("static/working_emoji.html")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
