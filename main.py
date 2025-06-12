from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from middlewares.acesso import log_and_protect_routes
from middlewares.requisicoes import LogRequisicoesMiddleware
from middlewares.trailing_slash import RemoveTrailingSlashMiddleware
from routers import websocket, login, qa, index, deploy, websocket_assincrono

# Configuração do APP FastAPI
app = FastAPI(title="Automação de Testes")
app.mount("/static", StaticFiles(directory="static"), name="static")

# Middlewares
app.add_middleware(LogRequisicoesMiddleware)
app.add_middleware(RemoveTrailingSlashMiddleware)
app.middleware("http")(log_and_protect_routes)

# Rotas agrupadas
app.include_router(index.router, tags=["DEPLOY"])
app.include_router(deploy.router, tags=["DEPLOY"])
app.include_router(qa.router, tags=["QA"])
app.include_router(login.router, tags=["Login"])
app.include_router(websocket.router, tags=["Websocket"])
app.include_router(websocket_assincrono.router, tags=["Websocket"])
