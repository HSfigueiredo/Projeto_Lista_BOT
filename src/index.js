const { Client, LocalAuth } = require('whatsapp-web.js');
const axios = require('axios');
const qrcode = require('qrcode-terminal');
const { rotear } = require('./comandos');

const estado = {
    ativo: false,
    usuario: null,
    alvo: null,
    enviadas: 0,
    total: 0
};

const client = new Client({
    puppeteer: {
        headless: true,
        executablePath: '/home/hyan/.cache/puppeteer/chrome/linux-146.0.7680.31/chrome-linux64/chrome',
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-extensions',
            '--disable-gpu',
            '--disable-web-security',
            '--disable-features=IsolateOrigins,site-per-process',
            '--disable-session-crashed-bubble',
            '--disable-software-rasterizer'
        ],
        dumpio: false
    },
    authStrategy: new LocalAuth({ clientId: "bot_lista", dataPath: "./sessions" })
});

client.on('qr', async (qr) => {
    qrcode.generate(qr, { small: true });

    try {
        await axios.post(`${process.env.API_URL || 'http://201.23.69.230:3000'}/qr`, { qr });
    } catch (error) {
        console.error('API indisponivel para enviar QR.');
    }
});

client.on('auth_failure', msg => {
    console.error('Falha na autenticacao:', msg);
});

client.on('message', async msg => {

    const roteado = rotear(msg, client, estado);
    if (roteado) return;

    if (msg.body === 'Lista' || msg.body === 'lista') {
        try {
            const resposta = await axios.get('http://201.23.69.230:3000/');
            await msg.reply(resposta.data);
        } catch (error) {
            console.error(error.message);
            await msg.reply('Erro ao obter a lista.');
        }
    }
});

client.initialize();
