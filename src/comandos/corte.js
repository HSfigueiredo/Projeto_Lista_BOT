const axios = require('axios');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const API_URL = process.env.API_IA_URL || 'https://projeto-lista-api.fly.dev';
const CORTES_URL = process.env.PROJETO_CORTES_URL;
const TMP_DIR = path.join(__dirname, '..', '..', 'tmp');
const LIMITE_SEGUNDOS = 3300;

function executar(comando, args, timeout = 600000) {
  return new Promise((resolve, reject) => {
    const proc = spawn(comando, args, { stdio: 'pipe' });
    let stderr = '';
    const timer = setTimeout(() => { proc.kill('SIGKILL'); reject(new Error(`${comando} excedeu ${timeout / 1000}s`)) }, timeout);
    proc.stderr.on('data', (d) => { stderr += d.toString() });
    proc.on('close', (code) => { clearTimeout(timer); code === 0 ? resolve() : reject(new Error(stderr.slice(0, 400))) });
    proc.on('error', (e) => { clearTimeout(timer); reject(e) });
  });
}

function obterDuracao(url) {
  return new Promise((resolve) => {
    const proc = spawn('yt-dlp', ['--no-check-certificate', '--print', '%(duration)s', url], { stdio: 'pipe', timeout: 60000 });
    let out = '';
    proc.stdout.on('data', (d) => { out += d.toString() });
    proc.on('close', (c) => resolve(c === 0 ? Number(out.trim().split('\n')[0]) : null));
    proc.on('error', () => resolve(null));
  });
}

async function baixarVideo(url) {
  fs.mkdirSync(TMP_DIR, { recursive: true });
  const ts = Date.now();
  const videoPath = path.join(TMP_DIR, `video_${ts}.mp4`);
  const duracao = await obterDuracao(url);

  if (duracao && duracao > LIMITE_SEGUNDOS) {
    await executar('yt-dlp', [
      '--no-check-certificate', '--download-sections', `*0-${LIMITE_SEGUNDOS}`,
      '--downloader', 'ffmpeg', '--force-keyframes-at-cuts',
      '-f', 'best[height<=480]', '-o', videoPath, url
    ], 1800000);
  } else {
    await executar('yt-dlp', ['--no-check-certificate', '-f', 'best[height<=480]', '-o', videoPath, url], 1800000);
  }
  return { path: videoPath, duracao };
}

async function transcrever(audioPath) {
  const scriptPath = path.join(__dirname, 'transcricao.py');
  const proc = spawn('python3', [scriptPath, audioPath], { stdio: 'pipe', timeout: 1800000 });
  let out = '', err = '';
  proc.stdout.on('data', (d) => { out += d.toString() });
  proc.stderr.on('data', (d) => { err += d.toString() });
  return new Promise((resolve, reject) => {
    proc.on('close', (c) => c === 0 ? resolve(JSON.parse(out)) : reject(new Error(err.slice(0, 300))));
    proc.on('error', reject);
  });
}

async function analisar(transcricao) {
  const prompt = `Voce e um editor de video especializado em criar cortes virais.\n\nAnalise a transcricao abaixo com timestamps e recomende os MELHORES trechos para transformar em clips.\n\nREGRAS:\n- Priorize cortes SHORTS (15-60s, formato 9:16 para TikTok/Reels/Shorts)\n- Crie LONGOS (5-30min, formato 16:9 para YouTube) APENAS se o conteudo tiver muito valor\n- Cada corte deve ser autocontido (fazer sentido sozinho)\n- Avalie: conteudo(0-10), engajamento(0-10), viralidade(0-10), autocontido(0-10)\n- Calcule viralScore = media das 4 notas\n- Use timestamps exatos em segundos\n- Min 2 cortes, max 10\n- ORDENE do MAIOR viralScore para o MENOR\n- Responda APENAS JSON, sem texto extra\n\nFormato:\n[{"titulo":"...","tipo":"short","start":0,"end":0,"razao":"...","conteudo":0,"engajamento":0,"viralidade":0,"autocontido":0,"viralScore":0}]\n\nTranscricao:\n${JSON.stringify(transcricao)}`;

  const resp = await axios.post(`${API_URL}/ia`, {
    mensagem: prompt, persona: 'preciso', temperatura: 0.3, maxTokens: 4096
  });
  const match = resp.data.resposta.match(/\[[\s\S]*\]/);
  if (!match) throw new Error('Resposta da IA invalida');
  return JSON.parse(match[0]);
}

async function gerarClipes(videoPath, cortes, outputDir) {
  const shortsDir = path.join(outputDir, 'shorts');
  const longsDir = path.join(outputDir, 'longs');
  fs.mkdirSync(shortsDir, { recursive: true });
  fs.mkdirSync(longsDir, { recursive: true });
  const resultados = [];

  for (let i = 0; i < cortes.length; i++) {
    const c = cortes[i];
    const tipo = c.tipo === 'long' ? 'longs' : 'shorts';
    const dir = tipo === 'longs' ? longsDir : shortsDir;
    const nome = `${i + 1}_${c.titulo.replace(/[^a-z0-9]/gi, '_').slice(0, 40)}.mp4`;
    const saida = path.join(dir, nome);

    await executar('ffmpeg', [
      '-i', videoPath, '-ss', String(c.start), '-to', String(c.end),
      '-vf', tipo === 'longs'
        ? 'scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2'
        : 'crop=ih*9/16:ih,scale=720:1280',
      '-c:v', 'libx264', '-preset', 'fast', '-crf', '23',
      '-c:a', 'aac', '-b:a', '128k', '-y', saida
    ], 600000);

    resultados.push({ titulo: c.titulo, tipo, caminho: saida, viralScore: c.viralScore, duracao: Math.round((c.end - c.start) * 10) / 10 });
  }
  return resultados;
}

async function executar(msg, client, estado) {
  const partes = msg.body.trim().split(/\s+/);
  const url = partes[1];
  if (!url) { msg.reply('Formato: /corte URL_DO_YOUTUBE'); return; }

  msg.reply('⏳ Verificando video...');
  try {
    const info = await baixarVideo(url);
    msg.reply(info.duracao && info.duracao > LIMITE_SEGUNDOS
      ? `⏳ Video tem ${Math.round(info.duracao / 60)}min. Baixando primeiros 55min...`
      : `⏳ Video baixado. Extraindo audio...`);

    const audioPath = info.path.replace(/\.mp4$/, '.wav');
    await executar('ffmpeg', ['-i', info.path, '-vn', '-acodec', 'pcm_s16le', '-ar', '16000', '-ac', '1', '-y', audioPath], 300000);

    msg.reply('⏳ Transcrevendo com IA (Whisper)...');
    const transcricao = await transcrever(audioPath);
    try { fs.unlinkSync(audioPath); } catch (_) {}

    msg.reply('⏳ Analisando melhores momentos com DeepSeek...');
    const cortes = await analisar(transcricao);
    const topCortes = cortes.sort((a, b) => b.viralScore - a.viralScore);
    const resumo = topCortes.map(c => `🎬 ${c.titulo} (${c.tipo} - ${Math.round((c.end - c.start) * 10) / 10}s - viral: ${c.viralScore})`).join('\n');
    msg.reply(`🤖 DeepSeek recomenda ${topCortes.length} cortes:\n${resumo}`);

    const pasta = path.join(TMP_DIR, `cortes_${Date.now()}`);
    msg.reply('⏳ Gerando clipes com ffmpeg...');
    const clipes = await gerarClipes(info.path, topCortes, pasta);

    // Tenta salvar no diretorio padrao de Downloads se existir
    const home = process.env.HOME || process.env.USERPROFILE;
    const pastaFinal = home ? path.join(home, 'ProjetoCortes', `cortes_${new Date().toISOString().slice(0, 10)}`) : pasta;
    try {
      fs.cpSync(pasta, pastaFinal, { recursive: true });
    } catch (_) {}

    const shorts = clipes.filter(c => c.tipo === 'short');
    const longs = clipes.filter(c => c.tipo === 'long');
    let msgFinal = `✅ ${clipes.length} clipes gerados!\n📁 ${pastaFinal}\n\n`;
    if (shorts.length) msgFinal += `📱 Shorts (9:16): ${shorts.length}\n`;
    if (longs.length) msgFinal += `🎥 Longos (16:9): ${longs.length}\n`;
    msgFinal += `\n🎯 Melhor corte: "${topCortes[0].titulo}" (viralScore: ${topCortes[0].viralScore}/10)`;
    msg.reply(msgFinal);

    if (CORTES_URL) {
      try {
        await axios.post(`${CORTES_URL}/clips`, { url, videoPath: info.path }, { headers: { Authorization: 'Bearer token_teste' }, timeout: 5000 });
      } catch (_) {}
    }
  } catch (error) {
    const detalhe = error.response?.data?.detalhe || error.message || 'erro desconhecido';
    msg.reply(`❌ Erro: ${detalhe.slice(0, 500)}`);
  }
}

module.exports = { executar };
