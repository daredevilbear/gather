FROM python:3.13-alpine
ARG VERSION=1.0.2
ARG REVISION=unknown
ARG BUILDTIME
LABEL org.opencontainers.image.title="Gather system controller"
LABEL org.opencontainers.image.source="https://github.com/daredevilbear/gather"
LABEL org.opencontainers.image.documentation="https://gather.daredevilbear.dev/gather/system/"
LABEL org.opencontainers.image.licenses="GPL-3.0"
LABEL org.opencontainers.image.version=$VERSION
LABEL org.opencontainers.image.revision=$REVISION
LABEL org.opencontainers.image.created=$BUILDTIME
WORKDIR /controller
COPY controller.py database.py ./
COPY LICENSE NOTICE VERSION /usr/share/gather/
ENV GATHER_VERSION=$VERSION
USER 1001:1001
ENTRYPOINT ["python", "-B", "controller.py"]
