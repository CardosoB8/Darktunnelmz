// ============================================================
// BOT WHATSAPP MR DOSO v8.0 - CÓDIGO COMPLETO
// Sistema com IA Gemini, Múltiplas Chaves, Redis, Anti-Spam
// ============================================================

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

// ============================================================
// CONFIGURAÇÕES PRINCIPAIS
// ============================================================
const REDIS_URL = 'redis://default:JyefUsxHJljfdvs8HACumEyLE7XNgLvG@redis-19242.c266.us-east-1-3.ec2.cloud.redislabs.com:19242';
const PHONE_NUMBER = '258858861745';
const OWNER_NUMBER = '253188708028487';
const OWNER_DISPLAY = 'Mr Doso';
const OWNER_CONTACT = 'wa.me/258865446574';
const PREFIX = '!';
const BOT_VERSION = '8.0';

// ============================================================
// MÚLTIPLAS CHAVES DA API GEMINI (RODÍZIO AUTOMÁTICO)
// ============================================================
const GEMINI_KEYS = [
  process.env.GEMINI_API_KEY_1,
  process.env.GEMINI_API_KEY_2,
  process.env.GEMINI_API_KEY_3,
  process.env.GEMINI_API_KEY_4
].filter(Boolean);

if (GEMINI_KEYS.length === 0) {
  console.error('⚠️ NENHUMA CHAVE GEMINI CONFIGURADA!');
  console.error('Configure as variáveis de ambiente: GEMINI_API_KEY_1, GEMINI_API_KEY_2, etc');
}

let currentKeyIndex = 0;
let keyUsageCount = {};

// Função de rodízio com contagem de uso
function getNextKey() {
  if (GEMINI_KEYS.length === 0) return null;
  
  // Encontrar a chave menos usada no minuto
  const now = Date.now();
  let leastUsedKey = currentKeyIndex;
  let minUsage = Infinity;
  
  for (let i = 0; i < GEMINI_KEYS.length; i++) {
    const usage = keyUsageCount[i] || 0;
    if (usage < minUsage) {
      minUsage = usage;
      leastUsedKey = i;
    }
  }
  
  currentKeyIndex = leastUsedKey;
  
  // Registrar uso
  if (!keyUsageCount[currentKeyIndex]) keyUsageCount[currentKeyIndex] = 0;
  keyUsageCount[currentKeyIndex]++;
  
  // Resetar contagem a cada minuto
  setTimeout(() => {
    keyUsageCount[currentKeyIndex] = Math.max(0, (keyUsageCount[currentKeyIndex] || 0) - 1);
  }, 60000);
  
  return GEMINI_KEYS[currentKeyIndex];
}

// ============================================================
// CONEXÃO COM REDIS
// ============================================================
const redisClient = redis.createClient({
    url: REDIS_URL,
    socket: { 
      reconnectStrategy: (retries) => {
        console.log(`Redis reconectando... Tentativa ${retries}`);
        return Math.min(retries * 100, 5000);
      }
    }
});

redisClient.on('error', (err) => console.error('Redis Error:', err));
redisClient.on('connect', () => console.log(' Redis conectado com sucesso!'));
redisClient.on('reconnecting', () => console.log('🔄 Redis reconectando...'));

// ============================================================
// CONFIGURAÇÕES DO BOT
// ============================================================
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

// ============================================================
// MEMÓRIA DA IA DOSO
// ============================================================
let iaMemory = {
  ativo: true,
  moderar: false,
  responder: true,
  tom: 'curto',
  conhecimentos: {},
  palavras: [],
  links: [],
  regras: [],
  admins: [],
  dono: `${OWNER_DISPLAY} - ${OWNER_CONTACT}`,
  welcomeMsg: "Bem-vindo(a) {nome} ao grupo! Leia as regras e divirta-se.",
  conversaContexto: [],
  ultimasInteracoes: []
};

// ============================================================
// PALAVRAS-GATILHO PARA MODERAÇÃO
// ============================================================
const TRIGGER_WORDS = [
  'merda', 'porra', 'foder', 'foda', 'caralho', 'buceta', 'viado', 'puta',
  'retardado', 'idiota', 'imbecil', 'otario', 'lixo', 'desgracado',
  'ganhe dinheiro', 'clique aqui', 'promocao', 'oportunidade unica',
  'puta que pariu', 'pulta', 'desgrama', 'arrombado', 'pau no cu',
  'vai tomar no cu', 'cuzão', 'filho da puta', 'fdp', 'caralho'
];

function countTriggerWords(text) {
  const lower = text.toLowerCase();
  let count = 0;
  for (const word of TRIGGER_WORDS) {
    if (lower.includes(word.toLowerCase())) count++;
  }
  return count;
}

function needsIACheck(text) {
  return countTriggerWords(text) >= 2;
}

// ============================================================
// MENSAGENS PERSONALIZADAS
// ============================================================
let customMessages = {
  welcome: null,
  goodbye: null,
  rules: `◜──────────────────◝
     *REGRAS DO GRUPO*
◞──────────────────◟
1️⃣ Proibido enviar links nao autorizados
2️⃣ Proibido palavras ofensivas
3️⃣ Respeite todos os membros
4️⃣ Spam resulta em banimento
5️⃣ Nao enviar conteudo +18
6️⃣ Cumpra as regras ou sera removido

📞 Dono: ${OWNER_CONTACT}
◝──────────────────◜`,

  removeMsg: `◜──────────────────◝
    *USUARIO REMOVIDO*
◞──────────────────◟
🚫 Motivo: Violacao das regras

Um membro foi removido do grupo.

📋 Regras: !regras
◝──────────────────◜`,

  wordWarning: `◜──────────────────◝
       *AVISO*
◞──────────────────◟
⚠️ Sua mensagem foi apagada
por conter palavra proibida.

Leia as regras: !regras
◝──────────────────◜`,

  botInfo: `◜──────────────────◝
   *BOT MR DOSO v8.0*
◞──────────────────◟
🤖 Bot de gerenciamento
🧠 IA DOSO integrada
🛡️ Anti-Link e Anti-Spam
💾 Cache em Redis
🔄 Multi-API Keys

📞 Criado por: ${OWNER_DISPLAY}
◝──────────────────◜`,

  autoMessages: [
    "◜──────────────────◝\n      *LEMBRETE*\n◞──────────────────◟\nMantenham o respeito e evitem links nao autorizados!\n◝──────────────────◜",
    "◜──────────────────◝\n      *BOT ATIVO*\n◞──────────────────◟\nUse *!menu* para ver os comandos disponiveis.\n◝──────────────────◜",
    "◜──────────────────◝\n       *AVISO*\n◞──────────────────◟\nLinks nao permitidos resultam em remocao.\n◝──────────────────◜",
    "◜──────────────────◝\n        *DICA*\n◞──────────────────◟\nPalavras ofensivas terao a mensagem apagada.\n◝──────────────────◜",
    "◜──────────────────◝\n   *GRUPO PROTEGIDO*\n◞──────────────────◟\nAnti-link ativo 24/7.\n◝──────────────────◜"
  ]
};

// ============================================================
// FUNÇÕES DE PERSISTÊNCIA NO REDIS
// ============================================================

async function loadFromRedis() {
  try {
    await redisClient.connect();
    console.log(' Redis conectado e pronto!');
    
    // Carregar configurações
    const configData = await redisClient.hGetAll('bot:config');
    if (configData && Object.keys(configData).length > 0) {
      const parsed = JSON.parse(configData.data || '{}');
      config = { ...config, ...parsed };
      console.log('📦 Configurações carregadas');
    }
    
    // Carregar listas
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
    
    // Carregar mensagens
    const msgData = await redisClient.hGetAll('bot:messages');
    if (msgData && Object.keys(msgData).length > 0) {
      const parsed = JSON.parse(msgData.data || '{}');
      customMessages = { ...customMessages, ...parsed };
    }
    
    // Carregar agendamentos
    const scheduleData = await redisClient.lRange('bot:schedules', 0, -1);
    if (scheduleData.length > 0) {
      scheduledMessages = scheduleData.map(s => JSON.parse(s));
    }
    
    // Carregar respostas automáticas
    const responsesData = await redisClient.lRange('bot:autoresponses', 0, -1);
    if (responsesData.length > 0) {
      autoResponses = responsesData.map(r => JSON.parse(r));
    }
    
    // Carregar comandos personalizados
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
    
    // Carregar advertências
    const warningsData = await redisClient.hGetAll('bot:warnings');
    if (warningsData && Object.keys(warningsData).length > 0) {
      for (const [key, value] of Object.entries(warningsData)) {
        warnings[key] = JSON.parse(value);
      }
    }
    
    // Carregar mensagem fixa
    const fixedData = await redisClient.get('bot:fixedmessage');
    if (fixedData) fixedMessage = JSON.parse(fixedData);
    
    // Carregar memória da IA
    const iaData = await redisClient.get('bot:iamemory');
    if (iaData) {
      try { 
        const parsed = JSON.parse(iaData);
        iaMemory = { ...iaMemory, ...parsed }; 
        console.log('🧠 Memória da IA carregada');
      } catch (err) {}
    }
    
    console.log(' Todos os dados carregados do Redis com sucesso!');
    console.log(`📊 Estatísticas: ${authorizedGroups.length} grupos, ${customCommands.length} comandos`);
    
  } catch (err) {
    console.error(' Erro ao carregar Redis:', err.message);
    console.log('⚠️ Continuando com configurações padrão...');
  }
}

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

async function saveIAMemory() {
  await redisClient.set('bot:iamemory', JSON.stringify(iaMemory));
}

// ============================================================
// FUNÇÕES AUXILIARES
// ============================================================

const logger = pino({ level: 'silent' });
const AUTH_FOLDER = './auth_info_baileys';

function isGroupAuthorized(groupId) { 
  return authorizedGroups.includes(groupId) || groupId === masterGroup; 
}

function isOwner(senderId) { 
  return senderId.split('@')[0] === OWNER_NUMBER; 
}

function randomDelay(min, max) { 
  return Math.floor(Math.random() * (max - min + 1)) + min; 
}

function containsLink(text) { 
  const linkRegex = /(https?:\/\/[^\s]+)|(www\.[^\s]+)|([a-zA-Z0-9-]+\.(com|org|net|io|gg|me|link|chat|whatsapp|telegram|click|online|site|blog|info|biz|us|xyz|top|club|shop|store|app|dev|tech|cloud))/gi;
  return linkRegex.test(text); 
}

function isLinkAllowed(text) { 
  return allowedLinks.some(domain => text.toLowerCase().includes(domain.toLowerCase())); 
}

function containsBannedWord(text) { 
  return bannedWords.some(word => text.toLowerCase().includes(word.toLowerCase())); 
}

function containsBannedExtension(text) { 
  return bannedExtensions.some(ext => text.toLowerCase().endsWith('.' + ext)); 
}

function isApkFile(msg) { 
  if (!config.antiApk) return false; 
  const text = (msg.message?.documentMessage?.caption || 
                msg.message?.documentMessage?.fileName || 
                msg.message?.conversation || '').toLowerCase(); 
  return text.includes('.apk'); 
}

function matchAutoResponse(text) { 
  for (const r of autoResponses) { 
    const triggers = r.trigger.toLowerCase().split(/\s+\|\s+|\s+/);
    const allMatch = triggers.every(trigger => text.toLowerCase().includes(trigger));
    if (allMatch) return r.reply; 
  } 
  return null; 
}

function addToLog(action) { 
  actionLog.push({...action, time: new Date().toISOString()}); 
  if (actionLog.length > 100) actionLog.shift(); 
}

async function isGroupAdmin(sock, groupId, participantId) { 
  try { 
    const metadata = await sock.groupMetadata(groupId); 
    const participant = metadata.participants.find(p => p.id === participantId);
    return participant?.admin === 'admin' || participant?.admin === 'superadmin';
  } catch { 
    return false; 
  } 
}

async function isBotAdmin(sock, groupId) { 
  if (groupId === masterGroup || authorizedGroups.includes(groupId)) return true; 
  try { 
    const metadata = await sock.groupMetadata(groupId); 
    const botId = sock.user.id;
    const participant = metadata.participants.find(p => p.id === botId);
    return participant?.admin === 'admin' || participant?.admin === 'superadmin';
  } catch { 
    return false; 
  } 
}

function checkFlood(senderId, groupId) { 
  if (!config.antiFlood) return false; 
  const key = `${groupId}:${senderId}`; 
  if (!floodTracker[key]) floodTracker[key] = []; 
  const now = Date.now(); 
  floodTracker[key] = floodTracker[key].filter(t => now - t < config.floodTimeWindow * 1000); 
  floodTracker[key].push(now); 
  return floodTracker[key].length >= config.maxFloodMessages; 
}

function scheduleAutoMessage(sock) {
  if (!iaMemory.ativo || !config.autoMessages) return;
  
  setInterval(async () => {
    try {
      if (!sock || !sock.sendMessage) return;
      const randomMsg = customMessages.autoMessages[Math.floor(Math.random() * customMessages.autoMessages.length)];
      
      for (const group of authorizedGroups) {
        await sock.sendMessage(group, { text: randomMsg });
      }
      if (masterGroup) {
        await sock.sendMessage(masterGroup, { text: randomMsg });
      }
    } catch (err) {
      console.error('Erro ao enviar mensagem automática:', err.message);
    }
  }, randomDelay(config.messageDelay.min, config.messageDelay.max));
}

function startFixedMessage(sock) {
  if (fixedMessageTimer) clearInterval(fixedMessageTimer);
  
  if (fixedMessage && fixedMessage.active && fixedMessage.group && fixedMessage.message) {
    fixedMessageTimer = setInterval(async () => {
      try {
        if (sock && sock.sendMessage) {
          await sock.sendMessage(fixedMessage.group, { text: fixedMessage.message });
          console.log(`📨 Mensagem fixa enviada para ${fixedMessage.group}`);
        }
      } catch (err) {
        console.error('Erro ao enviar mensagem fixa:', err.message);
      }
    }, fixedMessage.interval * 1000);
  }
}

function checkScheduledMessages(sock) {
  setInterval(async () => {
    const now = new Date();
    for (let i = 0; i < scheduledMessages.length; i++) {
      const task = scheduledMessages[i];
      if (task.active && new Date(task.time) <= now) {
        try {
          if (sock && sock.sendMessage) {
            await sock.sendMessage(task.group, { text: task.message });
            task.active = false;
            await saveSchedules();
            console.log(`📅 Mensagem agendada enviada: ${task.message.substring(0, 50)}`);
          }
        } catch (err) {
          console.error('Erro ao enviar mensagem agendada:', err.message);
        }
      }
    }
  }, 30000);
}

// ============================================================
// FUNÇÕES DA IA GEMINI (COM CACHE, RODÍZIO, TIMEOUT)
// ============================================================

async function callGemini(prompt, retries = 2) {
  if (GEMINI_KEYS.length === 0) {
    console.error(' Nenhuma chave API Gemini configurada!');
    return null;
  }
  
  for (let attempt = 0; attempt <= retries; attempt++) {
    const startKeyIndex = currentKeyIndex;
    
    for (let i = 0; i < GEMINI_KEYS.length; i++) {
      const key = getNextKey();
      if (!key) continue;
      
      try {
        const genAI = new GoogleGenerativeAI(key);
        const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-lite' });
        
        // Timeout de 15 segundos
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Timeout')), 15000)
        );
        
        const generatePromise = model.generateContent(prompt);
        const result = await Promise.race([generatePromise, timeoutPromise]);
        
        const response = result.response.text().trim();
        console.log(` IA respondeu usando key ${currentKeyIndex + 1}`);
        return response;
        
      } catch (err) {
        console.error(` Erro com key ${currentKeyIndex + 1}:`, err.message);
        
        if (err.message.includes('429') || err.message.includes('quota')) {
          console.log(`⚠️ Key ${currentKeyIndex + 1} esgotada, trocando...`);
          continue;
        }
        
        if (err.message.includes('403') || err.message.includes('suspended')) {
          console.log(`⚠️ Key ${currentKeyIndex + 1} suspensa, ignorando...`);
          continue;
        }
        
        if (attempt === retries && i === GEMINI_KEYS.length - 1) {
          throw err;
        }
      }
    }
    
    if (attempt < retries) {
      console.log(`🔄 Tentativa ${attempt + 1} falhou, aguardando 2 segundos...`);
      await new Promise(r => setTimeout(r, 2000));
    }
  }
  
  return null;
}

async function askIAWithCache(pergunta) {
  const cacheKey = `ia:cache:${pergunta.toLowerCase().trim().substring(0, 100)}`;
  
  try {
    // Verificar cache
    const cached = await redisClient.get(cacheKey);
    if (cached) {
      console.log('📦 Resposta do cache da IA');
      return cached;
    }
  } catch (err) {
    console.error('Erro ao ler cache:', err.message);
  }

  const prompt = `Voce e a DOSO IA, assistente do grupo WhatsApp do ${iaMemory.dono || 'Mr Doso'}.
Criada por Mr Doso para ajudar os membros do grupo.

CONFIGURAÇÕES ATUAIS:
- Tom de resposta: ${iaMemory.tom === 'curto' ? 'RESPOSTAS MUITO CURTAS (máximo 2 linhas)' : 'Respostas normais (2-3 linhas)'}
- Conhecimentos: ${JSON.stringify(iaMemory.conhecimentos).substring(0, 200)}

PERGUNTA DO USUARIO: "${pergunta}"

REGRAS IMPORTANTES:
1. Seja direta e objetiva
2. Nao invente informacoes
3. Se nao souber, diga exatamente: "Nao fui ensinada sobre isso ainda."
4. Respeite o tom definido acima
5. Nao use emojis em excesso

SUA RESPOSTA (APENAS O TEXTO, SEM FORMATACAO EXTRA):`;

  const resposta = await callGemini(prompt);
  
  if (resposta && resposta.length > 0) {
    const respostaLimitada = resposta.substring(0, 300);
    try {
      await redisClient.setEx(cacheKey, 86400, respostaLimitada);
    } catch (err) {
      console.error('Erro ao salvar cache:', err.message);
    }
    return respostaLimitada;
  }
  
  return null;
}

async function analyzeMessageWithIA(message, context = '') {
  const prompt = `Analise esta mensagem de WhatsApp e responda APENAS no formato: ACAO|DETALHES|MOTIVO

MENSAGEM: "${message}"
CONTEXTO EXTRA: ${context}

Acoes possiveis (APENAS UMA):
- SIM|apagar|MOTIVO (se for ofensiva ou spam - motivo em poucas palavras)
- SIM|advertir|MOTIVO (se merece alerta - motivo em poucas palavras)
- SIM|banir|MOTIVO (se for gravissimo - motivo em poucas palavras)
- NAO|ignorar| (se for inofensiva)

EXEMPLOS:
- SIM|apagar|palavrao
- SIM|advertir|flood
- NAO|ignorar|

Responda APENAS no formato indicado, sem explicacoes extras.`;

  const resposta = await callGemini(prompt);
  return resposta || 'NAO|ignorar|';
}

// ============================================================
// FUNÇÃO PRINCIPAL DO BOT
// ============================================================

async function connectToWhatsApp() {
  console.log('🚀 Iniciando conexão com WhatsApp...');
  
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_FOLDER);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: { 
      creds: state.creds, 
      keys: makeCacheableSignalKeyStore(state.keys, logger) 
    },
    logger,
    printQRInTerminal: false,
    browser: ['Mr Doso Bot', 'Chrome', '10.15.7'],
    markOnlineOnConnect: true,
    syncFullHistory: false,
    patchMessageBeforeSending: (message) => {
      // Remover caracteres problemáticos
      if (message.text) {
        message.text = message.text.replace(/[^\x20-\x7E\xA0-\xFF]/g, '');
      }
      return message;
    }
  });

  let connectionClosed = false;
  let reconnectAttempts = 0;

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;
    
    if (qr && !sock.authState.creds.registered && !connectionClosed) {
      console.log('📱 Gerando código de pareamento...');
      try {
        await new Promise(r => setTimeout(r, 2000));
        const code = await sock.requestPairingCode(PHONE_NUMBER);
        console.log('\n========================================');
        console.log(`🔑 CÓDIGO DE PAREAMENTO: ${code?.match(/.{1,4}/g)?.join('-') || code}`);
        console.log('========================================\n');
      } catch (err) {
        console.error('Erro ao gerar código:', err);
      }
    }
    
    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      
      console.log(` Conexão fechada! Código: ${statusCode}`);
      
      if (shouldReconnect && !connectionClosed) {
        connectionClosed = true;
        reconnectAttempts++;
        const delay = Math.min(5000 * reconnectAttempts, 30000);
        console.log(`🔄 Reconectando em ${delay/1000} segundos... (Tentativa ${reconnectAttempts})`);
        setTimeout(() => {
          connectionClosed = false;
          connectToWhatsApp().catch(console.error);
        }, delay);
      } else if (statusCode === DisconnectReason.loggedOut) {
        console.log('🚪 Deslogado do WhatsApp! Apague a pasta auth_info_baileys e reconecte.');
      }
    } 
    else if (connection === 'open') {
      console.log(' BOT CONECTADO AO WHATSAPP COM SUCESSO!');
      console.log(`📱 Nome: ${sock.user.name || 'Mr Doso'}`);
      console.log(`🆔 ID: ${sock.user.id}`);
      console.log(`🤖 Versão: ${BOT_VERSION}`);
      reconnectAttempts = 0;
      
      // Iniciar serviços
      scheduleAutoMessage(sock);
      checkScheduledMessages(sock);
      startFixedMessage(sock);
      
      // Anunciar inicialização nos grupos
      setTimeout(async () => {
        const startupMsg = `◜──────────────────◝
     *BOT REINICIADO*
◞──────────────────◟
🤖 Mr Doso v${BOT_VERSION}
🧠 IA DOSO: ${iaMemory.ativo ? 'ATIVA' : 'INATIVA'}
📊 Cache: Redis
🎯 Status: Online

Comandos: !menu
◝──────────────────◜`;
        
        for (const group of authorizedGroups) {
          try {
            await sock.sendMessage(group, { text: startupMsg });
          } catch (err) {}
        }
      }, 5000);
    }
  });

  sock.ev.on('creds.update', saveCreds);

  // ==========================================================
  // EVENTO: BOAS-VINDAS
  // ==========================================================
  sock.ev.on('group-participants.update', async (update) => {
    const { id, participants, action } = update;
    
    if (action === 'add' && iaMemory.welcomeMsg && iaMemory.ativo) {
      for (const user of participants) {
        if (user === sock.user.id) continue;
        
        const welcomeText = iaMemory.welcomeMsg.replace('{nome}', user.split('@')[0]);
        const finalMsg = `◜──────────────────◝
     *BEM-VINDO(A)*
◞──────────────────◟
${welcomeText}

📋 Regras: !regras
👑 Dono: ${OWNER_CONTACT}
◝──────────────────◜`;
        
        setTimeout(async () => {
          try {
            await sock.sendMessage(id, { 
              text: finalMsg, 
              mentions: [user] 
            });
            console.log(`👋 Boas-vindas enviadas para ${user} em ${id}`);
          } catch (err) {
            console.error('Erro ao enviar boas-vindas:', err.message);
          }
        }, randomDelay(2000, 5000));
      }
    }
    
    if (action === 'remove' && customMessages.goodbye) {
      for (const user of participants) {
        if (user === sock.user.id) continue;
        
        setTimeout(async () => {
          try {
            await sock.sendMessage(id, { 
              text: customMessages.goodbye.replace('{nome}', user.split('@')[0])
            });
          } catch (err) {}
        }, 1000);
      }
    }
  });

  // ==========================================================
  // EVENTO: MENSAGENS RECEBIDAS
  // ==========================================================
  sock.ev.on('messages.upsert', async ({ messages }) => {
    const msg = messages[0];
    if (!msg.message || msg.key.fromMe) return;

    const remoteJid = msg.key.remoteJid;
    const isGroup = remoteJid.endsWith('@g.us');
    const sender = msg.key.participant || remoteJid;
    const senderName = msg.pushName || 'Usuario';
    const messageContent = msg.message.conversation || 
                          msg.message.extendedTextMessage?.text || 
                          msg.message.imageMessage?.caption || 
                          msg.message.videoMessage?.caption || '';

    const isSenderOwner = isOwner(sender);
    const isSenderAdmin = isGroup ? await isGroupAdmin(sock, remoteJid, sender) : false;
    const isBotAdminStatus = isGroup ? await isBotAdmin(sock, remoteJid) : false;
    const isGroupOk = isGroup && isGroupAuthorized(remoteJid);
    const safe = !isSenderOwner && !isSenderAdmin;

    // Pular mensagens vazias
    if (!messageContent && !msg.message?.imageMessage && !msg.message?.videoMessage) return;

    // Log da mensagem
    console.log(`📨 [${isGroup ? 'GRUPO' : 'PV'}] ${senderName}: ${messageContent.substring(0, 50)}`);

    // ========================================================
    // PROTEÇÕES RÁPIDAS (SEM IA)
    // ========================================================
    
    // Anti-Link
    if (isGroup && safe && config.antiLink && containsLink(messageContent) && !isLinkAllowed(messageContent) && isBotAdminStatus) {
      console.log(`🔗 Anti-Link ativado para ${sender}`);
      
      setTimeout(async () => {
        try {
          await sock.sendMessage(remoteJid, { 
            delete: { remoteJid, id: msg.key.id, participant: sender } 
          });
        } catch (err) {}
      }, randomDelay(2000, 4000));
      
      setTimeout(async () => {
        try {
          await sock.groupParticipantsUpdate(remoteJid, [sender], 'remove');
          await sock.sendMessage(remoteJid, { 
            text: customMessages.removeMsg,
            mentions: [sender]
          });
          addToLog({ action: 'remove', user: sender, reason: 'link nao autorizado', group: remoteJid });
        } catch (err) {}
      }, randomDelay(config.removeDelay.min, config.removeDelay.max));
      
      return;
    }

    // Anti-Palavras
    if (isGroup && safe && config.antiWords && containsBannedWord(messageContent) && isBotAdminStatus) {
      console.log(`📝 Anti-Palavras ativado para ${sender}`);
      
      setTimeout(async () => {
        try {
          await sock.sendMessage(remoteJid, { 
            delete: { remoteJid, id: msg.key.id, participant: sender } 
          });
          await sock.sendMessage(remoteJid, { 
            text: customMessages.wordWarning, 
            mentions: [sender] 
          });
          
          // Adicionar advertência
          const warningKey = `${remoteJid}:${sender}`;
          if (!warnings[warningKey]) {
            warnings[warningKey] = { count: 1, reasons: [messageContent] };
          } else {
            warnings[warningKey].count++;
            warnings[warningKey].reasons.push(messageContent);
          }
          await saveWarnings();
          
          if (warnings[warningKey].count >= config.maxWarnings) {
            await sock.groupParticipantsUpdate(remoteJid, [sender], 'remove');
            await sock.sendMessage(remoteJid, { 
              text: `◜──────────────────◝\n    *BANIDO POR ADVERTENCIAS*\n◞──────────────────◟\nUsuario @${sender.split('@')[0]} foi banido por acumular ${config.maxWarnings} advertências.\n◝──────────────────◜`,
              mentions: [sender]
            });
            delete warnings[warningKey];
            await saveWarnings();
          }
        } catch (err) {}
      }, randomDelay(config.deleteDelay.min, config.deleteDelay.max));
      
      return;
    }

    // Anti-Flood
    if (isGroup && safe && checkFlood(sender, remoteJid) && isBotAdminStatus) {
      console.log(`🌊 Anti-Flood ativado para ${sender}`);
      
      setTimeout(async () => {
        try {
          await sock.groupParticipantsUpdate(remoteJid, [sender], 'remove');
          await sock.sendMessage(remoteJid, { 
            text: `◜──────────────────◝\n    *REMOVER POR SPAM*\n◞──────────────────◟\n@${sender.split('@')[0]} foi removido por envio excessivo de mensagens.\n◝──────────────────◜`,
            mentions: [sender]
          });
        } catch (err) {}
      }, randomDelay(2000, 5000));
      
      return;
    }

    // ========================================================
    // SISTEMA DE MODERAÇÃO COM IA (se ativado)
    // ========================================================
    if (isGroup && safe && iaMemory.ativo && iaMemory.moderar && isBotAdminStatus && needsIACheck(messageContent)) {
      console.log(`🤖 Enviando para moderação da IA: "${messageContent.substring(0, 50)}"`);
      
      const iaPromise = analyzeMessageWithIA(messageContent);
      const timeoutPromise = new Promise((resolve) => {
        setTimeout(() => resolve('NAO|ignorar|Timeout'), 10000);
      });
      
      try {
        const iaResponse = await Promise.race([iaPromise, timeoutPromise]);
        const [acao, subAcao, explicacao] = iaResponse.split('|');
        
        if (acao?.trim().toUpperCase() === 'SIM') {
          console.log(`🤖 IA decidiu: ${subAcao} - ${explicacao}`);
          
          if (subAcao?.trim().toLowerCase() === 'apagar') {
            setTimeout(async () => {
              try {
                await sock.sendMessage(remoteJid, { 
                  delete: { remoteJid, id: msg.key.id, participant: sender } 
                });
                await sock.sendMessage(remoteJid, { 
                  text: `◜──────────────────◝
     *DOSO IA*
◞──────────────────◟
🤖 IA detectou conteudo inadequado.
🚫 Motivo: ${explicacao?.trim() || 'Violacao das regras'}

📋 Respeite as regras do grupo!
◝──────────────────◜`, 
                  mentions: [sender] 
                });
              } catch (err) {}
            }, randomDelay(3000, 8000));
          }
          
          if (subAcao?.trim().toLowerCase() === 'advertir') {
            // Adicionar advertência
            const warningKey = `${remoteJid}:${sender}`;
            if (!warnings[warningKey]) {
              warnings[warningKey] = { count: 1, reasons: [explicacao] };
            } else {
              warnings[warningKey].count++;
              warnings[warningKey].reasons.push(explicacao);
            }
            await saveWarnings();
            
            setTimeout(async () => {
              try {
                await sock.sendMessage(remoteJid, { 
                  text: `◜──────────────────◝
     *ADVERTENCIA DA IA*
◞──────────────────◟
⚠️ @${sender.split('@')[0]}, voce recebeu uma advertência.
📝 Motivo: ${explicacao}
📊 Total: ${warnings[warningKey].count}/${config.maxWarnings}

Cumpra as regras para evitar remoção!
◝──────────────────◜`, 
                  mentions: [sender] 
                });
              } catch (err) {}
            }, randomDelay(2000, 5000));
          }
        }
      } catch (err) {
        console.log('⚠️ Timeout na moderação da IA, usando regras locais');
      }
    }

    // ========================================================
    // RESPOSTAS AUTOMÁTICAS (comandos personalizados)
    // ========================================================
    if (isGroup && isGroupOk) {
      const autoReply = matchAutoResponse(messageContent);
      if (autoReply) {
        setTimeout(async () => { 
          await sock.sendMessage(remoteJid, { text: autoReply }, { quoted: msg });
        }, randomDelay(config.responseDelay.min, config.responseDelay.max));
        return;
      }
    }

    // ========================================================
    // PROCESSAMENTO DE COMANDOS
    // ========================================================
    const args = messageContent.startsWith(PREFIX) ? messageContent.slice(PREFIX.length).trim().split(/ +/) : [];
    const command = args.shift()?.toLowerCase();
    
    // Se não for comando, verifica se a IA deve responder naturalmente
    if (!command) {
      // IA responde perguntas naturalmente (com cache)
      if (iaMemory.ativo && iaMemory.responder && isGroup && isGroupOk) {
        const pergunta = messageContent.toLowerCase().trim();
        const isQuestion = ['como', 'quem', 'onde', 'quando', 'porque', 'qual', 'que é', 'o que', '?.'].some(q => pergunta.includes(q));
        
        if (isQuestion && pergunta.length > 5 && pergunta.length < 100) {
          const resposta = await askIAWithCache(messageContent);
          if (resposta && resposta.length > 0) {
            setTimeout(async () => {
              await sock.sendMessage(remoteJid, { 
                text: `◜──────────────────◝
       *DOSO IA*
◞──────────────────◟
${resposta}

🤖 Powered by Gemini
◝──────────────────◜`, 
                mentions: [sender] 
              }, { quoted: msg });
            }, randomDelay(2000, 4000));
          }
        }
      }
      return;
    }

    // ========================================================
    // COMANDOS PÚBLICOS (TODOS USAM)
    // ========================================================
    
    if (command === 'menu') {
      let menu = `◜──────────────────◝
  *MENU DO BOT - MR DOSO v${BOT_VERSION}*
◞──────────────────◟
📋 *COMANDOS GERAIS*
━━━━━━━━━━━━━━━━━━━━
!menu      → Ver este menu
!info      → Informações do grupo
!bot       → Sobre o bot
!dono      → Contato do criador
!regras    → Ver as regras
!ping      → Testar se bot está online
!links     → Links permitidos
!advertencias → Ver suas advertências
!lembrete [min] [msg] → Criar lembrete

🎮 *COMANDOS ADMIN*
━━━━━━━━━━━━━━━━━━━━
!delete    → Apagar mensagem respondida
!todos [msg] → Marcar todos
!apagar [responder] → Apagar específica

🤖 *COMANDOS IA*
━━━━━━━━━━━━━━━━━━━━
Faça perguntas normais que a IA responde!
Ex: "O que é WhatsApp?"

📞 *DONO: ${OWNER_DISPLAY}*
◝──────────────────◜`;
      
      // Adicionar comandos personalizados públicos
      const publicCommands = customCommands.filter(c => c.public);
      if (publicCommands.length > 0) {
        menu += `\n\n🔧 *COMANDOS EXTRA*\n━━━━━━━━━━━━━━━━━━━━\n`;
        for (const cmd of publicCommands.slice(0, 10)) {
          menu += `!${cmd.name.padEnd(12)} → ${cmd.response.substring(0, 30)}\n`;
        }
      }
      
      menu += `\n◝──────────────────◜`;
      await sock.sendMessage(remoteJid, { text: menu });
      return;
    }
    
    if (command === 'ping') { 
      await sock.sendMessage(remoteJid, { 
        text: `◜──────────────────◝
         *PONG!*
◞──────────────────◟
🏓 Bot está online!
⏱️ Resposta em tempo real
🤖 Versão: ${BOT_VERSION}
◝──────────────────◜` 
      });
      return;
    }
    
    if (command === 'dono') { 
      await sock.sendMessage(remoteJid, { 
        text: `◜──────────────────◝
       *DONO DO BOT*
◞──────────────────◟
👤 Nome: ${OWNER_DISPLAY}
📞 Contato: ${OWNER_CONTACT}
🤖 Bot: Mr Doso v${BOT_VERSION}
💡 Criado para gerenciar grupos
◝──────────────────◜` 
      });
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
    
    if (command === 'links') { 
      await sock.sendMessage(remoteJid, { 
        text: `◜──────────────────◝
   *LINKS PERMITIDOS*
◞──────────────────◟
${allowedLinks.length > 0 ? allowedLinks.map(l => `🔗 ${l}`).join('\n') : '📭 Nenhum link permitido ainda'}

Para adicionar: !addlink [url]
◝──────────────────◜` 
      });
      return;
    }
    
    if (command === 'advertencias') {
      const warningKey = `${remoteJid}:${sender}`;
      const userWarnings = warnings[warningKey]?.count || 0;
      const remaining = config.maxWarnings - userWarnings;
      
      await sock.sendMessage(remoteJid, { 
        text: `◜──────────────────◝
    *SUAS ADVERTENCIAS*
◞──────────────────◟
⚠️ Total: ${userWarnings} de ${config.maxWarnings}
 Restam: ${remaining} antes do ban

${userWarnings > 0 ? '📝 Motivos: ' + warnings[warningKey]?.reasons?.slice(-3).join(', ') : ''}

Cumpra as regras!
◝──────────────────◜`,
        mentions: [sender]
      });
      return;
    }
    
    if (command === 'info') {
      const groupMeta = isGroup ? await sock.groupMetadata(remoteJid).catch(() => null) : null;
      const info = `◜──────────────────◝
     *INFORMACOES*
◞──────────────────◟
🤖 Bot: Mr Doso v${BOT_VERSION}
📊 Status: ${isGroupOk ? ' Autorizado' : ' Não autorizado'}
🧠 IA DOSO: ${iaMemory.ativo ? ' ATIVA' : ' INATIVA'}
🎯 Modo: ${iaMemory.tom === 'curto' ? 'Respostas curtas' : 'Respostas normais'}
🛡️ Anti-Link: ${config.antiLink ? ' ON' : ' OFF'}
📝 Anti-Palavras: ${config.antiWords ? ' ON' : ' OFF'}
${isGroup ? `👥 Grupo: ${groupMeta?.subject || 'N/A'}\n👑 Dono grupo: ${groupMeta?.owner?.split('@')[0] || 'N/A'}` : ''}
━━━━━━━━━━━━━━━━━━━━
📞 Criador: ${OWNER_DISPLAY}
◝──────────────────◜`;
      await sock.sendMessage(remoteJid, { text: info });
      return;
    }
    
    if (command === 'lembrete') {
      const minutos = parseInt(args[0]);
      const mensagem = args.slice(1).join(' ');
      
      if (!minutos || isNaN(minutos) || !mensagem) {
        await sock.sendMessage(remoteJid, { 
          text: '◜──────────────────◝\n     *USO CORRETO*\n◞──────────────────◟\n!lembrete [minutos] [mensagem]\n\nExemplo: !lembrete 5 Comprar pão\n◝──────────────────◜' 
        });
        return;
      }
      
      const taskId = Date.now();
      const taskTime = new Date(Date.now() + minutos * 60000);
      
      scheduledMessages.push({
        id: taskId,
        time: taskTime,
        message: `🔔 *LEMBRETE*\n⏰ ${minutos} minutos atrás você pediu:\n"${mensagem}"`,
        group: remoteJid,
        active: true,
        createdBy: sender
      });
      
      await saveSchedules();
      
      await sock.sendMessage(remoteJid, { 
        text: `◜──────────────────◝
     *LEMBRETE DEFINIDO*
◞──────────────────◟
 Lembrete criado com sucesso!
⏰ Tempo: ${minutos} minutos
📝 Mensagem: ${mensagem.substring(0, 50)}
🆔 ID: ${taskId}
◝──────────────────◜`,
        mentions: [sender]
      });
      return;
    }
    
    // ========================================================
    // COMANDOS PARA ADMINS E OWNER
    // ========================================================
    
    if (command === 'delete' && (isSenderAdmin || isSenderOwner)) {
      const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.stanzaId;
      const quotedSender = msg.message?.extendedTextMessage?.contextInfo?.participant;
      
      if (!quotedMsg) {
        await sock.sendMessage(remoteJid, { text: ' Responda a mensagem que deseja apagar!' });
        return;
      }
      
      await sock.sendMessage(remoteJid, { 
        delete: { remoteJid, id: quotedMsg, participant: quotedSender || sender } 
      });
      
      if (quotedSender) {
        await sock.sendMessage(remoteJid, { 
          text: ` Mensagem de @${quotedSender.split('@')[0]} apagada!`,
          mentions: [quotedSender]
        });
      }
      return;
    }
    
    if (command === 'todos' && (isSenderAdmin || isSenderOwner) && isGroup) {
      const texto = args.join(' ') || '🔔 Atenção a todos!';
      try {
        const metadata = await sock.groupMetadata(remoteJid);
        const mentions = metadata.participants.map(p => p.id);
        
        await sock.sendMessage(remoteJid, { 
          text: `◜──────────────────◝
       *TODOS OS MEMBROS*
◞──────────────────◟
${texto}

👥 Total no grupo: ${mentions.length}
📢 Enviado por: @${sender.split('@')[0]}
◝──────────────────◜`,
          mentions: [sender, ...mentions]
        });
      } catch (err) {
        await sock.sendMessage(remoteJid, { text: texto });
      }
      return;
    }
    
    if (command === 'apagar' && (isSenderAdmin || isSenderOwner) && msg.message?.extendedTextMessage?.contextInfo?.stanzaId) {
      const quoted = msg.message.extendedTextMessage.contextInfo;
      await sock.sendMessage(remoteJid, { 
        delete: { 
          remoteJid, 
          id: quoted.stanzaId, 
          participant: quoted.participant 
        } 
      });
      return;
    }
    
    // ========================================================
    // COMANDOS APENAS DO OWNER
    // ========================================================
    if (!isSenderOwner) return;
    
    if (command === 'status') {
      const uptime = process.uptime();
      const hours = Math.floor(uptime / 3600);
      const minutes = Math.floor((uptime % 3600) / 60);
      const seconds = Math.floor(uptime % 60);
      
      const status = `◜──────────────────◝
     *STATUS COMPLETO*
◞──────────────────◟
🤖 BOT: Mr Doso v${BOT_VERSION}
📊 Uptime: ${hours}h ${minutes}m ${seconds}s
🧠 IA DOSO: ${iaMemory.ativo ? ' ATIVA' : ' INATIVA'}
🎯 Moderação IA: ${iaMemory.moderar ? ' ON' : ' OFF'}
💬 Auto-resposta: ${iaMemory.responder ? ' ON' : ' OFF'}
🎨 Tom IA: ${iaMemory.tom.toUpperCase()}
━━━━━━━━━━━━━━━━━━━━
🛡️ Anti-Link: ${config.antiLink ? ' ON' : ' OFF'}
📝 Anti-Palavras: ${config.antiWords ? ' ON' : ' OFF'}
🌊 Anti-Flood: ${config.antiFlood ? ' ON' : ' OFF'}
📦 Comandos: ${customCommands.length}
🔄 Auto Msg: ${config.autoMessages ? ' ON' : ' OFF'}
━━━━━━━━━━━━━━━━━━━━
💰 Chaves Gemini: ${GEMINI_KEYS.length} ativas
🔑 Key atual: ${currentKeyIndex + 1}
💾 Grupos: ${authorizedGroups.length}
👥 Master: ${masterGroup ? '' : ''}
━━━━━━━━━━━━━━━━━━━━
📱 COD: ${PHONE_NUMBER}
◝──────────────────◜`;
      await sock.sendMessage(remoteJid, { text: status });
      return;
    }
    
    if (command === 'chat') {
      const pergunta = args.join(' ');
      if (!pergunta) {
        await sock.sendMessage(remoteJid, { text: 'Uso: !chat [pergunta]' });
        return;
      }
      
      const resposta = await askIAWithCache(pergunta);
      await sock.sendMessage(remoteJid, { 
        text: `◜──────────────────◝
       *DOSO IA*
◞──────────────────◟
${resposta || ' Não consegui responder no momento.'}

🤖 Modelo: Gemini Flash-Lite
◝──────────────────◜` 
      });
      return;
    }
    
    if (command === 'ia' && args[0] === 'testar') {
      const teste = await callGemini('Responda apenas com a palavra: OK');
      await sock.sendMessage(remoteJid, { 
        text: `◜──────────────────◝
     *TESTE IA*
◞──────────────────◟
${teste ? ' IA FUNCIONANDO!' : ' IA FALHOU'}
Resposta: ${teste || 'Sem resposta'}
◝──────────────────◜` 
      });
      return;
    }
    
    if (command === 'ensinar') {
      const trigger = args[0];
      const response = args.slice(1).join(' ');
      
      if (!trigger || !response) {
        await sock.sendMessage(remoteJid, { text: 'Uso: !ensinar [palavra] [resposta]' });
        return;
      }
      
      autoResponses.push({ trigger, reply: response });
      await saveAutoResponses();
      await sock.sendMessage(remoteJid, { text: ` Aprendi: "${trigger}" → "${response}"` });
      return;
    }
    
    if (command === 'addlink') {
      const link = args[0];
      if (!link || !link.includes('.')) {
        await sock.sendMessage(remoteJid, { text: 'Uso: !addlink [dominio]' });
        return;
      }
      
      allowedLinks.push(link);
      await saveLinks();
      await sock.sendMessage(remoteJid, { text: ` Link permitido: ${link}` });
      return;
    }
    
    if (command === 'dellink') {
      const link = args[0];
      const index = allowedLinks.indexOf(link);
      if (index !== -1) allowedLinks.splice(index, 1);
      await saveLinks();
      await sock.sendMessage(remoteJid, { text: ` Link removido: ${link || 'nenhum'}` });
      return;
    }
    
    if (command === 'addword') {
      const word = args[0];
      if (!word) return;
      bannedWords.push(word.toLowerCase());
      await saveWords();
      await sock.sendMessage(remoteJid, { text: `⚠️ Palavra bloqueada: ${word}` });
      return;
    }
    
    if (command === 'delword') {
      const word = args[0];
      const index = bannedWords.indexOf(word.toLowerCase());
      if (index !== -1) bannedWords.splice(index, 1);
      await saveWords();
      await sock.sendMessage(remoteJid, { text: ` Palavra liberada: ${word || 'nenhuma'}` });
      return;
    }
    
    if (command === 'addgroup') {
      const groupId = args[0];
      if (!groupId || !groupId.includes('@g.us')) {
        await sock.sendMessage(remoteJid, { text: 'Uso: !addgroup [id_do_grupo]' });
        return;
      }
      if (!authorizedGroups.includes(groupId)) {
        authorizedGroups.push(groupId);
        await saveGroups();
        await sock.sendMessage(remoteJid, { text: ` Grupo autorizado: ${groupId}` });
      }
      return;
    }
    
    if (command === 'delgroup') {
      const groupId = args[0];
      const index = authorizedGroups.indexOf(groupId);
      if (index !== -1) authorizedGroups.splice(index, 1);
      await saveGroups();
      await sock.sendMessage(remoteJid, { text: ` Grupo removido: ${groupId || 'nenhum'}` });
      return;
    }
    
    if (command === 'setmaster') {
      const groupId = args[0];
      if (!groupId || !groupId.includes('@g.us')) {
        await sock.sendMessage(remoteJid, { text: 'Uso: !setmaster [id_grupo]' });
        return;
      }
      masterGroup = groupId;
      await saveGroups();
      await sock.sendMessage(remoteJid, { text: `👑 Grupo master definido: ${groupId}` });
      return;
    }
    
    if (command === 'resetwarnings') {
      const user = args[0];
      if (!user) {
        // Resetar todos
        warnings = {};
        await saveWarnings();
        await sock.sendMessage(remoteJid, { text: ' Todas as advertências foram resetadas!' });
      } else {
        const warningKey = `${remoteJid}:${user}@s.whatsapp.net`;
        delete warnings[warningKey];
        await saveWarnings();
        await sock.sendMessage(remoteJid, { text: ` Advertências resetadas para ${user}` });
      }
      return;
    }
    
    if (command === 'recache') {
      await redisClient.del('bot:iamemory');
      await redisClient.del('bot:config');
      await loadFromRedis();
      await sock.sendMessage(remoteJid, { text: ' Cache reiniciado e dados recarregados!' });
      return;
    }
    
    if (command === 'help' || command === 'comandos') {
      const help = `◜──────────────────◝
   *COMANDOS DO OWNER*
◞──────────────────◟
👑 *GERENCIAMENTO*
━━━━━━━━━━━━━━━━━━━━
!status → Status completo
!recache → Recarregar Redis
!chat [msg] → Conversar com IA
!ia testar → Testar IA
━━━━━━━━━━━━━━━━━━━━
📚 *ENSINAR BOT*
━━━━━━━━━━━━━━━━━━━━
!ensinar [gatilho] [resposta]
!addlink [dominio]
!dellink [dominio]
!addword [palavra]
!delword [palavra]
━━━━━━━━━━━━━━━━━━━━
👥 *GRUPOS*
━━━━━━━━━━━━━━━━━━━━
!addgroup [id]
!delgroup [id]
!setmaster [id]
━━━━━━━━━━━━━━━━━━━━
⚠️ *MODERAÇÃO*
━━━━━━━━━━━━━━━━━━━━
!resetwarnings [user]
!apagar [responder msg]
━━━━━━━━━━━━━━━━━━━━
🎮 *CONFIG IA*
━━━━━━━━━━━━━━━━━━━━
!ia ativar/desativar
!moderar on/off
!tom curto/normal
━━━━━━━━━━━━━━━━━━━━
📞 Dono: ${OWNER_DISPLAY}
◝──────────────────◜`;
      await sock.sendMessage(remoteJid, { text: help });
      return;
    }
    
    // Comandos de configuração da IA
    if (command === 'ia') {
      if (args[0] === 'ativar') {
        iaMemory.ativo = true;
        await saveIAMemory();
        await sock.sendMessage(remoteJid, { text: ' IA DOSO ativada!' });
      } else if (args[0] === 'desativar') {
        iaMemory.ativo = false;
        await saveIAMemory();
        await sock.sendMessage(remoteJid, { text: ' IA DOSO desativada!' });
      }
      return;
    }
    
    if (command === 'moderar') {
      if (args[0] === 'on') {
        iaMemory.moderar = true;
        await saveIAMemory();
        await sock.sendMessage(remoteJid, { text: ' Moderação por IA ativada!' });
      } else if (args[0] === 'off') {
        iaMemory.moderar = false;
        await saveIAMemory();
        await sock.sendMessage(remoteJid, { text: ' Moderação por IA desativada!' });
      }
      return;
    }
    
    if (command === 'tom') {
      if (args[0] === 'curto') {
        iaMemory.tom = 'curto';
        await saveIAMemory();
        await sock.sendMessage(remoteJid, { text: ' Tom de resposta: CURTO (máx 2 linhas)' });
      } else if (args[0] === 'normal') {
        iaMemory.tom = 'normal';
        await saveIAMemory();
        await sock.sendMessage(remoteJid, { text: ' Tom de resposta: NORMAL (2-3 linhas)' });
      }
      return;
    }
    
    if (command === 'welcome') {
      const welcomeText = args.join(' ');
      if (!welcomeText) {
        await sock.sendMessage(remoteJid, { text: `Mensagem atual: ${iaMemory.welcomeMsg || 'nenhuma'}\nUse: !welcome [texto]` });
        return;
      }
      iaMemory.welcomeMsg = welcomeText;
      await saveIAMemory();
      await sock.sendMessage(remoteJid, { text: ` Mensagem de boas-vindas definida!` });
      return;
    }
    
    if (command === 'anticmd') {
      if (args[0] === 'on') {
        await sock.sendMessage(remoteJid, { text: '⚠️ Não posso desabilitar comandos completamente!' });
      }
      return;
    }
  });

  return sock;
}

// ============================================================
// SERVIDOR EXPRESS + ANTI-SLEEP + INICIALIZAÇÃO
// ============================================================

const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.json({ 
    status: 'online', 
    bot: 'Mr Doso', 
    version: BOT_VERSION,
    ia: 'DOSO IA',
    redis: redisClient.isReady ? 'connected' : 'disconnected',
    uptime: process.uptime()
  });
});

app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    bot: 'Mr Doso',
    redis: redisClient.isReady,
    ia: iaMemory.ativo,
    uptime: process.uptime(),
    groups: authorizedGroups.length,
    commands: customCommands.length
  });
});

app.get('/stats', async (req, res) => {
  try {
    const memory = await redisClient.info('memory');
    res.json({
      bot: BOT_VERSION,
      uptime: process.uptime(),
      groups: authorizedGroups.length,
      masterGroup: masterGroup,
      iaActive: iaMemory.ativo,
      iaModerate: iaMemory.moderar,
      totalWarnings: Object.keys(warnings).length,
      scheduledTasks: scheduledMessages.length,
      autoResponses: autoResponses.length,
      customCommands: customCommands.length,
      redisKeys: await redisClient.dbsize()
    });
  } catch (err) {
    res.json({ error: err.message });
  }
});

// Anti-sleep (keep alive)
setInterval(async () => {
  try {
    const response = await fetch(`http://localhost:${PORT}/health`);
    console.log(`💓 Keep-alive: ${response.status}`);
  } catch (err) {
    console.log('⚠️ Health check falhou');
  }
}, 300000); // a cada 5 minutos

// ============================================================
// INICIALIZAÇÃO PRINCIPAL
// ============================================================

async function start() {
  console.log('╔════════════════════════════════════════╗');
  console.log('║     MR DOSO BOT v8.0 - INICIANDO      ║');
  console.log('║    WhatsApp Bot com IA Gemini         ║');
  console.log('╚════════════════════════════════════════╝');
  
  console.log('\n📦 Carregando dados do Redis...');
  await loadFromRedis();
  
  console.log(`\n🌐 Iniciando servidor Express na porta ${PORT}...`);
  app.listen(PORT, () => {
    console.log(` Servidor rodando em http://localhost:${PORT}`);
    console.log(`📊 Health check: http://localhost:${PORT}/health`);
    console.log(`📈 Stats: http://localhost:${PORT}/stats`);
  });
  
  console.log('\n🤖 Conectando ao WhatsApp...');
  console.log(`📱 Número: ${PHONE_NUMBER}`);
  console.log(`👑 Dono: ${OWNER_DISPLAY} (${OWNER_NUMBER})`);
  console.log(`💾 Redis: ${REDIS_URL.substring(0, 50)}...`);
  console.log(`🔑 APIs Gemini: ${GEMINI_KEYS.length} chaves carregadas\n`);
  
  await connectToWhatsApp();
}

// Tratamento de erros globais
process.on('uncaughtException', (err) => {
  console.error(' Erro não tratado:', err.message);
  console.error(err.stack);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error(' Promise rejeitada não tratada:', reason);
});

// Iniciar bot
start().catch(err => {
  console.error(' Erro fatal ao iniciar:', err);
  process.exit(1);
});