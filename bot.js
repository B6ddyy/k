const { 
    useMultiFileAuthState, 
    makeInMemoryStore, 
    makeWASocket, 
    DisconnectReason, 
    Browsers 
} = require('@whiskeysockets/baileys');
const fs = require('fs');

// Caminho do arquivo JSON
const filePath = './messages.json';

// Função para carregar mensagens do arquivo
function loadMessages() {
    if (fs.existsSync(filePath)) {
        const data = fs.readFileSync(filePath);
        return JSON.parse(data);
    }
    return {
        welcomeMessage: "Olá! Seja bem-vindo ao grupo!",
        correctResponseMessage: "Ótimo! Você respondeu corretamente!"
    };
}

// Função para salvar mensagens no arquivo
function saveMessages(messages) {
    fs.writeFileSync(filePath, JSON.stringify(messages, null, 2));
}

// Carregar mensagens ao iniciar o bot
let messages = loadMessages();
let welcomeMessage = messages.welcomeMessage;
let correctResponseMessage = messages.correctResponseMessage;

// Defina seu número de telefone (com o código do país)
const MY_PHONE_NUMBER = '559191769980@s.whatsapp.net'; // Seu número no formato correto

// Variáveis para controlar o estado do bot
let isBotActive = true;
let isPaused = false; // Variável para controlar a pausa

// Função para atualizar e salvar mensagens
async function updateMessages(newWelcomeMessage, newResponseMessage) {
    messages.welcomeMessage = newWelcomeMessage;
    messages.correctResponseMessage = newResponseMessage; // Atualiza a mensagem de resposta correta
    saveMessages(messages); // Salva as mensagens no arquivo
}

// Função para enviar mensagens com delay
async function sendMessageWithDelay(sock, jid, message, delay = 4000) {
    await new Promise(resolve => setTimeout(resolve, delay));
    await sock.sendMessage(jid, { text: message });
}

// Função para inicializar o bot
async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('baileys_auth_info');
    const store = makeInMemoryStore({});

    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: true,
        browser: Browsers.ubuntu('Chrome')
    });

    store.bind(sock.ev);

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect.error)?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) {
                console.log('Reconectando em 5 segundos...');
                setTimeout(() => startBot(), 5000); // Espera 5 segundos antes de reiniciar
            } else {
                console.log('Desconectado. Você precisa escanear o QR Code novamente.');
            }
        } else if (connection === 'open') {
            console.log('Conectado ao WhatsApp!');
        }
    });

    sock.ev.on('group-participants.update', async (update) => {
        if (update.action === 'add') {
            const { participants } = update;
            const newMember = participants[0];
            console.log(`Novo membro adicionado: ${newMember}`);

            if (!isPaused) {
                await sendMessageWithDelay(sock, newMember, welcomeMessage); // Envia mensagem de boas-vindas com delay

                // Monitorar a resposta do novo membro
                sock.ev.on('messages.upsert', async (message) => {
                    const { messages } = message;
                    const msg = messages[0];
                    if (msg.key.remoteJid === newMember && msg.message.conversation) {
                        const userResponse = msg.message.conversation.toLowerCase();
                        console.log(`Resposta do novo membro: ${userResponse}`);
                        if (userResponse.includes('quero')) {
                            await sendMessageWithDelay(sock, newMember, correctResponseMessage); // Envia resposta correta com delay
                        }
                    }
                });
            }
        }
    });

    // Escutar mensagens do seu número para mudar textos e reiniciar
    sock.ev.on('messages.upsert', async (message) => {
        try {
            const { messages } = message;
            const msg = messages[0];

            // Verifica se a mensagem é do seu número
            if (msg.key.remoteJid === MY_PHONE_NUMBER && msg.message.conversation) {
                const command = msg.message.conversation.trim(); // Preserva a formatação original
                console.log(`Comando recebido: ${command}`);

                // Comandos para mudar as mensagens e controlar o bot
                if (command.startsWith('/set welcome ')) {
                    const newMessage = command.slice(13).trim();
                    if (newMessage.startsWith('"') && newMessage.endsWith('"')) {
                        const updatedMessage = newMessage.slice(1, -1);
                        await updateMessages(updatedMessage, correctResponseMessage); // Atualiza a mensagem de boas-vindas
                        await sendMessageWithDelay(sock, MY_PHONE_NUMBER, "Mensagem de boas-vindas atualizada!"); // Envia confirmação com delay
                    } else {
                        await sendMessageWithDelay(sock, MY_PHONE_NUMBER, "Por favor, coloque a nova mensagem de boas-vindas entre aspas."); // Envia aviso com delay
                    }
                } else if (command.startsWith('/set response ')) {
                    const newResponse = command.slice(14).trim();
                    if (newResponse.startsWith('"') && newResponse.endsWith('"')) {
                        const updatedResponse = newResponse.slice(1, -1);
                        await updateMessages(welcomeMessage, updatedResponse); // Atualiza a mensagem de resposta
                        await sendMessageWithDelay(sock, MY_PHONE_NUMBER, "Mensagem de resposta correta atualizada!"); // Envia confirmação com delay
                    } else {
                        await sendMessageWithDelay(sock, MY_PHONE_NUMBER, "Por favor, coloque a nova mensagem de resposta entre aspas."); // Envia aviso com delay
                    }
                } else if (command === '/reiniciar') {
                    await sendMessageWithDelay(sock, MY_PHONE_NUMBER, "Reiniciando o bot..."); // Envia aviso com delay
                    console.log('Reiniciando o bot...');
                    setTimeout(() => startBot(), 5000); // Espera 5 segundos antes de reiniciar
                } else if (command === '/ping') {
                    await sendMessageWithDelay(sock, MY_PHONE_NUMBER, "Pong! Estou funcionando!"); // Envia resposta de ping com delay
                } else if (command === '/pause') {
                    isPaused = true; // Ativa a pausa
                    await sendMessageWithDelay(sock, MY_PHONE_NUMBER, "Bot pausado. Você pode modificar as mensagens."); // Envia aviso de pausa
                } else if (command === '/resume') {
                    isPaused = false; // Desativa a pausa
                    await sendMessageWithDelay(sock, MY_PHONE_NUMBER, "Bot retomado!"); // Envia confirmação de retomada
                }
            }
        } catch (error) {
            console.error('Erro ao processar a mensagem:', error);
        }
    });
}

// Iniciar o bot
startBot();
