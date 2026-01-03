# 阿里云Docker一键部署方案

## 部署架构

```
阿里云ECS服务器
├── Nginx (反向代理 + SSL)
├── Docker Compose
│   ├── Node.js服务端容器
│   ├── MongoDB容器
│   ├── Redis容器
│   └── 静态资源容器
└── 自动化部署脚本
```

## 一键部署方案

### 方案一：GitHub Actions + 阿里云容器镜像服务
**推荐方案** - 代码推送自动部署

### 方案二：本地Docker构建 + 阿里云部署脚本
**简单方案** - 手动触发一键部署

### 方案三：阿里云CodePipeline
**企业方案** - 完整CI/CD流水线

## 详细实施步骤

### 第一步：阿里云资源准备

#### 1.1 购买ECS服务器
```bash
# 推荐配置
CPU: 2核心
内存: 4GB
带宽: 5Mbps
系统: Ubuntu 20.04 LTS
存储: 40GB SSD
```

#### 1.2 安全组配置
```bash
# 开放端口
22    (SSH)
80    (HTTP)
443   (HTTPS)
3001  (Node.js服务，可选择内网访问)
```

#### 1.3 域名和SSL证书
```bash
# 在阿里云控制台
1. 购买域名（如：ninghai-mj.com）
2. 申请免费SSL证书
3. 配置域名解析到ECS公网IP
```

### 第二步：服务器环境初始化

#### 2.1 服务器初始化脚本
```bash
#!/bin/bash
# init-server.sh

echo "=== 阿里云服务器初始化 ==="

# 更新系统
sudo apt update && sudo apt upgrade -y

# 安装Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER

# 安装Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/download/v2.20.0/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# 安装Nginx
sudo apt install nginx -y

# 创建项目目录
sudo mkdir -p /opt/ninghai-mj
sudo chown $USER:$USER /opt/ninghai-mj

# 安装其他工具
sudo apt install git vim htop -y

echo "=== 服务器初始化完成 ==="
```

### 第三步：Docker配置文件

#### 3.1 Dockerfile（服务端）
```dockerfile
# server/Dockerfile
FROM node:18-alpine

WORKDIR /app

# 复制package.json和package-lock.json
COPY package*.json ./

# 安装依赖
RUN npm ci --only=production

# 复制源代码
COPY . .

# 创建非root用户
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nodejs -u 1001

# 更改文件所有者
RUN chown -R nodejs:nodejs /app
USER nodejs

EXPOSE 3001

CMD ["node", "src/app.js"]
```

#### 3.2 Docker Compose配置
```yaml
# docker-compose.yml
version: '3.8'

services:
  # Node.js服务端
  api:
    build: 
      context: ./server
      dockerfile: Dockerfile
    container_name: ninghai-mj-api
    restart: unless-stopped
    environment:
      - NODE_ENV=production
      - PORT=3001
      - MONGODB_URI=mongodb://mongodb:27017/ninghai_mj
      - REDIS_URL=redis://redis:6379
      - JWT_SECRET=${JWT_SECRET}
      - WECHAT_APP_ID=${WECHAT_APP_ID}
      - WECHAT_APP_SECRET=${WECHAT_APP_SECRET}
    ports:
      - "3001:3001"
    depends_on:
      - mongodb
      - redis
    volumes:
      - ./logs:/app/logs
    networks:
      - ninghai-network

  # MongoDB数据库
  mongodb:
    image: mongo:6.0
    container_name: ninghai-mj-mongodb
    restart: unless-stopped
    environment:
      - MONGO_INITDB_ROOT_USERNAME=${MONGO_ROOT_USERNAME}
      - MONGO_INITDB_ROOT_PASSWORD=${MONGO_ROOT_PASSWORD}
      - MONGO_INITDB_DATABASE=ninghai_mj
    ports:
      - "27017:27017"
    volumes:
      - mongodb_data:/data/db
      - ./mongodb/init:/docker-entrypoint-initdb.d
    networks:
      - ninghai-network

  # Redis缓存
  redis:
    image: redis:7-alpine
    container_name: ninghai-mj-redis
    restart: unless-stopped
    command: redis-server --requirepass ${REDIS_PASSWORD}
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    networks:
      - ninghai-network

  # Nginx反向代理
  nginx:
    image: nginx:alpine
    container_name: ninghai-mj-nginx
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf
      - ./nginx/ssl:/etc/nginx/ssl
      - ./client/dist:/usr/share/nginx/html
      - ./logs/nginx:/var/log/nginx
    depends_on:
      - api
    networks:
      - ninghai-network

volumes:
  mongodb_data:
  redis_data:

networks:
  ninghai-network:
    driver: bridge
```

#### 3.3 环境变量配置
```bash
# .env.production
NODE_ENV=production
PORT=3001

# 数据库配置
MONGODB_URI=mongodb://mongodb:27017/ninghai_mj
MONGO_ROOT_USERNAME=admin
MONGO_ROOT_PASSWORD=your_strong_password_here

# Redis配置
REDIS_URL=redis://redis:6379
REDIS_PASSWORD=your_redis_password_here

# JWT配置
JWT_SECRET=your_jwt_secret_key_here
JWT_EXPIRES_IN=7d

# 微信配置
WECHAT_APP_ID=your_wechat_app_id
WECHAT_APP_SECRET=your_wechat_app_secret

# 其他配置
CLIENT_URL=https://your-domain.com
LOG_LEVEL=info
```

#### 3.4 Nginx配置
```nginx
# nginx/nginx.conf
events {
    worker_connections 1024;
}

http {
    include       /etc/nginx/mime.types;
    default_type  application/octet-stream;
    
    # 日志格式
    log_format main '$remote_addr - $remote_user [$time_local] "$request" '
                   '$status $body_bytes_sent "$http_referer" '
                   '"$http_user_agent" "$http_x_forwarded_for"';

    # Gzip压缩
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript;

    # 上游服务器
    upstream api_server {
        server api:3001;
    }

    # HTTP重定向到HTTPS
    server {
        listen 80;
        server_name your-domain.com www.your-domain.com;
        return 301 https://$server_name$request_uri;
    }

    # HTTPS服务器
    server {
        listen 443 ssl http2;
        server_name your-domain.com www.your-domain.com;

        # SSL证书配置
        ssl_certificate /etc/nginx/ssl/cert.pem;
        ssl_certificate_key /etc/nginx/ssl/key.pem;
        ssl_session_timeout 1d;
        ssl_session_cache shared:SSL:50m;
        ssl_stapling on;
        ssl_stapling_verify on;

        # 安全头
        add_header Strict-Transport-Security "max-age=31536000" always;
        add_header X-Frame-Options DENY;
        add_header X-Content-Type-Options nosniff;

        # 静态文件服务
        location / {
            root /usr/share/nginx/html;
            index index.html index.htm;
            try_files $uri $uri/ /index.html;
            
            # 缓存静态资源
            location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg)$ {
                expires 1y;
                add_header Cache-Control "public, immutable";
            }
        }

        # API代理
        location /api/ {
            proxy_pass http://api_server;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection 'upgrade';
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_cache_bypass $http_upgrade;
        }

        # Socket.io代理
        location /socket.io/ {
            proxy_pass http://api_server;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection "upgrade";
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }
    }
}
```

### 第四步：一键部署脚本

#### 4.1 本地部署脚本
```bash
#!/bin/bash
# deploy.sh - 一键部署脚本

set -e

echo "=== 宁海麻将一键部署脚本 ==="

# 配置变量
SERVER_HOST="your-server-ip"
SERVER_USER="ubuntu"
PROJECT_NAME="ninghai-mj"
REMOTE_PATH="/opt/ninghai-mj"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 检查必要文件
check_files() {
    print_status "检查部署文件..."
    
    if [ ! -f "docker-compose.yml" ]; then
        print_error "docker-compose.yml 文件不存在"
        exit 1
    fi
    
    if [ ! -f ".env.production" ]; then
        print_error ".env.production 文件不存在"
        exit 1
    fi
    
    print_status "文件检查完成"
}

# 构建客户端
build_client() {
    print_status "构建客户端..."
    
    if [ -d "client" ]; then
        cd client
        npm install
        npm run build
        cd ..
        print_status "客户端构建完成"
    else
        print_warning "客户端目录不存在，跳过构建"
    fi
}

# 上传文件到服务器
upload_files() {
    print_status "上传文件到服务器..."
    
    # 创建远程目录
    ssh ${SERVER_USER}@${SERVER_HOST} "sudo mkdir -p ${REMOTE_PATH} && sudo chown ${SERVER_USER}:${SERVER_USER} ${REMOTE_PATH}"
    
    # 上传项目文件
    rsync -avz --delete \
        --exclude 'node_modules' \
        --exclude '.git' \
        --exclude 'logs' \
        --exclude '*.log' \
        ./ ${SERVER_USER}@${SERVER_HOST}:${REMOTE_PATH}/
    
    print_status "文件上传完成"
}

# 部署到服务器
deploy_to_server() {
    print_status "在服务器上部署..."
    
    ssh ${SERVER_USER}@${SERVER_HOST} << EOF
        cd ${REMOTE_PATH}
        
        # 复制环境变量文件
        cp .env.production .env
        
        # 停止旧容器
        docker-compose down
        
        # 构建并启动新容器
        docker-compose up -d --build
        
        # 清理无用镜像
        docker image prune -f
        
        echo "部署完成！"
EOF
    
    print_status "服务器部署完成"
}

# 检查部署状态
check_deployment() {
    print_status "检查部署状态..."
    
    ssh ${SERVER_USER}@${SERVER_HOST} << EOF
        cd ${REMOTE_PATH}
        
        echo "=== 容器状态 ==="
        docker-compose ps
        
        echo "=== 服务健康检查 ==="
        sleep 5
        curl -f http://localhost:3001/health || echo "API服务检查失败"
        
        echo "=== 最近日志 ==="
        docker-compose logs --tail=20 api
EOF
}

# 主函数
main() {
    print_status "开始部署 ${PROJECT_NAME}..."
    
    check_files
    build_client
    upload_files
    deploy_to_server
    check_deployment
    
    print_status "🎉 部署完成！"
    print_status "访问地址: https://your-domain.com"
}

# 执行主函数
main "$@"
```

#### 4.2 GitHub Actions自动部署
```yaml
# .github/workflows/deploy.yml
name: Deploy to Aliyun

on:
  push:
    branches: [ main ]
  pull_request:
    branches: [ main ]

jobs:
  deploy:
    runs-on: ubuntu-latest
    
    steps:
    - uses: actions/checkout@v3
    
    - name: Setup Node.js
      uses: actions/setup-node@v3
      with:
        node-version: '18'
        cache: 'npm'
    
    - name: Install dependencies
      run: |
        cd server && npm ci
        cd ../client && npm ci
    
    - name: Run tests
      run: |
        cd server && npm test
    
    - name: Build client
      run: |
        cd client && npm run build
    
    - name: Build Docker image
      run: |
        docker build -t ninghai-mj-api ./server
    
    - name: Login to Aliyun Container Registry
      uses: aliyun/acr-login@v1
      with:
        login-server: registry.cn-hangzhou.aliyuncs.com
        username: ${{ secrets.ACR_USERNAME }}
        password: ${{ secrets.ACR_PASSWORD }}
    
    - name: Push to ACR
      run: |
        docker tag ninghai-mj-api registry.cn-hangzhou.aliyuncs.com/your-namespace/ninghai-mj-api:latest
        docker push registry.cn-hangzhou.aliyuncs.com/your-namespace/ninghai-mj-api:latest
    
    - name: Deploy to server
      uses: appleboy/ssh-action@v0.1.5
      with:
        host: ${{ secrets.SERVER_HOST }}
        username: ${{ secrets.SERVER_USER }}
        key: ${{ secrets.SERVER_SSH_KEY }}
        script: |
          cd /opt/ninghai-mj
          docker-compose pull
          docker-compose up -d
          docker image prune -f
```

### 第五步：监控和维护

#### 5.1 监控脚本
```bash
#!/bin/bash
# monitor.sh - 服务监控脚本

check_services() {
    echo "=== 服务状态检查 ==="
    docker-compose ps
    
    echo "=== 资源使用情况 ==="
    docker stats --no-stream
    
    echo "=== 磁盘使用情况 ==="
    df -h
    
    echo "=== 内存使用情况 ==="
    free -h
}

check_logs() {
    echo "=== 最近错误日志 ==="
    docker-compose logs --tail=50 api | grep -i error
}

# 设置定时任务
# crontab -e
# */5 * * * * /opt/ninghai-mj/monitor.sh >> /var/log/ninghai-mj-monitor.log 2>&1
```

#### 5.2 备份脚本
```bash
#!/bin/bash
# backup.sh - 数据备份脚本

BACKUP_DIR="/opt/backups/ninghai-mj"
DATE=$(date +%Y%m%d_%H%M%S)

# 创建备份目录
mkdir -p ${BACKUP_DIR}

# 备份MongoDB
docker exec ninghai-mj-mongodb mongodump --out /tmp/backup
docker cp ninghai-mj-mongodb:/tmp/backup ${BACKUP_DIR}/mongodb_${DATE}

# 备份Redis
docker exec ninghai-mj-redis redis-cli --rdb /tmp/dump.rdb
docker cp ninghai-mj-redis:/tmp/dump.rdb ${BACKUP_DIR}/redis_${DATE}.rdb

# 压缩备份文件
tar -czf ${BACKUP_DIR}/backup_${DATE}.tar.gz ${BACKUP_DIR}/*_${DATE}*

# 清理旧备份（保留7天）
find ${BACKUP_DIR} -name "backup_*.tar.gz" -mtime +7 -delete

echo "备份完成: ${BACKUP_DIR}/backup_${DATE}.tar.gz"
```

## 使用说明

### 1. 初始部署
```bash
# 1. 在本地克隆项目
git clone your-repo-url
cd ninghai-mj

# 2. 配置环境变量
cp .env.example .env.production
# 编辑 .env.production 填入真实配置

# 3. 配置部署脚本
# 编辑 deploy.sh 中的服务器信息

# 4. 执行一键部署
chmod +x deploy.sh
./deploy.sh
```

### 2. 日常更新
```bash
# 代码更新后重新部署
./deploy.sh

# 或者使用GitHub Actions自动部署
git push origin main
```

### 3. 服务管理
```bash
# SSH到服务器
ssh ubuntu@your-server-ip

# 查看服务状态
cd /opt/ninghai-mj
docker-compose ps

# 查看日志
docker-compose logs -f api

# 重启服务
docker-compose restart api

# 更新服务
docker-compose pull && docker-compose up -d
```

这套方案可以实现真正的一键部署，从代码推送到服务上线全自动化。您觉得这个部署方案如何？需要我详细解释某个部分吗？
