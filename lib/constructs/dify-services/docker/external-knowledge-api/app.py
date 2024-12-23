# Dify 公式ドキュメントのサンプルを FastAPI ベースに書き換え
from fastapi import FastAPI, Header, HTTPException, Depends
from pydantic import BaseModel
from knowledge_service import ExternalDatasetService
from typing import Optional
import os
import logging

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    handlers=[logging.StreamHandler()],
)

logger = logging.getLogger(__name__)


valid_token = os.environ.get("BEARER_TOKEN")
app = FastAPI()


class RetrievalRequest(BaseModel):
    query: str
    retrieval_setting: dict
    knowledge_id: str


async def validate_token(authorization: Optional[str] = Header(None)):
    if authorization is None:
        logger.error("Authorization header is missing")
        raise HTTPException(status_code=401, detail="Authorization header is missing")

    parts = authorization.split()
    if len(parts) != 2 or parts[0].lower() != "bearer":
        logger.error("Invalid authorization header format: not bearer")
        raise HTTPException(
            status_code=401, detail="Invalid authorization header format"
        )

    token = parts[1]
    if not token:
        logger.error("Invalid token: empty")
        raise HTTPException(status_code=401, detail="Invalid token")
    if token != valid_token:
        logger.error("Invalid token: not match")
        raise HTTPException(status_code=401, detail="Invalid token")

    return token


@app.post("/retrieval")
async def retrieve(req: RetrievalRequest, token: str = Depends(validate_token)):
    logger.info(f"Received request: {req}")
    result = ExternalDatasetService.knowledge_retrieval(
        req.retrieval_setting, req.query, req.knowledge_id
    )
    logger.info(f"Returning result: {result}")
    return result
