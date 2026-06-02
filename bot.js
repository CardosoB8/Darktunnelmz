const {
  default: makeWASocket,
  makeCacheableSignalKeyStore,
  fetchLatestBaileysVersion,
} = require('@whiskeysockets/baileys');
const pino = require('pino');
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
const IA_MODEL_NAME = 'gemini-flash-latest';

const GEMINI_KEYS = [
  process.env.GEMINI_API_KEY_1,
  process.env.GEMINI_API_KEY_2,
  process.env.GEMINI_API_KEY_3,
  process.env.GEMINI_API_KEY_4
].filter(Boolean);

let currentKeyIndex = 0;
const getNextApiKey = () => {
  if (GEMINI_KEYS.length === 0) return null;
  const key = GEMINI_KEYS[currentKeyIndex];
  currentKeyIndex = (currentKeyIndex + 1) % GEMINI_KEYS.length;
  return key;
};

const redisClient = redis.createClient({
  url: REDIS_URL,
  socket: { reconnectStrategy: (retries) => Math.min(retries * 100, 3000) }
});
redisClient.on('error', (err) => console.error('Redis Error:', err));

// =================================================================
// AUTENTICAÇÃO VIA REDIS
// =================================================================
const AUTH_STATE_KEY = 'baileys:authState';

async function getAuthStateFromRedis() {
  try {
    const data = await redisClient.get(AUTH_STATE_KEY);
    if (data) {
      console.log('[AUTH] Sessão carregada do Redis');
      return JSON.parse(data);
    }
  } catch (err) {
    console.error('[AUTH] Erro ao carregar sessão:', err.message);
  }
  return null;
}

async function saveAuthStateToRedis(state) {
  try {
    await redisClient.set(AUTH_STATE_KEY, JSON.stringify(state));
  } catch (err) {
    console.error('[AUTH] Erro ao salvar sessão:', err.message);
  }
}

async function deleteAuthStateFromRedis() {
  try {
    await redisClient.del(AUTH_STATE_KEY);
    console.log('[AUTH] Sessão removida do Redis');
  } catch (err) {
    console.error('[AUTH] Erro ao remover sessão:', err.message);
  }
}

// =================================================================
// ESTADO DO BOT
// =================================================================
let config = {
  antiLink: true, antiWords: true, antiStatus: false, antiMencao: false,
  antiApk: false, antiAudio: false, antiDocumento: false, antiImagem: false,
  antiVideo: false, antiSticker: false, autoMessages: true, antiFlood: true,
  maxFloodMessages: 5, floodTimeWindow: 10, maxWarnings: 3,
  removeDelay: { min: 3000, max: 10000 }, deleteDelay: { min: 3000, max: 10000 },
  messageDelay: { min: 3600000, max: 7200000 }, responseDelay: { min: 3000, max: 8000 },
  deleteCmdDelay: { min: 2000, max: 4000 }, botAtivo: true,
  punirLinkComBan: false, limiteLinksAntesBan: 5, silenciarTempo: 86400
};

let allowedLinks = [], bannedWords = [], bannedExtensions = [], authorizedGroups = [];
let masterGroup = null, scheduledTasks = {}, scheduledMessages = [], groupLeaveTimers = {};
let autoResponses = [], customCommands = [], floodTracker = {}, actionLog = [];
let warnings = {}, dailyReminders = {}, fixedMessage = null, fixedMessageTimer = null;
let pendingAction = {};
let groupPrefixes = {};
let mutedUsers = {};
let linkCounters = {};
let apiUsage = { requests: 0, lastReset: new Date().toDateString() };

let iaMemory = {
  ativo: true, moderar: false, responder: false, tom: 'curto', maxCaracteres: 300,
  conhecimentos: {}, palavras: [], links: [], regras: [], admins: [],
  dono: `${OWNER_DISPLAY} - ${OWNER_CONTACT}`, welcomeMsg: null, ultimasInteracoes: []
};

const TRIGGER_WORDS = [
  'merda', 'porra', 'foder', 'foda', 'caralho', 'buceta', 'viado', 'puta',
  'retardado', 'idiota', 'imbecil', 'otario', 'lixo', 'desgracado',
  'ganhe dinheiro', 'clique aqui', 'promocao', 'oportunidade unica'
];

function countTriggerWords(text) { const l = text.toLowerCase(); let c = 0; for (const w of TRIGGER_WORDS) if (l.includes(w)) c++; return c; }
function needsIACheck(text) { return countTriggerWords(text) >= 2; }

// =================================================================
// MENSAGENS PERSONALIZADAS
// =================================================================
let customMessages = {
  welcome: null, goodbye: null,
  rules: `◜──────────────────◝\n     *REGRAS DO GRUPO*\n◞──────────────────◟\n1. Proibido enviar links nao autorizados\n2. Proibido palavras ofensivas\n3. Respeite todos os membros\n4. Spam resulta em banimento\n\nComandos: !menu\n◝──────────────────◜`,
  removeMsg: `◜──────────────────◝\n    *USUARIO REMOVIDO*\n◞──────────────────◟\nMotivo: Violacao das regras\n\nUm membro foi removido por infringir as regras.\n\nRegras: use !regras\n◝──────────────────◜`,
  silenceMsg: `◜──────────────────◝\n    *USUARIO SILENCIADO*\n◞──────────────────◟\nMotivo: Link nao autorizado\n\nVoce foi silenciado por 24 horas.\nEnvie links apenas dos dominios\npermitidos.\n◝──────────────────◜`,
  wordWarning: `◜──────────────────◝\n       *AVISO*\n◞──────────────────◟\nSua mensagem foi apagada por conter palavra proibida.\n\nLeia as regras: !regras\n◝──────────────────◜`,
  botInfo: `◜──────────────────◝\n   *BOT MR DOSO v12.0*\n◞──────────────────◟\nProtecao: Anti-Link e Anti-Palavras\nIA DOSO: Ativada\n\nComandos: !menu\nCriado por: ${OWNER_DISPLAY}\n◝──────────────────◜`,
  autoMessages: [
    "◜──────────────────◝\n      *LEMBRETE*\n◞──────────────────◟\nMantenham o respeito e evitem links nao autorizados!\n◝──────────────────◜",
    "◜──────────────────◝\n      *BOT ATIVO*\n◞──────────────────◟\nUse *!menu* para ver os comandos disponiveis.\n◝──────────────────◜",
    "◜──────────────────◝\n       *AVISO*\n◞──────────────────◟\nLinks nao permitidos resultam em punicao.\n◝──────────────────◜",
    "◜──────────────────◝\n        *DICA*\n◞──────────────────◟\nPalavras ofensivas terao a mensagem apagada.\n◝──────────────────◜",
    "◜──────────────────◝\n   *GRUPO PROTEGIDO*\n◞──────────────────◟\nAnti-link ativo 24/7.\n◝──────────────────◜"
  ]
};

// =================================================================
// CARREGAR DADOS DO REDIS
// =================================================================
async function loadFromRedis() {
  try {
    await redisClient.connect(); console.log('Redis conectado!');
    const cd = await redisClient.hGetAll('bot:config'); if (cd && Object.keys(cd).length > 0) config = { ...config, ...JSON.parse(cd.data || '{}') };
    const ld = await redisClient.sMembers('bot:links'); if (ld.length > 0) allowedLinks = ld;
    const wd = await redisClient.sMembers('bot:words'); if (wd.length > 0) bannedWords = wd;
    const ed = await redisClient.sMembers('bot:extensions'); if (ed.length > 0) bannedExtensions = ed;
    const gd = await redisClient.sMembers('bot:groups'); if (gd.length > 0) authorizedGroups = gd;
    const m = await redisClient.get('bot:master'); if (m) masterGroup = m;
    const md = await redisClient.hGetAll('bot:messages'); if (md && Object.keys(md).length > 0) customMessages = { ...customMessages, ...JSON.parse(md.data || '{}') };
    const sd = await redisClient.lRange('bot:schedules', 0, -1); if (sd.length > 0) scheduledMessages = sd.map(s => JSON.parse(s));
    const rd = await redisClient.lRange('bot:autoresponses', 0, -1); if (rd.length > 0) autoResponses = rd.map(r => JSON.parse(r));
    const cmd = await redisClient.hGetAll('bot:customcommands');
    if (cmd && Object.keys(cmd).length > 0) { customCommands = Object.entries(cmd).map(([n, d]) => { try { const p = JSON.parse(d); return { name: n, response: p.response, public: p.public || false }; } catch { return { name: n, response: d, public: false }; } }); }
    const wnd = await redisClient.hGetAll('bot:warnings'); if (wnd && Object.keys(wnd).length > 0) { for (const [k, v] of Object.entries(wnd)) warnings[k] = JSON.parse(v); }
    const fd = await redisClient.get('bot:fixedmessage'); if (fd) fixedMessage = JSON.parse(fd);
    const iad = await redisClient.get('bot:iamemory'); if (iad) { try { iaMemory = { ...iaMemory, ...JSON.parse(iad) }; } catch (err) {} }
    const mud = await redisClient.hGetAll('bot:mutedusers'); if (mud && Object.keys(mud).length > 0) { for (const [k, v] of Object.entries(mud)) mutedUsers[k] = JSON.parse(v); }
    const pfd = await redisClient.hGetAll('bot:prefixes'); if (pfd && Object.keys(pfd).length > 0) groupPrefixes = pfd;
    const aud = await redisClient.get('bot:apiusage'); if (aud) apiUsage = JSON.parse(aud);
    const lcd = await redisClient.hGetAll('bot:linkcounters'); if (lcd && Object.keys(lcd).length > 0) { for (const [k, v] of Object.entries(lcd)) linkCounters[k] = JSON.parse(v); }
    console.log('Dados carregados do Redis');
  } catch (err) { console.error('Erro ao carregar Redis:', err.message); }
}

// =================================================================
// SALVAR DADOS NO REDIS
// =================================================================
async function saveConfig() { await redisClient.hSet('bot:config', 'data', JSON.stringify(config)); }
async function saveLinks() { await redisClient.del('bot:links'); if (allowedLinks.length > 0) await redisClient.sAdd('bot:links', allowedLinks); }
async function saveWords() { await redisClient.del('bot:words'); if (bannedWords.length > 0) await redisClient.sAdd('bot:words', bannedWords); }
async function saveExtensions() { await redisClient.del('bot:extensions'); if (bannedExtensions.length > 0) await redisClient.sAdd('bot:extensions', bannedExtensions); }
async function saveGroups() { await redisClient.del('bot:groups'); if (authorizedGroups.length > 0) await redisClient.sAdd('bot:groups', authorizedGroups); if (masterGroup) await redisClient.set('bot:master', masterGroup); }
async function saveSchedules() { await redisClient.del('bot:schedules'); for (const s of scheduledMessages) { await redisClient.rPush('bot:schedules', JSON.stringify(s)); } }
async function saveMessages() { await redisClient.hSet('bot:messages', 'data', JSON.stringify(customMessages)); }
async function saveAutoResponses() { await redisClient.del('bot:autoresponses'); for (const r of autoResponses) { await redisClient.rPush('bot:autoresponses', JSON.stringify(r)); } }
async function saveCustomCommands() { await redisClient.del('bot:customcommands'); for (const c of customCommands) { await redisClient.hSet('bot:customcommands', c.name, JSON.stringify({ response: c.response, public: c.public || false })); } }
async function saveWarnings() { await redisClient.del('bot:warnings'); for (const [k, v] of Object.entries(warnings)) { if (v && v.count > 0) { await redisClient.hSet('bot:warnings', k, JSON.stringify(v)); } } }
async function saveFixedMessage() { if (fixedMessage) { await redisClient.set('bot:fixedmessage', JSON.stringify(fixedMessage)); } else { await redisClient.del('bot:fixedmessage'); } }
async function saveIAMemory() { await redisClient.set('bot:iamemory', JSON.stringify(iaMemory)); }
async function saveMutedUsers() { await redisClient.del('bot:mutedusers'); for (const [k, v] of Object.entries(mutedUsers)) { if (v && v.length > 0) { await redisClient.hSet('bot:mutedusers', k, JSON.stringify(v)); } } }
async function savePrefixes() { await redisClient.del('bot:prefixes'); for (const [k, v] of Object.entries(groupPrefixes)) { await redisClient.hSet('bot:prefixes', k, v); } }
async function saveAPIUsage() { await redisClient.set('bot:apiusage', JSON.stringify(apiUsage)); }
async function saveLinkCounters() { await redisClient.del('bot:linkcounters'); for (const [k, v] of Object.entries(linkCounters)) { if (v && v.count > 0) { await redisClient.hSet('bot:linkcounters', k, JSON.stringify(v)); } } }

// =================================================================
// FUNÇÕES AUXILIARES
// =================================================================
const logger = pino({ level: 'silent' });
function isGroupAuthorized(g) { return authorizedGroups.includes(g) || g === masterGroup; }
function isOwner(s) { return s.split('@')[0] === OWNER_NUMBER; }
function randomDelay(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function containsLink(t) { return /(https?:\/\/[^\s]+)|(www\.[^\s]+)|([a-zA-Z0-9-]+\.(com|org|net|io|gg|me|link|chat|whatsapp|telegram|click|online|site|blog|info|biz|us|xyz|top|club|shop|store|app|dev|tech|cloud))/gi.test(t); }
function isLinkAllowed(t) { if (allowedLinks.length === 0) return false; return allowedLinks.some(d => t.toLowerCase().includes(d)); }
function containsBannedWord(text) {
  if (bannedWords.length === 0) return false;
  const lower = text.toLowerCase();
  return bannedWords.some(word => {
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`\\b${escaped}\\b`, 'i');
    return regex.test(lower);
  });
}
function containsBannedExtension(t) { if (bannedExtensions.length === 0) return false; return bannedExtensions.some(e => t.toLowerCase().endsWith('.' + e)); }
function isApkFile(msg) { if (!config.antiApk) return false; const t = (msg.message?.documentMessage?.caption || msg.message?.documentMessage?.fileName || msg.message?.conversation || '').toLowerCase(); return t.includes('.apk'); }
function matchAutoResponse(t) { for (const r of autoResponses) { if (r.trigger.toLowerCase().split(' ').every(w => t.toLowerCase().includes(w))) return r.reply; } return null; }
function addToLog(a) { actionLog.push({ ...a, time: new Date().toISOString() }); if (actionLog.length > 50) actionLog.shift(); }
async function isGroupAdmin(sock, gid, pid) { try { const m = await sock.groupMetadata(gid); return m.participants.filter(p => p.admin).map(p => p.id).includes(pid); } catch { return false; } }
async function isBotAdmin(sock, gid) { if (gid === masterGroup || authorizedGroups.includes(gid)) return true; try { return (await sock.groupMetadata(gid)).participants.filter(p => p.admin).map(p => p.id).includes(sock.user.id); } catch { return false; } }
function checkFlood(s, gid) { if (!config.antiFlood) return false; const k = `${gid}:${s}`; if (!floodTracker[k]) floodTracker[k] = []; const now = Date.now(); floodTracker[k] = floodTracker[k].filter(t => now - t < config.floodTimeWindow * 1000); floodTracker[k].push(now); return floodTracker[k].length >= config.maxFloodMessages; }
function scheduleAutoMessage(sock, gid) { if (!isGroupAuthorized(gid) || !config.autoMessages) return; if (scheduledTasks[gid]) clearTimeout(scheduledTasks[gid]); const d = randomDelay(config.messageDelay.min, config.messageDelay.max); scheduledTasks[gid] = setTimeout(async () => { try { const m = customMessages.autoMessages[Math.floor(Math.random() * customMessages.autoMessages.length)]; await sock.sendMessage(gid, { text: m }); } catch (err) {} scheduleAutoMessage(sock, gid); }, d); }
function startFixedMessage(sock) { if (fixedMessageTimer) clearInterval(fixedMessageTimer); if (!fixedMessage || !fixedMessage.active) return; const min = fixedMessage.randomMin || 30, max = fixedMessage.randomMax || 30; const d = Math.floor(Math.random() * (max - min + 1) + min) * 60000; fixedMessageTimer = setTimeout(async () => { try { for (const g of authorizedGroups) { await sock.sendMessage(g, { text: `📌 ${fixedMessage.text}` }); } } catch (err) {} startFixedMessage(sock); }, d); }
function checkScheduledMessages(sock) {
  setInterval(async () => {
    const now = new Date();
    const ts = scheduledMessages.filter(s => { const t = new Date(s.datetime); return !s.sent && t <= now; });
    for (const s of ts) {
      try {
        const metadata = await sock.groupMetadata(s.target);
        const allIds = metadata.participants.map(p => p.id);
        await sock.sendMessage(s.target, { text: `◜──────────────────◝\n     *AGENDAMENTO*\n◞──────────────────◟\n${s.message}\n\n@todos\n◝──────────────────◜`, mentions: allIds });
        s.sent = true;
      } catch (err) {
        try { await sock.sendMessage(s.target, { text: `◜──────────────────◝\n     *AGENDAMENTO*\n◞──────────────────◟\n${s.message}\n◝──────────────────◜` }); s.sent = true; } catch (err2) {}
      }
    }
    if (ts.length > 0) saveSchedules();
  }, 30000);
}
function getMessageType(msg) {
  if (msg.message?.audioMessage) return 'audio';
  if (msg.message?.documentMessage) return 'documento';
  if (msg.message?.imageMessage) return 'imagem';
  if (msg.message?.videoMessage) return 'video';
  if (msg.message?.stickerMessage) return 'sticker';
  return null;
}
function isMediaBlocked(type) {
  switch (type) {
    case 'audio': return config.antiAudio;
    case 'documento': return config.antiDocumento;
    case 'imagem': return config.antiImagem;
    case 'video': return config.antiVideo;
    case 'sticker': return config.antiSticker;
    default: return false;
  }
}

// =================================================================
// FUNÇÕES DA IA DOSO
// =================================================================
function gerarContextoIA() {
  return `=== DADOS DO BOT ===\nDono: ${OWNER_DISPLAY}\nContato: ${OWNER_CONTACT}\nData: ${new Date().toLocaleDateString('pt-BR')}\nHora UTC: ${new Date().toLocaleTimeString('pt-BR')}\nFuso: UTC (Mocambique = +2h)\nMax caracteres resposta: ${iaMemory.maxCaracteres}\n\n=== STATUS DAS PROTECOES ===\nAnti-Link: ${config.antiLink ? 'ON' : 'OFF'}\nAnti-Palavras: ${config.antiWords ? 'ON' : 'OFF'}\n\n=== LINKS PERMITIDOS ===\n${allowedLinks.length > 0 ? allowedLinks.join(', ') : 'Nenhum'}\n\n=== PALAVRAS BANIDAS ===\n${bannedWords.length > 0 ? bannedWords.join(', ') : 'Nenhuma'}\n\n=== CONHECIMENTOS ===\n${JSON.stringify(iaMemory.conhecimentos)}\n\n=== COMANDOS ===\n!schedule [DD/MM/AAAA] [HH:MM] [msg]\n!fixar [min] [max] [msg]\n!todos [msg]\n!abrgrupo / !fechargrupo\n!mudarnome [nome]\n!linkgrupo / !idgrupo\n!mutar @user / !desmutar @user\n!addlink [dominio]\n!addword [palavra]\n!delete\n!ban @usuario\n\n=== COMANDOS PERSONALIZADOS ===\n${customCommands.map(c => `!${c.name} = ${c.response}`).join('\n')}`;
}
async function callGeminiAPI(prompt, retries = 2) {
  const today = new Date().toDateString();
  if (apiUsage.lastReset !== today) { apiUsage = { requests: 0, lastReset: today }; }
  if (apiUsage.requests >= 1500 * GEMINI_KEYS.length) { console.log('[IA] Cota diaria esgotada'); return null; }
  for (let a = 0; a <= retries; a++) {
    for (let i = 0; i < GEMINI_KEYS.length; i++) {
      const key = getNextApiKey(); if (!key) continue;
      try {
        const g = new GoogleGenerativeAI(key); const m = g.getGenerativeModel({ model: IA_MODEL_NAME });
        const r = await m.generateContent(prompt); apiUsage.requests++; await saveAPIUsage();
        return r.response.text().trim();
      } catch (err) {
        if (err.message.includes('429') || err.message.includes('quota') || err.message.includes('403') || err.message.includes('suspended')) continue;
        return null;
      }
    }
    if (a < retries) await new Promise(r => setTimeout(r, 2000));
  }
  return null;
}
async function askIAWithCache(pergunta) {
  const ck = `ia:cache:${pergunta.toLowerCase().trim().substring(0, 100)}`;
  const cached = await redisClient.get(ck); if (cached) return cached;
  const ctx = gerarContextoIA();
  const variacao = Math.random().toString(36).slice(2, 8);
  const prompt = `[var:${variacao}] Voce e a DOSO IA, assistente do grupo WhatsApp do ${iaMemory.dono || 'Mr Doso'}.\n${ctx}\nUsuario: ${pergunta}\nResponda de forma direta e util, com NO MAXIMO ${iaMemory.maxCaracteres} caracteres. NAO invente. Se nao souber, diga: "Nao fui ensinada sobre isso." Varie o estilo das respostas.`;
  const r = await callGeminiAPI(prompt);
  if (r) { const rc = r.substring(0, iaMemory.maxCaracteres); await redisClient.setEx(ck, 86400, rc); return rc; }
  return null;
}
async function analyzeMessageWithIA(message) {
  const ctx = gerarContextoIA();
  const variacao = Math.random().toString(36).slice(2, 8);
  const prompt = `[var:${variacao}] Analise esta mensagem e responda EXATAMENTE no formato ACAO|SUBACAO|MENSAGEM\n\n${ctx}\n\nMensagem: "${message}"\n\nAcoes: SIM|apagar|MOTIVO / SIM|banir|MOTIVO / NAO|ignorar\n\nResponda APENAS no formato indicado. Use palavras diferentes a cada resposta.`;
  const iaP = callGeminiAPI(prompt);
  const toP = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 10000));
  try {
    const r = await Promise.race([iaP, toP]);
    if (r) { const p = r.split('|'); if (p.length >= 3) return { acao: p[0].trim().toUpperCase(), subAcao: p[1].trim().toLowerCase(), mensagem: p.slice(2).join('|').trim() }; }
    return { acao: 'NAO', subAcao: 'ignorar', mensagem: '' };
  } catch (err) { return { acao: 'ERRO', subAcao: 'timeout', mensagem: '' }; }
}
async function convertOrderToCommand(ordem) {
  const ctx = gerarContextoIA();
  const prompt = `Converta esta ordem em um comando EXATO do bot. Responda APENAS o comando, sem texto adicional.\n\n${ctx}\n\nOrdem: "${ordem}"\n\nComandos disponiveis: !schedule, !fixar, !todos, !addlink, !addword, !delete, !ban, !abrgrupo, !fechargrupo, !mudarnome, !mutar, !desmutar`;
  const resposta = await callGeminiAPI(prompt);
  return resposta ? resposta.trim() : null;
}
function parseAndExecuteCommand(comandoTexto, sock, msg, remoteJid, sender, isGroup, isSenderAdmin, isSenderOwner, isBotAdminStatus) {
  if (!comandoTexto || !comandoTexto.startsWith(PREFIX)) return false;
  const args = comandoTexto.slice(PREFIX.length).trim().split(/ +/);
  const command = args.shift()?.toLowerCase();
  if (!command) return false;

  if (command === 'schedule' && isGroup) { if (!isSenderAdmin && !isSenderOwner) return false; const d = args[0], h = args[1], m = args.slice(2).join(' '); if (!d || !h || !m) return false; const [dd, mm, aa] = d.split('/'), [hh, mi] = h.split(':'); const dt = new Date(aa, mm - 1, dd, hh, mi); if (isNaN(dt.getTime())) return false; scheduledMessages.push({ id: Date.now().toString(), target: remoteJid, datetime: dt.toISOString(), message: m, sent: false }); setTimeout(async () => { try { await saveSchedules(); } catch (err) {} }, 100); return true; }
  if (command === 'fixar' && isGroup) { if (!isSenderAdmin && !isSenderOwner) return false; const o = args[0]?.toLowerCase(); if (o === 'off') { fixedMessage = null; setTimeout(async () => { try { await saveFixedMessage(); if (fixedMessageTimer) clearInterval(fixedMessageTimer); } catch (err) {} }, 100); return true; } const min = parseInt(args[0]), max = parseInt(args[1]); let t; if (!isNaN(min) && !isNaN(max)) { t = args.slice(2).join(' '); } else { t = args.join(' '); } if (!t) return false; fixedMessage = { text: t, active: true, setBy: sender, randomMin: !isNaN(min) ? min : 30, randomMax: !isNaN(max) ? max : 30 }; setTimeout(async () => { try { await saveFixedMessage(); startFixedMessage(sock); } catch (err) {} }, 100); return true; }
  if (command === 'todos' && isGroup) { if (!isSenderAdmin && !isSenderOwner) return false; const t = args.join(' ') || 'Atencao a todos!'; setTimeout(async () => { try { const m = await sock.groupMetadata(remoteJid); await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n       *TODOS*\n◞──────────────────◟\n${t}\n◝──────────────────◜`, mentions: m.participants.map(p => p.id) }); } catch (err) { await sock.sendMessage(remoteJid, { text: t }); } }, 500); return true; }
  if (command === 'delete' && isGroup) { if (!isSenderAdmin && !isSenderOwner) return false; const qm = msg.message?.extendedTextMessage?.contextInfo?.stanzaId, qs = msg.message?.extendedTextMessage?.contextInfo?.participant; if (!qm) return false; setTimeout(async () => { try { await sock.sendMessage(remoteJid, { delete: { remoteJid, id: qm, participant: qs } }); } catch (err) {} }, randomDelay(config.deleteCmdDelay.min, config.deleteCmdDelay.max)); return true; }
  if (command === 'ban' && isGroup) { if (!isSenderAdmin && !isSenderOwner) return false; const m = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || (msg.message?.extendedTextMessage?.contextInfo?.participant ? [msg.message?.extendedTextMessage?.contextInfo?.participant] : []); if (m.length > 0 && isBotAdminStatus) { setTimeout(async () => { try { await sock.groupParticipantsUpdate(remoteJid, m, 'remove'); } catch (err) {} }, 500); return true; } return false; }
  if (command === 'mutar' && isGroup) { if (!isSenderAdmin && !isSenderOwner) return false; const m = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || (msg.message?.extendedTextMessage?.contextInfo?.participant ? [msg.message?.extendedTextMessage?.contextInfo?.participant] : []); if (m.length > 0) { if (!mutedUsers[remoteJid]) mutedUsers[remoteJid] = []; for (const u of m) { if (!mutedUsers[remoteJid].includes(u)) { mutedUsers[remoteJid].push(u); setTimeout(async () => { try { mutedUsers[remoteJid] = mutedUsers[remoteJid].filter(x => x !== u); await saveMutedUsers(); } catch (err) {} }, config.silenciarTempo * 1000); } } setTimeout(async () => { try { await saveMutedUsers(); } catch (err) {} }, 100); return true; } return false; }
  if (command === 'desmutar' && isGroup) { if (!isSenderAdmin && !isSenderOwner) return false; const m = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || (msg.message?.extendedTextMessage?.contextInfo?.participant ? [msg.message?.extendedTextMessage?.contextInfo?.participant] : []); if (m.length > 0 && mutedUsers[remoteJid]) { mutedUsers[remoteJid] = mutedUsers[remoteJid].filter(u => !m.includes(u)); setTimeout(async () => { try { await saveMutedUsers(); } catch (err) {} }, 100); return true; } return false; }
  if (command === 'abrgrupo' && isGroup) { if (!isSenderAdmin && !isSenderOwner) return false; setTimeout(async () => { try { await sock.groupSettingUpdate(remoteJid, 'not_announcement'); } catch (err) {} }, 500); return true; }
  if (command === 'fechargrupo' && isGroup) { if (!isSenderAdmin && !isSenderOwner) return false; setTimeout(async () => { try { await sock.groupSettingUpdate(remoteJid, 'announcement'); } catch (err) {} }, 500); return true; }
  if (command === 'mudarnome' && isGroup) { if (!isSenderAdmin && !isSenderOwner) return false; const n = args.join(' '); if (!n) return false; setTimeout(async () => { try { await sock.groupUpdateSubject(remoteJid, n); } catch (err) {} }, 500); return true; }
  if (command === 'addlink') { if (!isSenderOwner) return false; const l = args[0]?.toLowerCase(); if (!l) return false; if (!allowedLinks.includes(l)) { allowedLinks.push(l); setTimeout(async () => { try { await saveLinks(); } catch (err) {} }, 100); } return true; }
  if (command === 'addword') { if (!isSenderOwner) return false; const w = args.join(' ').toLowerCase(); if (!w) return false; if (!bannedWords.includes(w)) { bannedWords.push(w); setTimeout(async () => { try { await saveWords(); } catch (err) {} }, 100); } return true; }
  return false;
}
async function forwardMessage(sock, msg, targetJid) {
  try {
    const messageType = Object.keys(msg.message)[0];
    if (messageType === 'conversation' || messageType === 'extendedTextMessage') { const text = msg.message.conversation || msg.message.extendedTextMessage?.text || ''; await sock.sendMessage(targetJid, { text: `📩 *Encaminhado via DOSO IA:*\n\n${text}` }); }
    else if (messageType === 'imageMessage') { await sock.sendMessage(targetJid, { image: msg.message.imageMessage, caption: `📸 *Encaminhado via DOSO IA*` }); }
    else if (messageType === 'videoMessage') { await sock.sendMessage(targetJid, { video: msg.message.videoMessage, caption: `🎬 *Encaminhado via DOSO IA*` }); }
    else if (messageType === 'documentMessage') { await sock.sendMessage(targetJid, { document: msg.message.documentMessage, fileName: msg.message.documentMessage.fileName || 'arquivo', caption: `📄 *Encaminhado via DOSO IA*` }); }
    else if (messageType === 'audioMessage') { await sock.sendMessage(targetJid, { audio: msg.message.audioMessage, ptt: msg.message.audioMessage.ptt || false }); }
    else if (messageType === 'stickerMessage') { await sock.sendMessage(targetJid, { sticker: msg.message.stickerMessage }); }
    else { await sock.sendMessage(targetJid, { forwardingScore: 999, ...msg.message }); }
    return true;
  } catch (err) { console.error('Erro ao encaminhar:', err.message); return false; }
}
async function sendAutoDeleteMessage(sock, remoteJid, text) {
  try {
    const sent = await sock.sendMessage(remoteJid, { text });
    if (sent && sent.key) {
      setTimeout(async () => {
        try { await sock.sendMessage(remoteJid, { delete: sent.key }); } catch (err) {}
      }, randomDelay(5000, 9000));
    }
  } catch (err) {}
}

// =================================================================
// FUNÇÃO PRINCIPAL DO BOT
// =================================================================
async function connectToWhatsApp() {
  // Carregar sessão existente
  let savedState = null;
  try {
    savedState = await getAuthStateFromRedis();
    console.log('[AUTH] Estado carregado:', savedState ? 'sim' : 'nao');
  } catch (err) {}

  let creds = savedState?.creds || {};
  let keys = savedState?.keys || {};
  let codeRequested = false;

  const { version } = await fetchLatestBaileysVersion();
  console.log('[AUTH] Versão Baileys:', version);
  
  const sock = makeWASocket({
    version,
    auth: {
      creds: creds,
      keys: makeCacheableSignalKeyStore(keys, logger)
    },
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false,
    browser: ['Linux', 'Chrome', '120.0.0.0'],
    markOnlineOnConnect: true,
    syncFullHistory: false,
    connectTimeoutMs: 60000,
  });

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect } = update;
    
    console.log('[AUTH] Estado:', connection);
    
// ... dentro do evento connection.update
if (connection === 'connecting' && !codeRequested && !creds.registered) {
  codeRequested = true;
  console.log('📱 Solicitando código de pareamento...');
  
  // ★★★ CORREÇÃO AQUI ★★★
  // Adicionamos uma pausa de 3 segundos para garantir que tudo esteja pronto
  await new Promise(resolve => setTimeout(resolve, 3000));
  // ★★★★★★★★★★★★★★★★★★★★
  
  try {
      const code = await sock.requestPairingCode(PHONE_NUMBER);
      console.log('═══════════════════════════════════════');
      console.log(`🔐 CÓDIGO DE PAREAMENTO: ${code}`);
      console.log('═══════════════════════════════════════');
  } catch (err) {
      console.error('❌ Erro ao gerar código:', err.message);
      codeRequested = false; // Permite tentar novamente na próxima reconexão
  }
}
    
    if (connection === 'open') {
      console.log('✅ BOT CONECTADO COM SUCESSO!');
      console.log(`📱 Conectado como: ${sock.user.id}`);
      checkScheduledMessages(sock);
      startFixedMessage(sock);
    }
    
    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      console.log(`[AUTH] Conexão fechada. Código: ${statusCode}`);
      
      if (statusCode === 401 || statusCode === 403) {
        console.log('[AUTH] Erro de autenticação, limpando sessão...');
        await deleteAuthStateFromRedis();
      }
      
      setTimeout(() => connectToWhatsApp().catch(console.error), 10000);
    }
  });

  sock.ev.on('creds.update', async (newCreds) => {
    creds = newCreds;
    await saveAuthStateToRedis({ creds, keys });
    console.log('[AUTH] Credenciais salvas no Redis');
  });
  
  sock.ev.on('group-participants.update', async (u) => {
    const { id, participants, action } = u;
    if (action === 'add' && iaMemory.welcomeMsg && iaMemory.ativo) {
      for (const user of participants) {
        if (user === sock.user.id) continue;
        await sock.sendMessage(id, {
          text: `◜──────────────────◝\n     *BEM-VINDO(A)*\n◞──────────────────◟\n${iaMemory.welcomeMsg.replace('{nome}', '@' + user.split('@')[0])}\n◝──────────────────◜`,
          mentions: [user]
        });
      }
    }
    if (action === 'add' && participants.includes(sock.user.id)) {
      if (!masterGroup) {
        masterGroup = id;
        authorizedGroups.push(id);
        await saveGroups();
        scheduleAutoMessage(sock, id);
        return;
      }
      if (!isGroupAuthorized(id)) {
        groupLeaveTimers[id] = setTimeout(async () => {
          if (!isGroupAuthorized(id)) await sock.groupLeave(id);
        }, 30000);
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
    const messageContent = msg.message.conversation || msg.message.extendedTextMessage?.text || msg.message.imageMessage?.caption || '';

    const isSenderOwner = isOwner(sender);
    const isSenderAdmin = isGroup ? await isGroupAdmin(sock, remoteJid, sender) : false;
    const isBotAdminStatus = isGroup ? await isBotAdmin(sock, remoteJid) : false;
    const safe = !isSenderOwner && !isSenderAdmin;

    // Bloquear privado de outras pessoas
    if (!isGroup && !isSenderOwner) {
      await sock.sendMessage(remoteJid, {
        text: `◜──────────────────◝\n       *AVISO*\n◞──────────────────◟\nNao tenho permissao para\nconversar no privado.\n\nFale com o adm:\nMr Doso - ${OWNER_CONTACT}\n◝──────────────────◜`
      });
      return;
    }

    if (isGroup && !config.botAtivo && !isSenderOwner) return;

    // ========== VERIFICAR MUTE (APAGA MAS NÃO INTERROMPE O FLUXO) ==========
    if (isGroup && mutedUsers[remoteJid]?.includes(sender) && safe) {
      setTimeout(async () => {
        try { await sock.sendMessage(remoteJid, { delete: { remoteJid, id: msg.key.id, participant: sender } }); } catch (err) {}
      }, randomDelay(2000, 4000));
      // CONTINUA O PROCESSAMENTO (não retorna)
    }

    // Anti-mídia
    if (isGroup && safe && isBotAdminStatus) {
      const mediaType = getMessageType(msg);
      if (mediaType && isMediaBlocked(mediaType)) {
        setTimeout(async () => {
          try { await sock.sendMessage(remoteJid, { delete: { remoteJid, id: msg.key.id, participant: sender } }); } catch (err) {}
        }, randomDelay(2000, 4000));
        await sock.sendMessage(remoteJid, {
          text: `◜──────────────────◝\n       *AVISO*\n◞──────────────────◟\n@${sender.split('@')[0]} ${mediaType} nao e permitido!\n◝──────────────────◜`,
          mentions: [sender]
        });
        return;
      }
    }

    // Anti-status
    if (isGroup && safe && config.antiStatus && isBotAdminStatus) {
      const msgTypes = Object.keys(msg.message || {});
      const isProtocolMsg = msgTypes.includes('protocolMessage');
      const text = (messageContent || '').trim();
      const isStatusText = text === '~' || text === 'status' || text.startsWith('~') || (text.length < 15 && (text.includes('status') || text.includes('~')));
      if (isProtocolMsg || isStatusText) {
        setTimeout(async () => { try { await sock.sendMessage(remoteJid, { delete: msg.key }); } catch (err) {} }, randomDelay(3000, 8000));
        return;
      }
    }

    // Anti-menção
    if (isGroup && safe && config.antiMencao && isBotAdminStatus) {
      const text = messageContent || '';
      const withoutMentions = text.replace(/@\d+/g, '').replace(/[\s\n\r]/g, '').trim();
      const onlyMention = withoutMentions === '' && text.includes('@');
      if (onlyMention) {
        setTimeout(async () => { try { await sock.sendMessage(remoteJid, { delete: msg.key }); } catch (err) {} }, randomDelay(3000, 8000));
        return;
      }
    }

    // Anti-APK / Anti-extensão
    if (isGroup && safe && config.antiApk && isBotAdminStatus && isApkFile(msg)) {
      setTimeout(async () => { try { await sock.sendMessage(remoteJid, { delete: { remoteJid, id: msg.key.id, participant: sender } }); } catch (err) {} }, randomDelay(3000, 8000));
      return;
    }
    if (isGroup && safe && isBotAdminStatus && containsBannedExtension(messageContent)) {
      setTimeout(async () => { try { await sock.sendMessage(remoteJid, { delete: { remoteJid, id: msg.key.id, participant: sender } }); } catch (err) {} }, randomDelay(3000, 8000));
      return;
    }

    if (!messageContent) return;

    // Anti-flood
    if (isGroup && safe && checkFlood(sender, remoteJid) && isBotAdminStatus) {
      setTimeout(async () => {
        try {
          await sock.groupParticipantsUpdate(remoteJid, [sender], 'remove');
          addToLog({ action: 'flood_ban', sender, group: remoteJid });
        } catch (err) {}
      }, randomDelay(2000, 5000));
      return;
    }

    // ========== ANTI-LINK COM CONTADOR (MESMO SILENCIADO) ==========
    if (isGroup && safe && config.antiLink && containsLink(messageContent) && !isLinkAllowed(messageContent) && isBotAdminStatus) {
      setTimeout(async () => {
        try { await sock.sendMessage(remoteJid, { delete: { remoteJid, id: msg.key.id, participant: sender } }); } catch (err) {}
      }, randomDelay(2000, 4000));

      const today = new Date().toDateString();
      const counterKey = `${remoteJid}:${sender}:${today}`;
      if (!linkCounters[counterKey]) linkCounters[counterKey] = { count: 0 };
      linkCounters[counterKey].count++;
      await saveLinkCounters();

      const linkCount = linkCounters[counterKey].count;

      if (linkCount >= config.limiteLinksAntesBan) {
        setTimeout(async () => {
          try {
            await sock.groupParticipantsUpdate(remoteJid, [sender], 'remove');
            await sock.sendMessage(remoteJid, { text: customMessages.removeMsg });
            delete linkCounters[counterKey];
            await saveLinkCounters();
            addToLog({ action: 'link_ban', sender, group: remoteJid });
          } catch (err) {}
        }, randomDelay(config.removeDelay.min, config.removeDelay.max));
      } else {
        if (!mutedUsers[remoteJid]) mutedUsers[remoteJid] = [];
        if (!mutedUsers[remoteJid].includes(sender)) {
          mutedUsers[remoteJid].push(sender);
          await saveMutedUsers();
          setTimeout(async () => {
            try {
              mutedUsers[remoteJid] = mutedUsers[remoteJid].filter(u => u !== sender);
              await saveMutedUsers();
            } catch (err) {}
          }, config.silenciarTempo * 1000);
        }
        await sock.sendMessage(remoteJid, {
          text: `◜──────────────────◝\n    *USUARIO SILENCIADO*\n◞──────────────────◟\n@${sender.split('@')[0]} link nao autorizado.\nSilenciado por 24h (${linkCount}/${config.limiteLinksAntesBan}).\n◝──────────────────◜`,
          mentions: [sender]
        });
        addToLog({ action: 'link_mute', sender, group: remoteJid, count: linkCount });
      }
      return;
    }

    // Anti-palavras
    if (isGroup && safe && config.antiWords && containsBannedWord(messageContent) && isBotAdminStatus) {
      setTimeout(async () => {
        try { await sock.sendMessage(remoteJid, { delete: { remoteJid, id: msg.key.id, participant: sender } }); } catch (err) {}
        await sock.sendMessage(remoteJid, { text: customMessages.wordWarning, mentions: [sender] });
      }, randomDelay(config.deleteDelay.min, config.deleteDelay.max));
      return;
    }

    // Moderação IA
    if (isGroup && safe && isBotAdminStatus && iaMemory.ativo && iaMemory.moderar) {
      const precisa = containsLink(messageContent) || containsBannedWord(messageContent) || needsIACheck(messageContent);
      if (precisa) {
        const iaR = await analyzeMessageWithIA(messageContent);
        if (iaR.acao === 'SIM') {
          if (iaR.subAcao === 'apagar') {
            setTimeout(async () => {
              try { await sock.sendMessage(remoteJid, { delete: { remoteJid, id: msg.key.id, participant: sender } }); } catch (err) {}
              await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n     *DOSO IA*\n◞──────────────────◟\n${iaR.mensagem || 'Mensagem removida.'}\n◝──────────────────◜`, mentions: [sender] });
            }, randomDelay(3000, 8000));
            return;
          }
          if (iaR.subAcao === 'banir') {
            setTimeout(async () => {
              try { await sock.groupParticipantsUpdate(remoteJid, [sender], 'remove'); } catch (err) {}
              await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n     *DOSO IA*\n◞──────────────────◟\n${iaR.mensagem || 'Usuario banido.'}\n◝──────────────────◜`, mentions: [sender] });
            }, randomDelay(config.removeDelay.min, config.removeDelay.max));
            return;
          }
        }
      }
    }

    if (!messageContent) return;

    // Ações pendentes do owner (escolha de grupo)
    if (!isGroup && isSenderOwner && pendingAction[sender]) {
      const escolha = parseInt(messageContent.trim());
      const grupos = authorizedGroups;
      if (!isNaN(escolha) && escolha >= 1 && escolha <= grupos.length) {
        const grupoEscolhido = grupos[escolha - 1];
        const acao = pendingAction[sender];

        if (acao.encaminhar) {
          try {
            await forwardMessage(sock, { key: { ...msg.key, id: acao.quotedMsgId }, message: msg.message }, grupoEscolhido);
            await sendAutoDeleteMessage(sock, remoteJid, `◜──────────────────◝\n       *OK*\n◞──────────────────◟\nEncaminhado para o grupo ${escolha}!\n◝──────────────────◜`);
          } catch (err) {
            await sendAutoDeleteMessage(sock, remoteJid, `◜──────────────────◝\n       *ERRO*\n◞──────────────────◟\nFalha ao encaminhar.\n◝──────────────────◜`);
          }
        } else {
          const fakeMsg = { ...msg, key: { ...msg.key, remoteJid: grupoEscolhido } };
          const executou = parseAndExecuteCommand(acao.comando, sock, fakeMsg, grupoEscolhido, sender, true, true, true, true);
          if (executou) {
            await sendAutoDeleteMessage(sock, remoteJid, `◜──────────────────◝\n       *DOSO IA*\n◞──────────────────◟\nComando executado no grupo ${escolha}!\n◝──────────────────◜`);
          } else {
            await sendAutoDeleteMessage(sock, remoteJid, `◜──────────────────◝\n       *ERRO*\n◞──────────────────◟\nFalha ao executar.\n◝──────────────────◜`);
          }
        }
        delete pendingAction[sender];
        return;
      } else {
        await sendAutoDeleteMessage(sock, remoteJid, `◜──────────────────◝\n       *ERRO*\n◞──────────────────◟\nNumero invalido (1-${grupos.length}).\n◝──────────────────◜`);
        return;
      }
    }

    // Dono envia ordem natural no privado
    if (!isGroup && isSenderOwner && !messageContent.startsWith(PREFIX)) {
      const ordem = messageContent.trim();
      const palavrasOrdem = ['agenda', 'agendar', 'agende', 'fixa', 'fixar', 'fixe', 'menciona', 'mencione', 'apaga', 'apague', 'delete', 'remove', 'remover', 'bane', 'banir', 'adiciona link', 'adiciona palavra', 'abre grupo', 'fecha grupo', 'muda nome', 'muta', 'desmuta'];
      const pareceOrdem = palavrasOrdem.some(p => ordem.toLowerCase().includes(p));
      if (pareceOrdem) {
        const comandoGerado = await convertOrderToCommand(ordem);
        if (comandoGerado) {
          const precisaGrupo = ['schedule', 'fixar', 'todos', 'ban', 'delete', 'abrgrupo', 'fechargrupo', 'mudarnome', 'mutar', 'desmutar'].some(c => comandoGerado.toLowerCase().includes(c));
          if (precisaGrupo) {
            const grupos = authorizedGroups;
            if (grupos.length === 0) {
              await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n       *ERRO*\n◞──────────────────◟\nNenhum grupo autorizado!\n◝──────────────────◜` });
              return;
            }
            if (grupos.length === 1) {
              const executou = parseAndExecuteCommand(comandoGerado, sock, msg, grupos[0], sender, true, true, true, true);
              if (executou) { await sendAutoDeleteMessage(sock, remoteJid, `◜──────────────────◝\n       *DOSO IA*\n◞──────────────────◟\nExecutado no unico grupo!\n◝──────────────────◜`); }
              return;
            }
            let lista = `◜──────────────────◝\n   *ESCOLHA O GRUPO*\n◞──────────────────◟\n`;
            grupos.forEach((g, i) => { lista += `${i+1}. ${g.split('@')[0]}\n`; });
            lista += `\nResponda com o numero.\n◝──────────────────◜`;
            pendingAction[sender] = { comando: comandoGerado, encaminhar: false };
            await sock.sendMessage(remoteJid, { text: lista });
            return;
          } else {
            const executou = parseAndExecuteCommand(comandoGerado, sock, msg, remoteJid, sender, false, false, true, false);
            if (executou) { await sendAutoDeleteMessage(sock, remoteJid, `◜──────────────────◝\n       *DOSO IA*\n◞──────────────────◟\nComando executado!\n◝──────────────────◜`); }
            return;
          }
        }
      }
    }

    // Ordem natural no grupo (admin/dono)
    if (isGroup && (isSenderOwner || isSenderAdmin) && !messageContent.startsWith(PREFIX)) {
      const ordem = messageContent.trim();
      const palavrasOrdem = ['agenda', 'agendar', 'agende', 'fixa', 'fixar', 'fixe', 'menciona', 'mencione', 'apaga', 'apague', 'delete', 'remove', 'remover', 'bane', 'banir', 'abre', 'fecha', 'muda nome', 'muta', 'desmuta', 'encaminha', 'reenvia'];
      const pareceOrdem = palavrasOrdem.some(p => ordem.toLowerCase().includes(p));
      if (pareceOrdem) {
        const quotedMsgId = msg.message?.extendedTextMessage?.contextInfo?.stanzaId;
        const quotedSender = msg.message?.extendedTextMessage?.contextInfo?.participant;

        if (quotedSender && (ordem.toLowerCase().includes('bane') || ordem.toLowerCase().includes('banir') || ordem.toLowerCase().includes('muta') || ordem.toLowerCase().includes('silencia'))) {
          const isBan = ordem.toLowerCase().includes('bane') || ordem.toLowerCase().includes('banir');
          if (isBan && isBotAdminStatus) {
            setTimeout(async () => { try { await sock.groupParticipantsUpdate(remoteJid, [quotedSender], 'remove'); } catch (err) {} }, 500);
            await sendAutoDeleteMessage(sock, remoteJid, `◜──────────────────◝\n       *OK*\n◞──────────────────◟\nUsuario banido!\n◝──────────────────◜`);
            return;
          } else if (!isBan) {
            if (!mutedUsers[remoteJid]) mutedUsers[remoteJid] = [];
            if (!mutedUsers[remoteJid].includes(quotedSender)) {
              mutedUsers[remoteJid].push(quotedSender);
              await saveMutedUsers();
              setTimeout(async () => { try { mutedUsers[remoteJid] = mutedUsers[remoteJid].filter(u => u !== quotedSender); await saveMutedUsers(); } catch (err) {} }, config.silenciarTempo * 1000);
            }
            await sendAutoDeleteMessage(sock, remoteJid, `◜──────────────────◝\n       *OK*\n◞──────────────────◟\nUsuario silenciado por 24h!\n◝──────────────────◜`);
            return;
          }
        }

        if (quotedMsgId && (ordem.toLowerCase().includes('encaminha') || ordem.toLowerCase().includes('reenvia') || ordem.toLowerCase().includes('envia'))) {
          const grupos = authorizedGroups.filter(g => g !== remoteJid);
          if (grupos.length === 0) {
            await sendAutoDeleteMessage(sock, remoteJid, `◜──────────────────◝\n       *ERRO*\n◞──────────────────◟\nNenhum outro grupo!\n◝──────────────────◜`);
            return;
          }
          if (grupos.length === 1) {
            try {
              await forwardMessage(sock, { key: { ...msg.key, id: quotedMsgId }, message: msg.message }, grupos[0]);
              await sendAutoDeleteMessage(sock, remoteJid, `◜──────────────────◝\n       *OK*\n◞──────────────────◟\nEncaminhado!\n◝──────────────────◜`);
            } catch (err) {}
            return;
          }
          let lista = `◜──────────────────◝\n  *ENCAMINHAR PARA*\n◞──────────────────◟\n`;
          grupos.forEach((g, i) => { lista += `${i+1}. ${g.split('@')[0]}\n`; });
          lista += `\nResponda com o numero.\n◝──────────────────◜`;
          pendingAction[sender] = { encaminhar: true, quotedMsgId, grupos };
          await sock.sendMessage(remoteJid, { text: lista, mentions: [sender] });
          return;
        }

        const comandoGerado = await convertOrderToCommand(ordem);
        if (comandoGerado) {
          const executou = parseAndExecuteCommand(comandoGerado, sock, msg, remoteJid, sender, true, isSenderAdmin, isSenderOwner, isBotAdminStatus);
          if (executou) { await sendAutoDeleteMessage(sock, remoteJid, `◜──────────────────◝\n       *DOSO IA*\n◞──────────────────◟\nComando executado!\n◝──────────────────◜`); return; }
        }
      }
    }

    // ========== RESPOSTAS AUTOMÁTICAS (GATILHOS) ==========
    const respostaAuto = matchAutoResponse(messageContent);
    if (respostaAuto) {
      await sock.sendMessage(remoteJid, { text: respostaAuto }, { quoted: msg });
      return;
    }

    const pf = groupPrefixes[remoteJid] || PREFIX;
    const args = messageContent.startsWith(pf) ? messageContent.slice(pf.length).trim().split(/ +/) : [];
    const command = args.shift()?.toLowerCase();

    if (!command) {
      if (iaMemory.ativo && iaMemory.responder && isGroup && isGroupAuthorized(remoteJid)) {
        const t = messageContent.toLowerCase().trim();
        if (['como', 'quem', 'onde', 'quando', 'porque', 'qual', '?'].some(p => t.includes(p))) {
          const r = await askIAWithCache(messageContent);
          if (r) {
            setTimeout(async () => {
              await sock.sendMessage(remoteJid, {
                text: `◜──────────────────◝\n       *DOSO IA*\n◞──────────────────◟\n${r}\n◝──────────────────◜`,
                mentions: [sender]
              }, { quoted: msg });
            }, randomDelay(2000, 4000));
          }
        }
      }
      return;
    }

    // ========== COMANDOS ==========
    if (command === 'delete' && isGroup) {
      if (!isSenderAdmin && !isSenderOwner) return;
      const qm = msg.message?.extendedTextMessage?.contextInfo?.stanzaId;
      const qs = msg.message?.extendedTextMessage?.contextInfo?.participant;
      if (!qm) return;
      setTimeout(async () => {
        try {
          await sock.sendMessage(remoteJid, { delete: { remoteJid, id: qm, participant: qs } });
          if (qs) { await sock.sendMessage(remoteJid, { text: `Mensagem de @${qs.split('@')[0]} apagada!`, mentions: [qs] }); }
        } catch (err) {}
      }, randomDelay(config.deleteCmdDelay.min, config.deleteCmdDelay.max));
      return;
    }

    if (command === 'todos' && isGroup) {
      if (!isSenderAdmin && !isSenderOwner) return;
      const t = args.join(' ') || 'Atencao a todos!';
      try {
        const m = await sock.groupMetadata(remoteJid);
        await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n       *TODOS*\n◞──────────────────◟\n${t}\n◝──────────────────◜`, mentions: m.participants.map(p => p.id) });
      } catch (err) {
        await sock.sendMessage(remoteJid, { text: t });
      }
      return;
    }

    if (command === 'abrgrupo' && isGroup) {
      if (!isSenderAdmin && !isSenderOwner) { await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n       *NEGADO*\n◞──────────────────◟\nApenas administradores!\n◝──────────────────◜` }); return; }
      try { await sock.groupSettingUpdate(remoteJid, 'not_announcement'); await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n       *OK*\n◞──────────────────◟\nGrupo ABERTO!\n◝──────────────────◜` }); } catch (err) {}
      return;
    }

    if (command === 'fechargrupo' && isGroup) {
      if (!isSenderAdmin && !isSenderOwner) { await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n       *NEGADO*\n◞──────────────────◟\nApenas administradores!\n◝──────────────────◜` }); return; }
      try { await sock.groupSettingUpdate(remoteJid, 'announcement'); await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n       *OK*\n◞──────────────────◟\nGrupo FECHADO!\n◝──────────────────◜` }); } catch (err) {}
      return;
    }

    if (command === 'mudarnome' && isGroup) {
      if (!isSenderAdmin && !isSenderOwner) { await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n       *NEGADO*\n◞──────────────────◟\nApenas administradores!\n◝──────────────────◜` }); return; }
      const nn = args.join(' ');
      if (!nn) { await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n       *USO*\n◞──────────────────◟\n!mudarnome [novo nome]\n◝──────────────────◜` }); return; }
      try { await sock.groupUpdateSubject(remoteJid, nn); await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n       *OK*\n◞──────────────────◟\nNome alterado!\n◝──────────────────◜` }); } catch (err) {}
      return;
    }

    if (command === 'linkgrupo' && isGroup) {
      if (!isSenderAdmin && !isSenderOwner) { await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n       *NEGADO*\n◞──────────────────◟\nApenas administradores!\n◝──────────────────◜` }); return; }
      try {
        const code = await sock.groupInviteCode(remoteJid);
        await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n    *LINK DO GRUPO*\n◞──────────────────◟\nhttps://chat.whatsapp.com/${code}\n◝──────────────────◜` });
      } catch (err) {}
      return;
    }

    if (command === 'idgrupo' && isGroup) {
      await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n     *ID DO GRUPO*\n◞──────────────────◟\n${remoteJid}\n◝──────────────────◜` });
      return;
    }

    if (command === 'mutar' && isGroup) {
      if (!isSenderAdmin && !isSenderOwner) { await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n       *NEGADO*\n◞──────────────────◟\nApenas administradores!\n◝──────────────────◜` }); return; }
      const mm = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || (msg.message?.extendedTextMessage?.contextInfo?.participant ? [msg.message?.extendedTextMessage?.contextInfo?.participant] : []);
      if (mm.length === 0) { await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n       *USO*\n◞──────────────────◟\n!mutar @usuario ou responda\numa mensagem com !mutar\n◝──────────────────◜` }); return; }
      if (!mutedUsers[remoteJid]) mutedUsers[remoteJid] = [];
      for (const u of mm) {
        if (!mutedUsers[remoteJid].includes(u)) {
          mutedUsers[remoteJid].push(u);
          setTimeout(async () => { try { mutedUsers[remoteJid] = mutedUsers[remoteJid].filter(x => x !== u); await saveMutedUsers(); } catch (err) {} }, config.silenciarTempo * 1000);
        }
      }
      await saveMutedUsers();
      await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n       *OK*\n◞──────────────────◟\nUsuario(s) silenciado(s) por 24h!\n◝──────────────────◜` });
      return;
    }

    if (command === 'desmutar' && isGroup) {
      if (!isSenderAdmin && !isSenderOwner) { await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n       *NEGADO*\n◞──────────────────◟\nApenas administradores!\n◝──────────────────◜` }); return; }
      const dm = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || (msg.message?.extendedTextMessage?.contextInfo?.participant ? [msg.message?.extendedTextMessage?.contextInfo?.participant] : []);
      if (dm.length === 0) { await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n       *USO*\n◞──────────────────◟\n!desmutar @usuario\n◝──────────────────◜` }); return; }
      if (mutedUsers[remoteJid]) { mutedUsers[remoteJid] = mutedUsers[remoteJid].filter(u => !dm.includes(u)); await saveMutedUsers(); }
      await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n       *OK*\n◞──────────────────◟\nUsuario(s) desilenciado(s)!\n◝──────────────────◜` });
      return;
    }

    if (command === 'menu') {
      let m = `◜──────────────────◝\n  *MENU DO BOT - MR DOSO*\n◞──────────────────◟\n!menu      →  Ver este menu\n!info      →  Informacoes\n!dono      →  Ver dono do bot\n!bot       →  Sobre o bot\n!regras    →  Regras do grupo\n!ping      →  Testar bot\n!links     →  Links permitidos\n!advertencias → Ver advertencias\n!lembrete [min] [msg]`;
      for (const c of customCommands.filter(c => c.public)) m += `\n!${c.name.padEnd(10)} →  ${c.response.substring(0, 15)}`;
      m += `\n◝──────────────────◜`;
      await sock.sendMessage(remoteJid, { text: m });
      return;
    }

    if (command === 'info') {
      if (isGroup) {
        try {
          const m = await sock.groupMetadata(remoteJid);
          const a = m.participants.filter(p => p.admin);
          await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n  *INFORMACOES DO GRUPO*\n◞──────────────────◟\nNome: ${m.subject}\nMembros: ${m.participants.length}\nAdmins: ${a.length}\nSua posicao: ${isSenderAdmin ? 'Admin' : 'Membro'}\nAnti-Link: ${config.antiLink ? 'Ativado' : 'Desativado'}\n◝──────────────────◜` });
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
    if (command === 'links') { const l = allowedLinks.length > 0 ? allowedLinks.join('\n') : 'Nenhum'; await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n   *LINKS PERMITIDOS*\n◞──────────────────◟\n${l}\n◝──────────────────◜` }); return; }
    if (command === 'advertencias') { const wk = `${remoteJid}:${sender}`; const uw = warnings[wk]?.count || 0; await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n    *SUAS ADVERTENCIAS*\n◞──────────────────◟\n${uw} de ${config.maxWarnings}\nRestam: ${config.maxWarnings - uw}\n◝──────────────────◜` }); return; }

    const cc = customCommands.find(c => c.name === command);
    if (cc) { await sock.sendMessage(remoteJid, { text: cc.response }); return; }

    if (command === 'lembrete') {
      const min = parseInt(args[0]), mens = args.slice(1).join(' ');
      if (isNaN(min) || !mens) { await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n       *USO*\n◞──────────────────◟\n!lembrete [minutos] [mensagem]\n◝──────────────────◜` }); return; }
      if (containsLink(mens)) { await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n       *ERRO*\n◞──────────────────◟\nNao e permitido links!\n◝──────────────────◜` }); return; }
      if (!isSenderAdmin && !isSenderOwner) { const td = new Date().toDateString(); if (!dailyReminders[td]) dailyReminders[td] = []; if (dailyReminders[td].length >= 3) { await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n       *LIMITE*\n◞──────────────────◟\n3 lembretes/dia atingido!\n◝──────────────────◜` }); return; } dailyReminders[td].push(sender); }
      setTimeout(async () => { await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n       *LEMBRETE*\n◞──────────────────◟\n@${sender.split('@')[0]}: ${mens}\n◝──────────────────◜`, mentions: [sender] }); }, min * 60000);
      await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n       *OK*\n◞──────────────────◟\nLembrete em ${min} min!\n◝──────────────────◜` });
      return;
    }

    if (command === 'fixar' && isGroup) {
      if (!isSenderAdmin && !isSenderOwner) { await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n       *NEGADO*\n◞──────────────────◟\nApenas administradores!\n◝──────────────────◜` }); return; }
      const o = args[0]?.toLowerCase();
      if (o === 'off') { fixedMessage = null; await saveFixedMessage(); if (fixedMessageTimer) clearInterval(fixedMessageTimer); await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n       *OK*\n◞──────────────────◟\nMensagem fixada removida!\n◝──────────────────◜` }); }
      else {
        const min = parseInt(args[0]), max = parseInt(args[1]); let t;
        if (!isNaN(min) && !isNaN(max)) { t = args.slice(2).join(' '); } else { t = args.join(' '); }
        if (!t) { if (fixedMessage && fixedMessage.active) { await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n   *MENSAGEM FIXADA*\n◞──────────────────◟\n"${fixedMessage.text}"\nIntervalo: ${fixedMessage.randomMin || 30}-${fixedMessage.randomMax || 30} min\nRemover: !fixar off\n◝──────────────────◜` }); } else { await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n       *USO*\n◞──────────────────◟\n!fixar [min] [max] [msg]\n!fixar off\n◝──────────────────◜` }); } return; }
        fixedMessage = { text: t, active: true, setBy: sender, randomMin: !isNaN(min) ? min : 30, randomMax: !isNaN(max) ? max : 30 };
        await saveFixedMessage(); startFixedMessage(sock);
        await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n       *OK*\n◞──────────────────◟\nMensagem fixada!\nIntervalo: ${fixedMessage.randomMin}-${fixedMessage.randomMax} min\n\n"${t}"\n◝──────────────────◜` });
      }
      return;
    }

    if (!isSenderOwner) return;

    // ========== COMANDOS DO OWNER ==========
    if (command === 'chat') { const r = await askIAWithCache(args.join(' ')); await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n       *DOSO IA*\n◞──────────────────◟\n${r || 'Nao consegui responder.'}\n◝──────────────────◜` }); return; }
    if (command === 'ia' && args[0] === 'testar') { const t = await callGeminiAPI('Responda: DOSO IA funcionando!'); await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n     *TESTE IA*\n◞──────────────────◟\n${t || '❌ Falhou'}\n◝──────────────────◜` }); return; }
    if (command === 'saldo') { const hoje = new Date().toDateString(); if (apiUsage.lastReset !== hoje) { apiUsage = { requests: 0, lastReset: hoje }; } const maxReq = 1500 * GEMINI_KEYS.length; const restante = maxReq - apiUsage.requests; await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n     *SALDO API*\n◞──────────────────◟\nUsadas hoje: ${apiUsage.requests}\nRestantes: ${restante}\nLimite: ${maxReq}\nChaves: ${GEMINI_KEYS.length}\n◝──────────────────◜` }); return; }
    if (command === 'status') { const s = `◜──────────────────◝\n     *STATUS DO BOT*\n◞──────────────────◟\nOnline: Sim\nDono: ${OWNER_DISPLAY}\nGrupos: ${authorizedGroups.length}\nLinks: ${allowedLinks.length}\nPalavras: ${bannedWords.length}\nIA DOSO: ${iaMemory.ativo ? 'ON' : 'OFF'}\nAnti-Link: ${config.antiLink ? 'ON' : 'OFF'}\nAnti-Palavras: ${config.antiWords ? 'ON' : 'OFF'}\nAnti-Flood: ${config.antiFlood ? 'ON' : 'OFF'}\nLimite Links p/ Ban: ${config.limiteLinksAntesBan}\n◝──────────────────◜`; await sock.sendMessage(remoteJid, { text: s }); return; }
    if (command === 'owner' || command === 'comandos') { const o = `◜──────────────────◝\n   *COMANDOS DO OWNER*\n◞──────────────────◟\n*GERENCIAMENTO*\n!status → Status completo\n!recache → Recarregar Redis\n!chat [msg] → Conversar com IA\n!ia testar → Testar IA\n!saldo → Ver uso da API\n!boto on/off → Ligar/desligar bot\n!ia limite [N] → Max caracteres IA\n*ENSINAR BOT*\n!ensinar [t] | [r]\n!addlink [dominio]\n!dellink [dominio]\n!addword [palavra]\n!delword [palavra]\n*GRUPOS*\n!authgroup\n!listgroups\n!setmaster\n!abrgrupo / !fechargrupo\n!mudarnome [nome]\n!linkgrupo / !idgrupo\n!mutar @user / !desmutar @user\n*MODERACAO*\n!resetwarnings [user]\n!apagar [responder msg]\n!antiaudio on/off\n!antiimagem on/off\n!antivideo on/off\n!antisticker on/off\n!setlinksban [N] → Limite p/ ban\n*CONFIG IA*\n!ia on/off\n!ia moderar on/off\n!ia tom curto/normal\nDono: ${OWNER_DISPLAY}\n◝──────────────────◜`; await sock.sendMessage(remoteJid, { text: o }); return; }
    if (command === 'log') { if (actionLog.length === 0) { await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n       *LOG*\n◞──────────────────◟\nNenhuma acao.\n◝──────────────────◜` }); } else { const l = actionLog.slice(-10).reverse().map((a, i) => `${i+1}. ${a.action} - ${a.sender?.split('@')[0] || 'N/A'} - ${new Date(a.time).toLocaleString('pt-BR')}`).join('\n'); await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n    *ULTIMAS ACOES*\n◞──────────────────◟\n${l}\n◝──────────────────◜` }); } return; }
    if (command === 'ensinar') { const fa = args.join(' '), p = fa.split('|'); if (p.length < 2) { await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n       *USO*\n◞──────────────────◟\n!ensinar [topico] | [resposta]\n!ensinar palavra [p]\n!ensinar link [d]\n!ensinar regra [r]\n◝──────────────────◜` }); return; } const tipo = p[0].trim().toLowerCase(), valor = p.slice(1).join('|').trim(); if (tipo === 'palavra') { iaMemory.palavras.push(valor); bannedWords.push(valor); await saveWords(); } else if (tipo === 'link') { iaMemory.links.push(valor); allowedLinks.push(valor); await saveLinks(); } else if (tipo === 'regra') { iaMemory.regras.push(valor); } else { iaMemory.conhecimentos[tipo] = valor; } await saveIAMemory(); await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n       *OK*\n◞──────────────────◟\nAprendido: ${tipo}\n◝──────────────────◜` }); return; }

    if (command === 'ia') { const o = args[0]?.toLowerCase();
      if (o === 'on') { iaMemory.ativo = true; await saveIAMemory(); await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n       *OK*\n◞──────────────────◟\nIA ATIVADA!\n◝──────────────────◜` }); return; }
      if (o === 'off') { iaMemory.ativo = false; await saveIAMemory(); await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n       *OK*\n◞──────────────────◟\nIA DESATIVADA!\n◝──────────────────◜` }); return; }
      if (o === 'moderar') { const s = args[1]?.toLowerCase(); iaMemory.moderar = s === 'on'; await saveIAMemory(); await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n       *OK*\n◞──────────────────◟\nModeracao ${iaMemory.moderar ? 'ON' : 'OFF'}\n◝──────────────────◜` }); return; }
      if (o === 'responder') { const s = args[1]?.toLowerCase(); iaMemory.responder = s === 'on'; await saveIAMemory(); await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n       *OK*\n◞──────────────────◟\nRespostas ${iaMemory.responder ? 'ON' : 'OFF'}\n◝──────────────────◜` }); return; }
      if (o === 'tom') { const t = args[1]?.toLowerCase(); if (t === 'curto' || t === 'normal') { iaMemory.tom = t; await saveIAMemory(); await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n       *OK*\n◞──────────────────◟\nTom: ${t}\n◝──────────────────◜` }); } return; }
      if (o === 'limite') { const n = parseInt(args[1]); if (isNaN(n) || n < 50) { await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n   *LIMITE IA ATUAL*\n◞──────────────────◟\n${iaMemory.maxCaracteres} caracteres\nUso: !ia limite [50-1000]\n◝──────────────────◜` }); return; } iaMemory.maxCaracteres = Math.min(n, 1000); await saveIAMemory(); await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n       *OK*\n◞──────────────────◟\nLimite: ${iaMemory.maxCaracteres} caracteres\n◝──────────────────◜` }); return; }
      if (o === 'ban' && isGroup) { const m = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || []; if (m.length > 0 && isBotAdminStatus) { await sock.groupParticipantsUpdate(remoteJid, m, 'remove'); await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n       *BAN*\n◞──────────────────◟\nUsuario removido!\n◝──────────────────◜` }); } return; }
      if (o === 'memoria') { const mm = `◜──────────────────◝\n     *MEMORIA IA*\n◞──────────────────◟\nAtivo: ${iaMemory.ativo ? 'Sim' : 'Nao'}\nModerar: ${iaMemory.moderar ? 'Sim' : 'Nao'}\nConhecimentos: ${Object.keys(iaMemory.conhecimentos).length}\nPalavras: ${iaMemory.palavras.length}\nLinks: ${iaMemory.links.length}\nRegras: ${iaMemory.regras.length}\nLimite: ${iaMemory.maxCaracteres} carac.\n◝──────────────────◜`; await sock.sendMessage(remoteJid, { text: mm }); return; }
      if (o === 'reset') { iaMemory.conhecimentos = {}; await saveIAMemory(); await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n       *OK*\n◞──────────────────◟\nMemoria resetada!\n◝──────────────────◜` }); return; }
      const si = `◜──────────────────◝\n     *STATUS IA*\n◞──────────────────◟\nAtivo: ${iaMemory.ativo ? 'ON' : 'OFF'}\nModerar: ${iaMemory.moderar ? 'ON' : 'OFF'}\nResponder: ${iaMemory.responder ? 'ON' : 'OFF'}\nTom: ${iaMemory.tom}\nLimite: ${iaMemory.maxCaracteres} carac.\nConhecimentos: ${Object.keys(iaMemory.conhecimentos).length}\n◝──────────────────◜`; await sock.sendMessage(remoteJid, { text: si }); return; }

    if (command === 'boto') { const o = args[0]?.toLowerCase(); if (o === 'on') { config.botAtivo = true; await saveConfig(); await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n       *OK*\n◞──────────────────◟\nBot ATIVADO no grupo!\n◝──────────────────◜` }); return; } if (o === 'off') { config.botAtivo = false; await saveConfig(); await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n       *OK*\n◞──────────────────◟\nBot DESATIVADO no grupo!\n◝──────────────────◜` }); return; } await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n       *USO*\n◞──────────────────◟\n!boto on/off\n◝──────────────────◜` }); return; }
    if (command === 'setlinksban') { const n = parseInt(args[0]); if (isNaN(n) || n < 1) { await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n *LIMITE LINKS ATUAL*\n◞──────────────────◟\n${config.limiteLinksAntesBan} links = ban\nUso: !setlinksban [numero]\n◝──────────────────◜` }); return; } config.limiteLinksAntesBan = n; await saveConfig(); await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n       *OK*\n◞──────────────────◟\nLimite: ${n} links = ban\n◝──────────────────◜` }); return; }
    if (command === 'antiaudio') { const o = args[0]?.toLowerCase(); if (o === 'on') { config.antiAudio = true; await saveConfig(); await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n       *OK*\n◞──────────────────◟\nAnti-Audio ON!\n◝──────────────────◜` }); } else if (o === 'off') { config.antiAudio = false; await saveConfig(); await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n       *OK*\n◞──────────────────◟\nAnti-Audio OFF!\n◝──────────────────◜` }); } else { await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n   *ANTI-AUDIO*\n◞──────────────────◟\nStatus: ${config.antiAudio ? 'ON' : 'OFF'}\n◝──────────────────◜` }); } return; }
    if (command === 'antidocumento') { const o = args[0]?.toLowerCase(); if (o === 'on') { config.antiDocumento = true; await saveConfig(); await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n       *OK*\n◞──────────────────◟\nAnti-Documento ON!\n◝──────────────────◜` }); } else if (o === 'off') { config.antiDocumento = false; await saveConfig(); await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n       *OK*\n◞──────────────────◟\nAnti-Documento OFF!\n◝──────────────────◜` }); } else { await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n *ANTI-DOCUMENTO*\n◞──────────────────◟\nStatus: ${config.antiDocumento ? 'ON' : 'OFF'}\n◝──────────────────◜` }); } return; }
    if (command === 'antiimagem') { const o = args[0]?.toLowerCase(); if (o === 'on') { config.antiImagem = true; await saveConfig(); await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n       *OK*\n◞──────────────────◟\nAnti-Imagem ON!\n◝──────────────────◜` }); } else if (o === 'off') { config.antiImagem = false; await saveConfig(); await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n       *OK*\n◞──────────────────◟\nAnti-Imagem OFF!\n◝──────────────────◜` }); } else { await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n  *ANTI-IMAGEM*\n◞──────────────────◟\nStatus: ${config.antiImagem ? 'ON' : 'OFF'}\n◝──────────────────◜` }); } return; }
    if (command === 'antivideo') { const o = args[0]?.toLowerCase(); if (o === 'on') { config.antiVideo = true; await saveConfig(); await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n       *OK*\n◞──────────────────◟\nAnti-Video ON!\n◝──────────────────◜` }); } else if (o === 'off') { config.antiVideo = false; await saveConfig(); await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n       *OK*\n◞──────────────────◟\nAnti-Video OFF!\n◝──────────────────◜` }); } else { await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n   *ANTI-VIDEO*\n◞──────────────────◟\nStatus: ${config.antiVideo ? 'ON' : 'OFF'}\n◝──────────────────◜` }); } return; }
    if (command === 'antisticker') { const o = args[0]?.toLowerCase(); if (o === 'on') { config.antiSticker = true; await saveConfig(); await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n       *OK*\n◞──────────────────◟\nAnti-Sticker ON!\n◝──────────────────◜` }); } else if (o === 'off') { config.antiSticker = false; await saveConfig(); await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n       *OK*\n◞──────────────────◟\nAnti-Sticker OFF!\n◝──────────────────◜` }); } else { await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n  *ANTI-STICKER*\n◞──────────────────◟\nStatus: ${config.antiSticker ? 'ON' : 'OFF'}\n◝──────────────────◜` }); } return; }
    if (command === 'addlink') { const l = args[0]?.toLowerCase(); if (!l) { await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n       *USO*\n◞──────────────────◟\n!addlink [dominio]\n◝──────────────────◜` }); return; } if (!allowedLinks.includes(l)) { allowedLinks.push(l); await saveLinks(); await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n       *OK*\n◞──────────────────◟\nLink "${l}" permitido!\n◝──────────────────◜` }); } else { await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n       *AVISO*\n◞──────────────────◟\nLink ja existe!\n◝──────────────────◜` }); } return; }
    if (command === 'dellink') { const l = args[0]?.toLowerCase(), i = allowedLinks.indexOf(l); if (i > -1) { allowedLinks.splice(i, 1); await saveLinks(); await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n       *OK*\n◞──────────────────◟\nLink "${l}" removido!\n◝──────────────────◜` }); } else { await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n       *ERRO*\n◞──────────────────◟\nLink nao encontrado!\n◝──────────────────◜` }); } return; }
    if (command === 'addword') { const w = args.join(' ').toLowerCase(); if (!w) { await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n       *USO*\n◞──────────────────◟\n!addword [palavra]\n◝──────────────────◜` }); return; } if (!bannedWords.includes(w)) { bannedWords.push(w); await saveWords(); await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n       *OK*\n◞──────────────────◟\nPalavra "${w}" banida!\n◝──────────────────◜` }); } else { await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n       *AVISO*\n◞──────────────────◟\nPalavra ja existe!\n◝──────────────────◜` }); } return; }
    if (command === 'delword') { const w = args.join(' ').toLowerCase(), i = bannedWords.indexOf(w); if (i > -1) { bannedWords.splice(i, 1); await saveWords(); await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n       *OK*\n◞──────────────────◟\nPalavra "${w}" removida!\n◝──────────────────◜` }); } else { await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n       *ERRO*\n◞──────────────────◟\nPalavra nao encontrada!\n◝──────────────────◜` }); } return; }
    if (command === 'addextensao') { const e = args[0]?.toLowerCase().replace('.', ''); if (!e) { await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n       *USO*\n◞──────────────────◟\n!addextensao [ext]\n◝──────────────────◜` }); return; } if (!bannedExtensions.includes(e)) { bannedExtensions.push(e); await saveExtensions(); await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n       *OK*\n◞──────────────────◟\nExtensao ".${e}" banida!\n◝──────────────────◜` }); } else { await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n       *AVISO*\n◞──────────────────◟\nExtensao ja existe!\n◝──────────────────◜` }); } return; }
    if (command === 'delextensao') { const e = args[0]?.toLowerCase().replace('.', ''), i = bannedExtensions.indexOf(e); if (i > -1) { bannedExtensions.splice(i, 1); await saveExtensions(); await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n       *OK*\n◞──────────────────◟\nExtensao ".${e}" removida!\n◝──────────────────◜` }); } else { await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n       *ERRO*\n◞──────────────────◟\nExtensao nao encontrada!\n◝──────────────────◜` }); } return; }
    if (command === 'addresposta') { const fa = args.join(' '), p = fa.split('|'); if (p.length < 2) { await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n       *USO*\n◞──────────────────◟\n!addresposta [palavras] | [resposta]\n◝──────────────────◜` }); return; } autoResponses.push({ trigger: p[0].trim().toLowerCase(), reply: p.slice(1).join('|').trim() }); await saveAutoResponses(); await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n       *OK*\n◞──────────────────◟\nResposta adicionada!\n◝──────────────────◜` }); return; }
    if (command === 'delresposta') { const i = parseInt(args[0]) - 1; if (isNaN(i) || i < 0 || i >= autoResponses.length) { await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n       *USO*\n◞──────────────────◟\n!delresposta [numero]\n◝──────────────────◜` }); return; } autoResponses.splice(i, 1); await saveAutoResponses(); await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n       *OK*\n◞──────────────────◟\nResposta removida!\n◝──────────────────◜` }); return; }
    if (command === 'addcomando') { const fa = args.join(' '), p = fa.split('|'); if (p.length < 2) { await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n       *USO*\n◞──────────────────◟\n!addcomando [nome] | [resposta] | [publico]\n◝──────────────────◜` }); return; } const n = p[0].trim().toLowerCase(), r = p[1].trim(), pb = p[2]?.trim().toLowerCase() === 'publico'; const ex = customCommands.findIndex(c => c.name === n); if (ex > -1) { customCommands[ex].response = r; customCommands[ex].public = pb; } else { customCommands.push({ name: n, response: r, public: pb }); } await saveCustomCommands(); await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n       *OK*\n◞──────────────────◟\nComando !${n} adicionado!\nPublico: ${pb ? 'Sim' : 'Nao'}\n◝──────────────────◜` }); return; }
    if (command === 'delcomando') { const n = args[0]?.toLowerCase(), i = customCommands.findIndex(c => c.name === n); if (i > -1) { customCommands.splice(i, 1); await saveCustomCommands(); await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n       *OK*\n◞──────────────────◟\nComando !${n} removido!\n◝──────────────────◜` }); } else { await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n       *ERRO*\n◞──────────────────◟\nComando nao encontrado!\n◝──────────────────◜` }); } return; }
    if (command === 'authgroup' && isGroup) { if (!authorizedGroups.includes(remoteJid)) { authorizedGroups.push(remoteJid); await saveGroups(); if (groupLeaveTimers[remoteJid]) { clearTimeout(groupLeaveTimers[remoteJid]); delete groupLeaveTimers[remoteJid]; } scheduleAutoMessage(sock, remoteJid); await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n       *OK*\n◞──────────────────◟\nGrupo autorizado!\n◝──────────────────◜` }); } else { await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n       *AVISO*\n◞──────────────────◟\nGrupo ja autorizado!\n◝──────────────────◜` }); } return; }
    if (command === 'listgroups') { let r = `◜──────────────────◝\n  *GRUPOS AUTORIZADOS*\n◞──────────────────◟\nMaster: ${masterGroup || 'Nao definido'}\n\n`; const o = authorizedGroups.filter(g => g !== masterGroup); r += o.length > 0 ? o.map((g, i) => `${i+1}. ${g.split('@')[0]}`).join('\n') : 'Nenhum adicional.'; r += `\n◝──────────────────◜`; await sock.sendMessage(remoteJid, { text: r }); return; }
    if (command === 'setmaster' && isGroup) { masterGroup = remoteJid; if (!authorizedGroups.includes(remoteJid)) authorizedGroups.push(remoteJid); await saveGroups(); await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n       *OK*\n◞──────────────────◟\nGrupo MASTER!\n◝──────────────────◜` }); return; }
    if (command === 'antilink') { const o = args[0]?.toLowerCase(); if (o === 'on') { config.antiLink = true; await saveConfig(); await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n       *OK*\n◞──────────────────◟\nAnti-Link ON!\n◝──────────────────◜` }); } else if (o === 'off') { config.antiLink = false; await saveConfig(); await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n       *OK*\n◞──────────────────◟\nAnti-Link OFF!\n◝──────────────────◜` }); } else { await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n    *ANTI-LINK*\n◞──────────────────◟\nStatus: ${config.antiLink ? 'ON' : 'OFF'}\n◝──────────────────◜` }); } return; }
    if (command === 'antiwords') { const o = args[0]?.toLowerCase(); if (o === 'on') { config.antiWords = true; await saveConfig(); await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n       *OK*\n◞──────────────────◟\nAnti-Palavras ON!\n◝──────────────────◜` }); } else if (o === 'off') { config.antiWords = false; await saveConfig(); await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n       *OK*\n◞──────────────────◟\nAnti-Palavras OFF!\n◝──────────────────◜` }); } else { await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n  *ANTI-PALAVRAS*\n◞──────────────────◟\nStatus: ${config.antiWords ? 'ON' : 'OFF'}\n◝──────────────────◜` }); } return; }
    if (command === 'antiflood') { const o = args[0]?.toLowerCase(); if (o === 'on') { config.antiFlood = true; await saveConfig(); await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n       *OK*\n◞──────────────────◟\nAnti-Flood ON!\n◝──────────────────◜` }); } else if (o === 'off') { config.antiFlood = false; await saveConfig(); await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n       *OK*\n◞──────────────────◟\nAnti-Flood OFF!\n◝──────────────────◜` }); } else { await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n    *ANTI-FLOOD*\n◞──────────────────◟\nStatus: ${config.antiFlood ? 'ON' : 'OFF'}\n◝──────────────────◜` }); } return; }
    if (command === 'antiapk') { const o = args[0]?.toLowerCase(); if (o === 'on') { config.antiApk = true; await saveConfig(); await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n       *OK*\n◞──────────────────◟\nAnti-APK ON!\n◝──────────────────◜` }); } else if (o === 'off') { config.antiApk = false; await saveConfig(); await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n       *OK*\n◞──────────────────◟\nAnti-APK OFF!\n◝──────────────────◜` }); } else { await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n     *ANTI-APK*\n◞──────────────────◟\nStatus: ${config.antiApk ? 'ON' : 'OFF'}\n◝──────────────────◜` }); } return; }
    if (command === 'antistatus') { const o = args[0]?.toLowerCase(); if (o === 'on') { config.antiStatus = true; await saveConfig(); await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n       *OK*\n◞──────────────────◟\nAnti-Status ON!\n◝──────────────────◜` }); } else if (o === 'off') { config.antiStatus = false; await saveConfig(); await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n       *OK*\n◞──────────────────◟\nAnti-Status OFF!\n◝──────────────────◜` }); } else { await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n   *ANTI-STATUS*\n◞──────────────────◟\nStatus: ${config.antiStatus ? 'ON' : 'OFF'}\n◝──────────────────◜` }); } return; }
    if (command === 'antimencao') { const o = args[0]?.toLowerCase(); if (o === 'on') { config.antiMencao = true; await saveConfig(); await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n       *OK*\n◞──────────────────◟\nAnti-Mencao ON!\n◝──────────────────◜` }); } else if (o === 'off') { config.antiMencao = false; await saveConfig(); await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n       *OK*\n◞──────────────────◟\nAnti-Mencao OFF!\n◝──────────────────◜` }); } else { await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n   *ANTI-MENCAO*\n◞──────────────────◟\nStatus: ${config.antiMencao ? 'ON' : 'OFF'}\n◝──────────────────◜` }); } return; }
    if (command === 'automsg') { const o = args[0]?.toLowerCase(); if (o === 'on') { config.autoMessages = true; await saveConfig(); for (const g of authorizedGroups) scheduleAutoMessage(sock, g); await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n       *OK*\n◞──────────────────◟\nAuto Msg ON!\n◝──────────────────◜` }); } else if (o === 'off') { config.autoMessages = false; await saveConfig(); for (const k in scheduledTasks) clearTimeout(scheduledTasks[k]); await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n       *OK*\n◞──────────────────◟\nAuto Msg OFF!\n◝──────────────────◜` }); } else { await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n  *AUTO MENSAGENS*\n◞──────────────────◟\nStatus: ${config.autoMessages ? 'ON' : 'OFF'}\n◝──────────────────◜` }); } return; }
    if (command === 'setflood') { const mx = parseInt(args[0]), tw = parseInt(args[1]); if (isNaN(mx) || isNaN(tw)) { await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n   *ANTI-FLOOD ATUAL*\n◞──────────────────◟\n${config.maxFloodMessages} msgs/${config.floodTimeWindow}s\nUso: !setflood [msgs] [seg]\n◝──────────────────◜` }); return; } config.maxFloodMessages = mx; config.floodTimeWindow = tw; await saveConfig(); await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n       *OK*\n◞──────────────────◟\nAnti-Flood: ${mx} msgs/${tw}s\n◝──────────────────◜` }); return; }
    if (command === 'setwarn') { const mx = parseInt(args[0]); if (isNaN(mx)) { await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n  *ADVERTENCIAS ATUAL*\n◞──────────────────◟\nMax: ${config.maxWarnings}\nUso: !setwarn [numero]\n◝──────────────────◜` }); return; } config.maxWarnings = mx; await saveConfig(); await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n       *OK*\n◞──────────────────◟\nMax advertencias: ${mx}\n◝──────────────────◜` }); return; }
    if (command === 'welcome') { const o = args[0]?.toLowerCase(); if (o === 'on') { iaMemory.welcomeMsg = iaMemory.welcomeMsg || 'Ola {nome}! Bem-vindo(a)!'; await saveIAMemory(); await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n       *OK*\n◞──────────────────◟\nBoas-vindas ON!\n◝──────────────────◜` }); return; } if (o === 'off') { iaMemory.welcomeMsg = null; await saveIAMemory(); await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n       *OK*\n◞──────────────────◟\nBoas-vindas OFF!\n◝──────────────────◜` }); return; } await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n       *USO*\n◞──────────────────◟\n!welcome on/off\n◝──────────────────◜` }); return; }
    if (command === 'setwelcome') { iaMemory.welcomeMsg = args.join(' '); await saveIAMemory(); await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n       *OK*\n◞──────────────────◟\nBoas-vindas atualizada!\n◝──────────────────◜` }); return; }
    if (command === 'schedule' && isGroup) { if (!isSenderAdmin && !isSenderOwner) { await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n       *NEGADO*\n◞──────────────────◟\nApenas administradores!\n◝──────────────────◜` }); return; } const d = args[0], h = args[1], m = args.slice(2).join(' '); if (!d || !h || !m) { await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n       *USO*\n◞──────────────────◟\n!schedule [D/M/A] [H:M] [msg]\n◝──────────────────◜` }); return; } const [dd, mm, aa] = d.split('/'), [hh, mi] = h.split(':'); const dt = new Date(aa, mm - 1, dd, hh, mi); scheduledMessages.push({ id: Date.now().toString(), target: remoteJid, datetime: dt.toISOString(), message: m, sent: false }); await saveSchedules(); await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n       *OK*\n◞──────────────────◟\nAgendado ${d} as ${h}!\n◝──────────────────◜` }); return; }
    if (command === 'listschedules') { const p = scheduledMessages.filter(s => !s.sent); if (p.length === 0) { await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n   *AGENDAMENTOS*\n◞──────────────────◟\nNenhum.\n◝──────────────────◜` }); } else { const l = p.map((s, i) => `${i+1}. ${new Date(s.datetime).toLocaleString('pt-BR')} -> "${s.message.substring(0, 30)}..."`).join('\n'); await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n     *AGENDAMENTOS*\n◞──────────────────◟\n${l}\n◝──────────────────◜` }); } return; }
    if (command === 'cancelschedule') { const i = parseInt(args[0]) - 1; const p = scheduledMessages.filter(s => !s.sent); if (isNaN(i) || i < 0 || i >= p.length) { await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n       *ERRO*\n◞──────────────────◟\nNumero invalido!\n◝──────────────────◜` }); return; } const tc = p[i]; scheduledMessages = scheduledMessages.filter(s => s.id !== tc.id); await saveSchedules(); await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n       *OK*\n◞──────────────────◟\nAgendamento cancelado!\n◝──────────────────◜` }); return; }
    if (command === 'clearschedules') { const c = scheduledMessages.filter(s => !s.sent).length; scheduledMessages = scheduledMessages.filter(s => s.sent); await saveSchedules(); await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n       *OK*\n◞──────────────────◟\n${c} cancelado(s)!\n◝──────────────────◜` }); return; }
    if (command === 'backup') { await saveConfig(); await saveLinks(); await saveWords(); await saveExtensions(); await saveGroups(); await saveSchedules(); await saveMessages(); await saveAutoResponses(); await saveCustomCommands(); await saveWarnings(); await saveFixedMessage(); await saveIAMemory(); await saveMutedUsers(); await savePrefixes(); await saveLinkCounters(); await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n       *OK*\n◞──────────────────◟\nBackup criado!\n◝──────────────────◜` }); return; }
    if (command === 'recache') { await loadFromRedis(); await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n       *OK*\n◞──────────────────◟\nRedis recarregado!\n◝──────────────────◜` }); return; }
    if (command === 'resetwarnings') { const m = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || []; if (m.length > 0) { for (const u of m) { const wk = `${remoteJid}:${u}`; delete warnings[wk]; } await saveWarnings(); await sock.sendMessage(remoteJid, { text: `◜──────────────────◝\n       *OK*\n◞──────────────────◟\nAdvertencias resetadas!\n◝──────────────────◜` }); } return; }
    if (command === 'apagar' && isGroup) { const qm = msg.message?.extendedTextMessage?.contextInfo?.stanzaId, qs = msg.message?.extendedTextMessage?.contextInfo?.participant; if (!qm) return; await sock.sendMessage(remoteJid, { delete: { remoteJid, id: qm, participant: qs } }); return; }
  });

  return sock;
}

// =================================================================
// INICIAR SERVIDOR E BOT
// =================================================================
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => res.json({ status: 'online', bot: 'Mr Doso', ia: 'DOSO IA', version: '12.0' }));
app.get('/health', (req, res) => res.json({ status: 'healthy', redis: redisClient.isReady, ia: iaMemory.ativo, apiCalls: apiUsage.requests, uptime: process.uptime() }));

// Auto-ping para manter ativo
setInterval(async () => {
  try {
    require('http').get(`http://localhost:${PORT}/health`, () => {});
  } catch (err) {}
}, 300000);

async function start() {
  await loadFromRedis();
  
  app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));
  await connectToWhatsApp();
}

start().catch(console.error);
