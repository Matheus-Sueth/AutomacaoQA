from fastapi import WebSocket, HTTPException
from asyncio import Semaphore
from core.redis import redis_client

ws_semaforo = Semaphore(10)  # controle global de concorrência

async def validar_rate_limit(websocket: WebSocket, limite: int = 1000, janela: int = 3600):
    ip = websocket.client.host
    chave = f"ws:ratelimit:{ip}"
    valor = redis_client.get(chave)

    if valor and int(valor) >= limite:
        await websocket.close(code=4000)
        raise HTTPException(status_code=429, detail="Rate limit excedido")

    redis_client.pipeline().incr(chave).expire(chave, janela).execute()

async def adquirir_ws_slot():
    await ws_semaforo.acquire()

def liberar_ws_slot():
    ws_semaforo.release()
