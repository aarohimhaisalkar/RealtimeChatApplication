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

// DOM elements
const messagesContainer = document.getElementById('messagesContainer');
const messageForm = document.getElementById('messageForm');
const messageInput = document.getElementById('messageInput');
const usersList = document.getElementById('usersList');
const currentUserSpan = document.getElementById('currentUser');
const userCountSpan = document.getElementById('userCount');
const messageCountSpan = document.getElementById('messageCount');
const activeCountSpan = document.getElementById('activeCount');
const connectionStatusSpan = document.getElementById('connectionStatus');
const charCountSpan = document.getElementById('charCount');
const roomsList = document.getElementById('roomsList');
const activeRoomName = document.getElementById('activeRoomName');
const typingIndicator = document.getElementById('typingIndicator');
const typingText = document.getElementById('typingText');
const searchInput = document.getElementById('searchInput');
const notificationSound = document.getElementById('notificationSound');

// Get authentication token and user info
function getAuthInfo() {
    authToken = localStorage.getItem('access_token') || sessionStorage.getItem('access_token');
    const userInfo = localStorage.getItem('user_info');
    if (userInfo) {
        currentUser = JSON.parse(userInfo);
    }
    return { token: authToken, user: currentUser };
}

function isAuthenticated() {
    const { token } = getAuthInfo();
    return token !== null;
}

function checkAuthentication() {
    if (!isAuthenticated()) {
        window.location.href = '/';
        return false;
    }
    return true;
}

function initChat() {
    if (!checkAuthentication()) {
        return;
    }
    
    const { user } = getAuthInfo();
    
    if (currentUserSpan) {
        currentUserSpan.textContent = user.username;
    }
    
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

    const leaveChatBtn = document.getElementById('leaveChatBtn');
    if (leaveChatBtn) {
        leaveChatBtn.addEventListener('click', leaveChat);
    }

    updateConnectionStatus('connecting');
}

function connectWebSocket() {
    if (!authToken) return;
    
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/${authToken}?t=${Date.now()}`;
    
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
    
    ws.onclose = function() {
        console.log('Disconnected from chat server');
        updateConnectionStatus('disconnected');
        showSystemMessage('Disconnected. Reconnecting...', 'error');
        setTimeout(() => {
            if (isAuthenticated()) connectWebSocket();
        }, 3000);
    };

    ws.onerror = function(error) {
        console.log('WebSocket error:', error);
        updateConnectionStatus('error');
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
            notificationSound.play().catch(e => console.log('Audio play blocked'));
        }

        // Send read receipt if active room
        if (!document.hidden && data.id) {
            ws.send(JSON.stringify({ type: 'read_receipt', message_id: data.id }));
        }

    } else if (data.type === 'system') {
        showSystemMessage(data.content);
    } else if (data.type === 'users_update') {
        updateUsersList(data.users);
    } else if (data.type === 'typing') {
        updateTypingIndicator(data.username, data.is_typing);
    } else if (data.type === 'rooms_update') {
        updateRoomsList(data.room_details);
    } else if (data.type === 'read_receipt') {
        markAsRead(data.message_id);
    }
}

function sendMessage(e) {
    e.preventDefault();
    const content = messageInput.value.trim();
    if (!content) return;
    
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ 
            type: 'message', 
            content: content, 
            room_id: currentRoomId 
        }));
        messageInput.value = '';
        updateCharCount();
        stopTyping();
    } else {
        showSystemMessage('Not connected to chat server', 'error');
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
    if (!currentUser || username === currentUser.username) return;
    
    if (is_typing) {
        typingText.textContent = `${username} is typing...`;
        typingIndicator.classList.add('visible');
    } else {
        typingIndicator.classList.remove('visible');
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
            <i class="fas fa-hashtag mr-2"></i>${escapeHtml(room.name)}
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
    const messageDiv = document.createElement('div');
    messageDiv.className = `message-wrapper ${isOwnMessage ? 'message-own' : 'message-other'}`;
    if (id) messageDiv.dataset.id = id;
    
    const authorHtml = !isOwnMessage ? `<div class="text-xs text-slate-400 mb-1">${escapeHtml(username)}</div>` : '';
    const editedHtml = isEdited ? '<span class="text-[10px] opacity-50 ml-1">(edited)</span>' : '';
    const readHtml = isOwnMessage && id ? '<span class="read-status text-[10px] ml-1"><i class="fas fa-check"></i></span>' : '';

    messageDiv.innerHTML = `
        <div class="flex flex-col" style="max-width: 80%;">
            ${authorHtml}
            <div class="message-bubble">
                ${isDeleted ? '<i>[This message was deleted]</i>' : escapeHtml(content)}
            </div>
            <div class="message-meta">
                ${escapeHtml(timestamp || '')}${editedHtml}${readHtml}
            </div>
        </div>
    `;
    
    messagesContainer.appendChild(messageDiv);
    scrollToBottom();
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
    sessionStorage.removeItem('access_token');
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

document.addEventListener('DOMContentLoaded', initChat);
