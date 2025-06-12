from fastapi import APIRouter, WebSocket, WebSocketDisconnect, HTTPException
import uuid
import json
import datetime
import websockets
import asyncio
import requests
from functions.websocket_utils import validar_rate_limit, adquirir_ws_slot, liberar_ws_slot
from core.redis import redis_client
from core.logging import setup_logger
from config import EXTERNAL_WS_URL, TOKEN, MESSAGE_URL
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


@router.websocket("/ws/notificacoes/{arquivo_id}")
async def websocket_notificacoes(websocket: WebSocket, arquivo_id: str):
    """WebSocket escuta mensagens do Redis e processa os passos um por um, garantindo a ordem correta"""

    try:
        usuario = verificar_usuario_ws(websocket)
    except HTTPException:
        await websocket.close(code=4001)
        return

    await validar_rate_limit(websocket)
    await adquirir_ws_slot()
    
    logger.warning(f"✅ WebSocket {arquivo_id} conectado.")

    try:
        await websocket.accept()
    
        pubsub = redis_client.pubsub()
        canal = f"canal:{arquivo_id}"
        pubsub.subscribe(canal)

        # 🔹 Buscamos os passos no Redis
        dados_teste = redis_client.get(f"canal:{arquivo_id}")
        if not dados_teste:
            return

        dados_teste = json.loads(dados_teste)
        passos = dados_teste["passos"]
        data = chamar_api_externa("Teste", dados_teste["nome"], dados_teste["telefone"])
        conversation_id = data.get("conversationId")

        for passo in passos:  # 🔹 Agora processamos os passos um por um
            if passo["tipo"] == "enviar" and passo["status"] == "pendente":
                logger.info(f"📤 Enviando mensagem para API externa: {passo['valor']}")
                chamar_api_externa(passo["valor"], dados_teste["nome"], dados_teste["telefone"], conversation_id)
                passo["status"] = "enviado"

                # 🔹 Atualiza o Redis com o novo status do passo
                redis_client.setex(f"canal:{arquivo_id}", 3600, json.dumps(dados_teste))

                # 🔹 Envia diretamente ao WebSocket (além de publicar no Redis)
                mensagem_ws = {
                    "arquivo": arquivo_id,
                    "status": "enviado",
                    "timestamp": datetime.datetime.today().strftime("%Y/%m/%d-%H:%M:%S"),
                    "mensagem_recebida": str(passo["valor"])
                }
                await websocket.send_text(json.dumps(mensagem_ws))
            elif passo["tipo"] == "receber" and passo["status"] == "pendente":
                while True:  # 🔹 Aguarda a resposta correta antes de avançar
                    mensagem = pubsub.get_message(ignore_subscribe_messages=True, timeout=5)
                    if not mensagem:
                        continue

                    data = json.loads(mensagem["data"])
                    mensagem_recebida = data['mensagem']
                    mensagem_esperada:str = passo["valor"]
                    mensagem_esperada = "\n".join(linha.strip() for linha in mensagem_esperada.strip().splitlines())
                    
                    if passo["validar"] == "exato" and mensagem_recebida == mensagem_esperada:
                        resultado = "success"
                    elif passo["validar"] == "contém" and mensagem_esperada in mensagem_recebida:
                        resultado = "success"
                    else:
                        resultado = "error"

                    # 🔹 Atualiza o status do passo no Redis
                    passo["status"] = resultado
                    redis_client.setex(f"canal:{arquivo_id}", 3600, json.dumps(dados_teste))

                    # 🔹 Envia diretamente ao WebSocket (além de publicar no Redis)
                    mensagem_ws = {
                        "arquivo": arquivo_id,
                        "status": resultado,
                        "timestamp": datetime.datetime.today().strftime("%Y/%m/%d-%H:%M:%S"),
                        "mensagem_recebida": mensagem_recebida,
                        "mensagem_esperada": mensagem_esperada
                    }
                    await websocket.send_text(json.dumps(mensagem_ws))

                    break  # 🔹 Só avança para o próximo passo quando esse estiver resolvido  
            elif passo["tipo"] == "esperar" and passo["status"] == "pendente":
                logger.info(f"💤 Robô dormindo: {passo['valor']} segundos")
                await asyncio.sleep(int(passo["valor"]))

                # 🔹 Atualiza o status do passo no Redis
                passo["status"] = resultado
                redis_client.setex(f"canal:{arquivo_id}", 3600, json.dumps(dados_teste))
                
        mensagem_ws = {
            "arquivo": arquivo_id,
            "status": "end",
            "timestamp": datetime.datetime.today().strftime("%Y/%m/%d-%H:%M:%S")
        }
        await websocket.send_text(json.dumps(mensagem_ws))
    except WebSocketDisconnect:
        logger.warning(f"🔴 WebSocket {arquivo_id} desconectado. Limpando conexões...")

        # 🔹 Remove assinaturas do Redis
        pubsub.unsubscribe(canal)

        # 🔹 Fecha conexões pendentes
        redis_client.delete(f"canal:{arquivo_id}")

        # 🔹 Log de finalização
        logger.warning(f"✅ Conexões para {arquivo_id} foram encerradas.")
    except Exception as e:
        logger.error(f"⚠️ Erro no WebSocket: {str(e)}")
        # 🔹 Remove assinaturas do Redis
        pubsub.unsubscribe(canal)
    finally:
        liberar_ws_slot()
        await websocket.close()


@router.websocket("/ws/notificacao/{arquivo_id}")
async def websocket_notificacao(websocket: WebSocket, arquivo_id: str):
    """WebSocket que processa o arquivo Excel e realiza os testes automaticamente."""
    try:
        usuario = verificar_usuario_ws(websocket)
    except HTTPException:
        await websocket.close(code=4001)
        return

    await validar_rate_limit(websocket)
    await adquirir_ws_slot()

    logger.warning(f"✅ WebSocket {arquivo_id} conectado.")

    try:
        await websocket.accept()

        logger.info("✅ Cliente conectado ao WebSocket de Testes")
        CONVERSATION_ID = str(uuid.uuid1())
        external_ws_url = f"wss://{EXTERNAL_WS_URL}?conversationId={CONVERSATION_ID}&token={TOKEN}"

        pubsub = redis_client.pubsub()
        canal = f"canal:{arquivo_id}"
        pubsub.subscribe(canal)

        # 🔹 Buscamos os passos no Redis
        dados_teste = redis_client.get(f"canal:{arquivo_id}")
        if not dados_teste:
            return

        dados_cliente = json.loads(dados_teste)
        passos = dados_cliente.get("passos")
        nome = dados_cliente.get("nome")
        telefone = dados_cliente.get("telefone")

        async with websockets.connect(external_ws_url) as external_ws:
            mensagem_envio = {
                        "action": "userToKloe",
                        "conversationId": CONVERSATION_ID,
                        "data": {
                            "message": "Teste",
                            "type": "text",
                            "user": {
                                "name": nome,
                                "phone": telefone,
                                "id": CONVERSATION_ID,
                                "ra": CONVERSATION_ID
                            },
                            "bot": "Kloe",
                            "system": False,
                            "token": TOKEN
                        }
                    }
            await external_ws.send(json.dumps(mensagem_envio))
            logger.info(f"📤 Mensagem enviada: Teste")
            for passo in passos:
                if passo["tipo"] == "enviar":
                    mensagem_recebida = str(passo['valor'])
                    mensagem_envio = {
                        "action": "userToKloe",
                        "conversationId": CONVERSATION_ID,
                        "data": {
                            "message": mensagem_recebida,
                            "type": "text",
                            "user": {
                                "name": nome,
                                "phone": telefone,
                                "id": CONVERSATION_ID,
                                "ra": CONVERSATION_ID
                            },
                            "bot": "Kloe",
                            "system": False,
                            "token": TOKEN
                        }
                    }
                    await external_ws.send(json.dumps(mensagem_envio))
                    logger.info(f"📤 Mensagem enviada: {mensagem_recebida}")
                    mensagem_ws = {
                        "arquivo": arquivo_id,
                        "status": "processando",
                        "tipo": "usuario",
                        "timestamp": datetime.datetime.today().strftime("%Y/%m/%d-%H:%M:%S"),
                        "mensagem": mensagem_recebida
                    }
                    await websocket.send_text(json.dumps(mensagem_ws))
                elif passo["tipo"] == "receber":
                    try:
                        while True:
                            resposta = await external_ws.recv()
                            resposta_json = json.loads(resposta)
                            if resposta_json['action'] == 'kloeToUser':
                                break
                        mensagem_recebida:str = resposta_json["data"]["messages"][0]["text"]
                        mensagem_esperada:str = str(passo["valor"])
                        mensagem_recebida = "\n".join(linha.strip() for linha in mensagem_recebida.strip().splitlines())
                        mensagem_esperada = "\n".join(linha.strip() for linha in mensagem_esperada.strip().splitlines())
                        if passo["validar"] == "exato" and mensagem_recebida == mensagem_esperada:
                            resultado = "success"
                        elif passo["validar"] == "contém" and mensagem_esperada in mensagem_recebida:
                            resultado = "success"
                        else:
                            resultado = "error"
                            logger.warning(f"📩 Mensagem recebida: |{mensagem_recebida}|\nMensagem esperada: |{mensagem_esperada}|")

                        mensagem_ws = {
                            "arquivo": arquivo_id,
                            "status": resultado,
                            "tipo": "bot",
                            "timestamp": datetime.datetime.today().strftime("%Y/%m/%d-%H:%M:%S"),
                            "mensagem": mensagem_recebida
                        }
                        await websocket.send_text(json.dumps(mensagem_ws))
                        logger.info(f"📩 Mensagem recebida: {True} | Resultado: {resultado}")

                    except asyncio.TimeoutError:
                        mensagem_ws = {
                            "arquivo": arquivo_id,
                            "status": "error",
                            "tipo": "bot",
                            "timestamp": datetime.datetime.today().strftime("%Y/%m/%d-%H:%M:%S"),
                            "mensagem": "Timeout na espera da resposta."
                        }
                        await websocket.send_text(json.dumps(mensagem_ws))
                        logger.error("❌ Timeout na espera da resposta.")
                elif passo["tipo"] == "esperar":
                    tempo_em_espera = int(passo["valor"])
                    await asyncio.sleep(tempo_em_espera)
                    logger.info(f"⏳ Esperou {tempo_em_espera} segundos")
                    mensagem_ws = {
                        "arquivo": arquivo_id,
                        "status": "await",
                        "tipo": "usuario",
                        "mensagem": f"Esperou {tempo_em_espera} segundos",
                        "timestamp": datetime.datetime.today().strftime("%Y/%m/%d-%H:%M:%S")
                    }
                    await websocket.send_text(json.dumps(mensagem_ws))

            logger.info("✅ Teste finalizado!")
            mensagem_ws = {
            "arquivo": arquivo_id,
            "status": "end",
            "timestamp": datetime.datetime.today().strftime("%Y/%m/%d-%H:%M:%S")
            }
            await websocket.send_text(json.dumps(mensagem_ws))
    except WebSocketDisconnect:
        logger.error(f"🔴 WebSocket {arquivo_id} desconectado. Limpando conexões...")

        # 🔹 Remove assinaturas do Redis
        pubsub.unsubscribe(canal)

        # 🔹 Fecha conexões pendentes
        redis_client.delete(f"canal:{arquivo_id}")

        # 🔹 Log de finalização
        logger.error(f"✅ Conexões para {arquivo_id} foram encerradas.")
    except Exception as e:
        logger.error(f"⚠️ Erro no WebSocket: {str(e)}")
    finally:
        liberar_ws_slot()
        await websocket.close()

