#!/bin/bash
echo "🚀 Iniciando Deploy da Aplicação FastAPI..."

# Caminho da aplicação
APP_DIR="/home/kdash-automacaoqa/htdocs/www.automacaoqa.kdash.com.br"

# Ativar ambiente virtual (se houver)
source $APP_DIR/venv/bin/activate

# Acesse o diretório da aplicação
cd $APP_DIR || exit 1

# Baixar a versão mais recente do código
git reset --hard HEAD
git pull github master

# Instalar dependências
pip install -r requirements.txt

# Reiniciar a aplicação FastAPI
echo "🔄 Reiniciando FastAPI..."
systemctl restart fastapi

echo "✅ Deploy concluído!"