const fs = require('fs');
const path = require('path');

const EXEMPLOS_PATH = path.join(process.env.HOME || '.', 'Documentos', 'Cortes', '_exemplos.json');

function executar(msg, client, estado) {
  const partes = msg.body.trim().split(/\s+/);
  const subcomando = partes[1]; // 'bom', 'ruim' ou sem argumento
  const args = partes.slice(2);

  if (!subcomando || subcomando === 'stats') {
    try {
      const exemplos = JSON.parse(fs.readFileSync(EXEMPLOS_PATH, 'utf-8'));
      const total = exemplos.length;
      const shorts = exemplos.filter(e => e.tipo === 'short').length;
      const longs = exemplos.filter(e => e.tipo === 'long').length;
      const media = exemplos.reduce((s, e) => s + (e.viralScore || 0), 0) / total || 0;
      msg.reply(`📊 Estatisticas dos cortes:\n\n📱 Shorts: ${shorts}\n🎥 Longs: ${longs}\n📦 Total: ${total}\n⭐ ViralScore medio: ${media.toFixed(1)}/10`);
    } catch { msg.reply('Nenhum corte encontrado ainda.'); }
    return;
  }

  if (subcomando === 'limpar') {
    try { fs.writeFileSync(EXEMPLOS_PATH, '[]'); msg.reply('🗑️ Historico de exemplos limpo.'); } catch { msg.reply('Erro ao limpar.'); }
    return;
  }

  msg.reply('Comandos:\n/feedback stats - estatisticas\n/feedback limpar - limpa historico');
}

module.exports = { executar };
