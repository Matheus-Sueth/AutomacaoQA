import logging
from logging.handlers import RotatingFileHandler
import os

# Criar pasta de logs se não existir
os.makedirs("logs", exist_ok=True)


def setup_logger(name: str, filename: str):
    logger = logging.getLogger(name)
    logger.setLevel(logging.INFO)

    handler = RotatingFileHandler(
        f"logs/{filename}.log",
        maxBytes=2_000_000,  # 2MB
        backupCount=5
    )
    formatter = logging.Formatter("[%(asctime)s] %(levelname)s [%(name)s] %(message)s")
    handler.setFormatter(formatter)
    logger.addHandler(handler)

    # Evita logs duplicados
    logger.propagate = False
    return logger
