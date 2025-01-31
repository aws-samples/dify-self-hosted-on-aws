FROM public.ecr.aws/docker/library/busybox:stable
WORKDIR /app
COPY ./python-requirements.txt ./

# set requirements.txt empty if flag is enabled
ARG DISABLE_PYTHON_DEPENDENCIES=false
RUN if [[ "$DISABLE_PYTHON_DEPENDENCIES" == "true" ]] ; then > ./python-requirements.txt ; fi

CMD ["cp", "/app/python-requirements.txt", "/dependencies/python-requirements.txt"]
