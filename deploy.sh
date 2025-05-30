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

LAST_TAG=$(git describe --tags --exact-match 2>/dev/null)

# Instalar dependências se houver uma nova tag
if [[ -n "$LAST_TAG" ]]; then
    echo "Commit é uma tag ($LAST_TAG). Rodando pip install..."
    pip install -r requirements.txt
fi

# Reiniciar a aplicação FastAPI
echo "🔄 Reiniciando FastAPI..."
systemctl restart fastapi2

echo "✅ Deploy concluído!"