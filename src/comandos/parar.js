function executar(msg, client, estado) {
    if (!estado.ativo || estado.usuario !== msg.from) {
        msg.reply('Nenhum ataque ativo para parar.');
        return;
    }

    estado.ativo = false;
    msg.reply(`Ataque interrompido. (${estado.enviadas}/${estado.total} mensagens enviadas)`);
}

module.exports = { executar };
