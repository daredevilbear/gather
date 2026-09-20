FROM python:3.13-alpine
RUN pip install --no-cache-dir pywebpush==2.0.3
WORKDIR /app
COPY server.py sw.js vault_loader.py ./
USER 1001:1001
CMD ["python", "-B", "server.py"]
