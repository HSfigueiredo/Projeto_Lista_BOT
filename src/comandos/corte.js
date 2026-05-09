const axios = require('axios');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const CORTES_URL = process.env.PROJETO_CORTES_URL || 'http://localhost:3001';
const TIKTOK_ACCOUNT_ID = process.env.TIKTOK_ACCOUNT_ID;
const TMP_DIR = path.join(__dirname, '..', '..', 'tmp');
const LIMITE_SEGUNDOS = 3300;

function executarComando(comando, args, timeout = 600000) {
  return new Promise((resolve, reject) => {
    const proc = spawn(comando, args, { stdio: 'pipe' });
    let stderr = '';
    const timer = setTimeout(() => { proc.kill('SIGKILL'); reject(new Error(`${comando} excedeu ${timeout / 1000}s`)); }, timeout);
    proc.stderr.on('data', (d) => { stderr += d.toString(); });
    proc.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(stderr.slice(0, 400)));
    });
    proc.on('error', (e) => { clearTimeout(timer); reject(e); });
  });
}

function obterDuracao(url) {
  return new Promise((resolve) => {
    const proc = spawn('yt-dlp', ['--no-check-certificate', '--print', '%(duration)s', url], { stdio: 'pipe', timeout: 60000 });
    let out = '';
    proc.stdout.on('data', (d) => { out += d.toString(); });
    proc.on('close', (c) => { resolve(c === 0 ? Number(out.trim().split('\n')[0]) : null); });
    proc.on('error', () => resolve(null));
  });
}

async function baixarETrimmar(url) {
  fs.mkdirSync(TMP_DIR, { recursive: true });
  const duracao = await obterDuracao(url);
  const ts = Date.now();

  if (duracao && duracao > LIMITE_SEGUNDOS) {
    const outputPath = path.join(TMP_DIR, `corte_${ts}.mp4`);
    console.log(`Baixando primeiros ${Math.floor(LIMITE_SEGUNDOS / 60)}min com ffmpeg (480p)`);
    await executarComando('yt-dlp', [
      '--no-check-certificate',
      '--download-sections', `*0-${LIMITE_SEGUNDOS}`,
      '--downloader', 'ffmpeg',
      '--force-keyframes-at-cuts',
      '-f', 'best[height<=480]',
      '-o', outputPath, url
    ], 1800000);
    return { path: outputPath, trimmado: true, duracaoOriginal: duracao };
  }

  const outputPath = path.join(TMP_DIR, `corte_${ts}.mp4`);
  console.log(`Video curto (${duracao ? Math.round(duracao / 60) + 'min' : '?'}), baixando completo`);
  await executarComando('yt-dlp', ['--no-check-certificate', '-f', 'best[height<=480]', '-o', outputPath, url], 1800000);
  return { path: outputPath, trimmado: false };
}

async function uploadParaTransfer(pathArquivo) {
  const FormData = require('form-data');
  const form = new FormData();
  form.append('file', fs.createReadStream(pathArquivo));
  const resp = await axios.post('https://transfer.sh', form, {
    headers: { ...form.getHeaders(), 'User-Agent': 'curl' },
    maxContentLength: Infinity,
    maxBodyLength: Infinity,
    timeout: 600000
  });
  return resp.data.trim();
}

async function executar(msg, client, estado) {
  const partes = msg.body.trim().split(/\s+/);
  const url = partes[1];
  const caption = partes.slice(2).join(' ');

  if (!url) {
    msg.reply('Formato: /corte URL_DO_YOUTUBE [legenda opcional]\nExemplo: /corte https://www.youtube.com/watch?v=SEU_VIDEO');
    return;
  }

  if (!TIKTOK_ACCOUNT_ID) {
    msg.reply('❌ TIKTOK_ACCOUNT_ID nao configurado nas variaveis de ambiente.');
    return;
  }

  msg.reply('⏳ Verificando video...');

  try {
    const duracao = await obterDuracao(url);

    let videoUrl = url;
    let videoType = 2;
    let arquivoTemp = null;

    if (duracao && duracao > LIMITE_SEGUNDOS) {
      msg.reply(`⏳ Video tem ${Math.round(duracao / 60)}min. Baixando primeiros ${Math.floor(LIMITE_SEGUNDOS / 60)}min...`);
      const info = await baixarETrimmar(url);
      arquivoTemp = info.path;

      msg.reply('⏳ Enviando para transfer.sh...');
      videoUrl = await uploadParaTransfer(info.path);

      try { fs.unlinkSync(info.path); } catch (_) {}
      videoType = 1;
      msg.reply('⏳ Video hospedado. Enviando para Vizard...');
    } else if (duracao) {
      msg.reply(`⏳ Video tem ${Math.round(duracao / 60)}min, dentro do limite.`);
    } else {
      msg.reply('⏳ Nao foi possivel verificar duracao, enviando mesmo assim...');
    }

    const body = {
      url: videoUrl,
      videoType,
      tiktokAccountId: TIKTOK_ACCOUNT_ID,
      maxClips: 5,
      intervaloMinutos: 15
    };

    if (caption) body.caption = caption;

    const response = await axios.post(`${CORTES_URL}/clips`, body, {
      headers: { Authorization: 'Bearer token_teste' }
    });

    const { jobId } = response.data;
    msg.reply(`⏳ Cortando video... Job #${jobId}. Acompanhando progresso...`);

    let concluido = false;
    while (!concluido) {
      await new Promise((r) => setTimeout(r, 30000));

      try {
        const statusRes = await axios.get(`${CORTES_URL}/clips/${jobId}`, {
          headers: { Authorization: 'Bearer token_teste' }
        });

        const { status, resultado } = statusRes.data;

        if (status === 'completed') {
          const pub = resultado?.publicados || 0;
          const total = resultado?.totalClips || 0;
          msg.reply(`✅ ${pub} clipes publicados no TikTok!\n🎯 ${total} clipes gerados no total (top ${pub} com maior viral score publicados, 15min de intervalo entre cada).`);
          concluido = true;
        } else if (status === 'failed') {
          const motivo = statusRes.data.erro || (resultado ? JSON.stringify(resultado) : 'erro desconhecido');
          msg.reply(`❌ Falha ao processar video: ${motivo}`);
          concluido = true;
        }
      } catch (pollErro) {
        msg.reply(`⚠️ Erro ao verificar status: ${pollErro.message}`);
        concluido = true;
      }
    }
  } catch (error) {
    const detalhe = error.response?.data?.mensagem || error.message;
    msg.reply(`❌ Erro ao criar job de corte: ${detalhe}`);
  }
}

module.exports = { executar };
