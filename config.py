import json
from dotenv import load_dotenv
import os
from fastapi.templating import Jinja2Templates


load_dotenv()
EXTERNAL_WS_URL = os.environ.get("EXTERNAL_WS_URL")
TOKEN = os.environ.get("TOKEN")
MESSAGE_URL = os.environ.get("MESSAGE_URL")
SECRET_TOKEN = os.environ.get("WEBHOOK_SECRET")
ORGS: dict = json.loads(os.environ.get("ORGS"))
SEMAPHORE = int(os.environ.get("SEMAPHORE", "5"))
TEMPLATES = Jinja2Templates(directory="templates")
TRUSTED_ORGS:list = json.loads(os.environ.get("TRUSTED_ORGS"))