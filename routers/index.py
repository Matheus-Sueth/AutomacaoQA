from fastapi import APIRouter, Request, Depends
from fastapi.responses import HTMLResponse, FileResponse
from config import TEMPLATES
from core.logging import setup_logger
from auth import verificar_usuario

router = APIRouter()
logger = setup_logger("index", "routes")


@router.get("/favicon.ico", include_in_schema=False)
async def favicon():
    return FileResponse("static/favicon.png")

@router.get("/", response_class=HTMLResponse)
async def pagina_index(request: Request):
    context = {
        "request": request
    }
    return TEMPLATES.TemplateResponse("index.html", context=context)

