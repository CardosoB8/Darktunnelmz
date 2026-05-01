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
const { GoogleGenerativeAI } = require('@google/generative-ai');

// =================================================================
// CONFIGURAÇÕES
// =================================================================
const REDIS_URL = 'redis://default:JyefUsxHJljfdvs8HACumEyLE7XNgLvG@redis-19242.c266.us-east-1-3.ec2.cloud.redislabs.com:19242';
const PHONE_NUMBER = '258858861745';
const OWNER_NUMBER = '253188708028487';
const OWNER_DISPLAY = 'Mr Doso';
const OWNER_CONTACT = 'wa.me/258865446574';
const PREFIX = '!';
const GEMINI_API_KEY = 'AIzaSyDEFL2kIIrc-YeC-rKcpXZnCfG4IZWSs5s';

// =================================================================
// CONEXÃO COM REDIS
// =================================================================
const redisClient = redis.createClient({
    url: REDIS_URL,
    socket: { reconnectStrategy: (retries) => Math.min(retries * 100, 3000) }
});

redisClient.on('error', (err) => console.error('Redis Error:', err));

// =================================================================
// CONEXÃO COM IA DOSO
// =================================================================
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const iaModel = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

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

// =================================================================
// MEMÓRIA DA IA DOSO
// =================================================================
let iaMemory = {
  ativo: true,
  moderar: true,
  responder: true,
  tom: 'curto',
  conhecimentos: {},
  palavras: [],
  links: [],
  regras: [],
  admins: [],
  dono: `${OWNER_DISPLAY} - ${OWNER_CONTACT}`,
  welcomeMsg: null,
  conversaContexto: [],
  ultimasInteracoes: []
};

// =================================================================
// MENSAGENS PERSONALIZADAS
// =================================================================
let customMessages = {
  welcome: null,
  goodbye: null,
  rules: `◜──────────────────◝\n     *REGRAS DO GRUPO*\n◞──────────────────◟\n1. Proibido enviar links\n   nao autorizados\n2. Proibido palavras ofensivas\n3. Respeite todos os membros\n4. Spam resulta em banimento\n\nComandos: !menu\n◝──────────────────◜`,
  removeMsg: `◜──────────────────◝\n    *USUARIO REMOVIDO*\n◞──────────────────◟\nMotivo: Violacao das regras\n\nUm membro foi removido por\ninfringir as regras.\n\nRegras: use !regras\n◝──────────────────◜`,
  wordWarning: `◜──────────────────◝\n       *AVISO*\n◞──────────────────◟\nSua mensagem foi apagada\npor conter palavra proibida.\n\nLeia as regras: !regras\n◝──────────────────◜`,
  botInfo: `◜──────────────────◝\n   *BOT MR DOSO v7.0*\n◞──────────────────◟\nProtecao: Anti-Link e\nAnti-Palavras\nIA DOSO: Ativada\n\nComandos: !menu\nCriado por: ${OWNER_DISPLAY}\n◝──────────────────◜`,
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
    if (fixedData) fixedMessage = JSON.parse(fixedData);
    
    // Carregar memória IA
    const iaData = await redisClient.get('bot:iamemory');
    if (iaData) {
      try { iaMemory = { ...iaMemory, ...JSON.parse(iaData) }; } catch (err) {}
    }
    
    console.log('Dados carregados do Redis');
  } catch (err) {
    console.error('Erro ao carregar Redis:', err.message);
  }
}

// =================================================================
// SALVAR DADOS NO REDIS
// =================================================================
async function saveConfig() { await redisClient.hSet('bot:config', 'data', JSON.stringify(config)); }
async function saveLinks() { await redisClient.del('bot:links'); if (allowedLinks.length > 0) await redisClient.sAdd('bot:links', allowedLinks); }
async function saveWords() { await redisClient.del('bot:words'); if (bannedWords.length > 0) await redisClient.sAdd('bot:words', bannedWords); }
async function saveExtensions() { await redisClient.del('bot:extensions'); if (bannedExtensions.length > 0) await redisClient.sAdd('bot:extensions', bannedExtensions); }
async function saveGroups() {
  await redisClient.del('bot:groups');
  if (authorizedGroups.length > 0) await redisClient.sAdd('bot:groups', authorizedGroups);
  if (masterGroup) await redisClient.set('bot:master', masterGroup);
}
async function saveSchedules() { 
  await redisClient.del('bot:schedules');
  for (const s of scheduledMessages) { await redisClient.rPush('bot:schedules', JSON.stringify(s)); }
}
async function saveMessages() { await redisClient.hSet('bot:messages', 'data', JSON.stringify(customMessages)); }
async function saveAutoResponses() {
  await redisClient.del('bot:autoresponses');
  for (const r of autoResponses) { await redisClient.rPush('bot:autoresponses', JSON.stringify(r)); }
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
    if (value && value.count > 0) { await redisClient.hSet('bot:warnings', key, JSON.stringify(value)); }
  }
}
async function saveFixedMessage() {
  if (fixedMessage) { await redisClient.set('bot:fixedmessage', JSON.stringify(fixedMessage)); }
  else { await redisClient.del('bot:fixedmessage'); }
}
async function saveIAMemory() {
  await redisClient.set('bot:iamemory', JSON.stringify(iaMemory));
}

// =================================================================
// FUNÇÕES AUXILIARES
// =================================================================
const logger = pino({ level: 'silent' });
const AUTH_FOLDER = './auth_info_baileys';

function isGroupAuthorized(groupJid) { return authorizedGroups.includes(groupJid) || groupJid === masterGroup; }
function isOwner(sender) { return sender.split('@')[0] === OWNER_NUMBER; }
function randomDelay(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function containsLink(text) {
  const urlRegex = /(https?:\/\/[^\s]+)|(www\.[^\s]+)|([a-zA-Z0-9-]+\.(com|org|net|io|gg|me|link|chat|whatsapp|telegram|click|online|site|blog|info|biz|us|xyz|top|club|shop|store|app|dev|tech|cloud))/gi;
  return urlRegex.test(text);
}
function isLinkAllowed(text) { if (allowedLinks.length === 0) return false; return allowedLinks.some(domain => text.toLowerCase().includes(domain.toLowerCase())); }
function containsBannedWord(text) { if (bannedWords.length === 0) return false; return bannedWords.some(word => text.toLowerCase().includes(word.toLowerCase())); }
function containsBannedExtension(text) { if (bannedExtensions.length === 0) return false; return bannedExtensions.some(ext => text.toLowerCase().endsWith('.' + ext.toLowerCase())); }
function isApkFile(msg) { if (!config.antiApk) return false; const caption = msg.message?.documentMessage?.caption || ''; const filename = msg.message?.documentMessage?.fileName || ''; const text = (msg.message?.conversation || msg.message?.extendedTextMessage?.text || caption || filename || '').toLowerCase(); return text.includes('.apk') || text.includes('apk'); }
function matchAutoResponse(text) { for (const response of autoResponses) { const words = response.trigger.toLowerCase().split(' '); if (words.every(word => text.toLowerCase().includes(word))) return response.reply; } return null; }
function addToLog(action) { actionLog.push({ ...action, time: new Date().toISOString() }); if (actionLog.length > 50) actionLog.shift(); }

async function isGroupAdmin(sock, groupJid, participantJid) {
  try { const meta = await sock.groupMetadata(groupJid); return meta.participants.filter(p => p.admin === 'admin' || p.admin === 'superadmin').map(p => p.id).includes(participantJid); } catch { return false; }
}
async function isBotAdmin(sock, groupJid) {
  if (groupJid === masterGroup || authorizedGroups.includes(groupJid)) return true;
  try { const botJid = sock.user.id; const meta = await sock.groupMetadata(groupJid); return meta.participants.filter(p => p.admin === 'admin' || p.admin === 'superadmin').map(p => p.id).includes(botJid); } catch { return false; }
}

function checkFlood(sender, groupJid) {
  if (!config.antiFlood) return false;
  const now = Date.now(); const key = `${groupJid}:${sender}`;
  if (!floodTracker[key]) floodTracker[key] = [];
  floodTracker[key] = floodTracker[key].filter(t => now - t < config.floodTimeWindow * 1000);
  floodTracker[key].push(now);
  return floodTracker[key].length >= config.maxFloodMessages;
}

function scheduleAutoMessage(sock, groupJid) {
  if (!isGroupAuthorized(groupJid) || !config.autoMessages) return;
  if (scheduledTasks[groupJid]) clearTimeout(scheduledTasks[groupJid]);
  const delay = randomDelay(config.messageDelay.min, config.messageDelay.max);
  scheduledTasks[groupJid] = setTimeout(async () => {
    try { const randomMsg = customMessages.autoMessages[Math.floor(Math.random() * customMessages.autoMessages.length)]; await sock.sendMessage(groupJid, { text: randomMsg }); } catch (err) {}
    scheduleAutoMessage(sock, groupJid);
  }, delay);
}

function startFixedMessage(sock) {
  if (fixedMessageTimer) clearInterval(fixedMessageTimer);
  if (!fixedMessage || !fixedMessage.active) return;
  
  const min = fixedMessage.randomMin || 30;
  const max = fixedMessage.randomMax || 30;
  const delay = Math.floor(Math.random() * (max - min + 1) + min) * 60000;
  
  fixedMessageTimer = setTimeout(async () => {
    try { 
      for (const g of authorizedGroups) {
        await sock.sendMessage(g, { text: `📌 ${fixedMessage.text}` });
      }
    } catch (err) {}
    startFixedMessage(sock);
  }, delay);
}

function checkScheduledMessages(sock) {
  setInterval(async () => {
    const now = new Date();
    const toSend = scheduledMessages.filter(s => { const t = new Date(s.datetime); return !s.sent && t <= now; });
    for (const schedule of toSend) {
      try {
        await sock.sendMessage(schedule.target, { text: `◜──────────────────◝\n     *AGENDAMENTO*\n◞──────────────────◟\n${schedule.message}\n\n@todos\n◝──────────────────◜`, mentions: [] });
        schedule.sent = true;
      } catch (err) {}
    }
    if (toSend.length > 0) saveSchedules();
  }, 30000);
}

// =================================================================
// FUNÇÕES DA IA DOSO
// =================================================================
async function askIA(pergunta, contexto) {
  try {
    const prompt = `Voce e a DOSO IA, assistente virtual do grupo WhatsApp do ${iaMemory.dono || 'Mr Doso'}.
Criada por Mr Doso.
Regras: ${iaMemory.regras.join('; ') || 'Nenhuma regra especifica'}
Conhecimentos ensinados: ${JSON.stringify(iaMemory.conhecimentos)}
Tom: ${iaMemory.tom === 'curto' ? 'Respostas curtas, maximo 2 linhas' : iaMemory.tom === 'normal' ? 'Respostas de 2-3 linhas' : 'Respostas detalhadas, mas sem exageros'}

Usuario: ${pergunta}

Responda de forma direta e util. NAO invente informacoes. Se nao souber, diga: "Nao fui ensinada sobre isso. Use !ensinar para me ensinar."`;

    const result = await iaModel.generateContent(prompt);
    const response = result.response.text();
    return response.substring(0, 200);
  } catch (err) {
    return null;
  }
}

async function moderateWithIA(mensagem) {
  try {
    const prompt = `Analise se esta mensagem contem ofensa, spam ou linguagem abusiva. Responda APENAS "SIM" ou "NAO".
    
Mensagem: "${mensagem}"
Palavras banidas: ${iaMemory.palavras.join(', ') || 'nenhuma'}`;

    const result = await iaModel.generateContent(prompt);
    return result.response.text().trim().toUpperCase() === 'SIM';
  } catch (err) {
    return false;
  }
}

async function parseReminderIA(mensagem) {
  try {
    const prompt = `Extraia o tempo em minutos e a mensagem deste pedido de lembrete. Responda no formato: MINUTOS|MENSAGEM. Se nao for um pedido de lembrete, responda: INVALIDO.
    
Pedido: "${mensagem}"`;

    const result = await iaModel.generateContent(prompt);
    const texto = result.response.text().trim();
    if (texto === 'INVALIDO') return null;
    const partes = texto.split('|');
    return { minutos: parseInt(partes[0]), mensagem: partes.slice(1).join('|') };
  } catch (err) {
    return null;
  }
}

async function chatWithIA(pergunta, historico) {
  try {
    const contexto = historico.slice(-3).map(h => `Usuario: ${h.pergunta}\nDOSO IA: ${h.resposta}`).join('\n');
    
    const prompt = `Voce e a DOSO IA, assistente virtual do grupo WhatsApp do ${iaMemory.dono || 'Mr Doso'}.
Criada por Mr Doso.
Tom: ${iaMemory.tom === 'curto' ? 'Respostas curtas, maximo 2 linhas' : iaMemory.tom === 'normal' ? 'Respostas de 2-3 linhas' : 'Respostas detalhadas, mas sem exageros'}

Contexto da conversa anterior:
${contexto}

Conhecimentos ensinados: ${JSON.stringify(iaMemory.conhecimentos)}
Regras do grupo: ${iaMemory.regras.join('; ') || 'Nenhuma'}

Usuario pergunta: ${pergunta}

Responda de forma direta, util e amigavel. NAO invente informacoes. Se nao souber, diga: "Nao tenho essa informacao. Use !ensinar para me ensinar."`;

    const result = await iaModel.generateContent(prompt);
    return result.response.text().substring(0, 300);
  } catch (err) {
    return null;
  }
}

async function executeAction(ordem, sock, msg, remoteJid, sender) {
  try {
    const prompt = `Voce e a DOSO IA, assistente de um grupo WhatsApp. Voce recebe ordens em portugues e deve executar UMA das seguintes acoes. Responda APENAS no formato ACAO|DETALHES.

Acoes disponiveis:
1. APAGAR - Apagar a mensagem atual
2. BANIR - Remover um usuario (precisa mencionar @usuario)
3. ADVERTIR - Dar advertencia a um usuario
4. MENCIONAR_TODOS - Mencionar todos os membros com uma mensagem
5. FIXAR - Fixar uma mensagem no grupo
6. LEMBRETE - Criar um lembrete (formato: minutos|mensagem)
7. REGRA - Adicionar uma regra ao grupo
8. RESPONDER - Responder uma pergunta
9. MODERAR - Ativar/desativar moderacao
10. NADA - Nenhuma acao necessaria

Ordem recebida: "${ordem}"

Contexto: Grupo=${remoteJid}, Remetente=${sender}

Responda APENAS no formato: ACAO|DETALHES`;

    const result = await iaModel.generateContent(prompt);
    const texto = result.response.text().trim();
    const partes = texto.split('|');
    const acao = partes[0]?.trim().toUpperCase();
    const detalhes = partes.slice(1).join('|').trim();
    
    console.log(`[DOSO IA] Acao detectada: ${acao} - ${detalhes}`);
    
    switch (acao) {
      case 'APAGAR':
        try { await sock.sendMessage(remoteJid, { delete: { remoteJid, id: msg.key.id, participant: sender } }); } catch (err) {}
        return 'Mensagem apagada!';
      
      case 'BANIR':
        const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
        if (mentioned.length > 0) {
          await sock.groupParticipantsUpdate(remoteJid, mentioned, 'remove');
          return 'Usuario removido!';
        }
        return 'Preciso que mencione o usuario com @.';
      
      case 'MENCIONAR_TODOS':
        await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n       *DOSO IA*\n◞──────────────────◟\n${detalhes}\n◝──────────────────◜`, mentions: [] });
        return 'Todos mencionados!';
      
      case 'FIXAR':
        fixedMessage = { text: detalhes, active: true, setBy: sender, randomMin: 30, randomMax: 30 };
        await saveFixedMessage();
        startFixedMessage(sock);
        return `Mensagem fixada: "${detalhes}"`;
      
      case 'LEMBRETE':
        const [minutos, ...msgParts] = detalhes.split('|');
        const mensagem = msgParts.join('|');
        if (minutos && mensagem) {
          setTimeout(async () => {
            await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n       *LEMBRETE*\n◞──────────────────◟\n${mensagem}\n◝──────────────────◜`, mentions: [] });
          }, parseInt(minutos) * 60000);
          return `Lembrete agendado para ${minutos} minutos!`;
        }
        return 'Formato invalido. Use: minutos|mensagem';
      
      case 'REGRA':
        iaMemory.regras.push(detalhes);
        await saveIAMemory();
        return `Regra adicionada: "${detalhes}"`;
      
      case 'MODERAR':
        if (detalhes.toLowerCase().includes('ativar') || detalhes.toLowerCase().includes('on')) {
          iaMemory.moderar = true;
        } else {
          iaMemory.moderar = false;
        }
        await saveIAMemory();
        return `Moderacao ${iaMemory.moderar ? 'ATIVADA' : 'DESATIVADA'}!`;
      
      case 'RESPONDER':
        return detalhes;
      
      default:
        return 'Nao entendi a acao. Tente: apagar, banir @user, mencionar todos, fixar, lembrete, regra, moderar.';
    }
  } catch (err) {
    return `Erro ao executar acao: ${err.message}`;
  }
}

function isSafeToAction(sender, isSenderOwner, isSenderAdmin) {
  if (isSenderOwner || isSenderAdmin) return false;
  return true;
}

// =================================================================
// FUNÇÃO PRINCIPAL DO BOT
// =================================================================
async function connectToWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_FOLDER);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version, auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, logger) },
    logger, printQRInTerminal: false, browser: ['Mac OS', 'Chrome', '10.15.7'],
    markOnlineOnConnect: true, syncFullHistory: false,
  });

  let connectionClosed = false;

  sock.ev.on('connection.update', async (update) => {
    const { connection, qr } = update;
    if (qr && !sock.authState.creds.registered && !connectionClosed) {
      console.log('Gerando codigo de pareamento...');
      try { await new Promise(r => setTimeout(r, 2000)); const code = await sock.requestPairingCode(PHONE_NUMBER); console.log('CODIGO:', code?.match(/.{1,4}/g)?.join('-') || code); } catch (err) {}
    }
    if (connection === 'close') { connectionClosed = true; setTimeout(() => connectToWhatsApp().catch(console.error), 5000); }
    else if (connection === 'open') { console.log('BOT CONECTADO AO WHATSAPP!'); checkScheduledMessages(sock); startFixedMessage(sock); }
  });

  sock.ev.on('creds.update', saveCreds);

  // ========== BOAS-VINDAS COM IA ==========
  sock.ev.on('group-participants.update', async (update) => {
    const { id, participants, action } = update;
    
    if (action === 'add' && iaMemory.welcomeMsg && iaMemory.ativo) {
      for (const user of participants) {
        if (user === sock.user.id) continue;
        const msg = iaMemory.welcomeMsg
          .replace('{nome}', '@' + user.split('@')[0])
          .replace('{grupo}', '');
        await sock.sendMessage(id, { text: `◜──────────────────◝\n     *BEM-VINDO(A)*\n◞──────────────────◟\n${msg}\n◝──────────────────◜`, mentions: [user] });
      }
    }
    
    if (action === 'add' && participants.includes(sock.user.id)) {
      console.log(`Bot adicionado ao grupo ${id}`);
      if (!masterGroup) {
        masterGroup = id;
        authorizedGroups.push(id);
        await saveGroups();
        await sock.sendMessage(id, { text: `◜──────────────────◝\n       *OK*\n◞──────────────────◟\nGrupo definido como MASTER!\nUse !menu para ver comandos.\n◝──────────────────◜` });
        scheduleAutoMessage(sock, id);
        return;
      }
      
      if (!isGroupAuthorized(id)) {
        await sock.sendMessage(id, { text: `◜──────────────────◝\n       *AVISO*\n◞──────────────────◟\nBot nao autorizado!\nSaindo em 30 segundos...\nUse !authgroup para autorizar.\n◝──────────────────◜` });
        groupLeaveTimers[id] = setTimeout(async () => { if (!isGroupAuthorized(id)) await sock.groupLeave(id); }, 30000);
        return;
      }
      scheduleAutoMessage(sock, id);
    }
  });

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
    const safe = isSafeToAction(sender, isSenderOwner, isSenderAdmin);

    // ========== SISTEMAS DE PROTEÇÃO ==========
    
    // ANTI-STATUS
    if (isGroup && isGroupAuthorized(remoteJid) && safe && config.antiStatus && isBotAdminStatus) {
      const text = (messageContent || '').trim();
      if (text && (text.startsWith('~') || (text.includes('status') && text.length < 15))) {
        setTimeout(async () => { try { await sock.sendMessage(remoteJid, { delete: { remoteJid, id: msg.key.id, participant: sender } }); } catch (err) {} }, randomDelay(3000, 8000));
        return;
      }
    }

    // ANTI-MENÇÃO
    if (isGroup && isGroupAuthorized(remoteJid) && safe && config.antiMencao && isBotAdminStatus) {
      const text = messageContent || '';
      if (text.replace(/@\d+/g, '').trim() === '' && text.includes('@')) {
        setTimeout(async () => { try { await sock.sendMessage(remoteJid, { delete: { remoteJid, id: msg.key.id, participant: sender } }); } catch (err) {} }, randomDelay(3000, 8000));
        return;
      }
    }

    // ANTI-APK
    if (isGroup && isGroupAuthorized(remoteJid) && safe && config.antiApk && isBotAdminStatus && isApkFile(msg)) {
      setTimeout(async () => { try { await sock.sendMessage(remoteJid, { delete: { remoteJid, id: msg.key.id, participant: sender } }); } catch (err) {} }, randomDelay(3000, 8000));
      return;
    }

    // ANTI-EXTENSÃO
    if (isGroup && isGroupAuthorized(remoteJid) && safe && isBotAdminStatus && containsBannedExtension(messageContent)) {
      setTimeout(async () => { try { await sock.sendMessage(remoteJid, { delete: { remoteJid, id: msg.key.id, participant: sender } }); } catch (err) {} }, randomDelay(3000, 8000));
      return;
    }

    if (!messageContent) return;

    // ANTI-FLOOD
    if (isGroup && safe && checkFlood(sender, remoteJid)) {
      if (isBotAdminStatus) {
        setTimeout(async () => { try { await sock.groupParticipantsUpdate(remoteJid, [sender], 'remove'); addToLog({ action: 'flood_ban', sender, group: remoteJid }); } catch (err) {} }, randomDelay(2000, 5000));
        return;
      }
    }

    // ANTI-LINK (COM ADVERTÊNCIAS)
    if (isGroup && isGroupAuthorized(remoteJid) && config.antiLink && containsLink(messageContent)) {
      if (safe && !isLinkAllowed(messageContent) && isBotAdminStatus) {
        setTimeout(async () => { try { await sock.sendMessage(remoteJid, { delete: { remoteJid, id: msg.key.id, participant: sender } }); } catch (err) {} }, randomDelay(2000, 4000));
        
        const warnKey = `${remoteJid}:${sender}`;
        if (!warnings[warnKey]) warnings[warnKey] = { count: 0, lastWarn: null };
        warnings[warnKey].count++;
        warnings[warnKey].lastWarn = new Date().toISOString();
        await saveWarnings();
        
        const currentWarnings = warnings[warnKey].count;
        const maxW = config.maxWarnings;
        
        if (currentWarnings >= maxW) {
          setTimeout(async () => {
            try { await sock.groupParticipantsUpdate(remoteJid, [sender], 'remove'); delete warnings[warnKey]; await saveWarnings(); addToLog({ action: 'link_ban', sender, group: remoteJid }); await sock.sendMessage(remoteJid, { text: customMessages.removeMsg }); } catch (err) {}
          }, randomDelay(config.removeDelay.min, config.removeDelay.max));
        } else {
          const remaining = maxW - currentWarnings;
          await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n   *ADVERTENCIA ${currentWarnings}/${maxW}*\n◞──────────────────◟\n@${sender.split('@')[0]} voce recebeu uma\nadvertencia por link nao\nautorizado.\n\nRestam ${remaining} advertencia(s).\nNa proxima, sera removido!\n◝──────────────────◜`, mentions: [sender] });
        }
        return;
      }
    }

    // ANTI-PALAVRAS (SÓ APAGA E AVISA)
    if (isGroup && isGroupAuthorized(remoteJid) && config.antiWords && containsBannedWord(messageContent)) {
      if (safe && isBotAdminStatus) {
        setTimeout(async () => {
          try { await sock.sendMessage(remoteJid, { delete: { remoteJid, id: msg.key.id, participant: sender } }); } catch (err) {}
          addToLog({ action: 'word_delete', sender, group: remoteJid });
          await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n       *AVISO*\n◞──────────────────◟\n@${sender.split('@')[0]} sua mensagem foi\napagada por conter palavra\nproibida.\n\nLeia as regras: !regras\n◝──────────────────◜`, mentions: [sender] });
        }, randomDelay(config.deleteDelay.min, config.deleteDelay.max));
        return;
      }
    }

    // ========== IA MODERAÇÃO AUTOMÁTICA ==========
    if (isGroup && isGroupAuthorized(remoteJid) && iaMemory.ativo && iaMemory.moderar && safe && isBotAdminStatus) {
      const needsModeration = await moderateWithIA(messageContent);
      if (needsModeration) {
        setTimeout(async () => {
          try { await sock.sendMessage(remoteJid, { delete: { remoteJid, id: msg.key.id, participant: sender } }); } catch (err) {}
          addToLog({ action: 'ia_moderate', sender, group: remoteJid });
          await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n     *DOSO IA*\n◞──────────────────◟\n@${sender.split('@')[0]} sua mensagem foi\napagada por conter\nconteudo inadequado.\n◝──────────────────◜`, mentions: [sender] });
        }, randomDelay(3000, 8000));
        return;
      }
    }

    // ========== RESPOSTAS AUTOMATICAS ==========
    if (isGroup && isGroupAuthorized(remoteJid)) {
      const autoReply = matchAutoResponse(messageContent);
      if (autoReply) {
        setTimeout(async () => { await sock.sendMessage(remoteJid, { text: autoReply }, { quoted: msg }); }, randomDelay(config.responseDelay.min, config.responseDelay.max));
        return;
      }
    }

    // ========== COMANDOS COM PREFIXO ==========
    const args = messageContent.startsWith(PREFIX) ? messageContent.slice(PREFIX.length).trim().split(/ +/) : [];
    const command = args.shift()?.toLowerCase();
    if (!command) {
      // ========== IA RESPOSTAS NATURAIS (SEM COMANDO) ==========
      if (iaMemory.ativo && iaMemory.responder && isGroup && isGroupAuthorized(remoteJid)) {
        const textoLimpo = messageContent.toLowerCase().trim();
        const palavrasPergunta = ['como', 'quem', 'onde', 'quando', 'porque', 'qual', '?', 'o que', 'me ajuda', 'duvida', 'ajuda', 'saber', 'explica', 'ensina'];
        const parecePergunta = palavrasPergunta.some(p => textoLimpo.includes(p));
        
        if (parecePergunta) {
          const respostaIA = await askIA(messageContent, { grupo: remoteJid, usuario: pushName });
          if (respostaIA) {
            setTimeout(async () => {
              try {
                await sock.sendMessage(remoteJid, { 
                  text: `◜──────────────────◝\n       *DOSO IA*\n◞──────────────────◟\n${respostaIA}\n◝──────────────────◜`,
                  mentions: [sender]
                }, { quoted: msg });
              } catch (err) {}
            }, randomDelay(2000, 4000));
            return;
          }
        }
        
        // Lembrete natural via IA
        if (textoLimpo.includes('lembra') || textoLimpo.includes('avisa') || textoLimpo.includes('alerta')) {
          const reminderData = await parseReminderIA(messageContent);
          if (reminderData && reminderData.minutos && reminderData.mensagem) {
            setTimeout(async () => {
              await sock.sendMessage(remoteJid, { 
                text: `◜──────────────────◝\n       *LEMBRETE IA*\n◞──────────────────◟\n@${sender.split('@')[0]}: ${reminderData.mensagem}\n◝──────────────────◜`,
                mentions: [sender]
              });
            }, reminderData.minutos * 60000);
            
            await sock.sendMessage(remoteJid, { 
              text: `◜──────────────────◝\n       *OK IA*\n◞──────────────────◟\nTe aviso em ${reminderData.minutos} min!\n◝──────────────────◜`,
              mentions: [sender]
            }, { quoted: msg });
            return;
          }
        }
      }
      return;
    }

    // ========== DELETE ==========
    if (command === 'delete' && isGroup) {
      if (!isSenderAdmin && !isSenderOwner) { await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n       *NEGADO*\n◞──────────────────◟\nApenas administradores!\n◝──────────────────◜` }); return; }
      const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.stanzaId;
      const quotedSender = msg.message?.extendedTextMessage?.contextInfo?.participant;
      if (!quotedMsg) { await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n       *USO*\n◞──────────────────◟\nResponda uma mensagem com\n!delete para apagar!\n◝──────────────────◜` }); return; }
      setTimeout(async () => { try { await sock.sendMessage(remoteJid, { delete: { remoteJid, id: quotedMsg, participant: quotedSender || sender } }); } catch (err) {} }, randomDelay(config.deleteCmdDelay.min, config.deleteCmdDelay.max));
      return;
    }

    // ========== TODOS ==========
    if (command === 'todos' && isGroup) {
      if (!isSenderAdmin && !isSenderOwner) { await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n       *NEGADO*\n◞──────────────────◟\nApenas administradores!\n◝──────────────────◜` }); return; }
      const texto = args.join(' ') || 'Atencao a todos!';
      await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n       *TODOS*\n◞──────────────────◟\n${texto}\n◝──────────────────◜`, mentions: [] });
      return;
    }

    // ========== COMANDOS PUBLICOS ==========
    if (command === 'menu') {
      let menu = `◜──────────────────◝\n  *MENU DO BOT - MR DOSO*\n◞──────────────────◟\n!menu      ➜  Ver este menu\n!info      ➜  Informacoes\n!dono      ➜  Ver dono do bot\n!bot       ➜  Sobre o bot\n!regras    ➜  Regras do grupo\n!ping      ➜  Testar bot\n!links     ➜  Links permitidos\n!advertencias ➜ Ver advertencias\n!lembrete [min] [msg]`;
      const publicCommands = customCommands.filter(c => c.public);
      if (publicCommands.length > 0) { for (const c of publicCommands) { menu += `\n!${c.name.padEnd(10)} ➜  ${c.response.substring(0, 15)}`; } }
      menu += `\n◝──────────────────◜`;
      await sock.sendMessage(remoteJid, { text: menu });
      return;
    }

    if (command === 'info') {
      if (isGroup) {
        try {
          const meta = await sock.groupMetadata(remoteJid);
          const admins = meta.participants.filter(p => p.admin === 'admin' || p.admin === 'superadmin');
          await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n  *INFORMACOES DO GRUPO*\n◞──────────────────◟\nNome: ${meta.subject}\nMembros: ${meta.participants.length}\nAdmins: ${admins.length}\nSua posicao: ${isSenderAdmin ? 'Admin' : 'Membro'}\nAnti-Link: ${config.antiLink ? 'Ativado' : 'Desativado'}\n◝──────────────────◜` });
        } catch (err) {}
      } else {
        await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n   *SUAS INFORMACOES*\n◞──────────────────◟\nNome: ${pushName}\n◝──────────────────◜` });
      }
      return;
    }

    if (command === 'dono') { await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n       *DONO DO BOT*\n◞──────────────────◟\nNome: ${OWNER_DISPLAY}\nContato: ${OWNER_CONTACT}\n◝──────────────────◜` }); return; }
    if (command === 'bot') { await sock.sendMessage(remoteJid, { text: customMessages.botInfo }); return; }
    if (command === 'regras') { await sock.sendMessage(remoteJid, { text: customMessages.rules }); return; }
    if (command === 'ping') { await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n         *PONG!*\n◞──────────────────◟\nBot esta online!\n◝──────────────────◜` }); return; }

    if (command === 'links') {
      const lista = allowedLinks.length > 0 ? allowedLinks.map((l, i) => `${i+1}. ${l}`).join('\n') : 'Nenhum link permitido.';
      await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n   *LINKS PERMITIDOS*\n◞──────────────────◟\n${lista}\n◝──────────────────◜` });
      return;
    }

    if (command === 'advertencias') {
      const warnKey = `${remoteJid}:${sender}`;
      const userWarnings = warnings[warnKey] ? warnings[warnKey].count : 0;
      const remaining = config.maxWarnings - userWarnings;
      await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n    *SUAS ADVERTENCIAS*\n◞──────────────────◟\nVoce tem ${userWarnings} de ${config.maxWarnings}\nadvertencia(s).\n\nRestam: ${remaining > 0 ? remaining : 'Nenhuma. Sera banido!'}\n\nCuidado com os links!\n◝──────────────────◜` });
      return;
    }

    // ========== COMANDOS PERSONALIZADOS ==========
    const customCmd = customCommands.find(c => c.name === command);
    if (customCmd) { await sock.sendMessage(remoteJid, { text: customCmd.response }); return; }

    // ========== LEMBRETE ==========
    if (command === 'lembrete') {
      const minutos = parseInt(args[0]);
      const mensagem = args.slice(1).join(' ');
      if (isNaN(minutos) || !mensagem) { await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n       *USO*\n◞──────────────────◟\n!lembrete [minutos] [mensagem]\nEx: !lembrete 30 Comprar pao\n◝──────────────────◜` }); return; }
      if (containsLink(mensagem)) { await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n       *ERRO*\n◞──────────────────◟\nNao e permitido links\nno lembrete!\n◝──────────────────◜` }); return; }
      
      if (!isSenderAdmin && !isSenderOwner) {
        const today = new Date().toDateString();
        if (!dailyReminders[today]) dailyReminders[today] = [];
        if (dailyReminders[today].length >= 3) { await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n       *LIMITE*\n◞──────────────────◟\nLimite de 3 lembretes\npor dia atingido!\n◝──────────────────◜` }); return; }
        dailyReminders[today].push(sender);
      }
      
      setTimeout(async () => { await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n       *LEMBRETE*\n◞──────────────────◟\n@${sender.split('@')[0]}: ${mensagem}\n◝──────────────────◜`, mentions: [sender] }); }, minutos * 60000);
      await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n       *OK*\n◞──────────────────◟\nLembrete agendado para\ndaqui a ${minutos} minutos!\n◝──────────────────◜` });
      return;
    }

    // ========== FIXAR MENSAGEM ==========
    if (command === 'fixar' && isGroup) {
      if (!isSenderAdmin && !isSenderOwner) { await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n       *NEGADO*\n◞──────────────────◟\nApenas administradores!\n◝──────────────────◜` }); return; }
      
      const opt = args[0]?.toLowerCase();
      if (opt === 'off') {
        fixedMessage = null; await saveFixedMessage();
        if (fixedMessageTimer) clearTimeout(fixedMessageTimer);
        await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n       *OK*\n◞──────────────────◟\nMensagem fixada removida!\n◝──────────────────◜` });
      } else {
        const min = parseInt(args[0]); const max = parseInt(args[1]); let texto;
        if (!isNaN(min) && !isNaN(max)) { texto = args.slice(2).join(' '); }
        else { texto = args.join(' '); }
        
        if (!texto) {
          if (fixedMessage && fixedMessage.active) {
            await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n   *MENSAGEM FIXADA*\n◞──────────────────◟\n"${fixedMessage.text}"\n\nIntervalo: ${fixedMessage.randomMin || 30}-${fixedMessage.randomMax || 30} min\n\nRemover: !fixar off\n◝──────────────────◜` });
          } else {
            await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n       *USO*\n◞──────────────────◟\n!fixar [min] [max] [msg]\n!fixar [mensagem]\n!fixar off\n◝──────────────────◜` });
          }
          return;
        }
        
        fixedMessage = { text: texto, active: true, setBy: sender, randomMin: !isNaN(min) ? min : 30, randomMax: !isNaN(max) ? max : 30 };
        await saveFixedMessage(); startFixedMessage(sock);
        await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n       *OK*\n◞──────────────────◟\nMensagem fixada! Intervalo:\n${fixedMessage.randomMin}-${fixedMessage.randomMax} min\n\n"${texto}"\n◝──────────────────◜` });
      }
      return;
    }

    // ========== COMANDOS DO OWNER (SÓ PV) ==========
    if (!isSenderOwner) return;

    // Status
    if (command === 'status') {
      const status = `◜──────────────────◝\n     *STATUS DO BOT*\n◞──────────────────◟\nOnline: Sim\nDono: ${OWNER_DISPLAY}\nGrupos: ${authorizedGroups.length}\nLinks: ${allowedLinks.length}\nPalavras: ${bannedWords.length}\nExtensoes: ${bannedExtensions.length}\nRespostas: ${autoResponses.length}\nComandos: ${customCommands.length}\nAgendamentos: ${scheduledMessages.filter(s => !s.sent).length}\nIA DOSO: ${iaMemory.ativo ? 'ON' : 'OFF'}\nAnti-Link: ${config.antiLink ? 'ON' : 'OFF'}\nAnti-Palavras: ${config.antiWords ? 'ON' : 'OFF'}\nAnti-Flood: ${config.antiFlood ? 'ON' : 'OFF'}\nAnti-APK: ${config.antiApk ? 'ON' : 'OFF'}\nAdvertencias max: ${config.maxWarnings}\n◝──────────────────◜`;
      await sock.sendMessage(remoteJid, { text: status });
      return;
    }

    // Menu do Owner
    if (command === 'owner' || command === 'comandos') {
      const ownerMenu = `◜──────────────────◝\n   *COMANDOS DO OWNER*\n◞──────────────────◟\n!chat [pergunta]\n!ia acao [ordem]\n!ia testar\n!ia debug\n!ensinar [t] | [r]\n!addlink [d]\n!addword [p]\n!addextensao [ext]\n!addresposta [pal] | [resp]\n!addcomando [n] | [r] | pub\n!setflood [msgs] [seg]\n!setwarn [max]\n!antilink on/off\n!antiwords on/off\n!antiflood on/off\n!antiapk on/off\n!schedule [D/M/A] [H:M] [m]\n!status\n!log\n!backup\n◝──────────────────◜`;
      await sock.sendMessage(remoteJid, { text: ownerMenu });
      return;
    }

    // Log
    if (command === 'log') {
      if (actionLog.length === 0) { await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n       *LOG*\n◞──────────────────◟\nNenhuma acao registrada.\n◝──────────────────◜` }); }
      else {
        const logText = actionLog.slice(-10).reverse().map((a, i) => `${i+1}. ${a.action} - ${a.sender?.split('@')[0] || 'N/A'} - ${new Date(a.time).toLocaleString('pt-BR')}`).join('\n');
        await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n    *ULTIMAS ACOES*\n◞──────────────────◟\n${logText}\n◝──────────────────◜` });
      }
      return;
    }

    // ========== NOVO: !chat ==========
    if (command === 'chat') {
      const pergunta = args.join(' ');
      if (!pergunta) {
        await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n       *USO*\n◞──────────────────◟\n!chat [sua pergunta]\n\nConverse livremente comigo!\n◝──────────────────◜` });
        return;
      }
      
      const resposta = await chatWithIA(pergunta, iaMemory.ultimasInteracoes);
      
      iaMemory.ultimasInteracoes.push({ pergunta, resposta, time: new Date().toISOString() });
      if (iaMemory.ultimasInteracoes.length > 10) iaMemory.ultimasInteracoes.shift();
      await saveIAMemory();
      
      if (resposta) {
        await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n       *DOSO IA*\n◞──────────────────◟\n${resposta}\n◝──────────────────◜` });
      } else {
        await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n       *ERRO*\n◞──────────────────◟\nNao consegui responder.\nTente novamente.\n◝──────────────────◜` });
      }
      return;
    }

    // ========== NOVO: !ia acao ==========
    if (command === 'ia' && args[0]?.toLowerCase() === 'acao') {
      const ordem = args.slice(1).join(' ');
      if (!ordem) {
        await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n       *USO*\n◞──────────────────◟\n!ia acao [sua ordem]\n\nExemplos:\n!ia acao apague essa msg\n!ia acao mencione todos\n!ia acao fixar Regras\n!ia acao banir @usuario\n◝──────────────────◜` });
        return;
      }
      
      const resultado = await executeAction(ordem, sock, msg, remoteJid, sender);
      await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n     *DOSO IA ACAO*\n◞──────────────────◟\n${resultado}\n◝──────────────────◜` });
      return;
    }

    // ========== NOVO: !ia testar ==========
    if (command === 'ia' && args[0]?.toLowerCase() === 'testar') {
      const teste = await chatWithIA('Responda com: DOSO IA funcionando perfeitamente!', []);
      if (teste) {
        await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n     *TESTE IA*\n◞──────────────────◟\n${teste}\n\n✅ IA funcionando!\n◝──────────────────◜` });
      } else {
        await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n     *TESTE IA*\n◞──────────────────◟\n❌ IA nao respondeu.\nVerifique a API Key.\n◝──────────────────◜` });
      }
      return;
    }

    // ========== NOVO: !ia debug ==========
    if (command === 'ia' && args[0]?.toLowerCase() === 'debug') {
      const debug = `◜──────────────────◝\n     *DEBUG IA*\n◞──────────────────◟\nAtivo: ${iaMemory.ativo}\nModerar: ${iaMemory.moderar}\nResponder: ${iaMemory.responder}\nTom: ${iaMemory.tom}\nConhecimentos: ${Object.keys(iaMemory.conhecimentos).length}\nPalavras: ${iaMemory.palavras.length}\nLinks: ${iaMemory.links.length}\nRegras: ${iaMemory.regras.length}\nInteracoes: ${iaMemory.ultimasInteracoes.length}\n◝──────────────────◜`;
      await sock.sendMessage(remoteJid, { text: debug });
      return;
    }

    // ========== COMANDOS DA IA (ENSINAR E GERENCIAR) ==========
    if (command === 'ensinar') {
      const fullArgs = args.join(' ');
      const parts = fullArgs.split('|');
      if (parts.length < 2) { await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n       *USO IA*\n◞──────────────────◟\n!ensinar [topico] | [resposta]\n!ensinar palavra [p]\n!ensinar link [d]\n!ensinar regra [r]\n!ensinar dono [info]\n!ensinar admin [nome]\n◝──────────────────◜` }); return; }
      
      const tipo = parts[0].trim().toLowerCase();
      const valor = parts.slice(1).join('|').trim();
      
      if (tipo === 'palavra') { iaMemory.palavras.push(valor); bannedWords.push(valor); await saveWords(); }
      else if (tipo === 'link') { iaMemory.links.push(valor); allowedLinks.push(valor); await saveLinks(); }
      else if (tipo === 'regra') { iaMemory.regras.push(valor); }
      else if (tipo === 'dono') { iaMemory.dono = valor; }
      else if (tipo === 'admin') { iaMemory.admins.push(valor); }
      else { iaMemory.conhecimentos[tipo] = valor; }
      
      await saveIAMemory();
      await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n       *OK IA*\n◞──────────────────◟\nAprendido: ${tipo}\n◝──────────────────◜` });
      return;
    }

    if (command === 'ia') {
      const opt = args[0]?.toLowerCase();
      
      if (opt === 'on') { iaMemory.ativo = true; await saveIAMemory(); await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n       *OK IA*\n◞──────────────────◟\nIA ATIVADA!\n◝──────────────────◜` }); return; }
      if (opt === 'off') { iaMemory.ativo = false; await saveIAMemory(); await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n       *OK IA*\n◞──────────────────◟\nIA DESATIVADA!\n◝──────────────────◜` }); return; }
      
      if (opt === 'moderar') {
        const sub = args[1]?.toLowerCase();
        if (sub === 'on') { iaMemory.moderar = true; await saveIAMemory(); await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n       *OK IA*\n◞──────────────────◟\nModeracao ATIVADA!\n◝──────────────────◜` }); }
        else if (sub === 'off') { iaMemory.moderar = false; await saveIAMemory(); await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n       *OK IA*\n◞──────────────────◟\nModeracao DESATIVADA!\n◝──────────────────◜` }); }
        return;
      }
      
      if (opt === 'responder') {
        const sub = args[1]?.toLowerCase();
        if (sub === 'on') { iaMemory.responder = true; await saveIAMemory(); await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n       *OK IA*\n◞──────────────────◟\nRespostas ATIVADAS!\n◝──────────────────◜` }); }
        else if (sub === 'off') { iaMemory.responder = false; await saveIAMemory(); await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n       *OK IA*\n◞──────────────────◟\nRespostas DESATIVADAS!\n◝──────────────────◜` }); }
        return;
      }
      
      if (opt === 'tom') {
        const tom = args[1]?.toLowerCase();
        if (tom === 'curto' || tom === 'normal' || tom === 'completo') { iaMemory.tom = tom; await saveIAMemory(); await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n       *OK IA*\n◞──────────────────◟\nTom alterado para: ${tom}\n◝──────────────────◜` }); }
        return;
      }
      
      if (opt === 'ban' && isGroup) {
        const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
        if (mentioned.length > 0 && isBotAdminStatus) {
          await sock.groupParticipantsUpdate(remoteJid, mentioned, 'remove');
          await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n       *IA BAN*\n◞──────────────────◟\nUsuario(s) removido(s)!\n◝──────────────────◜` });
        }
        return;
      }
      
      if (opt === 'memoria') {
        const mem = `◜──────────────────◝\n     *MEMORIA IA*\n◞──────────────────◟\nAtivo: ${iaMemory.ativo ? 'Sim' : 'Nao'}\nModerar: ${iaMemory.moderar ? 'Sim' : 'Nao'}\nResponder: ${iaMemory.responder ? 'Sim' : 'Nao'}\nTom: ${iaMemory.tom}\nConhecimentos: ${Object.keys(iaMemory.conhecimentos).length}\nPalavras: ${iaMemory.palavras.length}\nLinks: ${iaMemory.links.length}\nRegras: ${iaMemory.regras.length}\n◝──────────────────◜`;
        await sock.sendMessage(remoteJid, { text: mem });
        return;
      }
      
      if (opt === 'esquecer') { const topico = args.slice(1).join(' '); delete iaMemory.conhecimentos[topico]; await saveIAMemory(); await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n       *OK IA*\n◞──────────────────◟\nEsquecido: ${topico}\n◝──────────────────◜` }); return; }
      if (opt === 'reset') { iaMemory.conhecimentos = {}; await saveIAMemory(); await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n       *OK IA*\n◞──────────────────◟\nMemoria resetada!\n◝──────────────────◜` }); return; }
      
      // Status padrão
      const statusIA = `◜──────────────────◝\n     *STATUS IA*\n◞──────────────────◟\nAtivo: ${iaMemory.ativo ? 'ON' : 'OFF'}\nModerar: ${iaMemory.moderar ? 'ON' : 'OFF'}\nResponder: ${iaMemory.responder ? 'ON' : 'OFF'}\nTom: ${iaMemory.tom}\nConhecimentos: ${Object.keys(iaMemory.conhecimentos).length}\n\nComandos:\n!ia on/off\n!ia moderar on/off\n!ia responder on/off\n!ia tom curto/normal/completo\n!ia memoria\n!ia reset\n!chat [pergunta]\n!ia acao [ordem]\n!ia testar\n!ia debug\n◝──────────────────◜`;
      await sock.sendMessage(remoteJid, { text: statusIA });
      return;
    }

    // Welcome
    if (command === 'welcome') {
      const opt = args[0]?.toLowerCase();
      if (opt === 'on') { iaMemory.welcomeMsg = iaMemory.welcomeMsg || 'Ola {nome}! Bem-vindo(a) ao {grupo}! Use !menu para ver comandos.'; await saveIAMemory(); await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n       *OK IA*\n◞──────────────────◟\nBoas-vindas ATIVADAS!\n◝──────────────────◜` }); return; }
      if (opt === 'off') { iaMemory.welcomeMsg = null; await saveIAMemory(); await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n       *OK IA*\n◞──────────────────◟\nBoas-vindas DESATIVADAS!\n◝──────────────────◜` }); return; }
      await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n       *USO IA*\n◞──────────────────◟\n!welcome on/off\n!setwelcome [msg]\n◝──────────────────◜` });
      return;
    }

    if (command === 'setwelcome') { iaMemory.welcomeMsg = args.join(' '); await saveIAMemory(); await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n       *OK IA*\n◞──────────────────◟\nMensagem de boas-vindas\natualizada!\n◝──────────────────◜` }); return; }

    // ========== DEMAIS COMANDOS DO OWNER ==========
    
    // Links
    if (command === 'addlink') {
      const link = args[0]?.toLowerCase();
      if (!link) { await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n       *USO*\n◞──────────────────◟\n!addlink [dominio]\nEx: !addlink youtube.com\n◝──────────────────◜` }); return; }
      if (!allowedLinks.includes(link)) { allowedLinks.push(link); await saveLinks(); await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n       *OK*\n◞──────────────────◟\nLink "${link}" permitido!\n◝──────────────────◜` }); }
      else { await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n       *AVISO*\n◞──────────────────◟\nLink ja esta na lista!\n◝──────────────────◜` }); }
      return;
    }

    if (command === 'dellink') {
      const link = args[0]?.toLowerCase(); const index = allowedLinks.indexOf(link);
      if (index > -1) { allowedLinks.splice(index, 1); await saveLinks(); await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n       *OK*\n◞──────────────────◟\nLink "${link}" removido!\n◝──────────────────◜` }); }
      else { await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n       *ERRO*\n◞──────────────────◟\nLink nao encontrado!\n◝──────────────────◜` }); }
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
      if (!word) { await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n       *USO*\n◞──────────────────◟\n!addword [palavra]\n◝──────────────────◜` }); return; }
      if (!bannedWords.includes(word)) { bannedWords.push(word); await saveWords(); await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n       *OK*\n◞──────────────────◟\nPalavra "${word}" banida!\n◝──────────────────◜` }); }
      else { await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n       *AVISO*\n◞──────────────────◟\nPalavra ja esta na lista!\n◝──────────────────◜` }); }
      return;
    }

    if (command === 'delword') {
      const word = args.join(' ').toLowerCase(); const index = bannedWords.indexOf(word);
      if (index > -1) { bannedWords.splice(index, 1); await saveWords(); await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n       *OK*\n◞──────────────────◟\nPalavra "${word}" removida!\n◝──────────────────◜` }); }
      else { await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n       *ERRO*\n◞──────────────────◟\nPalavra nao encontrada!\n◝──────────────────◜` }); }
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
      if (!ext) { await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n       *USO*\n◞──────────────────◟\n!addextensao [extensao]\nEx: !addextensao pdf\n◝──────────────────◜` }); return; }
      if (!bannedExtensions.includes(ext)) { bannedExtensions.push(ext); await saveExtensions(); await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n       *OK*\n◞──────────────────◟\nExtensao ".${ext}" banida!\n◝──────────────────◜` }); }
      else { await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n       *AVISO*\n◞──────────────────◟\nExtensao ja esta na lista!\n◝──────────────────◜` }); }
      return;
    }

    if (command === 'delextensao') {
      const ext = args[0]?.toLowerCase().replace('.', ''); const index = bannedExtensions.indexOf(ext);
      if (index > -1) { bannedExtensions.splice(index, 1); await saveExtensions(); await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n       *OK*\n◞──────────────────◟\nExtensao ".${ext}" removida!\n◝──────────────────◜` }); }
      else { await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n       *ERRO*\n◞──────────────────◟\nExtensao nao encontrada!\n◝──────────────────◜` }); }
      return;
    }

    if (command === 'listextensoes') {
      const lista = bannedExtensions.length > 0 ? bannedExtensions.map((e, i) => `${i+1}. .${e}`).join('\n') : 'Nenhuma extensao.';
      await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n  *EXTENSOES BANIDAS*\n◞──────────────────◟\n${lista}\n◝──────────────────◜` });
      return;
    }

    // Respostas automáticas
    if (command === 'addresposta') {
      const fullArgs = args.join(' '); const parts = fullArgs.split('|');
      if (parts.length < 2) { await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n       *USO*\n◞──────────────────◟\n!addresposta [palavras] | [resposta]\n◝──────────────────◜` }); return; }
      autoResponses.push({ trigger: parts[0].trim().toLowerCase(), reply: parts.slice(1).join('|').trim() });
      await saveAutoResponses();
      await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n       *OK*\n◞──────────────────◟\nResposta automatica adicionada!\n◝──────────────────◜` });
      return;
    }

    if (command === 'delresposta') {
      const index = parseInt(args[0]) - 1;
      if (isNaN(index) || index < 0 || index >= autoResponses.length) { await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n       *USO*\n◞──────────────────◟\n!delresposta [numero]\n◝──────────────────◜` }); return; }
      autoResponses.splice(index, 1); await saveAutoResponses();
      await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n       *OK*\n◞──────────────────◟\nResposta removida!\n◝──────────────────◜` });
      return;
    }

    if (command === 'listrespostas') {
      if (autoResponses.length === 0) { await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n  *RESPOSTAS AUTOMATICAS*\n◞──────────────────◟\nNenhuma resposta.\n◝──────────────────◜` }); }
      else { const lista = autoResponses.map((r, i) => `${i+1}. "${r.trigger}"`).join('\n'); await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n *RESPOSTAS AUTOMATICAS*\n◞──────────────────◟\n${lista}\n◝──────────────────◜` }); }
      return;
    }

    // Comandos personalizados
    if (command === 'addcomando') {
      const fullArgs = args.join(' '); const parts = fullArgs.split('|');
      if (parts.length < 2) { await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n       *USO*\n◞──────────────────◟\n!addcomando [nome] | [resposta] | [publico]\n◝──────────────────◜` }); return; }
      const name = parts[0].trim().toLowerCase();
      const response = parts[1].trim();
      const isPublic = parts[2]?.trim().toLowerCase() === 'publico';
      const existing = customCommands.findIndex(c => c.name === name);
      if (existing > -1) { customCommands[existing].response = response; customCommands[existing].public = isPublic; }
      else { customCommands.push({ name, response, public: isPublic }); }
      await saveCustomCommands();
      await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n       *OK*\n◞──────────────────◟\nComando !${name} adicionado!\nPublico: ${isPublic ? 'Sim' : 'Nao'}\n◝──────────────────◜` });
      return;
    }

    if (command === 'delcomando') {
      const name = args[0]?.toLowerCase(); const index = customCommands.findIndex(c => c.name === name);
      if (index > -1) { customCommands.splice(index, 1); await saveCustomCommands(); await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n       *OK*\n◞──────────────────◟\nComando !${name} removido!\n◝──────────────────◜` }); }
      else { await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n       *ERRO*\n◞──────────────────◟\nComando nao encontrado!\n◝──────────────────◜` }); }
      return;
    }

    if (command === 'listcomandos') {
      if (customCommands.length === 0) { await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n *COMANDOS PERSONALIZADOS*\n◞──────────────────◟\nNenhum comando.\n◝──────────────────◜` }); }
      else { const lista = customCommands.map((c, i) => `${i+1}. !${c.name} [${c.public ? 'Publico' : 'Privado'}]`).join('\n'); await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n *COMANDOS PERSONALIZADOS*\n◞──────────────────◟\n${lista}\n◝──────────────────◜` }); }
      return;
    }

    // Grupos
    if (command === 'authgroup' && isGroup) {
      if (!authorizedGroups.includes(remoteJid)) { authorizedGroups.push(remoteJid); await saveGroups(); if (groupLeaveTimers[remoteJid]) { clearTimeout(groupLeaveTimers[remoteJid]); delete groupLeaveTimers[remoteJid]; } scheduleAutoMessage(sock, remoteJid); await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n       *OK*\n◞──────────────────◟\nGrupo autorizado!\n◝──────────────────◜` }); }
      else { await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n       *AVISO*\n◞──────────────────◟\nGrupo ja esta autorizado!\n◝──────────────────◜` }); }
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

    if (command === 'setmaster' && isGroup) { masterGroup = remoteJid; if (!authorizedGroups.includes(remoteJid)) authorizedGroups.push(remoteJid); await saveGroups(); await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n       *OK*\n◞──────────────────◟\nGrupo definido como MASTER!\n◝──────────────────◜` }); return; }

    // Configurações
    if (command === 'antilink') {
      const opt = args[0]?.toLowerCase();
      if (opt === 'on') { config.antiLink = true; await saveConfig(); await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n       *OK*\n◞──────────────────◟\nAnti-Link ATIVADO!\n◝──────────────────◜` }); }
      else if (opt === 'off') { config.antiLink = false; await saveConfig(); await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n       *OK*\n◞──────────────────◟\nAnti-Link DESATIVADO!\n◝──────────────────◜` }); }
      else { await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n    *ANTI-LINK*\n◞──────────────────◟\nStatus: ${config.antiLink ? 'ON' : 'OFF'}\n◝──────────────────◜` }); }
      return;
    }

    if (command === 'antiwords') {
      const opt = args[0]?.toLowerCase();
      if (opt === 'on') { config.antiWords = true; await saveConfig(); await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n       *OK*\n◞──────────────────◟\nAnti-Palavras ATIVADO!\n◝──────────────────◜` }); }
      else if (opt === 'off') { config.antiWords = false; await saveConfig(); await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n       *OK*\n◞──────────────────◟\nAnti-Palavras DESATIVADO!\n◝──────────────────◜` }); }
      else { await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n  *ANTI-PALAVRAS*\n◞──────────────────◟\nStatus: ${config.antiWords ? 'ON' : 'OFF'}\n◝──────────────────◜` }); }
      return;
    }

    if (command === 'antiflood') {
      const opt = args[0]?.toLowerCase();
      if (opt === 'on') { config.antiFlood = true; await saveConfig(); await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n       *OK*\n◞──────────────────◟\nAnti-Flood ATIVADO!\n◝──────────────────◜` }); }
      else if (opt === 'off') { config.antiFlood = false; await saveConfig(); await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n       *OK*\n◞──────────────────◟\nAnti-Flood DESATIVADO!\n◝──────────────────◜` }); }
      else { await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n    *ANTI-FLOOD*\n◞──────────────────◟\nStatus: ${config.antiFlood ? 'ON' : 'OFF'}\n◝──────────────────◜` }); }
      return;
    }

    if (command === 'antiapk') {
      const opt = args[0]?.toLowerCase();
      if (opt === 'on') { config.antiApk = true; await saveConfig(); await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n       *OK*\n◞──────────────────◟\nAnti-APK ATIVADO!\n◝──────────────────◜` }); }
      else if (opt === 'off') { config.antiApk = false; await saveConfig(); await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n       *OK*\n◞──────────────────◟\nAnti-APK DESATIVADO!\n◝──────────────────◜` }); }
      else { await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n     *ANTI-APK*\n◞──────────────────◟\nStatus: ${config.antiApk ? 'ON' : 'OFF'}\n◝──────────────────◜` }); }
      return;
    }

    if (command === 'antistatus') {
      const opt = args[0]?.toLowerCase();
      if (opt === 'on') { config.antiStatus = true; await saveConfig(); await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n       *OK*\n◞──────────────────◟\nAnti-Status ATIVADO!\n◝──────────────────◜` }); }
      else if (opt === 'off') { config.antiStatus = false; await saveConfig(); await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n       *OK*\n◞──────────────────◟\nAnti-Status DESATIVADO!\n◝──────────────────◜` }); }
      else { await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n   *ANTI-STATUS*\n◞──────────────────◟\nStatus: ${config.antiStatus ? 'ON' : 'OFF'}\n◝──────────────────◜` }); }
      return;
    }

    if (command === 'antimencao') {
      const opt = args[0]?.toLowerCase();
      if (opt === 'on') { config.antiMencao = true; await saveConfig(); await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n       *OK*\n◞──────────────────◟\nAnti-Mencao ATIVADO!\n◝──────────────────◜` }); }
      else if (opt === 'off') { config.antiMencao = false; await saveConfig(); await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n       *OK*\n◞──────────────────◟\nAnti-Mencao DESATIVADO!\n◝──────────────────◜` }); }
      else { await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n   *ANTI-MENCAO*\n◞──────────────────◟\nStatus: ${config.antiMencao ? 'ON' : 'OFF'}\n◝──────────────────◜` }); }
      return;
    }

    if (command === 'automsg') {
      const opt = args[0]?.toLowerCase();
      if (opt === 'on') { config.autoMessages = true; await saveConfig(); for (const g of authorizedGroups) scheduleAutoMessage(sock, g); await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n       *OK*\n◞──────────────────◟\nMensagens automaticas\nATIVADAS!\n◝──────────────────◜` }); }
      else if (opt === 'off') { config.autoMessages = false; await saveConfig(); for (const key in scheduledTasks) clearTimeout(scheduledTasks[key]); await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n       *OK*\n◞──────────────────◟\nMensagens automaticas\nDESATIVADAS!\n◝──────────────────◜` }); }
      else { await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n  *MENSAGENS AUTO*\n◞──────────────────◟\nStatus: ${config.autoMessages ? 'ON' : 'OFF'}\n◝──────────────────◜` }); }
      return;
    }

    if (command === 'setflood') {
      const maxMsg = parseInt(args[0]); const timeWindow = parseInt(args[1]);
      if (isNaN(maxMsg) || isNaN(timeWindow)) { await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n   *ANTI-FLOOD ATUAL*\n◞──────────────────◟\n${config.maxFloodMessages} msgs/${config.floodTimeWindow}s\n\nUso: !setflood [msgs] [seg]\n◝──────────────────◜` }); return; }
      config.maxFloodMessages = maxMsg; config.floodTimeWindow = timeWindow; await saveConfig();
      await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n       *OK*\n◞──────────────────◟\nAnti-Flood: ${maxMsg} msgs/${timeWindow}s\n◝──────────────────◜` });
      return;
    }

    if (command === 'setwarn') {
      const max = parseInt(args[0]);
      if (isNaN(max)) { await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n  *ADVERTENCIAS ATUAL*\n◞──────────────────◟\nMaximo: ${config.maxWarnings}\n\nUso: !setwarn [numero]\n◝──────────────────◜` }); return; }
      config.maxWarnings = max; await saveConfig();
      await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n       *OK*\n◞──────────────────◟\nMaximo de advertencias: ${max}\n◝──────────────────◜` });
      return;
    }

    // Schedule (admin apenas)
    if (command === 'schedule' && isGroup) {
      if (!isSenderAdmin && !isSenderOwner) { await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n       *NEGADO*\n◞──────────────────◟\nApenas administradores!\n◝──────────────────◜` }); return; }
      const data = args[0]; const hora = args[1]; const mensagem = args.slice(2).join(' ');
      if (!data || !hora || !mensagem) { await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n       *USO*\n◞──────────────────◟\n!schedule [D/M/A] [H:M] [msg]\nEx: !schedule 25/12/2026 10:00\nFeliz Natal!\n◝──────────────────◜` }); return; }
      const [dia, mes, ano] = data.split('/'); const [h, m] = hora.split(':');
      const dataObj = new Date(ano, mes - 1, dia, h, m);
      scheduledMessages.push({ id: Date.now().toString(), target: remoteJid, datetime: dataObj.toISOString(), message: mensagem, sent: false });
      await saveSchedules();
      await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n       *OK*\n◞──────────────────◟\nAgendado para ${data} as ${hora}!\n◝──────────────────◜` });
      return;
    }

    if (command === 'listschedules') {
      const pending = scheduledMessages.filter(s => !s.sent);
      if (pending.length === 0) { await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n   *AGENDAMENTOS*\n◞──────────────────◟\nNenhum agendamento.\n◝──────────────────◜` }); }
      else { const lista = pending.map((s, i) => `${i+1}. ${new Date(s.datetime).toLocaleString('pt-BR')} -> "${s.message.substring(0, 30)}..."`).join('\n'); await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n     *AGENDAMENTOS*\n◞──────────────────◟\n${lista}\n◝──────────────────◜` }); }
      return;
    }

    if (command === 'cancelschedule') {
      const index = parseInt(args[0]) - 1; const pending = scheduledMessages.filter(s => !s.sent);
      if (isNaN(index) || index < 0 || index >= pending.length) { await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n       *ERRO*\n◞──────────────────◟\nNumero invalido!\n◝──────────────────◜` }); return; }
      const toCancel = pending[index];
      scheduledMessages = scheduledMessages.filter(s => s.id !== toCancel.id);
      await saveSchedules();
      await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n       *OK*\n◞──────────────────◟\nAgendamento cancelado!\n◝──────────────────◜` });
      return;
    }

    if (command === 'clearschedules') {
      const count = scheduledMessages.filter(s => !s.sent).length;
      scheduledMessages = scheduledMessages.filter(s => s.sent);
      await saveSchedules();
      await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n       *OK*\n◞──────────────────◟\n${count} agendamento(s) cancelado(s)!\n◝──────────────────◜` });
      return;
    }

    // Backup
    if (command === 'backup') {
      await saveConfig(); await saveLinks(); await saveWords(); await saveExtensions(); await saveGroups();
      await saveSchedules(); await saveMessages(); await saveAutoResponses(); await saveCustomCommands();
      await saveWarnings(); await saveFixedMessage(); await saveIAMemory();
      await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n       *OK*\n◞──────────────────◟\nBackup criado com sucesso\nno Redis!\n◝──────────────────◜` });
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
  res.json({ status: 'online', bot: 'Mr Doso', ia: 'DOSO IA', version: '7.0', timestamp: new Date().toISOString() });
});

app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', redis: redisClient.isReady, groups: authorizedGroups.length, 
    links: allowedLinks.length, words: bannedWords.length, ia: iaMemory.ativo, uptime: process.uptime() 
  });
});

// Anti-sleep
setInterval(async () => {
  try { const http = require('http'); http.get(`http://localhost:${PORT}/health`, (res) => { console.log(`Keep-alive: ${new Date().toLocaleTimeString()}`); }).on('error', () => {}); } catch (err) {}
}, 300000);

// =================================================================
// INICIAR
// =================================================================
async function start() {
  await loadFromRedis();
  app.listen(PORT, () => { console.log(`Servidor rodando na porta ${PORT}`); });
  await connectToWhatsApp();
}

start().catch(console.error);