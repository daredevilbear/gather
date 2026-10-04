FROM python:3.13-alpine
ARG VERSION=1.0.3
ARG REVISION=unknown
ARG BUILDTIME
LABEL org.opencontainers.image.title="Gather notifications"
LABEL org.opencontainers.image.source="https://github.com/daredevilbear/gather"
LABEL org.opencontainers.image.documentation="https://gather.daredevilbear.dev/gather/notifications/"
LABEL org.opencontainers.image.licenses="GPL-3.0"
LABEL org.opencontainers.image.version=$VERSION
LABEL org.opencontainers.image.revision=$REVISION
LABEL org.opencontainers.image.created=$BUILDTIME
RUN pip install --no-cache-dir pywebpush==2.0.3
WORKDIR /app
COPY server.py sw.js vault_loader.py ./
COPY LICENSE NOTICE VERSION /usr/share/gather/
ENV GATHER_VERSION=$VERSION
USER 1001:1001
CMD ["python", "-B", "server.py"]
