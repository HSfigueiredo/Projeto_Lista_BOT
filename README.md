# Projeto_Lista_BOT

Bot que conecta o **WhatsApp** ao ecossistema de automação. Permite enviar comandos pelo celular para cortar vídeos do YouTube e publicar no TikTok, consultar IA e muito mais.

## Arquitetura

```
 WhatsApp User
     ↕ (whatsapp-web.js)
 Projeto_Lista_BOT (PC local)
     ↕ HTTP
 Projeto_Lista_API (Fly.io — 24h)
 ProjetoCortes (Fly.io — 24h)
```

- O **BOT** roda localmente no PC (precisa de Chrome/Puppeteer)
- As **APIs** ficam 24h no Fly.io — jobs continuam processando mesmo com o PC desligado
- Quando o PC liga, o BOT reconecta automaticamente (sessão salva em `sessions/`)

## Comandos

### `/corte <url_youtube> [legenda opcional]`

Envia um vídeo do YouTube para cortar e publicar no TikTok automaticamente.

```
/corte https://www.youtube.com/watch?v=SEU_VIDEO
/corte https://www.youtube.com/watch?v=SEU_VIDEO Legenda personalizada #TikTok
```

**Fluxo:**
1. BOT envia URL para `ProjetoCortes` API
2. API cria job no Vizard AI para gerar clipes
3. BOT acompanha progresso a cada 30s
4. Quando pronto, notifica: ✅ "5 clipes publicados no TikTok!"

### `/ia <pergunta>`

Consulta a inteligência artificial DeepSeek.

```
/ia Qual a capital do Brasil?
/ia Explique teoria da relatividade
```

### `/help`

Lista todos os comandos disponíveis.

### `/atk <numero> <quantidade> <mensagem>`

Envio programado de mensagens (uso interno).

### `/stop`

Interrompe ação em andamento.

## Setup

```bash
# 1. Configurar ambiente
cp .env.example .env
# Edite .env com as URLs das APIs cloud

# 2. Instalar dependências
npm install

# 3. Iniciar
npm start
```

## .env

```env
# APIs cloud (Fly.io - 24h)
API_IA_URL=https://projeto-lista-api.fly.dev
API_URL=https://projeto-lista-api.fly.dev
PROJETO_CORTES_URL=https://projetocortes.fly.dev
TIKTOK_ACCOUNT_ID=dml6YXJkLTItMTg1MDkz
```

> Para obter o `TIKTOK_ACCOUNT_ID`: conecte sua conta TikTok no [Vizard](https://vizard.ai/settings/api) e chame `GET /social-accounts` na ProjetoCortes API.

## Sessão WhatsApp

A sessão fica salva em `sessions/` (via `LocalAuth`). Enquanto esse diretório existir, o BOT reconecta sem precisar escanear QR Code novamente.

## Deploy

O BOT **não** deve ser deployado no cloud porque usa Puppeteer/Chrome (whatsapp-web.js). Rode localmente ou num VPS com Chrome instalado.

## Tecnologias

- [whatsapp-web.js](https://github.com/pedroslopez/whatsapp-web.js)
- Puppeteer
- Node.js
- Axios
- dotenv
