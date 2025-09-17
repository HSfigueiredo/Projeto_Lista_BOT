const { Client, LocalAuth } = require('whatsapp-web.js');
const axios = require('axios');


const client = new Client({
    puppeteer: {
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-extensions',
            '--disable-gpu'
        ],
	dumpio: false
    },
    authStrategy: new LocalAuth({ clientId: "bot_lista", dataPath: "./sessions" })
});

client.on('qr', async (qr) => {

    try {
            await axios.post('https://projetolistaapi-production.up.railway.app/qr', {qr})
        }
        catch (error) {
            console.error(error.message);
        };
});

client.on('loading_screen', (percent, message) => {
    console.log(`Carregando WhatsApp... ${percent}% - ${message}`);
});

client.on('auth_failure', msg => {
    console.error('Falha na autenticação:', msg);
});


client.on('ready', () => {
    console.log('WhatsApp pronto!');
});


client.on('message', async msg => {
    console.log(`Mensagem de ${msg.from}: ${msg.body}`);


    if (msg.body === 'Lista' || msg.body === 'lista') {

        try {
            const resposta = await axios.get('https://projetolistaapi-production.up.railway.app/')
            await msg.reply(resposta.data)
        }
        catch (error) {
            console.error(error.message);

            await msg.reply('Erro ao obter a lista.');
        };

    };

});

client.initialize();
