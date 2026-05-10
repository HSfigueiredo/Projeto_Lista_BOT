const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const API_URL = process.env.API_IA_URL || 'https://projeto-lista-api.fly.dev';
const TMP_DIR = path.join(__dirname, '..', '..', 'tmp');
const CORTES_DIR = path.join(process.env.HOME || process.env.USERPROFILE || '.', 'Documentos', 'Cortes');
const LIMITE_SEGUNDOS = 3300;

fs.mkdirSync(TMP_DIR, { recursive: true });
fs.mkdirSync(path.join(CORTES_DIR, 'shorts'), { recursive: true });
fs.mkdirSync(path.join(CORTES_DIR, 'longs'), { recursive: true });

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

function converterParaSegundos(str) {
  str = str.trim().replace(',', '.')
  if (str.includes(':')) {
    const partes = str.split(':')
    if (partes.length === 2) return parseFloat(partes[0]) * 60 + parseFloat(partes[1])
    if (partes.length === 3) return parseFloat(partes[0]) * 3600 + parseFloat(partes[1]) * 60 + parseFloat(partes[2])
  }
  return parseFloat(str)
}

function parsearTimestamps(args) {
  const timestamps = []
  for (const arg of args) {
    const separador = arg.match(/[-–]/)
    if (!separador) continue
    const idx = arg.indexOf(separador[0])
    const startStr = arg.slice(0, idx)
    const endStr = arg.slice(idx + 1)
    const start = converterParaSegundos(startStr)
    const end = converterParaSegundos(endStr)
    if (!isNaN(start) && !isNaN(end) && end > start) {
      timestamps.push({ start, end })
    }
  }
  return timestamps
}

function ajustarParaPalavras(transcricao, timestamps) {
  const palavras = transcricao.segments.flatMap(s => s.words || []);
  if (!palavras.length) return timestamps;

  const ajustados = [];
  for (const ts of timestamps) {
    let startWord = null, endWord = null;

    for (const w of palavras) {
      if (!startWord && w.end >= ts.start) startWord = w;
      if (!endWord && w.start <= ts.end) endWord = w;
    }

    if (!startWord) startWord = palavras[0];
    if (!endWord) endWord = palavras[palavras.length - 1];

    ajustados.push({
      start: startWord.start,
      end: endWord.end,
      startOriginal: ts.start,
      endOriginal: ts.end
    });
  }
  return ajustados;
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

async function gerarClipes(videoPath, cortes, nomeBase) {
  const pastaBase = path.join(CORTES_DIR, nomeBase);
  const shortsDir = path.join(pastaBase, 'shorts');
  const longsDir = path.join(pastaBase, 'longs');
  fs.mkdirSync(shortsDir, { recursive: true });
  fs.mkdirSync(longsDir, { recursive: true });

  const resultados = [];
  for (let i = 0; i < cortes.length; i++) {
    const c = cortes[i];
    const duracao = c.end - c.start
    const tipo = duracao <= 180 ? 'short' : 'long'
    const dir = tipo === 'long' ? longsDir : shortsDir;
    const nome = `${i + 1}_${(c.titulo || 'corte').replace(/[^a-z0-9]/gi, '_').slice(0, 40)}.mp4`;
    const saida = path.join(dir, nome);

    await executar('ffmpeg', [
      '-i', videoPath, '-ss', String(c.start), '-to', String(c.end),
      '-vf', tipo === 'long'
        ? 'scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2'
        : 'crop=ih*9/16:ih,scale=720:1280',
      '-c:v', 'libx264', '-preset', 'fast', '-crf', '23',
      '-c:a', 'aac', '-b:a', '128k', '-y', saida
    ], 600000);

    resultados.push({ titulo: c.titulo || `Corte ${i + 1}`, tipo, caminho: saida, start: c.start, end: c.end });
  }
  return resultados;
}

async function executar(msg, client, estado) {
  const partes = msg.body.trim().split(/\s+/);
  const url = partes[1];
  const args = partes.slice(2);
  const timestampsUsuario = parsearTimestamps(args);

  if (!url) { msg.reply('Formato: /corte URL [inicio-fim inicio-fim ...]\nEx: /corte https://youtube.com/watch?v=ABC 12.5-45.2 60-120'); return; }

  msg.reply('⏳ Verificando video...');
  try {
    const info = await baixarVideo(url);
    const duracao = info.duracao || 0;
    const duracaoStr = duracao ? `${Math.round(duracao / 60)}min` : '?';

    if (timestampsUsuario.length > 0) {
      msg.reply(duracao > LIMITE_SEGUNDOS
        ? `⏳ Video tem ${duracaoStr}. Baixando primeiros 55min...`
        : `⏳ Video (${duracaoStr}) baixado. Extraindo audio...`);

      const audioPath = info.path.replace(/\.mp4$/, '.wav');
      await executar('ffmpeg', ['-i', info.path, '-vn', '-acodec', 'pcm_s16le', '-ar', '16000', '-ac', '1', '-y', audioPath], 300000);

      msg.reply('⏳ Transcrevendo com Whisper...');
      const transcricao = await transcrever(audioPath);
      try { fs.unlinkSync(audioPath); } catch (_) {}

      msg.reply(`⏳ Ajustando ${timestampsUsuario.length} cortes aos limites das palavras...`);
      const ajustados = ajustarParaPalavras(transcricao, timestampsUsuario);

      const cortes = ajustados.map((a, i) => ({
        titulo: `Corte ${i + 1}`,
        start: a.start, end: a.end
      }));

      const detalhes = ajustados.map((a, i) =>
        `🎬 #${i + 1}: ${a.startOriginal}s-${a.endOriginal}s → ${a.start.toFixed(1)}s-${a.end.toFixed(1)}s (${Math.round((a.end - a.start) * 10) / 10}s)`
      ).join('\n');
      msg.reply(`✅ Ajustes concluidos:\n${detalhes}`);

      msg.reply('⏳ Gerando clipes...');
      const nomeBase = `video_${new Date().toISOString().slice(0, 10)}`;
      const clipes = await gerarClipes(info.path, cortes, nomeBase);

      const shorts = clipes.filter(c => c.tipo === 'short');
      const longs = clipes.filter(c => c.tipo === 'long');

      let msgFinal = `✅ ${clipes.length} clipes gerados!\n📁 ${path.join(CORTES_DIR, nomeBase)}\n`;
      if (shorts.length) msgFinal += `\n📱 Shorts (9:16): ${shorts.length}`;
      if (longs.length) msgFinal += `\n🎥 Longos (16:9): ${longs.length}`;

      for (const clip of clipes) {
        const dir = clip.tipo === 'long' ? path.join(CORTES_DIR, 'longs') : path.join(CORTES_DIR, 'shorts');
        try { fs.copyFileSync(clip.caminho, path.join(dir, `${nomeBase}_${path.basename(clip.caminho)}`)); } catch (_) {}
      }

      msg.reply(msgFinal);

    } else {
      msg.reply(duracao > LIMITE_SEGUNDOS
        ? `⏳ Video tem ${duracaoStr}. Baixando primeiros 55min...`
        : `⏳ Baixando video completo (${duracaoStr})...`);

      const nomeBase = `video_${new Date().toISOString().slice(0, 10)}_completo.mp4`;
      const destino = path.join(CORTES_DIR, 'longs', nomeBase);
      try { fs.copyFileSync(info.path, destino); } catch (_) {}

      msg.reply(`✅ Video completo salvo!\n📁 ${destino}\n⏱️ Duracao: ${duracaoStr}`);
    }

    try { fs.unlinkSync(info.path); } catch (_) {}

  } catch (error) {
    const detalhe = error.response?.data?.detalhe || error.message || 'erro desconhecido';
    msg.reply(`❌ Erro: ${detalhe.slice(0, 500)}`);
  }
}

module.exports = { executar };
