from fastapi import APIRouter, Request, UploadFile, File, Form, Depends, HTTPException
from fastapi.responses import HTMLResponse
import io
import openpyxl
import json
import datetime
import uuid
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

@router.get("/qa/manual", response_class=HTMLResponse, dependencies=[Depends(verificar_usuario)])
async def pagina_testes_manuais(request: Request):
    context = {
        "request": request
    }
    return TEMPLATES.TemplateResponse("whats_manual.html", context=context)

@router.get("/qa/historico", response_class=HTMLResponse)
async def pagina_historico_testes(request: Request, usuario = Depends(verificar_usuario)):
    dados_teste = redis_client.get(f"canal:{usuario.id}")
    if not dados_teste:
        return

    dados_teste = json.loads(dados_teste)
    passos = dados_teste["passos"]
    testes_jsons = redis_client.lrange("historico_testes", 0, -1)
    testes = [json.loads(t) for t in testes_jsons]

    return TEMPLATES.TemplateResponse("historico_testes.html", {
        "request": request,
        "testes": testes
    })

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
        #data = chamar_api_externa("Teste", nome, str(int(telefone)+index))
        arquivo_id = uuid.uuid4()
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
                "telefone": str(int(telefone)+index)
            })
        )

    return {
        "planilhas": planilhas,
        "message": "Testes iniciados!",
        "total_testes": len(planilhas.keys())
    }

@router.post("/qa/criar-testes-multiplos-manuais")
async def criar_multiplos_testes_manuais(nome: str = Form(...), telefone: str = Form(...), quantidade: int = Form(...)):
    """
    Gera múltiplas instâncias de teste manualmente com variação de telefone.
    """
    try:
        if quantidade <= 0 or quantidade > 10:
            raise ValueError
    except:
        raise HTTPException(status_code=400, detail="Quantidade inválida (1 a 10)")

    telefone_base = int(telefone)
    resultados = {}

    for i in range(quantidade):
        telefone_teste = str(telefone_base + i)

        arquivo_id = str(uuid.uuid4())[:8]

        redis_client.setex(
            f"wss:{arquivo_id}", 3600,
            json.dumps({
                "nome": nome,
                "telefone": telefone_teste,
            })
        )

        resultados[telefone_teste] = arquivo_id

    return {"message": "Testes criados com sucesso", "testes": resultados}

