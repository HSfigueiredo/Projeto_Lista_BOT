function formatarNumero(numero) {
    const digitos = numero.replace(/\D/g, '');
    if (digitos.length < 12 || digitos.length > 13) return null;
    return `${digitos}@c.us`;
}

module.exports = { formatarNumero };
