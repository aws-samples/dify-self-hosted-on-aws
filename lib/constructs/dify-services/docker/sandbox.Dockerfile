ARG DIFY_VERSION=latest
FROM langgenius/dify-sandbox:${DIFY_VERSION}
COPY ./sandbox-python-requirements.txt /dependencies/python-requirements.txt
