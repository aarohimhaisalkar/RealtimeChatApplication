# Real-Time Chat Application

A beautiful, modern real-time chat application built with Python FastAPI backend and WebSocket technology. Features a stunning UI similar to popular messaging platforms like Discord and Slack.

## 🚀 Features

### Core Functionality
- **Real-time Messaging** - Instant message delivery using WebSockets
- **Multi-user Support** - Multiple users can chat simultaneously
- **Online Users List** - See who's currently online
- **Message History** - Recent messages load when joining
- **Join/Leave Notifications** - System messages for user actions
- **Persistent Storage** - Messages saved to SQLite database

### UI/UX Features
- **Modern Design** - Beautiful gradient-based interface
- **Dark Theme** - Eye-friendly dark mode design
- **Responsive Layout** - Works on desktop and mobile
- **Smooth Animations** - Message animations and transitions
- **User Avatars** - Colorful avatars with initials
- **Message Bubbles** - Different styles for own/others' messages
- **Typing Indicators** - Visual feedback for active users
- **Character Counter** - Real-time character count
- **Connection Status** - Visual connection status indicator

## 🛠️ Technology Stack

### Backend
- **Python 3** - Core programming language
- **FastAPI** - Modern web framework for APIs
- **WebSockets** - Real-time communication protocol
- **SQLAlchemy** - ORM for database operations
- **SQLite** - Lightweight database
- **Uvicorn** - ASGI server

### Frontend
- **HTML5** - Semantic markup
- **CSS3** - Modern styling with animations
- **JavaScript** - Client-side functionality
- **Tailwind CSS** - Utility-first CSS framework
- **Font Awesome** - Icon library

## 📋 Requirements

- Python 3.8 or higher
- pip (Python package manager)
- Modern web browser (Chrome, Firefox, Safari, Edge)

## 🛠️ Installation

### 1. Clone or Download the Project
```bash
# If using git
git clone <repository-url>
cd realtime_chat_app

# Or download and extract the ZIP file
```

### 2. Create Virtual Environment (Recommended)
```bash
# Create virtual environment
python -m venv venv

# Activate on Windows
venv\Scripts\activate

# Activate on macOS/Linux
source venv/bin/activate
```

### 3. Install Dependencies
```bash
pip install -r requirements.txt
```

### 4. Start the Application
```bash
# Navigate to the project directory
cd realtime_chat_app

# Start the server
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### 5. Access the Application
Open your web browser and navigate to:
```
http://localhost:8000
```

## 🎯 Usage

### Joining the Chat
1. Open the application in your browser
2. Enter a username (2-20 characters, letters and numbers only)
3. Click "Join Chat Room"
4. You'll be redirected to the chat interface

### Using the Chat
- **Send Messages**: Type your message and press Enter or click Send
- **View Online Users**: See the list of connected users in the sidebar
- **Message History**: Recent messages load automatically when you join
- **Leave Chat**: Click the "Leave Chat" button to exit

### Keyboard Shortcuts
- **Enter**: Send message
- **Ctrl/Cmd + K**: Focus message input
- **Escape**: Clear message input

## 📁 Project Structure

```
realtime_chat_app/
├── app/
│   ├── __init__.py
│   ├── main.py              # FastAPI application and routes
│   ├── models.py            # SQLAlchemy database models
│   ├── database.py          # Database configuration and functions
│   └── websocket_manager.py # WebSocket connection management
├── templates/
│   ├── login.html           # Login page with modern UI
│   └── chat.html            # Main chat interface
├── static/
│   ├── css/
│   │   └── style.css        # Custom CSS styles and animations
│   └── js/
│       └── chat.js          # WebSocket communication logic
├── requirements.txt         # Python dependencies
├── README.md               # This file
└── chat.db                 # SQLite database (created automatically)
```

## 🔧 Configuration

### Server Settings
- **Host**: `0.0.0.0` (accessible from any network interface)
- **Port**: `8000` (default)
- **Auto-reload**: Enabled for development

### Database
- **Type**: SQLite
- **Location**: `chat.db` in project root
- **Messages Stored**: All chat messages with timestamps

### WebSocket
- **Protocol**: WebSocket (`ws://` or `wss://` for HTTPS)
- **Endpoint**: `/ws/{username}`
- **Auto-reconnect**: Enabled with 3-second retry

## 🚀 Development

### Running in Development Mode
```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### Database Reset
To clear all messages and start fresh:
```bash
rm chat.db
```
The database will be recreated automatically on next startup.

### Adding New Features
- **Backend**: Modify files in `app/` directory
- **Frontend**: Update `templates/` and `static/` files
- **Styling**: Edit `static/css/style.css` or use Tailwind classes

## 🔒 Security Features

- **Input Validation**: Username and message validation
- **XSS Prevention**: HTML escaping for user input
- **WebSocket Security**: Connection validation
- **Input Limits**: Character limits on messages and usernames

## 🐛 Troubleshooting

### Common Issues

1. **Port Already in Use**
   ```bash
   # Find process using port 8000
   netstat -ano | findstr :8000
   
   # Kill the process (replace PID)
   taskkill /PID <PID> /F
   ```

2. **Module Not Found**
   ```bash
   # Reinstall dependencies
   pip install -r requirements.txt
   ```

3. **WebSocket Connection Failed**
   - Check if server is running
   - Verify firewall settings
   - Try refreshing the page

4. **Database Errors**
   - Ensure write permissions in project directory
   - Delete `chat.db` to recreate database

### Performance Tips
- Use a modern browser for best performance
- Close unused browser tabs
- Restart server if memory usage is high

## 🌐 Browser Compatibility

- **Chrome** 80+
- **Firefox** 75+
- **Safari** 13+
- **Edge** 80+

## 📄 License

This project is open source and available under the [MIT License](LICENSE).

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

### Development Setup
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📞 Support

If you encounter any issues or have questions:
1. Check the troubleshooting section above
2. Verify all dependencies are installed
3. Ensure you're using a supported browser
4. Check browser console for error messages

---

**Enjoy chatting! 🎉**
