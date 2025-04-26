FROM public.ecr.aws/docker/library/python:3.12 AS builder

WORKDIR /app
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
ENV PATH="/root/.cargo/bin:$PATH"
# https://pypi.org/project/python-pypi-mirror/
RUN pip install python-pypi-mirror
RUN pypi-mirror download -b -d downloads "dify_plugin>=0.1.0,<0.2.0" "boto3~=1.37.36" "tiktoken~=0.8.0" 
RUN pypi-mirror create -d downloads -m simple

FROM public.ecr.aws/docker/library/python:3.12-slim
WORKDIR /app
COPY --from=builder /app ./
EXPOSE 8100
CMD ["python3", "-m", "http.server", "8100"]
