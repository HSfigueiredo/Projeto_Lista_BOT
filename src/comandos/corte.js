const axios = require('axios');

const CORTES_URL = process.env.PROJETO_CORTES_URL || 'http://localhost:3001';
const TIKTOK_ACCOUNT_ID = process.env.TIKTOK_ACCOUNT_ID;

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

    msg.reply(`⏳ Enviando video para processamento...`);

    try {
        const body = {
            url,
            tiktokAccountId: TIKTOK_ACCOUNT_ID,
            maxClips: 5,
            intervaloMinutos: 15
        };

        if (caption) {
            body.caption = caption;
        }

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
                    msg.reply(`❌ Falha ao processar video: ${resultado ? JSON.stringify(resultado) : 'erro desconhecido'}`);
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
