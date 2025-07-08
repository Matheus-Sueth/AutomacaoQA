import json
import datetime
import asyncio
import requests
from fastapi import WebSocket, WebSocketDisconnect, APIRouter, HTTPException
from functions.genesys import get_conversation_by_remote, disconnect_interaction
from functions.websocket_utils import validar_rate_limit, adquirir_ws_slot, liberar_ws_slot
from core.redis import redis_client_async
from core.logging import setup_logger
from config import TOKEN, MESSAGE_URL
from auth import verificar_usuario_ws
import datetime
from zoneinfo import ZoneInfo


async def get_conversation_by_remote_async(*args, **kwargs):
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, get_conversation_by_remote, *args, **kwargs)


def chamar_api_externa(message: str, name: str, phone: str, conversation_id_api: str = None) -> dict:
    url = f"https://{MESSAGE_URL}"
    body = {
    "text": message,
    "context": {
        "name": name,
        "phone": phone
    }
    }

    if conversation_id_api:
        body['conversationId'] = conversation_id_api

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
        dados_usuario = verificar_usuario_ws(websocket)
        sessao = dados_usuario.get("session", {})
        access_token = sessao.get("access_token")
        token_type = sessao.get("token_type")
        region = sessao.get("region")
    except HTTPException:
        await websocket.close(code=4001)
        return

    await validar_rate_limit(websocket)
    await adquirir_ws_slot()
    await websocket.accept()

    logger.warning(f"✅ WebSocket {arquivo_id} conectado.")
    conversation_id_genesys = None

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
        conversation_id_api = data.get("conversationId")

        canal = f"canal:{conversation_id_api}"
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
        contador = 0
        data_inicio = datetime.datetime.now(datetime.timezone.utc)
        data_fim = data_inicio + datetime.timedelta(hours=1)
        conversation_genesys = None
        
        await asyncio.sleep(6)

        try:
            conversation_genesys = await get_conversation_by_remote_async(
                access_token, token_type, region,
                data_inicio, data_fim,
                f"{nome} | {telefone}",
                "14f44df1-4c66-4f31-8983-4aeb3f47eed7"
            )
            conversation_id_genesys = conversation_genesys.get("conversationId")
            logger.info(f"✅ ConversationIdGenesys: {conversation_id_genesys} encontrado para o canal: {arquivo_id}")
            timestamp = datetime.datetime.now(ZoneInfo("America/Sao_Paulo")).strftime("%Y/%m/%d-%H:%M:%S")
            await websocket.send_text(json.dumps({
                "arquivo": arquivo_id,
                "status": "info",
                "timestamp": timestamp,
                "mensagem_recebida": f"✅ ConversationIdGenesys: {conversation_id_genesys}"
            }))
        except Exception as e:
            logger.info(f"❌ ConversationIdGenesys não encontrado para o canal: {arquivo_id}")
            timestamp = datetime.datetime.now(ZoneInfo("America/Sao_Paulo")).strftime("%Y/%m/%d-%H:%M:%S")
            await websocket.send_text(json.dumps({
                "arquivo": arquivo_id,
                "status": "info",
                "timestamp": timestamp,
                "mensagem_recebida": f"❌ ConversationIdGenesys não encontrado"
            }))

        try:
            if conversation_genesys:
                participants = conversation_genesys.get("participants", [])
                participant_customer = next(
                    (p for p in participants if p.get("purpose") == "customer"), None
                )

                if participant_customer:
                    conversation_cais = participant_customer.get("addressFrom")
                    logger.info(f"✅ ConversationIdCAIS: {conversation_cais} encontrado para o canal: {arquivo_id}")
                    timestamp = datetime.datetime.now(ZoneInfo("America/Sao_Paulo")).strftime("%Y/%m/%d-%H:%M:%S")
                    await websocket.send_text(json.dumps({
                        "arquivo": arquivo_id,
                        "status": "info",
                        "timestamp": timestamp,
                        "mensagem_recebida": f"✅ ConversationIdCAIS: {conversation_cais}"
                    }))
                else:
                    raise ValueError("Participante com purpose=customer não encontrado.")
            else:
                raise ValueError("conversation_genesys é None")
        except Exception as e:
            logger.info(f"❌ ConversationIdCAIS não encontrado para o canal: {arquivo_id}")
            timestamp = datetime.datetime.now(ZoneInfo("America/Sao_Paulo")).strftime("%Y/%m/%d-%H:%M:%S")
            await websocket.send_text(json.dumps({
                "arquivo": arquivo_id,
                "status": "info",
                "timestamp": timestamp,
                "mensagem_recebida": f"❌ ConversationIdCAIS não encontrado"
            }))

        # 3️⃣ Loop de mensagens manuais
        while contador < 10:
            try:
                recebido = await asyncio.wait_for(websocket.receive_text(), timeout=60)
                payload = json.loads(recebido)
                texto_enviado = payload.get("mensagem")

                if not texto_enviado:
                    contador+=1
                    if contador % 2 == 0:
                        logger.info(f"⏳ Nenhuma mensagem enviada pelo usuário após {contador}min no WebSocket {arquivo_id}.")
                    continue

                contador = 0
                logger.info(f"📨 Usuário enviou: {texto_enviado}")
                chamar_api_externa(texto_enviado, nome, telefone, conversation_id_api=conversation_id_api)

            except asyncio.TimeoutError:
                contador+=1
                if contador % 2 == 0:
                    logger.info(f"⏳ Nenhuma mensagem enviada pelo usuário após {contador}min no WebSocket {arquivo_id}.")
                continue
            
        timestamp = datetime.datetime.now(ZoneInfo("America/Sao_Paulo")).strftime("%Y/%m/%d-%H:%M:%S")
        await websocket.send_text(json.dumps({
                        "arquivo": arquivo_id,
                        "status": "end",
                        "timestamp": timestamp,
                        "mensagem_recebida": f"⏳ O bot/usuario não respondeu após 10 minutos de inatividade para {arquivo_id}."
                    }))
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
        if access_token and token_type and region and conversation_id_genesys:
            disconnect_interaction(access_token, token_type, region, conversation_id=conversation_id_genesys)
        await websocket.close()
