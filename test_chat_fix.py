#!/usr/bin/env python3
"""
Test script to verify chat functionality
"""

import asyncio
import websockets
import json
import requests

BASE_URL = "http://localhost:8000"

def test_api():
    """Test API endpoints"""
    print("🔍 Testing API endpoints...")
    
    try:
        response = requests.get(f"{BASE_URL}/api/test")
        if response.status_code == 200:
            print("✅ API test endpoint working")
        else:
            print("❌ API test endpoint failed")
    except Exception as e:
        print(f"❌ API test failed: {e}")

async def test_websocket():
    """Test WebSocket connection"""
    print("🔍 Testing WebSocket connection...")
    
    # First login to get a token
    login_data = {
        "username": "Aarohi",
        "password": "password123"  # You'll need to use actual credentials
    }
    
    try:
        response = requests.post(f"{BASE_URL}/api/login", data=login_data)
        if response.status_code == 200:
            token_data = response.json()
            token = token_data["access_token"]
            print("✅ Login successful")
            
            # Test WebSocket
            ws_url = f"ws://localhost:8000/ws/{token}"
            try:
                async with websockets.connect(ws_url) as websocket:
                    print("✅ WebSocket connection successful")
                    
                    # Wait for initial messages
                    try:
                        message = await asyncio.wait_for(websocket.recv(), timeout=5.0)
                        data = json.loads(message)
                        print(f"✅ Received message: {data.get('type', 'unknown')}")
                        
                        if data.get('type') == 'users_update':
                            users = data.get('users', [])
                            print(f"✅ Online users: {users}")
                        
                    except asyncio.TimeoutError:
                        print("⚠️  No messages received within 5 seconds")
                    
            except Exception as e:
                print(f"❌ WebSocket connection failed: {e}")
        else:
            print(f"❌ Login failed: {response.status_code}")
            
    except Exception as e:
        print(f"❌ Login test failed: {e}")

if __name__ == "__main__":
    print("🚀 Starting chat application tests...")
    print("=" * 50)
    
    test_api()
    print()
    
    print("Note: For WebSocket testing, you need valid user credentials")
    print("The actual chat interface should be tested in the browser")
    print(f"📱 Open {BASE_URL} in your browser to test the full application")
