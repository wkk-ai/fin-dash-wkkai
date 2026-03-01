#!/bin/bash

# Define o diretório atual como o diretório onde o script está localizado (raiz do projeto)
cd "$(dirname "$0")"

echo "========================================="
echo "   Iniciando o FinTrack Dashboard...     "
echo "========================================="

# Verifica se o NPM está instalado
if ! command -v npm &> /dev/null
then
    echo "❌ Erro: NPM não encontrado."
    echo "Por favor, instale o Node.js em: https://nodejs.org/"
    echo "Pressione qualquer tecla para sair..."
    read -n 1
    exit 1
fi

echo "📦 Verificando/Instalando dependências..."
npm install

echo "🚀 Iniciando o servidor local..."

# Aguarda 4 segundos e abre o navegador automaticamente em background
(sleep 4 && open "http://localhost:3000") &

# Roda o servidor de desenvolvimento
npm run dev
