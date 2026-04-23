const {
  default: makeWASocket,
  useMultiFileAuthState,
  makeCacheableSignalKeyStore,
  DisconnectReason,
  fetchLatestBaileysVersion,
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const { Boom } = require('@hapi/boom');
const fs = require('fs');

// Configurações
const logger = pino({ level: 'silent' });
const AUTH_FOLDER = './auth_info_baileys';
const PHONE_NUMBER = '258858861745';
const OWNER_NUMBER = '253188708028487';
const PREFIX = '!';

// Arquivos de dados
const CONFIG_FILE = './bot_config.json';
const LINKS_FILE = './allowed_links.json';
const WORDS_FILE = './banned_words.json';
const GROUPS_FILE = './authorized_groups.json';
const SCHEDULE_FILE = './scheduled_messages.json';
const MESSAGES_FILE = './custom_messages.json';

// Estado do bot
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

// Mensagens personalizadas
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

// Carregar dados
function loadData() {
  if (fs.existsSync(CONFIG_FILE)) {
    config = { ...config, ...JSON.parse(fs.readFileSync(CONFIG_FILE)) };
  }
  if (fs.existsSync(LINKS_FILE)) {
    allowedLinks = JSON.parse(fs.readFileSync(LINKS_FILE));
  }
  if (fs.existsSync(WORDS_FILE)) {
    bannedWords = JSON.parse(fs.readFileSync(WORDS_FILE));
  }
  if (fs.existsSync(GROUPS_FILE)) {
    const groupsData = JSON.parse(fs.readFileSync(GROUPS_FILE));
    authorizedGroups = groupsData.authorized || [];
    masterGroup = groupsData.master || null;
  }
  if (fs.existsSync(SCHEDULE_FILE)) {
    scheduledMessages = JSON.parse(fs.readFileSync(SCHEDULE_FILE));
  }
  if (fs.existsSync(MESSAGES_FILE)) {
    customMessages = { ...customMessages, ...JSON.parse(fs.readFileSync(MESSAGES_FILE)) };
  }
}

loadData();

// Funções de salvamento
function saveConfig() { fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2)); }
function saveLinks() { fs.writeFileSync(LINKS_FILE, JSON.stringify(allowedLinks, null, 2)); }
function saveWords() { fs.writeFileSync(WORDS_FILE, JSON.stringify(bannedWords, null, 2)); }
function saveGroups() {
  fs.writeFileSync(GROUPS_FILE, JSON.stringify({ master: masterGroup, authorized: authorizedGroups }, null, 2));
}
function saveSchedules() { fs.writeFileSync(SCHEDULE_FILE, JSON.stringify(scheduledMessages, null, 2)); }
function saveMessages() { fs.writeFileSync(MESSAGES_FILE, JSON.stringify(customMessages, null, 2)); }

// Verificações
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
  // Se for grupo master ou autorizado, FORÇA como true
  if (groupJid === masterGroup || authorizedGroups.includes(groupJid)) {
    console.log(`✅ Bot é admin (forçado para grupo autorizado)`);
    return true;
  }
  
  try {
    const botJid = sock.user.id;
    const groupMetadata = await sock.groupMetadata(groupJid);
    const admins = groupMetadata.participants
      .filter(p => p.admin === 'admin' || p.admin === 'superadmin')
      .map(p => p.id);
    
    // Verificar se o bot está na lista
    if (admins.includes(botJid)) {
      return true;
    }
    
    // Verificar pelo número
    const botNumber = PHONE_NUMBER + '@s.whatsapp.net';
    if (admins.includes(botNumber)) {
      return true;
    }
    
    // Se chegou aqui, NÃO é admin
    console.log(`❌ Bot NÃO é admin no grupo ${groupJid}`);
    return false;
  } catch (err) {
    console.error(`Erro ao verificar admin: ${err.message}`);
    return false;
  }
}

// Sistema de agendamento
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
        console.log(`📅 Mensagem agendada enviada para ${schedule.target}`);
      } catch (err) {
        console.error('Erro ao enviar mensagem agendada:', err.message);
      }
    }
    
    if (toSend.length > 0) saveSchedules();
  }, 30000);
}

function scheduleAutoMessage(sock, groupJid) {
  if (!isGroupAuthorized(groupJid) || !config.autoMessages) return;
  
  if (scheduledTasks[groupJid]) clearTimeout(scheduledTasks[groupJid]);
  
  const delay = randomDelay(config.messageDelay.min, config.messageDelay.max);
  
  scheduledTasks[groupJid] = setTimeout(async () => {
    try {
      const randomMsg = customMessages.autoMessages[Math.floor(Math.random() * customMessages.autoMessages.length)];
      await sock.sendMessage(groupJid, { text: randomMsg });
      console.log(`📢 Mensagem automática enviada para ${groupJid}`);
    } catch (err) {
      console.error('Erro ao enviar mensagem automática:', err.message);
    }
    scheduleAutoMessage(sock, groupJid);
  }, delay);
}

async function sendRulesOnRemove(sock, groupJid) {
  const delay = randomDelay(3000, 10000);
  setTimeout(async () => {
    try {
      await sock.sendMessage(groupJid, { text: customMessages.rules });
    } catch (err) {
      console.error('Erro ao enviar regras:', err.message);
    }
  }, delay);
}

// Função principal
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
    connectTimeoutMs: 120000,
    keepAliveIntervalMs: 30000,
  });

  let connectionClosed = false;

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr && !sock.authState.creds.registered && !connectionClosed) {
      console.log('\n🔄 Gerando código de pareamento...\n');
      try {
        await new Promise(resolve => setTimeout(resolve, 2000));
        const code = await sock.requestPairingCode(PHONE_NUMBER);
        console.log('✅ CÓDIGO:', code?.match(/.{1,4}/g)?.join('-') || code);
        console.log('📱 WhatsApp > Aparelhos Conectados > Conectar um Aparelho\n');
      } catch (err) {
        console.error('❌ Erro:', err.message);
      }
    }

    if (connection === 'close') {
      connectionClosed = true;
      console.log('⚠️ Conexão fechada. Reconectando em 5s...');
      setTimeout(() => {
        connectionClosed = false;
        connectToWhatsApp().catch(err => console.error('Erro na reconexão:', err));
      }, 5000);
    } else if (connection === 'open') {
      console.log('✅ BOT CONECTADO!');
      console.log('👑 Owner:', OWNER_NUMBER);
      console.log('📋 Grupos autorizados:', authorizedGroups.length);
      console.log('🛡️ Anti-Link:', config.antiLink ? 'ON' : 'OFF');
      console.log('📋 Anti-Palavras:', config.antiWords ? 'ON' : 'OFF');
      console.log('📅 Agendamentos:', scheduledMessages.filter(s => !s.sent).length);
      console.log('');
      
      checkScheduledMessages(sock);
      
      const groups = await sock.groupFetchAllParticipating();
      for (const groupJid of Object.keys(groups)) {
        if (isGroupAuthorized(groupJid)) {
          scheduleAutoMessage(sock, groupJid);
        }
      }
    }
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('group-participants.update', async (update) => {
    const { id: groupJid, participants, action } = update;
    
    if (action === 'add' && participants.includes(sock.user.id)) {
      console.log(`🤖 Bot adicionado ao grupo ${groupJid}`);
      
      if (!masterGroup) {
        masterGroup = groupJid;
        authorizedGroups.push(groupJid);
        saveGroups();
        await sock.sendMessage(groupJid, { 
          text: `✅ *Grupo definido como MASTER!*\n\nUse !menu para ver os comandos disponíveis.` 
        });
        scheduleAutoMessage(sock, groupJid);
        return;
      }
      
      if (!isGroupAuthorized(groupJid)) {
        await sock.sendMessage(groupJid, { 
          text: `❌ *Bot não autorizado!*\nApenas o proprietário pode autorizar.\nSaindo em 30 segundos...` 
        });
        
        groupLeaveTimers[groupJid] = setTimeout(async () => {
          if (!isGroupAuthorized(groupJid)) {
            await sock.groupLeave(groupJid);
          }
        }, 30000);
        return;
      }
      
      scheduleAutoMessage(sock, groupJid);
    }
  });

  // Processador de mensagens
  sock.ev.on('messages.upsert', async ({ messages }) => {
    const msg = messages[0];
    if (!msg.message || msg.key.fromMe) return;

    const remoteJid = msg.key.remoteJid;
    const isGroup = remoteJid.endsWith('@g.us');
    const sender = msg.key.participant || remoteJid;
    const pushName = msg.pushName || 'Usuário';
    
    const messageContent =
      msg.message.conversation ||
      msg.message.extendedTextMessage?.text ||
      msg.message.imageMessage?.caption ||
      msg.message.videoMessage?.caption ||
      '';

    if (!messageContent) return;

    console.log(`[${isGroup ? '👥' : '👤'}] ${pushName}: ${messageContent}`);

    const isSenderOwner = isOwner(sender);
    const isSenderAdmin = isGroup ? await isGroupAdmin(sock, remoteJid, sender) : false;
    const isBotAdminStatus = isGroup ? await isBotAdmin(sock, remoteJid) : false;
// === ANTI-LINK (APAGA MENSAGEM + REMOVE USUÁRIO) ===
if (isGroup && isGroupAuthorized(remoteJid) && config.antiLink && containsLink(messageContent)) {
  console.log(`\n🔗 LINK DETECTADO:`);
  console.log(`   De: ${pushName} (${sender.split('@')[0]})`);
  console.log(`   É Owner? ${isSenderOwner ? 'SIM' : 'NÃO'}`);
  console.log(`   É Admin? ${isSenderAdmin ? 'SIM' : 'NÃO'}`);
  console.log(`   Bot é Admin? ${isBotAdminStatus ? 'SIM' : 'NÃO'}`);
  
  if (!isSenderAdmin && !isSenderOwner) {
    const linkAllowed = isLinkAllowed(messageContent);
    console.log(`   Link permitido? ${linkAllowed ? 'SIM' : 'NÃO'}`);
    
    if (!linkAllowed && isBotAdminStatus) {
      const deleteDelay = randomDelay(2000, 4000); // 2-4 segundos para apagar
      const removeDelay = randomDelay(config.removeDelay.min, config.removeDelay.max); // 3-10s para remover
      
      console.log(`   ⏳ Ação: APAGAR em ${deleteDelay/1000}s, REMOVER em ${removeDelay/1000}s`);
      
      // PRIMEIRO: Apagar a mensagem
      setTimeout(async () => {
        try {
          await sock.sendMessage(remoteJid, { 
            delete: { 
              remoteJid: remoteJid, 
              id: msg.key.id, 
              participant: sender 
            } 
          });
          console.log(`✅ MENSAGEM APAGADA`);
        } catch (err) {
          console.error(`❌ Erro ao apagar mensagem: ${err.message}`);
        }
      }, deleteDelay);
      
      // DEPOIS: Remover o usuário
      setTimeout(async () => {
        try {
          await sock.groupParticipantsUpdate(remoteJid, [sender], 'remove');
          console.log(`✅ USUÁRIO REMOVIDO: ${sender.split('@')[0]}`);
          sendRulesOnRemove(sock, remoteJid);
        } catch (err) {
          console.error(`❌ Erro ao remover: ${err.message}`);
        }
      }, removeDelay);
      
      return;
    }
  }
}

    // === ANTI-PALAVRAS (APAGA MENSAGEM) ===
    if (isGroup && isGroupAuthorized(remoteJid) && config.antiWords && containsBannedWord(messageContent)) {
      if (!isSenderAdmin && !isSenderOwner && isBotAdminStatus) {
        const delay = randomDelay(config.deleteDelay.min, config.deleteDelay.max);
        console.log(`📋 Palavra proibida - apagando em ${delay/1000}s`);
        
        setTimeout(async () => {
          try {
            await sock.sendMessage(remoteJid, { 
              delete: { remoteJid, id: msg.key.id, participant: sender } 
            });
            console.log(`✅ MENSAGEM APAGADA`);
          } catch (err) {}
        }, delay);
        return;
      }
    }

    const args = messageContent.startsWith(PREFIX) ? messageContent.slice(PREFIX.length).trim().split(/ +/) : [];
    const command = args.shift()?.toLowerCase();

    // === COMANDOS SEM PREFIXO (apenas owner) ===
    if (!messageContent.startsWith(PREFIX) && isSenderOwner) {
      const texto = messageContent.toLowerCase().trim();
      if (texto === 'ping') {
        await sock.sendMessage(remoteJid, { text: '🏓 PONG! Bot online!' });
      } else if (texto === 'status') {
        const status = `📊 *STATUS DO BOT*\n\n` +
          `✅ Online\n👑 Owner: ${OWNER_NUMBER}\n📋 Grupos: ${authorizedGroups.length}\n` +
          `🔗 Links: ${allowedLinks.length}\n🚫 Palavras: ${bannedWords.length}\n` +
          `📅 Agendamentos: ${scheduledMessages.filter(s => !s.sent).length}`;
        await sock.sendMessage(remoteJid, { text: status });
      }
      return;
    }

    if (!command) return;

    // === COMANDOS PÚBLICOS ===
    if (command === 'menu') {
      const menu = `📋 *MENU DO BOT*\n\n` +
        `*Comandos para todos:*\n` +
        `${PREFIX}menu - Mostra este menu\n` +
        `${PREFIX}info - Informações do grupo\n` +
        `${PREFIX}bot - Informações do bot\n` +
        `${PREFIX}regras - Regras do grupo\n` +
        `${PREFIX}ping - Testar bot\n\n` +
        `💡 Links não autorizados = remoção\n` +
        `💡 Palavras ofensivas = mensagem apagada`;
      await sock.sendMessage(remoteJid, { text: menu });
      return;
    }

    if (command === 'info') {
      if (isGroup) {
        try {
          const groupMetadata = await sock.groupMetadata(remoteJid);
          const participants = groupMetadata.participants;
          const admins = participants.filter(p => p.admin === 'admin' || p.admin === 'superadmin');
          
          const groupInfo = `ℹ️ *INFORMAÇÕES DO GRUPO*\n\n` +
            `📝 Nome: ${groupMetadata.subject}\n` +
            `🆔 ID: ${remoteJid.split('@')[0]}\n` +
            `👥 Membros: ${participants.length}\n` +
            `👑 Admins: ${admins.length}\n` +
            `📅 Criado: ${new Date(groupMetadata.creation * 1000).toLocaleDateString('pt-BR')}\n\n` +
            `👤 Sua posição: ${isSenderAdmin ? 'Admin' : 'Membro'}`;
          
          await sock.sendMessage(remoteJid, { text: groupInfo });
        } catch (err) {
          await sock.sendMessage(remoteJid, { text: '❌ Erro ao obter informações.' });
        }
      } else {
        const userInfo = `ℹ️ *SUAS INFORMAÇÕES*\n\n👤 Nome: ${pushName}\n🆔 ID: ${sender.split('@')[0]}`;
        await sock.sendMessage(remoteJid, { text: userInfo });
      }
      return;
    }
    
    if (command === 'bot' || command === 'sobre') {
      await sock.sendMessage(remoteJid, { text: customMessages.botInfo });
      return;
    }
    
    if (command === 'regras') {
      await sock.sendMessage(remoteJid, { text: customMessages.rules });
      return;
    }
    
    if (command === 'ping') {
      await sock.sendMessage(remoteJid, { text: '🏓 PONG! Bot está online!' });
      return;
    }

    // === COMANDOS DO OWNER ===
    if (isSenderOwner) {
      if (command === 'authgroup' && isGroup) {
        if (!authorizedGroups.includes(remoteJid)) {
          authorizedGroups.push(remoteJid);
          saveGroups();
          if (groupLeaveTimers[remoteJid]) {
            clearTimeout(groupLeaveTimers[remoteJid]);
            delete groupLeaveTimers[remoteJid];
          }
          scheduleAutoMessage(sock, remoteJid);
          await sock.sendMessage(remoteJid, { text: `✅ Grupo autorizado!` });
        } else {
          await sock.sendMessage(remoteJid, { text: `⚠️ Já autorizado!` });
        }
        return;
      }
      
      if (command === 'listgroups') {
        let resp = `📋 *GRUPOS AUTORIZADOS*\n\n🏠 Master: ${masterGroup || 'Não definido'}\n\n`;
        const outros = authorizedGroups.filter(g => g !== masterGroup);
        resp += outros.length > 0 ? outros.map((g, i) => `${i+1}. ${g.split('@')[0]}`).join('\n') : 'Nenhum adicional.';
        await sock.sendMessage(remoteJid, { text: resp });
        return;
      }
      
      if (command === 'setmaster' && isGroup) {
        masterGroup = remoteJid;
        if (!authorizedGroups.includes(remoteJid)) authorizedGroups.push(remoteJid);
        saveGroups();
        await sock.sendMessage(remoteJid, { text: `✅ Grupo definido como MASTER!` });
        return;
      }
      
      if (command === 'addlink') {
        const link = args[0]?.toLowerCase();
        if (!link) {
          await sock.sendMessage(remoteJid, { text: `Uso: ${PREFIX}addlink [domínio]` });
          return;
        }
        if (!allowedLinks.includes(link)) {
          allowedLinks.push(link);
          saveLinks();
          await sock.sendMessage(remoteJid, { text: `✅ Link "${link}" permitido!` });
        } else {
          await sock.sendMessage(remoteJid, { text: `⚠️ Já existe!` });
        }
        return;
      }
      
      if (command === 'dellink') {
        const link = args[0]?.toLowerCase();
        const index = allowedLinks.indexOf(link);
        if (index > -1) {
          allowedLinks.splice(index, 1);
          saveLinks();
          await sock.sendMessage(remoteJid, { text: `✅ Link "${link}" removido!` });
        } else {
          await sock.sendMessage(remoteJid, { text: `⚠️ Não encontrado!` });
        }
        return;
      }
      
      if (command === 'listlinks') {
        const lista = allowedLinks.length > 0 ? allowedLinks.map((l, i) => `${i+1}. ${l}`).join('\n') : 'Nenhum link.';
        await sock.sendMessage(remoteJid, { text: `🔗 *Links Permitidos:*\n${lista}` });
        return;
      }
      
      if (command === 'addword') {
        const word = args.join(' ').toLowerCase();
        if (!word) {
          await sock.sendMessage(remoteJid, { text: `Uso: ${PREFIX}addword [palavra]` });
          return;
        }
        if (!bannedWords.includes(word)) {
          bannedWords.push(word);
          saveWords();
          await sock.sendMessage(remoteJid, { text: `✅ Palavra banida!` });
        } else {
          await sock.sendMessage(remoteJid, { text: `⚠️ Já existe!` });
        }
        return;
      }
      
      if (command === 'delword') {
        const word = args.join(' ').toLowerCase();
        const index = bannedWords.indexOf(word);
        if (index > -1) {
          bannedWords.splice(index, 1);
          saveWords();
          await sock.sendMessage(remoteJid, { text: `✅ Palavra removida!` });
        } else {
          await sock.sendMessage(remoteJid, { text: `⚠️ Não encontrada!` });
        }
        return;
      }
      
      if (command === 'listwords') {
        const lista = bannedWords.length > 0 ? bannedWords.map((w, i) => `${i+1}. ${w}`).join('\n') : 'Nenhuma palavra.';
        await sock.sendMessage(remoteJid, { text: `🚫 *Palavras Banidas:*\n${lista}` });
        return;
      }
      
      if (command === 'schedule') {
        const target = args[0];
        const data = args[1];
        const hora = args[2];
        const mensagem = args.slice(3).join(' ');
        
        if (!target || !data || !hora || !mensagem) {
          await sock.sendMessage(remoteJid, { 
            text: `Uso: ${PREFIX}schedule [id] [DD/MM/AAAA] [HH:MM] [msg]\nExemplo: ${PREFIX}schedule ${remoteJid} 25/12/2026 10:00 Feliz Natal!` 
          });
          return;
        }
        
        const [dia, mes, ano] = data.split('/');
        const [h, m] = hora.split(':');
        const dataObj = new Date(ano, mes - 1, dia, h, m);
        
        if (isNaN(dataObj.getTime())) {
          await sock.sendMessage(remoteJid, { text: '❌ Data/hora inválida!' });
          return;
        }
        
        scheduledMessages.push({
          id: Date.now().toString(),
          target,
          datetime: dataObj.toISOString(),
          message: mensagem,
          sent: false
        });
        saveSchedules();
        await sock.sendMessage(remoteJid, { text: `✅ Agendado para ${data} às ${hora}!` });
        return;
      }
      
      if (command === 'listschedules') {
        const pending = scheduledMessages.filter(s => !s.sent);
        if (pending.length === 0) {
          await sock.sendMessage(remoteJid, { text: '📅 Nenhum agendamento.' });
        } else {
          const lista = pending.map((s, i) => 
            `${i+1}. 📍 ${s.target.split('@')[0]}\n   🕐 ${new Date(s.datetime).toLocaleString('pt-BR')}\n   💬 "${s.message.substring(0, 40)}..."`
          ).join('\n\n');
          await sock.sendMessage(remoteJid, { text: `📅 *Agendamentos:*\n\n${lista}\n\nCancelar: !cancelschedule [nº]` });
        }
        return;
      }
      
      if (command === 'cancelschedule') {
        const index = parseInt(args[0]) - 1;
        const pending = scheduledMessages.filter(s => !s.sent);
        
        if (isNaN(index) || index < 0 || index >= pending.length) {
          await sock.sendMessage(remoteJid, { text: '❌ Número inválido!' });
          return;
        }
        
        const toCancel = pending[index];
        scheduledMessages = scheduledMessages.filter(s => s.id !== toCancel.id);
        saveSchedules();
        await sock.sendMessage(remoteJid, { text: `✅ Agendamento cancelado!` });
        return;
      }
      
      if (command === 'clearschedules') {
        const count = scheduledMessages.filter(s => !s.sent).length;
        scheduledMessages = scheduledMessages.filter(s => s.sent);
        saveSchedules();
        await sock.sendMessage(remoteJid, { text: `✅ ${count} agendamento(s) cancelado(s)!` });
        return;
      }
      
      if (command === 'owner') {
        const menu = `👑 *COMANDOS DO OWNER*\n\n` +
          `*Grupos:* authgroup, listgroups, setmaster\n` +
          `*Links:* addlink, dellink, listlinks\n` +
          `*Palavras:* addword, delword, listwords\n` +
          `*Agendamento:* schedule, listschedules, cancelschedule, clearschedules\n` +
          `*Config:* antilink on/off, antiwords on/off, automsg on/off\n` +
          `*Teste:* ping, status`;
        await sock.sendMessage(remoteJid, { text: menu });
        return;
      }
    }

    // === COMANDOS ADMIN ===
    if (!isSenderAdmin && !isSenderOwner && isGroup) {
      await sock.sendMessage(remoteJid, { text: '❌ Apenas administradores!' });
      return;
    }

    if (command === 'antilink' && isGroup) {
      const opt = args[0]?.toLowerCase();
      if (!opt) {
        await sock.sendMessage(remoteJid, { 
          text: `🛡️ *Anti-Link:* ${config.antiLink ? '✅ ATIVADO' : '❌ DESATIVADO'}\nUse !antilink on/off` 
        });
        return;
      }
      if (opt === 'on') { config.antiLink = true; saveConfig(); await sock.sendMessage(remoteJid, { text: '✅ Anti-Link ATIVADO!' }); }
      else if (opt === 'off') { config.antiLink = false; saveConfig(); await sock.sendMessage(remoteJid, { text: '✅ Anti-Link DESATIVADO!' }); }
      else { await sock.sendMessage(remoteJid, { text: `Uso: ${PREFIX}antilink on/off` }); }
      return;
    }
    
    if (command === 'antiwords' && isGroup) {
      const opt = args[0]?.toLowerCase();
      if (!opt) {
        await sock.sendMessage(remoteJid, { 
          text: `📋 *Anti-Palavras:* ${config.antiWords ? '✅ ATIVADO' : '❌ DESATIVADO'}\nUse !antiwords on/off` 
        });
        return;
      }
      if (opt === 'on') { config.antiWords = true; saveConfig(); await sock.sendMessage(remoteJid, { text: '✅ Anti-Palavras ATIVADO!' }); }
      else if (opt === 'off') { config.antiWords = false; saveConfig(); await sock.sendMessage(remoteJid, { text: '✅ Anti-Palavras DESATIVADO!' }); }
      else { await sock.sendMessage(remoteJid, { text: `Uso: ${PREFIX}antiwords on/off` }); }
      return;
    }
    
    if (command === 'automsg' && isGroup) {
      const opt = args[0]?.toLowerCase();
      if (opt === 'on') { 
        config.autoMessages = true; 
        saveConfig(); 
        scheduleAutoMessage(sock, remoteJid);
        await sock.sendMessage(remoteJid, { text: '✅ Mensagens automáticas ATIVADAS!' }); 
      }
      else if (opt === 'off') { 
        config.autoMessages = false; 
        saveConfig(); 
        if (scheduledTasks[remoteJid]) clearTimeout(scheduledTasks[remoteJid]);
        await sock.sendMessage(remoteJid, { text: '✅ Mensagens automáticas DESATIVADAS!' }); 
      }
      else { await sock.sendMessage(remoteJid, { text: `Uso: ${PREFIX}automsg on/off` }); }
      return;
    }
  });

  return sock;
}

// Iniciar
console.clear();
console.log('🤖 BOT COMPLETO - MR DOSO\n');
console.log('👑 Owner:', OWNER_NUMBER);
console.log('📱 Bot:', PHONE_NUMBER);
console.log('\n⏳ Conectando...\n');

connectToWhatsApp().catch(err => console.error('❌ Erro:', err));
