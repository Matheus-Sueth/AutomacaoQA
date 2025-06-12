import json
import datetime
import asyncio
import requests
from fastapi import WebSocket, WebSocketDisconnect, APIRouter, HTTPException
from functions.websocket_utils import validar_rate_limit, adquirir_ws_slot, liberar_ws_slot
from core.redis import redis_client_async
from core.logging import setup_logger
from config import TOKEN, MESSAGE_URL
from auth import verificar_usuario_ws


def chamar_api_externa(message: str, name: str, phone: str, conversation_id: str = None) -> dict:
    url = f"https://{MESSAGE_URL}"
    body = {
    "text": message,
    "context": {
        "name": name,
        "phone": phone
    }
    }

    if conversation_id:
        body['conversationId'] = conversation_id

    payload = json.dumps(body)
    headers = {
    'x-api-key': TOKEN,
    'Content-Type': 'application/json'
    }

    response = requests.post(url, headers=headers, data=payload)
    if response.ok:
        return response.json()
    else:
        raise Exception(f'Falha na API({response.status_code})')


logger = setup_logger("websocket", "routes")
router = APIRouter()


@router.websocket("/ws/notificacao-manual/{arquivo_id}")
async def websocket_notificacao_manual(websocket: WebSocket, arquivo_id: str):
    try:
        usuario = verificar_usuario_ws(websocket)
    except HTTPException:
        await websocket.close(code=4001)
        return

    await validar_rate_limit(websocket)
    await adquirir_ws_slot()
    await websocket.accept()

    logger.warning(f"✅ WebSocket {arquivo_id} conectado.")

    try:
        dados_raw = await redis_client_async.get(f"wss:{arquivo_id}")
        if not dados_raw:
            await websocket.send_text(json.dumps({"status": "error", "mensagem_recebida": "Teste não encontrado"}))
            return

        dados = json.loads(dados_raw)
        nome = dados["nome"]
        telefone = dados["telefone"]

        logger.info(f"📤 Enviando mensagem inicial para {telefone}")
        data = chamar_api_externa("Teste", nome, telefone)
        conversation_id = data.get("conversationId")

        canal = f"canal:{conversation_id}"
        pubsub = redis_client_async.pubsub()
        await pubsub.subscribe(canal)

        # 2️⃣ Escuta mensagens iniciais
        async def escutar_mensagens_iniciais():
            async for mensagem in pubsub.listen():
                if mensagem["type"] != "message":
                    continue

                data = json.loads(mensagem["data"])
                mensagem_recebida = data.get("mensagem")
                timestamp = data.get("timestamp")

                logger.info(f"🤖 Mensagem recebida: {mensagem_recebida}")
                await websocket.send_text(json.dumps({
                    "arquivo": arquivo_id,
                    "status": "bot",
                    "timestamp": timestamp,
                    "mensagem_recebida": mensagem_recebida
                }))

                if websocket.client_state.name != "CONNECTED":
                    break

        # Inicia escuta em background
        asyncio.create_task(escutar_mensagens_iniciais())

        # 3️⃣ Loop de mensagens manuais
        while True:
            try:
                recebido = await asyncio.wait_for(websocket.receive_text(), timeout=30)
                payload = json.loads(recebido)
                texto_enviado = payload.get("mensagem")

                if not texto_enviado:
                    continue

                logger.info(f"📨 Usuário enviou: {texto_enviado}")
                chamar_api_externa(texto_enviado, nome, telefone, conversation_id=conversation_id)

            except asyncio.TimeoutError:
                logger.info(f"⏳ Nenhuma mensagem enviada pelo usuário após 30s.")
                continue

    except WebSocketDisconnect:
        logger.warning(f"🔴 WebSocket {arquivo_id} desconectado.")
    except Exception as e:
        logger.error(f"⚠️ Erro: {str(e)}")
        await websocket.send_text(json.dumps({
            "arquivo": arquivo_id,
            "status": "error",
            "mensagem_recebida": str(e)
        }))
    finally:
        await pubsub.unsubscribe(canal)
        await pubsub.close()
        liberar_ws_slot()
        await websocket.close()
