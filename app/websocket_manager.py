from typing import List, Dict, Optional, Any
from fastapi import WebSocket
import json
import logging

logger = logging.getLogger(__name__)


class ConnectionManager:
    def __init__(self):
        # Store connections with their active room
        self.active_connections: List[Dict[str, Any]] = []
        self.usernames: Dict[WebSocket, str] = {}

    async def connect(self, websocket: WebSocket, username: str):
        await websocket.accept()
        self.active_connections.append({
            "websocket": websocket,
            "username": username,
            "room_id": None # Default to global chat or no room
        })
        self.usernames[websocket] = username
        logger.info(f"User connected: {username}")

        # Broadcast join notification
        await self.broadcast_system_message(f"{username} joined the chat")

    def disconnect(self, websocket: WebSocket):
        username = self.usernames.get(websocket, "Unknown user")

        # Remove from active connections
        self.active_connections = [
            conn for conn in self.active_connections
            if conn["websocket"] != websocket
        ]

        # Remove from usernames
        if websocket in self.usernames:
            del self.usernames[websocket]

        logger.info(f"User disconnected: {username}")
        return username
        
    def set_room(self, websocket: WebSocket, room_id: Optional[int]):
        for conn in self.active_connections:
            if conn["websocket"] == websocket:
                conn["room_id"] = room_id
                break

    async def send_personal_message(self, message: str, websocket: WebSocket):
        await websocket.send_text(message)

    async def broadcast(self, message: str, exclude_websocket: WebSocket = None, room_id: Optional[int] = None):
        disconnected = []
        target_connections = [
            conn for conn in self.active_connections 
            if (room_id is None or conn.get("room_id") == room_id) and conn["websocket"] != exclude_websocket
        ]
        
        logger.info(f"Broadcasting message to {len(target_connections)} clients (room_id={room_id})")

        for connection in target_connections:
            websocket = connection["websocket"]
            username = connection.get("username", "Unknown")
            try:
                await websocket.send_text(message)
                logger.debug(f"Successfully sent message to {username}")
            except Exception as e:
                logger.warning(f"Failed to send message to {username}: {type(e).__name__}: {e}")
                disconnected.append(websocket)

        # Clean up disconnected websockets
        if disconnected:
            logger.info(f"Cleaning up {len(disconnected)} disconnected clients")
            for websocket in disconnected:
                self.disconnect(websocket)

    async def broadcast_system_message(self, message: str, room_id: Optional[int] = None):
        system_message: Dict[str, Any] = {
            "type": "system",
            "content": message,
            "timestamp": self.get_timestamp()
        }
        if room_id:
            system_message["room_id"] = room_id
        await self.broadcast(json.dumps(system_message), room_id=room_id)

    async def broadcast_message(self, username: str, content: str, message_id: Optional[int] = None, room_id: Optional[int] = None, timestamp: Optional[str] = None):
        message_dict: Dict[str, Any] = {
            "type": "message",
            "id": message_id,
            "username": username,
            "content": content,
            "timestamp": timestamp or self.get_timestamp()
        }
        if room_id:
            message_dict["room_id"] = room_id
        await self.broadcast(json.dumps(message_dict), room_id=room_id)
    
    async def broadcast_file_message(self, file_message: Dict[str, Any], room_id: Optional[int] = None):
        await self.broadcast(json.dumps(file_message), room_id=room_id)
    
    async def broadcast_image_message(self, image_message: Dict[str, Any], room_id: Optional[int] = None):
        await self.broadcast(json.dumps(image_message), room_id=room_id)
    
    async def broadcast_message_deletion(self, delete_message: Dict[str, Any], room_id: Optional[int] = None):
        await self.broadcast(json.dumps(delete_message), room_id=room_id)
    
    async def broadcast_chat_clear(self, clear_chat_message: Dict[str, Any], room_id: Optional[int] = None):
        await self.broadcast(json.dumps(clear_chat_message), room_id=room_id)
    
    async def update_rooms(self):
        """Broadcast updated rooms list to all connected clients"""
        from .database import get_all_rooms, SessionLocal
        
        # Get fresh rooms data from database
        db = SessionLocal()
        try:
            rooms = get_all_rooms(db)
            rooms_data = [
                {
                    "id": room.id,
                    "name": room.name,
                    "description": room.description or "No description",
                    "created_at": room.created_at.isoformat() if room.created_at else None
                }
                for room in rooms
            ]
            
            update_message = {
                "type": "rooms_update",
                "room_details": rooms_data,
                "timestamp": self.get_timestamp()
            }
            await self.broadcast(json.dumps(update_message))
        finally:
            db.close()
    
    def get_online_users(self):
        """Get list of currently connected users"""
        return [
            {
                "username": user.username,
                "full_name": user.full_name,
                "email": user.email
            }
            for user in self.active_connections.values()
        ]
    
    async def send_private_message(self, message: str, recipient_username: str):
        """Send a private message to a specific user"""
        for websocket, user in self.active_connections.items():
            if user.username == recipient_username:
                try:
                    await websocket.send_text(message)
                    return True
                except:
                    # Remove disconnected user
                    if websocket in self.active_connections:
                        del self.active_connections[websocket]
                    return False
        return False
        
    async def broadcast_typing(self, username: str, is_typing: bool, room_id: Optional[int] = None):
        message_dict: Dict[str, Any] = {
            "type": "typing",
            "username": username,
            "is_typing": is_typing,
            "timestamp": self.get_timestamp()
        }
        if room_id:
            message_dict["room_id"] = room_id
        await self.broadcast(json.dumps(message_dict), room_id=room_id)
        
    async def broadcast_read_receipt(self, username: str, message_id: int):
        message_dict: Dict[str, Any] = {
            "type": "read_receipt",
            "username": username,
            "message_id": message_id,
            "timestamp": self.get_timestamp()
        }
        # Read receipts can be broadcast to everyone who might care, or specific rooms
        await self.broadcast(json.dumps(message_dict))

    def get_online_users(self) -> List[str]:
        return list(set(self.usernames.values()))

    async def update_online_users(self):
        users = self.get_online_users()
        update_message = {
            "type": "users_update",
            "users": users
        }
        await self.broadcast(json.dumps(update_message))

    def get_timestamp(self) -> str:
        from datetime import datetime
        return datetime.now().isoformat()


# Global connection manager instance
manager = ConnectionManager()
