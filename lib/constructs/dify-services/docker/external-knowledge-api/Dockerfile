FROM public.ecr.aws/docker/library/python:3.12-slim

# app ディレクトリ作成、移動
WORKDIR /app

# プロジェクトディレクトリにコピー
COPY requirements.txt /app

# 必要モジュールのインストール
RUN pip install --upgrade pip
RUN pip install -r requirements.txt

COPY app.py /app
COPY knowledge_service.py /app
ENV UVICORN_PORT 8000

CMD ["python", "-m", "uvicorn", "app:app", "--host", "0.0.0.0"]
