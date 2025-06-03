from fastapi import APIRouter, Request, UploadFile, File, Form, Depends
from fastapi.responses import HTMLResponse
import io
import openpyxl
import json
import datetime
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

@router.post("/webhook")
async def receber_webhook(payload: dict):
    """Recebe um Webhook e publica no canal correto do Redis"""
    arquivo_id = payload.get("conversationId")
    mensagem_recebida: str = payload["output"][0].get("text") if payload["output"][0].get("response_type") == "text" else payload["output"][0].get("title")
    mensagem_recebida = "\n".join(linha.strip() for linha in mensagem_recebida.strip().splitlines())
    timestamp = datetime.datetime.today().strftime("%Y/%m/%d-%H:%M:%S")

    # Buscar os passos do teste no Redis
    dados_teste = redis_client.get(f"canal:{arquivo_id}")

    if not dados_teste:
        return {"error": "Teste não encontrado"}  

    redis_client.setex(f"canal:{arquivo_id}", 3600, dados_teste)

    # Notificar frontend via WebSocket
    redis_client.publish(f"canal:{arquivo_id}", json.dumps({
        "arquivo": arquivo_id,
        "status": 'pendente',
        "timestamp": timestamp,
        "mensagem": mensagem_recebida
    }))

    return {"message": "Webhook processado com sucesso!", "resultado": 'pendente'}

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

