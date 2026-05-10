const axios = require('axios');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const API_URL = process.env.API_IA_URL || 'https://projeto-lista-api.fly.dev';
const TMP_DIR = path.join(__dirname, '..', '..', 'tmp');
const CORTES_DIR = path.join(process.env.HOME || process.env.USERPROFILE || '.', 'Documentos', 'Cortes');
const EXEMPLOS_PATH = path.join(CORTES_DIR, '_exemplos.json');
const LIMITE_SEGUNDOS = 3300;

fs.mkdirSync(TMP_DIR, { recursive: true });
fs.mkdirSync(path.join(CORTES_DIR, 'shorts'), { recursive: true });
fs.mkdirSync(path.join(CORTES_DIR, 'longs'), { recursive: true });

function carregarExemplos() {
  try { return JSON.parse(fs.readFileSync(EXEMPLOS_PATH, 'utf-8')); } catch (_) { return []; }
}

function salvarExemplo(corte, videoUrl) {
  const exemplos = carregarExemplos();
  exemplos.unshift({ ...corte, videoUrl, data: new Date().toISOString() });
  fs.writeFileSync(EXEMPLOS_PATH, JSON.stringify(exemplos.slice(0, 20), null, 2));
}

function montarPromptComExemplos(transcricao) {
  const exemplos = carregarExemplos();
  const exemplosText = exemplos.length
    ? `\n\nEXEMPLOS DE CORTES BEM-SUCEDIDOS (usar como referencia de qualidade):\n${JSON.stringify(exemplos.slice(0, 5), null, 2)}`
    : '';

  return `Voce e um editor de video especializado em criar cortes virais.

Analise a transcricao abaixo com timestamps word-level e recomende os MELHORES trechos para transformar em clips.

REGRAS:
- Priorize cortes SHORTS (15-60s, formato 9:16 para TikTok/Reels/Shorts)
- Crie LONGOS (5-30min, formato 16:9 para YouTube) APENAS se o conteudo tiver muito valor narrativo
- Cada corte deve ser AUTOCONTIDO (fazer sentido sozinho, sem contexto previo)
- Use timestamps EXATOS em segundos (nao corte no meio de uma palavra)
- Evite cortes que comecam com "entao", "mas", "porque" (falta contexto)
- Prefira cortes que comecam com uma pergunta, uma afirmacao forte ou um gancho

AVALIE cada corte com notas de 0-10:
- conteudo: o assunto e relevante/interessante?
- engajamento: prende atencao? tem gancho nos primeiros 3s?
- viralidade: pode viralizar? e compartilhave?
- autocontido: faz sentido sozinho sem o resto do video?

Calcule viralScore = media das 4 notas.

Ordene do MAIOR viralScore para o MENOR.
Minimo 2 cortes, maximo 10.
Responda APENAS JSON, sem texto extra.

Formato:
[{"titulo":"titulo chamativo","tipo":"short","start":0,"end":0,"razao":"por que este trecho funciona","conteudo":0,"engajamento":0,"viralidade":0,"autocontido":0,"viralScore":0}]${exemplosText}\n\nTranscricao:\n${JSON.stringify(transcricao)}`;
}

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
  const prompt = montarPromptComExemplos(transcricao);
  const resp = await axios.post(`${API_URL}/ia`, {
    mensagem: prompt, persona: 'preciso', temperatura: 0.3, maxTokens: 4096
  });
  const match = resp.data.resposta.match(/\[[\s\S]*\]/);
  if (!match) throw new Error('Resposta da IA nao contem JSON');
  return JSON.parse(match[0]);
}

async function gerarClipes(videoPath, cortes, nomeVideo) {
  const pastaBase = path.join(CORTES_DIR, nomeVideo);
  const shortsDir = path.join(pastaBase, 'shorts');
  const longsDir = path.join(pastaBase, 'longs');
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

    resultados.push({
      titulo: c.titulo, tipo, caminho: saida,
      viralScore: c.viralScore,
      duracao: Math.round((c.end - c.start) * 10) / 10,
      start: c.start, end: c.end, razao: c.razao
    });
  }

  return resultados;
}

async function executar(msg, client, estado) {
  const partes = msg.body.trim().split(/\s+/);
  const url = partes[1];
  const comandoCompleto = msg.body.trim();
  const isFeedback = comandoCompleto.startsWith('/corte-feedback');

  if (isFeedback) {
    const args = partes.slice(1);
    const acao = args[0]; // 'bom' ou 'ruim'
    const idx = parseInt(args[1]) - 1;
    // Feedback é processado via mensagem separada (ver no handler de mensagem)
    return;
  }

  if (!url) { msg.reply('Formato: /corte URL_DO_YOUTUBE'); return; }

  msg.reply('⏳ Verificando video...');
  try {
    const info = await baixarVideo(url);
    const duracaoStr = info.duracao
      ? `${Math.round(info.duracao / 60)}min`
      : 'duracao desconhecida';

    msg.reply(info.duracao && info.duracao > LIMITE_SEGUNDOS
      ? `⏳ Video tem ${duracaoStr}. Baixando primeiros 55min...`
      : `⏳ Video (${duracaoStr}) baixado. Extraindo audio...`);

    const audioPath = info.path.replace(/\.mp4$/, '.wav');
    await executar('ffmpeg', ['-i', info.path, '-vn', '-acodec', 'pcm_s16le', '-ar', '16000', '-ac', '1', '-y', audioPath], 300000);

    msg.reply('⏳ Transcrevendo com IA (Whisper)...');
    const transcricao = await transcrever(audioPath);
    try { fs.unlinkSync(audioPath); } catch (_) {}

    msg.reply('⏳ Analisando melhores momentos com DeepSeek...');
    const cortes = await analisar(transcricao);
    const topCortes = cortes.sort((a, b) => b.viralScore - a.viralScore);

    const resumo = topCortes.map((c, i) =>
      `🎬 #${i + 1} ${c.titulo}\n   ${c.tipo} | ${Math.round((c.end - c.start) * 10) / 10}s | viral: ${c.viralScore}/10`
    ).join('\n');
    msg.reply(`🤖 DeepSeek recomenda ${topCortes.length} cortes:\n${resumo}`);

    msg.reply('⏳ Gerando clipes com ffmpeg...');
    const nomeBase = `video_${new Date().toISOString().slice(0, 10)}`;
    const clipes = await gerarClipes(info.path, topCortes, nomeBase);

    const shorts = clipes.filter(c => c.tipo === 'short');
    const longs = clipes.filter(c => c.tipo === 'long');

    let msgFinal = `✅ ${clipes.length} clipes gerados!\n📁 ${path.join(CORTES_DIR, nomeBase)}\n\n`;
    if (shorts.length) msgFinal += `📱 Shorts (9:16): ${shorts.length}\n`;
    if (longs.length) msgFinal += `🎥 Longos (16:9): ${longs.length}\n`;
    msgFinal += `\n🏆 Melhor: "${topCortes[0].titulo}" (viralScore: ${topCortes[0].viralScore}/10)`;
    msgFinal += `\n\n📌 Para ajudar a IA a melhorar, responda:\n"gostei do corte 1" ou "nao gostei do corte 3"`;
    msg.reply(msgFinal);

    // Salva os cortes como exemplos
    topCortes.forEach(c => salvarExemplo(c, url));

    // Copia tambem para os diretorios fixos
    const shortsFixos = path.join(CORTES_DIR, 'shorts');
    const longsFixos = path.join(CORTES_DIR, 'longs');
    for (const clip of clipes) {
      const dir = clip.tipo === 'longs' ? longsFixos : shortsFixos;
      try { fs.copyFileSync(clip.caminho, path.join(dir, `${nomeBase}_${path.basename(clip.caminho)}`)); } catch (_) {}
    }

    // Remove video temporario
    try { fs.unlinkSync(info.path); } catch (_) {}

  } catch (error) {
    const detalhe = error.response?.data?.detalhe || error.message || 'erro desconhecido';
    msg.reply(`❌ Erro: ${detalhe.slice(0, 500)}`);
  }
}

module.exports = { executar };
