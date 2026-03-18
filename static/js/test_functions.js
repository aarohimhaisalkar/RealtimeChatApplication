// Simple test to verify the chat.js functions work
console.log('Testing chat.js functions...');

// Test getAuthInfo function
try {
    const authInfo = getAuthInfo();
    console.log('✅ getAuthInfo works:', authInfo);
} catch (e) {
    console.error('❌ getAuthInfo failed:', e);
}

// Test DOM elements
const elements = [
    'messagesContainer',
    'messageForm', 
    'messageInput',
    'usersList',
    'currentUser',
    'userCount'
];

console.log('Checking DOM elements:');
elements.forEach(id => {
    const element = document.getElementById(id);
    console.log(`${element ? '✅' : '❌'} #${id}`);
});

// Test authentication check
try {
    const isAuth = isAuthenticated();
    console.log('✅ isAuthenticated works:', isAuth);
} catch (e) {
    console.error('❌ isAuthenticated failed:', e);
}

// Test initChat if on chat page
if (window.location.pathname.includes('/chat')) {
    console.log('On chat page, testing initChat...');
    try {
        initChat();
        console.log('✅ initChat executed');
    } catch (e) {
        console.error('❌ initChat failed:', e);
    }
}
