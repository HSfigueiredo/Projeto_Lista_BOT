function executar(msg, client, estado) {
    const ajuda = `

🤖 *COMANDOS DISPONIVEIS*

*1. /corte URL [inicio-fim ...]*
   Baixa o video, transcreve e gera clipes nos timestamps definidos.
   Aceita: segundos (0-59), minutos (01:21-32:02), ou misto (0-01:30).
   Sem timestamps: baixa o video completo e salva em longs/ (YouTube).
   Com timestamps ate 3min: formato 9:16 (shorts/reels).
   Acima de 3min: formato 16:9 (video longo YouTube).
   Ex: /corte https://youtube.com/watch?v=ABC 0-59 01:21-32:02 300-400

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