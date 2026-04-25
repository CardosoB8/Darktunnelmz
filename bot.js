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
const OWNER_DISPLAY = '865446574';
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
  antiStatus: false,
  antiMencao: false,
  antiApk: false,
  autoMessages: true,
  antiFlood: true,
  maxFloodMessages: 5,
  floodTimeWindow: 60,
  maxWarnings: 3,
  removeDelay: { min: 3000, max: 10000 },
  deleteDelay: { min: 3000, max: 10000 },
  messageDelay: { min: 3600000, max: 7200000 },
  responseDelay: { min: 3000, max: 8000 },
  deleteCmdDelay: { min: 2000, max: 4000 }
};

let allowedLinks = [];
let bannedWords = [];
let bannedExtensions = [];
let authorizedGroups = [];
let masterGroup = null;
let scheduledTasks = {};
let scheduledMessages = [];
let groupLeaveTimers = {};
let autoResponses = [];
let customCommands = [];
let floodTracker = {};
let actionLog = [];
let warnings = {};
let dailyReminders = {};
let fixedMessage = null;
let fixedMessageTimer = null;

let customMessages = {
  welcome: null,
  goodbye: null,
  rules: `◜──────────────────◝\n     *REGRAS DO GRUPO*\n◞──────────────────◟\n1. Proibido enviar links\n   nao autorizados\n2. Proibido palavras ofensivas\n3. Respeite todos os membros\n4. Spam resulta em banimento\n\nComandos: !menu\n◝──────────────────◜`,
  removeMsg: `◜──────────────────◝\n    *USUARIO REMOVIDO*\n◞──────────────────◟\nMotivo: Violacao das regras\n\nUm membro foi removido por\ninfringir as regras.\n\nRegras: use !regras\n◝──────────────────◜`,
  wordWarning: `◜──────────────────◝\n       *AVISO*\n◞──────────────────◟\nSua mensagem foi apagada\npor conter palavra proibida.\n\nLeia as regras: !regras\n◝──────────────────◜`,
  botInfo: `◜──────────────────◝\n   *BOT MR DOSO v1.2*\n◞──────────────────◟\nProtecao: Anti-Link e\nAnti-Palavras\n\nComandos: !menu\nCriado por: Mr Doso\n◝──────────────────◜`,
  autoMessages: [
    "◜──────────────────◝\n      *LEMBRETE*\n◞──────────────────◟\nMantenham o respeito e\nevitam links nao\nautorizados!\n◝──────────────────◜",
    "◜──────────────────◝\n      *BOT ATIVO*\n◞──────────────────◟\nUse *!menu* para ver os\ncomandos disponiveis.\n◝──────────────────◜",
    "◜──────────────────◝\n       *AVISO*\n◞──────────────────◟\nLinks nao permitidos\nresultam em remocao.\n◝──────────────────◜",
    "◜──────────────────◝\n        *DICA*\n◞──────────────────◟\nPalavras ofensivas terao\na mensagem apagada.\n◝──────────────────◜",
    "◜──────────────────◝\n   *GRUPO PROTEGIDO*\n◞──────────────────◟\nAnti-link ativo 24/7.\n◝──────────────────◜"
  ]
};

// =================================================================
// CARREGAR DADOS DO REDIS
// =================================================================
async function loadFromRedis() {
  try {
    await redisClient.connect();
    console.log('Redis conectado!');
    
    const configData = await redisClient.hGetAll('bot:config');
    if (configData && Object.keys(configData).length > 0) {
      config = { ...config, ...JSON.parse(configData.data || '{}') };
    }
    
    const linksData = await redisClient.sMembers('bot:links');
    if (linksData.length > 0) allowedLinks = linksData;
    
    const wordsData = await redisClient.sMembers('bot:words');
    if (wordsData.length > 0) bannedWords = wordsData;
    
    const extData = await redisClient.sMembers('bot:extensions');
    if (extData.length > 0) bannedExtensions = extData;
    
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
    
    const responsesData = await redisClient.lRange('bot:autoresponses', 0, -1);
    if (responsesData.length > 0) {
      autoResponses = responsesData.map(r => JSON.parse(r));
    }
    
    const commandsData = await redisClient.hGetAll('bot:customcommands');
    if (commandsData && Object.keys(commandsData).length > 0) {
      customCommands = Object.entries(commandsData).map(([name, data]) => {
        try {
          const parsed = JSON.parse(data);
          return { name, response: parsed.response, public: parsed.public || false };
        } catch {
          return { name, response: data, public: false };
        }
      });
    }
    
    const warningsData = await redisClient.hGetAll('bot:warnings');
    if (warningsData && Object.keys(warningsData).length > 0) {
      for (const [key, value] of Object.entries(warningsData)) {
        warnings[key] = JSON.parse(value);
      }
    }
    
    const fixedData = await redisClient.get('bot:fixedmessage');
    if (fixedData) {
      fixedMessage = JSON.parse(fixedData);
    }
    
    console.log('Dados carregados do Redis');
  } catch (err) {
    console.error('Erro ao carregar Redis:', err.message);
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
async function saveExtensions() {
  await redisClient.del('bot:extensions');
  if (bannedExtensions.length > 0) await redisClient.sAdd('bot:extensions', bannedExtensions);
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
async function saveAutoResponses() {
  await redisClient.del('bot:autoresponses');
  for (const r of autoResponses) {
    await redisClient.rPush('bot:autoresponses', JSON.stringify(r));
  }
}
async function saveCustomCommands() {
  await redisClient.del('bot:customcommands');
  for (const c of customCommands) {
    await redisClient.hSet('bot:customcommands', c.name, JSON.stringify({ response: c.response, public: c.public || false }));
  }
}
async function saveWarnings() {
  await redisClient.del('bot:warnings');
  for (const [key, value] of Object.entries(warnings)) {
    if (value && value.count > 0) {
      await redisClient.hSet('bot:warnings', key, JSON.stringify(value));
    }
  }
}
async function saveFixedMessage() {
  if (fixedMessage) {
    await redisClient.set('bot:fixedmessage', JSON.stringify(fixedMessage));
  } else {
    await redisClient.del('bot:fixedmessage');
  }
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

function containsBannedExtension(text) {
  if (bannedExtensions.length === 0) return false;
  return bannedExtensions.some(ext => text.toLowerCase().endsWith('.' + ext.toLowerCase()));
}

function isApkFile(msg) {
  if (!config.antiApk) return false;
  const caption = msg.message?.documentMessage?.caption || '';
  const filename = msg.message?.documentMessage?.fileName || '';
  const text = (msg.message?.conversation || msg.message?.extendedTextMessage?.text || caption || filename || '').toLowerCase();
  return text.includes('.apk') || text.includes('apk');
}

function matchAutoResponse(text) {
  for (const response of autoResponses) {
    const words = response.trigger.toLowerCase().split(' ');
    const allMatch = words.every(word => text.toLowerCase().includes(word));
    if (allMatch) return response.reply;
  }
  return null;
}

function addToLog(action) {
  actionLog.push({ ...action, time: new Date().toISOString() });
  if (actionLog.length > 50) actionLog.shift();
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

function checkFlood(sender, groupJid) {
  if (!config.antiFlood) return false;
  
  const now = Date.now();
  const key = `${groupJid}:${sender}`;
  
  if (!floodTracker[key]) {
    floodTracker[key] = { messages: [now], warned: false };
    return false;
  }
  
  const tracker = floodTracker[key];
  tracker.messages = tracker.messages.filter(t => now - t < config.floodTimeWindow * 1000);
  tracker.messages.push(now);
  
  if (tracker.messages.length >= config.maxFloodMessages) {
    return true;
  }
  
  return false;
}

function clearFlood(sender, groupJid) {
  const key = `${groupJid}:${sender}`;
  delete floodTracker[key];
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

function startFixedMessage(sock) {
  if (fixedMessageTimer) clearInterval(fixedMessageTimer);
  
  fixedMessageTimer = setInterval(async () => {
    if (!fixedMessage || !fixedMessage.active) return;
    try {
      for (const groupJid of authorizedGroups) {
        await sock.sendMessage(groupJid, { text: `📌 ${fixedMessage.text}` });
      }
    } catch (err) {}
  }, 1800000);
}

function checkScheduledMessages(sock) {
  setInterval(async () => {
    const now = new Date();
    const toSend = scheduledMessages.filter(s => {
      const scheduledTime = new Date(s.datetime);
      return !s.sent && scheduledTime <= now;
    });
    
    for (const schedule of toSend) {
      try {
        let mentionText = `◜──────────────────◝\n     *AGENDAMENTO*\n◞──────────────────◟\n${schedule.message}\n\n@todos\n◝──────────────────◜`;
        await sock.sendMessage(schedule.target, { 
          text: mentionText,
          mentions: [] 
        });
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
      console.log('Gerando codigo de pareamento...');
      try {
        await new Promise(resolve => setTimeout(resolve, 2000));
        const code = await sock.requestPairingCode(PHONE_NUMBER);
        console.log('CODIGO:', code?.match(/.{1,4}/g)?.join('-') || code);
      } catch (err) {}
    }
    if (connection === 'close') {
      connectionClosed = true;
      setTimeout(() => connectToWhatsApp().catch(console.error), 5000);
    } else if (connection === 'open') {
      console.log('BOT CONECTADO AO WHATSAPP!');
      checkScheduledMessages(sock);
      startFixedMessage(sock);
    }
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('messages.upsert', async ({ messages }) => {
    const msg = messages[0];
    if (!msg.message || msg.key.fromMe) return;

    const remoteJid = msg.key.remoteJid;
    const isGroup = remoteJid.endsWith('@g.us');
    const sender = msg.key.participant || remoteJid;
    const pushName = msg.pushName || 'Usuario';
    
    const messageContent = msg.message.conversation || msg.message.extendedTextMessage?.text || msg.message.imageMessage?.caption || msg.message.videoMessage?.caption || '';

    const isSenderOwner = isOwner(sender);
    const isSenderAdmin = isGroup ? await isGroupAdmin(sock, remoteJid, sender) : false;
    const isBotAdminStatus = isGroup ? await isBotAdmin(sock, remoteJid) : false;

    // ========== ANTI-STATUS ==========
    if (isGroup && isGroupAuthorized(remoteJid) && !isSenderAdmin && !isSenderOwner && config.antiStatus) {
      const text = (messageContent || '').trim();
      if (text && (text.startsWith('~') || text === '' || (text.includes('status') && text.length < 15))) {
        if (isBotAdminStatus) {
          setTimeout(async () => {
            try { await sock.sendMessage(remoteJid, { delete: { remoteJid, id: msg.key.id, participant: sender } }); } catch (err) {}
          }, randomDelay(3000, 8000));
          return;
        }
      }
    }

    // ========== ANTI-MENÇÃO ==========
    if (isGroup && isGroupAuthorized(remoteJid) && !isSenderAdmin && !isSenderOwner && config.antiMencao && isBotAdminStatus) {
      const text = messageContent || '';
      const withoutMentions = text.replace(/@\d+/g, '').trim();
      if (withoutMentions.length === 0 && text.includes('@')) {
        setTimeout(async () => {
          try { await sock.sendMessage(remoteJid, { delete: { remoteJid, id: msg.key.id, participant: sender } }); } catch (err) {}
        }, randomDelay(3000, 8000));
        return;
      }
    }

    // ========== ANTI-APK ==========
    if (isGroup && isGroupAuthorized(remoteJid) && !isSenderAdmin && !isSenderOwner && config.antiApk && isBotAdminStatus) {
      if (isApkFile(msg)) {
        setTimeout(async () => {
          try { await sock.sendMessage(remoteJid, { delete: { remoteJid, id: msg.key.id, participant: sender } }); } catch (err) {}
        }, randomDelay(3000, 8000));
        return;
      }
    }

    // ========== ANTI-EXTENSÃO ==========
    if (isGroup && isGroupAuthorized(remoteJid) && !isSenderAdmin && !isSenderOwner && isBotAdminStatus) {
      if (containsBannedExtension(messageContent)) {
        setTimeout(async () => {
          try { await sock.sendMessage(remoteJid, { delete: { remoteJid, id: msg.key.id, participant: sender } }); } catch (err) {}
        }, randomDelay(3000, 8000));
        return;
      }
    }

    if (!messageContent) return;

    // ========== ANTI-FLOOD ==========
    if (isGroup && !isSenderAdmin && !isSenderOwner && checkFlood(sender, remoteJid)) {
      if (isBotAdminStatus) {
        setTimeout(async () => {
          try {
            await sock.groupParticipantsUpdate(remoteJid, [sender], 'remove');
            addToLog({ action: 'flood_ban', sender, group: remoteJid });
          } catch (err) {}
        }, randomDelay(2000, 5000));
        return;
      }
    }

    // ========== ANTI-LINK (COM ADVERTÊNCIAS) ==========
    if (isGroup && isGroupAuthorized(remoteJid) && config.antiLink && containsLink(messageContent)) {
      if (!isSenderAdmin && !isSenderOwner && !isLinkAllowed(messageContent) && isBotAdminStatus) {
        setTimeout(async () => {
          try { await sock.sendMessage(remoteJid, { delete: { remoteJid, id: msg.key.id, participant: sender } }); } catch (err) {}
        }, randomDelay(2000, 4000));
        
        // Sistema de advertências para links
        const warnKey = `${remoteJid}:${sender}`;
        if (!warnings[warnKey]) warnings[warnKey] = { count: 0, lastWarn: null };
        warnings[warnKey].count++;
        warnings[warnKey].lastWarn = new Date().toISOString();
        await saveWarnings();
        
        const currentWarnings = warnings[warnKey].count;
        const maxW = config.maxWarnings;
        
        if (currentWarnings >= maxW) {
          setTimeout(async () => {
            try {
              await sock.groupParticipantsUpdate(remoteJid, [sender], 'remove');
              delete warnings[warnKey];
              await saveWarnings();
              addToLog({ action: 'link_ban', sender, group: remoteJid });
              await sock.sendMessage(remoteJid, { text: customMessages.removeMsg });
            } catch (err) {}
          }, randomDelay(config.removeDelay.min, config.removeDelay.max));
        } else {
          const remaining = maxW - currentWarnings;
          await sock.sendMessage(remoteJid, { 
            text: `◜──────────────────◝\n   *ADVERTENCIA ${currentWarnings}/${maxW}*\n◞──────────────────◟\n@${sender.split('@')[0]} voce recebeu uma\nadvertencia por link nao\nautorizado.\n\nRestam ${remaining} advertencia(s).\nNa proxima, sera removido!\n◝──────────────────◜`,
            mentions: [sender]
          });
        }
        return;
      }
    }

    // ========== ANTI-PALAVRAS (SÓ APAGA E AVISA) ==========
    if (isGroup && isGroupAuthorized(remoteJid) && config.antiWords && containsBannedWord(messageContent)) {
      if (!isSenderAdmin && !isSenderOwner && isBotAdminStatus) {
        setTimeout(async () => {
          try { await sock.sendMessage(remoteJid, { delete: { remoteJid, id: msg.key.id, participant: sender } }); } catch (err) {}
          addToLog({ action: 'word_delete', sender, group: remoteJid });
          await sock.sendMessage(remoteJid, { 
            text: `◜──────────────────◝\n       *AVISO*\n◞──────────────────◟\n@${sender.split('@')[0]} sua mensagem foi\napagada por conter palavra\nproibida.\n\nLeia as regras: !regras\n◝──────────────────◜`,
            mentions: [sender]
          });
        }, randomDelay(config.deleteDelay.min, config.deleteDelay.max));
        return;
      }
    }

    // ========== RESPOSTAS AUTOMATICAS ==========
    if (isGroup && isGroupAuthorized(remoteJid)) {
      const autoReply = matchAutoResponse(messageContent);
      if (autoReply) {
        setTimeout(async () => {
          await sock.sendMessage(remoteJid, { text: autoReply }, { quoted: msg });
        }, randomDelay(config.responseDelay.min, config.responseDelay.max));
        return;
      }
    }

    // ========== COMANDOS COM PREFIXO ==========
    const args = messageContent.startsWith(PREFIX) ? messageContent.slice(PREFIX.length).trim().split(/ +/) : [];
    const command = args.shift()?.toLowerCase();
    if (!command) return;

    // ========== COMANDO DELETE (responder mensagem) ==========
    if (command === 'delete' && isGroup) {
      if (!isSenderAdmin && !isSenderOwner) {
        await sock.sendMessage(remoteJid, { text: 'Apenas administradores!' });
        return;
      }
      
      const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.stanzaId;
      const quotedSender = msg.message?.extendedTextMessage?.contextInfo?.participant;
      
      if (!quotedMsg) {
        await sock.sendMessage(remoteJid, { text: 'Responda uma mensagem com !delete para apagar!' });
        return;
      }
      
      setTimeout(async () => {
        try {
          await sock.sendMessage(remoteJid, { 
            delete: { remoteJid, id: quotedMsg, participant: quotedSender || sender } 
          });
        } catch (err) {}
      }, randomDelay(config.deleteCmdDelay.min, config.deleteCmdDelay.max));
      return;
    }

    // ========== COMANDO TODOS ==========
    if (command === 'todos' && isGroup) {
      if (!isSenderAdmin && !isSenderOwner) {
        await sock.sendMessage(remoteJid, { text: 'Apenas administradores!' });
        return;
      }
      
      const mensagem = args.join(' ');
      const texto = mensagem || 'Atencao a todos!';
      
      await sock.sendMessage(remoteJid, { 
        text: `◜──────────────────◝\n       *TODOS*\n◞──────────────────◟\n${texto}\n◝──────────────────◜`,
        mentions: []
      });
      return;
    }

    // ========== COMANDOS PUBLICOS ==========
    if (command === 'menu') {
      let menu = `◜──────────────────◝\n  *MENU DO BOT - MR DOSO*\n◞──────────────────◟\n!menu      ➜  Ver este menu\n!info      ➜  Informacoes\n!dono      ➜  Ver dono do bot\n!bot       ➜  Sobre o bot\n!regras    ➜  Regras do grupo\n!ping      ➜  Testar bot\n!links     ➜  Links permitidos\n!advertencias ➜ Ver advertencias\n!lembrete [min] [msg]`;
      
      const publicCommands = customCommands.filter(c => c.public);
      if (publicCommands.length > 0) {
        for (const c of publicCommands) {
          menu += `\n!${c.name.padEnd(10)} ➜  ${c.response.substring(0, 15)}`;
        }
      }
      
      menu += `\n◝──────────────────◜`;
      await sock.sendMessage(remoteJid, { text: menu });
      return;
    }

    if (command === 'info') {
      if (isGroup) {
        try {
          const meta = await sock.groupMetadata(remoteJid);
          const admins = meta.participants.filter(p => p.admin === 'admin' || p.admin === 'superadmin');
          await sock.sendMessage(remoteJid, { 
            text: `◜──────────────────◝\n  *INFORMACOES DO GRUPO*\n◞──────────────────◟\nNome: ${meta.subject}\nMembros: ${meta.participants.length}\nAdmins: ${admins.length}\nSua posicao: ${isSenderAdmin ? 'Admin' : 'Membro'}\nAnti-Link: ${config.antiLink ? 'Ativado' : 'Desativado'}\n◝──────────────────◜` 
          });
        } catch (err) {}
      } else {
        await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n   *SUAS INFORMACOES*\n◞──────────────────◟\nNome: ${pushName}\nNumero: ${sender.split('@')[0]}\n◝──────────────────◜` });
      }
      return;
    }

    if (command === 'dono') {
      await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n       *DONO DO BOT*\n◞──────────────────◟\nNome: Mr Doso\nContato: wa.me/${OWNER_DISPLAY}\n◝──────────────────◜` });
      return;
    }

    if (command === 'bot') {
      await sock.sendMessage(remoteJid, { text: customMessages.botInfo });
      return;
    }

    if (command === 'regras') {
      await sock.sendMessage(remoteJid, { text: customMessages.rules });
      return;
    }

    if (command === 'ping') {
      await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n         *PONG!*\n◞──────────────────◟\nBot esta online!\n◝──────────────────◜` });
      return;
    }

    if (command === 'links') {
      const lista = allowedLinks.length > 0 ? allowedLinks.map((l, i) => `${i+1}. ${l}`).join('\n') : 'Nenhum link permitido.';
      await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n   *LINKS PERMITIDOS*\n◞──────────────────◟\n${lista}\n◝──────────────────◜` });
      return;
    }

    // Verificar próprias advertências
    if (command === 'advertencias') {
      const warnKey = `${remoteJid}:${sender}`;
      const userWarnings = warnings[warnKey] ? warnings[warnKey].count : 0;
      const remaining = config.maxWarnings - userWarnings;
      await sock.sendMessage(remoteJid, { 
        text: `◜──────────────────◝\n    *SUAS ADVERTENCIAS*\n◞──────────────────◟\nVoce tem ${userWarnings} de ${config.maxWarnings}\nadvertencia(s).\n\nRestam: ${remaining > 0 ? remaining : 'Nenhuma. Sera banido!'}\n\nCuidado com os links!\n◝──────────────────◜` 
      });
      return;
    }

    // ========== COMANDOS PERSONALIZADOS ==========
    const customCmd = customCommands.find(c => c.name === command);
    if (customCmd) {
      await sock.sendMessage(remoteJid, { text: customCmd.response });
      return;
    }

    // ========== LEMBRETE ==========
    if (command === 'lembrete') {
      const minutos = parseInt(args[0]);
      const mensagem = args.slice(1).join(' ');
      
      if (isNaN(minutos) || !mensagem) {
        await sock.sendMessage(remoteJid, { text: `Uso: !lembrete [minutos] [mensagem]\nExemplo: !lembrete 30 Comprar pao` });
        return;
      }
      
      if (containsLink(mensagem)) {
        await sock.sendMessage(remoteJid, { text: 'Nao e permitido links no lembrete!' });
        return;
      }
      
      if (!isSenderAdmin && !isSenderOwner) {
        const today = new Date().toDateString();
        if (!dailyReminders[today]) dailyReminders[today] = [];
        if (dailyReminders[today].length >= 3) {
          await sock.sendMessage(remoteJid, { text: 'Limite de 3 lembretes por dia atingido!' });
          return;
        }
        dailyReminders[today].push(sender);
      }
      
      setTimeout(async () => {
        await sock.sendMessage(remoteJid, { 
          text: `◜──────────────────◝\n       *LEMBRETE*\n◞──────────────────◟\n@${sender.split('@')[0]}: ${mensagem}\n◝──────────────────◜`,
          mentions: [sender]
        });
      }, minutos * 60000);
      
      await sock.sendMessage(remoteJid, { text: `Lembrete agendado para daqui a ${minutos} minutos!` });
      return;
    }

    // ========== FIXAR MENSAGEM ==========
    if (command === 'fixar' && isGroup) {
      if (!isSenderAdmin && !isSenderOwner) {
        await sock.sendMessage(remoteJid, { text: 'Apenas administradores!' });
        return;
      }
      
      const option = args[0]?.toLowerCase();
      if (option === 'off') {
        fixedMessage = null;
        await saveFixedMessage();
        if (fixedMessageTimer) clearInterval(fixedMessageTimer);
        await sock.sendMessage(remoteJid, { text: 'Mensagem fixada removida!' });
      } else if (option) {
        const text = args.join(' ');
        if (containsLink(text)) {
          await sock.sendMessage(remoteJid, { text: 'Nao e permitido links na mensagem fixada!' });
          return;
        }
        fixedMessage = { text, active: true, setBy: sender };
        await saveFixedMessage();
        startFixedMessage(sock);
        await sock.sendMessage(remoteJid, { text: `Mensagem fixada! Sera repetida a cada 30 minutos:\n\n"${text}"` });
      } else {
        if (fixedMessage && fixedMessage.active) {
          await sock.sendMessage(remoteJid, { text: `Mensagem fixada atual: "${fixedMessage.text}"\n\nPara remover: !fixar off` });
        } else {
          await sock.sendMessage(remoteJid, { text: `Nenhuma mensagem fixada.\nUso: !fixar [mensagem] ou !fixar off` });
        }
      }
      return;
    }

    // ========== COMANDOS DO OWNER (SÓ PV) ==========
    if (!isSenderOwner) return;

    // Status
    if (command === 'status') {
      const status = `◜──────────────────◝\n     *STATUS DO BOT*\n◞──────────────────◟\nOnline: Sim\nDono: ${OWNER_DISPLAY}\nGrupos: ${authorizedGroups.length}\nLinks: ${allowedLinks.length}\nPalavras: ${bannedWords.length}\nExtensoes: ${bannedExtensions.length}\nRespostas: ${autoResponses.length}\nComandos: ${customCommands.length}\nAgendamentos: ${scheduledMessages.filter(s => !s.sent).length}\nAnti-Link: ${config.antiLink ? 'ON' : 'OFF'}\nAnti-Palavras: ${config.antiWords ? 'ON' : 'OFF'}\nAnti-Flood: ${config.antiFlood ? 'ON' : 'OFF'}\nAnti-APK: ${config.antiApk ? 'ON' : 'OFF'}\nAnti-Status: ${config.antiStatus ? 'ON' : 'OFF'}\nAnti-Mencao: ${config.antiMencao ? 'ON' : 'OFF'}\nAdvertencias max: ${config.maxWarnings}\n◝──────────────────◜`;
      await sock.sendMessage(remoteJid, { text: status });
      return;
    }

    // Menu do Owner
    if (command === 'owner' || command === 'comandos') {
      const ownerMenu = `◜──────────────────◝\n   *COMANDOS DO OWNER*\n◞──────────────────◟\n!addlink [d] - Add link\n!dellink [d] - Del link\n!addword [p] - Add palavra\n!delword [p] - Del palavra\n!addextensao [ext]\n!delextensao [ext]\n!addresposta [pal] | [resp]\n!addcomando [n] | [r] | pub\n!setflood [msgs] [seg]\n!setwarn [max]\n!antilink on/off\n!antiwords on/off\n!antiflood on/off\n!antiapk on/off\n!antistatus on/off\n!antimencao on/off\n!schedule [D/M/A] [H:M] [m]\n!fixar [msg]/off\n!status\n!log\n!backup\n◝──────────────────◜`;
      await sock.sendMessage(remoteJid, { text: ownerMenu });
      return;
    }

    // Log
    if (command === 'log') {
      if (actionLog.length === 0) {
        await sock.sendMessage(remoteJid, { text: 'Nenhuma acao registrada ainda.' });
      } else {
        const logText = actionLog.slice(-10).reverse().map((a, i) => 
          `${i+1}. ${a.action} - ${a.sender?.split('@')[0] || 'N/A'} - ${new Date(a.time).toLocaleString('pt-BR')}`
        ).join('\n');
        await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n    *ULTIMAS ACOES*\n◞──────────────────◟\n${logText}\n◝──────────────────◜` });
      }
      return;
    }

    // Links
    if (command === 'addlink') {
      const link = args[0]?.toLowerCase();
      if (!link) {
        await sock.sendMessage(remoteJid, { text: `Uso: !addlink [dominio]` });
        return;
      }
      if (!allowedLinks.includes(link)) {
        allowedLinks.push(link);
        await saveLinks();
        await sock.sendMessage(remoteJid, { text: `Link "${link}" permitido!` });
      } else {
        await sock.sendMessage(remoteJid, { text: 'Link ja esta na lista!' });
      }
      return;
    }

    if (command === 'dellink') {
      const link = args[0]?.toLowerCase();
      const index = allowedLinks.indexOf(link);
      if (index > -1) {
        allowedLinks.splice(index, 1);
        await saveLinks();
        await sock.sendMessage(remoteJid, { text: `Link "${link}" removido!` });
      } else {
        await sock.sendMessage(remoteJid, { text: 'Link nao encontrado!' });
      }
      return;
    }

    if (command === 'listlinks') {
      const lista = allowedLinks.length > 0 ? allowedLinks.map((l, i) => `${i+1}. ${l}`).join('\n') : 'Nenhum link.';
      await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n   *LINKS PERMITIDOS*\n◞──────────────────◟\n${lista}\n◝──────────────────◜` });
      return;
    }

    // Palavras
    if (command === 'addword') {
      const word = args.join(' ').toLowerCase();
      if (!word) {
        await sock.sendMessage(remoteJid, { text: `Uso: !addword [palavra]` });
        return;
      }
      if (!bannedWords.includes(word)) {
        bannedWords.push(word);
        await saveWords();
        await sock.sendMessage(remoteJid, { text: `Palavra "${word}" banida!` });
      } else {
        await sock.sendMessage(remoteJid, { text: 'Palavra ja esta na lista!' });
      }
      return;
    }

    if (command === 'delword') {
      const word = args.join(' ').toLowerCase();
      const index = bannedWords.indexOf(word);
      if (index > -1) {
        bannedWords.splice(index, 1);
        await saveWords();
        await sock.sendMessage(remoteJid, { text: `Palavra "${word}" removida!` });
      } else {
        await sock.sendMessage(remoteJid, { text: 'Palavra nao encontrada!' });
      }
      return;
    }

    if (command === 'listwords') {
      const lista = bannedWords.length > 0 ? bannedWords.map((w, i) => `${i+1}. ${w}`).join('\n') : 'Nenhuma palavra.';
      await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n   *PALAVRAS BANIDAS*\n◞──────────────────◟\n${lista}\n◝──────────────────◜` });
      return;
    }

    // Extensões
    if (command === 'addextensao') {
      const ext = args[0]?.toLowerCase().replace('.', '');
      if (!ext) {
        await sock.sendMessage(remoteJid, { text: `Uso: !addextensao [extensao]\nExemplo: !addextensao pdf` });
        return;
      }
      if (!bannedExtensions.includes(ext)) {
        bannedExtensions.push(ext);
        await saveExtensions();
        await sock.sendMessage(remoteJid, { text: `Extensao ".${ext}" banida!` });
      } else {
        await sock.sendMessage(remoteJid, { text: 'Extensao ja esta na lista!' });
      }
      return;
    }

    if (command === 'delextensao') {
      const ext = args[0]?.toLowerCase().replace('.', '');
      const index = bannedExtensions.indexOf(ext);
      if (index > -1) {
        bannedExtensions.splice(index, 1);
        await saveExtensions();
        await sock.sendMessage(remoteJid, { text: `Extensao ".${ext}" removida!` });
      } else {
        await sock.sendMessage(remoteJid, { text: 'Extensao nao encontrada!' });
      }
      return;
    }

    if (command === 'listextensoes') {
      const lista = bannedExtensions.length > 0 ? bannedExtensions.map((e, i) => `${i+1}. .${e}`).join('\n') : 'Nenhuma extensao.';
      await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n  *EXTENSOES BANIDAS*\n◞──────────────────◟\n${lista}\n◝──────────────────◜` });
      return;
    }

    // Respostas automaticas
    if (command === 'addresposta') {
      const fullArgs = args.join(' ');
      const parts = fullArgs.split('|');
      if (parts.length < 2) {
        await sock.sendMessage(remoteJid, { text: `Uso: !addresposta [palavras] | [resposta]` });
        return;
      }
      const trigger = parts[0].trim().toLowerCase();
      const reply = parts.slice(1).join('|').trim();
      
      autoResponses.push({ trigger, reply });
      await saveAutoResponses();
      await sock.sendMessage(remoteJid, { text: `Resposta automatica adicionada!\nGatilho: "${trigger}"` });
      return;
    }

    if (command === 'delresposta') {
      const index = parseInt(args[0]) - 1;
      if (isNaN(index) || index < 0 || index >= autoResponses.length) {
        await sock.sendMessage(remoteJid, { text: `Uso: !delresposta [numero]` });
        return;
      }
      autoResponses.splice(index, 1);
      await saveAutoResponses();
      await sock.sendMessage(remoteJid, { text: 'Resposta removida!' });
      return;
    }

    if (command === 'listrespostas') {
      if (autoResponses.length === 0) {
        await sock.sendMessage(remoteJid, { text: 'Nenhuma resposta automatica.' });
      } else {
        const lista = autoResponses.map((r, i) => `${i+1}. "${r.trigger}"`).join('\n');
        await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n *RESPOSTAS AUTOMATICAS*\n◞──────────────────◟\n${lista}\n◝──────────────────◜` });
      }
      return;
    }

    // Comandos personalizados
    if (command === 'addcomando') {
      const fullArgs = args.join(' ');
      const parts = fullArgs.split('|');
      if (parts.length < 2) {
        await sock.sendMessage(remoteJid, { text: `Uso: !addcomando [nome] | [resposta] | [publico]` });
        return;
      }
      const name = parts[0].trim().toLowerCase();
      const response = parts[1].trim();
      const isPublic = parts[2]?.trim().toLowerCase() === 'publico';
      
      const existing = customCommands.findIndex(c => c.name === name);
      if (existing > -1) {
        customCommands[existing].response = response;
        customCommands[existing].public = isPublic;
      } else {
        customCommands.push({ name, response, public: isPublic });
      }
      await saveCustomCommands();
      await sock.sendMessage(remoteJid, { text: `Comando !${name} adicionado! (Publico: ${isPublic ? 'Sim' : 'Nao'})` });
      return;
    }

    if (command === 'delcomando') {
      const name = args[0]?.toLowerCase();
      const index = customCommands.findIndex(c => c.name === name);
      if (index > -1) {
        customCommands.splice(index, 1);
        await saveCustomCommands();
        await sock.sendMessage(remoteJid, { text: `Comando !${name} removido!` });
      } else {
        await sock.sendMessage(remoteJid, { text: 'Comando nao encontrado!' });
      }
      return;
    }

    if (command === 'listcomandos') {
      if (customCommands.length === 0) {
        await sock.sendMessage(remoteJid, { text: 'Nenhum comando personalizado.' });
      } else {
        const lista = customCommands.map((c, i) => `${i+1}. !${c.name} [${c.public ? 'Publico' : 'Privado'}]`).join('\n');
        await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n *COMANDOS PERSONALIZADOS*\n◞──────────────────◟\n${lista}\n◝──────────────────◜` });
      }
      return;
    }

    // Grupos
    if (command === 'authgroup' && isGroup) {
      if (!authorizedGroups.includes(remoteJid)) {
        authorizedGroups.push(remoteJid);
        await saveGroups();
        if (groupLeaveTimers[remoteJid]) {
          clearTimeout(groupLeaveTimers[remoteJid]);
          delete groupLeaveTimers[remoteJid];
        }
        scheduleAutoMessage(sock, remoteJid);
        await sock.sendMessage(remoteJid, { text: 'Grupo autorizado com sucesso!' });
      } else {
        await sock.sendMessage(remoteJid, { text: 'Grupo ja esta autorizado!' });
      }
      return;
    }

    if (command === 'listgroups') {
      let resp = `◜──────────────────◝\n  *GRUPOS AUTORIZADOS*\n◞──────────────────◟\nMaster: ${masterGroup || 'Nao definido'}\n\n`;
      const outros = authorizedGroups.filter(g => g !== masterGroup);
      resp += outros.length > 0 ? outros.map((g, i) => `${i+1}. ${g.split('@')[0]}`).join('\n') : 'Nenhum grupo adicional.';
      resp += `\n◝──────────────────◜`;
      await sock.sendMessage(remoteJid, { text: resp });
      return;
    }

    if (command === 'setmaster' && isGroup) {
      masterGroup = remoteJid;
      if (!authorizedGroups.includes(remoteJid)) authorizedGroups.push(remoteJid);
      await saveGroups();
      await sock.sendMessage(remoteJid, { text: 'Grupo definido como MASTER!' });
      return;
    }

    // Configurações
    if (command === 'antilink') {
      const opt = args[0]?.toLowerCase();
      if (opt === 'on') { config.antiLink = true; await saveConfig(); await sock.sendMessage(remoteJid, { text: 'Anti-Link ATIVADO!' }); }
      else if (opt === 'off') { config.antiLink = false; await saveConfig(); await sock.sendMessage(remoteJid, { text: 'Anti-Link DESATIVADO!' }); }
      else { await sock.sendMessage(remoteJid, { text: `Anti-Link: ${config.antiLink ? 'ON' : 'OFF'}` }); }
      return;
    }

    if (command === 'antiwords') {
      const opt = args[0]?.toLowerCase();
      if (opt === 'on') { config.antiWords = true; await saveConfig(); await sock.sendMessage(remoteJid, { text: 'Anti-Palavras ATIVADO!' }); }
      else if (opt === 'off') { config.antiWords = false; await saveConfig(); await sock.sendMessage(remoteJid, { text: 'Anti-Palavras DESATIVADO!' }); }
      else { await sock.sendMessage(remoteJid, { text: `Anti-Palavras: ${config.antiWords ? 'ON' : 'OFF'}` }); }
      return;
    }

    if (command === 'antiflood') {
      const opt = args[0]?.toLowerCase();
      if (opt === 'on') { config.antiFlood = true; await saveConfig(); await sock.sendMessage(remoteJid, { text: 'Anti-Flood ATIVADO!' }); }
      else if (opt === 'off') { config.antiFlood = false; await saveConfig(); await sock.sendMessage(remoteJid, { text: 'Anti-Flood DESATIVADO!' }); }
      else { await sock.sendMessage(remoteJid, { text: `Anti-Flood: ${config.antiFlood ? 'ON' : 'OFF'}` }); }
      return;
    }

    if (command === 'antiapk') {
      const opt = args[0]?.toLowerCase();
      if (opt === 'on') { config.antiApk = true; await saveConfig(); await sock.sendMessage(remoteJid, { text: 'Anti-APK ATIVADO!' }); }
      else if (opt === 'off') { config.antiApk = false; await saveConfig(); await sock.sendMessage(remoteJid, { text: 'Anti-APK DESATIVADO!' }); }
      else { await sock.sendMessage(remoteJid, { text: `Anti-APK: ${config.antiApk ? 'ON' : 'OFF'}` }); }
      return;
    }

    if (command === 'antistatus') {
      const opt = args[0]?.toLowerCase();
      if (opt === 'on') { config.antiStatus = true; await saveConfig(); await sock.sendMessage(remoteJid, { text: 'Anti-Status ATIVADO!' }); }
      else if (opt === 'off') { config.antiStatus = false; await saveConfig(); await sock.sendMessage(remoteJid, { text: 'Anti-Status DESATIVADO!' }); }
      else { await sock.sendMessage(remoteJid, { text: `Anti-Status: ${config.antiStatus ? 'ON' : 'OFF'}` }); }
      return;
    }

    if (command === 'antimencao') {
      const opt = args[0]?.toLowerCase();
      if (opt === 'on') { config.antiMencao = true; await saveConfig(); await sock.sendMessage(remoteJid, { text: 'Anti-Mencao ATIVADO!' }); }
      else if (opt === 'off') { config.antiMencao = false; await saveConfig(); await sock.sendMessage(remoteJid, { text: 'Anti-Mencao DESATIVADO!' }); }
      else { await sock.sendMessage(remoteJid, { text: `Anti-Mencao: ${config.antiMencao ? 'ON' : 'OFF'}` }); }
      return;
    }

    if (command === 'automsg') {
      const opt = args[0]?.toLowerCase();
      if (opt === 'on') { 
        config.autoMessages = true; 
        await saveConfig(); 
        for (const g of authorizedGroups) scheduleAutoMessage(sock, g);
        await sock.sendMessage(remoteJid, { text: 'Mensagens automaticas ATIVADAS!' }); 
      }
      else if (opt === 'off') { 
        config.autoMessages = false; 
        await saveConfig(); 
        for (const key in scheduledTasks) clearTimeout(scheduledTasks[key]);
        await sock.sendMessage(remoteJid, { text: 'Mensagens automaticas DESATIVADAS!' }); 
      }
      else { await sock.sendMessage(remoteJid, { text: `Mensagens automaticas: ${config.autoMessages ? 'ON' : 'OFF'}` }); }
      return;
    }

    if (command === 'setflood') {
      const maxMsg = parseInt(args[0]);
      const timeWindow = parseInt(args[1]);
      
      if (isNaN(maxMsg) || isNaN(timeWindow)) {
        await sock.sendMessage(remoteJid, { text: `Anti-Flood atual: ${config.maxFloodMessages} msgs/${config.floodTimeWindow}s\n\nUso: !setflood [max_msg] [segundos]` });
        return;
      }
      
      config.maxFloodMessages = maxMsg;
      config.floodTimeWindow = timeWindow;
      await saveConfig();
      await sock.sendMessage(remoteJid, { text: `Anti-Flood atualizado: ${maxMsg} msgs/${timeWindow}s` });
      return;
    }

    if (command === 'setwarn') {
      const max = parseInt(args[0]);
      if (isNaN(max)) {
        await sock.sendMessage(remoteJid, { text: `Advertencias maximas: ${config.maxWarnings}\nUso: !setwarn [numero]` });
        return;
      }
      config.maxWarnings = max;
      await saveConfig();
      await sock.sendMessage(remoteJid, { text: `Maximo de advertencias: ${max}` });
      return;
    }

    // Agendamento (admin apenas)
    if (command === 'schedule' && isGroup) {
      if (!isSenderAdmin && !isSenderOwner) {
        await sock.sendMessage(remoteJid, { text: 'Apenas administradores!' });
        return;
      }
      
      const data = args[0];
      const hora = args[1];
      const mensagem = args.slice(2).join(' ');
      
      if (!data || !hora || !mensagem) {
        await sock.sendMessage(remoteJid, { text: `Uso: !schedule [DD/MM/AAAA] [HH:MM] [mensagem]` });
        return;
      }
      
      const [dia, mes, ano] = data.split('/');
      const [h, m] = hora.split(':');
      const dataObj = new Date(ano, mes - 1, dia, h, m);
      
      scheduledMessages.push({
        id: Date.now().toString(),
        target: remoteJid,
        datetime: dataObj.toISOString(),
        message: mensagem,
        sent: false
      });
      await saveSchedules();
      await sock.sendMessage(remoteJid, { text: `Mensagem agendada para ${data} as ${hora}!` });
      return;
    }

    if (command === 'listschedules') {
      const pending = scheduledMessages.filter(s => !s.sent);
      if (pending.length === 0) {
        await sock.sendMessage(remoteJid, { text: 'Nenhum agendamento pendente.' });
      } else {
        const lista = pending.map((s, i) => 
          `${i+1}. ${new Date(s.datetime).toLocaleString('pt-BR')} -> "${s.message.substring(0, 30)}..."`
        ).join('\n');
        await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n     *AGENDAMENTOS*\n◞──────────────────◟\n${lista}\n◝──────────────────◜` });
      }
      return;
    }

    if (command === 'cancelschedule') {
      const index = parseInt(args[0]) - 1;
      const pending = scheduledMessages.filter(s => !s.sent);
      
      if (isNaN(index) || index < 0 || index >= pending.length) {
        await sock.sendMessage(remoteJid, { text: 'Numero invalido!' });
        return;
      }
      
      const toCancel = pending[index];
      scheduledMessages = scheduledMessages.filter(s => s.id !== toCancel.id);
      await saveSchedules();
      await sock.sendMessage(remoteJid, { text: 'Agendamento cancelado!' });
      return;
    }

    if (command === 'clearschedules') {
      const count = scheduledMessages.filter(s => !s.sent).length;
      scheduledMessages = scheduledMessages.filter(s => s.sent);
      await saveSchedules();
      await sock.sendMessage(remoteJid, { text: `${count} agendamento(s) cancelado(s)!` });
      return;
    }

    // Backup
    if (command === 'backup') {
      await saveConfig();
      await saveLinks();
      await saveWords();
      await saveExtensions();
      await saveGroups();
      await saveSchedules();
      await saveMessages();
      await saveAutoResponses();
      await saveCustomCommands();
      await saveWarnings();
      await saveFixedMessage();
      await sock.sendMessage(remoteJid, { text: 'Backup criado com sucesso no Redis!' });
      return;
    }
  });

  return sock;
}

// =================================================================
// SERVIDOR EXPRESS
// =================================================================
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.json({ 
    status: 'online',
    bot: 'Mr Doso',
    version: '5.0',
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
    extensions: bannedExtensions.length,
    responses: autoResponses.length,
    commands: customCommands.length,
    uptime: process.uptime()
  });
});

// =================================================================
// SISTEMA ANTI-SLEEP
// =================================================================
setInterval(async () => {
  try {
    const http = require('http');
    http.get(`http://localhost:${PORT}/health`, (res) => {
      console.log(`Keep-alive: ${new Date().toLocaleTimeString()}`);
    }).on('error', () => {});
  } catch (err) {}
}, 300000);

// =================================================================
// INICIAR
// =================================================================
async function start() {
  await loadFromRedis();
  
  app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
  });
  
  await connectToWhatsApp();
}

start().catch(console.error);