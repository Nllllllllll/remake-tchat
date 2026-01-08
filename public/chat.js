const socket = io({
    auth: {
        user: JSON.stringify(user)
    }
});

socket.on('connect', () => {
    console.log('Connected to server');
});

socket.on('disconnect', () => {
    console.log('Disconnected from server');
});

socket.on('load messages', (history) => {
    console.log('Loading history:', history.length, 'messages');
    history.forEach(msg => {
        messages.appendChild(createMessageElement(msg));
    });
    messages.scrollTop = messages.scrollHeight;
});

const form = document.getElementById('message-form');
const input = document.getElementById('message-input');
const messages = document.getElementById('messages');
const typingIndicator = document.getElementById('typing-indicator');
const reactionPopup = document.getElementById('reaction-popup');
let typing = false;
let timeout;
let currentMessage = null;

form.addEventListener('submit', function(e) {
    e.preventDefault();
    if (input.value) {
        const msg = input.value;
        input.value = '';
        // Ajouter le message localement
        const message = { user: user.username, text: msg, time: new Date() };
        const messageDiv = createMessageElement(message);
        messages.appendChild(messageDiv);
        messages.scrollTop = messages.scrollHeight;
        // Envoyer au serveur
        socket.emit('chat message', { text: msg });
        socket.emit('stop typing');
        typing = false;
    }
});

input.addEventListener('input', function() {
    if (!typing) {
        socket.emit('typing');
        typing = true;
    }
    clearTimeout(timeout);
    timeout = setTimeout(() => {
        socket.emit('stop typing');
        typing = false;
    }, 1000);
});

// Fonction pour créer un message
function createMessageElement(msg) {
    const messageDiv = document.createElement('div');
    messageDiv.classList.add('message');
    if (msg.id) messageDiv.dataset.id = msg.id;
    if (msg.user === user.username) messageDiv.classList.add('own-message');

    const avatar = document.createElement('div');
    avatar.classList.add('avatar');
    avatar.textContent = msg.user[0].toUpperCase();

    const content = document.createElement('div');
    content.classList.add('message-content');

    const header = document.createElement('div');
    header.classList.add('message-header');

    const username = document.createElement('span');
    username.classList.add('username');
    username.textContent = msg.user;

    const timestamp = document.createElement('span');
    timestamp.classList.add('timestamp');
    timestamp.textContent = new Date(msg.time).toLocaleTimeString();

    if (msg.edited) {
        const edited = document.createElement('span');
        edited.classList.add('edited');
        edited.textContent = '(modifié)';
        timestamp.appendChild(edited);
    }

    header.appendChild(username);
    header.appendChild(timestamp);

    if (msg.user === user.username && msg.id) {
        const actions = document.createElement('div');
        actions.classList.add('message-actions');
        actions.innerHTML = `
            <button class="action-btn edit-btn" title="Modifier">✏️</button>
            <button class="action-btn delete-btn" title="Supprimer">🗑️</button>
            <button class="action-btn add-reaction-btn" title="Ajouter une réaction">➕</button>
        `;
        header.appendChild(actions);
    }

    const text = document.createElement('div');
    text.classList.add('message-text');
    text.contentEditable = false;
    text.textContent = msg.text;

    if (msg.attachment) {
        const attachment = document.createElement('div');
        attachment.classList.add('attachment');
        if (msg.attachment.startsWith('data:image/')) {
            const img = document.createElement('img');
            img.src = msg.attachment;
            img.style.maxWidth = '300px';
            img.style.maxHeight = '200px';
            img.style.borderRadius = '8px';
            attachment.appendChild(img);
        } else if (msg.attachment.startsWith('data:video/')) {
            const video = document.createElement('video');
            video.src = msg.attachment;
            video.controls = true;
            video.style.maxWidth = '300px';
            video.style.maxHeight = '200px';
            video.style.borderRadius = '8px';
            attachment.appendChild(video);
        } else {
            const link = document.createElement('a');
            link.href = msg.attachment;
            link.download = 'attachment';
            link.textContent = 'Télécharger fichier';
            attachment.appendChild(link);
        }
        content.appendChild(attachment);
    }

    const reactions = document.createElement('div');
    reactions.classList.add('reactions');

    content.appendChild(header);
    content.appendChild(text);
    content.appendChild(reactions);

    messageDiv.appendChild(avatar);
    messageDiv.appendChild(content);

    return messageDiv;
}

socket.on('typing', function(data) {
    typingIndicator.textContent = `${data.user} tape...`;
    typingIndicator.style.display = 'block';
});

socket.on('stop typing', function() {
    typingIndicator.style.display = 'none';
});

socket.on('message deleted', function(id) {
    const msgDiv = document.querySelector(`.message[data-id="${id}"]`);
    if (msgDiv) msgDiv.remove();
});

socket.on('message updated', function(data) {
    const msgDiv = document.querySelector(`.message[data-id="${data.id}"]`);
    if (msgDiv) {
        const textDiv = msgDiv.querySelector('.message-text');
        if (textDiv) textDiv.textContent = data.text;
        if (data.edited) {
            const timestamp = msgDiv.querySelector('.timestamp');
            if (timestamp && !timestamp.querySelector('.edited')) {
                const edited = document.createElement('span');
                edited.classList.add('edited');
                edited.textContent = '(modifié)';
                timestamp.appendChild(edited);
            }
        }
    }
});

messages.addEventListener('click', function(e) {
    if (e.target.classList.contains('reaction')) {
        const emoji = e.target.dataset.emoji;
        let count = parseInt(e.target.textContent.split(' ')[1]) || 0;
        if (count > 0) {
            count = 0;
            e.target.remove();
        } else {
            count = 1;
            e.target.textContent = `${emoji} ${count}`;
        }
    } else if (e.target.classList.contains('add-reaction-btn')) {
        currentMessage = e.target.closest('.message');
        const rect = e.target.getBoundingClientRect();
        reactionPopup.style.left = `${rect.left}px`;
        reactionPopup.style.top = `${rect.bottom + 5}px`;
        reactionPopup.classList.remove('hidden');
    } else if (e.target.classList.contains('edit-btn')) {
        const msgDiv = e.target.closest('.message');
        const textDiv = msgDiv.querySelector('.message-text');
        const originalText = textDiv.textContent;
        textDiv.contentEditable = true;
        textDiv.focus();
        textDiv.addEventListener('keydown', function(ev) {
            if (ev.key === 'Enter') {
                ev.preventDefault();
                textDiv.contentEditable = false;
                const newText = textDiv.textContent.trim();
                if (newText && newText !== originalText) {
                    socket.emit('update message', msgDiv.dataset.id, newText);
                } else {
                    textDiv.textContent = originalText;
                }
            } else if (ev.key === 'Escape') {
                textDiv.contentEditable = false;
                textDiv.textContent = originalText;
            }
        });
    } else if (e.target.classList.contains('delete-btn')) {
        const msgDiv = e.target.closest('.message');
        if (confirm('Supprimer ce message ?')) {
            socket.emit('delete message', msgDiv.dataset.id);
        }
    }
});

// Gérer les clics sur les emojis de la popup
reactionPopup.addEventListener('click', function(e) {
    if (e.target.tagName === 'SPAN') {
        const emoji = e.target.dataset.emoji;
        if (currentMessage) {
            const reactionsDiv = currentMessage.querySelector('.reactions');
            let reactionBtn = reactionsDiv.querySelector(`[data-emoji="${emoji}"]`);
            if (!reactionBtn) {
                reactionBtn = document.createElement('button');
                reactionBtn.classList.add('reaction');
                reactionBtn.dataset.emoji = emoji;
                reactionBtn.textContent = `${emoji} 0`;
                reactionsDiv.appendChild(reactionBtn);
            }
            let count = parseInt(reactionBtn.textContent.split(' ')[1]) || 0;
            count = 1; // Ajouter directement à 1
            reactionBtn.textContent = `${emoji} ${count}`;
        }
        reactionPopup.classList.add('hidden');
        currentMessage = null;
    }
});

// Cacher la popup si clic ailleurs
document.addEventListener('click', function(e) {
    if (!reactionPopup.contains(e.target) && !e.target.classList.contains('add-reaction-btn')) {
        reactionPopup.classList.add('hidden');
        currentMessage = null;
    }
});

const attachBtn = document.getElementById('attach-btn');
const attachMenu = document.getElementById('attach-menu');
const fileInput = document.getElementById('file-input');

attachBtn.addEventListener('click', function() {
    attachMenu.classList.toggle('hidden');
});

attachMenu.addEventListener('click', function(e) {
    if (e.target.classList.contains('menu-item')) {
        const type = e.target.dataset.type;
        if (type === 'image') {
            fileInput.accept = 'image/*';
        } else if (type === 'video') {
            fileInput.accept = 'video/*';
        }
        fileInput.click();
        attachMenu.classList.add('hidden');
    }
});

fileInput.addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function(ev) {
            const base64 = ev.target.result;
            // Envoyer le fichier
            socket.emit('chat message', { text: '', attachment: base64 });
            fileInput.value = '';
        };
        reader.readAsDataURL(file);
    }
});

// Fermer le menu si clic ailleurs
document.addEventListener('click', function(e) {
    if (!attachMenu.contains(e.target) && e.target !== attachBtn) {
        attachMenu.classList.add('hidden');
    }
});

// Gestion des canaux
document.querySelectorAll('#channel-list li').forEach(li => {
    li.addEventListener('click', function() {
        document.querySelectorAll('#channel-list li').forEach(item => item.classList.remove('active'));
        this.classList.add('active');
        // Ici, on pourrait changer de canal, mais pour simplifier, juste changer l'actif
    });
});