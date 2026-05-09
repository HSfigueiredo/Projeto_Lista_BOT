const axios = require('axios');

const API_URL = process.env.API_IA_URL || 'http://localhost:3000';

async function executar(msg, client, estado) {
    const partes = msg.body.trim().split(/\s+/);
    const texto = partes.slice(1).join(' ');

    if (!texto) {
        msg.reply('Formato: /ia SUA PERGUNTA\nExemplo: /ia Qual a capital do Brasil?');
        return;
    }

    msg.reply('🤔 Pensando...');

    try {
        const response = await axios.post(`${API_URL}/ia`, {
            mensagem: texto,
            persona: 'preciso'
        });

        const { resposta } = response.data;
        await msg.reply(resposta);

    } catch (error) {
        console.error('Erro ao consultar IA:', error.response?.data || error.message);
        const detalhe = error.response?.data?.detalhe || error.message;
        await msg.reply(`❌ Erro ao consultar a IA: ${detalhe}`);
    }
}

module.exports = { executar };