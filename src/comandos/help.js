function executar(msg, client, estado) {
    const ajuda = `

🤖 *COMANDOS DISPONIVEIS*

*1. /corte URL*
   Baixa o video, transcreve com Whisper, analisa com DeepSeek e gera clipes.
   Ex: /corte https://youtube.com/watch?v=...

*2. /ia PERGUNTA*
   Consulta a inteligencia artificial (DeepSeek).
   Ex: /ia Qual a capital do Brasil?

*3. /feedback stats*
   Estatisticas dos cortes gerados (total, viralScore medio).
*   /feedback limpar*
   Limpa o historico de exemplos.

*4. /help*
   Mostra esta lista de comandos.

*5. /atk NUMERO QTD MSG*
   Envio de mensagens programado.

*6. /stop*
   Para uma acao em andamento.`;

    msg.reply(ajuda);
}

module.exports = { executar };