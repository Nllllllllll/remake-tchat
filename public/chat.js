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

socket.on('online users', (users) => {
    updateMembersList(users);
});

socket.on('load messages', (history) => {
    console.log('Loading history:', history.length, 'messages');
    history.forEach(msg => {
        messages.appendChild(createMessageElement(msg));
    });
    messages.scrollTop = messages.scrollHeight;
});

socket.on('chat message', (msg) => {
    messages.appendChild(createMessageElement(msg));
    messages.scrollTop = messages.scrollHeight;
});

const form = document.getElementById('message-form');
const input = document.getElementById('message-input');
const messages = document.getElementById('messages');
const typingIndicator = document.getElementById('typing-indicator');
let reactionPopup = document.getElementById('reaction-popup');
if (reactionPopup) {
    reactionPopup.addEventListener('mouseleave', () => {
        reactionPopup.classList.add('hidden');
    });
}
let typing = false;
let timeout;
let currentMessage = null;

const attachBtn = document.getElementById('attach-btn');
const attachMenu = document.getElementById('attach-menu');
const fileInput = document.getElementById('file-input');
const attachmentPreview = document.getElementById('attachment-preview');
let selectedAttachments = [];

let currentAttachments = [];
let currentIndex = 0;

function updatePreview() {
    attachmentPreview.innerHTML = '';
    if (selectedAttachments.length > 0) {
        input.placeholder = "Tapez votre message... (" + selectedAttachments.length + " pièce(s) jointe(s))";
        selectedAttachments.forEach((attachment, index) => {
            const wrapper = document.createElement('div');
            wrapper.classList.add('preview-item');
            if (attachment.startsWith('data:image/')) {
                const img = document.createElement('img');
                img.src = attachment;
                wrapper.appendChild(img);
            } else if (attachment.startsWith('data:video/')) {
                const video = document.createElement('video');
                video.src = attachment;
                video.controls = false;
                video.muted = true;
                video.style.maxWidth = '50px';
                video.style.maxHeight = '50px';
                wrapper.appendChild(video);
            }
            const removeBtn = document.createElement('button');
            removeBtn.classList.add('remove-attachment');
            removeBtn.textContent = '×';
            removeBtn.onclick = () => {
                selectedAttachments.splice(index, 1);
                updatePreview();
            };
            wrapper.appendChild(removeBtn);
            attachmentPreview.appendChild(wrapper);
        });
    } else {
        input.placeholder = "Tapez votre message...";
    }
}

form.addEventListener('submit', function(e) {
    e.preventDefault();
    const msg = input.value.trim();
    if (!msg && selectedAttachments.length === 0) return; // Ne rien faire si vide
    input.value = '';
    // Ajouter le message localement
    const message = { user: user.username, text: msg, attachments: selectedAttachments, time: new Date(), profile_pic: user.profile_pic };
    const messageDiv = createMessageElement(message);
    messages.appendChild(messageDiv);
    messages.scrollTop = messages.scrollHeight;
    // Envoyer au serveur
    console.log('Sending message:', msg, 'with attachments:', selectedAttachments.length);
    socket.emit('chat message', { text: msg, attachments: selectedAttachments });
    selectedAttachments = [];
    updatePreview();
    socket.emit('stop typing');
    typing = false;
});

input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        form.dispatchEvent(new Event('submit'));
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
    avatar.style.cursor = 'pointer';
    avatar.addEventListener('click', (e) => {
        e.stopPropagation();
        openUserProfileModal(msg.user, avatar);
    });
    if (msg.profile_pic) {
        const img = document.createElement('img');
        img.src = '/uploads/' + msg.profile_pic;
        img.style.width = '100%';
        img.style.height = '100%';
        img.style.borderRadius = '50%';
        img.style.objectFit = 'cover';
        avatar.appendChild(img);
    } else {
        avatar.textContent = msg.user[0].toUpperCase();
    }

    const content = document.createElement('div');
    content.classList.add('message-content');

    const header = document.createElement('div');
    header.classList.add('message-header');

    const username = document.createElement('span');
    username.classList.add('username');
    username.textContent = msg.user;
    username.style.cursor = 'pointer';
    username.addEventListener('click', (e) => {
        e.stopPropagation();
        openUserProfileModal(msg.user, username);
    });

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

    const actions = document.createElement('div');
    actions.classList.add('message-actions');
    let buttons = '<button class="action-btn add-reaction-btn" title="Ajouter une réaction">➕</button>';
    if (msg.user === user.username && msg.id) {
        buttons = '<button class="action-btn edit-btn" title="Modifier">✏️</button><button class="action-btn delete-btn" title="Supprimer">🗑️</button>' + buttons;
    }
    actions.innerHTML = buttons;
    const reactionMenu = document.createElement('div');
    reactionMenu.classList.add('reaction-menu');
    reactionMenu.style.display = 'none';
    const options = document.createElement('div');
    options.classList.add('reaction-options');
    options.innerHTML = '<span data-emoji="👍">👍</span><span data-emoji="👎">👎</span><span data-emoji="❤️">❤️</span><span data-emoji="😂">😂</span><span data-emoji="😮">😮</span><span data-emoji="😢">😢</span><span data-emoji="😡">😡</span><span data-emoji="🔥">🔥</span>';
    reactionMenu.appendChild(options);
    actions.appendChild(reactionMenu);
    header.appendChild(actions);

    const text = document.createElement('div');
    text.classList.add('message-text');
    text.contentEditable = false;
    text.textContent = msg.text;

    const reactions = document.createElement('div');
    reactions.classList.add('reactions');

    content.appendChild(header);
    content.appendChild(text);
    if (msg.attachments && msg.attachments.length > 0) {
        const attachmentsContainer = document.createElement('div');
        attachmentsContainer.classList.add('attachments-container');
        msg.attachments.forEach(attach => {
            const attachment = document.createElement('div');
            attachment.classList.add('attachment');
            if (attach.startsWith('data:image/')) {
                const img = document.createElement('img');
                img.src = attach;
                img.style.maxWidth = '300px';
                img.style.maxHeight = '200px';
                img.style.borderRadius = '8px';
                img.style.cursor = 'pointer';
                img.addEventListener('click', () => openMediaModal(attach, msg.attachments, msg.attachments.indexOf(attach)));
                attachment.appendChild(img);
            } else if (attach.startsWith('data:video/')) {
                const video = document.createElement('video');
                video.src = attach;
                video.controls = true;
                video.style.maxWidth = '300px';
                video.style.maxHeight = '200px';
                video.style.borderRadius = '8px';
                video.style.cursor = 'pointer';
                video.addEventListener('click', () => openMediaModal(attach, msg.attachments, msg.attachments.indexOf(attach)));
                attachment.appendChild(video);
            } else {
                const link = document.createElement('a');
                link.href = attach;
                link.download = 'attachment';
                link.textContent = 'Télécharger fichier';
                attachment.appendChild(link);
            }
            attachmentsContainer.appendChild(attachment);
        });
        content.appendChild(attachmentsContainer);
    }

    // Add reactions
    if (msg.reactions) {
        for (const [emoji, users] of Object.entries(msg.reactions)) {
            const reactionBtn = document.createElement('button');
            reactionBtn.classList.add('reaction');
            reactionBtn.dataset.emoji = emoji;
            reactionBtn.dataset.users = JSON.stringify(users);
            reactionBtn.textContent = `${emoji} ${users.length}`;
            reactions.appendChild(reactionBtn);
        }
    }

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

socket.on('reaction added', function(data) {
    const { messageId, emoji, user } = data;
    const msgDiv = document.querySelector(`.message[data-id="${messageId}"]`);
    if (msgDiv) {
        const reactionsDiv = msgDiv.querySelector('.reactions');
        let reactionBtn = reactionsDiv.querySelector(`[data-emoji="${emoji}"]`);
        if (!reactionBtn) {
            reactionBtn = document.createElement('button');
            reactionBtn.classList.add('reaction');
            reactionBtn.dataset.emoji = emoji;
            reactionBtn.dataset.users = JSON.stringify([user]);
            reactionBtn.textContent = `${emoji} 1`;
            reactionsDiv.appendChild(reactionBtn);
        } else {
            const users = JSON.parse(reactionBtn.dataset.users);
            if (!users.includes(user)) {
                users.push(user);
                reactionBtn.dataset.users = JSON.stringify(users);
                reactionBtn.textContent = `${emoji} ${users.length}`;
            }
        }
    }
});

socket.on('reaction removed', function(data) {
    const { messageId, emoji, user } = data;
    const msgDiv = document.querySelector(`.message[data-id="${messageId}"]`);
    if (msgDiv) {
        const reactionsDiv = msgDiv.querySelector('.reactions');
        const reactionBtn = reactionsDiv.querySelector(`[data-emoji="${emoji}"]`);
        if (reactionBtn) {
            const users = JSON.parse(reactionBtn.dataset.users);
            const index = users.indexOf(user);
            if (index > -1) {
                users.splice(index, 1);
                if (users.length === 0) {
                    reactionBtn.remove();
                } else {
                    reactionBtn.dataset.users = JSON.stringify(users);
                    reactionBtn.textContent = `${emoji} ${users.length}`;
                }
            }
        }
    }
});

// Context menu
messages.addEventListener('contextmenu', function(e) {
    e.preventDefault();
    const msgDiv = e.target.closest('.message');
    if (!msgDiv) return;
    const rect = msgDiv.getBoundingClientRect();
    const menu = document.getElementById('context-menu');
    if (menu) {
        menu.style.left = `${e.pageX}px`;
        menu.style.top = `${e.pageY}px`;
        menu.style.display = 'block';
        const rect = menu.getBoundingClientRect();
        if (rect.right > window.innerWidth) {
            menu.style.left = `${window.innerWidth - rect.width}px`;
        }
        if (rect.bottom > window.innerHeight) {
            menu.style.top = `${window.innerHeight - rect.height}px`;
        }
    }
    const options = document.getElementById('context-options');
    options.innerHTML = '';
    // Copier
    const copyBtn = document.createElement('button');
    copyBtn.classList.add('context-option');
    copyBtn.textContent = 'Copier le message';
    copyBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        navigator.clipboard.writeText(msgDiv.querySelector('.message-text').textContent);
        hideContextMenu();
    });
    options.appendChild(copyBtn);
    // Si own message
    if (msgDiv.classList.contains('own-message')) {
        const editBtn = document.createElement('button');
        editBtn.classList.add('context-option');
        editBtn.textContent = 'Modifier';
        editBtn.addEventListener('click', (e) => {
            e.stopPropagation();
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
            hideContextMenu();
        });
        options.appendChild(editBtn);
        const deleteBtn = document.createElement('button');
        deleteBtn.classList.add('context-option');
        deleteBtn.textContent = 'Supprimer';
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (confirm('Supprimer ce message ?')) {
                socket.emit('delete message', msgDiv.dataset.id);
            }
            hideContextMenu();
        });
        options.appendChild(deleteBtn);
    }
    // Ajouter réaction
    const reactBtn = document.createElement('button');
    reactBtn.classList.add('context-option');
    reactBtn.textContent = 'Ajouter une réaction';
    reactBtn.addEventListener('mouseenter', (e) => {
        const popup = document.getElementById('reaction-popup');
        if (popup) {
            const btnRect = reactBtn.getBoundingClientRect();
            popup.style.left = `${btnRect.right + 5}px`;
            popup.style.top = `${btnRect.top}px`;
            popup.classList.remove('hidden');
            const rect = popup.getBoundingClientRect();
            if (rect.right > window.innerWidth) {
                popup.style.left = `${window.innerWidth - rect.width}px`;
            }
            if (rect.bottom > window.innerHeight) {
                popup.style.top = `${window.innerHeight - rect.height}px`;
            }
        }
        currentMessage = msgDiv;
    });
    reactBtn.addEventListener('mouseleave', (e) => {
        // Delay to allow moving to popup
        setTimeout(() => {
            const popup = document.getElementById('reaction-popup');
            if (popup && !popup.matches(':hover')) {
                popup.classList.add('hidden');
            }
        }, 100);
    });
    options.appendChild(reactBtn);
    // Voir réactions
    const reactionsDiv = msgDiv.querySelector('.reactions');
    if (reactionsDiv && reactionsDiv.children.length > 0) {
        const viewReactBtn = document.createElement('button');
        viewReactBtn.classList.add('context-option');
        viewReactBtn.textContent = 'Voir les réactions';
        viewReactBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const reactionsListDiv = document.getElementById('reactions-list');
            reactionsListDiv.innerHTML = '';
            const reactionsArray = Array.from(reactionsDiv.children).map(r => ({
                element: r,
                users: JSON.parse(r.dataset.users),
                emoji: r.dataset.emoji
            })).sort((a, b) => b.users.length - a.users.length);

            reactionsArray.forEach(({ emoji, users }) => {
                const item = document.createElement('div');
                item.classList.add('reaction-item');
                const count = document.createElement('span');
                count.classList.add('count');
                count.textContent = users.length;
                const emojiSpan = document.createElement('span');
                emojiSpan.classList.add('emoji');
                emojiSpan.textContent = emoji;
                const userList = document.createElement('span');
                userList.classList.add('users');
                userList.textContent = users.join(', ');
                item.appendChild(count);
                item.appendChild(emojiSpan);
                item.appendChild(userList);
                reactionsListDiv.appendChild(item);
            });
            const popup = document.getElementById('reactions-popup');
            popup.classList.remove('hidden');
            hideContextMenu();
        });
        options.appendChild(viewReactBtn);
    }


    menu.classList.remove('hidden');
});

function hideContextMenu() {
    const menu = document.getElementById('context-menu');
    if (menu) menu.style.display = 'none';
}

window.addEventListener('click', function(e) {
    hideContextMenu();
    const popup = document.getElementById('reaction-popup');
    if (popup) popup.classList.add('hidden');
    const reactionsPopup = document.getElementById('reactions-popup');
    if (reactionsPopup) reactionsPopup.classList.add('hidden');
    const userPopup = document.getElementById('user-profile-popup');
    if (userPopup && !userPopup.contains(e.target)) {
        closeUserProfileModal();
    }
    // Hide all reaction menus
    document.querySelectorAll('.reaction-menu').forEach(menu => menu.style.display = 'none');
    currentMessage = null;
});



messages.addEventListener('click', function(e) {
    if (e.target.classList.contains('reaction')) {
        const emoji = e.target.dataset.emoji;
        const users = JSON.parse(e.target.dataset.users);
        const messageId = e.target.closest('.message').dataset.id;
        if (users.includes(user.username)) {
            socket.emit('remove reaction', { messageId, emoji, user: user.username });
        } else {
            socket.emit('add reaction', { messageId, emoji, user: user.username });
        }
    } else if (e.target.closest('.add-reaction-btn')) {
        currentMessage = e.target.closest('.message');
        const reactionMenu = e.target.closest('.message-actions').querySelector('.reaction-menu');
        reactionMenu.style.display = 'flex';
        e.stopPropagation();
    } else if (e.target.closest('.edit-btn')) {
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
    } else if (e.target.closest('.delete-btn')) {
        const msgDiv = e.target.closest('.message');
        if (confirm('Supprimer ce message ?')) {
            socket.emit('delete message', msgDiv.dataset.id);
        }
    } else if (e.target.closest('.reaction-menu') && e.target.tagName === 'SPAN') {
        const emoji = e.target.dataset.emoji;
        if (currentMessage) {
            socket.emit('add reaction', { messageId: currentMessage.dataset.id, emoji, user: user.username });
        }
        const reactionMenu = e.target.closest('.reaction-menu');
        reactionMenu.style.display = 'none';
        currentMessage = null;
        e.stopPropagation();
    }
});

// Gérer les clics sur les emojis de la popup
if (reactionPopup) {
    reactionPopup.addEventListener('click', function(e) {
        if (e.target.tagName === 'SPAN') {
            const emoji = e.target.dataset.emoji;
            if (currentMessage) {
                socket.emit('add reaction', { messageId: currentMessage.dataset.id, emoji, user: user.username });
            }
            if (reactionPopup) reactionPopup.classList.add('hidden');
            currentMessage = null;
        }
    });
}





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
    const files = Array.from(e.target.files);
    files.forEach(file => {
        const reader = new FileReader();
        reader.onload = function(ev) {
            selectedAttachments.push(ev.target.result);
            updatePreview();
        };
        reader.readAsDataURL(file);
    });
    fileInput.value = '';
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

// Gestion des clics sur les membres
document.getElementById('members').addEventListener('click', function(e) {
    const li = e.target.closest('li');
    if (li) {
        e.stopPropagation();
        const span = li.querySelector('span');
        const username = span.textContent === 'Vous' ? user.username : span.textContent;
        openUserProfileModal(username, li);
    }
});



// Fonction pour ajouter réaction depuis sous-menu
function addReaction(emoji) {
    if (currentMessage) {
        const reactionsDiv = currentMessage.querySelector('.reactions');
        let reactionBtn = reactionsDiv.querySelector(`[data-emoji="${emoji}"]`);
        if (!reactionBtn) {
            reactionBtn = document.createElement('button');
            reactionBtn.classList.add('reaction');
            reactionBtn.dataset.emoji = emoji;
            reactionBtn.textContent = `${emoji} 1`;
            reactionsDiv.appendChild(reactionBtn);
        } else {
            let count = parseInt(reactionBtn.textContent.split(' ')[1]) || 0;
            count += 1;
            reactionBtn.textContent = `${emoji} ${count}`;
        }
    }
    hideContextMenu();
}

// Fonctions pour le modal de média
function openMediaModal(src, attachments, index) {
    currentAttachments = attachments;
    currentIndex = index;
    const mediaDiv = document.getElementById('modal-media');
    mediaDiv.innerHTML = '';
    if (src.startsWith('data:image/')) {
        const img = document.createElement('img');
        img.src = src;
        mediaDiv.appendChild(img);
    } else if (src.startsWith('data:video/')) {
        const video = document.createElement('video');
        video.src = src;
        video.controls = true;
        video.style.maxWidth = '100%';
        video.style.maxHeight = '100%';
        mediaDiv.appendChild(video);
    }
    document.getElementById('image-modal').classList.remove('hidden');
    updateArrows();
}

function closeMediaModal() {
    document.getElementById('image-modal').classList.add('hidden');
}

function closeReactionsPopup() {
    document.getElementById('reactions-popup').classList.add('hidden');
}

document.getElementById('close-reactions-popup').addEventListener('click', closeReactionsPopup);

function updateArrows() {
    const left = document.querySelector('.left-arrow');
    const right = document.querySelector('.right-arrow');
    left.style.display = currentIndex > 0 ? 'block' : 'none';
    right.style.display = currentIndex < currentAttachments.length - 1 ? 'block' : 'none';
}

function prevMedia() {
    if (currentIndex > 0) {
        currentIndex--;
        openMediaModal(currentAttachments[currentIndex], currentAttachments, currentIndex);
    }
}

function nextMedia() {
    if (currentIndex < currentAttachments.length - 1) {
        currentIndex++;
        openMediaModal(currentAttachments[currentIndex], currentAttachments, currentIndex);
    }
}

function updateMembersList(users) {
    const membersUl = document.querySelector('#members ul');
    membersUl.innerHTML = '';
    users.forEach(u => {
        const li = document.createElement('li');
        li.style.cursor = 'pointer';
        const avatar = document.createElement('div');
        avatar.classList.add('avatar');
        if (u.profile_pic) {
            const img = document.createElement('img');
            img.src = '/uploads/' + u.profile_pic;
            img.style.width = '100%';
            img.style.height = '100%';
            img.style.borderRadius = '50%';
            img.style.objectFit = 'cover';
            avatar.appendChild(img);
        } else {
            avatar.textContent = u.username[0].toUpperCase();
        }
        const status = document.createElement('div');
        status.classList.add('status', 'online');
        avatar.appendChild(status);
        li.appendChild(avatar);
        const span = document.createElement('span');
        span.textContent = u.username;
        li.appendChild(span);
        membersUl.appendChild(li);
    });
    // Mettre à jour le compteur
    const countSpan = document.querySelector('#members h4 span') || document.querySelector('#members h4');
    if (countSpan.tagName === 'H4') {
        countSpan.textContent = `Membres en ligne - ${users.length}`;
    }
}

function updateUserProfileChannel() {
    let channel = document.getElementById('user-profile-channel');
    if (!channel) {
        channel = document.createElement('div');
        channel.id = 'user-profile-channel';
        const channels = document.getElementById('channels');
        if (channels) channels.appendChild(channel);
    }
    if (!user) return;
    channel.innerHTML = '';
    // Fetch profile
    fetch('/api/profile/' + user.username)
        .then(res => res.json())
        .then(profile => {
            // Set banner as background for the whole channel
            channel.style.backgroundImage = profile.banner ? `url('/uploads/${profile.banner}')` : 'none';
            channel.style.backgroundSize = 'cover';
            channel.style.backgroundPosition = 'center';
            if (profile.banner) {
                channel.style.position = 'relative';
                const overlay = document.createElement('div');
                overlay.style.position = 'absolute';
                overlay.style.top = 0;
                overlay.style.left = 0;
                overlay.style.right = 0;
                overlay.style.bottom = 0;
                overlay.style.backgroundColor = 'rgba(0,0,0,0.1)';
                channel.appendChild(overlay);
                // Ensure text is above overlay
                channel.style.color = 'black';
            }
            // Placeholder for top section
            const topSection = document.createElement('div');
            topSection.classList.add('top-section');
            topSection.textContent = 'Mon Profil';
            channel.appendChild(topSection);
            const separator = document.createElement('div');
            separator.classList.add('separator');
            channel.appendChild(separator);
            const bottomSection = document.createElement('div');
            bottomSection.classList.add('bottom-section');
            const avatar = document.createElement('div');
            avatar.classList.add('avatar');
            if (profile.profile_pic) {
                const img = document.createElement('img');
                img.src = '/uploads/' + profile.profile_pic;
                img.style.width = '100%';
                img.style.height = '100%';
                img.style.borderRadius = '50%';
                img.style.objectFit = 'cover';
                avatar.appendChild(img);
            } else {
                avatar.textContent = profile.username[0].toUpperCase();
            }
            bottomSection.appendChild(avatar);
            const info = document.createElement('div');
            info.classList.add('info');
            const username = document.createElement('div');
            username.classList.add('username');
            username.textContent = profile.username;
            info.appendChild(username);
            const bio = document.createElement('div');
            bio.classList.add('bio');
            bio.textContent = profile.bio || 'Aucune bio';
            info.appendChild(bio);
            bottomSection.appendChild(info);
            channel.appendChild(bottomSection);
            channel.addEventListener('click', () => openUserProfileModal(user.username, channel));
        })
        .catch(() => {
            // Fallback
            const topSection = document.createElement('div');
            topSection.classList.add('top-section');
            topSection.textContent = 'Mon Profil';
            channel.appendChild(topSection);
            const separator = document.createElement('div');
            separator.classList.add('separator');
            channel.appendChild(separator);
            const bottomSection = document.createElement('div');
            bottomSection.classList.add('bottom-section');
            // No banner in fallback
            const avatar = document.createElement('div');
            avatar.classList.add('avatar');
            avatar.textContent = user.username[0].toUpperCase();
            bottomSection.appendChild(avatar);
            const info = document.createElement('div');
            info.classList.add('info');
            const username = document.createElement('div');
            username.classList.add('username');
            username.textContent = user.username;
            info.appendChild(username);
            const bio = document.createElement('div');
            bio.classList.add('bio');
            bio.textContent = 'Aucune bio';
            info.appendChild(bio);
            bottomSection.appendChild(info);
            channel.appendChild(bottomSection);
            channel.addEventListener('click', () => openUserProfileModal(user.username, channel));
        });
}

// Fonctions pour le popup profil utilisateur
async function openUserProfileModal(username, element) {
    console.log('Opening profile for', username);
    const popup = document.getElementById('user-profile-popup');
    try {
        const response = await fetch(`/api/profile/${username}`);
        const profile = await response.json();
        if (response.ok) {
            const banner = document.getElementById('profile-banner');
            const bannerZoom = parseFloat(localStorage.getItem('bannerZoom')) || 1;
            const bannerRotate = parseFloat(localStorage.getItem('bannerRotate')) || 0;
            if (profile.banner) {
                banner.style.backgroundImage = `url('/uploads/${profile.banner}')`;
                banner.style.backgroundSize = 'auto';
                banner.style.backgroundPosition = `${profile.banner_pos_x || 50}% ${profile.banner_pos_y || 50}%`;
                banner.style.transform = `rotate(${bannerRotate}deg) scale(${bannerZoom})`;
            } else {
                banner.style.backgroundImage = 'none';
                banner.style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
                banner.style.transform = 'none';
            }
            const avatar = document.getElementById('profile-avatar');
            if (profile.profile_pic) {
                avatar.innerHTML = `<img src="/uploads/${profile.profile_pic}" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover;">`;
            } else {
                avatar.textContent = profile.username[0].toUpperCase();
                avatar.innerHTML = '';
            }
            document.getElementById('profile-username').textContent = profile.username;
            const bioElement = document.getElementById('profile-bio');
            bioElement.textContent = profile.bio || 'Aucune bio disponible.';

            // Supprimer les éléments d'édition précédents
            bioElement.nextElementSibling?.remove();

            if (username === user.username) {
                // Bouton Modifier le profil
                const editBtn = document.createElement('button');
                editBtn.textContent = 'Modifier le profil';
                editBtn.style.display = 'block';
                editBtn.style.width = '100%';
                editBtn.style.marginTop = 'auto';
                editBtn.style.marginLeft = 'auto';
                editBtn.style.marginRight = 'auto';
                editBtn.style.padding = '10px';
                editBtn.style.backgroundColor = '#5865f2';
                editBtn.style.color = 'white';
                editBtn.style.border = 'none';
                editBtn.style.borderRadius = '4px';
                editBtn.style.cursor = 'pointer';
                editBtn.style.textAlign = 'center';
                editBtn.addEventListener('click', () => {
                    window.location.href = '/profile';
                });
                document.getElementById('profile-info').appendChild(editBtn);
            }

            // Positionner le popup près de l'élément
            const rect = element.getBoundingClientRect();
            popup.style.left = `${rect.right + 10}px`;
            popup.style.top = `${rect.top}px`;
            popup.style.display = 'block';

            // Ajuster si hors écran
            const popupRect = popup.getBoundingClientRect();
            if (popupRect.right > window.innerWidth) {
                popup.style.left = `${rect.left - popupRect.width - 10}px`;
            }
            if (popupRect.bottom > window.innerHeight) {
                popup.style.top = `${window.innerHeight - popupRect.height - 10}px`;
            }
        } else {
            alert('Utilisateur non trouvé');
        }
    } catch (error) {
        console.error('Erreur lors du chargement du profil:', error);
        alert('Erreur lors du chargement du profil');
    }
}

function closeUserProfileModal() {
    document.getElementById('user-profile-popup').style.display = 'none';
}