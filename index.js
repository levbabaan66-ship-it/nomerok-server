const TelegramBot=require('node-telegram-bot-api');
const {MongoClient}=require('mongodb');
const express=require('express');
const cors=require('cors');

const BOT_TOKEN=process.env.BOT_TOKEN;
const MONGO_URL=process.env.MONGO_URL;
const GAME_URL=process.env.GAME_URL||'https://nomerok777.netlify.app';
const ADMIN_KEY='nomerok2026';
const PORT=process.env.PORT||3000;

if(!BOT_TOKEN){console.error('No BOT_TOKEN');process.exit(1);}

const app=express();
app.use(cors());
app.use(express.json({limit:'1mb'}));

let playersCol=null,dbReady=false;

app.get('/',(req,res)=>res.send('NomerOK · DB: '+dbReady));

app.post('/api/load',async(req,res)=>{
  try{
    if(!dbReady)return res.json({ok:true,progress:null});
    const uid=getUid(req.body.initData);
    if(!uid)return res.status(401).json({error:'no uid'});
    const p=await playersCol.findOne({_id:uid});
    res.json({ok:true,progress:p?p.data:null});
  }catch(e){res.status(500).json({error:'err'});}
});

app.post('/api/save',async(req,res)=>{
  try{
    if(!dbReady)return res.json({ok:false});
    const uid=getUid(req.body.initData);
    if(!uid)return res.status(401).json({error:'no uid'});
    const p=req.body.progress||{};
    await playersCol.updateOne({_id:uid},{$set:{
      data:p,balance:p.balance||0,level:p.level||1,
      nick:(p.profile&&p.profile.nick)||'Игрок',
      updated:Date.now()
    }},{upsert:true});
    res.json({ok:true});
  }catch(e){res.status(500).json({error:'err'});}
});

app.get('/admin',async(req,res)=>{
  if(req.query.key!==ADMIN_KEY)return res.send('403 Access denied');
  if(!dbReady)return res.send('DB not ready, try in a minute');
  const now=Date.now();
  const players=await playersCol.find().sort({updated:-1}).toArray();
  const total=players.length;
  const online15=players.filter(p=>now-p.updated<15*60*1000).length;
  const online24=players.filter(p=>now-p.updated<24*3600*1000).length;
  const week=players.filter(p=>now-p.updated<7*24*3600*1000).length;
  const sum=players.reduce((s,p)=>s+(p.balance||0),0);
  const top=[...players].sort((a,b)=>(b.balance||0)-(a.balance||0)).slice(0,20);
  const fmt=n=>Math.round(n).toLocaleString('ru-RU')+' ₽';
  const ago=t=>{const d=Math.floor((now-t)/60000);if(d<1)return'только что';if(d<60)return d+' мин';if(d<1440)return Math.floor(d/60)+' ч';return Math.floor(d/1440)+' дн';};
  const topRows=top.map((p,i)=>`<tr><td>${i+1}</td><td>${p.nick||'?'}</td><td>${p._id}</td><td>${fmt(p.balance||0)}</td><td>ур.${p.level||1}</td><td>${ago(p.updated)}</td></tr>`).join('');
  const allRows=players.map(p=>`<tr><td>${p.nick||'?'}</td><td>${p._id}</td><td>${fmt(p.balance||0)}</td><td>ур.${p.level||1}</td><td>${ago(p.updated)}</td></tr>`).join('');
  res.send(`<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>НомерОК · Админ</title><style>
body{margin:0;padding:14px;background:#0a0e14;color:#fff;font-family:Arial,sans-serif}
h1{font-size:22px;margin:0 0 4px}h1 span{color:#21e768}
.sub{color:#7d8590;font-size:12px;margin-bottom:16px}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:18px}
.c{padding:12px;background:#141b24;border:1px solid #2a333e;border-radius:12px}
.c .l{color:#7d8590;font-size:11px;text-transform:uppercase;letter-spacing:.5px}
.c .v{font-size:20px;font-weight:900;margin-top:3px;color:#31ed76}
h2{font-size:15px;margin:18px 0 8px;color:#9aa5b1}
table{width:100%;border-collapse:collapse;font-size:12px;background:#0f141a;border-radius:10px;overflow:hidden}
th,td{padding:7px 6px;text-align:left;border-bottom:1px solid #1e2630}
th{color:#7d8590;font-size:10px;text-transform:uppercase;font-weight:700}
tr:last-child td{border-bottom:0}
.b{display:inline-block;padding:7px 12px;background:#21e768;color:#041008;border-radius:9px;font-weight:900;font-size:12px;text-decoration:none;margin-bottom:12px}
.online{color:#21e768}
</style></head><body>
<h1>🎰 Номер<span>ОК</span> · Админ</h1>
<div class="sub">Обновлено: ${new Date().toLocaleString('ru-RU')}</div>
<a class="b" href="/admin?key=${ADMIN_KEY}">🔄 Обновить</a>
<div class="grid">
  <div class="c"><div class="l">🟢 Онлайн</div><div class="v online">${online15}</div></div>
  <div class="c"><div class="l">За 24 часа</div><div class="v">${online24}</div></div>
  <div class="c"><div class="l">За неделю</div><div class="v">${week}</div></div>
  <div class="c"><div class="l">Всего игроков</div><div class="v">${total}</div></div>
  <div class="c" style="grid-column:1/-1"><div class="l">💰 Денег в игре</div><div class="v">${fmt(sum)}</div></div>
</div>
<h2>🏆 Топ-20 по балансу</h2>
<table><tr><th>#</th><th>Ник</th><th>ID</th><th>Баланс</th><th>Ур.</th><th>Актив</th></tr>${topRows||'<tr><td colspan="6" style="text-align:center;color:#555">Пусто</td></tr>'}</table>
<h2>👥 Все игроки (${total})</h2>
<table><tr><th>Ник</th><th>ID</th><th>Баланс</th><th>Ур.</th><th>Актив</th></tr>${allRows||'<tr><td colspan="5" style="text-align:center;color:#555">Пусто</td></tr>'}</table>
</body></html>`);
});

function getUid(initData){
  if(!initData)return null;
  try{
    const p=new URLSearchParams(initData);
    const u=p.get('user');
    return u?String(JSON.parse(u).id):null;
  }catch(e){return null;}
}

app.listen(PORT,'0.0.0.0',()=>console.log('API on '+PORT));

async function connectMongo(){
  if(!MONGO_URL){console.error('No MONGO_URL');return;}
  try{
    const c=new MongoClient(MONGO_URL,{tls:true,tlsAllowInvalidCertificates:true,tlsAllowInvalidHostnames:true,serverSelectionTimeoutMS:15000});
    await c.connect();
    playersCol=c.db('nomerok').collection('players');
    dbReady=true;
    console.log('MongoDB connected');
  }catch(e){
    console.error('Mongo error:',e.message);
    setTimeout(connectMongo,10000);
  }
}
connectMongo();

const bot=new TelegramBot(BOT_TOKEN,{polling:true});

bot.onText(/\/start/,(msg)=>{
  const name=msg.from.first_name||'друг';
  bot.sendMessage(msg.chat.id,`👋 Привет, ${name}!\n\n🎰 Это *НомерОК* — крути рулетку, собирай красивые номера и богатей!\n\n👇 Жми кнопку ниже чтобы начать`,{
    parse_mode:'Markdown',
    reply_markup:{inline_keyboard:[[{text:'🎰 Играть',web_app:{url:GAME_URL}}]]}
  });
});

bot.onText(/\/help/,(msg)=>bot.sendMessage(msg.chat.id,'📖 /start — игра\n/balance — баланс\n/top — топ-10'));

bot.onText(/\/balance/,async(msg)=>{
  if(!dbReady)return bot.sendMessage(msg.chat.id,'Загрузка...');
  const p=await playersCol.findOne({_id:String(msg.from.id)});
  if(!p)return bot.sendMessage(msg.chat.id,'Жми /start');
  bot.sendMessage(msg.chat.id,`💰 ${Math.round(p.balance).toLocaleString('ru-RU')} ₽ · ур. ${p.level}`);
});

bot.onText(/\/top/,async(msg)=>{
  if(!dbReady)return bot.sendMessage(msg.chat.id,'Загрузка...');
  const top=await playersCol.find().sort({balance:-1}).limit(10).toArray();
  let t='🏆 *Топ-10:*\n\n';
  top.forEach((p,i)=>{t+=`${i+1}. ${p.nick||'?'} — ${Math.round(p.balance).toLocaleString('ru-RU')} ₽\n`;});
  bot.sendMessage(msg.chat.id,t,{parse_mode:'Markdown'});
});

console.log('Bot started');
