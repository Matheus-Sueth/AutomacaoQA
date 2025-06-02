from fastapi import APIRouter, Request, UploadFile, File, Form, Depends
from fastapi.responses import HTMLResponse
import io
import openpyxl
import json
from functions.api_externa import chamar_api_externa
from config import TEMPLATES
from core.redis import redis_client
from core.logging import setup_logger
from auth import verificar_usuario

router = APIRouter()
logger = setup_logger("qa", "routes")


@router.get("/qa", response_class=HTMLResponse, dependencies=[Depends(verificar_usuario)])
async def pagina_multi_testes(request: Request):
    context = {
        "request": request
    }
    return TEMPLATES.TemplateResponse("whats_multi.html", context=context)

@router.get("/qa/webhook", response_class=HTMLResponse, dependencies=[Depends(verificar_usuario)])
async def pagina_multi_testes_webhook(request: Request):
    context = {
        "request": request
    }
    return TEMPLATES.TemplateResponse("whats_webhook.html", context=context)

@router.post("/qa/enviar-multi-teste")
async def enviar_teste(
    file: UploadFile = File(...),
    nome: str = Form(...),
    telefone: str = Form(...)
):
    """Recebe um arquivo Excel, obtém um arquivo_id do APP externo de cada planilha de teste e armazena os passos no Redis."""

    # 📌 1️⃣ Lendo o conteúdo do arquivo como um buffer
    file_content = await file.read()
    file_stream = io.BytesIO(file_content)  # Convertendo para stream de bytes

    # 📌 2️⃣ Carregando o arquivo diretamente no `openpyxl`
    workbook = openpyxl.load_workbook(file_stream)
    planilhas = {}

    for index, sheet_name in enumerate(workbook.sheetnames):
        sheet = workbook[sheet_name]
        passos = []
        for row in sheet.iter_rows(min_row=2, values_only=True):  # Pulando cabeçalho
            id_passo, tipo, valor, validar = row
            if id_passo and tipo and valor:
                passos.append({
                    "id": id_passo,
                    "tipo": tipo.lower().strip(),  # "enviar" ou "receber" ou "esperar"
                    "valor": valor,
                    "validar": validar,
                    "status": "pendente"
                })

        # 🔹 1️⃣ Solicita o arquivo_id ao APP externo com a mensagem inicial
        data = chamar_api_externa("Teste", nome, str(int(telefone)+index))
        arquivo_id = data.get("conversationId")
        planilhas[sheet_name] = arquivo_id
        # 🔹 3️⃣ Salva os passos no Redis
        redis_client.setex(
            f"canal:{arquivo_id}", 3600, 
            json.dumps({
                "status": "pendente",
                "name": sheet_name,
                "arquivo": file.filename,
                "passos": passos,
                "nome": nome,
                "telefone": telefone
            })
        )

    return {
        "planilhas": planilhas,
        "message": "Testes iniciados!",
        "total_testes": len(planilhas.keys())
    }

