import asyncio
import websockets
import json
import requests
import uuid

# Base URLs
API_URL = "http://localhost:8000/api"
WS_URL = "ws://localhost:8000/ws"

async def test_websocket():
    # 1. Register a test user
    uid = str(uuid.uuid4())[:8]
    username = f"wsuser_{uid}"
    
    register_data = {
        "username": username,
        "email": f"{username}@example.com",
        "password": "TestPassword123!",
        "full_name": "Test User"
    }
    
    print(f"Registering user {username}...")
    res = requests.post(f"{API_URL}/register", data=register_data)
    if res.status_code != 200:
        # Might hit rate limit if we spam, wait or use different IP mapping in real scenario
        # But we'll proceed to login. If it fails, we assume it exists
        pass
        
    print(f"Logging in {username}...")
    login_data = {
        "username": username,
        "password": "TestPassword123!"
    }
    res = requests.post(f"{API_URL}/login", data=login_data)
    if res.status_code != 200:
        print(f"Login failed: {res.text}")
        return
        
    token = res.json()["access_token"]
    
    # 2. Connect to WebSocket
    ws_uri = f"{WS_URL}?token={token}"
    print(f"Connecting to WebSocket...")
    
    async with websockets.connect(ws_uri) as websocket:
        print("Connected!")
        
        # We might receive initial user list or message history, let's drain it briefly
        try:
            for _ in range(5):
                msg = await asyncio.wait_for(websocket.recv(), timeout=1.0)
                # print(f"Initial receive: {msg[:100]}...")
        except asyncio.TimeoutError:
            pass
            
        # 3. Send malicious message
        malicious_html = "<b>Hello</b> <script>alert('XSS')</script> world!"
        message_data = {
            "type": "message",
            "content": malicious_html
        }
        print(f"Sending message: {malicious_html}")
        await websocket.send(json.dumps(message_data))
        
        # 4. Receive response
        try:
            response = await asyncio.wait_for(websocket.recv(), timeout=5.0)
            data = json.loads(response)
            if data.get("type") == "message":
                print(f"Received broadcast broadcasted content: {data.get('content')}")
                # Verify sanitization
                if "<script>" not in data.get("content") and "<b>" not in data.get("content"):
                    print("SUCCESS: Input was sanitized correctly!")
                else:
                    print("FAILURE: Input was NOT sanitized!")
            else:
                print(f"Received unexpected message type: {data.get('type')}")
        except asyncio.TimeoutError:
            print("Timed out waiting for message broadcast")

if __name__ == "__main__":
    asyncio.run(test_websocket())
