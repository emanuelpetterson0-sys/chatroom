
const socket = io();
const body = document.body;
const messages = document.getElementById('messages');
const msgInput = document.getElementById('messageInput');
const userInput = document.getElementById('username');
const sendBtn = document.getElementById('sendBtn');

messages.scrollTo({
    top: messages.scrollHeight,
    behavior: 'smooth'
});

while (messages.firstChild) {
    messages.removeChild(messages.firstChild);
}

const appendMessage = (user, text, id, time) => {
    const isAtBottom = messages.scrollHeight - messages.clientHeight <= messages.scrollTop + 50;
    
    const li = document.createElement('li');
    li.setAttribute('id', id);
    li.innerHTML = `&lt;${new Date(time).toLocaleString()}&gt; <div class="userTextContainer"><p class="usernames">${user} :</p> ${text}</div>`;
    messages.appendChild(li);

    if (isAtBottom) {
        messages.scrollTop = messages.scrollHeight;
    }
};

function sendMessage(){
    if (msgInput.value.trim() && userInput.value.trim()) {
        socket.emit('send_message', {
            text: msgInput.value,
            username: userInput.value
        });
        msgInput.value = '';
    }
}

sendBtn.addEventListener('click', sendMessage);
body.addEventListener('keypress', (event)=>{
    if(event.key === 'Enter'){
        sendMessage();
    }
})


// Handle history from DB
socket.on('message_history', (data) => {
    data.forEach(msg => appendMessage(msg.username, msg.message, msg.id, msg.created_at));
});

// Handle new incoming messages
socket.on('receive_message', (data) => {
    appendMessage(data.username, data.text, data.id, data.time);
});

socket.on('message_updated', (data) => {
    const li = document.getElementById(data.id);
    if (li) {
        const timeStr = new Date(data.time).toLocaleString();
        li.innerHTML = `&lt;${timeStr}&gt; <div class="userTextContainer"><p class="usernames">${data.username}</p>: ${data.newText} (edited)</div>`;
    }
});