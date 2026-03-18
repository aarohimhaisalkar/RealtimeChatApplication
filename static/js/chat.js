// Authentication and WebSocket management
let ws;
let messageCount = 0;
let onlineUsers = new Map();
let currentUser = null;
let authToken = null;
let displayedMessageIds = new Set();
let currentRoomId = null;
let typingTimeout = null;
let isTyping = false;

// Authentication functions
function getAuthInfo() {
    const token = localStorage.getItem('access_token') || sessionStorage.getItem('access_token');
    const userStr = localStorage.getItem('user_info') || sessionStorage.getItem('user_info');
    
    let user = null;
    if (userStr) {
        try {
            user = JSON.parse(userStr);
        } catch (e) {
            console.error('Failed to parse user info:', e);
        }
    }
    
    return { token, user };
}

function setAuthInfo(token, refreshToken, user) {
    // Store tokens and user info
    localStorage.setItem('access_token', token);
    localStorage.setItem('refresh_token', refreshToken);
    localStorage.setItem('user_info', JSON.stringify(user));
    
    authToken = token;
    currentUser = user;
}

function clearAuthInfo() {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('user_info');
    sessionStorage.removeItem('access_token');
    sessionStorage.removeItem('refresh_token');
    sessionStorage.removeItem('user_info');
    
    authToken = null;
    currentUser = null;
}

async function refreshAccessToken() {
    const refreshToken = localStorage.getItem('refresh_token') || sessionStorage.getItem('refresh_token');
    if (!refreshToken) return false;
    
    try {
        const formData = new FormData();
        formData.append('refresh_token', refreshToken);
        
        const response = await fetch('/api/refresh', {
            method: 'POST',
            body: formData
        });
        
        if (response.ok) {
            const data = await response.json();
            localStorage.setItem('access_token', data.access_token);
            sessionStorage.setItem('access_token', data.access_token);
            authToken = data.access_token;
            return true;
        }
    } catch (error) {
        console.error('Token refresh failed:', error);
    }
    
    return false;
}

function startTokenRefreshTimer() {
    // Refresh token every 25 minutes (tokens expire after 30 minutes)
    setInterval(async () => {
        if (isAuthenticated()) {
            const refreshed = await refreshAccessToken();
            if (!refreshed) {
                console.error('Failed to refresh token, logging out...');
                logout();
            }
        }
    }, 25 * 60 * 1000);
}

// DOM elements
const messagesContainer = document.getElementById('messagesContainer');
const messageForm = document.getElementById('messageForm');
const messageInput = document.getElementById('messageInput');
const usersList = document.getElementById('usersList');
const currentUserSpan = document.getElementById('currentUser');
const searchInput = document.getElementById('searchInput');
const clearChatBtn = document.getElementById('clearChatBtn');
const userCountSpan = document.getElementById('userCount');
const messageCountSpan = document.getElementById('messageCount');
const activeCountSpan = document.getElementById('activeCount');
const connectionStatusSpan = document.getElementById('connectionStatus');
const charCountSpan = document.getElementById('charCount');
const roomsList = document.getElementById('roomsList');
const activeRoomName = document.getElementById('activeRoomName');
const typingIndicator = document.getElementById('typingIndicator');
const typingText = document.getElementById('typingText');
const notificationSound = document.getElementById('notificationSound');

// Room options elements
const addRoomBtn = document.getElementById('addRoomBtn');
const roomOptionsDropdown = document.getElementById('roomOptionsDropdown');
const createRoomBtn = document.getElementById('createRoomBtn');
const joinRoomBtn = document.getElementById('joinRoomBtn');
const browseRoomsBtn = document.getElementById('browseRoomsBtn');
const inviteRoomBtn = document.getElementById('inviteRoomBtn');

// Real-time options elements
const realtimeOptionsBtn = document.getElementById('realtimeOptionsBtn');
const realtimeOptionsDropdown = document.getElementById('realtimeOptionsDropdown');
const notificationSettingsBtn = document.getElementById('notificationSettingsBtn');
const typingIndicatorBtn = document.getElementById('typingIndicatorBtn');

// Multi-user elements
const multiUserBtn = document.getElementById('multiUserBtn');
const multiUserDropdown = document.getElementById('multiUserDropdown');
const viewProfileBtn = document.getElementById('viewProfileBtn');
const onlineUsersBtn = document.getElementById('onlineUsersBtn');
const searchUsersBtn = document.getElementById('searchUsersBtn');
const privateMessageBtn = document.getElementById('privateMessageBtn');


// Check if user is authenticated
function isAuthenticated() {
    const { token, user } = getAuthInfo();
    return token !== null && user !== null;
}

function checkAuthentication() {
    if (!isAuthenticated()) {
        console.log('User not authenticated, redirecting to login...');
        window.location.href = '/';
        return false;
    }
    
    // Additional token validation
    const { token } = getAuthInfo();
    if (!token || token.length < 10) {
        console.log('Invalid token format, clearing auth...');
        clearAuthInfo();
        window.location.href = '/';
        return false;
    }
    
    return true;
}

function initChat() {
    if (!checkAuthentication()) {
        return;
    }
    
    // Check for invite parameters
    const urlParams = new URLSearchParams(window.location.search);
    const inviteRoomId = urlParams.get('room');
    const inviteRoomName = urlParams.get('name');
    
    if (inviteRoomId && inviteRoomName) {
        showSystemMessage(`You've been invited to join the "${inviteRoomName}" room! Look for it in the rooms list.`, 'info');
        console.log('Invite parameters detected:', { roomId: inviteRoomId, roomName: inviteRoomName });
    }
    
    const { token, user } = getAuthInfo();
    
    // Set global variables
    authToken = token;
    currentUser = user;
    
    if (currentUserSpan) {
        currentUserSpan.textContent = user.username;
    }
    
    // Start automatic token refresh
    startTokenRefreshTimer();
    
    connectWebSocket();
    
    if (messageForm) {
        messageForm.addEventListener('submit', sendMessage);
    }
    
    if (messageInput) {
        messageInput.addEventListener('input', () => {
            updateCharCount();
            handleTyping();
        });
        messageInput.focus();
    }

    if (searchInput) {
        searchInput.addEventListener('input', debounce(handleSearch, 500));
    }

    if (clearChatBtn) {
        clearChatBtn.addEventListener('click', handleClearChat);
    }

    // Initialize room options
    if (addRoomBtn) {
        addRoomBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            console.log('Add room button clicked');
            
            const isVisible = roomOptionsDropdown.style.display === 'block';
            roomOptionsDropdown.style.display = isVisible ? 'none' : 'block';
        });
    }

    // Handle room option clicks
    if (createRoomBtn) {
        createRoomBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            roomOptionsDropdown.style.display = 'none';
            handleCreateRoom();
        });
    }

    if (joinRoomBtn) {
        joinRoomBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            roomOptionsDropdown.style.display = 'none';
            handleJoinRoom();
        });
    }

    if (browseRoomsBtn) {
        browseRoomsBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            roomOptionsDropdown.style.display = 'none';
            handleBrowseRooms();
        });
    }

    if (inviteRoomBtn) {
        inviteRoomBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            roomOptionsDropdown.style.display = 'none';
            handleInviteRoom();
        });
    }

    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
        if (!addRoomBtn.contains(e.target) && !roomOptionsDropdown.contains(e.target)) {
            roomOptionsDropdown.style.display = 'none';
        }
        if (!realtimeOptionsBtn.contains(e.target) && !realtimeOptionsDropdown.contains(e.target)) {
            realtimeOptionsDropdown.style.display = 'none';
        }
        if (!multiUserBtn.contains(e.target) && !multiUserDropdown.contains(e.target)) {
            multiUserDropdown.style.display = 'none';
        }
    });

    // Initialize multi-user options
    if (multiUserBtn) {
        console.log('Multi-user button found:', multiUserBtn);
        multiUserBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            console.log('Multi-user button clicked');
            
            const isVisible = multiUserDropdown.style.display === 'block';
            multiUserDropdown.style.display = isVisible ? 'none' : 'block';
            console.log('Dropdown visibility:', multiUserDropdown.style.display);
        });
    } else {
        console.log('Multi-user button NOT found');
    }

    // Handle multi-user option clicks
    if (viewProfileBtn) {
        viewProfileBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            multiUserDropdown.style.display = 'none';
            handleViewProfile();
        });
    }

    if (onlineUsersBtn) {
        onlineUsersBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            multiUserDropdown.style.display = 'none';
            handleOnlineUsers();
        });
    }

    if (searchUsersBtn) {
        searchUsersBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            multiUserDropdown.style.display = 'none';
            handleSearchUsers();
        });
    }

    if (privateMessageBtn) {
        privateMessageBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            console.log('Private message button clicked');
            multiUserDropdown.style.display = 'none';
            handlePrivateMessage();
        });
    } else {
        console.log('Private message button NOT found');
    }

    // Initialize real-time options
    if (realtimeOptionsBtn) {
        realtimeOptionsBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            console.log('Real-time options button clicked');
            
            const isVisible = realtimeOptionsDropdown.style.display === 'block';
            realtimeOptionsDropdown.style.display = isVisible ? 'none' : 'block';
        });
    }

    // Handle real-time option clicks
    if (notificationSettingsBtn) {
        notificationSettingsBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            realtimeOptionsDropdown.style.display = 'none';
            handleNotificationSettings();
        });
    }

    if (typingIndicatorBtn) {
        typingIndicatorBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            realtimeOptionsDropdown.style.display = 'none';
            handleTypingIndicatorSettings();
        });
    }

    if (roomsList) {
        roomsList.addEventListener('click', (e) => {
            const roomItem = e.target.closest('.room-item');
            if (roomItem) {
                const roomId = roomItem.dataset.roomId === 'null' ? null : parseInt(roomItem.dataset.roomId);
                const roomName = roomItem.innerText.trim();
                switchRoom(roomId, roomName);
            }
        });
    }

    // Mobile Sidebar Toggle
    const mobileToggle = document.getElementById('mobileToggle');
    const sidebar = document.getElementById('sidebar');
    if (mobileToggle && sidebar) {
        mobileToggle.addEventListener('click', () => {
            sidebar.classList.toggle('open');
        });
        
        document.addEventListener('click', (e) => {
            if (window.innerWidth <= 768 && 
                sidebar.classList.contains('open') && 
                !sidebar.contains(e.target) && 
                e.target !== mobileToggle && 
                !mobileToggle.contains(e.target)) {
                sidebar.classList.remove('open');
            }
        });
    }
    
    // Initialize Emoji Picker and File Upload
    initEmojiPicker();
    initFileUpload();
    
    // Add debug button functionality
    const debugBtn = document.getElementById('debugBtn');
    if (debugBtn) {
        debugBtn.addEventListener('click', async () => {
            try {
                const testResponse = await fetch('/api/test');
                const result = await testResponse.json();
                console.log('Debug - API Test Result:', result);
                alert('API Test: ' + JSON.stringify(result));
            } catch (error) {
                console.error('Debug - API Test Failed:', error);
                alert('API Test Failed: ' + error.message);
            }
        });
    }

    const leaveChatBtn = document.getElementById('leaveChatBtn');
    if (leaveChatBtn) {
        leaveChatBtn.addEventListener('click', leaveChat);
    }

    // Add emoji debug button
    const emojiDebugBtn = document.getElementById('emojiDebugBtn');
    if (emojiDebugBtn) {
        emojiDebugBtn.addEventListener('click', () => {
            const emojiPicker = document.getElementById('emojiPicker');
            const emojiBtn = document.getElementById('emojiBtn');
            
            console.log('🔍 Emoji Debug Info:');
            console.log('  - emojiPicker element:', emojiPicker);
            console.log('  - emojiPicker display:', emojiPicker?.style.display);
            console.log('  - emojiPicker visibility:', window.getComputedStyle(emojiPicker).display);
            console.log('  - emojiBtn element:', emojiBtn);
            console.log('  - emojiPicker parent:', emojiPicker?.parentElement);
            
            // Force show the emoji picker
            if (emojiPicker) {
                emojiPicker.style.display = 'block';
                emojiPicker.style.position = 'absolute';
                emojiPicker.style.zIndex = '9999';
                emojiPicker.style.background = 'red'; // Make it visible for debugging
                console.log('🎯 Emoji picker forced to show');
            }
        });
    }

    // Add manual emoji toggle button
    const manualEmojiBtn = document.getElementById('manualEmojiBtn');
    if (manualEmojiBtn) {
        manualEmojiBtn.addEventListener('click', () => {
            const emojiPicker = document.getElementById('emojiPicker');
            if (emojiPicker) {
                const isHidden = emojiPicker.style.display === 'none' || emojiPicker.style.display === '';
                emojiPicker.style.display = isHidden ? 'block' : 'none';
                emojiPicker.style.background = ''; // Remove red background
                console.log('🎯 Manual emoji toggle:', isHidden ? 'SHOWING' : 'HIDING');
            }
        });
    }

    updateConnectionStatus('connecting');
}

function connectWebSocket() {
    if (!authToken) {
        console.log('No auth token available, clearing auth info...');
        clearAuthInfo();
        window.location.href = '/';
        return;
    }
    
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/${authToken}?t=${Date.now()}`;
    
    console.log('Attempting WebSocket connection...');
    
    ws = new WebSocket(wsUrl);
    
    ws.onopen = function() {
        console.log('Connected to chat server');
        updateConnectionStatus('connected');
        showSystemMessage('Connected to chat', 'success');
    };
    
    ws.onmessage = function(event) {
        const data = JSON.parse(event.data);
        handleMessage(data);
    };
    
    ws.onclose = function(event) {
        console.log('Disconnected from chat server, code:', event.code);
        updateConnectionStatus('disconnected');
        
        // If authentication failed (code 4001), clear auth and redirect
        if (event.code === 4001) {
            console.log('Authentication failed, clearing tokens...');
            clearAuthInfo();
            showSystemMessage('Authentication expired. Please login again.', 'error');
            setTimeout(() => {
                window.location.href = '/';
            }, 2000);
            return;
        }
        
        showSystemMessage('Disconnected. Reconnecting...', 'error');
        setTimeout(() => {
            if (isAuthenticated()) connectWebSocket();
        }, 3000);
    };

    ws.onerror = function(error) {
        console.log('WebSocket error:', error);
        updateConnectionStatus('error');
        showSystemMessage('Connection error. Please refresh the page.', 'error');
    };
}

function handleMessage(data) {
    if (data.type === 'message') {
        const msgId = data.id || `${data.username}-${data.timestamp}`;
        if (displayedMessageIds.has(msgId)) return;
        displayedMessageIds.add(msgId);
        
        showMessage(data.username, data.content, data.timestamp, data.id, data.is_edited, data.is_deleted);
        messageCount++;
        updateMessageCount();
        
        if (document.hidden && notificationSound) {
            const notificationSettings = JSON.parse(localStorage.getItem('notificationSettings') || '{}');
            if (notificationSettings.sound !== false) {
                notificationSound.play().catch(e => console.log('Audio play blocked'));
            }
        }

        // Send read receipt if active room
        if (!document.hidden && data.id) {
            ws.send(JSON.stringify({ type: 'read_receipt', message_id: data.id }));
        }

    } else if (data.type === 'file') {
        const msgId = `file-${data.username}-${data.timestamp}`;
        if (displayedMessageIds.has(msgId)) return;
        displayedMessageIds.add(msgId);
        
        displayFileMessage(data, data.username === currentUser?.username);
        messageCount++;
        updateMessageCount();
        
        if (document.hidden && notificationSound) {
            const notificationSettings = JSON.parse(localStorage.getItem('notificationSettings') || '{}');
            if (notificationSettings.sound !== false) {
                notificationSound.play().catch(e => console.log('Audio play blocked'));
            }
        }
    } else if (data.type === 'image') {
        const msgId = `image-${data.username}-${data.timestamp}`;
        if (displayedMessageIds.has(msgId)) return;
        displayedMessageIds.add(msgId);
        
        addImageMessageToChat(data.username, data.content, data.image_url, data.file_size, data.timestamp);
        messageCount++;
        updateMessageCount();
        
        if (document.hidden && notificationSound) {
            const notificationSettings = JSON.parse(localStorage.getItem('notificationSettings') || '{}');
            if (notificationSettings.sound !== false) {
                notificationSound.play().catch(e => console.log('Audio play blocked'));
            }
        }
    } else if (data.type === 'message_deleted') {
        // Handle message deletion
        const messageDiv = document.querySelector(`.message-wrapper[data-id="${data.message_id}"]`);
        if (messageDiv) {
            const messageBubble = messageDiv.querySelector('.message-bubble');
            if (messageBubble) {
                messageBubble.innerHTML = '<i>[This message was deleted]</i>';
                // Remove delete button after deletion
                const deleteBtn = messageBubble.querySelector('.delete-btn');
                if (deleteBtn) {
                    deleteBtn.remove();
                }
            }
        }
    } else if (data.type === 'chat_cleared') {
        // Handle chat cleared
        messagesContainer.innerHTML = '';
        messageCount = 0;
        updateMessageCount();
        showSystemMessage(`${data.username} cleared the chat history`, 'info');
    } else if (data.type === 'room_created') {
        // Handle room created
        showSystemMessage(`Room '${data.room_name}' created successfully!`, 'success');
        console.log('Room created:', data);
    } else if (data.type === 'room_joined') {
        // Handle room joined
        showSystemMessage(data.message, 'success');
        console.log('Room joined:', data);
    } else if (data.type === 'rooms_list') {
        // Handle rooms list
        console.log('Available rooms:', data.rooms);
        showRoomsList(data.rooms);
    } else if (data.type === 'room_deleted') {
        // Handle room deleted
        showSystemMessage('Room deleted successfully!', 'success');
        console.log('Room deleted:', data.room_id);
        
        // If we were in the deleted room, switch to Global Chat
        if (currentRoomId === data.room_id) {
            switchRoom(null, 'Global Chat');
        }
    } else if (data.type === 'error') {
        // Handle error messages
        showSystemMessage(data.message, 'error');
    } else if (data.type === 'system') {
        showSystemMessage(data.content);
    } else if (data.type === 'users_update') {
        updateUsersList(data.users);
    } else if (data.type === 'typing') {
        updateTypingIndicator(data.username, data.is_typing);
    } else if (data.type === 'rooms_update') {
        updateRoomsList(data.room_details);
    } else if (data.type === 'online_users_list') {
        // Handle online users list
        console.log('Online users:', data.users);
        displayOnlineUsers(data.users);
    } else if (data.type === 'search_users_results') {
        // Handle search users results
        console.log('Search results:', data.users);
        displaySearchResults(data.query, data.users);
    } else if (data.type === 'private_message') {
        // Handle private message
        alert('PRIVATE MESSAGE RECEIVED: ' + JSON.stringify(data));
        console.log('Private message received:', data);
        console.log('Current user:', currentUser?.username);
        console.log('Message recipient:', data.recipient);
        console.log('Message sender:', data.sender);
        
        if (data.recipient === currentUser?.username) {
            // Message received from someone
            console.log('Displaying received private message');
            showPrivateMessage(data.sender, data.content, data.timestamp);
            showSystemMessage(`📩 Private message from ${data.sender}`, 'info');
            playNotificationSound(); // Play sound for private messages
        } else if (data.sender === currentUser?.username) {
            // Message sent by us (confirmation)
            console.log('Displaying sent private message');
            showPrivateMessage(data.sender, data.content, data.timestamp, true);
            showSystemMessage(`📤 Private message sent to ${data.recipient}`, 'success');
        } else {
            console.log('Private message not for this user');
        }
    } else if (data.type === 'read_receipt') {
        markAsRead(data.message_id);
    }
}

function sendMessage(e) {
    e.preventDefault();
    const content = messageInput.value.trim();
    if (!content) return;
    
    if (ws && ws.readyState === WebSocket.OPEN) {
        const timestamp = new Date().toISOString();
        ws.send(JSON.stringify({ 
            type: 'message', 
            content: content, 
            room_id: currentRoomId,
            timestamp: timestamp
        }));
        messageInput.value = '';
        updateCharCount();
        stopTyping();
    } else {
        showSystemMessage('Not connected to chat server', 'error');
    }
}

function handleClearChat() {
    if (!confirm('Are you sure you want to clear all chat history? This action cannot be undone.')) {
        return;
    }
    
    if (ws && ws.readyState === WebSocket.OPEN) {
        // Send clear chat request to server
        ws.send(JSON.stringify({
            type: 'clear_chat',
            room_id: currentRoomId
        }));
        
        // Clear local display immediately
        messagesContainer.innerHTML = '';
        messageCount = 0;
        updateMessageCount();
        
        showSystemMessage('Chat history cleared', 'info');
        console.log('Chat clear request sent');
    } else {
        showSystemMessage('Not connected to chat server', 'error');
    }
}

function handleCreateRoom() {
    const roomName = prompt('Enter room name:');
    if (roomName && roomName.trim()) {
        const roomDescription = prompt('Enter room description (optional):') || '';
        
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
                type: 'create_room',
                room_name: roomName.trim(),
                room_description: roomDescription.trim()
            }));
            console.log('Create room request sent:', roomName);
        } else {
            showSystemMessage('Not connected to chat server', 'error');
        }
    }
}

function handleJoinRoom() {
    const roomCode = prompt('Enter room code or invitation:');
    if (roomCode && roomCode.trim()) {
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
                type: 'join_room',
                room_code: roomCode.trim()
            }));
            console.log('Join room request sent:', roomCode);
        } else {
            showSystemMessage('Not connected to chat server', 'error');
        }
    }
}

function handleBrowseRooms() {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
            type: 'browse_rooms'
        }));
        console.log('Browse rooms request sent');
    } else {
        showSystemMessage('Not connected to chat server', 'error');
    }
}

function handleInviteRoom() {
    // Generate a proper invite link
    const roomName = activeRoomName ? activeRoomName.textContent : 'Global Chat';
    const roomId = currentRoomId || 'global';
    const inviteLink = `${window.location.origin}/chat?room=${roomId}&name=${encodeURIComponent(roomName)}`;
    
    // Copy to clipboard
    navigator.clipboard.writeText(inviteLink).then(() => {
        showSystemMessage('Invite link copied to clipboard!', 'success');
        console.log('Invite link copied:', inviteLink);
    }).catch(err => {
        // Fallback: show modal with link
        const shareLink = prompt('Share this invite link:', inviteLink);
        if (shareLink) {
            showSystemMessage('Invite link ready to share!', 'success');
        }
    });
}

function handleNotificationSettings() {
    // Create notification settings modal
    const modal = document.createElement('div');
    modal.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: var(--color-slate-800);
        border: 1px solid var(--color-slate-600);
        border-radius: 0.5rem;
        padding: 2rem;
        max-width: 400px;
        z-index: 1000;
        box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
    `;
    
    modal.innerHTML = `
        <h3 style="color: white; margin: 0 0 1.5rem 0;">🔔 Notification Settings</h3>
        
        <div style="margin-bottom: 1rem;">
            <label style="color: white; display: flex; align-items: center; gap: 0.5rem; cursor: pointer;">
                <input type="checkbox" id="soundNotifications" checked style="width: 1rem; height: 1rem;">
                <span>Sound Notifications</span>
            </label>
        </div>
        
        <div style="margin-bottom: 1rem;">
            <label style="color: white; display: flex; align-items: center; gap: 0.5rem; cursor: pointer;">
                <input type="checkbox" id="desktopNotifications" style="width: 1rem; height: 1rem;">
                <span>Desktop Notifications</span>
            </label>
        </div>
        
        <div style="margin-bottom: 1.5rem;">
            <label style="color: white; display: flex; align-items: center; gap: 0.5rem; cursor: pointer;">
                <input type="checkbox" id="messageAlerts" checked style="width: 1rem; height: 1rem;">
                <span>Message Alerts</span>
            </label>
        </div>
        
        <div style="display: flex; gap: 1rem; justify-content: flex-end;">
            <button id="cancelNotifications" style="background: var(--color-slate-600); color: white; border: none; padding: 0.5rem 1rem; border-radius: 0.25rem; cursor: pointer;">Cancel</button>
            <button id="saveNotifications" style="background: var(--color-indigo-600); color: white; border: none; padding: 0.5rem 1rem; border-radius: 0.25rem; cursor: pointer;">Save</button>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // Load current settings
    const settings = JSON.parse(localStorage.getItem('notificationSettings') || '{}');
    document.getElementById('soundNotifications').checked = settings.sound !== false;
    document.getElementById('desktopNotifications').checked = settings.desktop === true;
    document.getElementById('messageAlerts').checked = settings.messageAlerts !== false;
    
    // Handle save
    document.getElementById('saveNotifications').onclick = () => {
        const newSettings = {
            sound: document.getElementById('soundNotifications').checked,
            desktop: document.getElementById('desktopNotifications').checked,
            messageAlerts: document.getElementById('messageAlerts').checked
        };
        
        localStorage.setItem('notificationSettings', JSON.stringify(newSettings));
        showSystemMessage('Notification settings saved!', 'success');
        document.body.removeChild(modal);
    };
    
    // Handle cancel
    document.getElementById('cancelNotifications').onclick = () => {
        document.body.removeChild(modal);
    };
}

function handleTypingIndicatorSettings() {
    // Create typing indicator settings modal
    const modal = document.createElement('div');
    modal.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: var(--color-slate-800);
        border: 1px solid var(--color-slate-600);
        border-radius: 0.5rem;
        padding: 2rem;
        max-width: 400px;
        z-index: 1000;
        box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
    `;
    
    modal.innerHTML = `
        <h3 style="color: white; margin: 0 0 1.5rem 0;">📊 Live Typing Indicators</h3>
        
        <div style="margin-bottom: 1rem;">
            <label style="color: white; display: flex; align-items: center; gap: 0.5rem; cursor: pointer;">
                <input type="checkbox" id="showTyping" checked style="width: 1rem; height: 1rem;">
                <span>Show When Others Are Typing</span>
            </label>
        </div>
        
        <div style="margin-bottom: 1rem;">
            <label style="color: white; display: flex; align-items: center; gap: 0.5rem; cursor: pointer;">
                <input type="checkbox" id="sendTyping" checked style="width: 1rem; height: 1rem;">
                <span>Send My Typing Status</span>
            </label>
        </div>
        
        <div style="margin-bottom: 1.5rem;">
            <label style="color: white; display: flex; align-items: center; gap: 0.5rem; cursor: pointer;">
                <input type="checkbox" id="typingSounds" style="width: 1rem; height: 1rem;">
                <span>Typing Sound Effects</span>
            </label>
        </div>
        
        <div style="display: flex; gap: 1rem; justify-content: flex-end;">
            <button id="cancelTyping" style="background: var(--color-slate-600); color: white; border: none; padding: 0.5rem 1rem; border-radius: 0.25rem; cursor: pointer;">Cancel</button>
            <button id="saveTyping" style="background: var(--color-indigo-600); color: white; border: none; padding: 0.5rem 1rem; border-radius: 0.25rem; cursor: pointer;">Save</button>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // Load current settings
    const settings = JSON.parse(localStorage.getItem('typingSettings') || '{}');
    document.getElementById('showTyping').checked = settings.showTyping !== false;
    document.getElementById('sendTyping').checked = settings.sendTyping !== false;
    document.getElementById('typingSounds').checked = settings.typingSounds === true;
    
    // Handle save
    document.getElementById('saveTyping').onclick = () => {
        const newSettings = {
            showTyping: document.getElementById('showTyping').checked,
            sendTyping: document.getElementById('sendTyping').checked,
            typingSounds: document.getElementById('typingSounds').checked
        };
        
        localStorage.setItem('typingSettings', JSON.stringify(newSettings));
        showSystemMessage('Typing indicator settings saved!', 'success');
        document.body.removeChild(modal);
    };
    
    // Handle cancel
    document.getElementById('cancelTyping').onclick = () => {
        document.body.removeChild(modal);
    };
}

function handleViewProfile() {
    // Create user profile modal
    const modal = document.createElement('div');
    modal.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: var(--color-slate-800);
        border: 1px solid var(--color-slate-600);
        border-radius: 0.5rem;
        padding: 2rem;
        max-width: 400px;
        z-index: 1000;
        box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
    `;
    
    modal.innerHTML = `
        <h3 style="color: white; margin: 0 0 1.5rem 0;">👤 User Profile</h3>
        
        <div style="margin-bottom: 1rem;">
            <label style="color: white; display: block; margin-bottom: 0.5rem;">Username:</label>
            <input type="text" id="profileUsername" value="${currentUser?.username || ''}" readonly style="background: var(--color-slate-700); color: white; border: 1px solid var(--color-slate-600); padding: 0.5rem; border-radius: 0.25rem; width: 100%; box-sizing: border-box;">
        </div>
        
        <div style="margin-bottom: 1rem;">
            <label style="color: white; display: block; margin-bottom: 0.5rem;">Email:</label>
            <input type="email" id="profileEmail" value="${currentUser?.email || ''}" readonly style="background: var(--color-slate-700); color: white; border: 1px solid var(--color-slate-600); padding: 0.5rem; border-radius: 0.25rem; width: 100%; box-sizing: border-box;">
        </div>
        
        <div style="margin-bottom: 1.5rem;">
            <label style="color: white; display: block; margin-bottom: 0.5rem;">Full Name:</label>
            <input type="text" id="profileFullName" value="${currentUser?.full_name || ''}" readonly style="background: var(--color-slate-700); color: white; border: 1px solid var(--color-slate-600); padding: 0.5rem; border-radius: 0.25rem; width: 100%; box-sizing: border-box;">
        </div>
        
        <div style="display: flex; gap: 1rem; justify-content: flex-end;">
            <button id="closeProfile" style="background: var(--color-slate-600); color: white; border: none; padding: 0.5rem 1rem; border-radius: 0.25rem; cursor: pointer;">Close</button>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // Handle close
    document.getElementById('closeProfile').onclick = () => {
        document.body.removeChild(modal);
    };
}

function handleOnlineUsers() {
    // Create online users modal
    const modal = document.createElement('div');
    modal.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: var(--color-slate-800);
        border: 1px solid var(--color-slate-600);
        border-radius: 0.5rem;
        padding: 2rem;
        max-width: 400px;
        max-height: 500px;
        z-index: 1000;
        box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
        overflow-y: auto;
    `;
    
    modal.innerHTML = `
        <h3 style="color: white; margin: 0 0 1.5rem 0;">📊 Online Users</h3>
        
        <div id="onlineUsersList" style="margin-bottom: 1.5rem;">
            <p style="color: #94a3b8;">Loading online users...</p>
        </div>
        
        <div style="display: flex; gap: 1rem; justify-content: flex-end;">
            <button id="closeOnlineUsers" style="background: var(--color-slate-600); color: white; border: none; padding: 0.5rem 1rem; border-radius: 0.25rem; cursor: pointer;">Close</button>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // Request online users list
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'get_online_users' }));
    }
    
    // Handle close
    document.getElementById('closeOnlineUsers').onclick = () => {
        document.body.removeChild(modal);
    };
}

function handleSearchUsers() {
    const searchTerm = prompt('Enter username to search:');
    if (searchTerm && searchTerm.trim()) {
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
                type: 'search_users',
                query: searchTerm.trim()
            }));
            console.log('Search users request sent:', searchTerm);
        } else {
            showSystemMessage('Not connected to chat server', 'error');
        }
    }
}

function handlePrivateMessage() {
    alert('handlePrivateMessage called!');
    console.log('handlePrivateMessage called');
    const recipient = prompt('Enter username to send private message:');
    if (recipient && recipient.trim()) {
        const message = prompt(`Enter message to send to ${recipient}:`);
        if (message && message.trim()) {
            alert('Sending private message: ' + recipient + ' -> ' + message);
            console.log('Sending private message:', { recipient, message });
            if (ws && ws.readyState === WebSocket.OPEN) {
                const privateMessageData = {
                    type: 'private_message',
                    recipient: recipient.trim(),
                    content: message.trim(),
                    room_id: currentRoomId
                };
                console.log('WebSocket data:', privateMessageData);
                ws.send(JSON.stringify(privateMessageData));
                showSystemMessage(`Private message sent to ${recipient}`, 'success');
                console.log('Private message sent:', { recipient, message });
            } else {
                console.log('WebSocket not connected');
                showSystemMessage('Not connected to chat server', 'error');
            }
        }
    }
}

function handleTyping() {
    if (!isTyping) {
        isTyping = true;
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'typing', is_typing: true, room_id: currentRoomId }));
        }
    }
    
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(stopTyping, 2000);
}

function stopTyping() {
    if (isTyping) {
        isTyping = false;
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'typing', is_typing: false, room_id: currentRoomId }));
        }
    }
}

function updateTypingIndicator(username, is_typing) {
    const typingSettings = JSON.parse(localStorage.getItem('typingSettings') || '{}');
    
    // Don't show typing indicators if user disabled it
    if (typingSettings.showTyping === false) {
        return;
    }
    
    if (!currentUser || username === currentUser.username) return;
    
    if (is_typing) {
        typingText.textContent = `${username} is typing...`;
        typingIndicator.classList.add('visible');
    } else {
        typingIndicator.classList.remove('visible');
    }
}

function deleteRoom(roomId, roomName) {
    if (!confirm(`Are you sure you want to delete the room "${roomName}"? This action cannot be undone.`)) {
        return;
    }
    
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
            type: 'delete_room',
            room_id: roomId
        }));
        
        console.log('Delete room request sent:', roomId, roomName);
    } else {
        showSystemMessage('Not connected to chat server', 'error');
    }
}

function switchRoom(roomId, roomName) {
    if (currentRoomId === roomId) return;
    
    currentRoomId = roomId;
    if (activeRoomName) activeRoomName.textContent = roomName;
    messagesContainer.innerHTML = '';
    displayedMessageIds.clear();
    
    // Highlight active room
    document.querySelectorAll('.room-item').forEach(item => {
        const id = item.dataset.roomId === 'null' ? null : parseInt(item.dataset.roomId);
        item.classList.toggle('active', id === roomId);
    });

    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'join_room', room_id: roomId }));
    }
}

function updateRoomsList(rooms) {
    if (!roomsList) return;
    const globalChat = `<div class="room-item ${currentRoomId === null ? 'active' : ''}" data-room-id="null"><i class="fas fa-globe mr-2"></i>Global Chat</div>`;
    roomsList.innerHTML = globalChat + rooms.map(room => `
        <div class="room-item ${currentRoomId === room.id ? 'active' : ''}" data-room-id="${room.id}">
            <div class="room-content">
                <i class="fas fa-hashtag mr-2"></i>${escapeHtml(room.name)}
            </div>
            <button class="delete-room-btn" onclick="deleteRoom(${room.id}, '${escapeHtml(room.name)}')" title="Delete Room">
                <i class="fas fa-trash"></i>
            </button>
        </div>
    `).join('');
}

async function handleSearch() {
    const query = searchInput.value.trim();
    if (query.length < 2) return;

    try {
        const response = await fetch(`/api/messages/search?q=${encodeURIComponent(query)}`);
        const results = await response.json();
        
        if (results.length > 0) {
            showSystemMessage(`Found ${results.length} results for "${query}"`, 'info');
            // Advanced: filter UI or show results panel
        } else {
            showSystemMessage(`No results found for "${query}"`, 'info');
        }
    } catch (e) {
        console.error('Search failed', e);
    }
}

function showMessage(username, content, timestamp, id, isEdited, isDeleted) {
    const isOwnMessage = currentUser && username === currentUser.username;
    console.log('showMessage called with ID:', id, 'isOwnMessage:', isOwnMessage);
    
    const messageDiv = document.createElement('div');
    messageDiv.className = `message-wrapper ${isOwnMessage ? 'message-own' : 'message-other'}`;
    if (id) {
        messageDiv.dataset.id = id;
        console.log('Set message ID on element:', id);
    } else {
        console.log('No message ID available');
    }
    
    const authorHtml = !isOwnMessage ? `<div class="text-xs text-slate-400 mb-1">${escapeHtml(username)}</div>` : '';
    const editedHtml = isEdited ? '<span class="text-[10px] opacity-50 ml-1">(edited)</span>' : '';
    const readHtml = isOwnMessage && id ? '<span class="read-status text-[10px] ml-1"><i class="fas fa-check"></i></span>' : '';
    
    // Add delete option for own messages
    const deleteOptionHtml = isOwnMessage && id ? `
        <div class="message-options">
            <button type="button" class="delete-btn" onclick="deleteMessage('${id}')" title="Delete message" style="color: white !important;">
                <i class="fas fa-trash" style="color: white !important;"></i>
            </button>
        </div>
    ` : '';

    console.log('Delete option HTML added:', isOwnMessage && id ? 'YES' : 'NO');

    messageDiv.innerHTML = `
        <div class="flex flex-col" style="max-width: 80%;">
            ${authorHtml}
            <div class="message-bubble ${isOwnMessage ? 'own-message' : ''}">
                ${isDeleted ? '<i>[This message was deleted]</i>' : escapeHtml(content)}
                ${deleteOptionHtml}
            </div>
            <div class="message-meta">
                ${formatTime(timestamp)}${editedHtml}${readHtml}
            </div>
        </div>
    `;
    
    messagesContainer.appendChild(messageDiv);
    scrollToBottom();
}

function deleteMessage(messageId) {
    console.log('Delete message called with ID:', messageId);
    
    if (!confirm('Are you sure you want to delete this message?')) {
        return;
    }
    
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
            type: 'delete_message',
            message_id: messageId
        }));
        
        console.log('Delete message sent to server:', messageId);
        
        // Remove message from local display immediately
        const messageDiv = document.querySelector(`.message-wrapper[data-id="${messageId}"]`);
        if (messageDiv) {
            const messageBubble = messageDiv.querySelector('.message-bubble');
            if (messageBubble) {
                messageBubble.innerHTML = '<i>[This message was deleted]</i>';
                // Remove delete button after deletion
                const deleteBtn = messageBubble.querySelector('.delete-btn');
                if (deleteBtn) {
                    deleteBtn.remove();
                }
            }
        } else {
            console.log('Message div not found for ID:', messageId);
        }
        
        console.log('Message deletion requested:', messageId);
    } else {
        showSystemMessage('Not connected to chat server', 'error');
    }
}

function markAsRead(messageId) {
    const msgDiv = document.querySelector(`.message-wrapper[data-id="${messageId}"]`);
    if (msgDiv) {
        const status = msgDiv.querySelector('.read-status');
        if (status) status.innerHTML = '<i class="fas fa-check-double text-indigo-400"></i>';
    }
}

function logout() {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    sessionStorage.removeItem('access_token');
    sessionStorage.removeItem('refresh_token');
    localStorage.removeItem('user_info');
    if (ws) ws.close();
    window.location.href = '/';
}

function leaveChat() {
    logout();
}

function showSystemMessage(content, type = 'info') {
    if (!messagesContainer) return;
    const messageDiv = document.createElement('div');
    messageDiv.className = 'system-message-wrapper';
    const extraClass = type === 'error' ? 'system-message-error' : '';
    messageDiv.innerHTML = `<div class="system-message ${extraClass}">${escapeHtml(content)}</div>`;
    messagesContainer.appendChild(messageDiv);
    scrollToBottom();
}

function updateUsersList(users) {
    if (!usersList) return;
    usersList.innerHTML = '';
    onlineUsers.clear();
    users.forEach(user => {
        onlineUsers.set(user, true);
        const isCurrentUser = currentUser && user === currentUser.username;
        const userDiv = document.createElement('div');
        userDiv.className = `user-item ${isCurrentUser ? 'current-user' : ''}`;
        userDiv.innerHTML = `
            <div class="relative">
                <div class="user-avatar ${getUserColor(user)}">${getUserInitials(user)}</div>
                <div class="status-dot"></div>
            </div>
            <div class="flex-1">
                <div class="text-sm font-medium ${isCurrentUser ? 'text-indigo-400' : 'text-white'}">
                    ${escapeHtml(user)} ${isCurrentUser ? '(You)' : ''}
                </div>
                <div class="text-xs text-emerald-400">Online</div>
            </div>
        `;
        usersList.appendChild(userDiv);
    });
    updateUserCount();
}

function updateUserCount() {
    if(userCountSpan) userCountSpan.textContent = onlineUsers.size;
    if(activeCountSpan) activeCountSpan.textContent = onlineUsers.size;
}

function updateMessageCount() {
    if(messageCountSpan) messageCountSpan.textContent = messageCount;
}

function updateConnectionStatus(status) {
    if (!connectionStatusSpan) return;
    const statusHtml = {
        connecting: '<i class="fas fa-circle text-yellow-500 mr-2"></i>Connecting...',
        connected: '<i class="fas fa-circle text-emerald-500 mr-2"></i>Connected',
        disconnected: '<i class="fas fa-circle text-red-500 mr-2"></i>Disconnected',
        error: '<i class="fas fa-circle text-red-500 mr-2"></i>Error'
    };
    connectionStatusSpan.innerHTML = statusHtml[status] || statusHtml.disconnected;
}

function updateCharCount() {
    if (!messageInput || !charCountSpan) return;
    const len = messageInput.value.length;
    charCountSpan.textContent = len;
    charCountSpan.style.color = len > 450 ? 'var(--color-red-400)' : (len > 400 ? 'var(--color-yellow-400)' : 'var(--color-slate-400)');
}

function scrollToBottom() {
    if (messagesContainer) messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function getUserColor(username) {
    const colors = ['user-avatar-blue', 'user-avatar-green', 'user-avatar-purple', 'user-avatar-pink', 'user-avatar-indigo', 'user-avatar-red', 'user-avatar-yellow', 'user-avatar-teal'];
    let hash = 0;
    for (let i = 0; i < username.length; i++) hash = username.charCodeAt(i) + ((hash << 5) - hash);
    return colors[Math.abs(hash) % colors.length];
}

function getUserInitials(username) {
    if (!username) return '??';
    const parts = username.trim().split(' ');
    return parts.length >= 2 ? (parts[0][0] + parts[1][0]).toUpperCase() : username.substring(0, 2).toUpperCase();
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function debounce(func, wait) {
    let timeout;
    return function() {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, arguments), wait);
    };
}

// Emoji and File Upload Functions
function initEmojiPicker() {
    const emojiBtn = document.getElementById('emojiBtn');
    const emojiPicker = document.getElementById('emojiPicker');
    const messageInput = document.getElementById('messageInput');
    
    console.log('🎯 Initializing SIMPLE emoji picker...');
    console.log('🔍 Elements found:', {
        emojiBtn: !!emojiBtn,
        emojiPicker: !!emojiPicker,
        messageInput: !!messageInput
    });
    
    if (!emojiBtn || !emojiPicker || !messageInput) {
        console.log('❌ Emoji picker elements not found');
        return;
    }
    
    // Get existing emoji buttons from HTML
    const existingEmojiButtons = emojiPicker.querySelectorAll('.emoji-btn-simple');
    console.log(`🎯 Found ${existingEmojiButtons.length} existing emoji buttons`);
    
    // Add click handlers to existing emoji buttons
    existingEmojiButtons.forEach((emojiButton, index) => {
        const emoji = emojiButton.textContent;
        console.log(`✅ Setting up emoji button ${index}: ${emoji}`);
        
        // Remove existing listeners to prevent duplicates
        const newEmojiButton = emojiButton.cloneNode(true);
        emojiButton.parentNode.replaceChild(newEmojiButton, emojiButton);
        
        // Add click event with debugging
        newEmojiButton.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            console.log('😀 Emoji clicked:', emoji);
            console.log('📝 Message input element:', messageInput);
            console.log('📝 Current value before:', messageInput.value);
            
            if (messageInput) {
                // Insert emoji at cursor position
                const start = messageInput.selectionStart;
                const end = messageInput.selectionEnd;
                const currentValue = messageInput.value;
                
                // Insert emoji at cursor position
                messageInput.value = currentValue.substring(0, start) + emoji + currentValue.substring(end);
                
                // Set cursor position after emoji
                const newPosition = start + emoji.length;
                messageInput.setSelectionRange(newPosition, newPosition);
                
                // Focus back to input
                messageInput.focus();
                
                console.log('✅ Emoji inserted successfully');
                console.log('📝 New value:', messageInput.value);
                
                // Close emoji picker after selection
                emojiPicker.style.display = 'none';
            } else {
                console.error('❌ Message input not found when emoji clicked');
            }
        });
        
        // Add hover effects
        newEmojiButton.addEventListener('mouseenter', () => {
            newEmojiButton.style.background = 'rgba(255, 255, 255, 0.1)';
        });
        
        newEmojiButton.addEventListener('mouseleave', () => {
            newEmojiButton.style.background = 'none';
        });
    });
    
    // Toggle emoji picker
    emojiBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        console.log('🙂 Emoji button clicked');
        
        const isVisible = emojiPicker.style.display === 'block';
        emojiPicker.style.display = isVisible ? 'none' : 'block';
        
        console.log('🎯 Emoji picker visibility:', emojiPicker.style.display);
    });
    
    // Close emoji picker when clicking outside
    document.addEventListener('click', (e) => {
        if (!emojiBtn.contains(e.target) && !emojiPicker.contains(e.target)) {
            emojiPicker.style.display = 'none';
        }
    });
    
    console.log('✅ Simple emoji picker initialized successfully!');
    console.log(`🎉 Set up ${existingEmojiButtons.length} existing emoji buttons`);
}

// Global upload tracking
window.uploadTracker = {
    isUploading: false,
    currentFile: null,
    uploadCount: 0
};

function initFileUpload() {
    console.log('🔧 Initializing file upload...');
    
    const fileBtn = document.getElementById('fileBtn');
    const fileDropdown = document.getElementById('fileDropdown');
    const uploadImageBtn = document.getElementById('uploadImageBtn');
    const uploadDocumentBtn = document.getElementById('uploadDocumentBtn');
    const imageInput = document.getElementById('imageInput');
    const documentInput = document.getElementById('documentInput');
    
    if (!fileBtn || !fileDropdown || !uploadImageBtn || !uploadDocumentBtn || !imageInput || !documentInput) {
        console.log('❌ File upload elements not found');
        console.log('Elements found:', {
            fileBtn: !!fileBtn,
            fileDropdown: !!fileDropdown,
            uploadImageBtn: !!uploadImageBtn,
            uploadDocumentBtn: !!uploadDocumentBtn,
            imageInput: !!imageInput,
            documentInput: !!documentInput
        });
        return;
    }
    
    console.log('✅ All file upload elements found');
    
    // Remove existing event listeners to prevent duplicates
    const newImageInput = imageInput.cloneNode(true);
    imageInput.parentNode.replaceChild(newImageInput, imageInput);
    
    // Handle file button click
    fileBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        console.log('📁 File button clicked');
        
        const isVisible = fileDropdown.style.display === 'block';
        fileDropdown.style.display = isVisible ? 'none' : 'block';
    });
    
    // Handle image upload
    uploadImageBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        console.log('🖼️ Upload image button clicked');
        fileDropdown.style.display = 'none';
        
        if (window.uploadTracker.isUploading) {
            console.log('⏳ Upload already in progress, ignoring...');
            return;
        }
        
        // Use the new cloned input
        const newImageInput = document.getElementById('imageInput');
        newImageInput.click();
    });
    
    // Handle document upload
    uploadDocumentBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        console.log('📄 Upload document button clicked');
        fileDropdown.style.display = 'none';
        
        if (window.uploadTracker.isUploading) {
            console.log('⏳ Upload already in progress, ignoring...');
            return;
        }
        
        const newDocumentInput = document.getElementById('documentInput');
        newDocumentInput.click();
    });
    
    // Handle image selection - ONLY ADD ONCE
    const newImageInputElement = document.getElementById('imageInput');
    newImageInputElement.addEventListener('change', (e) => {
        console.log('🔍 Image input change event triggered');
        console.log('📊 Upload tracker state:', window.uploadTracker);
        
        if (window.uploadTracker.isUploading) {
            console.log('⚠️ Upload already in progress, ignoring duplicate selection');
            return;
        }
        
        const files = Array.from(e.target.files);
        console.log(`📁 Images selected: ${files.length}`);
        
        if (files.length === 0) {
            console.log('❌ No files selected');
            return;
        }
        
        // Process only the first file to prevent duplicates
        const file = files[0];
        console.log(`🚀 Starting upload for: ${file.name}`);
        
        window.uploadTracker.isUploading = true;
        window.uploadTracker.currentFile = file.name;
        window.uploadTracker.uploadCount++;
        
        console.log(`📈 Upload #${window.uploadTracker.uploadCount} started`);
        
        uploadImage(file).finally(() => {
            console.log('✅ Upload completed, resetting tracker');
            window.uploadTracker.isUploading = false;
            window.uploadTracker.currentFile = null;
            
            // Clear file input
            newImageInputElement.value = '';
        });
    }, { once: false }); // Allow multiple uploads but prevent duplicates
    
    // Handle document selection
    const newDocumentInputElement = document.getElementById('documentInput');
    newDocumentInputElement.addEventListener('change', (e) => {
        console.log('🔍 Document input change event triggered');
        
        if (window.uploadTracker.isUploading) {
            console.log('⚠️ Upload already in progress, ignoring duplicate selection');
            return;
        }
        
        const files = Array.from(e.target.files);
        console.log(`📁 Documents selected: ${files.length}`);
        
        if (files.length === 0) return;
        
        const file = files[0];
        console.log(`🚀 Starting document upload for: ${file.name}`);
        
        window.uploadTracker.isUploading = true;
        window.uploadTracker.currentFile = file.name;
        
        uploadDocument(file).finally(() => {
            console.log('✅ Document upload completed, resetting tracker');
            window.uploadTracker.isUploading = false;
            window.uploadTracker.currentFile = null;
            
            // Clear file input
            newDocumentInputElement.value = '';
        });
    });
    
    console.log('✅ File upload initialized successfully!');
}

async function uploadImage(file) {
    // Prevent duplicate uploads
    if (window.isImageUploading) {
        console.log('Image upload already in progress, ignoring duplicate...');
        return;
    }
    
    window.isImageUploading = true;
    
    // Upload image directly to chat
    const formData = new FormData();
    formData.append('file', file);
    formData.append('type', 'image');
    
    // Show upload progress
    showUploadProgress(file.name, 'image');
    
    try {
        const response = await fetch('/api/upload-image', {
            method: 'POST',
            body: formData
        });
        
        console.log('Image upload response status:', response.status);
        
        if (response.ok) {
            const result = await response.json();
            console.log('Image upload result:', result);
            sendImageMessage(file.name, result.image_url, result.file_size);
        } else {
            const error = await response.text();
            console.error('Image upload failed:', error);
            showError('Failed to upload image: ' + error);
        }
    } catch (error) {
        console.error('Image upload error:', error);
        showError('Image upload failed: ' + error.message);
    } finally {
        window.isImageUploading = false;
        hideUploadProgress();
    }
}

async function uploadDocument(file) {
    // Upload document as before
    const formData = new FormData();
    formData.append('file', file);
    formData.append('type', 'document');
    
    // Show upload progress
    showUploadProgress(file.name, 'document');
    
    try {
        const response = await fetch('/api/upload', {
            method: 'POST',
            body: formData
        });
        
        console.log('Document upload response status:', response.status);
        
        if (response.ok) {
            const result = await response.json();
            console.log('Document upload result:', result);
            sendFileMessage(file.name, result.file_url, result.file_size);
        } else {
            const error = await response.text();
            console.error('Document upload failed:', error);
            showError('Failed to upload document: ' + error);
        }
    } catch (error) {
        console.error('Document upload error:', error);
        showError('Document upload failed: ' + error.message);
    }
    
    hideUploadProgress();
}

function sendImageMessage(filename, imageUrl, fileSize) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        const message = {
            type: 'image',
            content: filename,
            image_url: imageUrl,
            file_size: fileSize,
            room_id: currentRoomId
        };
        
        ws.send(JSON.stringify(message));
        
        // Add image message to local display immediately
        addImageMessageToChat(currentUser.username, filename, imageUrl, fileSize, new Date().toISOString());
        
        console.log('Image message sent:', filename);
    } else {
        showError('Not connected to chat server');
    }
}

function addImageMessageToChat(username, filename, imageUrl, fileSize, timestamp) {
    const messagesContainer = document.getElementById('messagesContainer');
    const messageHtml = `
        <div class="message message-${username === currentUser?.username ? 'sent' : 'received'}">
            <div class="message-content">
                <div class="message-header">
                    <span class="message-author">${username}</span>
                    <span class="message-time">${formatTime(timestamp)}</span>
                </div>
                <div class="image-message">
                    <img src="${imageUrl}" alt="${filename}" style="max-width: 300px; max-height: 300px; border-radius: 8px; cursor: pointer;" onclick="window.open('${imageUrl}', '_blank')">
                    <div class="image-info">
                        <div class="file-name">${filename}</div>
                        <div class="file-size">${formatFileSize(fileSize)}</div>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    messagesContainer.insertAdjacentHTML('beforeend', messageHtml);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

async function uploadFile(file) {
    // First test if API is accessible
    try {
        const testResponse = await fetch('/api/test');
        console.log('API test response:', testResponse.status);
        if (!testResponse.ok) {
            showError('API endpoints not accessible');
            return;
        }
    } catch (error) {
        console.error('API test failed:', error);
        showError('Cannot connect to server');
        return;
    }
    
    const formData = new FormData();
    formData.append('file', file);
    
    // Show upload progress
    showUploadProgress(file.name);
    
    try {
        const response = await fetch('/api/upload', {
            method: 'POST',
            body: formData
            // Temporarily removed authentication header for testing
        });
        
        console.log('Upload response status:', response.status);
        
        if (response.ok) {
            const result = await response.json();
            console.log('Upload result:', result);
            sendFileMessage(file.name, result.file_url, result.file_size);
        } else {
            const error = await response.text();
            console.error('Upload failed:', error);
            showError('Failed to upload file: ' + error);
        }
    } catch (error) {
        console.error('File upload error:', error);
        showError('File upload failed: ' + error.message);
    }
    
    hideUploadProgress();
}

function showUploadProgress(filename, fileType = 'file') {
    const icon = fileType === 'image' ? '🖼️' : '📄';
    const typeText = fileType === 'image' ? 'image' : 'document';
    const progressHtml = `
        <div class="upload-progress" id="uploadProgress">
            <div class="file-info">
                <div class="file-name">${icon} Uploading ${typeText}: ${filename}...</div>
                <div class="progress-bar">
                    <div class="progress-fill" style="width: 0%"></div>
                </div>
            </div>
        </div>
    `;
    
    const messagesContainer = document.getElementById('messagesContainer');
    messagesContainer.insertAdjacentHTML('beforeend', progressHtml);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
    
    // Simulate progress
    let progress = 0;
    const progressInterval = setInterval(() => {
        progress += Math.random() * 20;
        if (progress > 90) progress = 90;
        
        const progressFill = document.querySelector('.progress-fill');
        if (progressFill) {
            progressFill.style.width = progress + '%';
        }
    }, 300);
    
    // Store interval ID to clear later
    window.uploadProgressInterval = progressInterval;
}

function hideUploadProgress() {
    if (window.uploadProgressInterval) {
        clearInterval(window.uploadProgressInterval);
    }
    
    const progressElement = document.getElementById('uploadProgress');
    if (progressElement) {
        progressElement.remove();
    }
}

function showError(message) {
    // Simple error display
    const messagesContainer = document.getElementById('messagesContainer');
    const errorHtml = `
        <div class="message-wrapper message-other">
            <div class="message-bubble" style="background: rgba(239, 68, 68, 0.2); border: 1px solid rgba(239, 68, 68, 0.3); color: #f87171;">
                <div>❌ Error: ${message}</div>
            </div>
        </div>
    `;
    messagesContainer.insertAdjacentHTML('beforeend', errorHtml);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function sendFileMessage(filename, fileUrl, fileSize) {
    const messageData = {
        type: 'file',
        filename: filename,
        file_url: fileUrl,
        file_size: fileSize,
        timestamp: new Date().toISOString()
    };
    
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(messageData));
    }
}

function displayFileMessage(message, isOwn) {
    const fileIcon = getFileIcon(message.filename);
    const formattedSize = formatFileSize(message.file_size);
    
    const messageHtml = `
        <div class="message-wrapper ${isOwn ? 'message-own' : 'message-other'}">
            <div class="message-bubble">
                <div class="file-preview">
                    <div class="file-icon">${fileIcon}</div>
                    <div class="file-info">
                        <div class="file-name">${escapeHtml(message.filename)}</div>
                        <div class="file-size">${formattedSize}</div>
                    </div>
                    <a href="${message.file_url}" download="${message.filename}" class="file-download">
                        <i class="fas fa-download"></i> Download
                    </a>
                </div>
                <div class="message-meta">
                    ${message.username} • ${formatTime(message.timestamp)}
                </div>
            </div>
        </div>
    `;
    
    const messagesContainer = document.getElementById('messagesContainer');
    messagesContainer.insertAdjacentHTML('beforeend', messageHtml);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function getFileIcon(filename) {
    const extension = filename.split('.').pop().toLowerCase();
    const iconMap = {
        'pdf': '📄',
        'doc': '📝',
        'docx': '📝',
        'txt': '📄',
        'jpg': '🖼️',
        'jpeg': '🖼️',
        'png': '🖼️',
        'gif': '🖼️',
        'mp4': '🎥',
        'mp3': '🎵',
        'zip': '📦',
        'rar': '📦'
    };
    
    return iconMap[extension] || '📎';
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function showRoomsList(rooms) {
    let roomsHtml = '<div style="padding: 1rem;"><h3 style="color: white; margin-bottom: 1rem;">Available Rooms:</h3>';
    
    if (rooms.length === 0) {
        roomsHtml += '<p style="color: #94a3b8;">No public rooms available.</p>';
    } else {
        rooms.forEach(room => {
            roomsHtml += `
                <div style="background: rgba(99, 102, 241, 0.1); border: 1px solid rgba(99, 102, 241, 0.3); border-radius: 0.5rem; padding: 1rem; margin-bottom: 0.5rem;">
                    <h4 style="color: white; margin: 0 0 0.5rem 0;">${room.name}</h4>
                    <p style="color: #94a3b8; margin: 0; font-size: 0.875rem;">${room.description}</p>
                </div>
            `;
        });
    }
    
    roomsHtml += '</div>';
    
    // Create a modal-like display
    const modal = document.createElement('div');
    modal.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: var(--color-slate-800);
        border: 1px solid var(--color-slate-600);
        border-radius: 0.5rem;
        padding: 0;
        max-width: 500px;
        max-height: 400px;
        overflow-y: auto;
        z-index: 1000;
        box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
    `;
    modal.innerHTML = roomsHtml;
    
    // Add close button
    const closeBtn = document.createElement('button');
    closeBtn.textContent = 'Close';
    closeBtn.style.cssText = `
        background: var(--color-indigo-600);
        color: white;
        border: none;
        padding: 0.5rem 1rem;
        border-radius: 0.25rem;
        cursor: pointer;
        margin: 1rem;
        margin-top: 0;
    `;
    closeBtn.onclick = () => document.body.removeChild(modal);
    
    modal.appendChild(closeBtn);
    document.body.appendChild(modal);
}

function displayOnlineUsers(users) {
    const onlineUsersList = document.getElementById('onlineUsersList');
    if (!onlineUsersList) return;
    
    if (users.length === 0) {
        onlineUsersList.innerHTML = '<p style="color: #94a3b8;">No online users</p>';
    } else {
        let usersHtml = '';
        users.forEach(user => {
            usersHtml += `
                <div style="background: rgba(34, 197, 94, 0.1); border: 1px solid rgba(34, 197, 94, 0.2); border-radius: 0.25rem; padding: 0.75rem; margin-bottom: 0.5rem;">
                    <div style="font-weight: bold; color: white; margin-bottom: 0.25rem;">${escapeHtml(user.username)}</div>
                    <div style="color: #94a3b8; font-size: 0.875rem;">${escapeHtml(user.full_name || user.email || 'No name')}</div>
                </div>
            `;
        });
        onlineUsersList.innerHTML = usersHtml;
    }
}

function displaySearchResults(query, users) {
    // Create search results modal
    const modal = document.createElement('div');
    modal.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: var(--color-slate-800);
        border: 1px solid var(--color-slate-600);
        border-radius: 0.5rem;
        padding: 2rem;
        max-width: 400px;
        max-height: 500px;
        z-index: 1000;
        box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
        overflow-y: auto;
    `;
    
    if (users.length === 0) {
        modal.innerHTML = `
            <h3 style="color: white; margin: 0 0 1.5rem 0;">🔍 Search Results</h3>
            <p style="color: #94a3b8; margin-bottom: 1.5rem;">No users found for "${escapeHtml(query)}"</p>
            <div style="display: flex; gap: 1rem; justify-content: flex-end;">
                <button style="background: var(--color-slate-600); color: white; border: none; padding: 0.5rem 1rem; border-radius: 0.25rem; cursor: pointer;" onclick="document.body.removeChild(this.parentElement.parentElement)">Close</button>
            </div>
        `;
    } else {
        let usersHtml = `<h3 style="color: white; margin: 0 0 1.5rem 0;">🔍 Search Results for "${escapeHtml(query)}"</h3>`;
        users.forEach(user => {
            usersHtml += `
                <div style="background: rgba(34, 197, 94, 0.1); border: 1px solid rgba(34, 197, 94, 0.2); border-radius: 0.25rem; padding: 0.75rem; margin-bottom: 0.5rem; cursor: pointer;" onclick="selectUserForPrivateMessage('${escapeHtml(user.username)}')">
                    <div style="font-weight: bold; color: white; margin-bottom: 0.25rem;">${escapeHtml(user.username)}</div>
                    <div style="color: #94a3b8; font-size: 0.875rem;">${escapeHtml(user.full_name || user.email || 'No name')}</div>
                </div>
            `;
        });
        usersHtml += `
            <div style="display: flex; gap: 1rem; justify-content: flex-end; margin-top: 1rem;">
                <button style="background: var(--color-slate-600); color: white; border: none; padding: 0.5rem 1rem; border-radius: 0.25rem; cursor: pointer;" onclick="document.body.removeChild(this.parentElement.parentElement)">Close</button>
            </div>
        `;
        modal.innerHTML = usersHtml;
    }
    
    document.body.appendChild(modal);
}

function selectUserForPrivateMessage(username) {
    // Close the search results modal
    const modals = document.querySelectorAll('div[style*="position: fixed"]');
    modals.forEach(modal => {
        if (modal.parentElement && modal.parentElement.tagName === 'BODY') {
            document.body.removeChild(modal);
        }
    });
    
    // Open private message with selected user
    setTimeout(() => {
        const message = prompt(`Enter message to send to ${username}:`);
        if (message && message.trim()) {
            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                    type: 'private_message',
                    recipient: username,
                    content: message.trim(),
                    room_id: currentRoomId
                }));
                showSystemMessage(`Private message sent to ${username}`, 'success');
                console.log('Private message sent:', { recipient: username, message });
            } else {
                showSystemMessage('Not connected to chat server', 'error');
            }
        }
    }, 100);
}

function showPrivateMessage(username, content, timestamp, isSent = false) {
    console.log('showPrivateMessage called:', { username, content, timestamp, isSent });
    
    // Fallback: Use regular message display if private message styling fails
    try {
        const messageDiv = document.createElement('div');
        messageDiv.className = 'message-wrapper private-message';
        messageDiv.style.borderLeft = '4px solid #10b981';
        messageDiv.style.background = 'rgba(16, 185, 129, 0.05)';
        messageDiv.style.margin = '1rem 0';
        messageDiv.style.padding = '0.75rem';
        messageDiv.style.borderRadius = '0.5rem';
        
        const direction = isSent ? 'sent' : 'received';
        const label = isSent ? `📤 To ${username}` : `📩 From ${username}`;
        
        messageDiv.innerHTML = `
            <div style="font-size: 0.75rem; color: #10b981; font-weight: bold; margin-bottom: 0.5rem; text-transform: uppercase;">${label}</div>
            <div style="background: linear-gradient(135deg, rgba(16, 185, 129, 0.2), rgba(34, 197, 94, 0.1)); border: 1px solid rgba(16, 185, 129, 0.3); color: white; padding: 0.75rem; border-radius: 0.5rem; margin-bottom: 0.5rem;">
                ${escapeHtml(content)}
            </div>
            <div style="font-size: 0.75rem; color: #94a3b8; text-align: right;">
                ${formatTime(timestamp)}
            </div>
        `;
        
        console.log('Adding private message to DOM');
        messagesContainer.appendChild(messageDiv);
        scrollToBottom();
        console.log('Private message added successfully');
        
        // Also show a system message for visibility
        showSystemMessage(`${label}: ${content}`, 'info');
        
    } catch (error) {
        console.error('Error showing private message:', error);
        // Fallback to regular message
        showMessage(username, content, timestamp, null, false, false);
        showSystemMessage(`${isSent ? '📤 To' : '📩 From'} ${username}: ${content}`, 'info');
    }
}

function formatTime(timestamp) {
    console.log('formatTime called with timestamp:', timestamp);
    if (!timestamp) return '00.00';
    const date = new Date(timestamp);
    let hours = date.getHours();
    const minutes = date.getMinutes();
    
    console.log('Original hours:', hours, 'minutes:', minutes);
    
    // Convert to 12-hour format
    if (hours > 12) {
        hours = hours - 12;
    } else if (hours === 0) {
        hours = 12;
    }
    
    const formattedTime = `${hours.toString().padStart(2, '0')}.${minutes.toString().padStart(2, '0')}`;
    console.log('Formatted time:', formattedTime);
    
    return formattedTime;
}

document.addEventListener('DOMContentLoaded', initChat);

// Quick test - check if multi-user button exists
setTimeout(() => {
    const multiUserTest = document.getElementById('multiUserBtn');
    console.log('=== MULTI-USER BUTTON TEST ===');
    console.log('Button found:', multiUserTest);
    console.log('Button visible:', multiUserTest ? getComputedStyle(multiUserTest).display : 'N/A');
    console.log('==========================');
}, 1000);
