const TelegramBot = require('node-telegram-bot-api');
const { MongoClient } = require('mongodb');
const express = require('express');
const cors = require('cors');

const BOT_TOKEN = process.env.BOT_TOKEN;
const MONGO_URL = process.env.MONGO_URL;
const GAME_URL = process.env.GAME_URL || 'https://nomerok777.netlify.app';
const PORT = process.env.PORT || 3000;

if (!BOT_TOKEN || !MONGO_URL) {
  console.error('Missing BOT_TOKEN or MONGO_URL');
  process.exit(1);
}

const bot = new TelegramBot(BOT_TOKEN, { polling: true });
const client = new MongoClient(MONGO_URL);
let playersCol;

bot.onText(/\/start/, (msg) => {
  const name = msg.from.first_name || 'друг';
  bot.sendMessage(msg.chat.id,
    `👋 Привет, ${name}!\n\n` +
    `🎰 Это *НомерОК* — крути рулетку, собирай красивые номера и богатей!\n\n` +
    `👇 Жми кнопку ниже чтобы начать`,
    {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [[
          { text: '🎰 Играть', web_app: { url: GAME_URL } }
        ]]
      }
    }
  );
});

bot.onText(/\/help/, (msg) => {
  bot.sendMessage(msg.chat.id,
    '📖 Команды:\n/start — начать игру\n/balance — мой баланс\n/top — топ игроков'
  );
});

bot.onText(/\/balance/, async (msg) => {
  const id = String(msg.from.id);
  const p = await playersCol.findOne({ _id: id });
  if (!p) {
    bot.sendMessage(msg.chat.id, 'Ты ещё не играл. Жми /start');
    return;
  }
  bot.sendMessage(msg.chat.id, `💰 Баланс: ${Math.round(p.balance).toLocaleString('ru-RU')} ₽\n⭐ Уровень: ${p.level}`);
});

bot.onText(/\/top/, async (msg) => {
  const top = await playersCol.find().sort({ balance: -1 }).limit(10).toArray();
  let text = '🏆 *Топ-10 игроков:*\n\n';
  top.forEach((p, i) => {
    const name = p.nick || 'Игрок';
    text += `${i+1}. ${name} — ${Math.round(p.balance).toLocaleString('ru-RU')} ₽\n`;
  });
  bot.sendMessage(msg.chat.id, text, { parse_mode: 'Markdown' });
});

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

app.post('/api/load', async (req, res) => {
  try {
    const { initData } = req.body;
    const userId = getUserIdFromInitData(initData);
    if (!userId) return res.status(401).json({ error: 'bad initData' });
    const player = await playersCol.findOne({ _id: userId });
    res.json({ ok: true, progress: player ? player.data : null });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'server error' });
  }
});

app.post('/api/save', async (req, res) => {
  try {
    const { initData, progress } = req.body;
    const userId = getUserIdFromInitData(initData);
    if (!userId) return res.status(401).json({ error: 'bad initData' });
    await playersCol.updateOne(
      { _id: userId },
      { $set: {
        data: progress,
        balance: progress.balance || 0,
        level: progress.level || 1,
        nick: (progress.profile && progress.profile.nick) || 'Игрок',
        updated: Date.now()
      }},
      { upsert: true }
    );
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'server error' });
  }
});

app.get('/', (req, res) => res.send('NomerOK server is running'));

function getUserIdFromInitData(initData) {
  if (!initData) return null;
  try {
    const params = new URLSearchParams(initData);
    const user = params.get('user');
    if (!user) return null;
    const parsed = JSON.parse(user);
    return String(parsed.id);
  } catch (e) {
    return null;
  }
}

async function start() {
  await client.connect();
  const db = client.db('nomerok');
  playersCol = db.collection('players');
  console.log('MongoDB connected');
  app.listen(PORT, () => console.log(`API on port ${PORT}`));
}

start().catch(err => {
  console.error('Start error:', err);
  process.exit(1);
});
