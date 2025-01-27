FROM public.ecr.aws/docker/library/busybox:stable
WORKDIR /app
COPY ./python-requirements.txt ./

CMD ["cp", "/app/python-requirements.txt", "/dependencies/python-requirements.txt"]
