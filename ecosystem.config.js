module.exports = {
  apps: [{
    name: "lista-bot",
    script: "./src/index.js",
    watch: true,
    env: {
      NODE_ENV: "production",
    }
  }]
};

