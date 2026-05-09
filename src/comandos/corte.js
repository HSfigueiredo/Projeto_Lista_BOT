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
        const proc = spawn(comando, args, { stdio: 'pipe', timeout });
        let stderr = '';
        proc.stderr.on('data', (d) => { stderr += d.toString(); });
        proc.on('close', (code) => {
            if (code === 0) resolve();
            else reject(new Error(stderr.slice(0, 300)));
        });
        proc.on('error', reject);
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
    const ts = Date.now();
    const rawPath = path.join(TMP_DIR, `corte_${ts}.mp4`);
    const finalPath = path.join(TMP_DIR, `corte_${ts}_trimmed.mp4`);

    const duracao = await obterDuracao(url);

    if (duracao && duracao > LIMITE_SEGUNDOS) {
        const minutos = Math.floor(LIMITE_SEGUNDOS / 60);
        console.log(`Video tem ${Math.round(duracao / 60)}min, baixando primeiros ${minutos}min`);

        const secoes = `${minutos}-${minutos + 1}`;
        await executarComando('yt-dlp', [
            '--download-sections', `*${secoes}`,
            '--force-keyframes-at-cuts',
            '--no-check-certificate',
            '-o', rawPath, url
        ]);

        await executarComando('ffmpeg', [
            '-i', rawPath, '-t', String(LIMITE_SEGUNDOS),
            '-c', 'copy', '-y', finalPath
        ], 120000);

        try { fs.unlinkSync(rawPath); } catch (_) {}
        return { path: finalPath, trimmado: true, duracaoOriginal: duracao };
    }

    console.log(`Video tem ${duracao ? Math.round(duracao / 60) + 'min' : 'duracao desconhecida'}, baixando completo`);
    await executarComando('yt-dlp', ['--no-check-certificate', '-o', rawPath, url]);
    return { path: rawPath, trimmado: false };
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

    msg.reply(`⏳ Verificando video...`);

    try {
        const duracao = await obterDuracao(url);

        let videoUrl = url;
        let videoType = 2;
        let arquivoTemp = null;

        if (duracao && duracao > LIMITE_SEGUNDOS) {
            msg.reply(`⏳ Video tem ${Math.round(duracao / 60)}min. Baixando e trimando para 55min...`);
            const info = await baixarETrimmar(url);
            arquivoTemp = info.path;

            msg.reply(`⏳ Enviando para transfer.sh...`);
            videoUrl = await uploadParaTransfer(info.path);
            videoType = 1;

            try { fs.unlinkSync(info.path); } catch (_) {}
            msg.reply(`⏳ Video hospedado em transfer.sh, enviando para Vizard...`);
        } else if (duracao) {
            msg.reply(`⏳ Video tem ${Math.round(duracao / 60)}min, dentro do limite. Enviando direto...`);
        } else {
            msg.reply(`⏳ Nao foi possivel verificar duracao, enviando mesmo assim...`);
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
