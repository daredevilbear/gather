FROM python:3.13-alpine
ARG VERSION=1.1.4
ARG REVISION=unknown
ARG BUILDTIME
LABEL org.opencontainers.image.title="Gather system controller"
LABEL org.opencontainers.image.source="https://github.com/daredevilbear/gather"
LABEL org.opencontainers.image.documentation="https://gather.daredevilbear.dev/gather/system/"
LABEL org.opencontainers.image.licenses="GPL-3.0"
LABEL org.opencontainers.image.version=$VERSION
LABEL org.opencontainers.image.revision=$REVISION
LABEL org.opencontainers.image.created=$BUILDTIME
# The controller uses the standard library and never installs packages at runtime.
RUN apk upgrade --no-cache \
    && python -m pip uninstall --yes pip \
    && rm -rf /usr/local/lib/python3.13/ensurepip
WORKDIR /controller
COPY controller.py database.py maintenance.py ./
COPY LICENSE NOTICE VERSION /usr/share/gather/
ENV GATHER_VERSION=$VERSION GATHER_REVISION=$REVISION
USER 1001:1001
ENTRYPOINT ["python", "-B", "controller.py"]
