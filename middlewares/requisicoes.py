from starlette.middleware.base import BaseHTTPMiddleware
import time
import logging

logger = logging.getLogger("requisicoes")

class LogRequisicoesMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        inicio = time.time()
        response = await call_next(request)
        fim = time.time()
        logger.info(f"{request.method} {request.url.path} → {response.status_code} [{(fim - inicio)*1000:.2f}ms]")
        return response