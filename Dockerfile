# Stage 1: Build React frontend
FROM node:20-slim AS frontend
WORKDIR /build
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Stage 2: Flask backend + built static files
FROM python:3.12-slim
WORKDIR /opt/trad-session
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY app.py .
COPY --from=frontend /build/dist ./static/
RUN mkdir -p data
EXPOSE 18010
CMD ["python", "app.py"]
