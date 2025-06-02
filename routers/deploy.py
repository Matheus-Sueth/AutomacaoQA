from fastapi import APIRouter, BackgroundTasks
import subprocess
from core.logging import setup_logger


def run_deploy():
    subprocess.call(['/bin/bash', '/home/kdash-automacaoqa/htdocs/www.automacaoqa.kdash.com.br/deploy.sh'])


router = APIRouter()
logger = setup_logger("deploy", "routes")


@router.post("/deploy")
async def deploy(background_tasks: BackgroundTasks):
    # Rodar o deploy em background
    background_tasks.add_task(run_deploy)
    
    return {"message": "Deploy iniciado!"}