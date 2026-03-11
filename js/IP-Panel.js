export default async function(ctx){

const TIMEOUT = 3000
const proxyUrl = "https://my.ippure.com/v1/info"

let landing = {
 ip:"Loading",
 flag:"🏳️",
 country:"",
 city:"",
 risk:0,
 asn:"",
 org:""
}

// ----------------
// 获取IP信息
// ----------------

try{

 let res = await fetch(proxyUrl)
 let j = JSON.parse(res.data)

 landing.ip = j.ip
 landing.country = j.country
 landing.city = j.city
 landing.flag = flagEmoji(j.countryCode)
 landing.risk = j.fraudScore || 0
 landing.asn = j.asn
 landing.org = j.asOrganization

}catch{}

// ----------------
// 并发检测
// ----------------

let [
 netflix,
 disney,
 youtube,
 tiktok,
 chatgpt,
 claude,
 gemini
] = await Promise.all([
 checkNetflix(),
 checkDisney(),
 checkYouTube(),
 checkTikTok(),
 checkChatGPT(),
 checkClaude(),
 checkGemini()
])

// ----------------
// Small Widget
// ----------------

if(ctx.widgetFamily=="systemSmall"){

 return {
  type:"widget",
  padding:12,
  children:[

   text("🌏 IP INFO","headline","bold"),

   text(`${landing.flag} ${landing.country}`),

   text(landing.ip,"caption2"),

   spacer(8),

   text("Netflix "+netflix,"caption2"),
   text("ChatGPT "+chatgpt,"caption2")

  ]
 }

}

// ----------------
// Medium Widget
// ----------------

if(ctx.widgetFamily=="systemMedium"){

 return {
  type:"widget",
  padding:14,

  children:[

   text("🌏 IP 信息","headline","bold"),

   text(`${landing.flag} ${landing.country} ${landing.city}`),

   text(`IP ${landing.ip}`,"caption2"),

   text(`ASN AS${landing.asn}`,"caption2"),

   spacer(8),

   text("🎬 Streaming","caption1","bold"),

   row("Netflix",netflix),
   row("Disney",disney),
   row("YouTube",youtube),
   row("TikTok",tiktok),

   spacer(6),

   text("🤖 AI","caption1","bold"),

   row("ChatGPT",chatgpt),
   row("Claude",claude),
   row("Gemini",gemini)

  ]
 }

}

// ----------------
// Large Widget
// ----------------

return {

 type:"widget",
 padding:16,

 children:[

  text("🌏 IP 信息面板","headline","bold"),

  text(`${landing.flag} ${landing.country} ${landing.city}`),

  text(`IP ${landing.ip}`),

  text(`ASN AS${landing.asn} ${landing.org}`),

  text(`Risk ${landing.risk}`),

  spacer(10),

  text("🎬 Streaming","headline","bold"),

  row("Netflix",netflix),
  row("Disney+",disney),
  row("YouTube",youtube),
  row("TikTok",tiktok),

  spacer(10),

  text("🤖 AI","headline","bold"),

  row("ChatGPT",chatgpt),
  row("Claude",claude),
  row("Gemini",gemini)

 ]

}


// ======================
// 工具函数
// ======================

function row(name,status){

 return {
  type:"stack",
  direction:"row",
  children:[
   {type:"text",text:name},
   {type:"spacer"},
   {type:"text",text:status}
  ]
 }

}

function text(t,size="body",weight="regular"){

 return {
  type:"text",
  text:t,
  font:{size,weight}
 }

}

function spacer(n=6){

 return {type:"spacer",length:n}

}

// ----------------
// 检测函数
// ----------------

async function checkNetflix(){

 try{
  let r = await fetch("https://www.netflix.com/title/81280792")

  if(r.status==200) return "✅"
  if(r.status==404) return "⚠️"
  return "❌"

 }catch{return "❌"}

}

async function checkDisney(){

 try{
  let r = await fetch("https://www.disneyplus.com")

  return r.status==200 ? "✅":"❌"

 }catch{return "❌"}

}

async function checkYouTube(){

 try{
  let r = await fetch("https://www.youtube.com/premium")

  return r.status==200 ? "✅":"❌"

 }catch{return "❌"}

}

async function checkTikTok(){

 try{
  let r = await fetch("https://www.tiktok.com")

  return r.status==200 ? "✅":"❌"

 }catch{return "❌"}

}

async function checkChatGPT(){

 try{
  let r = await fetch("https://chat.openai.com")

  return r.status==200 ? "✅":"❌"

 }catch{return "❌"}

}

async function checkClaude(){

 try{
  let r = await fetch("https://claude.ai")

  return r.status==200 ? "✅":"❌"

 }catch{return "❌"}

}

async function checkGemini(){

 try{
  let r = await fetch("https://gemini.google.com")

  return r.status==200 ? "✅":"❌"

 }catch{return "❌"}

}


// ----------------
// fetch封装
// ----------------

function fetch(url){

 return new Promise(resolve=>{

  $httpClient.get({url,timeout:TIMEOUT},(err,res,data)=>{

   if(err) resolve({status:500,data:null})

   else{
    res.data=data
    resolve(res)
   }

  })

 })

}

function flagEmoji(code){

 if(!code) return "🏳️"

 return String.fromCodePoint(
  ...code.toUpperCase().split('').map(c=>127397+c.charCodeAt())
 )

}

}