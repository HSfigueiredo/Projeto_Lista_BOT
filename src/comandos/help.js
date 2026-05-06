function executar(msg, client, estado) {
    const ajuda = `

*1. /ia SEU TEXTO*
   Consulta a inteligencia artificial.
   Ex: /ia porque é preciso imaginar sisifo feliz?

*2. /atk NUMERO QTD MENSAGEM*
   Envia varias mensagens para um numero.
   Ex: /atk 5511999999999 5 Ola

*3. /stop*
   Para um ataque em andamento.

*4. /help*
   Mostra esta lista de comandos.`;

    msg.reply(ajuda);
}

module.exports = { executar };