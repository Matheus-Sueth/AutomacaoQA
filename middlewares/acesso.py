from fastapi import Request, status
from fastapi.responses import RedirectResponse
from core.logging import setup_logger

logger = setup_logger("acesso", "acesso")

async def log_and_protect_routes(request: Request, call_next):
    try:
        response = await call_next(request)
        if response.status_code in [404, 405]:
            body = await request.body()
            logger.warning(f"Requisicao nao mapeada: {request.method} {request.url}")
            logger.warning(f"Headers: {dict(request.headers)}")
            logger.warning(f"Body: {body.decode() if body else None}")
            return RedirectResponse(url='/', status_code=status.HTTP_307_TEMPORARY_REDIRECT)
    except Exception as error:
        logger.warning(f"Erro: {error}")
        return RedirectResponse(url='/', status_code=status.HTTP_307_TEMPORARY_REDIRECT)
    return response