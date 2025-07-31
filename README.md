# 🤖 Automação WhatsApp – Gerenciamento de Compras e Estoque

Este projeto consiste em uma automação via WhatsApp que se integra a uma API para facilitar o controle de estoque e a organização de listas de compras.
Ele permite que o usuário envie mensagens com comandos simples para interagir com o sistema, consultar listas e organizar o dia a dia diretamente pelo WhatsApp.

## ✨ Funcionalidades

- Reconhecimento de comandos como `lista`, `cadastrar` etc.
- Integração com API local para obter respostas dinâmicas
- Resposta automática no próprio chat do usuário

## 🚀 Como Funciona

1. O bot escuta mensagens recebidas no WhatsApp.
2. Ao detectar um comando como `lista`, ele realiza uma requisição à API.
3. A resposta da API é enviada automaticamente ao usuário no WhatsApp.

## 🔧 Tecnologias Utilizadas

- [whatsapp-web.js](https://github.com/pedroslopez/whatsapp-web.js)
- Node.js
- axios
- qrcode-terminal
