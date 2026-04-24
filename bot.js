const {
  default: makeWASocket,
  useMultiFileAuthState,
  makeCacheableSignalKeyStore,
  DisconnectReason,
  fetchLatestBaileysVersion,
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const { Boom } = require('@hapi/boom');
const redis = require('redis');
const express = require('express');

// =================================================================
// CONFIGURAÇÕES
// =================================================================
const REDIS_URL = 'redis://default:JyefUsxHJljfdvs8HACumEyLE7XNgLvG@redis-19242.c266.us-east-1-3.ec2.cloud.redislabs.com:19242';
const PHONE_NUMBER = '258858861745';
const OWNER_NUMBER = '253188708028487';
const PREFIX = '!';

// =================================================================
// CONEXÃO COM REDIS
// =================================================================
const redisClient = redis.createClient({
    url: REDIS_URL,
    socket: { reconnectStrategy: (retries) => Math.min(retries * 100, 3000) }
});

redisClient.on('error', (err) => console.error('Redis Error:', err));

// =================================================================
// ESTADO DO BOT
// =================================================================
let config = {
  antiLink: true,
  antiWords: true,
  autoMessages: true,
  removeDelay: { min: 3000, max: 10000 },
  deleteDelay: { min: 3000, max: 10000 },
  messageDelay: { min: 3600000, max: 7200000 }
};

let allowedLinks = [];
let bannedWords = [];
let authorizedGroups = [];
let masterGroup = null;
let scheduledTasks = {};
let scheduledMessages = [];
let groupLeaveTimers = {};

let customMessages = {
  rules: `🚫 *USUÁRIO REMOVIDO*\n\nMotivo: Violação das regras do grupo\n\n📋 *REGRAS DO GRUPO:*\n1. Proibido enviar links não autorizados\n2. Proibido palavras ofensivas (mensagens serão apagadas)\n3. Respeite todos os membros\n4. Spam resulta em banimento\n\n⚡ Use !menu para ver comandos disponíveis`,
  botInfo: `🤖 *BOT DO GRUPO*\n\n✅ Versão: 3.0\n🛡️ Proteção: Anti-Link & Anti-Palavras\n⚡ Prefixo: ${PREFIX}\n📢 Mensagens automáticas: ATIVO\n\n💡 Use !menu para ver todos os comandos`,
  autoMessages: [
    "📌 *LEMBRETE:* Mantenham o respeito e evitem links não autorizados!",
    "🤖 *Bot ativo:* Use !menu para ver os comandos disponíveis.",
    "⚠️ *Aviso:* Links não permitidos resultam em remoção imediata.",
    "💡 *Dica:* Palavras ofensivas terão a mensagem apagada automaticamente.",
    "🔒 *Grupo Protegido:* Anti-link ativo 24/7."
  ]
};

// =================================================================
// CARREGAR DADOS DO REDIS
// =================================================================
async function loadFromRedis() {
  try {
    await redisClient.connect();
    console.log('🚀 Redis conectado!');
    
    const configData = await redisClient.hGetAll('bot:config');
    if (configData && Object.keys(configData).length > 0) {
      config = { ...config, ...JSON.parse(configData.data || '{}') };
    }
    
    const linksData = await redisClient.sMembers('bot:links');
    if (linksData.length > 0) allowedLinks = linksData;
    
    const wordsData = await redisClient.sMembers('bot:words');
    if (wordsData.length > 0) bannedWords = wordsData;
    
    const groupsData = await redisClient.sMembers('bot:groups');
    if (groupsData.length > 0) authorizedGroups = groupsData;
    
    const master = await redisClient.get('bot:master');
    if (master) masterGroup = master;
    
    const msgData = await redisClient.hGetAll('bot:messages');
    if (msgData && Object.keys(msgData).length > 0) {
      customMessages = { ...customMessages, ...JSON.parse(msgData.data || '{}') };
    }
    
    const scheduleData = await redisClient.lRange('bot:schedules', 0, -1);
    if (scheduleData.length > 0) {
      scheduledMessages = scheduleData.map(s => JSON.parse(s));
    }
    
    console.log('✅ Dados carregados do Redis');
  } catch (err) {
    console.error('❌ Erro ao carregar Redis:', err.message);
  }
}

// =================================================================
// SALVAR DADOS NO REDIS
// =================================================================
async function saveConfig() { 
  await redisClient.hSet('bot:config', 'data', JSON.stringify(config)); 
}
async function saveLinks() { 
  await redisClient.del('bot:links');
  if (allowedLinks.length > 0) await redisClient.sAdd('bot:links', allowedLinks);
}
async function saveWords() { 
  await redisClient.del('bot:words');
  if (bannedWords.length > 0) await redisClient.sAdd('bot:words', bannedWords);
}
async function saveGroups() {
  await redisClient.del('bot:groups');
  if (authorizedGroups.length > 0) await redisClient.sAdd('bot:groups', authorizedGroups);
  if (masterGroup) await redisClient.set('bot:master', masterGroup);
}
async function saveSchedules() { 
  await redisClient.del('bot:schedules');
  for (const s of scheduledMessages) {
    await redisClient.rPush('bot:schedules', JSON.stringify(s));
  }
}
async function saveMessages() { 
  await redisClient.hSet('bot:messages', 'data', JSON.stringify(customMessages)); 
}

// =================================================================
// FUNÇÕES AUXILIARES
// =================================================================
const logger = pino({ level: 'silent' });
const AUTH_FOLDER = './auth_info_baileys';

function isGroupAuthorized(groupJid) {
  return authorizedGroups.includes(groupJid) || groupJid === masterGroup;
}

function isOwner(sender) {
  return sender.split('@')[0] === OWNER_NUMBER;
}

function randomDelay(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function containsLink(text) {
  const urlRegex = /(https?:\/\/[^\s]+)|(www\.[^\s]+)|([a-zA-Z0-9-]+\.(com|org|net|io|gg|me|link|chat|whatsapp|telegram|click|online|site|blog|info|biz|us|xyz|top|club|shop|store|app|dev|tech|cloud))/gi;
  return urlRegex.test(text);
}

function isLinkAllowed(text) {
  if (allowedLinks.length === 0) return false;
  return allowedLinks.some(domain => text.toLowerCase().includes(domain.toLowerCase()));
}

function containsBannedWord(text) {
  if (bannedWords.length === 0) return false;
  return bannedWords.some(word => text.toLowerCase().includes(word.toLowerCase()));
}

async function isGroupAdmin(sock, groupJid, participantJid) {
  try {
    const groupMetadata = await sock.groupMetadata(groupJid);
    return groupMetadata.participants
      .filter(p => p.admin === 'admin' || p.admin === 'superadmin')
      .map(p => p.id)
      .includes(participantJid);
  } catch { return false; }
}

async function isBotAdmin(sock, groupJid) {
  if (groupJid === masterGroup || authorizedGroups.includes(groupJid)) {
    return true;
  }
  try {
    const botJid = sock.user.id;
    const groupMetadata = await sock.groupMetadata(groupJid);
    const admins = groupMetadata.participants
      .filter(p => p.admin === 'admin' || p.admin === 'superadmin')
      .map(p => p.id);
    return admins.includes(botJid) || admins.includes(PHONE_NUMBER + '@s.whatsapp.net');
  } catch { return false; }
}

function scheduleAutoMessage(sock, groupJid) {
  if (!isGroupAuthorized(groupJid) || !config.autoMessages) return;
  if (scheduledTasks[groupJid]) clearTimeout(scheduledTasks[groupJid]);
  
  const delay = randomDelay(config.messageDelay.min, config.messageDelay.max);
  scheduledTasks[groupJid] = setTimeout(async () => {
    try {
      const randomMsg = customMessages.autoMessages[Math.floor(Math.random() * customMessages.autoMessages.length)];
      await sock.sendMessage(groupJid, { text: randomMsg });
    } catch (err) {}
    scheduleAutoMessage(sock, groupJid);
  }, delay);
}

async function sendRulesOnRemove(sock, groupJid) {
  setTimeout(async () => {
    try { await sock.sendMessage(groupJid, { text: customMessages.rules }); } catch (err) {}
  }, randomDelay(3000, 10000));
}

// =================================================================
// VERIFICAR AGENDAMENTOS
// =================================================================
function checkScheduledMessages(sock) {
  setInterval(async () => {
    const now = new Date();
    const toSend = scheduledMessages.filter(s => {
      const scheduledTime = new Date(s.datetime);
      return !s.sent && scheduledTime <= now;
    });
    
    for (const schedule of toSend) {
      try {
        await sock.sendMessage(schedule.target, { text: schedule.message });
        schedule.sent = true;
      } catch (err) {}
    }
    
    if (toSend.length > 0) saveSchedules();
  }, 30000);
}

// =================================================================
// FUNÇÃO PRINCIPAL DO BOT
// =================================================================
async function connectToWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_FOLDER);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, logger) },
    logger,
    printQRInTerminal: false,
    browser: ['Mac OS', 'Chrome', '10.15.7'],
    markOnlineOnConnect: true,
    syncFullHistory: false,
  });

  let connectionClosed = false;

  sock.ev.on('connection.update', async (update) => {
    const { connection, qr } = update;
    if (qr && !sock.authState.creds.registered && !connectionClosed) {
      console.log('🔄 Gerando código de pareamento...');
      try {
        await new Promise(resolve => setTimeout(resolve, 2000));
        const code = await sock.requestPairingCode(PHONE_NUMBER);
        console.log('✅ CÓDIGO:', code?.match(/.{1,4}/g)?.join('-') || code);
      } catch (err) {}
    }
    if (connection === 'close') {
      connectionClosed = true;
      setTimeout(() => connectToWhatsApp().catch(console.error), 5000);
    } else if (connection === 'open') {
      console.log('✅ BOT CONECTADO AO WHATSAPP!');
      checkScheduledMessages(sock);
    }
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('messages.upsert', async ({ messages }) => {
    const msg = messages[0];
    if (!msg.message || msg.key.fromMe) return;

    const remoteJid = msg.key.remoteJid;
    const isGroup = remoteJid.endsWith('@g.us');
    const sender = msg.key.participant || remoteJid;
    const pushName = msg.pushName || 'Usuário';
    
    const messageContent = msg.message.conversation || msg.message.extendedTextMessage?.text || '';
    if (!messageContent) return;

    const isSenderOwner = isOwner(sender);
    const isSenderAdmin = isGroup ? await isGroupAdmin(sock, remoteJid, sender) : false;
    const isBotAdminStatus = isGroup ? await isBotAdmin(sock, remoteJid) : false;

    // Anti-Link (apaga + remove)
    if (isGroup && isGroupAuthorized(remoteJid) && config.antiLink && containsLink(messageContent)) {
      if (!isSenderAdmin && !isSenderOwner && !isLinkAllowed(messageContent) && isBotAdminStatus) {
        setTimeout(async () => {
          try { await sock.sendMessage(remoteJid, { delete: { remoteJid, id: msg.key.id, participant: sender } }); } catch (err) {}
        }, randomDelay(2000, 4000));
        
        setTimeout(async () => {
          try {
            await sock.groupParticipantsUpdate(remoteJid, [sender], 'remove');
            sendRulesOnRemove(sock, remoteJid);
          } catch (err) {}
        }, randomDelay(config.removeDelay.min, config.removeDelay.max));
        return;
      }
    }

    // Anti-Palavras (apaga)
    if (isGroup && isGroupAuthorized(remoteJid) && config.antiWords && containsBannedWord(messageContent)) {
      if (!isSenderAdmin && !isSenderOwner && isBotAdminStatus) {
        setTimeout(async () => {
          try { await sock.sendMessage(remoteJid, { delete: { remoteJid, id: msg.key.id, participant: sender } }); } catch (err) {}
        }, randomDelay(config.deleteDelay.min, config.deleteDelay.max));
        return;
      }
    }

    const args = messageContent.startsWith(PREFIX) ? messageContent.slice(PREFIX.length).trim().split(/ +/) : [];
    const command = args.shift()?.toLowerCase();
    if (!command) return;

    // Comandos públicos
    if (command === 'menu') {
      await sock.sendMessage(remoteJid, { text: `📋 *MENU*\n\n!menu - Menu\n!info - Informações\n!bot - Sobre\n!regras - Regras` });
    }
    else if (command === 'info') {
      if (isGroup) {
        try {
          const meta = await sock.groupMetadata(remoteJid);
          await sock.sendMessage(remoteJid, { text: `📝 ${meta.subject}\n👥 ${meta.participants.length} membros\n👑 Sua posição: ${isSenderAdmin ? 'Admin' : 'Membro'}` });
        } catch (err) {}
      } else {
        await sock.sendMessage(remoteJid, { text: `👤 ${pushName}\n🆔 ${sender.split('@')[0]}` });
      }
    }
    else if (command === 'bot') {
      await sock.sendMessage(remoteJid, { text: customMessages.botInfo });
    }
    else if (command === 'regras') {
      await sock.sendMessage(remoteJid, { text: customMessages.rules });
    }

    // Comandos do Owner (só privado)
    if (!isSenderOwner) return;
    
    if (command === 'addlink') {
      const link = args[0]?.toLowerCase();
      if (link && !allowedLinks.includes(link)) {
        allowedLinks.push(link);
        await saveLinks();
        await sock.sendMessage(remoteJid, { text: `✅ Link "${link}" permitido!` });
      }
    }
    else if (command === 'listlinks') {
      const lista = allowedLinks.length > 0 ? allowedLinks.join('\n') : 'Nenhum';
      await sock.sendMessage(remoteJid, { text: `🔗 Links:\n${lista}` });
    }
    else if (command === 'addword') {
      const word = args.join(' ').toLowerCase();
      if (word && !bannedWords.includes(word)) {
        bannedWords.push(word);
        await saveWords();
        await sock.sendMessage(remoteJid, { text: `✅ Palavra banida!` });
      }
    }
    else if (command === 'listwords') {
      const lista = bannedWords.length > 0 ? bannedWords.join('\n') : 'Nenhuma';
      await sock.sendMessage(remoteJid, { text: `🚫 Palavras:\n${lista}` });
    }
    else if (command === 'authgroup' && isGroup) {
      if (!authorizedGroups.includes(remoteJid)) {
        authorizedGroups.push(remoteJid);
        await saveGroups();
        await sock.sendMessage(remoteJid, { text: `✅ Grupo autorizado!` });
      }
    }
    else if (command === 'status') {
      await sock.sendMessage(remoteJid, { text: `✅ Online\n👑 Owner: ${OWNER_NUMBER}\n📋 Grupos: ${authorizedGroups.length}\n🔗 Links: ${allowedLinks.length}\n🚫 Palavras: ${bannedWords.length}` });
    }
  });

  return sock;
}

// =================================================================
// SERVIDOR EXPRESS (PARA RENDER)
// =================================================================
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.json({ 
    status: 'online',
    bot: 'Mr Doso',
    version: '3.0',
    timestamp: new Date().toISOString()
  });
});

app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy',
    redis: redisClient.isReady,
    groups: authorizedGroups.length,
    links: allowedLinks.length,
    words: bannedWords.length,
    uptime: process.uptime()
  });
});

// =================================================================
// SISTEMA ANTI-SLEEP (Mantém o Render acordado)
// =================================================================
// Ping interno a cada 5 minutos
setInterval(async () => {
  try {
    const http = require('http');
    http.get(`http://localhost:${PORT}/health`, (res) => {
      console.log(`🔄 Keep-alive interno: ${new Date().toLocaleTimeString()}`);
    }).on('error', () => {});
  } catch (err) {}
}, 300000);

// Ping externo a cada 10 minutos
setInterval(async () => {
  try {
    const https = require('https');
    https.get('https://darktunnelmz.onrender.com/health', (res) => {
      console.log(`📡 Keep-alive externo: ${new Date().toLocaleTimeString()}`);
    }).on('error', () => {});
  } catch (err) {}
}, 600000);

// =================================================================
// INICIAR TUDO
// =================================================================
async function start() {
  await loadFromRedis();
  
  app.listen(PORT, () => {
    console.log(`🌐 Servidor rodando na porta ${PORT}`);
  });
  
  await connectToWhatsApp();
}

start().catch(console.error);