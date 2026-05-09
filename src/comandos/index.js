const handlers = {
    '/atk': require('./ataque'),
    '/stop': require('./parar'),
    '/ia': require('./ia'),
    '/help': require('./help'),
    '/corte': require('./corte'),
};

function rotear(msg, client, estado) {
    const partes = msg.body.trim().split(/\s+/);
    const comando = partes[0].toLowerCase();
    const handler = handlers[comando];

    if (handler) {
        handler.executar(msg, client, estado);
        return true;
    }
    return false;
}

module.exports = { rotear };
