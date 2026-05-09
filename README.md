# 🤖 Assistente Pessoal WhatsApp

Bot que conecta o WhatsApp a uma inteligência artificial (DeepSeek) para funcionar como assistente pessoal direto pelo celular. Receberá atualizações contínuas com novos comandos e funcionalidades para auxílio doméstico, pessoal e profissional.

## ✨ Funcionalidades

- **`/ia SUA PERGUNTA`** — Consulta a IA DeepSeek com respostas precisas e raciocínio
- **`/atk NUMERO QTD MSG`** — Envio programado de mensagens
- **`/stop`** — Interrompe ação em andamento
- **`/help`** — Lista todos os comandos disponíveis

## 🚀 Como funciona

1. Escaneie o QR Code com o WhatsApp
2. Envie comandos diretamente no chat do bot
3. O bot se comunica com a API local, que consulta a DeepSeek ou executa ações
4. A resposta volta automaticamente para você

## 🔧 Tecnologias

- [whatsapp-web.js](https://github.com/pedroslopez/whatsapp-web.js)
- Node.js
- Axios
- DeepSeek API

## ⚙️ Como usar

```bash
cp .env.example .env
# Edite .env se necessário
npm install
npm start
```

## 🧩 Próximas atualizações

O projeto está em evolução constante. Novos comandos serão adicionados para cobrir:

- Lembretes e alarmes
- Tradutor integrado
- Resumo de textos e links
- Integração com calendário e tarefas
- Automações residenciais
