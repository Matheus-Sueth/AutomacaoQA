from fastapi import Form, Request, APIRouter, Depends, Response
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse
import json
from pydantic import BaseModel
from functions import genesys
from core.redis import redis_client
from config import ORGS, TEMPLATES
from core.logging import setup_logger


class TokenPayload(BaseModel):
    access_token: str
    expires_in: int
    token_type: str
    region: str


router = APIRouter()
logger = setup_logger("login", "routes")


@router.post("/receber-token")
async def receber_token(payload: TokenPayload):
    user = genesys.get_user_by_token(payload.access_token, payload.token_type, payload.region)
    redis_client.setex(
            f"user:{user["id"]}", int(payload.expires_in), 
            json.dumps({
                "session": payload.model_dump(),
                "user": user
            })
        )

    response = JSONResponse({"status": "ok", "message": "Token recebido com sucesso"})
    response.set_cookie(
        key="user_id",
        value=user["id"],
        max_age=int(payload.expires_in)
    )
    return response

@router.get("/login", response_class=HTMLResponse)
async def pagina_login(request: Request):
    context = {
        "request": request
    }
    return TEMPLATES.TemplateResponse("login.html", context=context)

@router.post("/login")
async def login(request: Request, codigo: str = Form(...), region: str = Form(...)):
    redirect_uri = str(request.base_url)

    authorize_url = (
        f"https://login.{region}/oauth/authorize"
        f"?client_id={ORGS[codigo]['CLIENT_ID']}"
        f"&response_type=token"
        f"&redirect_uri={redirect_uri[:-1]}"
        f"&scope={ORGS[codigo]['SCOPES']}"
        f"&state={region}"
    )
    return Response(status_code=302, headers={"Location": authorize_url})
