const { Client, LocalAuth } = require('whatsapp-web.js');
const axios = require('axios');

const qrcode = require('qrcode-terminal');

const client = new Client({
    authStrategy: new LocalAuth()
});

client.on('qr', (qr) => {
    qrcode.generate(qr, { small: true });
});

client.on('message', async msg => {
    console.log(`Mensagem de ${msg.from}: ${msg.body}`);


    if (msg.body === 'Lista' || msg.body === 'lista') {

        try {
            const resposta = await axios.get('http://localhost:3000/')
            await msg.reply(resposta.data)
        }
        catch (error) {
            console.error(error.message);

            await msg.reply('Erro ao obter a lista.');
        };

    };

});

client.initialize();