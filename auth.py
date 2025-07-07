from fastapi import Request, HTTPException, WebSocket, status
from starlette.requests import HTTPConnection
import json
from core.redis import redis_client
from core.logging import setup_logger
from functions.genesys import get_user_by_token

logger = setup_logger("auth", "auth")


def verificar_usuario(request: Request):
    user_id = request.cookies.get("user_id")
    if not user_id:
        logger.warning("Cookie de sessao ausente")
        raise HTTPException(status_code=status.HTTP_307_TEMPORARY_REDIRECT, headers={"Location": "/login"})

    dados_usuario_string = redis_client.get(f"user:{user_id}")
    if not dados_usuario_string:
        logger.warning(f"Usuario {user_id} nao encontrado no Redis")
        raise HTTPException(status_code=status.HTTP_307_TEMPORARY_REDIRECT, headers={"Location": "/login"})

    try:
        dados_usuario = json.loads(dados_usuario_string)
        sessao = dados_usuario.get("session", {})
        access_token = sessao.get("access_token")
        token_type = sessao.get("token_type")
        region = sessao.get("region")

        if access_token and token_type and region:
            user = get_user_by_token(access_token, token_type, region)
            if user:
                return dados_usuario
    except Exception as e:
        logger.exception(f"Erro ao validar sessao do usuario {user_id}: {e}")

    raise HTTPException(status_code=status.HTTP_307_TEMPORARY_REDIRECT, headers={"Location": "/login"})


def verificar_usuario_ws(websocket: WebSocket):
    fake_request = HTTPConnection(scope=websocket.scope)
    return verificar_usuario(fake_request)
