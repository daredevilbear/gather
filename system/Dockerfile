FROM python:3.13-alpine
WORKDIR /controller
COPY controller.py ./
USER 1001:1001
ENTRYPOINT ["python", "-B", "controller.py"]
