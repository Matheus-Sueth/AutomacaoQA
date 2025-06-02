from fastapi import FastAPI, Request
from middlewares.acesso import log_and_protect_routes
from routers import qa
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.responses import HTMLResponse, FileResponse
from fastapi.openapi.docs import get_swagger_ui_html
from core.redis import redis_client

app = FastAPI()

# Serviços de arquivos estáticos e templates
app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")

# Middlewares
app.middleware("http")(log_and_protect_routes)

# Rotas agrupadas
app.include_router(qa.router)


@app.get("/favicon.ico", include_in_schema=False)
async def favicon():
    return FileResponse("static/favicon.png")

# Rota principal
@app.get("/", response_class=HTMLResponse)
async def index(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})

@app.get("/login", response_class=HTMLResponse)
async def pagina_login(request: Request):
    context = {
        "request": request
    }
    return templates.TemplateResponse("login.html", context=context)
